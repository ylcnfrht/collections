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
      text: GitHub
      link: https://github.com/nodestd/collections

features:
  - title: Value equality
    details: Collections compare elements with equals() and hashCode(), so a list, or any object that defines equals(), works as a map key.
    link: /guide/core-concepts#value-equality
  - title: Sorted and navigable
    details: TreeMap and TreeSet with floor, ceiling, range views and descending order, backed by a red-black tree.
    link: /collections/maps
  - title: Live views
    details: subList, keySet, headMap and reversed() read and write through to the backing collection.
    link: /guide/core-concepts#live-views
  - title: Fail-fast iterators
    details: Modifying a collection while iterating it throws a ConcurrentModificationException instead of skipping elements.
    link: /guide/core-concepts#fail-fast-iteration
  - title: Lazy streams
    details: Stream, Collectors and Gatherers evaluate only as far as the result needs, with short-circuiting operations.
    link: /streams/overview
  - title: Verified against the JDK
    details: Over 1.6 million operations compared against a real JDK, more than 10,000 tests, zero dependencies.
    link: /advanced/testing
---

## Install

```sh
npm install @nodestd/collections
```

## Example

```ts
import { HashMap, TreeMap, List } from '@nodestd/collections';

const routes = new HashMap<List<number>, string>();
routes.put(List.of(1, 2), 'route A');
console.log(routes.get(List.of(1, 2))); // → route A

const plans = new TreeMap<number, string>();
plans.put(10, 'basic');
plans.put(25, 'pro');
console.log(plans.floorKey(30)); // → 25
```
