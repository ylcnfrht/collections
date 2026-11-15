<script setup lang="ts">
import { ref, computed } from 'vue';
import results from '../../../../bench/isolated/results.json';
import { workloads } from '../../../../bench/isolated/workloads';
import type { Result } from './bench.worker';

// Runs the isolated benchmark's workloads in the reader's browser, each implementation in a fresh worker,
// next to the ratios the isolated Docker run measured.
type W = (typeof workloads)[number];
const OURS = '@ylcnfrht/collections';

const selected = ref(workloads[0].id);
const workload = computed(() => workloads.find((w) => w.id === selected.value)!);
const runs = ref<Record<string, Record<string, Result>>>({});
const error = ref('');
const progress = ref({ value: 0, measuring: false }); // of the implementation that is running
const job = ref<{ workload: string; impl: string; done: number; total: number } | null>(null);

const implsOf = (w: W) => Object.keys(w.impls);
const groups = [...new Set(workloads.map((w) => w.group))].map((g) => ({ name: g, items: workloads.filter((w) => w.group === g) }));
const oursOf = (w: W) => implsOf(w).find((i) => i.startsWith(OURS))!;
const opsPerSec = (r: Result) => r.ops / (r.ms / 1000);
const measured = (w: W, impl: string) => results.report.find((x) => x.id === w.id)?.rows.find((r) => r.impl === impl)?.vsBaseline ?? null;
const yours = (w: W, impl: string) => {
  const r = runs.value[w.id];
  return r?.[impl] && r[w.baseline] ? opsPerSec(r[impl]) / opsPerSec(r[w.baseline]) : null;
};
const complete = (w: W) => implsOf(w).every((i) => runs.value[w.id]?.[i]);

/** rows of the selected workload: fastest first once measured, else in the isolated run's order */
const rows = computed(() => {
  const w = workload.value;
  const r = runs.value[w.id] ?? {};
  const isolated = results.report.find((x) => x.id === w.id)?.rows.map((x) => x.impl) ?? [];
  return [...implsOf(w)].sort((a, b) =>
    r[a] && r[b] ? opsPerSec(r[b]) - opsPerSec(r[a]) : isolated.indexOf(a) - isolated.indexOf(b),
  );
});
const maxMeasured = computed(() => Math.max(1e-9, ...implsOf(workload.value).map((i) => measured(workload.value, i) ?? 0)));
const maxOps = computed(() => Math.max(1, ...Object.values(runs.value[selected.value] ?? {}).map(opsPerSec)));

