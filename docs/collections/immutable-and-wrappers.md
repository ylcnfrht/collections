# Immutable collections and wrappers

This page covers the collections that cannot be modified by whoever holds them: immutable copies (`List.of`, `Set.copyOf`, `Map.of`, …), unmodifiable views (`Collections.unmodifiableList` and related methods), lazy collections, and the empty, singleton and repeated-element collections. It also covers the checked and synchronized wrappers, and lists exactly which calls throw `UnsupportedOperationException`.

## Unmodifiable views vs immutable copies

Both kinds throw `UnsupportedOperationException` from mutators such as `add`, but they serve different needs. The general model is described in [optional operations](../guide/core-concepts.md#optional-operations-unmodifiable-vs-immutable).

| | Unmodifiable view | Immutable copy |
| --- | --- | --- |
| Created with | `Collections.unmodifiableList(src)` and related methods | `List.copyOf(src)`, `List.of(…)` and related factories |
| Cost to create | O(1): stores a reference to the source | O(n): copies the elements once |
| Changes to the source | visible through the view | never visible |
| Keeps the source alive | yes | no |
| Use it to | expose internal state read-only | hand out a snapshot, a constant or a defensive copy |

```ts
import { ArrayList, Collections, List } from '@ylcnfrht/collections';

const source = ArrayList.of('a', 'b');
// with new:
// const source = new ArrayList<string>();
// source.add('a');
// source.add('b');
const view = Collections.unmodifiableList(source);
const copy = List.copyOf(source);

source.add('c');
console.log(view.toString()); // → [a, b, c]
console.log(copy.toString()); // → [a, b]

try {
  view.add('d');
} catch (e) {
  console.log((e as Error).name); // → UnsupportedOperationException
}
```

A class typically exposes a view of its private state:

```ts
import { ArrayList, Collections, List } from '@ylcnfrht/collections';

class Playlist {
  private readonly tracks = new ArrayList<string>();
  add(track: string): void {
    this.tracks.add(track);
  }
  /** read-only, always up to date */
  getTracks(): List<string> {
    return Collections.unmodifiableList(this.tracks);
  }
}

const p = new Playlist();
const tracks = p.getTracks();
p.add('Intro');
console.log(tracks.size(), tracks.get(0)); // → 1 Intro
```

Views of views do not stack: wrapping an unmodifiable list again returns the same wrapper. The views of an unmodifiable map (`keySet()`, `values()`, `entrySet()`) are unmodifiable too, and its entries reject `setValue`.

## Immutable factories

`List`, `Set` and `Map` are both TypeScript interfaces and factory objects. The factories build compact, immutable collections that behave like any other `List`, `Set` or `Map` for reading, including value equality with mutable collections.

| Factory | Builds | Notes |
| --- | --- | --- |
| `List.of(a, b, …)` | list of the arguments | random access |
| `List.copyOf(collection)` | immutable list of the elements | returns the argument itself if it already is a `List.of`-style list |
| `Set.of(a, b, …)` | set of the arguments | a duplicate argument throws `IllegalArgumentException` |
| `Set.copyOf(collection)` | immutable set of the elements | duplicates are dropped |
| `Map.of(k1, v1, k2, v2, …)` | map of the pairs | a duplicate key, or an odd argument count, throws `IllegalArgumentException`; typed overloads up to 10 pairs, as in the reference |
| `Map.ofEntries(e1, e2, …)` | map of the entries | usually with `Map.entry(k, v)`; duplicate keys throw; use it beyond 10 pairs |
| `Map.copyOf(map)` | immutable copy of a map | returns the argument itself if it already is a `Map.of`-style map |
| `Map.entry(k, v)` | immutable entry | `setValue` throws |

```ts
import { List, Set, Map, ArrayList, HashSet, HashMap } from '@ylcnfrht/collections';

const primes = List.of(2, 3, 5, 7);
console.log(primes.get(2), primes.size());       // → 5 4
console.log(primes.equals(ArrayList.of(2, 3, 5, 7))); // → true

const vowels = Set.of('a', 'e', 'i', 'o', 'u');
console.log(vowels.contains('e'));               // → true
console.log(vowels.equals(HashSet.of('u', 'o', 'i', 'e', 'a'))); // → true

const ports = Map.of('http', 80, 'https', 443);
console.log(ports.get('https'));                 // → 443

const big = Map.ofEntries(Map.entry('a', 1), Map.entry('b', 2), Map.entry('c', 3));
console.log(big.size());                         // → 3

const copy = Set.copyOf(ArrayList.of(1, 1, 2)); // duplicates dropped
console.log(copy.size());                        // → 2

const snapshot = Map.copyOf(HashMap.of<string, number>(['x', 1]));
console.log(snapshot.equals(HashMap.of<string, number>(['x', 1]))); // → true
```

### Null and duplicate rules

These collections report mistakes at construction time:

- **No nulls.** A `null` or `undefined` element, key or value throws `NullPointerException`, in `copyOf` as well.
- **Null queries throw.** Because a null can never be inside, `contains(null)`, `indexOf(null)`, `get(null)`, `containsKey(null)` and `containsValue(null)` throw `NullPointerException` instead of returning `false` or `null`.
- **No duplicates** in `Set.of` or in the keys of `Map.of` and `Map.ofEntries` (`IllegalArgumentException`).

```ts
import { List, Set, Map } from '@ylcnfrht/collections';

const nameOf = (f: () => unknown): string => {
  try {
    f();
    return 'ok';
  } catch (e) {
    return (e as Error).name;
  }
};

console.log(nameOf(() => List.of(1, null)));             // → NullPointerException
console.log(nameOf(() => Map.of('a', undefined)));       // → NullPointerException
console.log(nameOf(() => List.of(1, 2).contains(null))); // → NullPointerException
console.log(nameOf(() => Map.of('a', 1).get(null)));     // → NullPointerException
console.log(nameOf(() => Set.of(1, 1)));                 // → IllegalArgumentException
console.log(nameOf(() => Map.of('a', 1, 'a', 2)));       // → IllegalArgumentException
```

> [!NOTE]
> Unmodifiable views and `Collections.emptyList()` and related collections answer null queries normally. The exceptions are the sorted and navigable empties, which reject `null` like a `TreeSet` or `TreeMap`.

### Iteration order

`List.of` keeps argument order. `Set.of` and `Map.of` promise no order; treat it like a `HashSet`'s. To get an order, sort, or copy into a `LinkedHashSet`, `TreeSet` or `TreeMap`:

```ts
import { Set, Map, TreeSet, TreeMap } from '@ylcnfrht/collections';

const s = Set.of('pear', 'apple', 'fig');
console.log(new TreeSet(s).toString()); // → [apple, fig, pear]

const m = Map.of('b', 2, 'a', 1);
console.log(new TreeMap(m).toString()); // → {a=1, b=2}
```

## Lazy collections (preview)

`List.ofLazy`, `Set.ofLazy` and `Map.ofLazy` build immutable collections whose contents are computed on first access, at most once, by a function you supply.

> [!IMPORTANT]
> Lazy collections are a preview feature. The API may change.

| Factory | Content |
| --- | --- |
| `List.ofLazy(size, i => value)` | `size` elements; element `i` is computed the first time it is read |
| `Set.ofLazy(candidates, e => boolean)` | the candidates for which the predicate returns `true`, each decided on first query |
| `Map.ofLazy(keys, k => value)` | the given keys; each value is computed on first `get` or iteration |

Reading a whole lazy collection (`toString`, `equals`, iteration, `size()` of a lazy set) computes everything it needs. A function that throws or returns `null` makes that slot fail with `NoSuchElementException`, then and on every later access, without calling the function again. Later changes to the candidates or keys collection are not seen.

```ts
import { List, Map, Set, TreeSet } from '@ylcnfrht/collections';

let calls = 0;
const squares = List.ofLazy(5, (i) => {
  calls++;
  return i * i;
});
console.log(squares.get(3), squares.get(3), calls); // → 9 9 1
console.log(squares.toString(), calls);             // → [0, 1, 4, 9, 16] 5

const config = Map.ofLazy(Set.of('host', 'port'), (key) => (key === 'port' ? '8080' : 'localhost'));
console.log(config.get('port'));  // → 8080
// not one of the keys
console.log(config.get('debug')); // → null

const evens = Set.ofLazy(TreeSet.of(1, 2, 3, 4), (n) => n % 2 === 0);
console.log(evens.contains(2), evens.contains(3), evens.size()); // → true false 2

const failing = List.ofLazy(1, (): string => {
  throw new Error('backend down');
});
const attempt = (): string => {
  try {
    return failing.get(0);
  } catch (e) {
    return (e as Error).name;
  }
};
console.log(attempt()); // → NoSuchElementException
// the function is not called again: the slot stays failed
console.log(attempt()); // → NoSuchElementException
```

## Empty, singleton and nCopies

`Collections` provides shared, unmodifiable collections for the trivial cases. Unlike `List.of`, they allow `null` elements and answer null queries normally, except the sorted and navigable empties, which reject `null` like a `TreeSet`, as in the reference.

| Method | Result |
| --- | --- |
| `Collections.emptyList()`, `emptySet()`, `emptyMap()` | one shared empty instance each |
| `Collections.emptySortedSet()`, `emptyNavigableSet()`, `emptySortedMap()`, `emptyNavigableMap()` | empty sorted and navigable collections |
| `Collections.emptyIterator()`, `emptyListIterator()`, `emptyEnumeration()` | iterators with nothing to iterate |
| `Collections.singletonList(e)`, `singleton(e)`, `singletonMap(k, v)` | exactly one element or mapping |
| `Collections.nCopies(n, e)` | list of `n` times the same element, in O(1) space |
| `Collections.EMPTY_LIST`, `EMPTY_SET`, `EMPTY_MAP` | the shared empties as constants |

```ts
import { Collections, ArrayList } from '@ylcnfrht/collections';

console.log(Collections.emptyList<number>().toString());   // → []
console.log(Collections.singletonMap('k', 1).toString());  // → {k=1}
console.log(Collections.singletonList(null).toString());   // → [null]

const dashes = Collections.nCopies(3, '-');
console.log(dashes.toString());                            // → [-, -, -]

// a common use: pre-filling a mutable list
const slots = new ArrayList<number | null>(Collections.nCopies(4, null));
slots.set(2, 42);
console.log(slots.toString());                             // → [null, null, 42, null]
```

## Wrappers

All wrappers are views: they forward to the collection they wrap, which remains the single source of truth.

### Unmodifiable

| Method | Wraps |
| --- | --- |
| `Collections.unmodifiableCollection(c)` | any `Collection`; equality is by identity, since a plain collection has no value equality contract |
| `Collections.unmodifiableSequencedCollection(c)` | a `SequencedCollection` |
| `Collections.unmodifiableList(l)` | a `List` |
| `Collections.unmodifiableSet(s)` | a `Set` |
| `Collections.unmodifiableSequencedSet(s)` | a `SequencedSet` such as `LinkedHashSet` |
| `Collections.unmodifiableSortedSet(s)`, `unmodifiableNavigableSet(s)` | a `TreeSet`; range views are unmodifiable too |
| `Collections.unmodifiableMap(m)` | a `Map` |
| `Collections.unmodifiableSequencedMap(m)` | a `SequencedMap` such as `LinkedHashMap` |
| `Collections.unmodifiableSortedMap(m)`, `unmodifiableNavigableMap(m)` | a `TreeMap`; range views are unmodifiable too |

### Checked

`Collections.checked*` wrappers reject elements of the wrong runtime type, which is useful when data crosses an untyped boundary (parsed JSON, a plugin, `any`). TypeScript types are erased at run time, so instead of a class token you pass a type-check predicate. Every way an element can enter is checked: `add`, `addAll`, `set`, `offer`, `push`, list iterators and sub-views, and for maps `put`, `putAll`, the results of `compute*` and `merge`, and `entry.setValue`. A failing element throws `ClassCastException` before the collection is touched.

| Method | Checks |
| --- | --- |
| `checkedCollection(c, type)`, `checkedList(l, type)`, `checkedQueue(q, type)` | elements |
| `checkedSet(s, type)`, `checkedSortedSet(s, type)`, `checkedNavigableSet(s, type)` | elements |
| `checkedMap(m, keyType, valueType)`, `checkedSortedMap(…)`, `checkedNavigableMap(…)` | keys and values |

```ts
import { ArrayList, HashMap, Collections } from '@ylcnfrht/collections';

const isString = (x: unknown): boolean => typeof x === 'string';
const names = Collections.checkedList(new ArrayList<unknown>(), isString);
names.add('ada');
try {
  names.addAll(ArrayList.of<unknown>('bob', 42)); // checked before anything is added
} catch (e) {
  console.log((e as Error).name); // → ClassCastException
}
console.log(names.toString()); // → [ada]

const scores = Collections.checkedMap(
  new HashMap<unknown, unknown>(),
  isString,
  (v) => typeof v === 'number',
);
scores.put('ada', 10);
try {
  scores.merge('ada', 'oops', () => 'not a number');
} catch (e) {
  console.log((e as Error).name); // → ClassCastException
}
console.log(scores.get('ada')); // → 10
```

### Synchronized

`Collections.synchronizedCollection`, `synchronizedList`, `synchronizedSet`, `synchronizedSortedSet`, `synchronizedNavigableSet`, `synchronizedMap`, `synchronizedSortedMap` and `synchronizedNavigableMap` exist so that code ported from the Java Collections Framework keeps working. JS runs your code on a single thread, and workers do not share these objects, so there is nothing to lock: the wrappers are plain delegating views. They add no safety and no measurable cost. New code uses the collection directly.

```ts
import { ArrayList, Collections } from '@ylcnfrht/collections';

const list = ArrayList.of(1);
const sync = Collections.synchronizedList(list);
sync.add(2);
console.log(list.toString()); // → [1, 2]
```

## Sets backed by maps

`Collections.newSetFromMap(map)` turns an empty map into a set: `add(e)` is `map.put(e, true)`, and every other operation goes through `map.keySet()`. The set inherits the map's key semantics, which is the reason to use it: pair it with `IdentityHashMap` for an identity set, or with an access-ordered `LinkedHashMap`. `Collections.newSequencedSetFromMap(map)` does the same for a `SequencedMap` and adds `addFirst`, `addLast` and `reversed`. A non-empty map throws `IllegalArgumentException`.

```ts
import { Collections, IdentityHashMap, LinkedHashMap, ArrayList, List } from '@ylcnfrht/collections';

// a set that tells equal-but-distinct objects apart
const seen = Collections.newSetFromMap(new IdentityHashMap<List<number>, boolean>());
seen.add(ArrayList.of(1));
seen.add(ArrayList.of(1));
console.log(seen.size()); // → 2

const ordered = Collections.newSequencedSetFromMap(new LinkedHashMap<string, boolean>());
ordered.add('b');
ordered.addFirst('a');
console.log(ordered.toString(), ordered.reversed().toString()); // → [a, b] [b, a]

try {
  Collections.newSetFromMap(LinkedHashMap.of(['x', true]));
} catch (e) {
  console.log((e as Error).name); // → IllegalArgumentException
}
```

## Which mutators throw

An unmodifiable collection throws `UnsupportedOperationException` from its mutators. Whether a call that would change nothing also throws differs by kind, and follows the reference exactly:

| Collection | Mutator that would change something | Mutator call that would change nothing |
| --- | --- | --- |
| `List.of`, `Set.of`, `Map.of` and their `copyOf` | throws | throws (e.g. `List.of().clear()`, `Set.of(1).remove(9)`) |
| `keySet()`/`values()` of a `Map.of` map | throws | returns `false` (e.g. `keySet().remove('missing')`) |
| `Collections.unmodifiable*` views, and their views | throws | throws |
| `Collections.emptyList()`/`emptySet()`/`emptyMap()` | throws (`add`, `put`, `compute*`, …) | no-op: `clear()` does nothing, `remove`/`removeIf`/`removeAll`/`retainAll` return `false` (`remove` on the map returns `null`) |
| `Collections.singletonList`/`singleton`/`singletonMap` | throws | `remove(absent)` returns `false` (`null` for the map); `clear()` and `removeIf` throw |
| `Collections.nCopies` | throws | `remove(absent)`/`removeIf(nothing)` return `false`; `clear()` throws |
| `Collections.emptySortedSet()` and related | throws | throws (they are unmodifiable views of empty tree collections) |
| `Map.entry`, `SimpleImmutableEntry`, navigation entries of `TreeMap` | `setValue` throws | — |

```ts
import { List, Map, Collections, ArrayList } from '@ylcnfrht/collections';

const nameOf = (f: () => unknown): string => {
  try {
    return String(f());
  } catch (e) {
    return (e as Error).name;
  }
};

console.log(nameOf(() => List.of<number>().clear()));                           // → UnsupportedOperationException
console.log(nameOf(() => Map.of('a', 1).keySet().remove('missing')));           // → false
console.log(nameOf(() => Map.of('a', 1).keySet().remove('a')));                 // → UnsupportedOperationException
console.log(nameOf(() => Collections.unmodifiableList(new ArrayList()).clear())); // → UnsupportedOperationException
console.log(nameOf(() => Collections.emptyList<number>().removeIf(() => true))); // → false
console.log(nameOf(() => Collections.emptyList<number>().add(1)));              // → UnsupportedOperationException
console.log(nameOf(() => Collections.singleton(1).remove(2)));                  // → false
console.log(nameOf(() => Collections.singleton(1).remove(1)));                  // → UnsupportedOperationException
```

> [!TIP]
> Do not rely on a no-op mutator succeeding on a collection you did not create. To modify a collection safely, own it: make a copy (`new ArrayList(c)`) and modify that.

The algorithms (`sort`, `shuffle`, `binarySearch`, …) are on [the Collections utilities page](../utilities/collections.md). The mutable implementations are described in [lists](./lists.md), [sets](./sets.md) and [maps](./maps.md).
