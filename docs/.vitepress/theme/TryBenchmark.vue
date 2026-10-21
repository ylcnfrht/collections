<script setup lang="ts">
import { ref, computed } from 'vue';
import results from '../../../bench/isolated/results.json';
import { workloads as allWorkloads } from '../../../bench/isolated/workloads';
import type { Result } from './bench.worker';

// Runs the isolated benchmark's workloads in the reader's browser, each implementation in a fresh worker,
// next to the ratios the isolated Docker run measured.
const props = withDefaults(defineProps<{ workloads?: string[]; implementations?: 'all' | 'ours-and-native' }>(), {
  implementations: 'all',
});
const OURS = '@nodestd/collections';

const list = computed(() => allWorkloads.filter((w) => !props.workloads || props.workloads.includes(w.id)));
const selected = ref(list.value[0].id);
const workload = computed(() => list.value.find((w) => w.id === selected.value)!);
const impls = (w: (typeof allWorkloads)[number]) =>
  Object.keys(w.impls).filter((i) => props.implementations === 'all' || i === w.baseline || (i.startsWith(OURS) && !i.includes('IntStream')));

const runs = ref<Record<string, Record<string, Result>>>({});
const running = ref<string | null>(null); // "workload|impl" while it runs
const error = ref('');
const progress = ref({ value: 0, measuring: false }); // of the implementation that is running

const opsPerSec = (r: Result) => r.ops / (r.ms / 1000);
const current = computed(() => runs.value[selected.value] ?? {});
const measured = (w: string, impl: string) => results.report.find((x) => x.id === w)?.rows.find((r) => r.impl === impl)?.vsBaseline ?? null;
const yours = (w: string, impl: string) => {
  const r = runs.value[w];
  return r?.[impl] && r[allWorkloads.find((x) => x.id === w)!.baseline] ? opsPerSec(r[impl]) / opsPerSec(r[allWorkloads.find((x) => x.id === w)!.baseline]) : null;
};
const maxOps = computed(() => Math.max(1, ...Object.values(current.value).map(opsPerSec)));
const oursName = computed(() => impls(workload.value).find((i) => i.startsWith(OURS))!);

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

async function runWorkload(id: string) {
  const w = allWorkloads.find((x) => x.id === id)!;
  runs.value = { ...runs.value, [id]: {} };
  for (const impl of impls(w)) {
    running.value = `${id}|${impl}`;
    const r = await runOne(id, impl);
    runs.value = { ...runs.value, [id]: { ...runs.value[id], [impl]: r } };
  }
  const checks = new Set(Object.values(runs.value[id]).map((r) => r.check));
  if (checks.size > 1) throw new Error(`${w.title}: implementations returned different checksums.`);
}

async function run(all: boolean) {
  error.value = '';
  try {
    for (const w of all ? list.value : [workload.value]) {
      selected.value = w.id;
      await runWorkload(w.id);
    }
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    running.value = null;
  }
}

