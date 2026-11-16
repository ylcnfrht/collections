---
title: Iteration and views
description: Fail-fast iterators, live views such as subList and keySet, the sequenced-collection methods for both ends, and the RandomAccess marker.
sidebar:
  order: 4
---

## Fail-fast iteration

Every collection counts its structural modifications (adds and removes, not `set`; `ArrayList` and `Vector` also
count `sort` and `replaceAll`). An iterator records the count when created and checks it on every step. If the
collection changed through anything other than that iterator, the next step throws
`ConcurrentModificationException` instead of silently skipping or repeating elements. This covers `for..of`, spread,
`iterator()`, `forEach`, streams and views.

```ts
import { ArrayList } from '@ylcnfrht/collections';

const list = ArrayList.of('a', 'b', 'c');
try {
  for (const s of list) if (s === 'a') list.add('x');
} catch (e) {
  console.log((e as Error).name); // → ConcurrentModificationException
}

// safe ways to remove while iterating
const it = list.iterator();
while (it.hasNext()) if (it.next() === 'b') it.remove(); // the iterator's own remove
list.removeIf((s) => s === 'x');                        // or a bulk operation
console.log(list.toString()); // → [a, c]
```

Fail-fast detection is a debugging aid, not a guarantee: code must not depend on the exception being thrown.

## Live views

Many methods return a **view**: it implements the collection interface but stores nothing, reading from and writing
to the backing collection. Changes go both ways and nothing is copied.

| View | From |
|---|---|
| `subList(from, to)` | `List` |
| `reversed()` | every sequenced collection and map |
| `keySet()`, `values()`, `entrySet()` (and `sequenced*` variants) | `Map` |
| `headSet`/`tailSet`/`subSet`, `descendingSet()` | `NavigableSet` |
| `headMap`/`tailMap`/`subMap`, `descendingMap()`, `navigableKeySet()` | `NavigableMap` |
| `Collections.unmodifiable*`, `synchronized*`, `checked*` | any collection |

```ts
import { ArrayList, TreeMap } from '@ylcnfrht/collections';

const list = ArrayList.of('a', 'b', 'c', 'd');
const middle = list.subList(1, 3);
middle.set(0, 'B');             // writes through
middle.clear();                 // removes B and c from list
console.log(list.toString());   // → [a, d]

list.reversed().addFirst('z');  // adds at the END of list
console.log(list.toString());   // → [a, d, z]

const prices = new TreeMap<string, number>();
['apple', 'banana', 'cherry'].forEach((k, i) => prices.put(k, i));
const early = prices.headMap('cherry');  // keys < 'cherry'
prices.put('avocado', 9);                // later changes show up in the view
console.log(early.keySet().toString());  // → [apple, avocado, banana]
prices.keySet().remove('apple');         // removing a key removes the mapping
console.log(prices.toString());          // → {avocado=9, banana=1, cherry=2}
```

- A `subList` stays valid only while the backing list is changed through it. A structural change made directly to the
  backing list makes the sub-list's next use throw `ConcurrentModificationException`.
- Sorted views have a range. Adding a key outside it (for example `headMap('c').put('x', ...)`) throws
  `IllegalArgumentException`.

For an independent copy, use a copy constructor (`new ArrayList(view)`) or `List.copyOf(view)`.

## Sequenced collections

Collections with a defined encounter order implement `SequencedCollection` (lists, deques, `LinkedHashSet`,
`TreeSet`) or `SequencedMap` (`LinkedHashMap`, `TreeMap`), which share one vocabulary for both ends:

| Collections | Maps |
|---|---|
| `getFirst()`, `getLast()` | `firstEntry()`, `lastEntry()` |
| `addFirst(e)`, `addLast(e)` | `putFirst(k, v)`, `putLast(k, v)` |
| `removeFirst()`, `removeLast()` | `pollFirstEntry()`, `pollLastEntry()` |
| `reversed()` | `reversed()`, `sequencedKeySet()`, `sequencedValues()`, `sequencedEntrySet()` |

On an empty collection the collection methods throw `NoSuchElementException`; the map methods return `null`. Sorted
collections place elements themselves, so `addFirst`/`addLast` (and `putFirst`/`putLast` on `TreeMap`) throw
`UnsupportedOperationException`.

```ts
import { ArrayList, LinkedHashSet, LinkedHashMap, TreeSet, SequencedCollection } from '@ylcnfrht/collections';

function ends<E>(c: SequencedCollection<E>): string {
  return `${c.getFirst()}..${c.getLast()}`;
}
console.log(ends(ArrayList.of(1, 2, 3)));      // → 1..3
console.log(ends(LinkedHashSet.of('x', 'y'))); // → x..y
console.log(ends(TreeSet.of(9, 4, 7)));        // → 4..9

const m = LinkedHashMap.of<string, number>(['a', 1], ['b', 2]);
m.putFirst('z', 0);
console.log(m.toString());                  // → {z=0, a=1, b=2}
console.log(m.reversed().toString());       // → {b=2, a=1, z=0}
console.log(m.pollLastEntry()?.toString()); // → b=2

try {
  TreeSet.of(1).addFirst(0);
} catch (e) {
  console.log((e as Error).name); // → UnsupportedOperationException
}
```

## RandomAccess

Lists whose `get(index)` is O(1) (`ArrayList`, `Vector`, `Stack`, the immutable lists, ...) carry the `RandomAccess`
marker; `LinkedList` does not. Generic algorithms such as `Collections.binarySearch` and `shuffle` use it to choose
an index loop or an iterator walk. Check it with `isRandomAccess`:

```ts
import { ArrayList, LinkedList, List, isRandomAccess } from '@ylcnfrht/collections';

function middle<E>(list: List<E>): E {
  if (isRandomAccess(list)) return list.get(list.size() >> 1); // O(1)
  const it = list.listIterator();                               // walk once
  for (let i = 0; i < list.size() >> 1; i++) it.next();
  return it.next();
}
console.log(isRandomAccess(ArrayList.of(1)), isRandomAccess(LinkedList.of(1))); // → true false
console.log(middle(LinkedList.of('a', 'b', 'c'))); // → b
```

To mark your own list, add `readonly [RANDOM_ACCESS] = true as const` (see
[Custom collections](/guides/custom-collections/)).
