# Coming from JS

This page maps built-in `Array`, `Map` and `Set` idioms to their equivalents in this library, translates array
methods to streams, and covers interop and common pitfalls. For an introduction to deques, heaps and tree maps, see
the [Data structures primer](./data-structures.md).

## Array to ArrayList

| JS `Array` | This library | Note |
|---|---|---|
| `[]` / `[1, 2]` | `new ArrayList<number>()` / `ArrayList.of(1, 2)` | `List.of(1, 2)` for an immutable list |
| `a.length` | `list.size()` | a method |
| `a[i]` | `list.get(i)` | throws `IndexOutOfBoundsException` instead of returning `undefined` |
| `a[i] = x` | `list.set(i, x)` | returns the old value |
| `a.push(x)` | `list.add(x)` | returns `true` |
| `a.unshift(x)` | `list.addFirst(x)` or `list.add(0, x)` | |
| `a.pop()` / `a.shift()` | `list.removeLast()` / `list.removeFirst()` | throw on empty |
| `a.at(-1)` / `a[0]` | `list.getLast()` / `list.getFirst()` | |
| `a.splice(i, 1)` | `list.removeAt(i)` | |
| `a.splice(i, n)` | `list.subList(i, i + n).clear()` | via a live view |
| `a.includes(x)` / `a.indexOf(x)` | `list.contains(x)` / `list.indexOf(x)` | value equality |
| `a.slice(i, j)` | `list.subList(i, j)` | a **view**, not a copy; use `new ArrayList(list.subList(i, j))` to copy |
| `a.reverse()` | `Collections.reverse(list)` (in place) or `list.reversed()` (view) | |
| `a.sort(cmp)` | `list.sort(cmp)` / `list.sort(null)` | stable; `null` = natural order (numeric for numbers) |
| `a.filter(p)` in place | `list.removeIf((x) => !p(x))` | |
| `a.map(f)` in place | `list.replaceAll(f)` | |
| `a.length = 0` | `list.clear()` | |
| `a.concat(b)` | `list.addAll(other)` (in place) | |
| `a.join(', ')` | `list.stream().map(String).collect(Collectors.joining(', '))` | |

```ts
import { ArrayList, Collections } from '@ylcnfrht/typescript-collection-framework';

const a = ArrayList.of(30, 10, 20);
// with new:
// const a = new ArrayList<number>();
// a.add(30);
// a.add(10);
// a.add(20);
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

A JS `Map` keeps insertion order, like `LinkedHashMap`. `HashMap` guarantees no order. `TreeMap` sorts by key.

| JS `Map` | This library | Note |
|---|---|---|
| `new Map()` | `new HashMap<K, V>()` / `new LinkedHashMap<K, V>()` / `new TreeMap<K, V>()` | |
| `new Map([[k, v]])` | `HashMap.of([k, v])`, `LinkedHashMap.of(...)`, `Map.of(k, v, …)` (immutable) | |
| `m.get(k)` | `m.get(k)` | `null` when missing, not `undefined` |
| `m.get(k) ?? d` | `m.getOrDefault(k, d)` | |
| `m.set(k, v)` | `m.put(k, v)` | returns the previous value or `null` |
| `if (!m.has(k)) m.set(k, v)` | `m.putIfAbsent(k, v)` | |
| `m.set(k, (m.get(k) ?? 0) + 1)` | `m.merge(k, 1, (a, b) => a + b)` | |
| `if (!m.has(k)) m.set(k, []); m.get(k).push(x)` | `m.computeIfAbsent(k, () => new ArrayList())!.add(x)` | returns `V \| null` in the typings |
| `m.has(k)` | `m.containsKey(k)` | also `containsValue(v)` |
| `m.delete(k)` | `m.remove(k)` | returns the removed value or `null` |
| `m.size` | `m.size()` | |
| `m.keys()` / `m.values()` / `m.entries()` | `m.keySet()` / `m.values()` / `m.entrySet()` | live views; entries have `getKey()`/`getValue()`/`setValue()` |
| `for (const [k, v] of m)` | `for (const [k, v] of m)` | same |
| `m.forEach((v, k) => …)` | `m.forEach((k, v) => …)` | **key first** |

```ts
import { HashMap, TreeMap, ArrayList, List } from '@ylcnfrht/typescript-collection-framework';

const words = ['bee', 'ant', 'bat', 'cow', 'ape'];

const byLetter = new TreeMap<string, List<string>>();
for (const w of words) byLetter.computeIfAbsent(w[0], () => new ArrayList<string>())!.add(w);
console.log(byLetter.toString()); // → {a=[ant, ape], b=[bee, bat], c=[cow]}

