---
title: Collections
description: Static helpers for sorting, searching, shuffling and rotating lists, plus empty, singleton and adapter collections.
sidebar:
  order: 1
---

`Collections` is an object of static helpers that work on any `List`, `Set`, `Map`, `Queue` or `Deque` from this library,
including your own classes built on the [abstract skeletons](/collections/guides/custom-collections/). Every helper throws
`NullPointerException` when a collection argument is `null` or `undefined`.

| Method | Cost | Notes |
| --- | --- | --- |
| `sort(list, c?)` | O(n log n) | stable; omitted or `null` comparator means natural order |
| `reverse(list)`, `fill(list, v)` | O(n) | in place |
| `swap(list, i, j)` | O(1) on random access | `IndexOutOfBoundsException` for bad indices |
| `shuffle(list, rnd?)` | O(n) | Fisher–Yates; `rnd` is a `RandomSource` |
| `copy(dest, src)` | O(n) | overwrites the first `src.size()` slots; never grows `dest` |
| `rotate(list, d)` | O(n) | any integer `d`; a non-integer throws `IllegalArgumentException` |
| `binarySearch(list, key, c?)` | O(log n) comparisons | `-(insertionPoint) - 1` on a miss |
| `min` / `max(coll, c?)` | O(n) | first of tied elements wins; empty throws `NoSuchElementException` |
| `frequency(coll, o)` | O(n) | counts elements `Objects.equals` to `o` |
| `disjoint(c1, c2)` | O(n) with a hash set | `true` when no element is shared |
| `indexOfSubList` / `lastIndexOfSubList` | O(n·m) | `-1` if absent; an empty target matches at `0` / `size()` |
| `replaceAll(list, old, new)` | O(n) | returns whether anything changed |
| `addAll(c, ...elements)` | O(k) | returns whether `c` changed |
| `nCopies(n, o)` | O(1) | immutable, O(1) memory |
| `reverseOrder(c?)` | O(1) | shared instance for natural order |
| `empty*`, `EMPTY_*`, `singleton*` | O(1) | immutable |
| `emptyIterator` / `emptyListIterator` / `emptyEnumeration` | O(1) | |
| `enumeration(c)` / `list(e)` | O(1) / O(n) | |
| `asLifoQueue(deque)` | O(1) | live view |
| `newSetFromMap` / `newSequencedSetFromMap` | O(1) | the map must be empty |

## Sorting and reordering

`sort` calls `list.sort(c)`. Unlike `Array.prototype.sort` there is no string conversion, so numbers sort numerically.
`reverse`, `swap` and `fill` change the list in place. `copy` throws `IndexOutOfBoundsException` if `src` does not fit.

```ts
import { ArrayList, Collections, Comparator, List } from '@ylcnfrht/collections';

const nums = ArrayList.of(10, 9, 100, 1);
Collections.sort(nums);
console.log(nums); // → [1, 9, 10, 100]

// stable: words of equal length keep their original order
const words = ArrayList.of('pear', 'fig', 'kiwi', 'apple', 'yam');
Collections.sort(words, Comparator.comparing((w: string) => w.length));
console.log(words); // → [fig, yam, pear, kiwi, apple]

const l = ArrayList.of('a', 'b', 'c', 'd');
Collections.reverse(l);
Collections.swap(l, 0, 3);
console.log(l); // → [a, c, b, d]

const dest = ArrayList.of(1, 2, 3, 4);
Collections.copy(dest, List.of(9, 8));
console.log(dest); // → [9, 8, 3, 4]
```

`rotate(list, distance)` moves the element at index `i` to `(i + distance) mod size`. Positive rotates right, negative
left. Rotate a `subList` view to move a range.

```ts
import { ArrayList, Collections } from '@ylcnfrht/collections';

const l = ArrayList.of('a', 'b', 'c', 'd', 'e');
Collections.rotate(l, 2);
console.log(l); // → [d, e, a, b, c]
Collections.rotate(l, -7); // -7 mod 5 = 3
console.log(l); // → [a, b, c, d, e]

// move "d" (index 1) to the end of the range [1, 4)
const m = ArrayList.of('a', 'd', 'b', 'c', 'e');
Collections.rotate(m.subList(1, 4), -1);
console.log(m); // → [a, b, c, d, e]
```

### Reproducible shuffles

`shuffle(list, rnd?)` takes a `RandomSource`, which is either `() => number` returning a float in `[0, 1)` (like
`Math.random`, the default) or `{ nextInt(bound): number }` returning an integer in `[0, bound)`. Pass a seeded source
for shuffles you can reproduce in tests:

