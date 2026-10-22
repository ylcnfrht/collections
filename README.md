# @nodestd/collections

[![npm](https://img.shields.io/npm/v/@nodestd/collections.svg)](https://www.npmjs.com/package/@nodestd/collections)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/types-TypeScript-3178c6.svg)
![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)
![Runtimes](https://img.shields.io/badge/runs%20on-Node%2018%2B%20%7C%20Deno%20%7C%20Bun%20%7C%20browsers-555.svg)

**A production-grade collections framework for TypeScript and JavaScript, inspired by the Java Collections
Framework.**

Lists, queues, sets, maps and lazy streams with one consistent API: `ArrayList`, `LinkedList`, `HashMap`, `TreeMap`,
`PriorityQueue`, `Stream`, `Collectors` and the rest, following the same interfaces and documented behaviour.

**Documentation: [nodestd.github.io/collections](https://nodestd.github.io/collections/)**

## Why

JavaScript ships with `Array`, `Map` and `Set`. They compare object keys by reference and stop there: there are no
sorted collections, no navigation, no priority queue and no lazy streams. npm fills the gaps one data structure per
package, each with its own API and semantics.

`@nodestd/collections` is one coherent framework instead:

- **Value equality:** collections compare elements with `equals()`/`hashCode()`, so a list, or any object that defines
  `equals()`, works as a map key.
- **Sorted and navigable collections:** `TreeMap` and `TreeSet` with `floor`, `ceiling`, range views and descending order.
- **Live views:** `subList`, `keySet`, `headMap` and `reversed()` read and write through to the backing collection.
- **Fail-fast iterators:** modifying a collection while iterating it throws instead of silently skipping elements.
- **Lazy, short-circuiting streams:** `Stream`, `Collectors` and `Gatherers`, evaluated only as far as needed.

## Installation

```sh
npm install @nodestd/collections
```

Zero dependencies, ESM and CommonJS builds, and full type definitions.

## Quick start

```ts
import { ArrayList, HashMap, TreeMap, LinkedHashMap, Collectors, List } from '@nodestd/collections';

// Value equality: two lists with the same elements are equal, so they work as map keys
const routes = new HashMap<List<number>, string>();
routes.put(List.of(1, 2), 'route A');
console.log(routes.get(List.of(1, 2))); // → route A

// A sorted map with navigation
const plans = new TreeMap<number, string>();
plans.put(10, 'basic');
plans.put(25, 'pro');
plans.put(50, 'team');
console.log(plans.floorKey(30));            // → 25
console.log(plans.headMap(25).toString());  // → {10=basic}

// An LRU cache in one line
const cache = LinkedHashMap.lru<string, number>(2);
cache.put('a', 1);
cache.put('b', 2);
cache.get('a');
cache.put('c', 3); // evicts the least recently used entry, 'b'
console.log(cache.keySet().toString()); // → [a, c]

// Streams and collectors
const words = ArrayList.of('pear', 'apple', 'fig', 'apple');
// with new:
// const words = new ArrayList<string>();
// for (const w of ['pear', 'apple', 'fig', 'apple']) words.add(w);
const byLength = words.stream()
  .distinct()
  .collect(Collectors.groupingBy((w) => w.length, () => new TreeMap<number, List<string>>(), Collectors.toList()));
console.log(byLength.toString()); // → {3=[fig], 4=[pear], 5=[apple]}
```

## What's included

| Area | Types |
|---|---|
| Lists | `ArrayList`, `LinkedList`, `Vector`, `Stack` |
| Queues | `ArrayDeque`, `PriorityQueue` |
| Sets | `HashSet`, `LinkedHashSet`, `TreeSet` |
| Maps | `HashMap`, `LinkedHashMap` (with LRU via `LinkedHashMap.lru(n)`), `TreeMap`, `IdentityHashMap` |
| Immutable | `List.of`, `Set.of`, `Map.of`, `copyOf` |
| Streams | `Stream`, `IntStream`, `LongStream`, `DoubleStream`, `Collectors`, `Gatherers`, `Optional` |
| Utilities | `Collections`, `Comparator`, `Objects`, `Spliterators`, and `Abstract*` base classes for your own collections |

## Quality

- **Tested:** over 10,000 tests at about 99% line coverage. Every example in the documentation runs as a test.
- **Verified against the JDK:** the same random operation scripts run on a real JDK and on this library. The latest
  run compared 1.69 million operations across every comparable public method and found
  [0 library differences](docs/advanced/testing.md); the remaining ones are documented design choices or places
  where the JDK breaks its own specification.
- **Fast:** benchmarked against native `Map`/`Set`/`Array` and popular libraries. `HashMap` with small integer keys
  (ids, indices) is several times faster than a native `Map`, and stream pipelines beat native array chains.
  See [Performance](docs/advanced/performance.md).

## Coming from Java

The API follows the Java Collections Framework closely, with a few adaptations for TypeScript:

- `list.remove(int)` is `list.removeAt(index)`, because on a `List<number>` the two overloads cannot be told apart.
- Comparators are plain functions `(a, b) => number`; helpers live on the `Comparator` object.
- Absent results are `null`, never `undefined`.

The full list is in [Differences from the Java API](docs/advanced/compatibility.md).

## Documentation

- [Getting started](docs/guide/getting-started.md)
- [Data structures primer](docs/guide/data-structures.md): what each structure is and how it stores data
- [Choosing a collection](docs/guide/choosing-a-collection.md)
- [Coming from JS](docs/guide/coming-from-js.md): `Array`/`Map`/`Set` side by side
- [All documentation](docs/README.md); API reference: `npm run docs:api`

## Contributing

```sh
npm ci
npm run typecheck
npm test
npm run test:diff   # compares against a real JDK; needs JDK 23 or later on the PATH
```

## License

[MIT](LICENSE). `@nodestd` is an independent project, not affiliated with Node.js, Oracle or OpenJDK. Java is a
trademark of Oracle and/or its affiliates.
