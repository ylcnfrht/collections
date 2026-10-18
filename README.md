# ts-collections-framework

A production-grade collections framework for TypeScript and JS, inspired by **Java's Collections Framework and
Stream API**: `ArrayList`, `LinkedList`, `HashMap`, `TreeMap`, `PriorityQueue`, `Stream`, `Collectors` and the rest,
following the same interfaces and documented behaviour.

## Why

JS ships with `Map` and `Set`, which compare object keys by reference and stop there. There are no sorted
collections, no navigation and no priority queue. npm fills the gaps one data structure per package, each with its
own API and semantics. This library is one coherent framework instead. It has:

- value equality through `equals()`/`hashCode()`
- fail-fast iterators
- live views
- navigable sorted collections
- lazy, short-circuiting streams

## Install

```sh
npm install ts-collections-framework
```

Zero dependencies, ESM and CommonJS, full type definitions, Node 18+ and modern browsers.

## Example

```ts
import { ArrayList, HashMap, TreeMap, Collectors, List } from 'ts-collections-framework';

const words = ArrayList.of('pear', 'apple', 'fig', 'apple');

const byLength = words.stream()
  .distinct()
  .collect(Collectors.groupingBy((w) => w.length, () => new TreeMap<number, List<string>>(), Collectors.toList()));
console.log(byLength.toString()); // → {3=[fig], 4=[pear], 5=[apple]}

const counts = new HashMap<string, number>();
for (const w of words) counts.merge(w, 1, (a, b) => a + b);
console.log(counts.get('apple')); // → 2
```

## What's included

| | |
|---|---|
| Lists | `ArrayList`, `LinkedList`, `Vector`, `Stack` |
| Queues | `ArrayDeque`, `PriorityQueue` |
| Sets | `HashSet`, `LinkedHashSet`, `TreeSet` |
| Maps | `HashMap`, `LinkedHashMap` (LRU via `LinkedHashMap.lru(n)`), `TreeMap`, `IdentityHashMap` |
| Immutable | `List.of`, `Set.of`, `Map.of` and `copyOf` |
| Streams | `Stream`, `IntStream`, `LongStream`, `DoubleStream`, `Collectors`, `Gatherers`, `Optional` |
| Utilities | `Collections`, `Comparator`, `Objects`, `Spliterators`, and `Abstract*` bases for your own collections |

## Quality

- **Tested:** over 9,700 tests at about 99% coverage. Every documentation example runs in the test suite.
- **Verified against the JDK:** the same random operation scripts run on a real JDK and on this library. The latest
  run compared 1.69 million operations across every comparable public method and found
  [0 differences](docs/advanced/testing.md).
- **Fast:** benchmarked against native `Map`/`Set`/`Array` and popular libraries. Highlights:
  - integer-keyed `HashMap` is several times faster than native `Map`;
  - stream pipelines beat native array chains.

  See [Performance](docs/advanced/performance.md).

## Documentation

- [Getting started](docs/guide/getting-started.md)
- [Data structures primer](docs/guide/data-structures.md): what each structure is and how it stores data
- [Coming from JS](docs/guide/coming-from-js.md): `Array`/`Map`/`Set` side by side
- [Differences from the Java API](docs/advanced/compatibility.md), for example `removeAt(index)` and comparators as functions
- [All documentation](docs/README.md); API reference: `npm run docs:api`

## License

MIT
