# Getting started

This page takes you from `npm install` to a working program in a few minutes. It covers installation, importing
the package from ESM and CommonJS, a short tour of lists, sets, maps, streams and collectors, the ways to iterate a
collection, how the generic types fit together, and what you need to know about bundlers, browsers and Node versions.

- [Install](#install)
- [Importing](#importing)
- [A 5-minute tour](#a-5-minute-tour)
- [Iterating](#iterating)
- [Using the generics](#using-the-generics)
- [Browsers and bundlers](#browsers-and-bundlers)
- [Supported runtimes](#supported-runtimes)
- [Where next](#where-next)

## Install

```sh
npm install ts-collections-framework
# or
yarn add ts-collections-framework
# or
pnpm add ts-collections-framework
```

The package has **zero runtime dependencies** and ships its own type definitions, so there is no `@types/…` package
to install.

## Importing

The package is published as both ES modules and CommonJS. The `exports` map picks the right build (and the matching
`.d.ts`/`.d.mts` types) automatically.

```ts
// ESM / TypeScript
import { ArrayList, HashMap, Collectors } from 'ts-collections-framework';

const names = new ArrayList<string>();
names.add('Ada');
console.log(names.toString()); // → [Ada]
```

```js
// CommonJS
const { ArrayList, HashMap, Collectors } = require('ts-collections-framework');
```

Everything is a named export of the package root; there are no deep imports.

**Name clash warning.** The package exports interfaces/factories called `List`, `Set`, `Map` and `Iterator`. When
you import `Set` or `Map`, they shadow the JS built-ins in that module. Alias them if you need both:

```ts
import { Map as CMap, HashMap } from 'ts-collections-framework';

const ours: CMap<string, number> = new HashMap<string, number>();
const native = new globalThis.Map<string, number>();
console.log(ours.size(), native.size); // → 0 0
```

## A 5-minute tour

### Lists

```ts
import { ArrayList, List } from 'ts-collections-framework';

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

`toString()` prints the classic `[a, b, c]` format, which is also what the examples in these docs show.

### Sets

```ts
import { HashSet, TreeSet, LinkedHashSet } from 'ts-collections-framework';

const seen = new HashSet<string>();
console.log(seen.add('x'));  // → true
console.log(seen.add('x'));  // → false

const sorted = new TreeSet<number>();
[5, 1, 3].forEach((n) => sorted.add(n));
console.log(sorted.toString());     // → [1, 3, 5]
console.log(sorted.ceiling(2));     // → 3
console.log(sorted.headSet(3).toString()); // → [1]

const ordered = LinkedHashSet.of('z', 'a', 'm'); // keeps insertion order
console.log(ordered.toString());    // → [z, a, m]
```

### Maps

```ts
import { HashMap, TreeMap } from 'ts-collections-framework';

const ages = new HashMap<string, number>();
ages.put('ada', 36);
ages.put('alan', 41);
console.log(ages.get('ada'));     // → 36
console.log(ages.get('nobody'));  // → null
console.log(ages.getOrDefault('nobody', 0)); // → 0

// counting with merge
const counts = new TreeMap<string, number>();
for (const w of ['b', 'a', 'b']) counts.merge(w, 1, (x, y) => x + y);
console.log(counts.toString());   // → {a=1, b=2}
console.log(counts.firstKey());   // → a
```

Missing keys give `null`, not `undefined` — see [Core concepts](./core-concepts.md#null-and-undefined).

### Streams and collectors

Streams are lazy pipelines over any collection (or array, or iterable). Collectors turn a stream into a result.

```ts
import { List, Stream, IntStream, Collectors } from 'ts-collections-framework';

const words = List.of('apple', 'fig', 'banana', 'kiwi', 'cherry');

const longUpper = words.stream()
  .filter((w) => w.length > 4)
  .map((w) => w.toUpperCase())
  .toList();
console.log(longUpper.toString()); // → [APPLE, BANANA, CHERRY]

const byLength = words.stream().collect(Collectors.groupingBy((w) => w.length));
console.log(byLength.get(4)?.toString()); // → [kiwi]

console.log(words.stream().collect(Collectors.joining(', ', '<', '>'))); // → <apple, fig, banana, kiwi, cherry>
console.log(IntStream.rangeClosed(1, 5).sum());           // → 15
console.log(Stream.of(3, 1, 2).sorted().findFirst().get()); // → 1
```

More in [Streams overview](../streams/overview.md) and [Collectors](../streams/collectors.md).

## Iterating

Every collection is a JS iterable, so all the usual language features work. Maps iterate as `[key, value]` pairs.

```ts
import { ArrayList, LinkedHashMap } from 'ts-collections-framework';

const list = ArrayList.of(1, 2, 3);

for (const n of list) {
  // for..of works on every collection
}
list.forEach((n) => { /* fastest way to visit every element */ });
console.log([...list]);            // → [ 1, 2, 3 ]
console.log(Array.from(list, (n) => n * 10)); // → [ 10, 20, 30 ]

const m = LinkedHashMap.of<string, number>(['a', 1], ['b', 2]);
for (const [k, v] of m) {
  // k: string, v: number
}
console.log([...m]); // → [ [ 'a', 1 ], [ 'b', 2 ] ]
m.forEach((k, v) => { /* map forEach is (key, value) */ });

// The classic explicit iterator, which also lets you remove safely while iterating
const it = list.iterator();
while (it.hasNext()) if (it.next() === 2) it.remove();
console.log(list.toString()); // → [1, 3]
```

All iteration is **fail-fast**: changing a collection structurally inside a `for..of` over it throws
`ConcurrentModificationException`. Use `iterator().remove()` or `removeIf` instead — see
[Fail-fast iteration](./core-concepts.md#fail-fast-iteration).

## Using the generics

Program against the interfaces (`List`, `Set`, `Map`, `Deque`, `NavigableMap`, …) and choose the implementation at
construction time — the same habit as with the Java API.

```ts
import { ArrayList, LinkedList, List, Deque, NavigableMap, TreeMap, Collection } from 'ts-collections-framework';

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
todo.add('write docs');
index.put('docs', 1);
console.log(index.ceilingKey('a')); // → docs
```

Type parameters are usually inferred from factory arguments (`ArrayList.of(1, 2)` is an `ArrayList<number>`), but
give them explicitly on empty constructors (`new HashMap<string, number>()`), otherwise TypeScript infers
`unknown`.

Comparators are plain functions `(a, b) => number`, so they type-check like any callback:

```ts
import { TreeSet, Comparator } from 'ts-collections-framework';

interface User { name: string; age: number }
const byAge = new TreeSet<User>(Comparator.comparing((u: User) => u.age));
byAge.add({ name: 'b', age: 30 });
byAge.add({ name: 'a', age: 20 });
console.log(byAge.first().name); // → a
```

## Browsers and bundlers

- The library is plain ES2020 with no Node-only APIs, so it runs in every modern browser, Deno, Bun, workers and
  edge runtimes.
- Bundlers (Vite, webpack, esbuild, Rollup, Parcel) pick the ESM build through the `exports` map. It is a single
  module, so unused classes are tree-shaken only as far as your bundler can prove them unused; importing the package
  also registers the stream engine with the collections (that is why `list.stream()` works without importing
  `Stream`).
- `Symbol.dispose` support on streams (`using s = list.stream()`) is present only where the runtime defines
  `Symbol.dispose`.

## Supported runtimes

| Runtime | Support |
|---|---|
| Node.js | **18 and newer** (`engines: { node: ">=18" }`) |
| Browsers | Any evergreen browser (ES2020) |
| TypeScript | 5.x recommended; the typings use standard generics and overloads |

## Where next

- [Data structures primer](./data-structures.md) — what `ArrayList`, `ArrayDeque`, `TreeMap` & co. are and how they store data, if these names are new to you.
- [Core concepts](./core-concepts.md) — the semantics that differ from plain JS collections. **Read this next.**
- [Choosing a collection](./choosing-a-collection.md) — which class to pick.
- [Coming from JS](./coming-from-js.md) — a cheat sheet from `Array`/`Map`/`Set`.
- [Documentation home](../README.md) — the full map of pages.
