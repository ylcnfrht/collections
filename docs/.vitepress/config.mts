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
    rewrites: { 'README.md': 'index.md' },
    themeConfig: {
      nav: [
        { text: 'Guide', link: '/guide/getting-started' },
        { text: 'Collections', link: '/collections/lists' },
        { text: 'Streams', link: '/streams/overview' },
      ],
      sidebar: [
        {
          text: 'Guide',
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
          items: [
            { text: 'Collections', link: '/utilities/collections' },
            { text: 'Comparator and Objects', link: '/utilities/comparator-and-objects' },
          ],
        },
        {
          text: 'Advanced',
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
      footer: { message: 'Released under the MIT License.' },
    },
  }),
);
