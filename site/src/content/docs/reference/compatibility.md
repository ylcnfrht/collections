---
title: Compatibility
description: Where the library differs from the Java Collections Framework and Stream API, what it leaves out, and how it is verified.
sidebar:
  order: 1
---

The library follows the Java Collections Framework and Stream API: the same method names, results, exceptions and edge
cases. This page lists every deliberate difference. The generated [compatibility report](/reference/compatibility-report/) has
the raw results of the differential tests.

## TypeScript adaptations

| Java API | Here | Why |
|---|---|---|
| `list.remove(int index)` | `list.removeAt(index)` | On a `List<number>`, `remove(1)` would be ambiguous; `remove(o)` always means "the element equal to `o`". |
| `Comparator` default methods (`c.reversed()`, `c.thenComparing(…)`) | functions on the `Comparator` object: `Comparator.reversed(c)`, `Comparator.thenComparing(c1, c2)`, `Comparator.thenComparingBy(c, key)` | Comparators are plain functions `(a, b) => number`. |
| Functional interfaces (`Predicate`, `Function`, `Supplier`, …) | plain functions | `Predicate.not(p)` becomes `(x) => !p(x)`. |
| `Set`, `Map`, `Iterator`, `List` | same names | They shadow the JS globals in a module that imports them; alias (`import { Map as CMap }`) or use `globalThis.Map`. |
| `new TreeMap(SortedMap)` vs `new TreeMap(Map)`; likewise `TreeSet`, `PriorityQueue` | one constructor; a sorted source always keeps its comparator | The runtime type decides, since static types are gone at run time. |
| `Gatherer.ofSequential(a, b)` | resolved by the first function's arity | A first function with no parameters is the initializer (`ofSequential(initializer, integrator)`); otherwise it is `ofSequential(integrator, finisher)`. Use `Integrator.ofGreedy` or the 3-argument form if your integrator declares no parameters. |
| try-with-resources on streams | `close()`, plus `[Symbol.dispose]()` so `using s = …` works | Present where the runtime defines `Symbol.dispose`. |
| `List.of`, `Set.of`, `Map.of`, `Map.entry` | same, on the `List`/`Set`/`Map` objects | They are both interfaces and factory objects. |
| absent results | `null`, never `undefined` | Collections that reject `null` also reject `undefined`. |
| — | `ArrayList.of(...)`, `HashMap.of([k, v], …)`, `Stream.from(iterable)`, `Stream.ofArray(arr)`, `[Symbol.iterator]` on every collection and stream | JS conveniences. |

```ts
import { Downstream, Gatherer, Integrator, List, Map, Stream, TreeMap } from '@ylcnfrht/collections';

// a sorted source keeps its comparator, even typed as a plain Map
const desc = new TreeMap<number, string>((a, b) => b - a);
desc.put(1, 'one');
desc.put(2, 'two');
const asMap: Map<number, string> = desc;
console.log(new TreeMap<number, string>(asMap).toString()); // → {2=two, 1=one}

// () => state: an initializer, so ofSequential(initializer, integrator)
const runningSum = Gatherer.ofSequential(
  () => ({ sum: 0 }),
  Integrator.ofGreedy((s: { sum: number }, x: number, down: Downstream<number>) => down.push((s.sum += x))),
);
console.log(Stream.of(1, 2, 3).gather(runningSum).toList().toString()); // → [1, 3, 6]

// (state, element, downstream) => …: an integrator, so ofSequential(integrator, finisher)
const withEnd = Gatherer.ofSequential(
  (_s: null, x: string, down: Downstream<string>) => down.push(x),
  (_s: null, down: Downstream<string>) => {
    down.push('END');
  },
);
console.log(Stream.of('a', 'b').gather(withEnd).toList().toString()); // → [a, b, END]

let closed = false;
{
  using s = List.of(1, 2, 3).stream().onClose(() => {
    closed = true;
  });
  console.log(s.count()); // → 3
}
console.log(closed); // → true
```

## When a callback throws

`removeIf` follows the JDK when the predicate throws or modifies the collection: `ArrayList` and `Vector` test every
element first and remove nothing; `LinkedList` removes as it goes, so earlier removals stay. These calls differ:

| Call | JDK | Here |
|---|---|---|
| `Vector.subList(…).removeIf` | removes as it goes | tests first, removes nothing on a throw (like `ArrayList.subList`) |
| `reversed().removeAll`/`retainAll` | removes through the view, testing in view order | one `removeIf` on the base, in base order (linear, not quadratic), so a different subset is removed when `contains` throws |
| `Collections.sort`/`List.sort` with a throwing comparator | may leave the list partly sorted | leaves it unchanged |

## Stream differences

| Topic | JDK | Here |
|---|---|---|
| `parallel()` / `parallelStream()` | runs on a thread pool | sets the flag only (`isParallel()` is `true`); evaluation is sequential, with the same results |
| `Gatherers.mapConcurrent` | maps ahead on virtual threads | maps sequentially, in order; same results and exception types |
| `LongStream` | 64-bit `long` | JS `number`, exact up to 2^53 − 1; no `bigint` |
| `IntStream` | 32-bit, wraps on overflow | values are not coerced to 32 bits; `sum()` does not wrap |
| spliterator sizes | `Long.MAX_VALUE` when unknown | `Infinity` when unknown |
| `-0` vs `0` | distinct doubles | `DoubleStream.distinct()`/`sorted()` keep them apart; everywhere else (`Stream.distinct`, sets, maps, `equals`) `-0` equals `0` |
| `iterator()`/`spliterator()` over `flatMap` | buffers the whole mapped stream | pulls one element at a time (an infinite inner stream still yields); an upstream `peek` may see fewer elements |

