<script setup lang="ts">
import { computed } from 'vue';
import { useData, withBase } from 'vitepress';
import { data } from './pages.data';

// The sidebar groups as cards; each page shows the first sentence of its own intro, so adding a page to
// the sidebar is enough to list it here.
interface Item { text: string; link?: string; items?: Item[] }
const { theme } = useData();
const groups = computed(() => (theme.value.sidebar as Item[]).filter((g) => g.items?.length));
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// summaries are plain text from the Markdown source; `code` spans become <code>
const html = (s: string) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
</script>

<template>
  <div class="docs-index">
    <section v-for="g in groups" :key="g.text" class="card">
      <h3>{{ g.text }}</h3>
      <a v-for="p in g.items" :key="p.link" class="page" :href="withBase(p.link!)">
        <span class="title">{{ p.text }}</span>
        <span v-if="data[p.link!]?.summary" class="summary" v-html="html(data[p.link!].summary)" />
      </a>
    </section>
  </div>
</template>

<style scoped>
.docs-index {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  margin: 24px 0;
}
@media (min-width: 960px) {
  .docs-index { grid-template-columns: repeat(2, 1fr); }
}
.card {
  padding: 18px 20px 8px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
}
.card h3 {
  margin: 0 0 8px;
  padding: 0;
  font-size: 15px;
  letter-spacing: 0;
}
.page {
  display: block;
  padding: 10px 0;
  border-top: 1px solid var(--vp-c-divider);
  text-decoration: none;
  color: inherit;
}
.page:first-of-type {
  border-top: none;
}
.title {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.page:hover .title {
  color: var(--vp-c-brand-1);
}
.summary {
  display: block;
  margin-top: 2px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--vp-c-text-2);
}
</style>
