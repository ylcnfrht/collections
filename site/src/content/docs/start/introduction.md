---
title: Introduction
description: A collections framework for TypeScript and JavaScript with lists, queues, sets, maps, lazy streams and value equality.
sidebar:
  order: 1
---

`@ylcnfrht/collections` is a collections framework for TypeScript and JavaScript, ported from the Java Collections
Framework and Stream API. It provides lists, queues, deques, sets and maps behind one set of interfaces, lazy streams
with collectors and gatherers, `Optional`, and the `Collections` utility class. It has zero runtime dependencies.

```ts
import { ArrayList, TreeMap, Collectors, List } from '@ylcnfrht/collections';

const words = ArrayList.of('pear', 'fig', 'apple', 'kiwi');
const byLength = words.stream().collect(
  Collectors.groupingBy((w) => w.length, () => new TreeMap<number, List<string>>(), Collectors.toList()),
);
console.log(byLength.toString()); // → {3=[fig], 4=[pear, kiwi], 5=[apple]}
```

## Why this library

JavaScript's `Map` and `Set` compare object keys by reference, have no sorted variants, no navigation (`floor`,
`ceiling`, range views), no priority queue or deque, and do not fail when modified during iteration. This library
fills those gaps with one set of interfaces that every implementation honours:

- **Value equality** through `equals()` and `hashCode()`, so a list or your own class works as a map key.
- **Sorted, navigable collections**: `TreeMap` and `TreeSet` with `floor`, `ceiling`, range views and descending order.
- **Live views** such as `subList`, `keySet`, `headMap` and `reversed()`.
- **Fail-fast iterators** that throw on concurrent modification.
- **Lazy, short-circuiting streams**: `Stream`, `Collectors` and `Gatherers`.

It also follows JavaScript conventions: every collection is iterable, maps iterate as `[key, value]` pairs, and
comparators are plain functions. Behaviour is verified against a real JDK on over 1.6 million compared operations
(see [Compatibility](/collections/reference/compatibility/)).

## The interface hierarchy

Declare variables and parameters with the interfaces, and choose a class at construction time.

```text
Collection
├── SequencedCollection
│   ├── List ............... ArrayList, LinkedList, Vector, Stack
│   ├── Deque .............. ArrayDeque, LinkedList    (Deque also extends Queue)
│   └── SequencedSet ....... LinkedHashSet             (SequencedSet also extends Set)
│       └── SortedSet
│           └── NavigableSet ... TreeSet
├── Queue .................. PriorityQueue
└── Set .................... HashSet

Map ........................ HashMap, IdentityHashMap
└── SequencedMap ........... LinkedHashMap
    └── SortedMap
        └── NavigableMap ... TreeMap
```

A class can be used through any interface it implements:

```ts
import { LinkedList, List, Deque, SequencedCollection } from '@ylcnfrht/collections';

const ll = new LinkedList<number>();
const asList: List<number> = ll;
const asDeque: Deque<number> = ll;
const seq: SequencedCollection<number> = ll;
asDeque.push(2);
asList.add(3);
console.log(seq.getFirst(), seq.getLast(), ll.toString()); // → 2 3 [2, 3]
```

| Group | Types |
|---|---|
| Immutable collections | `List.of`/`copyOf` (a `List`), `Set.of`/`copyOf` (a `Set`), `Map.of`/`copyOf`/`ofEntries` (a `Map`) |
| Skeletal implementations | `AbstractCollection`, `AbstractList`, `AbstractSequentialList`, `AbstractQueue`, `AbstractSet`, `AbstractMap` (see [Custom collections](/collections/guides/custom-collections/)) |
| Iteration | `Iterator`, `ListIterator`, `Enumeration`, `Spliterator`; every collection is also a JS `Iterable` |
| Streams | `Stream`, `IntStream`, `LongStream`, `DoubleStream` (all `BaseStream`), `Collector`, `Gatherer`, `Optional*` |