function runOne(w: string, impl: string): Promise<Result> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./bench.worker.ts', import.meta.url), { type: 'module' });
    progress.value = { value: 0, measuring: false };
    worker.onmessage = (e: MessageEvent<Result & { error?: string; progress?: number; measuring?: boolean }>) => {
      if (e.data.progress !== undefined) {
        progress.value = { value: e.data.progress, measuring: !!e.data.measuring };
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

async function run(all: boolean) {
  error.value = '';
  const todo = all ? workloads : [workload.value];
  const total = todo.reduce((n, w) => n + implsOf(w).length, 0);
  let done = 0;
  try {
    for (const w of todo) {
      selected.value = w.id;
      runs.value = { ...runs.value, [w.id]: {} };
      for (const impl of implsOf(w)) {
        job.value = { workload: w.id, impl, done, total };
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
const overall = computed(() => (job.value ? (job.value.done + progress.value.value) / job.value.total : 0));

function words(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} billion`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} million`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} thousand`;
  return `${Math.round(n)}`;
}
const times = (x: number) => `${x >= 10 ? x.toFixed(1) : x.toFixed(2)}×`;
/** "4.13× faster" or "1.37× slower", never a fraction */
const verdict = (x: number) => (x >= 1 ? `${times(x)} faster` : `${times(1 / x)} slower`);
</script>

<template>
  <div class="bench">
    <div class="bar-top">
      <div class="status">
        <template v-if="job">
          <span class="dot" />
          {{ job.done + 1 }} / {{ job.total }} · {{ workloads.find((w) => w.id === job!.workload)!.title }} ·
          {{ job.impl }} · {{ progress.measuring ? 'measuring' : 'warming up' }}
        </template>
        <template v-else>Runs on your device. Each implementation takes about 1.5 s.</template>
      </div>
      <div class="actions">
        <button class="btn" :disabled="busy" @click="run(false)">{{ runs[selected] && complete(workload) ? 'Run again' : 'Run this test' }}</button>
        <button class="btn primary" :disabled="busy" @click="run(true)">Run all {{ workloads.length }} tests</button>
      </div>
    </div>
    <div class="overall" :class="{ on: busy }"><span :style="{ width: `${overall * 100}%` }" /></div>

    <div class="body">
      <nav class="list" aria-label="Workloads">
        <template v-for="g in groups" :key="g.name">
        <div class="group">{{ g.name }}</div>
        <button
          v-for="w in g.items"
          :key="w.id"
          :class="{ active: w.id === selected, running: job?.workload === w.id }"
          :aria-current="w.id === selected"
          @click="selected = w.id"
        >
          <span class="name">{{ w.title }}</span>
          <span class="sub">{{ w.detail }}</span>
          <span
            class="pill"
            :class="{
              measured: complete(w),
              slower: (complete(w) ? yours(w, oursOf(w)) : measured(w, oursOf(w)))! < 1,
            }"
            :title="complete(w) ? 'your browser' : 'our isolated run'"
          >
            {{ (complete(w) ? yours(w, oursOf(w)) : measured(w, oursOf(w))) === null ? 'new' : times((complete(w) ? yours(w, oursOf(w)) : measured(w, oursOf(w)))!) }}
          </span>
        </button>
        </template>
      </nav>

      <section class="panel">
        <p class="headline">
          <template v-if="complete(workload)">
            <strong>{{ oursOf(workload) }}</strong> was{{ ' ' }}
            <strong :class="{ slower: yours(workload, oursOf(workload))! < 1 }">{{ verdict(yours(workload, oursOf(workload))!) }}</strong>{{ ' ' }}
            than {{ workload.baseline }} in your browser.
            <span v-if="measured(workload, oursOf(workload)) !== null" class="muted">Our isolated run measured {{ verdict(measured(workload, oursOf(workload))!) }}.</span>
          </template>
          <template v-else-if="measured(workload, oursOf(workload)) !== null">
            Our isolated run measured <strong>{{ oursOf(workload) }}</strong>{{ ' ' }}
            <strong :class="{ slower: measured(workload, oursOf(workload))! < 1 }">{{ verdict(measured(workload, oursOf(workload))!) }}</strong>{{ ' ' }}
            than {{ workload.baseline }}. Run the test to measure it on your device.
          </template>
          <template v-else>
            Run the test to compare <strong>{{ oursOf(workload) }}</strong> with {{ workload.baseline }} on your device.
          </template>
        </p>
        <p class="unit">{{ workload.unit.label }} per second, higher is faster</p>

        <TransitionGroup tag="div" name="rows" class="rows">
          <div v-for="impl in rows" :key="impl" class="row" :class="{ ours: impl.startsWith(OURS) }">
            <div class="label">
              {{ impl }}<span v-if="impl === workload.baseline" class="tag">baseline</span>
            </div>
            <div class="track">
              <span v-if="runs[selected]?.[impl]" class="fill" :style="{ width: `${(opsPerSec(runs[selected][impl]) / maxOps) * 100}%` }" />
              <span v-else-if="job?.workload === selected && job.impl === impl" class="fill live" :style="{ width: `${progress.value * 100}%` }" />
              <span v-else-if="!runs[selected]?.[impl] && measured(workload, impl) !== null" class="fill ghost" :style="{ width: `${(measured(workload, impl)! / maxMeasured) * 100}%` }" />
            </div>
            <div class="value">
              <template v-if="runs[selected]?.[impl]">
                <span class="main">{{ words(opsPerSec(runs[selected][impl])) }} / s</span>
                <span class="sub">
                  {{ ((runs[selected][impl].ms * 1e6) / runs[selected][impl].ops).toFixed(1) }} ns per call
                  <template v-if="impl !== workload.baseline && yours(workload, impl) !== null"> · {{ times(yours(workload, impl)!) }}</template>
                  <template v-if="measured(workload, impl) !== null && impl !== workload.baseline"> (isolated {{ times(measured(workload, impl)!) }})</template>
                </span>
              </template>
              <span v-else-if="job?.workload === selected && job.impl === impl" class="sub">
                {{ progress.measuring ? 'measuring' : 'warming up' }} {{ Math.round(progress.value * 100) }}%
              </span>
              <span v-else-if="measured(workload, impl) !== null" class="sub">isolated run {{ times(measured(workload, impl)!) }}</span>
              <span v-else class="sub">not measured yet</span>
            </div>
          </div>
        </TransitionGroup>

        <p v-if="error" class="error">{{ error }}</p>
        <details class="how">
          <summary>How this is measured</summary>
          <p>
            Each implementation runs in its own Web Worker, so only its library is loaded. It repeats the test for
            0.3 s to warm up and then for 1 s to measure, on the same data as our
            <a href="https://github.com/ylcnfrht/collections/tree/main/bench/isolated">isolated Docker benchmark</a>,
            and every implementation has to return the same checksum. One call takes nanoseconds, so a second of
            measuring is millions of calls. Ratios divide by the baseline row. Browser engines and devices differ,
            so expect your numbers to vary from ours.
          </p>
        </details>
      </section>
    </div>
  </div>
</template>

<style scoped>
.bench {
  margin: 20px 0 28px;
  border: 1px solid var(--rp-hairline);
  border-radius: 14px;
  background: var(--rp-surface);
  overflow: hidden;
}
.bar-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 16px;
  padding: 14px 18px;
}
.status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--rp-text-muted);
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--sl-color-accent);
  animation: pulse 1s ease-in-out infinite alternate;
}
@keyframes pulse {
  from { opacity: 0.3; }
  to { opacity: 1; }
}
.actions {
  display: flex;
  gap: 8px;
}
.btn {
  padding: 7px 14px;
  border: 1px solid var(--rp-hairline);
  border-radius: 8px;
  background: var(--rp-bg);
  font-size: 14px;
  font-weight: 600;
  color: var(--sl-color-white);
  white-space: nowrap;
  transition: background 0.2s, border-color 0.2s;
}
.btn:hover:not(:disabled) {
  border-color: var(--sl-color-accent);
}
.btn.primary {
  border-color: transparent;
  background: var(--sl-color-white);
  color: var(--rp-bg);
}
.btn.primary:hover:not(:disabled) {
  background: var(--sl-color-gray-1);
}
.btn:disabled {
  opacity: 0.55;
  cursor: progress;
}
.overall {
  height: 2px;
  background: var(--rp-hairline);
}
.overall span {
  display: block;
  height: 100%;
  width: 0;
  background: var(--sl-color-accent);
  transition: width 0.15s linear;
}
.overall:not(.on) span {
  width: 0 !important;
}
.body {
  display: grid;
  grid-template-columns: 250px 1fr;
}
.list {
  display: flex;
  flex-direction: column;
  padding: 8px;
  max-height: 640px;
  overflow-y: auto;
  border-right: 1px solid var(--rp-hairline);
  background: var(--rp-bg);
}
.group {
  padding: 10px 10px 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--rp-text-faint);
}
.group:first-child {
  padding-top: 4px;
}
.list button {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas: 'name pill' 'sub pill';
  align-items: center;
  gap: 0 8px;
  padding: 8px 10px;
  border-radius: 8px;
  text-align: left;
  transition: background 0.15s;
}
.list button:hover {
  background: var(--rp-surface-2);
}
.list button.active {
  background: var(--sl-color-accent-low);
}
.list .name {
  grid-area: name;
  font-size: 13px;
  font-weight: 600;
  color: var(--sl-color-white);
}
.list .sub {
  grid-area: sub;
  font-size: 11px;
  color: var(--rp-text-faint);
}
.list button.running .name::after {
  content: ' ·';
  color: var(--sl-color-accent);
  animation: pulse 0.6s ease-in-out infinite alternate;
}
.pill {
  grid-area: pill;
  padding: 1px 7px;
  border: 1px dashed var(--rp-hairline);
  border-radius: 999px;
  font-family: var(--rp-mono);
  font-size: 11px;
  color: var(--rp-text-faint);
}
.pill.measured {
  border-style: solid;
  border-color: transparent;
  background: var(--sl-color-accent-low);
  color: var(--sl-color-accent);
  font-weight: 600;
}
.pill.measured.slower {
  background: color-mix(in oklab, var(--rp-amber) 14%, transparent);
  color: var(--rp-amber);
}
.panel {
  min-width: 0;
  padding: 16px 20px 18px;
}
.headline {
  margin: 0;
  font-size: 15px;
  line-height: 1.6;
  color: var(--sl-color-white);
}
.headline strong {
  font-weight: 600;
}
.headline strong:nth-of-type(2) {
  color: var(--sl-color-accent);
}
.headline strong.slower {
  color: var(--rp-amber);
}
.muted {
  color: var(--rp-text-muted);
}
.unit {
  margin: 4px 0 10px;
  font-size: 12px;
  color: var(--rp-text-faint);
}
.row {
  display: grid;
  grid-template-columns: minmax(130px, 210px) 1fr 230px;
  align-items: center;
  gap: 14px;
  padding: 7px 0;
  border-top: 1px solid var(--rp-hairline);
}
.row:first-child {
  border-top: none;
}
.label {
  font-size: 13px;
  line-height: 1.4;
  overflow-wrap: anywhere;
  color: var(--rp-text-muted);
}
.row.ours .label {
  font-weight: 600;
  color: var(--sl-color-white);
}
.tag {
  display: inline-block;
  margin-left: 6px;
  padding: 0 6px;
  border: 1px solid var(--rp-hairline);
  border-radius: 6px;
  font-size: 11px;
  font-weight: 400;
  white-space: nowrap;
  color: var(--rp-text-faint);
}
.track {
  height: 8px;
  border-radius: 6px;
  background: var(--rp-surface-2);
  overflow: hidden;
}
.fill {
  display: block;
  height: 100%;
  border-radius: 6px;
  background: var(--rp-text-faint);
  opacity: 0.45;
  transition: width 0.5s ease;
}
.row.ours .fill {
  background: linear-gradient(90deg, var(--rp-accent), var(--rp-accent-2));
  opacity: 1;
}
.fill.ghost {
  background: transparent;
  border: 1px dashed var(--rp-text-faint);
  opacity: 0.5;
}
.fill.live {
  transition: width 0.1s linear;
  opacity: 0.8;
}
.value {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.value .main {
  font-size: 14px;
  font-weight: 600;
  color: var(--sl-color-white);
}
.row:not(.ours) .value .main {
  font-weight: 500;
  color: var(--rp-text-muted);
}
.value .sub {
  font-size: 11px;
  color: var(--rp-text-faint);
}
.rows-move {
  transition: transform 0.4s ease;
}
.error {
  margin: 10px 0 0;
  font-size: 13px;
  color: var(--rp-red);
}
.how {
  margin-top: 12px;
  font-size: 12px;
  color: var(--rp-text-faint);
}
.how summary {
  cursor: pointer;
  width: fit-content;
}
.how summary:hover {
  color: var(--rp-text-muted);
}
.how p {
  margin: 6px 0 0;
  line-height: 1.6;
}
@media (max-width: 760px) {
  .body {
    grid-template-columns: 1fr;
  }
  .list {
    flex-direction: row;
    overflow-x: auto;
    border-right: none;
    border-bottom: 1px solid var(--rp-hairline);
  }
  .list button {
    flex: 0 0 auto;
    grid-template-areas: 'name pill';
  }
  .list .sub,
  .group {
    display: none;
  }
  .row {
    grid-template-columns: 1fr auto;
    gap: 4px 12px;
  }
  .track {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}
</style>
