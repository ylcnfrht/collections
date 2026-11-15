<script setup lang="ts">
import { computed } from 'vue';
import { withBase } from 'vitepress';
import { data } from './classInfo.data';

// One line under a class heading: where the class lives and how much of it is checked against the JDK.
const props = defineProps<{ name: string }>();
const info = computed(() => data[props.name]);
const n = (x: number) => x.toLocaleString('en-US');
</script>

<template>
  <div v-if="info" class="class-info">
    <a class="item" :href="`https://github.com/ylcnfrht/collections/blob/main/${info.file}`" target="_blank" rel="noreferrer">
      <span class="key">Source</span><code>{{ info.file }}</code>
    </a>
    <span v-if="info.extends" class="item"><span class="key">Extends</span><code>{{ info.extends }}</code></span>
    <a v-if="info.compared" class="item" :href="withBase('/COMPATIBILITY')">
      <span class="key">Verified against the JDK</span>
      {{ info.compared }} members, {{ n(info.comparisons) }} comparisons<template v-if="info.excluded">, {{ info.excluded }} excluded</template>
    </a>
  </div>
</template>

<style scoped>
.class-info {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin: 8px 0 16px;
  padding: 10px 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
  font-size: 13px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}
.item {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  color: inherit;
  text-decoration: none;
}
a.item:hover {
  color: var(--vp-c-brand-1);
}
.key {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
}
.class-info code {
  font-size: 12px;
}
</style>
