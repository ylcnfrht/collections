<script setup lang="ts">
const stats = [
  { value: '1.69M', label: 'operations compared against the JDK' },
  { value: '10,000+', label: 'tests at ~99% line coverage' },
  { value: '0', label: 'runtime dependencies' },
  { value: 'ESM + CJS', label: 'with full type definitions' },
];
</script>

<template>
  <section class="home-stats" aria-label="Project facts">
    <div v-for="s in stats" :key="s.label" class="stat">
      <div class="value">{{ s.value }}</div>
      <div class="label">{{ s.label }}</div>
    </div>
  </section>
</template>

<style scoped>
.home-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  margin: 40px 0 8px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 14px;
  background: var(--vp-c-bg-soft);
  overflow: hidden;
}
@media (min-width: 768px) {
  .home-stats { grid-template-columns: repeat(4, 1fr); }
}
.stat {
  padding: 22px 20px;
  border-right: 1px solid var(--vp-c-divider);
  border-bottom: 1px solid var(--vp-c-divider);
}
.stat:nth-child(2n) { border-right: none; }
.stat:nth-last-child(-n + 2) { border-bottom: none; }
@media (min-width: 768px) {
  .stat { border-bottom: none; border-right: 1px solid var(--vp-c-divider); }
  .stat:nth-child(2n) { border-right: 1px solid var(--vp-c-divider); }
  .stat:last-child { border-right: none; }
}
.value {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.2;
  background: var(--vp-home-hero-name-background);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.label {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--vp-c-text-2);
}
</style>
