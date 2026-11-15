---
title: Quick start
description: A tour of lists, sets, maps and streams, how to iterate collections, and how to type them.
sidebar:
  order: 3
---

Every collection prints with `toString()` in the `[a, b, c]` / `{k=v}` format used throughout these docs.

## Lists

```ts
import { ArrayList, List } from '@ylcnfrht/collections';

const list = new ArrayList<string>();
list.add('b');
list.add('c');
list.add(0, 'a');               // insert at an index
console.log(list.toString());   // → [a, b, c]
console.log(list.get(1));       // → b
console.log(list.indexOf('c')); // → 2

list.removeAt(0);               // remove by index...
list.remove('c');               // ...or by value
console.log(list.toString());   // → [b]

const fixed = List.of(1, 2, 3); // immutable
console.log(fixed.contains(2)); // → true
```

## Sets

```ts
import { HashSet, TreeSet, LinkedHashSet } from '@ylcnfrht/collections';

const seen = new HashSet<string>();
console.log(seen.add('x'));  // → true
console.log(seen.add('x'));  // → false

const sorted = TreeSet.of(5, 1, 3);
console.log(sorted.toString());            // → [1, 3, 5]
console.log(sorted.ceiling(2));            // → 3
console.log(sorted.headSet(3).toString()); // → [1]

const ordered = LinkedHashSet.of('z', 'a', 'm'); // keeps insertion order
console.log(ordered.toString());           // → [z, a, m]
```

## Maps

```ts
import { HashMap, TreeMap } from '@ylcnfrht/collections';

const ages = new HashMap<string, number>();
ages.put('ada', 36);
console.log(ages.get('ada'));                // → 36
console.log(ages.get('nobody'));             // → null
console.log(ages.getOrDefault('nobody', 0)); // → 0

const counts = new TreeMap<string, number>();
for (const w of ['b', 'a', 'b']) counts.merge(w, 1, (x, y) => x + y);
console.log(counts.toString()); // → {a=1, b=2}
console.log(counts.firstKey()); // → a
```

Missing keys return `null`, not `undefined`. See [Null and errors](/collections/concepts/null-and-errors/).

## Streams

Streams are lazy pipelines over a collection, array or iterable; collectors reduce a stream to a result.

```ts
import { List, Stream, IntStream, Collectors } from '@ylcnfrht/collections';

const words = List.of('apple', 'fig', 'banana', 'kiwi', 'cherry');

const longUpper = words.stream()
  .filter((w) => w.length > 4)
  .map((w) => w.toUpperCase())
  .toList();
console.log(longUpper.toString()); // → [APPLE, BANANA, CHERRY]

const byLength = words.stream().collect(Collectors.groupingBy((w) => w.length));
console.log(byLength.get(4)?.toString()); // → [kiwi]

console.log(words.stream().collect(Collectors.joining(', ', '<', '>'))); // → <apple, fig, banana, kiwi, cherry>
console.log(IntStream.rangeClosed(1, 5).sum());             // → 15
console.log(Stream.of(3, 1, 2).sorted().findFirst().get()); // → 1
```

More in [Streams overview](/collections/streams/overview/) and [Collectors](/collections/streams/collectors/).

## Iterating

Every collection is a JS iterable. Maps iterate as `[key, value]` pairs, and a map's `forEach` passes
`(key, value)`, the reverse of the JS `Map`.

```ts
import { ArrayList, LinkedHashMap } from '@ylcnfrht/collections';

const list = ArrayList.of(1, 2, 3);
for (const n of list) { /* for..of works on every collection */ }
list.forEach((n) => { /* fastest way to visit every element */ });
console.log([...list]);                       // → [ 1, 2, 3 ]
console.log(Array.from(list, (n) => n * 10)); // → [ 10, 20, 30 ]

const m = LinkedHashMap.of<string, number>(['a', 1], ['b', 2]);
for (const [k, v] of m) { /* k: string, v: number */ }
console.log([...m]); // → [ [ 'a', 1 ], [ 'b', 2 ] ]
m.forEach((k, v) => { /* key first */ });

// an explicit iterator can remove during iteration
const it = list.iterator();
while (it.hasNext()) if (it.next() === 2) it.remove();
console.log(list.toString()); // → [1, 3]
```

Iteration is fail-fast: adding or removing elements inside a `for..of` over the same collection throws
`ConcurrentModificationException`. Use `iterator().remove()` or `removeIf`. See
[Fail-fast iteration](/collections/concepts/iteration-and-views/#fail-fast-iteration).

## Typing collections

Declare variables and parameters with the interfaces (`List`, `Set`, `Map`, `Deque`, `NavigableMap`, ...) and choose
the implementation at construction time.

```ts
import { ArrayList, LinkedList, List, Deque, NavigableMap, TreeMap, Collection } from '@ylcnfrht/collections';

const todo: List<string> = new ArrayList<string>();
const queue: Deque<number> = new LinkedList<number>();
const index: NavigableMap<string, number> = new TreeMap<string, number>();

function total(c: Collection<number>): number {
  let sum = 0;
  for (const n of c) sum += n;
  return sum;
}

queue.offer(4);
queue.push(1);
console.log(total(queue)); // → 5
index.put('docs', 1);
console.log(index.ceilingKey('a')); // → docs
```

Factories infer type parameters from their arguments: `ArrayList.of(1, 2)` is an `ArrayList<number>`. Pass them
explicitly to empty constructors (`new HashMap<string, number>()`); otherwise TypeScript infers `unknown`.

Comparators are plain functions `(a, b) => number`:

```ts
import { TreeSet, Comparator } from '@ylcnfrht/collections';

interface User { name: string; age: number }
const byAge = new TreeSet<User>(Comparator.comparing((u: User) => u.age));
byAge.add({ name: 'b', age: 30 });
byAge.add({ name: 'a', age: 20 });
console.log(byAge.first().name); // → a
```