const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`);
const ratio = (x: number | null) => (x === null ? '–' : `${x >= 10 ? x.toFixed(1) : x.toFixed(2)}×`);
const busy = computed(() => running.value !== null);
const runningImpl = computed(() => running.value?.split('|')[1]);
</script>

<template>
  <div class="try-bench" :class="{ full: implementations === 'all' }">
    <div class="top">
      <div class="tabs" role="tablist" aria-label="Workload">
        <button
          v-for="w in list"
          :key="w.id"
          role="tab"
          :aria-selected="w.id === selected"
          :class="{ active: w.id === selected, done: runs[w.id] && Object.keys(runs[w.id]).length === impls(w).length }"
          :disabled="busy"
          @click="selected = w.id"
        >
          {{ w.title }}<span class="detail"> · {{ w.detail }}</span>
        </button>
      </div>
      <div class="actions">
        <button v-if="list.length > 2" class="run alt" :disabled="busy" @click="run(true)">Run all</button>
        <button class="run" :disabled="busy" @click="run(false)">
          {{ busy ? 'Running…' : current[oursName] ? 'Run again' : 'Run in my browser' }}
        </button>
      </div>
    </div>

    <div class="scale">vs {{ workload.baseline }} · {{ workload.unit.label }} per second</div>
    <div v-if="implementations === 'all'" class="row head">
      <span /><span /><span>your browser</span><span class="num-col">yours</span><span class="num-col">isolated run</span>
    </div>
    <div v-for="impl in impls(workload)" :key="impl" class="row" :class="{ ours: impl.startsWith(OURS) }">
      <span class="label">{{ impl }}<span v-if="impl === workload.baseline" class="tag">baseline</span></span>
      <span class="track">
        <span v-if="current[impl]" class="bar" :style="{ width: `${(opsPerSec(current[impl]) / maxOps) * 100}%` }" />
        <span v-else-if="runningImpl === impl" class="bar progress" :style="{ width: `${progress.value * 100}%` }" />
      </span>
      <span class="value">
        <template v-if="current[impl]">
          {{ fmt(opsPerSec(current[impl])) }}/s · {{ ((current[impl].ms * 1e6) / current[impl].ops).toFixed(1) }} ns
          <span class="total">{{ fmt(current[impl].ops) }} calls in {{ (current[impl].ms / 1000).toFixed(2) }} s</span>
        </template>
        <template v-else-if="runningImpl === impl">{{ progress.measuring ? 'measuring' : 'warming up' }} {{ Math.round(progress.value * 100) }}%</template>
        <template v-else>–</template>
      </span>
      <template v-if="implementations === 'all'">
        <span class="num-col">{{ ratio(yours(selected, impl)) }}</span>
        <span class="num-col muted">{{ ratio(measured(selected, impl)) }}</span>
      </template>
    </div>

    <div class="compare">
      <div>
        <span class="key">Your browser</span>
        <span class="num">{{ ratio(yours(selected, oursName)) }}</span>
      </div>
      <div>
        <span class="key">Our isolated run</span>
        <span class="num">{{ ratio(measured(selected, oursName)) }}</span>
      </div>
      <p>
        {{ oursName }} relative to {{ workload.baseline }}; above 1× is faster. ns is the time of one call. Each
        implementation repeats the test for 0.3 s to warm up, then for 1 s to measure, in its own Web Worker, on the
        same data as the isolated run; so one run takes a few seconds for millions of calls. Browser engines and
        devices differ, so expect your numbers to vary.
      </p>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<style scoped>
.try-bench {
  margin: 20px 0 28px;
  padding: 18px 20px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
}
.top {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 3px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
}
.tabs button {
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--vp-c-text-2);
}
.full .tabs .detail {
  display: none;
}
.tabs button.active {
  background: var(--vp-c-default-soft);
  color: var(--vp-c-text-1);
  font-weight: 600;
}
.tabs button.done::after {
  content: ' ✓';
  color: var(--vp-c-brand-1);
}
.tabs button:disabled {
  cursor: default;
}
.actions {
  display: flex;
  gap: 8px;
}
.run {
  padding: 7px 14px;
  border-radius: 8px;
  background: var(--vp-button-brand-bg);
  color: var(--vp-button-brand-text);
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}
.run.alt {
  background: var(--vp-button-alt-bg);
  color: var(--vp-button-alt-text);
}
.run:hover:not(:disabled) {
  filter: brightness(1.08);
}
.run:disabled {
  opacity: 0.6;
  cursor: progress;
}
.scale {
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--vp-c-text-3);
}
.row {
  display: grid;
  grid-template-columns: minmax(150px, 240px) 1fr minmax(140px, auto);
  align-items: center;
  gap: 12px;
  padding: 6px 0;
  font-size: 13px;
}
.full .row {
  grid-template-columns: minmax(150px, 230px) 1fr minmax(130px, auto) 52px 64px;
}
.row.head {
  padding: 0;
  font-size: 11px;
  color: var(--vp-c-text-3);
}
.row.head span:nth-child(3) {
  text-align: right;
}
.label {
  line-height: 1.4;
  overflow-wrap: anywhere;
  color: var(--vp-c-text-2);
}
.row.ours .label {
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.tag {
  display: inline-block;
  margin-left: 8px;
  padding: 0 6px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  font-size: 11px;
  font-weight: 400;
  white-space: nowrap;
  color: var(--vp-c-text-3);
}
.track {
  height: 10px;
  border-radius: 6px;
  background: var(--vp-c-default-soft);
  overflow: hidden;
}
.bar {
  display: block;
  height: 100%;
  border-radius: 6px;
  background: var(--vp-c-text-3);
  opacity: 0.45;
  transition: width 0.6s ease;
}
.row.ours .bar {
  background: var(--vp-home-hero-name-background);
  opacity: 1;
}
.bar.progress {
  opacity: 0.7;
  transition: width 0.1s linear;
  background-image: repeating-linear-gradient(-45deg, transparent 0 6px, rgba(255, 255, 255, 0.25) 6px 12px);
}
.row.ours .bar.progress {
  background: var(--vp-home-hero-name-background);
}
.total {
  display: block;
  font-size: 11px;
  color: var(--vp-c-text-3);
}
.value,
.num-col {
  text-align: right;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-text-2);
}
.row.ours .num-col {
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.num-col.muted,
.row.ours .num-col.muted {
  font-weight: 400;
  color: var(--vp-c-text-3);
}
.compare {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px 28px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--vp-c-divider);
}
.compare div {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.key {
  font-size: 12px;
  color: var(--vp-c-text-3);
}
.num {
  font-family: var(--vp-font-family-mono);
  font-size: 20px;
  font-weight: 700;
  color: var(--vp-c-text-1);
}
.compare p,
.error {
  flex-basis: 100%;
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--vp-c-text-3);
}
.error {
  color: var(--vp-c-danger-1);
}
@media (max-width: 640px) {
  .row,
  .full .row { grid-template-columns: 1fr auto auto; gap: 4px 10px; }
  .label { grid-column: 1 / -1; }
  .track { grid-column: 1 / -1; }
  .row.head { display: none; }
}
</style>
