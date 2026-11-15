---
title: Coming from JS
description: Built-in Array, Map and Set idioms and array methods translated to this library, plus interop and common pitfalls.
sidebar:
  order: 5
---

Each table maps a built-in idiom to its equivalent here. The differences that cause bugs are at the end.

## Array to ArrayList

| JS `Array` | This library | Note |
|---|---|---|
| `[1, 2]` | `ArrayList.of(1, 2)` | `List.of(1, 2)` for an immutable list |
| `a.length` | `list.size()` | a method |
| `a[i]` / `a[i] = x` | `list.get(i)` / `list.set(i, x)` | out of range throws `IndexOutOfBoundsException`; `set` returns the old value |
| `a.push(x)` / `a.unshift(x)` | `list.add(x)` / `list.addFirst(x)` | `add` returns `true` |
| `a.pop()` / `a.shift()` | `list.removeLast()` / `list.removeFirst()` | throw on empty |
| `a.at(-1)` / `a[0]` | `list.getLast()` / `list.getFirst()` | |
| `a.splice(i, 1)` / `a.splice(i, n)` | `list.removeAt(i)` / `list.subList(i, i + n).clear()` | |
| `a.includes(x)` / `a.indexOf(x)` | `list.contains(x)` / `list.indexOf(x)` | value equality |
| `a.slice(i, j)` | `list.subList(i, j)` | a **view**; copy with `new ArrayList(list.subList(i, j))` |
| `a.reverse()` | `Collections.reverse(list)` (in place) or `list.reversed()` (view) | |
| `a.sort(cmp)` | `list.sort(cmp)` / `list.sort(null)` | stable; `null` = natural order (numeric for numbers) |
| `a.filter(p)` / `a.map(f)` in place | `list.removeIf((x) => !p(x))` / `list.replaceAll(f)` | |
| `a.length = 0` / `a.concat(b)` | `list.clear()` / `list.addAll(b)` (in place) | |

```ts
import { ArrayList, Collections } from '@ylcnfrht/collections';

const a = ArrayList.of(30, 10, 20);
a.add(40);                        // push
a.addFirst(0);                    // unshift
console.log(a.size(), a.get(1));  // → 5 30
a.sort(null);                     // numeric natural order
console.log(a.toString());        // → [0, 10, 20, 30, 40]
a.subList(1, 3).clear();          // splice(1, 2)
console.log(a.toString());        // → [0, 30, 40]
Collections.reverse(a);
console.log(a.toString());        // → [40, 30, 0]
```

## Map to HashMap, LinkedHashMap and TreeMap

A JS `Map` keeps insertion order, like `LinkedHashMap`. `HashMap` guarantees no order; `TreeMap` sorts by key.

| JS `Map` | This library | Note |
|---|---|---|
| `new Map([[k, v]])` | `HashMap.of([k, v])`, `LinkedHashMap.of(...)`, `Map.of(k, v, ...)` (immutable) | |
| `m.get(k)` | `m.get(k)` | `null` when missing, not `undefined` |
| `m.get(k) ?? d` | `m.getOrDefault(k, d)` | |
| `m.set(k, v)` | `m.put(k, v)` | returns the previous value or `null` |
| `if (!m.has(k)) m.set(k, v)` | `m.putIfAbsent(k, v)` | |
| `m.set(k, (m.get(k) ?? 0) + 1)` | `m.merge(k, 1, (a, b) => a + b)` | |
| `if (!m.has(k)) m.set(k, []); m.get(k).push(x)` | `m.computeIfAbsent(k, () => new ArrayList())!.add(x)` | typed `V \| null` |
| `m.has(k)` / `m.delete(k)` | `m.containsKey(k)` / `m.remove(k)` | `remove` returns the value or `null` |
| `m.size` | `m.size()` | |
| `m.keys()` / `m.values()` / `m.entries()` | `m.keySet()` / `m.values()` / `m.entrySet()` | live views; entries have `getKey()`/`getValue()`/`setValue()` |
| `m.forEach((v, k) => ...)` | `m.forEach((k, v) => ...)` | **key first** |

