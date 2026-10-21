---
layout: home

hero:
  name: '@nodestd/collections'
  text: Collections for TypeScript
  tagline: Lists, queues, sets, maps and lazy streams with one consistent API, inspired by the Java Collections Framework.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Introduction
      link: /introduction
    - theme: alt
      text: View on GitHub
      link: https://github.com/nodestd/collections

features:
  - icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9h14M5 15h14"/></svg>'
    title: Value equality
    details: Collections compare elements with equals() and hashCode(), so a list, or any object that defines equals(), works as a map key.
    link: /guide/core-concepts#value-equality
    linkText: Core concepts
  - icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20v-5M10 20v-9M16 20V7M22 20V3"/></svg>'
    title: Sorted and navigable
    details: TreeMap and TreeSet with floor, ceiling, range views and descending order, backed by a red-black tree.
    link: /collections/maps
    linkText: Maps
  - icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>'
    title: Live views
    details: subList, keySet, headMap and reversed() read and write through to the backing collection.
    link: /guide/core-concepts#live-views
    linkText: Live views
  - icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>'
    title: Fail-fast iterators
    details: Modifying a collection while iterating it throws a ConcurrentModificationException instead of skipping elements.
    link: /guide/core-concepts#fail-fast-iteration
    linkText: Fail-fast iteration
  - icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>'
    title: Lazy streams
    details: Stream, Collectors and Gatherers evaluate only as far as the result needs, with short-circuiting operations.
    link: /streams/overview
    linkText: Streams
  - icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z"/><path d="m9 12 2 2 4-4"/></svg>'
    title: Verified against the JDK
    details: The same random operation scripts run on a real JDK and on this library, with zero library differences.
    link: /advanced/testing
    linkText: How it is tested
---

<HomeStats />

## Installation

::: code-group

```sh [npm]
npm install @nodestd/collections
```

```sh [pnpm]
pnpm add @nodestd/collections
```

```sh [yarn]
yarn add @nodestd/collections
```

```sh [bun]
bun add @nodestd/collections
```

:::

Runs on Node.js 18+, Deno, Bun and modern browsers. Continue with [Getting started](./guide/getting-started.md).