const lengths = new HashMap<string, number>();
for (const w of words) lengths.merge(w.slice(0, 1), w.length, (x, y) => x + y);
console.log(lengths.get('b'), lengths.get('z')); // → 6 null
```

## Set to HashSet, LinkedHashSet and TreeSet

A JS `Set` keeps insertion order, like `LinkedHashSet`.

| JS `Set` | This library | Note |
|---|---|---|
| `new Set([1, 2])` | `HashSet.of(1, 2)`, `LinkedHashSet.of(…)`, `TreeSet.of(…)`, `Set.of(…)` (immutable) | `Set.of` throws on duplicates |
| `s.add(x)` | `s.add(x)` | returns `true` if added (not the set) |
| `s.has(x)` | `s.contains(x)` | value equality |
| `s.delete(x)` | `s.remove(x)` | |
| `s.size` | `s.size()` | |
| `a.union(b)` (new set) | `copy.addAll(b)` | bulk operations mutate the receiver |
| `a.intersection(b)` | `copy.retainAll(b)` | |
| `a.difference(b)` | `copy.removeAll(b)` | |
| `a.isSubsetOf(b)` | `b.containsAll(a)` | |

```ts
import { TreeSet } from '@ylcnfrht/typescript-collection-framework';

const a = TreeSet.of(1, 2, 3, 4);
// with new:
// const a = new TreeSet<number>();
// for (const x of [1, 2, 3, 4]) a.add(x);
const b = TreeSet.of(3, 4, 5);

const union = new TreeSet(a); union.addAll(b);
const inter = new TreeSet(a); inter.retainAll(b);
const diff = new TreeSet(a); diff.removeAll(b);
console.log(union.toString(), inter.toString(), diff.toString()); // → [1, 2, 3, 4, 5] [3, 4] [1, 2]
console.log(a.containsAll(inter)); // → true
```

## Array methods to streams

Streams are lazy: nothing runs until a *terminal* operation (`toList`, `collect`, `reduce`, `forEach`,
`findFirst`, …), and they stop early when they can. A stream can be consumed only once.

| Array method | Stream | Note |
|---|---|---|
| `a.filter(p)` | `.filter(p)` | |
| `a.map(f)` | `.map(f)` | `mapToInt`/`mapToDouble` for number streams with `sum()`, `average()` |
| `a.flatMap(f)` | `.flatMap((x) => Stream.of(...f(x)))` | the function returns a **stream** |
| `a.reduce(f, init)` | `.reduce(init, f)` | identity first |
| `a.reduce(f)` | `.reduce(f)` | returns an `Optional` |
| `a.find(p)` | `.filter(p).findFirst()` | `Optional`; `.orElse(null)` to unwrap |
| `a.findIndex(p)` | `IntStream.range(0, n).filter((i) => p(list.get(i))).findFirst()` | |
| `a.some(p)` / `a.every(p)` | `.anyMatch(p)` / `.allMatch(p)` | also `noneMatch` |
| `a.includes(x)` | `.anyMatch((y) => Objects.equals(x, y))` | or `collection.contains(x)` |
| `[...a].sort(c)` | `.sorted(c)` / `.sorted()` | stable; natural order by default |
| `a.slice(i, j)` | `.skip(i).limit(j - i)` | |
| `[...new Set(a)]` | `.distinct()` | value equality |
| `a.length` | `.count()` | |
| `a.forEach(f)` | `.forEach(f)` | |
| `Math.max(...a)` | `.max(cmp)` / `mapToInt(…).max()` | `Optional` / `OptionalInt` |
| `Object.groupBy(a, f)` | `.collect(Collectors.groupingBy(f))` | |
| `a.join(s)` | `.collect(Collectors.joining(s))` | elements must be strings |
| `Array.from({ length: n }, (_, i) => f(i))` | `IntStream.range(0, n).mapToObj(f)` | |

```ts
import { List, Stream, IntStream, Collectors, Comparator } from '@ylcnfrht/typescript-collection-framework';

const nums = List.of(5, 3, 8, 1, 9, 2);

console.log(nums.stream().filter((n) => n % 2 === 1).map((n) => n * 10).toList().toString()); // → [50, 30, 10, 90]
console.log(nums.stream().reduce(0, (a, b) => a + b));           // → 28
console.log(nums.stream().filter((n) => n > 6).findFirst().orElse(-1)); // → 8
console.log(nums.stream().anyMatch((n) => n > 8), nums.stream().allMatch((n) => n > 0)); // → true true
console.log(nums.stream().sorted().skip(1).limit(3).toList().toString()); // → [2, 3, 5]
console.log(nums.stream().max(Comparator.naturalOrder()).get());  // → 9
console.log(Stream.of('a b', 'c').flatMap((s) => Stream.of(...s.split(' '))).toList().toString()); // → [a, b, c]
console.log(IntStream.range(0, 4).mapToObj((i) => i * i).collect(Collectors.toList()).toString()); // → [0, 1, 4, 9]
console.log(nums.stream().map(String).collect(Collectors.joining('-'))); // → 5-3-8-1-9-2
```

Full reference: [Streams overview](../streams/overview.md), [Stream operations](../streams/operations.md),
[Collectors](../streams/collectors.md).

## Object and array keys

A JS `Map` compares keys by identity, so a composite key must be serialized into a string. In this library, any
object with `equals()` and `hashCode()`, including every list, set, map and entry the library provides, works as a
key directly.

```ts
import { HashMap, List } from '@ylcnfrht/typescript-collection-framework';