```ts
import { HashMap, TreeMap, ArrayList, List } from '@ylcnfrht/collections';

const words = ['bee', 'ant', 'bat', 'cow', 'ape'];

const byLetter = new TreeMap<string, List<string>>();
for (const w of words) byLetter.computeIfAbsent(w[0], () => new ArrayList<string>())!.add(w);
console.log(byLetter.toString()); // → {a=[ant, ape], b=[bee, bat], c=[cow]}

const lengths = new HashMap<string, number>();
for (const w of words) lengths.merge(w[0], w.length, (x, y) => x + y);
console.log(lengths.get('b'), lengths.get('z')); // → 6 null
```

## Set to HashSet, LinkedHashSet and TreeSet

A JS `Set` keeps insertion order, like `LinkedHashSet`. Bulk operations mutate the receiver, so copy first.

| JS `Set` | This library | Note |
|---|---|---|
| `new Set([1, 2])` | `HashSet.of(1, 2)`, `LinkedHashSet.of(...)`, `TreeSet.of(...)`, `Set.of(...)` (immutable) | `Set.of` throws on duplicates |
| `s.add(x)` | `s.add(x)` | returns `true` if added, not the set |
| `s.has(x)` / `s.delete(x)` | `s.contains(x)` / `s.remove(x)` | value equality |
| `a.union(b)` / `a.intersection(b)` / `a.difference(b)` | `copy.addAll(b)` / `copy.retainAll(b)` / `copy.removeAll(b)` | |
| `a.isSubsetOf(b)` | `b.containsAll(a)` | |

```ts
import { TreeSet } from '@ylcnfrht/collections';

const a = TreeSet.of(1, 2, 3, 4);
const b = TreeSet.of(3, 4, 5);
const union = new TreeSet(a); union.addAll(b);
const inter = new TreeSet(a); inter.retainAll(b);
const diff = new TreeSet(a); diff.removeAll(b);
console.log(union.toString(), inter.toString(), diff.toString()); // → [1, 2, 3, 4, 5] [3, 4] [1, 2]
```

## Array methods to streams

Streams are lazy: nothing runs until a terminal operation (`toList`, `collect`, `reduce`, `forEach`, `findFirst`,
...), they stop early when they can, and a stream can be consumed only once.

| Array method | Stream | Note |
|---|---|---|
| `a.filter(p)` / `a.map(f)` | `.filter(p)` / `.map(f)` | `mapToInt`/`mapToDouble` for `sum()`, `average()` |
| `a.flatMap(f)` | `.flatMap((x) => Stream.of(...f(x)))` | the function returns a **stream** |
| `a.reduce(f, init)` / `a.reduce(f)` | `.reduce(init, f)` / `.reduce(f)` | identity first; the second returns an `Optional` |
| `a.find(p)` | `.filter(p).findFirst()` | `Optional`; `.orElse(null)` to unwrap |
| `a.findIndex(p)` | `IntStream.range(0, n).filter((i) => p(list.get(i))).findFirst()` | |
| `a.some(p)` / `a.every(p)` | `.anyMatch(p)` / `.allMatch(p)` | also `noneMatch` |
| `[...a].sort(c)` | `.sorted(c)` / `.sorted()` | stable; natural order by default |
| `a.slice(i, j)` | `.skip(i).limit(j - i)` | |
| `[...new Set(a)]` | `.distinct()` | value equality |
| `a.length` | `.count()` | |
| `Math.max(...a)` | `.max(cmp)` / `mapToInt(...).max()` | `Optional` / `OptionalInt` |
| `Object.groupBy(a, f)` | `.collect(Collectors.groupingBy(f))` | |
| `a.join(s)` | `.collect(Collectors.joining(s))` | elements must be strings |
| `Array.from({ length: n }, (_, i) => f(i))` | `IntStream.range(0, n).mapToObj(f)` | |

```ts
import { List, Stream, IntStream, Collectors, Comparator } from '@ylcnfrht/collections';

const nums = List.of(5, 3, 8, 1, 9, 2);

console.log(nums.stream().filter((n) => n % 2 === 1).map((n) => n * 10).toList().toString()); // → [50, 30, 10, 90]
console.log(nums.stream().reduce(0, (a, b) => a + b));                  // → 28
console.log(nums.stream().filter((n) => n > 6).findFirst().orElse(-1)); // → 8
console.log(nums.stream().sorted().skip(1).limit(3).toList().toString()); // → [2, 3, 5]
console.log(nums.stream().max(Comparator.naturalOrder()).get());        // → 9
console.log(Stream.of('a b', 'c').flatMap((s) => Stream.of(...s.split(' '))).toList().toString()); // → [a, b, c]
console.log(IntStream.range(0, 4).mapToObj((i) => i * i).collect(Collectors.toList()).toString()); // → [0, 1, 4, 9]
console.log(nums.stream().map(String).collect(Collectors.joining('-'))); // → 5-3-8-1-9-2
```

