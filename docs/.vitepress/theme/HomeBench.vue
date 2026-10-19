<script setup lang="ts">
import { withBase } from 'vitepress';

// Throughput relative to the baseline (1.0×), from the benchmark tables in docs/advanced/performance.md
// (Node.js 24, Apple M1 Pro). Competitor ratios are derived as ours-vs-baseline / ours-vs-competitor.
interface Bar { label: string; value: number; ours?: boolean }
interface Case { title: string; detail: string; bars: Bar[] }

const OURS = '@nodestd/collections';
const cases: Case[] = [
  {
    title: 'HashMap.get',
    detail: '100k integer keys',
    bars: [{ label: OURS, value: 9.6, ours: true }, { label: 'js-sdsl HashMap', value: 5.96 }, { label: 'native Map', value: 1 }],
  },
  {
    title: 'HashSet add + has',
    detail: '100k integers',
    bars: [{ label: OURS, value: 6.41, ours: true }, { label: 'native Set', value: 1 }, { label: 'js-sdsl HashSet', value: 0.97 }],
  },
  {
    title: 'LRU cache',
    detail: 'capacity 1k, 100k get-or-put',
    bars: [{ label: OURS, value: 4.05, ours: true }, { label: 'mnemonist LRUMap', value: 2.98 }, { label: 'native Map delete + set', value: 1 }],
  },
  {
    title: 'Stream filter → map → sum',
    detail: '100k numbers',
    bars: [{ label: OURS, value: 10.2, ours: true }, { label: 'Array filter/map/reduce', value: 1 }],
  },
  {
    title: 'TreeMap floor + ceiling',
    detail: '100k queries',
    bars: [{ label: OURS, value: 2.14, ours: true }, { label: 'js-sdsl OrderedMap', value: 1 }],
  },
  {
    title: 'PriorityQueue churn',
    detail: 'size 1k, 100k offer + poll',
    bars: [{ label: OURS, value: 1.52, ours: true }, { label: 'js-sdsl PriorityQueue', value: 1.35 }, { label: 'sorted array', value: 1 }],
  },
  {
    title: 'ArrayDeque as a queue',
    detail: 'size 1k, 100k offer + poll',
    bars: [{ label: 'mnemonist CircularBuffer', value: 17.7 }, { label: OURS, value: 12.2, ours: true }, { label: 'Array push + shift', value: 1 }],
  },
  {
    title: 'HashMap.put',
    detail: '100k string keys',
    bars: [{ label: 'native Map', value: 1 }, { label: OURS, value: 0.83, ours: true }, { label: 'js-sdsl HashMap', value: 0.66 }],
  },
];

const width = (c: Case, b: Bar) => `${Math.max(2, (b.value / Math.max(...c.bars.map((x) => x.value))) * 100)}%`;
const fmt = (v: number) => `${v >= 10 ? v.toFixed(1) : v.toFixed(2)}×`;
</script>

<template>
  <section class="home-bench" aria-labelledby="home-bench-title">
    <div class="head">
      <h2 id="home-bench-title">Performance</h2>
      <p>
        Throughput for one workload per card, relative to the baseline shown as 1×. Higher is faster.
        Node.js 24 on an Apple M1 Pro. The full results also list every case where this library is slower.
      </p>
    </div>
    <div class="grid">
      <figure v-for="c in cases" :key="c.title + c.detail" class="card">
        <figcaption>
          <span class="title">{{ c.title }}</span>
          <span class="detail">{{ c.detail }}</span>
        </figcaption>
        <div v-for="b in c.bars" :key="b.label" class="row" :class="{ ours: b.ours }">
          <span class="label">{{ b.label }}</span>
          <span class="track"><span class="bar" :style="{ width: width(c, b) }" /></span>
          <span class="value">{{ fmt(b.value) }}</span>
        </div>
      </figure>
    </div>
    <a class="more" :href="withBase('/advanced/performance#benchmark-results')">All benchmark results and methodology →</a>
  </section>
</template>

<style scoped>
.home-bench {
  margin-top: 56px;
}
.head h2 {
  margin: 0 0 8px;
  padding: 0;
  border: none;
  font-size: 24px;
  letter-spacing: -0.02em;
}
.head p {
  margin: 0 0 20px;
  max-width: 760px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}
.grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}
@media (min-width: 768px) {
  .grid { grid-template-columns: repeat(2, 1fr); }
}
.card {
  margin: 0;
  padding: 18px 20px 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
}
figcaption {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  margin-bottom: 12px;
}
.title {
  font-family: var(--vp-font-family-mono);
  font-size: 14px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.detail {
  font-size: 13px;
  color: var(--vp-c-text-3);
}
.row {
  display: grid;
  grid-template-columns: minmax(120px, 190px) 1fr 52px;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
  font-size: 13px;
}
.label {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--vp-c-text-2);
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
  opacity: 0.4;
}
.value {
  text-align: right;
  font-family: var(--vp-font-family-mono);
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-text-2);
}
.row.ours .label,
.row.ours .value {
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.row.ours .bar {
  background: var(--vp-home-hero-name-background);
  opacity: 1;
}
.more {
  display: inline-block;
  margin-top: 16px;
  font-size: 14px;
  font-weight: 500;
  color: var(--vp-c-brand-1);
  text-decoration: none;
}
.more:hover {
  text-decoration: underline;
}
@media (max-width: 480px) {
  .row { grid-template-columns: 1fr 52px; gap: 4px 10px; }
  .label { grid-column: 1 / -1; }
}
</style>
