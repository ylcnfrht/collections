# Maps

A map associates keys with values, at most one value per key. This page covers the `Map` interface and its sequenced and sorted variants, the implementations `HashMap`, `LinkedHashMap`, `TreeMap` and `IdentityHashMap`, entries, views, and the compute and merge methods.

> [!NOTE]
> `WeakHashMap`, `EnumMap`, `Hashtable` and concurrent maps (`ConcurrentHashMap`, `ConcurrentSkipListMap`) are not included. [Not included](../advanced/compatibility.md#not-included) explains why and what to use instead.

## The Map interface

The maps in this package look up keys with `equals()`/`hashCode()`, or with a comparator for `TreeMap`, instead of by reference. [Value equality](../guide/core-concepts.md#value-equality) explains how these methods work for primitives, plain objects and your own classes. Every map follows these rules:

| Rule | Meaning |
| --- | --- |
| `put` returns the previous value | `put(k, v)` returns the value it replaced, or `null` if the key was new. |
| `get` returns `null` for a missing key | Never `undefined`. Use `containsKey` to tell "absent" from "mapped to `null`". |
| Keys are unique by `equals` | Hash maps find keys by `hashCode()`, then `equals()`; `TreeMap` uses its comparator. |
| Value equality | `a.equals(b)` is `true` when `b` is any `Map` with the same key-value pairs; order is ignored. `hashCode()` is the sum over entries of `hash(key) ^ hash(value)`. |

```ts
import { HashMap, TreeMap, LinkedHashMap } from '@ylcnfrht/collections';

const ages = new HashMap<string, number>();
console.log(ages.put('ada', 36));  // → null
console.log(ages.put('ada', 37));  // → 36
console.log(ages.get('ada'));      // → 37
console.log(ages.get('bob'));      // → null

const sorted = new TreeMap<string, number>();
sorted.put('ada', 37);
console.log(ages.equals(sorted));                       // → true
console.log(LinkedHashMap.of(['ada', 37]).equals(ages)); // → true
```

The more specific interfaces add ordering:

| Interface | Adds | Implemented by |
| --- | --- | --- |
| `Map<K, V>` | the rules above | all maps |
| `SequencedMap<K, V>` | first/last entries, `putFirst`/`putLast`, `reversed()` | `LinkedHashMap`, `TreeMap` |
| `SortedMap<K, V>`, `NavigableMap<K, V>` | sorted keys, nearest-key queries, range views | `TreeMap` |

## Implementations

| Class | Iteration order | `get` / `put` / `remove` | Use it for |
| --- | --- | --- | --- |
| `HashMap` | unspecified | O(1) average | the default map |
| `LinkedHashMap` | insertion or access order | O(1) average | predictable order, LRU caches |
| `TreeMap` | sorted by key | O(log n) | sorted keys, nearest-key queries, ranges |
| `IdentityHashMap` | unspecified | O(1) average | keys compared by reference |

`HashMap`, `LinkedHashMap` and `IdentityHashMap` accept `null` and `undefined` keys and values. The [data structures primer](../guide/data-structures.md#hashmap-and-hashset) shows how hash tables and trees store their data.

### HashMap

<ClassInfo name="HashMap" />

`HashMap` is the default map. Like `HashSet`, it stores each key where its kind of equality is cheapest to evaluate:

- **Dense integer-key table.** Keys such as `0, 1, 2, …` (ids, indexes, counters) are stored directly at that index of an array, without hashing. A key is accepted into the table only while the table stays at least about a quarter full. A distant integer such as `1_000_000` goes to the native map instead, so the array never becomes large and sparse.
- **Native `Map`.** Strings, other numbers, booleans, bigints, symbols, `null`/`undefined` and objects without an `equals()` method use a native `Map`, which applies SameValueZero equality.
- **Hash buckets.** Keys with `equals()`/`hashCode()` (value classes, the package's collections) and `Date`s are grouped by hash code and compared with `equals()`.

The split is not observable: it is one map with one fail-fast iteration over all three stores.

::: code-group

```ts [Basic]
import { HashMap } from '@ylcnfrht/collections';

const ages = new HashMap<string, number>();
ages.put('ada', 36);
ages.put('alan', 41);
console.log(ages.get('ada'));          // → 36
console.log(ages.containsKey('alan')); // → true
console.log(ages.remove('alan'));      // → 41
console.log(ages.size());              // → 1
for (const [name, age] of ages) console.log(name, age); // → ada 36
```

```ts [Intermediate]
import { HashMap, List } from '@ylcnfrht/collections';

const byId = new HashMap<number, string>();
for (let id = 0; id < 5; id++) byId.put(id, `user${id}`); // dense table
byId.put(1_000_000, 'far');                                // native map
console.log(byId.get(3), byId.get(1_000_000), byId.size()); // → user3 far 6

// clicks per grid cell: List keys compare by value (buckets)
const clicks = new HashMap<List<number>, number>();
const events = [[1, 2], [3, 4], [1, 2], [1, 2]];
for (const [x, y] of events) clicks.merge(List.of(x, y), 1, (a, b) => a + b);
console.log(clicks.get(List.of(1, 2)));              // → 3
console.log(clicks.get(List.of(3, 4)));              // → 1
console.log(clicks.getOrDefault(List.of(0, 0), 0)); // → 0
```

:::

### LinkedHashMap

<ClassInfo name="LinkedHashMap" />

`LinkedHashMap` is a `HashMap` that also links its entries in a doubly linked list. This gives it a predictable iteration order and the [sequenced operations](#sequenced-operations). Two orders are available:

- **Insertion order** (the default). Entries iterate in the order their keys were first put. Putting an existing key again changes the value but keeps the position.
- **Access order** (`new LinkedHashMap(capacity, loadFactor, true)`). Every `get`, `put`, `getOrDefault`, `putIfAbsent`, `replace`, `compute*` or `merge` that hits a key moves it to the tail. The head is then the least recently used entry.

::: code-group

```ts [Basic]
import { LinkedHashMap } from '@ylcnfrht/collections';

const steps = new LinkedHashMap<string, number>();
steps.put('build', 12);
steps.put('test', 30);
steps.put('deploy', 5);
console.log(steps.get('test'));         // → 30
console.log(steps.containsKey('lint')); // → false
steps.remove('test');
console.log(steps.size());              // → 2
const order: string[] = [];
for (const [step, secs] of steps) order.push(`${step}=${secs}`);
console.log(order.join(', '));          // → build=12, deploy=5
```

```ts [Intermediate]
import { LinkedHashMap } from '@ylcnfrht/collections';

const insertion = new LinkedHashMap<string, number>();
insertion.put('a', 1);
insertion.put('b', 2);
insertion.put('c', 3);
insertion.put('a', 10); // existing key: value changes, position stays
insertion.get('b');
console.log(insertion.toString()); // → {a=10, b=2, c=3}

const access = new LinkedHashMap<string, number>(16, 0.75, true);
access.put('a', 1);
access.put('b', 2);
access.put('c', 3);
access.get('a'); // a becomes the most recently used
console.log(access.toString()); // → {b=2, c=3, a=1}
```

:::

> [!NOTE]
> In access order, `get` reorders the map, so it is a structural change for open iterators.

Access order is the basis of [LRU caches](#lru-caches).

### TreeMap

<ClassInfo name="TreeMap" />

`TreeMap` keeps its keys sorted in a red-black tree. `get`, `put`, `remove` and every navigation method are O(log n), and iteration is always in key order. Keys are ordered naturally (numbers, strings, bigints, booleans, `Date`s, objects with `compareTo`) or by a comparator passed to the constructor; see [ordering](../guide/core-concepts.md#ordering-natural-order-and-comparators). As with `TreeSet`, the comparator also decides which keys are equal. `null` keys are rejected under natural ordering.

::: code-group

```ts [Basic]
import { TreeMap, Comparator } from '@ylcnfrht/collections';

const scores = new TreeMap<string, number>();
scores.put('carol', 72);
scores.put('ada', 95);
scores.put('bob', 88);
console.log(scores.get('bob'));          // → 88
console.log(scores.containsKey('dave')); // → false
scores.remove('carol');
console.log(scores.size());              // → 2
const rows: string[] = [];
for (const [name, score] of scores) rows.push(`${name}=${score}`); // key order
console.log(rows.join(', '));            // → ada=95, bob=88

const desc = new TreeMap<string, number>(Comparator.reverseOrder<string>());
desc.putAll(scores);
console.log(desc.toString());            // → {bob=88, ada=95}
```

```ts [Intermediate]
import { TreeMap } from '@ylcnfrht/collections';

// shipping price by minimum parcel weight in kg
const tiers = new TreeMap<number, number>();
tiers.put(0, 5);
tiers.put(2, 9);
tiers.put(10, 20);
tiers.put(30, 45);

const priceFor = (kg: number): number => tiers.floorEntry(kg)!.getValue();
console.log(priceFor(1.5)); // → 5
console.log(priceFor(10));  // → 20
console.log(priceFor(29));  // → 20

console.log(tiers.ceilingKey(11));                       // → 30
console.log(tiers.headMap(10).toString());               // → {0=5, 2=9}
console.log(tiers.subMap(2, true, 30, false).toString()); // → {2=9, 10=20}
```

:::

`TreeMap` adds [navigation](#navigation) and [range views](#range-views).

### IdentityHashMap

<ClassInfo name="IdentityHashMap" />

`IdentityHashMap` compares keys and values by reference (`===`, with `NaN` equal to itself) and ignores `equals()`/`hashCode()`. This is the native `Map` rule, behind this package's `Map` interface. Use it when the object itself matters, not its value:

- tracking visited nodes in a graph walk or a deep copy, where distinct nodes may be equal;
- attaching metadata to objects that are mutable or whose `equals()` is expensive;
- keys whose `hashCode()` changes over time.

::: code-group

```ts [Basic]
import { IdentityHashMap } from '@ylcnfrht/collections';

const a = { id: 1 };
const b = { id: 1 }; // same contents, different object
const tags = new IdentityHashMap<object, string>();
tags.put(a, 'first');
tags.put(b, 'second');
console.log(tags.get(a));                 // → first
console.log(tags.containsKey({ id: 1 })); // → false
console.log(tags.size());                 // → 2
tags.remove(b);
for (const [key, tag] of tags) console.log(key, tag); // → { id: 1 } first
```

```ts [Intermediate]
import { IdentityHashMap, HashMap, ArrayList, List } from '@ylcnfrht/collections';

const a = ArrayList.of(1, 2);
// with new:
// const a = new ArrayList<number>();
// a.add(1);
// a.add(2);
const b = ArrayList.of(1, 2); // equal to a, but a different object

const byValue = new HashMap<List<number>, string>();
byValue.put(a, 'first');
byValue.put(b, 'second'); // replaces: a.equals(b)
console.log(byValue.size()); // → 1

const byIdentity = new IdentityHashMap<List<number>, string>();
byIdentity.put(a, 'first');
byIdentity.put(b, 'second');
console.log(byIdentity.size(), byIdentity.get(a), byIdentity.get(b)); // → 2 first second
console.log(byIdentity.get(ArrayList.of(1, 2))); // → null

a.add(3); // mutating a key is harmless here
console.log(byIdentity.get(a)); // → first
```

:::

## Creating a map

| Form | Result |
| --- | --- |
| `new HashMap<K, V>()`, `new LinkedHashMap<K, V>()` | empty map |
| `new HashMap<K, V>(initialCapacity, loadFactor?)` | empty map; validated sizing hints |
| `new LinkedHashMap<K, V>(initialCapacity, loadFactor, accessOrder)` | empty map; `accessOrder: true` selects access order |
| `new HashMap<K, V>(map)`, `new LinkedHashMap<K, V>(map)` | copy of any `Map` |
| `HashMap.of([k1, v1], [k2, v2])`, `LinkedHashMap.of(…)` | map of the pairs |
| `HashMap.newHashMap<K, V>(n)`, `LinkedHashMap.newLinkedHashMap<K, V>(n)` | empty map intended for `n` mappings (a hint; a negative `n` throws `IllegalArgumentException`) |
| `LinkedHashMap.lru<K, V>(maxSize)` | access-ordered map that evicts beyond `maxSize` entries |
| `new TreeMap<K, V>()`, `new TreeMap<K, V>(comparator)` | empty sorted map, natural or comparator ordering |
| `new TreeMap<K, V>(map)` | copy; keeps the comparator if the source is a sorted map, otherwise natural ordering |
| `new IdentityHashMap<K, V>()`, `new IdentityHashMap<K, V>(expectedMaxSize)`, `new IdentityHashMap<K, V>(map)` | empty map, sized map, or copy |
| `m.clone()` | shallow copy of the same class |

## Core operations

### Basic methods

| Method | Returns | Description |
| --- | --- | --- |
| `get(k)` | `V \| null` | value of `k`, or `null` if absent |
| `put(k, v)` | `V \| null` | stores `v`; returns the previous value or `null` |
| `remove(k)` | `V \| null` | removes `k`; returns its value or `null` |
| `containsKey(k)` | `boolean` | whether `k` is present |
| `containsValue(v)` | `boolean` | whether any key maps to a value equal to `v` (O(n)) |
| `putAll(m)` | `void` | copies every mapping of `m` |
| `size()`, `isEmpty()`, `clear()` | | as for collections |

Because `get` returns `null` both for a missing key and for a key mapped to `null`, ask `containsKey` when the difference matters:

```ts
import { HashMap } from '@ylcnfrht/collections';

const m = new HashMap<string, string | null>();
m.put('nickname', null);
console.log(m.get('nickname'), m.get('missing')); // → null null
console.log(m.containsKey('nickname'));           // → true
console.log(m.containsKey('missing'));            // → false
```

### Default methods

Every map has these methods. They come from `AbstractMap`, and the concrete maps override them with faster versions. A callback that returns `null` or `undefined` means "no mapping": the key is removed, or not added.

| Method | Returns | Description |
| --- | --- | --- |
| `getOrDefault(k, d)` | `V` | value of `k`, or `d` if `k` is absent (a key mapped to `null` returns `null`); `d` may be `null`, which types the result `V \| null` |
| `putIfAbsent(k, v)` | `V \| null` | puts `v` if `k` is absent or mapped to `null`; returns the current value or `null` |
| `computeIfAbsent(k, f)` | `V \| null` | if `k` is absent or `null`, stores `f(k)`; returns the new or existing value |
| `computeIfPresent(k, f)` | `V \| null` | if `k` has a non-null value, replaces it with `f(k, v)`, or removes `k` if `f` returns null |
| `compute(k, f)` | `V \| null` | stores `f(k, currentOrNull)`, or removes `k` if it returns null |
| `merge(k, v, f)` | `V \| null` | puts `v` if `k` is absent or `null`, else stores `f(old, v)`; removes `k` if `f` returns null |
| `replace(k, v)` | `V \| null` | replaces only if `k` is present; returns the old value or `null` |
| `replace(k, old, new)` | `boolean` | replaces only if `k` is currently mapped to `old` |
| `remove(k, v)` | `boolean` | removes only if `k` is currently mapped to `v` |
| `replaceAll(f)` | `void` | replaces every value with `f(k, v)` |
| `forEach(f)` | `void` | calls `f(k, v)` for every mapping |

```ts
import { TreeMap } from '@ylcnfrht/collections';

const stock = new TreeMap<string, number>();
stock.put('apples', 3);

console.log(stock.getOrDefault('pears', 0));      // → 0
console.log(stock.putIfAbsent('apples', 10));     // → 3
console.log(stock.putIfAbsent('pears', 5));       // → null
console.log(stock.toString());                    // → {apples=3, pears=5}

console.log(stock.computeIfPresent('pears', (_k, v) => v - 1)); // → 4
console.log(stock.computeIfPresent('plums', (_k, v) => v - 1)); // → null
console.log(stock.compute('plums', (_k, v) => (v ?? 0) + 1));   // → 1
// returning null removes the key
console.log(stock.computeIfPresent('plums', () => null));       // → null
console.log(stock.containsKey('plums'));                        // → false

// absent: nothing happens
console.log(stock.replace('kiwis', 1));         // → null
console.log(stock.replace('apples', 3, 30));    // → true
console.log(stock.remove('pears', 99));         // → false
stock.replaceAll((_k, v) => v * 2);
console.log(stock.toString());                  // → {apples=60, pears=8}

const lines: string[] = [];
stock.forEach((k, v) => lines.push(`${k}: ${v}`));
console.log(lines);                             // → [ 'apples: 60', 'pears: 8' ]
```

### Grouping with computeIfAbsent

`computeIfAbsent` returns the value that is in the map afterwards, so "get the bucket, creating it if needed, then add to it" is one expression. The `!` is needed because `computeIfAbsent` is typed `V | null`: a function that returns `null` leaves the key absent.

```ts
import { TreeMap, ArrayList, List } from '@ylcnfrht/collections';

const words = ['apple', 'avocado', 'banana', 'blueberry', 'cherry'];
const byLetter = new TreeMap<string, List<string>>();
for (const w of words) byLetter.computeIfAbsent(w[0], () => new ArrayList<string>())!.add(w);
console.log(byLetter.toString()); // → {a=[apple, avocado], b=[banana, blueberry], c=[cherry]}
```

### Counting with merge

`merge(k, 1, (a, b) => a + b)` inserts 1 for a new key and adds 1 to an existing one:

```ts
import { TreeMap } from '@ylcnfrht/collections';

const counts = new TreeMap<string, number>();
for (const ch of 'mississippi') counts.merge(ch, 1, (a, b) => a + b);
console.log(counts.toString()); // → {i=4, m=1, p=2, s=4}

// merge with a null-returning function removes the key: decrement-and-delete
counts.merge('m', 1, (a, b) => (a - b === 0 ? null : a - b));
console.log(counts.containsKey('m')); // → false
```

### Callbacks must not modify the map

The function passed to `computeIfAbsent`, `computeIfPresent`, `compute` or `merge` must not add or remove keys of the same map. If it does, the method detects the structural change and throws `ConcurrentModificationException` instead of storing into a map whose layout changed. The change the callback made is not rolled back. The same rule applies to `forEach`, `replaceAll` and iteration over any view.

```ts
import { HashMap } from '@ylcnfrht/collections';

const memo = new HashMap<number, number>();
const fib = (n: number): number =>
  n < 2 ? n : memo.computeIfAbsent(n, () => fib(n - 1) + fib(n - 2))!; // recursive: modifies memo

try {
  fib(10);
} catch (e) {
  console.log((e as Error).name); // → ConcurrentModificationException
}

// compute first, then store
const memo2 = new HashMap<number, number>();
const fib2 = (n: number): number => {
  if (n < 2) return n;
  const hit = memo2.get(n);
  if (hit !== null) return hit;
  const v = fib2(n - 1) + fib2(n - 2);
  memo2.put(n, v);
  return v;
};
console.log(fib2(50)); // → 12586269025
```

> [!NOTE]
> `IdentityHashMap` does not check for modification in these four methods, as in the reference, whose versions are the plain defaults. A modifying callback goes unnoticed there, but the rule still applies.

### Sequenced operations

`LinkedHashMap` and `TreeMap` are `SequencedMap`s (see [sequenced collections](../guide/core-concepts.md#sequenced-collections)):

| Method | Returns | Description |
| --- | --- | --- |
| `firstEntry()` / `lastEntry()` | `MapEntry<K, V> \| null` | first / last entry as an immutable snapshot |
| `pollFirstEntry()` / `pollLastEntry()` | `MapEntry<K, V> \| null` | removes and returns the first / last entry |
| `putFirst(k, v)` / `putLast(k, v)` | `V \| null` | puts and moves the key to the front / back; throws `UnsupportedOperationException` on a `TreeMap` |
| `reversed()` | `SequencedMap<K, V>` | live reverse-ordered view |
| `sequencedKeySet()`, `sequencedValues()`, `sequencedEntrySet()` | sequenced views | views with `getFirst`, `reversed()`, … |

```ts
import { LinkedHashMap } from '@ylcnfrht/collections';

const m = LinkedHashMap.of<string, number>(['a', 1], ['b', 2]);
// with new:
// const m = new LinkedHashMap<string, number>();
// m.put('a', 1);
// m.put('b', 2);
m.putFirst('b', 20);
m.putLast('c', 3);
console.log(m.toString());            // → {b=20, a=1, c=3}
console.log(m.reversed().toString()); // → {c=3, a=1, b=20}
console.log(m.firstEntry()?.toString(), m.lastEntry()?.toString()); // → b=20 c=3
console.log(m.sequencedKeySet().reversed().toString()); // → [c, a, b]
console.log(m.pollFirstEntry()?.toString()); // → b=20
console.log(m.toString());            // → {a=1, c=3}
```

### Navigation

`TreeMap` finds the nearest key to a probe, which need not be in the map. Each `…Key` method returns a key or `null`; each `…Entry` method returns an entry or `null`.

| Method | Returns |
| --- | --- |
| `firstKey()` / `lastKey()` | smallest / largest key; `NoSuchElementException` when empty |
| `firstEntry()` / `lastEntry()` | smallest / largest entry, or `null` |
| `lowerKey(k)` / `lowerEntry(k)` | greatest key `< k` |
| `floorKey(k)` / `floorEntry(k)` | greatest key `<= k` |
| `ceilingKey(k)` / `ceilingEntry(k)` | least key `>= k` |
| `higherKey(k)` / `higherEntry(k)` | least key `> k` |
| `pollFirstEntry()` / `pollLastEntry()` | removes and returns the smallest / largest entry |

Entries returned by navigation methods are immutable snapshots: `setValue` throws `UnsupportedOperationException`. Entries reached by iterating `entrySet()` are live and writable.

```ts
import { TreeMap } from '@ylcnfrht/collections';

const grades = new TreeMap<number, string>();
grades.put(90, 'A');
grades.put(80, 'B');
grades.put(70, 'C');
grades.put(0, 'F');

// the grade for a score: the greatest threshold <= score
const gradeOf = (score: number) => grades.floorEntry(score)!.getValue();
console.log(gradeOf(85), gradeOf(90), gradeOf(42)); // → B A F

console.log(grades.firstKey(), grades.lastKey());         // → 0 90
console.log(grades.lowerKey(80), grades.higherKey(80));   // → 70 90
console.log(grades.ceilingKey(81), grades.ceilingKey(91)); // → 90 null

const top = grades.lastEntry()!;
try {
  top.setValue('A+');
} catch (e) {
  console.log((e as Error).name); // → UnsupportedOperationException
}
console.log(grades.pollFirstEntry()?.toString(), grades.size()); // → 0=F 3
```

## LRU caches

An access-ordered `LinkedHashMap` that drops its head when it grows too large is an LRU (least recently used) cache. `LinkedHashMap.lru(n)` builds one:

```ts
import { LinkedHashMap } from '@ylcnfrht/collections';

const cache = LinkedHashMap.lru<string, string>(2);
cache.put('a', 'A');
cache.put('b', 'B');
cache.get('a');      // a is now more recent than b
cache.put('c', 'C'); // over capacity: evicts the least recently used (b)
console.log(cache.toString()); // → {a=A, c=C}
```

Combined with `computeIfAbsent`, the cache loads missing values on demand:

```ts
import { LinkedHashMap } from '@ylcnfrht/collections';

const cache = LinkedHashMap.lru<string, number>(3);
const load = (key: string): number => cache.computeIfAbsent(key, (k) => k.length)!; // k.length stands in for slow work

['alpha', 'be', 'gamma', 'alpha', 'delta'].forEach(load);
// 'be' was the least recently used when 'delta' arrived
console.log(cache.keySet().toString()); // → [gamma, alpha, delta]
```

For custom eviction rules (by total weight, by age, with a callback), subclass `LinkedHashMap` and override `removeEldestEntry(eldest)`. The map calls it after every insertion with the head entry; return `true` to evict that entry.

```ts
import { LinkedHashMap, MapEntry } from '@ylcnfrht/collections';

class BoundedCache<K, V> extends LinkedHashMap<K, V> {
  readonly evicted: K[] = [];
  constructor(private readonly max: number) {
    super(16, 0.75, true); // access order
  }
  protected override removeEldestEntry(eldest: MapEntry<K, V>): boolean {
    if (this.size() <= this.max) return false;
    this.evicted.push(eldest.getKey());
    return true;
  }
}

const c = new BoundedCache<string, number>(2);
c.put('a', 1);
c.put('b', 2);
c.put('c', 3);
console.log(c.toString(), c.evicted); // → {b=2, c=3} [ 'a' ]
```

## Entries

A `MapEntry<K, V>` (the `Map.Entry` of the Java Collections Framework) has `getKey()`, `getValue()`, `setValue(v)`, value-based `equals`/`hashCode`, and `toString()` in the form `key=value`.

| Factory | Mutable | Nulls |
| --- | --- | --- |
| `Map.entry(k, v)` | no (`setValue` throws `UnsupportedOperationException`) | rejected (`NullPointerException`) |
| `Map.Entry.copyOf(e)` | no; returns `e` itself if it already is such an entry | rejected |
| `new SimpleEntry(k, v)` / `new SimpleEntry(entry)` | yes | allowed |
| `new SimpleImmutableEntry(k, v)` | no | allowed |

`Map.Entry.comparingByKey()` and `Map.Entry.comparingByValue()` build comparators for sorting entries. Each optionally takes a comparator for the key or value.

```ts
import { Map, SimpleEntry, SimpleImmutableEntry, HashMap, ArrayList, Comparator } from '@ylcnfrht/collections';

const e = new SimpleEntry('k', 1);
e.setValue(2);
console.log(e.toString(), e.equals(Map.entry('k', 2))); // → k=2 true

try {
  new SimpleImmutableEntry('k', 1).setValue(3);
} catch (err) {
  console.log((err as Error).name); // → UnsupportedOperationException
}

// top scores: sort the entries by value, descending
const scores = HashMap.of<string, number>(['ann', 12], ['bob', 30], ['cid', 21]);
// with new:
// const scores = new HashMap<string, number>();
// scores.put('ann', 12);
// scores.put('bob', 30);
// scores.put('cid', 21);
const entries = new ArrayList(scores.entrySet());
entries.sort(Map.Entry.comparingByValue<string, number>(Comparator.reverseOrder<number>()));
console.log(entries.toString()); // → [bob=30, cid=21, ann=12]
```

## Views

Map views are [live](../guide/core-concepts.md#live-views): they always reflect the map's current contents, and changes made through them write through to the map. Creating a view is O(1).

### keySet, values and entrySet

| View | Removal writes through | Adding |
| --- | --- | --- |
| `keySet()` | `remove`, `removeAll`, `retainAll`, `removeIf`, `clear`, `iterator().remove()` | throws `UnsupportedOperationException` |
| `values()` | the same | throws `UnsupportedOperationException` |
| `entrySet()` | the same; `entry.setValue(v)` also writes through | throws `UnsupportedOperationException` |

A view cannot add, because it has no way to supply the missing half of a mapping.

```ts
import { TreeMap } from '@ylcnfrht/collections';

const m = new TreeMap<string, number>();
m.put('a', 1);
m.put('b', 2);
m.put('c', 3);

const keys = m.keySet();
m.put('d', 4);
console.log(keys.toString()); // → [a, b, c, d]

keys.remove('a');
m.values().removeIf((v) => v % 2 === 0);
console.log(m.toString()); // → {c=3}

for (const e of m.entrySet()) e.setValue(e.getValue() * 100);
console.log(m.toString()); // → {c=300}

try {
  keys.add('z');
} catch (e) {
  console.log((e as Error).name); // → UnsupportedOperationException
}
```

### Range views

`headMap`, `tailMap` and `subMap` on a `TreeMap` follow the rules of `TreeSet`'s [range views](./sets.md#range-views). They are live, writes go through, and putting a key outside the range throws `IllegalArgumentException`. The defaults are `headMap(to)` exclusive, `tailMap(from)` inclusive and `subMap(from, to)` half-open, with overloads that take explicit `inclusive` flags. `descendingMap()` is a live reverse-ordered view; `navigableKeySet()` and `descendingKeySet()` are the key views.

```ts
import { TreeMap } from '@ylcnfrht/collections';

const m = new TreeMap<number, string>();
for (const k of [10, 20, 30, 40]) m.put(k, `v${k}`);

console.log(m.headMap(30).toString());              // → {10=v10, 20=v20}
console.log(m.tailMap(20, false).toString());       // → {30=v30, 40=v40}
console.log(m.subMap(20, true, 40, true).toString()); // → {20=v20, 30=v30, 40=v40}
console.log(m.descendingMap().toString());          // → {40=v40, 30=v30, 20=v20, 10=v10}
console.log(m.descendingKeySet().toString());       // → [40, 30, 20, 10]

const low = m.headMap(30);
low.put(15, 'v15');      // inside the range: written to m
console.log(m.toString()); // → {10=v10, 15=v15, 20=v20, 30=v30, 40=v40}
try {
  low.put(35, 'v35');    // outside [.., 30)
} catch (e) {
  console.log((e as Error).name); // → IllegalArgumentException
}
low.clear();             // clears only the range
console.log(m.toString()); // → {30=v30, 40=v40}
```

## Iteration

Every map is iterable as `[key, value]` pairs, like a native `Map`, which supports destructuring loops, spread and conversion to native structures. Iteration and all views are [fail-fast](../guide/core-concepts.md#fail-fast-iteration): modifying the map other than through the view's iterator while iterating throws `ConcurrentModificationException`. To remove while iterating, use `iterator().remove()` or `removeIf` on a view.

```ts
import { LinkedHashMap } from '@ylcnfrht/collections';

const m = LinkedHashMap.of<string, number>(['a', 1], ['b', 2]);

const lines: string[] = [];
for (const [k, v] of m) lines.push(`${k} -> ${v}`);
console.log(lines.join(', '));             // → a -> 1, b -> 2

console.log([...m]);                       // → [ [ 'a', 1 ], [ 'b', 2 ] ]
console.log(new globalThis.Map(m));        // → Map(2) { 'a' => 1, 'b' => 2 }
console.log(Object.fromEntries(m));        // → { a: 1, b: 2 }

// and back: from a native Map or an object
const fromNative = new LinkedHashMap<string, number>();
for (const [k, v] of new globalThis.Map([['x', 9]])) fromNative.put(k, v);
for (const [k, v] of Object.entries({ y: 8 })) fromNative.put(k, v);
console.log(fromNative.toString());        // → {x=9, y=8}
```

## Recipes

### Word frequency

```ts
import { HashMap, ArrayList, Map } from '@ylcnfrht/collections';

const text = 'the quick fox jumps over the lazy dog the end';
const freq = new HashMap<string, number>();
for (const w of text.split(' ')) freq.merge(w, 1, (a, b) => a + b);

const top = new ArrayList(freq.entrySet());
top.sort(Map.Entry.comparingByValue<string, number>((a, b) => b - a));
console.log(top.get(0).toString()); // → the=3
console.log(freq.get('fox'));       // → 1
```

Streams do the same in one expression with `Collectors.groupingBy` and `Collectors.counting`; see [Collectors](../streams/collectors.md).

### Group by

```ts
import { TreeMap, ArrayList, List } from '@ylcnfrht/collections';

interface Order { customer: string; total: number }
const orders: Order[] = [
  { customer: 'ann', total: 10 },
  { customer: 'bob', total: 5 },
  { customer: 'ann', total: 7 },
];

const byCustomer = new TreeMap<string, List<number>>();
for (const o of orders) byCustomer.computeIfAbsent(o.customer, () => new ArrayList<number>())!.add(o.total);
console.log(byCustomer.toString()); // → {ann=[10, 7], bob=[5]}
```

### Inverted index

Map each word to the sorted set of documents that contain it:

```ts
import { TreeMap, TreeSet } from '@ylcnfrht/collections';

const docs = ['red fish blue fish', 'one fish', 'red car'];
const index = new TreeMap<string, TreeSet<number>>();
docs.forEach((text, id) => {
  for (const word of text.split(' ')) index.computeIfAbsent(word, () => new TreeSet<number>())!.add(id);
});
console.log(index.get('fish')?.toString()); // → [0, 1]
console.log(index.get('red')?.toString());  // → [0, 2]

// documents containing both words: intersect the postings
const both = new TreeSet<number>(index.get('red')!);
both.retainAll(index.get('fish')!);
console.log(both.toString()); // → [0]
```

### Range queries and time series

A `TreeMap` keyed by timestamp, or by ISO date strings (which sort chronologically), answers "what happened between A and B" and "what was the latest value at time T" in O(log n):

```ts
import { TreeMap } from '@ylcnfrht/collections';

const price = new TreeMap<string, number>();
price.put('2024-01-01', 100);
price.put('2024-01-05', 104);
price.put('2024-01-09', 98);
price.put('2024-01-15', 110);

// value as of a date: the latest entry at or before it
console.log(price.floorEntry('2024-01-07')?.getValue()); // → 104

// everything in the first ten days of January, both ends inclusive
const early = price.subMap('2024-01-01', true, '2024-01-10', true);
console.log(early.toString()); // → {2024-01-01=100, 2024-01-05=104, 2024-01-09=98}

// drop history older than a cutoff (the view writes through)
price.headMap('2024-01-09').clear();
console.log(price.toString()); // → {2024-01-09=98, 2024-01-15=110}
```

## Complexity

n is the number of mappings, r the number of mappings in a range view.

| Operation | `HashMap` | `LinkedHashMap` | `TreeMap` | `IdentityHashMap` |
| --- | --- | --- | --- | --- |
| `get`, `put`, `remove`, `containsKey` | O(1) avg | O(1) avg | O(log n) | O(1) avg |
| `containsValue` | O(n) | O(n) | O(n) | O(n) |
| `size`, `isEmpty` | O(1) | O(1) | O(1) (range view: O(r)) | O(1) |
| iteration | O(n) | O(n) | O(n) | O(n) |
| first/last entry, `pollFirstEntry`/`pollLastEntry` | — | O(1) | O(log n) | — |
| `putFirst`/`putLast` | — | O(1) | unsupported | — |
| `floorKey` and the other navigation methods, `firstKey`/`lastKey` | — | — | O(log n) | — |
| `headMap`/`tailMap`/`subMap`/`descendingMap` (creating the view) | — | — | O(1) | — |
| iteration order | unspecified | insertion or access | sorted by key | unspecified |

See [performance](../advanced/performance.md) for measurements and [choosing a collection](../guide/choosing-a-collection.md) for picking a map.

## Pitfalls

- **`get` cannot distinguish a missing key from a `null` value.** Use `containsKey` when a map stores `null`.
- **Do not mutate a key's `equals`/`hashCode` fields while it is in a hash map.** The entry stays in the map but can no longer be found; see the [set pitfall](./sets.md#mutating-an-element-inside-a-hash-set), which applies to keys equally. `IdentityHashMap` is not affected.
- **In a `TreeMap`, the comparator defines key equality.** Keys that compare as 0 are the same key, even if `equals()` says otherwise.
- **Compute and merge callbacks must not modify the map.** See [callbacks must not modify the map](#callbacks-must-not-modify-the-map).
- **The package's `Map` shadows the native `Map`.** Importing `Map` from the package hides the global one in that module; use `globalThis.Map` or an import alias, as the iteration example does.