```ts
import { ArrayList, Collections } from '@ylcnfrht/collections';
import type { RandomSource } from '@ylcnfrht/collections';

// mulberry32: a tiny seeded PRNG returning floats in [0, 1)
function seeded(seed: number): RandomSource {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const a = ArrayList.of(1, 2, 3, 4, 5, 6, 7, 8);
const b = ArrayList.of(1, 2, 3, 4, 5, 6, 7, 8);
Collections.shuffle(a, seeded(42));
Collections.shuffle(b, seeded(42));
console.log(a.equals(b)); // → true

// the nextInt form: always picking index 0 rotates the list left by one
const c = ArrayList.of(1, 2, 3, 4, 5, 6);
Collections.shuffle(c, { nextInt: () => 0 });
console.log(c); // → [2, 3, 4, 5, 6, 1]
```

## Searching

`binarySearch(list, key, c?)` needs a list already sorted by `c` (natural order when omitted); on an unsorted list the
result is undefined. A hit returns the index (any one of several equal elements). A miss returns
`-(insertionPoint) - 1`, where the insertion point is the index of the first greater element, or `size()`. Every miss is
negative, and `-r - 1` (or `~r`) recovers the insertion point.

```ts
import { ArrayList, Collections, Comparator } from '@ylcnfrht/collections';

const sorted = ArrayList.of(10, 20, 30);
console.log(Collections.binarySearch(sorted, 20)); // → 1
console.log(Collections.binarySearch(sorted, 5)); // → -1
console.log(Collections.binarySearch(sorted, 25)); // → -3

// insert if absent, keeping the list sorted
const r = Collections.binarySearch(sorted, 25);
if (r < 0) sorted.add(-r - 1, 25);
console.log(sorted); // → [10, 20, 25, 30]

// a list sorted with a comparator needs the same comparator
const desc = ArrayList.of(30, 20, 10);
console.log(Collections.binarySearch(desc, 15, Comparator.reverseOrder())); // → -3
```

`min`/`max` scan any collection. `frequency` uses `Objects.equals`, so `null` and objects with `equals()` work.
`disjoint` asks a `Set` argument `contains()` when there is one; otherwise it iterates the smaller collection.

```ts
import { ArrayList, Collections, Comparator, HashSet, List } from '@ylcnfrht/collections';

const fruit = List.of('pear', 'fig', 'banana');
console.log(Collections.max(fruit)); // → pear
console.log(Collections.min(fruit, Comparator.comparing((s: string) => s.length))); // → fig

console.log(Collections.frequency(ArrayList.of<number | null>(1, null, 1, null), null)); // → 2
console.log(Collections.disjoint(List.of('alice', 'admin'), HashSet.of('root', 'admin'))); // → false

const seq = ArrayList.of(1, 2, 3, 1, 2, 3);
console.log(Collections.indexOfSubList(seq, List.of(2, 3))); // → 1
console.log(Collections.lastIndexOfSubList(seq, List.of(2, 3))); // → 4
```

The static `replaceAll(list, oldVal, newVal)` replaces equal elements; the instance method `list.replaceAll(fn)` maps
every element through a function.

```ts
import { ArrayList, Collections } from '@ylcnfrht/collections';

const tags = ArrayList.of('draft', 'ok', 'draft');
console.log(Collections.replaceAll(tags, 'draft', 'final')); // → true
console.log(tags); // → [final, ok, final]
console.log(Collections.addAll(tags, 'x', 'y'), tags.size()); // → true 5
```

## nCopies and reverseOrder

`nCopies(n, o)` is an immutable list of `o` repeated `n` times, stored as one value and a count. `n` must be a
non-negative integer; `nCopies(0, x)` is the shared empty list. `reverseOrder()` is the same shared instance as
`Comparator.reverseOrder()`, and `reverseOrder(reverseOrder(c)) === c`.

```ts
import { ArrayList, Collections, Comparator } from '@ylcnfrht/collections';

const grid = new ArrayList(Collections.nCopies(4, 0)); // a modifiable copy
grid.set(2, 7);
console.log(grid); // → [0, 0, 7, 0]

const l = ArrayList.of(3, 1, 2);
l.sort(Collections.reverseOrder());
console.log(l); // → [3, 2, 1]
console.log(Collections.reverseOrder() === Comparator.reverseOrder()); // → true
```

## Random access and LinkedList

Lists with O(1) `get(i)` carry the `RANDOM_ACCESS` brand (`ArrayList`, `Vector`, `Stack`, `List.of`, `nCopies`,
random-access `subList` views); `isRandomAccess(list)` checks it. The algorithms use indexed loops on branded lists and
list iterators (or one array copy) on others, so every helper stays O(n) on a `LinkedList` (O(n log n) for sort, and
`binarySearch` makes O(n) iterator moves but O(log n) comparisons).

