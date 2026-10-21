<script setup lang="ts">
import { ref, computed } from 'vue';
import results from '../../../bench/isolated/results.json';
import type { Workload, Impl, Result } from './bench.worker';

// The same two workloads as the isolated run, next to what that run measured, so a reader can check
// the numbers on their own device. Each implementation runs in a fresh worker, one after the other.
const WORKLOADS: { id: Workload; label: string; unit: string }[] = [
  { id: 'hashmap-get-int', label: 'HashMap.get · integer keys', unit: 'get' },
  { id: 'hashmap-put-string', label: 'HashMap.put · string keys', unit: 'put' },
];
const IMPLS: { id: Impl; label: string; measured: string }[] = [
  { id: 'ours', label: '@nodestd/collections HashMap', measured: '@nodestd/collections HashMap' },
  { id: 'native', label: 'native Map', measured: 'native Map' },
];

const workload = ref<Workload>('hashmap-get-int');
const running = ref<Impl | null>(null);
const runs = ref<Partial<Record<Workload, Partial<Record<Impl, Result>>>>>({});
const error = ref('');

const current = computed(() => runs.value[workload.value] ?? {});
const unit = computed(() => WORKLOADS.find((w) => w.id === workload.value)!.unit);
const opsPerSec = (r: Result) => r.ops / (r.ms / 1000);

/** this library vs native Map in the isolated run, for the selected workload */
const measuredRatio = computed(() => {
  const w = results.report.find((x) => x.id === workload.value);
  const ours = w?.rows.find((r) => r.impl === IMPLS[0].measured);
  const native = w?.rows.find((r) => r.impl === IMPLS[1].measured);
  return ours && native ? ours.opsPerSec / native.opsPerSec : null;
});
const yourRatio = computed(() => {
  const o = current.value.ours;
  const n = current.value.native;
  return o && n ? opsPerSec(o) / opsPerSec(n) : null;
});
const maxOps = computed(() => Math.max(1, ...Object.values(current.value).map((r) => opsPerSec(r!))));

function runOne(w: Workload, impl: Impl): Promise<Result> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./bench.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<Result>) => {
      worker.terminate();
      resolve(e.data);
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'worker failed'));
    };
    worker.postMessage({ workload: w, impl });
  });
}

async function run() {
  error.value = '';
  const w = workload.value;
  runs.value = { ...runs.value, [w]: {} };
  try {
    for (const impl of IMPLS) {
      running.value = impl.id;
      const r = await runOne(w, impl.id);
      runs.value = { ...runs.value, [w]: { ...runs.value[w], [impl.id]: r } };
    }
    const { ours, native } = runs.value[w]!;
    if (ours!.check !== native!.check) error.value = `The two implementations returned different checksums (${ours!.check} vs ${native!.check}).`;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    running.value = null;
  }
}

const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1e3)}k`);
const ratio = (x: number | null) => (x === null ? '–' : `${x.toFixed(2)}×`);
</script>

<template>
  <div class="try-bench">
    <div class="top">
      <div class="tabs" role="tablist" aria-label="Workload">
        <button
          v-for="w in WORKLOADS"
          :key="w.id"
          role="tab"
          :aria-selected="w.id === workload"
          :class="{ active: w.id === workload }"
          :disabled="running !== null"
          @click="workload = w.id"
        >
          {{ w.label }}
        </button>
      </div>
      <button class="run" :disabled="running !== null" @click="run">
        {{ running ? 'Running…' : current.ours ? 'Run again' : 'Run in my browser' }}
      </button>
    </div>

    <div v-for="impl in IMPLS" :key="impl.id" class="row" :class="{ ours: impl.id === 'ours' }">
      <span class="label">{{ impl.label }}</span>
      <span class="track">
        <span v-if="current[impl.id]" class="bar" :style="{ width: `${(opsPerSec(current[impl.id]!) / maxOps) * 100}%` }" />
        <span v-else-if="running === impl.id" class="bar pending" />
      </span>
      <span class="value">
        <template v-if="current[impl.id]">
          {{ fmt(opsPerSec(current[impl.id]!)) }} {{ unit }}/s ·
          {{ ((current[impl.id]!.ms * 1e6) / current[impl.id]!.ops).toFixed(1) }} ns
        </template>
        <template v-else-if="running === impl.id">running…</template>
        <template v-else>–</template>
      </span>
    </div>

    <div class="compare">
      <div>
        <span class="key">Your browser</span>
        <span class="num">{{ ratio(yourRatio) }}</span>
      </div>
      <div>
        <span class="key">Our isolated run</span>
        <span class="num">{{ ratio(measuredRatio) }}</span>
      </div>
      <p>
        Throughput of this library divided by native <code>Map</code>; above 1× is faster. Each implementation runs
        for about a second in its own Web Worker, after a short warm-up, on the same 100,000 keys as the isolated run.
        Browser engines and devices differ, so expect your numbers to vary.
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
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
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
.tabs button.active {
  background: var(--vp-c-default-soft);
  color: var(--vp-c-text-1);
  font-weight: 600;
}
.tabs button:disabled {
  cursor: default;
}
.run {
  padding: 7px 14px;
  border-radius: 8px;
  background: var(--vp-button-brand-bg);
  color: var(--vp-button-brand-text);
  font-size: 14px;
  font-weight: 600;
}
.run:hover:not(:disabled) {
  background: var(--vp-button-brand-hover-bg);
}
.run:disabled {
  opacity: 0.6;
  cursor: progress;
}
.row {
  display: grid;
  grid-template-columns: minmax(150px, 230px) 1fr minmax(150px, auto);
  align-items: center;
  gap: 12px;
  padding: 6px 0;
  font-size: 13px;
}
.label {
  color: var(--vp-c-text-2);
}
.row.ours .label {
  font-weight: 600;
  color: var(--vp-c-text-1);
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
.bar.pending {
  width: 30%;
  animation: slide 1.2s ease-in-out infinite alternate;
}
@keyframes slide {
  from { transform: translateX(-30%); }
  to { transform: translateX(260%); }
}
.value {
  text-align: right;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-text-2);
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
  .row { grid-template-columns: 1fr; gap: 4px; }
  .value { text-align: left; }
}
</style>