```ts
import { DoubleStream, IntStream, Stream } from '@ylcnfrht/collections';

console.log(IntStream.of(2147483647, 1).sum()); // → 2147483648
console.log(Stream.iterate(1, (x) => x + 1).spliterator().estimateSize()); // → Infinity
console.log(DoubleStream.of(0, -0).distinct().count(), Stream.of(0, -0).distinct().count()); // → 2 1
```

## JDK quirks not copied

The differential tests found places where the JDK contradicts its own documented contract. The library follows the
documentation:

| JDK behaviour | Contract, and what this library does |
|---|---|
| `HashMap`/`HashSet` spliterators drop `SIZED` from `characteristics()` after traversal begins (also through `synchronizedSet`, `unmodifiableSet`, `checkedSet`) | characteristics must be stable; `SIZED` is kept |
| the `ListIterator` of a `reversed()` list view accepts `set()`/`remove()` right after `add()` | `IllegalStateException`, as `ListIterator` specifies |
| `ArrayList.subList(…).replaceAll` ignores a structural change of the list since the view was made | `ConcurrentModificationException`: sublists are fail-fast |
| `reversed()` of an unmodifiable or synchronized sorted set/map: `add` of a present element returns `true`, and `compute`/`merge` may run before the write is refused | `UnsupportedOperationException` up front, with set semantics kept |

## APIs newer than the JDK

These are newer than the JDK used by the differential tests. They are implemented from their specification and
unit-tested, but not differentially compared:

| API | What it does |
|---|---|
| `List.ofLazy(size, fn)`, `Set.ofLazy(candidates, fn)`, `Map.ofLazy(keys, fn)` | unmodifiable collections whose elements or values are computed on first access, at most once (preview API) |
| `Comparator.max(c, a, b)`, `Comparator.min(c, a, b)` | the greater or lesser of two values under a comparator |

```ts
import { List } from '@ylcnfrht/collections';

let calls = 0;
const squares = List.ofLazy(5, (i) => (calls++, i * i));
console.log(squares.get(3), squares.get(3), calls); // → 9 9 1
```

## Not included

| Not included | Why | Use instead |
| --- | --- | --- |
| concurrent collections (`ConcurrentHashMap`, `CopyOnWriteArrayList`, `ConcurrentLinkedQueue`, …) | your code runs on one thread, and workers receive copies, not shared objects | the regular classes |
| blocking queues (`BlockingQueue`, `ArrayBlockingQueue`, `DelayQueue`, …) | a single thread cannot block waiting for another | `ArrayDeque` or `PriorityQueue` with promises or events |
| `WeakHashMap` | a `WeakMap` cannot be iterated and `WeakRef` gives no timing guarantee, so size, iteration and views would be unpredictable | a native `WeakMap` for lookups only |
| `EnumSet`, `EnumMap` | JS has no enum type with a fixed, ordered set of constants | `TreeSet`/`TreeMap` or `HashSet`/`HashMap` over the enum's values |
| `Hashtable`, `Dictionary`, `Properties` | legacy, superseded by `HashMap` | `HashMap` |
| `BitSet` | not a collection | a typed array such as `Uint32Array` |
| `Serializable` | JS has no binary object serialization | `toArray()` or `[...map]`, then `JSON.stringify` |

The `synchronized*` wrappers exist so ported code compiles; they add no locking. See
[Wrappers](/collections/immutable-and-wrappers/#wrappers).

## How it is verified

Every interface and class was audited member by member against the Java API documentation. The test suite (about
10,200 tests) then checks behaviour in several layers:

| Layer | What it checks |
| --- | --- |
| contract suites | shared behavioural tests (fail-fast iteration, iterator state rules, exceptions, cross-type equality, live views, `toString`, spliterator characteristics, a 100k scale check) run against every implementation and every view (`subList`, `descendingSet`, `subMap`, `reversed`, …) |
| model-based random tests | seeded random operations on each non-trivial structure and on a trivially correct model (a sorted array, a JS array, a native `Map`/`Set`), compared after every step |
| conformance suite | tests written from the Java API documentation, often quoting the sentence they check |
| differential testing | random operation scripts run on a real JDK and on this library, compared after every operation |
| doctests | every `ts` example on this site runs and must print what it claims |

**Differential testing.** A seeded generator writes scripts against every concrete collection, the immutable and empty
factories, subclasses of each `Abstract*` skeleton, views and wrappers (often nested), stream pipelines, and the
utility classes. A JDK runner and a TypeScript runner print each result, thrown exception class and the collection's
state after every operation. Documented normalisations cover legitimate differences (one JS number type, `-0`, hash
iteration order). Each divergence is shrunk to a minimal script and must be classified as intentional or a JDK quirk; an
unclassified one fails the run. The latest proof run compared 1,692,438 operations from 200,000 scripts, covered every
comparable public API member, and found no library bug. See the [report](/reference/compatibility-report/) for the numbers and
each divergence.

**Coverage.** About 99% of lines; CI fails below 95% statements, lines and functions or 90% branches.

To run it yourself (the differential harness needs JDK 23 or newer on `PATH`, and skips itself without one):

```sh
npm test                  # unit, contract, model-based, conformance, doctests, differential smoke test
npm run test:cov          # the same, with coverage thresholds
npm run test:diff         # 20,000 differential scripts
npm run test:diff:proof   # 200,000 scripts plus API coverage; regenerates the compatibility report
```
