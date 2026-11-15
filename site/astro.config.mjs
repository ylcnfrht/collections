// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import vue from '@astrojs/vue';
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc';
import starlightLinksValidator from 'starlight-links-validator';
import { fileURLToPath } from 'node:url';

const lib = fileURLToPath(new URL('../src/', import.meta.url));
const site = 'https://ylcnfrht.github.io';
const base = '/collections';

// SKIP_TYPEDOC=1 skips the API reference (and links into it) for faster content checks.
const skipTypeDoc = process.env.SKIP_TYPEDOC === '1';

export default defineConfig({
  devToolbar: { enabled: false },
  site,
  base,
  trailingSlash: 'always',
  // separate output and cache dirs let several builds run at once
  outDir: process.env.ASTRO_OUT_DIR ?? './dist',
  cacheDir: process.env.ASTRO_CACHE_DIR ?? './node_modules/.astro',
  vite: {
    // Pages and the in-browser benchmark import the library straight from source.
    resolve: { alias: [{ find: /^@ylcnfrht\/collections$/, replacement: `${lib}index.ts` }] },
    server: { fs: { allow: ['..'] } },
    // CommonJS packages the benchmark worker loads, pre-bundled so they get ESM default exports.
    optimizeDeps: {
      include: [
        'js-sdsl',
        'mnemonist',
        '@datastructures-js/priority-queue',
        'collections/fast-map',
        'collections/fast-set',
        'collections/lru-map',
        'collections/sorted-set',
        'collections/heap',
        'collections/deque',
        'collections/list',
        'collections/sorted-map',
      ],
    },
    // ES module workers load each benchmarked package as its own chunk.
    worker: { format: 'es' },
  },
  integrations: [
    vue(),
    starlight({
      title: '@ylcnfrht/collections',
      description: 'Lists, queues, sets, maps and lazy streams for TypeScript, with value equality, sorted maps and fail-fast iterators.',
      logo: { src: './src/assets/logo.svg' },
      favicon: '/favicon.svg',
      head: [
        { tag: 'meta', attrs: { property: 'og:image', content: `${site}${base}/og.png` } },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
        { tag: 'meta', attrs: { name: 'twitter:image', content: `${site}${base}/og.png` } },
      ],
      customCss: ['@fontsource-variable/geist', '@fontsource-variable/geist-mono', './src/styles/theme.css'],
      components: { Header: './src/components/overrides/Header.astro' },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/ylcnfrht/collections' },
        { icon: 'seti:npm', label: 'npm', href: 'https://www.npmjs.com/package/@ylcnfrht/collections' },
      ],
      editLink: { baseUrl: 'https://github.com/ylcnfrht/collections/edit/main/site/' },
      lastUpdated: false,
      pagination: true,
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
      plugins: [
        ...(skipTypeDoc
          ? []
          : [
              starlightTypeDoc({
                entryPoints: ['../src/index.ts'],
                tsconfig: './typedoc.tsconfig.json',
                output: 'api',
                sidebar: { label: 'API', collapsed: true },
                typeDoc: { excludeInternal: true, excludePrivate: true, readme: 'none', entryFileName: 'overview' },
              }),
            ]),
        ...(process.env.SKIP_LINKS === '1'
          ? []
          : [starlightLinksValidator({ errorOnLocalLinks: false, exclude: skipTypeDoc ? ['/collections/api/**'] : [] })]),
      ],
      sidebar: [
        { label: 'Start here', items: [{ autogenerate: { directory: 'start' } }] },
        { label: 'Concepts', items: [{ autogenerate: { directory: 'concepts' } }] },
        { label: 'Collections', items: [{ autogenerate: { directory: 'collections' } }] },
        { label: 'Streams', items: [{ autogenerate: { directory: 'streams' } }] },
        { label: 'Utilities', items: [{ autogenerate: { directory: 'utilities' } }] },
        { label: 'Guides', items: [{ autogenerate: { directory: 'guides' } }] },
        { label: 'Reference', items: [{ autogenerate: { directory: 'reference' } }, { label: 'Benchmarks', link: '/benchmarks/' }] },
        ...(skipTypeDoc ? [] : [typeDocSidebarGroup]),
      ],
    }),
  ],
});