```ts
import { ArrayList, Collections, LinkedList, isRandomAccess } from '@ylcnfrht/collections';

console.log(isRandomAccess(new ArrayList()), isRandomAccess(new LinkedList())); // → true false

const linked = new LinkedList<number>();
for (let i = 0; i < 100_000; i++) linked.add(i);
Collections.reverse(linked); // linear, not quadratic
Collections.rotate(linked, 1);
console.log(linked.getFirst(), linked.getLast()); // → 0 1
```

## Empty and singleton collections

Immutable and cheap; every mutator throws `UnsupportedOperationException`. Use them as return values callers cannot
modify.

| Factory | Returns | Notes |
| --- | --- | --- |
| `emptyList()`, `EMPTY_LIST` | `List<E>` | one shared instance; random access |
| `emptySet()`, `EMPTY_SET` | `Set<E>` | one shared instance |
| `emptyMap()`, `EMPTY_MAP` | `Map<K, V>` | one shared instance |
| `emptySortedSet()`, `emptyNavigableSet()` | `SortedSet` / `NavigableSet` | `lower`/`floor`/`ceiling`/`higher` return `null`; `pollFirst`/`pollLast` throw `UnsupportedOperationException` |
| `emptySortedMap()`, `emptyNavigableMap()` | `SortedMap` / `NavigableMap` | shared |
| `singletonList(o)`, `singleton(o)`, `singletonMap(k, v)` | one element or entry | `o` may be `null` |

`EMPTY_LIST`, `EMPTY_SET` and `EMPTY_MAP` are typed with `never`; call `emptyList<T>()` and its siblings for a specific
type. They return the same instances.

```ts
import { Collections, List } from '@ylcnfrht/collections';

function tagsOf(id: number): List<string> {
  return id > 0 ? List.of('a', 'b') : Collections.emptyList<string>();
}
console.log(tagsOf(0).isEmpty(), Collections.emptyList() === Collections.EMPTY_LIST); // → true true

const one = Collections.singletonList('only');
console.log(one.equals(List.of('only'))); // → true
try {
  one.set(0, 'x');
} catch (e) {
  console.log((e as Error).name); // → UnsupportedOperationException
}
```

`emptyIterator()`, `emptyListIterator()` and `emptyEnumeration()` iterate nothing; `next()` throws
`NoSuchElementException`. Use them in an `iterator()` implementation for an empty collection.

## Enumerations

`Enumeration` is the older iteration interface (`hasMoreElements()`, `nextElement()`) that `Vector` still offers.
`enumeration(c)` adapts any collection to it, `list(e)` drains the remaining elements into a new `ArrayList`, and
`e.asIterator()` turns it back into an `Iterator`.

```ts
import { Collections, List } from '@ylcnfrht/collections';

const e = Collections.enumeration(List.of('a', 'b', 'c'));
console.log(e.nextElement()); // → a
console.log(Collections.list(e)); // → [b, c]
```

## Adapters

`asLifoQueue(deque)` is a last-in, first-out `Queue` view of a deque: `add`/`offer` push at the front and
`poll`/`peek` read the front.

`newSetFromMap(map)` turns an empty map into a `Set` of its keys, so the set inherits the map's behaviour: identity
semantics from an `IdentityHashMap`, or eviction from an access-ordered `LinkedHashMap`. A non-empty map throws
`IllegalArgumentException`. `newSequencedSetFromMap(map)` does the same for a `SequencedMap` and returns a `SequencedSet`
(`addFirst`/`addLast` map to `putFirst`/`putLast`; `reversed()` is a live view).

```ts
import { ArrayDeque, Collections, IdentityHashMap } from '@ylcnfrht/collections';

const stack = Collections.asLifoQueue(new ArrayDeque<string>());
stack.add('first');
stack.add('second');
console.log(stack.poll(), stack.poll()); // → second first

class Key {
  constructor(readonly id: number) {}
  equals(o: unknown) {
    return o instanceof Key && o.id === this.id;
  }
  hashCode() {
    return this.id;
  }
}
// an identity set: two equal but distinct objects are both kept
const ids = Collections.newSetFromMap(new IdentityHashMap<Key, boolean>());
ids.add(new Key(1));
ids.add(new Key(1));
console.log(ids.size()); // → 2
```

## Wrappers

`unmodifiable*` (read-only views), `synchronized*` (the same API, no locking, kept for ported code) and `checked*`
(runtime element type checks) are covered in
[Immutable collections and wrappers](/collections/collections/immutable-and-wrappers/).
