# Introduction

`@nodestd/collections` is a collections framework for TypeScript and JavaScript, inspired by the Java Collections
Framework. It provides lists, queues, deques, sets and maps behind one set of interfaces, lazy streams with
collectors and gatherers, `Optional`, and the `Collections` utility class. It has zero runtime dependencies.

```ts
import { ArrayList, TreeMap, Collectors, List } from '@nodestd/collections';

const words = ArrayList.of('pear', 'fig', 'apple', 'kiwi');
// with new:
// const words = new ArrayList<string>();
// for (const w of ['pear', 'fig', 'apple', 'kiwi']) words.add(w);
const byLength = words.stream().collect(
  Collectors.groupingBy((w) => w.length, () => new TreeMap<number, List<string>>(), Collectors.toList()),
);
console.log(byLength.toString()); // → {3=[fig], 4=[pear, kiwi], 5=[apple]}
```

## Why this library

JavaScript ships two general-purpose collections, `Map` and `Set`. They compare object keys by reference, so two
equal `Point(1, 2)` keys are different keys. They have no sorted variants, no navigation (`floor`, `ceiling`, range
views), no priority queue and no deque, and modifying a collection during iteration does not fail.

The npm ecosystem covers these gaps one data structure at a time, each package with its own API and its own notion
of equality. This library provides a single framework instead: one set of interfaces that every implementation
honours, so a `List` behaves as a `List` whichever class backs it. Its semantics follow the Java Collections
Framework:

- **Value equality** through `equals()` and `hashCode()`.
- **Fail-fast iterators** that throw on concurrent modification.
- **Live views** such as `subList`, `keySet` and `headMap`.
- **Navigable sorted collections** with range and nearest-key queries.
- **Lazy, short-circuiting streams.**

It also fits JavaScript conventions: every collection is iterable, maps iterate as `[key, value]` pairs, and
comparators are plain functions.

Every documented behaviour is tested, and the library is verified against the JDK on over 1.6 million compared
operations ([Testing](./advanced/testing.md)). Benchmarks against native collections and popular alternatives are
in [Performance](./advanced/performance.md).

## Where to start

| Goal | Page |
|---|---|
| Install the package and write a first program | [Getting started](./guide/getting-started.md) |
| Learn what an `ArrayList`, deque, heap or tree map is | [Data structures primer](./guide/data-structures.md) |
| Understand equality, ordering, `null`, fail-fast iteration and views | [Core concepts](./guide/core-concepts.md) |
| Pick an implementation | [Choosing a collection](./guide/choosing-a-collection.md) |
| Translate `Array`, `Map` and `Set` idioms | [Coming from JS](./guide/coming-from-js.md) |
| Check where the API differs from the Java API | [Compatibility](./advanced/compatibility.md) |

## Contents

<DocsIndex />

<div class="github-only">

**Guide**

| Page | Contents |
|---|---|
| [Getting started](./guide/getting-started.md) | Installation, ESM and CommonJS imports, a quick tour, iteration, typing, bundlers, supported runtimes |
| [Data structures primer](./guide/data-structures.md) | What each structure is, when to use it, how it stores data, what it costs |
| [Core concepts](./guide/core-concepts.md) | Value equality, ordering, `null` policy, fail-fast iteration, live views, exceptions, unmodifiable vs immutable, sequenced collections, `RandomAccess` |
| [Choosing a collection](./guide/choosing-a-collection.md) | Decision flowchart and comparison tables with complexities |
| [Coming from JS](./guide/coming-from-js.md) | `Array`/`Map`/`Set` equivalents, array methods vs streams, interop, pitfalls |

**Collections**

| Page | Contents |
|---|---|
| [Lists](./collections/lists.md) | `List`, `ArrayList`, `LinkedList`, `Vector`, `Stack`, list iterators, `subList` |
| [Queues and deques](./collections/queues-and-deques.md) | `Queue`, `Deque`, `ArrayDeque`, `PriorityQueue`, `LinkedList` as a deque |
| [Sets](./collections/sets.md) | `Set`, `SequencedSet`, `SortedSet`, `NavigableSet`, `HashSet`, `LinkedHashSet`, `TreeSet` |
| [Maps](./collections/maps.md) | `Map`, `SequencedMap`, `SortedMap`, `NavigableMap`, `HashMap`, `LinkedHashMap` (LRU), `TreeMap`, `IdentityHashMap`, entries |
| [Immutable collections and wrappers](./collections/immutable-and-wrappers.md) | `List.of`/`Set.of`/`Map.of`, `copyOf`, `ofLazy`, empty and singleton collections, unmodifiable, synchronized and checked wrappers |

**Streams**

