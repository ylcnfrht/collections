<script setup lang="ts">
import { ref, computed } from 'vue';
import results from '../../../../bench/isolated/results.json';
import { workloads } from '../../../../bench/isolated/workloads';
import type { Result } from './bench.worker';

// Runs the isolated benchmark's workloads in the reader's browser, each implementation in a fresh worker,
// and shows how this library compares with the native baseline, next to what the isolated Docker run measured.
type W = (typeof workloads)[number];
const OURS = '@ylcnfrht/collections ';

const runs = ref<Record<string, Record<string, Result>>>({});
const job = ref<{ workload: string; done: number; total: number } | null>(null);
const progress = ref(0); // of the implementation that is running
const error = ref('');

const groups = [...new Set(workloads.map((w) => w.group))].map((g) => ({ name: g, items: workloads.filter((w) => w.group === g) }));
const ours = (w: W) => Object.keys(w.impls).filter((i) => i.startsWith(OURS));
// only our implementations and the native baseline run; other native variants stay in the Docker report
const toRun = (w: W) => [...ours(w), w.baseline];
const total = workloads.reduce((n, w) => n + toRun(w).length, 0);
const perSec = (r: Result) => r.ops / (r.ms / 1000);

const isolated = (w: W, impl: string) => results.report.find((x) => x.id === w.id)?.rows.find((r) => r.impl === impl)?.vsBaseline ?? null;
const mine = (w: W, impl: string) => {
  const r = runs.value[w.id];
  return r?.[impl] && r[w.baseline] ? perSec(r[impl]) / perSec(r[w.baseline]) : null;
};

function runOne(w: string, impl: string): Promise<Result> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./bench.worker.ts', import.meta.url), { type: 'module' });
    progress.value = 0;
    worker.onmessage = (e: MessageEvent<Result & { error?: string; progress?: number }>) => {
      if (e.data.progress !== undefined) {
        progress.value = e.data.progress;
        return;
      }
      worker.terminate();
      if (e.data.error) reject(new Error(`${impl}: ${e.data.error}`));
      else resolve(e.data);
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(`${impl}: ${e.message || 'worker failed'}`));
    };
    worker.postMessage({ workload: w, impl });
  });
}

async function run(todo: W[]) {
  error.value = '';
  const count = todo.reduce((n, w) => n + toRun(w).length, 0);
  let done = 0;
  try {
    for (const w of todo) {
      runs.value = { ...runs.value, [w.id]: {} };
      for (const impl of toRun(w)) {
        job.value = { workload: w.id, done, total: count };
        const r = await runOne(w.id, impl);
        runs.value = { ...runs.value, [w.id]: { ...runs.value[w.id], [impl]: r } };
        done++;
      }
      if (new Set(Object.values(runs.value[w.id]).map((r) => r.check)).size > 1) {
        throw new Error(`${w.title}: the implementations returned different results, so the timings are not comparable.`);
      }
    }
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    job.value = null;
  }
}

const busy = computed(() => job.value !== null);
const overall = computed(() => (job.value ? (job.value.done + progress.value) / job.value.total : 0));
const measuredCount = computed(() => workloads.filter((w) => mine(w, ours(w)[0]) !== null).length);
const wins = computed(() => workloads.filter((w) => (mine(w, ours(w)[0]) ?? 0) >= 1).length);