// JS: identity, so this lookup misses
const native = new globalThis.Map<number[], string>();
native.set([1, 2], 'cell');
console.log(native.get([1, 2])); // → undefined

// here: a List is compared by content
const grid = new HashMap<List<number>, string>();
grid.put(List.of(1, 2), 'cell');
console.log(grid.get(List.of(1, 2))); // → cell

// plain arrays have no equals(): identity, as in JS
const arrays = new HashMap<number[], string>();
arrays.put([1, 2], 'cell');
console.log(arrays.get([1, 2])); // → null
```

Use `List.of(...)` (or your own class with `equals`/`hashCode`, see
[Core concepts](./core-concepts.md#writing-your-own-equals-hashcode-and-compareto)) for composite keys. Dates
compare by time out of the box.

## Interop

Every collection is iterable and every map iterates as `[key, value]` pairs, so the built-ins accept them directly.

| Goal | Code |
|---|---|
| collection → array | `[...c]`, `Array.from(c)`, `c.toArray()` |
| collection → typed array | `c.toArray((n) => new Float64Array(n))` |
| map → JS `Map` | `new globalThis.Map(myMap)` |
| map → plain object | `Object.fromEntries(myMap)` |
| array → list | `ArrayList.of(...arr)`, `List.of(...arr)` |
| JS `Map`/`Set`/iterable → stream | `Stream.from(iterable)`, `Stream.ofArray(arr)` |
| JS `Map` → map | `HashMap.of(...jsMap)` / `LinkedHashMap.of(...jsMap)` |
| object → map | `HashMap.of(...Object.entries(obj))` |

```ts
import { ArrayList, LinkedHashMap, HashSet, Stream } from '@ylcnfrht/typescript-collection-framework';

const list = ArrayList.of(1.5, 2.5);
console.log([...list], list.toArray());           // → [ 1.5, 2.5 ] [ 1.5, 2.5 ]
const typed = list.toArray((n) => new Float64Array(n));
console.log(typed instanceof Float64Array, typed.length); // → true 2

const m = LinkedHashMap.of<string, number>(...Object.entries({ x: 1, y: 2 }));
// with new:
// const m = new LinkedHashMap<string, number>();
// for (const [k, v] of Object.entries({ x: 1, y: 2 })) m.put(k, v);
console.log(m.toString());                        // → {x=1, y=2}
console.log(Object.fromEntries(m));               // → { x: 1, y: 2 }
console.log(new globalThis.Map(m).get('y'));      // → 2

const fromNative = HashSet.of(...new globalThis.Set(['a', 'a', 'b']));
// with new:
// const fromNative = new HashSet<string>();
// for (const x of new globalThis.Set(['a', 'a', 'b'])) fromNative.add(x);
console.log(fromNative.size());                   // → 2
console.log(Stream.from(new globalThis.Set([3, 4])).map((n) => n * 2).toList().toString()); // → [6, 8]
```

## Common pitfalls

### Imported `Set` and `Map` shadow the built-ins

The library exports interfaces named `Set`, `Map`, `List` and `Iterator`. Importing them shadows the JS globals in
that module. See [Name clashes with built-ins](./getting-started.md#name-clashes-with-built-ins).

### `remove(index)` is `removeAt(index)`

On a `List<number>`, `remove(1)` removes the value `1`, not the element at index 1.

```ts
import { ArrayList } from '@ylcnfrht/typescript-collection-framework';

const l = ArrayList.of(10, 1, 20);
l.remove(1);       // removes the element equal to 1
console.log(l.toString()); // → [10, 20]
l.removeAt(1);     // removes the element at index 1
console.log(l.toString()); // → [10]
```

### `get` returns `null`, not `undefined`

`map.get(k) ?? fallback` still works, but `=== undefined` checks do not. Use `containsKey` when `null` is a
legitimate value.

### `for..of` is fail-fast

Adding or removing elements inside a loop over the same collection throws `ConcurrentModificationException`. Use
`iterator().remove()`, `removeIf`, or collect the changes and apply them after the loop.

```ts
import { HashMap } from '@ylcnfrht/typescript-collection-framework';

const m = HashMap.of<string, number>(['a', 1], ['b', 2], ['c', 3]);
// with new:
// const m = new HashMap<string, number>();
// m.put('a', 1);
// m.put('b', 2);
// m.put('c', 3);
try {
  for (const [k, v] of m) if (v > 1) m.remove(k);
} catch (e) {
  console.log((e as Error).name); // → ConcurrentModificationException
}
m.entrySet().removeIf((e) => e.getValue() > 1); // the right way
console.log(m.toString()); // → {a=1}
```

### Natural order sorts numbers numerically

`[10, 9, 1].sort()` sorts as strings (`1, 10, 9`). `list.sort(null)` and `.sorted()` sort numbers numerically.

### `size()` and `isEmpty()` are methods

They are not properties. Also, `Map.forEach` passes `(key, value)`, the reverse of the JS `Map`.

### Sub-lists and key sets are views

Clearing `list.subList(…)` or removing from `map.keySet()` changes the original collection. See
[Live views](./core-concepts.md#live-views).
