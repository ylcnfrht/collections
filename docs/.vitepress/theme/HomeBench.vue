<script setup lang="ts">
import { withBase } from 'vitepress';
import results from '../../../bench/isolated/results.json';

// Read straight from the last isolated run (npm run bench:isolated): every implementation ran alone in
// its own container, on the same data and the same test loop.
const OURS = '@nodestd/collections';
const cases = results.report.map((w) => ({
  title: w.title,
  detail: w.detail,
  bars: w.rows.map((r) => ({ label: r.impl, value: r.vsBaseline, ours: r.impl.startsWith(OURS) })),
}));
const run = results.meta;

type Card = (typeof cases)[number];
const width = (c: Card, v: number) => `${Math.max(2, (v / Math.max(...c.bars.map((x) => x.value))) * 100)}%`;
const fmt = (v: number) => `${v >= 10 ? v.toFixed(1) : v.toFixed(2)}×`;
</script>

<template>
  <section class="home-bench" aria-labelledby="home-bench-title">
    <div class="head">
      <h2 id="home-bench-title">Performance</h2>
      <p>
        Throughput for one workload per card, relative to the baseline shown as 1×. Higher is faster. Every
        implementation ran alone in its own Docker container from one image (Node.js {{ run.node }}, one pinned
        CPU), on the same data and the same test, and had to return the same checksum; median of {{ run.reps }} runs.
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
          <span class="track"><span class="bar" :style="{ width: width(c, b.value) }" /></span>
          <span class="value">{{ fmt(b.value) }}</span>
        </div>
      </figure>
    </div>
    <a class="more" :href="withBase('/advanced/performance#isolated-comparison')">Full results and methodology →</a>
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
  grid-template-columns: minmax(140px, 250px) 1fr 52px;
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