const times = (x: number) => `${x >= 10 ? x.toFixed(0) : x.toFixed(1)}×`;
// within 2% is noise, not a result
const verdict = (x: number) => (Math.abs(x - 1) < 0.02 ? 'about the same' : x >= 1 ? `${times(x)} faster` : `${times(1 / x)} slower`);
/** bar half-width in %, log scale: 1× is 0, 10× and beyond fill the half */
const bar = (x: number) => Math.min(1, Math.abs(Math.log10(x))) * 50;
function rate(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B/s`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M/s`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K/s`;
  return `${Math.round(n)}/s`;
}
const label = (impl: string) => impl.slice(OURS.length);
</script>

<template>
  <div class="tb not-content">
    <div class="head">
      <p class="status" aria-live="polite">
        <template v-if="job">
          <span class="dot" />Running {{ workloads.find((w) => w.id === job!.workload)!.title }} · {{ job.done + 1 }} of {{ job.total }}
        </template>
        <template v-else-if="measuredCount > 0">
          Faster than native in <strong>{{ wins }} of {{ measuredCount }}</strong> tests on your device.
        </template>
        <template v-else>Each test runs this library and the native equivalent in separate workers, about 1.5 s each.</template>
      </p>
      <button class="run-all" :disabled="busy" @click="run(workloads)">
        {{ measuredCount ? 'Run all again' : `Run all ${workloads.length} tests` }}
        <span class="time">~{{ Math.round(total * 1.5) }} s</span>
      </button>
    </div>
    <div class="progress" :class="{ on: busy }"><span :style="{ width: `${overall * 100}%` }" /></div>
    <p v-if="error" class="error">{{ error }}</p>

    <section v-for="g in groups" :key="g.name" class="group">
      <h3>{{ g.name }}</h3>
      <div class="rows">
        <template v-for="w in g.items" :key="w.id">
          <div v-for="(impl, k) in ours(w)" :key="impl" class="row" :class="{ running: job?.workload === w.id }">
            <div class="what">
              <span class="title">{{ w.title }}<span v-if="ours(w).length > 1" class="variant"> · {{ label(impl) }}</span></span>
              <span class="sub">{{ k === 0 ? w.detail : '' }}<template v-if="k === 0"> · vs {{ w.baseline }}</template></span>
            </div>

            <div class="meter" :title="mine(w, impl) !== null ? 'your device' : 'isolated run'">
              <template v-for="x in [mine(w, impl) ?? isolated(w, impl)]" :key="String(x)">
                <div class="track" :class="{ ghost: mine(w, impl) === null }">
                  <span class="mid" />
                  <span
                    v-if="x !== null"
                    class="fill"
                    :class="x >= 1 ? 'fast' : 'slow'"
                    :style="x >= 1 ? { left: '50%', width: `${bar(x)}%` } : { right: '50%', width: `${bar(x)}%` }"
                  />
                </div>
                <span v-if="x !== null" class="ratio" :class="[x >= 1 ? 'fast' : 'slow', { ghost: mine(w, impl) === null }]">{{ verdict(x) }}</span>
              </template>
            </div>

            <div class="nums">
              <template v-if="runs[w.id]?.[impl] && runs[w.id]?.[w.baseline]">
                <span>{{ rate(perSec(runs[w.id][impl])) }}</span>
                <span class="vs">native {{ rate(perSec(runs[w.id][w.baseline])) }}</span>
              </template>
              <span v-else-if="isolated(w, impl) !== null" class="vs">isolated run</span>
            </div>

            <button v-if="k === 0" class="run-one" :disabled="busy" :aria-label="`Run ${w.title}`" @click="run([w])">Run</button>
            <span v-else />
          </div>
        </template>
      </div>
    </section>
    <p class="foot">
      Rates are {{ '' }}operations per second, higher is better. Faded bars are the isolated Docker run's ratios until you run a test.
    </p>
  </div>
</template>

<style scoped>
.tb {
  margin-top: 1.5rem;
  border: 1px solid var(--rp-hairline);
  border-radius: var(--rp-radius);
  background: var(--rp-surface);
  overflow: hidden;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.25rem;
}
.status {
  margin: 0;
  font-size: 0.875rem;
  color: var(--rp-text-muted);
}
.status strong {
  color: var(--sl-color-white);
  font-weight: 600;
}
.dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 0.5rem;
  border-radius: 50%;
  background: var(--rp-accent);
  box-shadow: 0 0 8px var(--rp-accent);
  animation: pulse 1s infinite alternate;
}
@keyframes pulse {
  to {
    opacity: 0.35;
  }
}
button {
  font: inherit;
  cursor: pointer;
  border-radius: 9px;
  transition: background 0.15s, border-color 0.15s, opacity 0.15s;
}
button:disabled {
  cursor: default;
  opacity: 0.45;
}
.run-all {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  height: 2.3rem;
  padding: 0 0.95rem;
  border: none;
  background: var(--sl-color-white);
  color: var(--rp-bg);
  font-size: 0.85rem;
  font-weight: 600;
}
.run-all .time {
  font-family: var(--rp-mono);
  font-size: 0.7rem;
  font-weight: 500;
  opacity: 0.6;
}
.progress {
  height: 2px;
  background: var(--rp-hairline);
}
.progress span {
  display: block;
  height: 100%;
  width: 0;
  background: var(--rp-accent);
  transition: width 0.12s linear;
}
.progress:not(.on) span {
  opacity: 0;
}
.error {
  margin: 0;
  padding: 0.75rem 1.25rem;
  font-size: 0.85rem;
  color: var(--rp-red);
  border-bottom: 1px solid var(--rp-hairline);
}

.group h3 {
  margin: 0;
  padding: 1.1rem 1.25rem 0.5rem;
  font-family: var(--rp-mono);
  font-size: 0.66rem;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--rp-text-faint);
}
.row {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 1.3fr) 8.5rem 3.6rem;
  align-items: center;
  gap: 1rem;
  padding: 0.7rem 1.25rem;
  border-top: 1px solid var(--rp-hairline);
  transition: background 0.15s;
}
.row.running {
  background: color-mix(in oklab, var(--rp-accent) 6%, transparent);
}
.what {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.title {
  font-size: 0.875rem;
  font-weight: 550;
  color: var(--sl-color-white);
}
.variant {
  font-weight: 400;
  color: var(--rp-text-muted);
}
.sub {
  font-size: 0.75rem;
  color: var(--rp-text-faint);
}
.meter {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.track {
  position: relative;
  flex: 1;
  height: 6px;
  border-radius: 999px;
  background: var(--rp-surface-2);
}
.track.ghost {
  opacity: 0.45;
}
.mid {
  position: absolute;
  left: 50%;
  top: -4px;
  bottom: -4px;
  width: 1px;
  background: var(--rp-hairline-strong);
}
.fill {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: 999px;
  transition: width 0.3s;
}
.fill.fast {
  background: var(--rp-accent);
}
.fill.slow {
  background: var(--rp-amber);
}
.ratio {
  flex: none;
  width: 6.2rem;
  font-family: var(--rp-mono);
  font-size: 0.78rem;
  text-align: right;
}
.ratio.fast {
  color: var(--sl-color-white);
}
.ratio.slow {
  color: var(--rp-amber);
}
.ratio.ghost {
  opacity: 0.55;
}
.nums {
  display: flex;
  flex-direction: column;
  font-family: var(--rp-mono);
  font-size: 0.75rem;
  color: var(--sl-color-white);
  text-align: right;
}
.nums .vs {
  color: var(--rp-text-faint);
  font-size: 0.7rem;
}
.run-one {
  height: 1.9rem;
  border: 1px solid var(--rp-hairline-strong);
  background: transparent;
  color: var(--rp-text-muted);
  font-size: 0.78rem;
}
.run-one:not(:disabled):hover {
  border-color: var(--rp-accent);
  color: var(--sl-color-white);
}
.foot {
  margin: 0;
  padding: 0.9rem 1.25rem;
  border-top: 1px solid var(--rp-hairline);
  font-size: 0.75rem;
  color: var(--rp-text-faint);
}

@media (max-width: 50rem) {
  .head {
    flex-direction: column;
    align-items: stretch;
  }
  .row {
    grid-template-columns: minmax(0, 1fr) 3.6rem;
    row-gap: 0.5rem;
  }
  .meter {
    grid-column: 1 / -1;
    grid-row: 2;
  }
  .nums {
    grid-column: 1;
    grid-row: 3;
    flex-direction: row;
    gap: 0.75rem;
    text-align: left;
  }
  .run-one {
    grid-column: 2;
    grid-row: 1;
  }
}
</style>
