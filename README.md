# ts-collections-framework

The classic collections framework API — `ArrayList`, `LinkedList`, `HashMap`, `TreeMap`, `PriorityQueue`,
`Stream`, `Collectors` and the rest — for TypeScript and JS, with the same semantics: value
equality through `equals()`/`hashCode()`, fail-fast iterators, live views, navigable sorted collections
and lazy streams.

```ts
import { ArrayList, HashMap, TreeMap, Collectors, Comparator, List } from 'ts-collections-framework';

const words = ArrayList.of('pear', 'apple', 'fig', 'apple');

const byLength = words.stream()
  .distinct()
  .collect(Collectors.groupingBy((w) => w.length, () => new TreeMap<number, List<string>>(), Collectors.toList()));
console.log(byLength.toString()); // → {3=[fig], 4=[pear], 5=[apple]}

const counts = new HashMap<string, number>();
for (const w of words) counts.merge(w, 1, (a, b) => a + b);
console.log(counts.get('apple')); // → 2

words.sort(Comparator.comparing((w: string) => w.length));
```

- Zero dependencies, ESM + CommonJS, full type definitions, Node 18+ and browsers.
- Every collection is iterable (`for..of`, spread, `Array.from`); maps iterate as `[key, value]` pairs, so `new globalThis.Map(myHashMap)` works.

## Install

```sh
npm install ts-collections-framework
```

## What's included

| Kind | Classes |
|---|---|
| Lists | `ArrayList`, `LinkedList`, `Vector`, `Stack`, immutable `List.of` / `List.copyOf` |
| Queues | `ArrayDeque`, `PriorityQueue`, `LinkedList` (also a `Deque`) |
| Sets | `HashSet`, `LinkedHashSet`, `TreeSet`, immutable `Set.of` |
| Maps | `HashMap`, `LinkedHashMap` (insertion/access order, LRU via `LinkedHashMap.lru(n)`), `TreeMap`, `IdentityHashMap`, immutable `Map.of` |
| Streams | `Stream`, `IntStream`, `LongStream`, `DoubleStream`, `Collectors`, `Gatherers`, `StreamSupport` |
| Utilities | `Collections` (sort, binarySearch, shuffle, unmodifiable/checked/synchronized wrappers, …), `Objects`, `Comparator`, `Optional*`, `Spliterators`, summary statistics |
| Skeletons | `AbstractCollection`, `AbstractList`, `AbstractSequentialList`, `AbstractQueue`, `AbstractSet`, `AbstractMap` for your own implementations |

Interfaces: `Collection`, `SequencedCollection`, `List`, `Queue`, `Deque`, `Set`, `SequencedSet`, `SortedSet`,
`NavigableSet`, `Map`, `SequencedMap`, `SortedMap`, `NavigableMap`, `Iterator`, `ListIterator`, `Spliterator`, …

## Semantics

- **Equality** — `contains`, `indexOf`, map lookups and so on use `equals()`/`hashCode()` when an element defines
  them, `Date`s compare by time, everything else uses SameValueZero (like JS `Map`/`Set`: `NaN` equals `NaN`,
  `0` equals `-0`). Hash codes follow the classic formulas (`31 * h + …`, string hash, etc.).
- **Ordering** — natural ordering uses `compareTo()` when defined, otherwise numbers, strings, bigints,
  booleans and `Date`s; anything else throws `ClassCastException`.
- **Fail-fast** — structurally modifying a collection while iterating it (including `for..of`) throws
  `ConcurrentModificationException`.
- **Live views** — `subList`, `reversed()`, `keySet`/`values`/`entrySet`, `headMap`/`tailMap`/`subMap`,
  `descendingMap`… write through to the backing collection.
- **Exceptions** — `IndexOutOfBoundsException`, `NoSuchElementException`, `NullPointerException`,
  `IllegalArgumentException`, `IllegalStateException`, `UnsupportedOperationException`,
  `ConcurrentModificationException`, `ClassCastException`, … all extend `RuntimeException` (an `Error`) and
  carry a stable `name`.
- **Absent values are `null`** — `get`, `poll`, `peek`, `firstKey`-style navigation return `null` when there is
  nothing. Where a collection rejects nulls, `undefined` is rejected too.

### Adapting to TypeScript

A few names and shapes differ because TypeScript can't express them otherwise:

| Classic API | Here | Why |
|---|---|---|
| `list.remove(int index)` | `list.removeAt(index)` | `remove(index)` and `remove(element)` can't be told apart on a `List<number>` |
| `Comparator` object with default methods | a function `(a, b) => number`; helpers on `Comparator` (`Comparator.comparing`, `Comparator.reversed(c)`, `Comparator.thenComparing(c1, c2)`, …) | lambdas are plain functions |
| Functional interfaces (`Predicate`, `Function`, `Supplier`, …) | plain functions | same |
| `Set`, `Map`, `Iterator` interface names | same names | they shadow the JS globals when imported — alias them if you need both (`import { Map as JMap } …`) or use `globalThis.Map` |
| `new TreeMap(sortedMap)` vs `new TreeMap(map)` | a sorted source always keeps its comparator | overloads can't be chosen at run time |
| `Gatherer.ofSequential(a, b)` | resolved by the functions' arity | both overloads take two functions; use `Integrator.ofGreedy` or the 3-argument form if ambiguous |

### Streams

Streams are lazy, single-use and short-circuiting, with a push-based engine. Differences:

- `parallel()` / `parallelStream()` only set the flag — evaluation is sequential (results are identical).
- `LongStream` uses JS numbers (exact up to `Number.MAX_SAFE_INTEGER`), not `bigint`.
- `IntStream` does not coerce values to 32-bit integers and `sum()` doesn't wrap on overflow.
- Spliterator sizes are numbers; an unknown size is `Infinity`.
- `DoubleStream.distinct()`/`sorted()` distinguish `-0.0` from `0.0`, like the reference; elsewhere `-0` equals `0`.
- JS extras: `Stream.from(iterable)`, `Stream.ofArray(array)`, and streams are iterable.

### Iteration speed

`for..of` over a collection is fail-fast, which costs a little per element. When you need maximum speed,
use `forEach` (on `ArrayList` it is faster than a native array's `forEach`) or a stream.

## Compatibility evidence

- Every interface is checked against the reference API documentation; each documented behaviour has tests
  (over 9,000, ~99% coverage), including a black-box conformance suite written from the documentation alone.
- `npm run test:diff` runs thousands of random operation sequences on a real reference runtime (if one is
  installed) and on this library, and compares every result.

## Performance

Measured with `npm run bench` against native `Array`/`Map`/`Set`, Node's Iterator helpers and popular
libraries (js-sdsl, mnemonist, @datastructures-js). Highlights (ratios, higher is better for us; numbers vary by machine):

| | vs |
|---|---|
| `HashMap` get/put on integer keys | 4–10× native `Map` |
| `LinkedHashMap.lru(n)` cache | 2× mnemonist `LRUMap` |
| `stream().filter().map()` sums | ~9× native array chains, ~10× Iterator helpers |
| `PriorityQueue` heap sort / churn | fastest of js-sdsl, mnemonist, @datastructures-js |
| `TreeMap` navigation | 1.8–2.9× js-sdsl `OrderedMap` |

Run `npm run bench [name]` to reproduce on your machine.

## Scripts

| Command | |
|---|---|
| `npm test` | unit, contract and conformance tests |
| `npm run typecheck` | type-check sources and tests |
| `npm run build` | ESM + CJS + type definitions into `dist/` |
| `npm run bench [filter]` | benchmarks |
| `npm run test:diff` | differential tests against a reference runtime |

## License

MIT
