import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

export default withMermaid(
  defineConfig({
    title: '@nodestd/collections',
    description:
      "Collections framework for TypeScript and JS, inspired by Java's Collections Framework and Stream API.",
    base: '/collections/',
    cleanUrls: true,
    lastUpdated: true,
    sitemap: { hostname: 'https://nodestd.github.io/collections/' },
    head: [
      ['link', { rel: 'icon', type: 'image/svg+xml', href: '/collections/logo.svg' }],
      ['meta', { name: 'theme-color', content: '#4f46e5' }],
      ['meta', { property: 'og:type', content: 'website' }],
      ['meta', { property: 'og:url', content: 'https://nodestd.github.io/collections/' }],
      ['meta', { property: 'og:image', content: 'https://nodestd.github.io/collections/og.png' }],
      ['meta', { property: 'og:image:width', content: '1200' }],
      ['meta', { property: 'og:image:height', content: '630' }],
      ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
      ['meta', { property: 'og:title', content: '@nodestd/collections' }],
      [
        'meta',
        {
          property: 'og:description',
          content: 'Lists, queues, sets, maps and lazy streams for TypeScript, inspired by the Java Collections Framework.',
        },
      ],
    ],
    markdown: {
      // wrap tables so a wide one scrolls inside the column instead of running under the outline
      config(md) {
        md.renderer.rules.table_open = () => '<div class="table-wrapper"><table>\n';
        md.renderer.rules.table_close = () => '</table></div>\n';
      },
    },
    // class diagrams list type names only, so drop the empty member boxes
    mermaid: { class: { hideEmptyMembersBox: true } },
    rewrites: { 'README.md': 'introduction.md' },
    // pre-bundle mermaid in dev so its CommonJS dependencies (fastdom, ...) get ESM default exports
    vite: {
      optimizeDeps: {
        include: [
          'mermaid',
          // CommonJS packages the in-browser benchmark loads in its worker
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
      // ES module workers can load each benchmarked package as its own chunk
      worker: { format: 'es' },
    },
    themeConfig: {
      logo: '/logo.svg',
      nav: [
        { text: 'Introduction', link: '/introduction' },
        { text: 'Guide', link: '/guide/getting-started' },
        { text: 'Collections', link: '/collections/lists' },
        { text: 'Streams', link: '/streams/overview' },
      ],
      sidebar: [
        { text: 'Introduction', link: '/introduction' },
        {
          text: 'Guide',
          collapsed: false,
          items: [
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'Data structures primer', link: '/guide/data-structures' },
            { text: 'Core concepts', link: '/guide/core-concepts' },
            { text: 'Choosing a collection', link: '/guide/choosing-a-collection' },
            { text: 'Coming from JS', link: '/guide/coming-from-js' },
          ],
        },
        {
          text: 'Collections',
          collapsed: false,
          items: [
            { text: 'Lists', link: '/collections/lists' },
            { text: 'Queues and deques', link: '/collections/queues-and-deques' },
            { text: 'Sets', link: '/collections/sets' },
            { text: 'Maps', link: '/collections/maps' },
            { text: 'Immutable and wrappers', link: '/collections/immutable-and-wrappers' },
          ],
        },
        {
          text: 'Streams',
          collapsed: false,
          items: [
            { text: 'Overview', link: '/streams/overview' },
            { text: 'Operations', link: '/streams/operations' },
            { text: 'Number streams', link: '/streams/number-streams' },
            { text: 'Collectors', link: '/streams/collectors' },
            { text: 'Gatherers', link: '/streams/gatherers' },
            { text: 'Optional', link: '/streams/optional' },
            { text: 'Spliterators', link: '/streams/spliterators' },
          ],
        },
        {
          text: 'Utilities',
          collapsed: false,
          items: [
            { text: 'Collections', link: '/utilities/collections' },
            { text: 'Comparator and Objects', link: '/utilities/comparator-and-objects' },
          ],
        },
        {
          text: 'Advanced',
          collapsed: false,
          items: [
            { text: 'Custom collections', link: '/advanced/custom-collections' },
            { text: 'Performance', link: '/advanced/performance' },
            { text: 'Testing', link: '/advanced/testing' },
            { text: 'Compatibility', link: '/advanced/compatibility' },
            { text: 'Compatibility report', link: '/COMPATIBILITY' },
          ],
        },
      ],
      search: { provider: 'local' },
      outline: [2, 3],
      socialLinks: [{ icon: 'github', link: 'https://github.com/nodestd/collections' }],
      editLink: { pattern: 'https://github.com/nodestd/collections/edit/main/docs/:path' },
      footer: { message: 'Released under the MIT License.', copyright: 'Copyright © 2026 nodestd' },
    },
  }),
);