See [Stream operations](/collections/streams/operations/) and [Collectors](/collections/streams/collectors/).

## Object and array keys

A JS `Map` compares keys by identity, so composite keys get serialized into strings. Here any object with `equals()`
and `hashCode()`, including every list, set, map and entry the library provides, works as a key directly. Plain
arrays have no `equals()` and still compare by identity. `Date`s compare by time.

```ts
import { HashMap, List } from '@ylcnfrht/collections';

const grid = new HashMap<List<number>, string>();
grid.put(List.of(1, 2), 'cell');
console.log(grid.get(List.of(1, 2))); // → cell

const arrays = new HashMap<number[], string>();
arrays.put([1, 2], 'cell');
console.log(arrays.get([1, 2])); // → null
```

For your own key classes see [Writing equals and hashCode](/collections/concepts/equality/#writing-equals-and-hashcode).

## Interop

Every collection is iterable and every map iterates as `[key, value]` pairs, so built-ins accept them directly.

| Goal | Code |
|---|---|
| collection to array | `[...c]`, `Array.from(c)`, `c.toArray()` |
| collection to typed array | `c.toArray((n) => new Float64Array(n))` |
| map to JS `Map` / plain object | `new globalThis.Map(m)` / `Object.fromEntries(m)` |
| array to list | `ArrayList.of(...arr)`, `List.of(...arr)` |
| JS `Map` or object to map | `HashMap.of(...jsMap)`, `LinkedHashMap.of(...Object.entries(obj))` |
| iterable to stream | `Stream.from(iterable)`, `Stream.ofArray(arr)` |

```ts
import { ArrayList, LinkedHashMap, Stream } from '@ylcnfrht/collections';

const typed = ArrayList.of(1.5, 2.5).toArray((n) => new Float64Array(n));
console.log(typed instanceof Float64Array, typed.length); // → true 2

const m = LinkedHashMap.of<string, number>(...Object.entries({ x: 1, y: 2 }));
console.log(m.toString());                   // → {x=1, y=2}
console.log(Object.fromEntries(m));          // → { x: 1, y: 2 }
console.log(new globalThis.Map(m).get('y')); // → 2

console.log(Stream.from(new globalThis.Set([3, 4])).map((n) => n * 2).toList().toString()); // → [6, 8]
```

## Common pitfalls

- **Imported `Set` and `Map` shadow the built-ins.** Alias them; see
  [Name clashes with built-ins](/collections/start/installation/#name-clashes-with-built-ins).
- **`remove(x)` removes by value; `removeAt(i)` removes by index.** On a `List<number>`, `remove(1)` removes the
  value `1`.
- **`get` returns `null`, not `undefined`.** `?? fallback` still works; `=== undefined` checks do not. Use
  `containsKey` when `null` is a stored value.
- **`for..of` is fail-fast.** Changing a collection inside a loop over it throws `ConcurrentModificationException`;
  use `iterator().remove()` or `removeIf` (below).
- **Natural order sorts numbers numerically.** `[10, 9, 1].sort()` gives `1, 10, 9`; `list.sort(null)` and
  `.sorted()` give `1, 9, 10`.
- **`size()` and `isEmpty()` are methods**, and a map's `forEach` passes `(key, value)`.
- **`subList`, `keySet` and the other views write through** to the original; see
  [Live views](/collections/concepts/iteration-and-views/#live-views).

```ts
import { ArrayList, HashMap } from '@ylcnfrht/collections';

const l = ArrayList.of(10, 1, 20);
l.remove(1);   // the value 1
l.removeAt(1); // the element at index 1
console.log(l.toString()); // → [10]

const m = HashMap.of<string, number>(['a', 1], ['b', 2], ['c', 3]);
try {
  for (const [k, v] of m) if (v > 1) m.remove(k);
} catch (e) {
  console.log((e as Error).name); // → ConcurrentModificationException
}
m.entrySet().removeIf((e) => e.getValue() > 1);
console.log(m.toString()); // → {a=1}
```
