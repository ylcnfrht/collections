<script setup lang="ts">
import { withBase } from 'vitepress';
import results from '../../../bench/isolated/results.json';

// Read straight from the last isolated run (npm run bench:isolated): every implementation ran alone in
// its own container, on the same data and the same test loop.
const OURS = '@nodestd/collections';
const cases = results.report.map((w) => ({
  title: w.title,
  detail: w.detail,
  baseline: w.baseline,
  unit: w.unit.label,
  bars: w.rows.map((r) => ({
    label: r.impl,
    value: r.vsBaseline,
    // operations per second: test runs per second times the operations one run performs
    rate: r.opsPerSec * w.unit.perRun,
    ours: r.impl.startsWith(OURS),
    baseline: r.impl === w.baseline,
  })),
}));
const run = results.meta;

type Card = (typeof cases)[number];
const width = (c: Card, v: number) => `${Math.max(2, (v / Math.max(...c.bars.map((x) => x.value))) * 100)}%`;
const fmt = (v: number) => `${v >= 10 ? v.toFixed(1) : v.toFixed(2)}×`;
const compact = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : `${Math.round(n)}`;
</script>

<template>
  <section class="home-bench" aria-labelledby="home-bench-title">
    <div class="head">
      <h2 id="home-bench-title">Performance</h2>
      <p>
        Each card runs one test. The first number is how many times faster than the baseline (1×); the second is
        how many operations per second that is. Higher is faster. Every
        implementation ran alone in its own Docker container from one image (Node.js {{ run.node }}, one pinned
        CPU), on the same data and the same test, and had to return the same checksum; median of {{ run.reps }} runs.
      </p>
    </div>
    <div class="grid">
      <figure v-for="c in cases" :key="c.title + c.detail" class="card">
        <figcaption>
          <span class="title">{{ c.title }}</span>
          <span class="detail">{{ c.detail }}</span>
          <span class="scale">vs {{ c.baseline }} · {{ c.unit }} per second</span>
        </figcaption>
        <div v-for="b in c.bars" :key="b.label" class="row" :class="{ ours: b.ours }">
          <span class="label">{{ b.label }}<span v-if="b.baseline" class="tag">baseline</span></span>
          <span class="track"><span class="bar" :style="{ width: width(c, b.value) }" /></span>
          <span class="value">{{ fmt(b.value) }}</span>
          <span class="rate" :title="`${Math.round(b.rate).toLocaleString('en-US')} ${c.unit} per second`">{{ compact(b.rate) }}/s</span>
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
.scale {
  flex-basis: 100%;
  font-size: 12px;
  color: var(--vp-c-text-3);
}
.tag {
  margin-left: 8px;
  padding: 1px 6px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  font-size: 11px;
  color: var(--vp-c-text-3);
}
.rate {
  text-align: right;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-text-3);
  cursor: help;
}
.row {
  display: grid;
  grid-template-columns: minmax(140px, 240px) 1fr 52px 64px;
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
  .row { grid-template-columns: 1fr 52px 60px; gap: 4px 10px; }
  .label { grid-column: 1 / -1; }
}
</style>
