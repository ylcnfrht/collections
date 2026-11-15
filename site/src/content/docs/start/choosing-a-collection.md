---
title: Choosing a collection
description: Which list, queue, set or map class to use, with ordering, null handling and operation costs side by side.
sidebar:
  order: 4
---

Start with `ArrayList`, `HashMap` and `HashSet`, and switch only when you need something they lack. Code written
against the interfaces does not change when you switch.

## Decision guide

| You need | Use |
|---|---|
| **Maps:** fast lookup by key, any order | `HashMap` |
| insertion order, access order or an LRU cache | `LinkedHashMap` |
| sorted keys, `floorKey`/`ceilingKey`, range views | `TreeMap` |
| keys compared by identity (`===`) instead of `equals()` | `IdentityHashMap` |
| contents fixed after creation | `Map.of` / `Map.copyOf` |
| **Sets:** fast membership tests, any order | `HashSet` |
| insertion order | `LinkedHashSet` |
| sorted order, `floor`/`ceiling`, range views | `TreeSet` |
| contents fixed after creation | `Set.of` / `Set.copyOf` |
| **Sequences:** access by index, appending, sorting | `ArrayList` |
| inserts or removals at a position reached with a `ListIterator` | `LinkedList` |
| a FIFO queue (`offer`/`poll`) or a LIFO stack (`push`/`pop`) | `ArrayDeque` |
| the smallest (or largest) element first | `PriorityQueue` |
| contents fixed after creation | `List.of` / `List.copyOf` |

`Vector` and `Stack` are legacy classes; prefer `ArrayList` and `ArrayDeque`. `LinkedList` is rarely faster than
`ArrayList`, and its `get(i)` is O(n).

:::caution
Iteration order of `HashMap`, `HashSet`, `IdentityHashMap`, `Set.of` and `Map.of` is unspecified. Do not let program
output depend on it.
:::

## Comparison tables

n is the collection size. "Amortized" means occasionally O(n) when the backing array grows. Hash costs assume
well-distributed `hashCode()` values.

### Lists

| Class | `null` | `get(i)` | `add(e)` at end | `add(i, e)` / `removeAt(i)` | `contains` |
|---|---|---|---|---|---|
| `ArrayList` | yes | O(1) | O(1) amortized | O(n) | O(n) |
| `LinkedList` | yes | O(n) | O(1) | O(1) at an iterator, O(n) to get there | O(n) |
| `Vector`, `Stack` | yes | O(1) | O(1) amortized | O(n) | O(n) |
| `List.of` / `copyOf` | **no** | O(1) | immutable | immutable | O(n) |

### Queues and deques

| Class | Order | `null` | `offer` | `poll` | `peek` | `contains` / `remove(o)` |
|---|---|---|---|---|---|---|
| `ArrayDeque` | FIFO / LIFO | **no** | O(1) amortized | O(1) | O(1) | O(n) |
| `LinkedList` | FIFO / LIFO | yes | O(1) | O(1) | O(1) | O(n) |
| `PriorityQueue` | head = smallest | **no** | O(log n) | O(log n) | O(1) | O(n) |

### Sets

| Class | Iteration order | `null` | `add` / `remove` / `contains` |
|---|---|---|---|
| `HashSet` | unspecified | yes | O(1) |
| `LinkedHashSet` | insertion | yes | O(1) |
| `TreeSet` | sorted | **no** (unless the comparator handles it) | O(log n) |
| `Set.of` / `copyOf` | unspecified | **no** | `contains` O(1); immutable |

### Maps

| Class | Iteration order | `null` keys / values | `get` / `put` / `remove` / `containsKey` |
|---|---|---|---|
| `HashMap` | unspecified | yes / yes | O(1) |
| `LinkedHashMap` | insertion (or access) | yes / yes | O(1) |
| `TreeMap` | sorted by key | **no** / yes | O(log n) |
| `IdentityHashMap` | unspecified | yes / yes | O(1) |
| `Map.of` / `copyOf` | unspecified | **no** / **no** | `get` / `containsKey` O(1); immutable |

`containsValue` is O(n) on every map. Iterating any collection is O(n).

JS runs application code on one thread, so there is no thread-safe variant to choose. The
`Collections.synchronized*` wrappers exist for API compatibility and only delegate; `parallelStream()` runs
sequentially (see [Compatibility](/collections/reference/compatibility/)). Measured numbers are in
[Benchmarks](/collections/benchmarks/).

## Common picks in code

```ts
import { ArrayDeque, PriorityQueue, LinkedHashMap, TreeMap, LinkedHashSet, Comparator } from '@ylcnfrht/collections';

// FIFO queue and LIFO stack
const jobs = new ArrayDeque<string>();
jobs.offer('a');
jobs.offer('b');
console.log(jobs.poll()); // → a
const undo = new ArrayDeque<string>();
undo.push('type');
undo.push('delete');
console.log(undo.pop()); // → delete

// priority: largest first
const urgent = new PriorityQueue<number>(Comparator.reverseOrder<number>());
[3, 10, 7].forEach((n) => urgent.offer(n));
console.log(urgent.poll()); // → 10

// LRU cache that keeps the 2 most recently used entries
const cache = LinkedHashMap.lru<string, number>(2);
cache.put('a', 1);
cache.put('b', 2);
cache.get('a');      // touch a
cache.put('c', 3);   // evicts b
console.log(cache.toString()); // → {a=1, c=3}

// which bracket does a value fall in?
const tax = new TreeMap<number, string>();
tax.put(0, 'low');
tax.put(10_000, 'mid');
tax.put(50_000, 'high');
console.log(tax.floorEntry(23_500)?.getValue()); // → mid

// de-duplicate, keeping first-seen order
const unique = new LinkedHashSet<string>();
['b', 'a', 'b', 'c', 'a'].forEach((s) => unique.add(s));
console.log(unique.toString()); // → [b, a, c]
```

Full APIs: [Lists](/collections/collections/lists/), [Queues and deques](/collections/collections/queues-and-deques/),
[Sets](/collections/collections/sets/), [Maps](/collections/collections/maps/),
[Immutable collections and wrappers](/collections/collections/immutable-and-wrappers/).
