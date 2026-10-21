import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import { h } from 'vue';
import HeroCode from './HeroCode.vue';
import HomeStats from './HomeStats.vue';
import HomeBench from './HomeBench.vue';
import ClassInfo from './ClassInfo.vue';
import DocsIndex from './DocsIndex.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, { 'home-hero-image': () => h(HeroCode) }),
  enhanceApp({ app }) {
    app.component('HomeStats', HomeStats);
    app.component('HomeBench', HomeBench);
    app.component('ClassInfo', ClassInfo);
    app.component('DocsIndex', DocsIndex);
  },
} satisfies Theme;