| Page | Contents |
|---|---|
| [Overview](./streams/overview.md) | Sources, laziness, short-circuiting, single use, closing |
| [Operations](./streams/operations.md) | Every intermediate and terminal operation |
| [Number streams](./streams/number-streams.md) | `IntStream`, `LongStream`, `DoubleStream`, summary statistics |
| [Collectors](./streams/collectors.md) | `Collectors.*` and custom `Collector`s |
| [Gatherers](./streams/gatherers.md) | `Gatherers.*` (windows, fold, scan) and custom `Gatherer`s |
| [Optional](./streams/optional.md) | `Optional`, `OptionalInt`, `OptionalLong`, `OptionalDouble` |
| [Spliterators](./streams/spliterators.md) | `Spliterator`, `Spliterators`, `StreamSupport` |

**Utilities**

| Page | Contents |
|---|---|
| [Collections](./utilities/collections.md) | The `Collections` utility class: sorting, searching, shuffling, wrappers, factories |
| [Comparator and Objects](./utilities/comparator-and-objects.md) | Comparator helpers, natural ordering, `Objects.equals`, `Objects.hash`, `Objects.requireNonNull` |

**Advanced**

| Page | Contents |
|---|---|
| [Custom collections](./advanced/custom-collections.md) | Building on `AbstractList`, `AbstractSet`, `AbstractMap` and the other skeletons |
| [Performance](./advanced/performance.md) | Complexities, benchmarks, tuning tips |
| [Testing](./advanced/testing.md) | How the library is tested and verified against the JDK |
| [Compatibility](./advanced/compatibility.md) | TypeScript adaptations, stream differences, how compatibility is verified |
| [Compatibility report](./COMPATIBILITY.md) | Generated report of the run against the JDK |

</div>

## The interface hierarchy

Solid arrows mean "extends". Dotted arrows point from a class to the most specific interface it implements.
Declare variables and parameters with the interfaces, and choose a class at construction time.

```mermaid
classDiagram
    direction TB
    class Collection { <<interface>> }
    class SequencedCollection { <<interface>> }
    class List { <<interface>> }
    class Queue { <<interface>> }
    class Deque { <<interface>> }
    class Set { <<interface>> }
    class SequencedSet { <<interface>> }
    class SortedSet { <<interface>> }
    class NavigableSet { <<interface>> }
    class Map { <<interface>> }
    class SequencedMap { <<interface>> }
    class SortedMap { <<interface>> }
    class NavigableMap { <<interface>> }

    Collection <|-- SequencedCollection
    Collection <|-- Queue
    Collection <|-- Set
    SequencedCollection <|-- List
    SequencedCollection <|-- Deque
    Queue <|-- Deque
    Set <|-- SequencedSet
    SequencedCollection <|-- SequencedSet
    SequencedSet <|-- SortedSet
    SortedSet <|-- NavigableSet
    Map <|-- SequencedMap
    SequencedMap <|-- SortedMap
    SortedMap <|-- NavigableMap

    List <|.. ArrayList
    List <|.. Vector
    Vector <|-- Stack
    List <|.. LinkedList
    Deque <|.. LinkedList
    Deque <|.. ArrayDeque
    Queue <|.. PriorityQueue
    Set <|.. HashSet
    HashSet <|-- LinkedHashSet
    SequencedSet <|.. LinkedHashSet
    NavigableSet <|.. TreeSet
    Map <|.. HashMap
    HashMap <|-- LinkedHashMap
    SequencedMap <|.. LinkedHashMap
    NavigableMap <|.. TreeMap
    Map <|.. IdentityHashMap
```

A class can be used through any interface it implements:

```ts
import { LinkedList, List, Deque, SequencedCollection } from '@nodestd/collections';

const ll = new LinkedList<number>();
const asList: List<number> = ll;
const asDeque: Deque<number> = ll;
const seq: SequencedCollection<number> = ll;
asDeque.push(2);
asList.add(3);
console.log(seq.getFirst(), seq.getLast(), ll.toString()); // → 2 3 [2, 3]
```

The rest of the type system:

| Group | Types |
|---|---|
| Immutable collections | `List.of`/`copyOf` (a `List`), `Set.of`/`copyOf` (a `Set`), `Map.of`/`copyOf`/`ofEntries` (a `Map`) |
| Skeletal implementations | `AbstractCollection`, `AbstractList`, `AbstractSequentialList`, `AbstractQueue`, `AbstractSet`, `AbstractMap` (see [Custom collections](./advanced/custom-collections.md)) |
| Iteration | `Iterator`, `ListIterator`, `Enumeration`, `Spliterator`; every collection is also a JS `Iterable` |
| Streams | `Stream`, `IntStream`, `LongStream`, `DoubleStream` (all `BaseStream`), `Collector`, `Gatherer`, `Optional*` |

## API reference

Every exported class, interface and function is documented in the TypeDoc API reference. Generate it locally and
open `docs-api/index.html`:

```sh
npm run docs:api
```
