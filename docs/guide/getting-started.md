# Getting started

This page covers installation, importing from ES modules and CommonJS, a quick tour of the main collection types,
iteration, typing, and runtime and bundler support.

## Install

```sh
npm install @nodestd/collections
# or
yarn add @nodestd/collections
# or
pnpm add @nodestd/collections
```

The package has no runtime dependencies and ships its own type definitions.

## Importing

The package is published as both ES modules and CommonJS. The `exports` map selects the matching build and type
definitions (`.d.ts` or `.d.mts`).

```ts
// ESM / TypeScript
import { ArrayList, HashMap, Collectors } from '@nodestd/collections';

const names = new ArrayList<string>();
names.add('Ada');
console.log(names.toString()); // → [Ada]
```

```js
// CommonJS
const { ArrayList, HashMap, Collectors } = require('@nodestd/collections');
```

Everything is a named export of the package root. There are no deep imports.

### Name clashes with built-ins

> [!WARNING]
> The package exports interfaces and factories named `List`, `Set`, `Map` and `Iterator`. Importing `Set` or `Map`
> shadows the JS built-in in that module, and the library's `Set` and `Map` are not constructible. Alias them on
> import, or reach the built-ins through `globalThis`.

```ts
import { Map as CMap, HashMap } from '@nodestd/collections';

const ours: CMap<string, number> = new HashMap<string, number>();
const native = new globalThis.Map<string, number>();
console.log(ours.size(), native.size); // → 0 0
```

## Quick tour

### Lists

```ts
import { ArrayList, List } from '@nodestd/collections';

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

`toString()` prints the `[a, b, c]` format used by the examples throughout these docs.

### Sets

```ts
import { HashSet, TreeSet, LinkedHashSet } from '@nodestd/collections';

const seen = new HashSet<string>();
console.log(seen.add('x'));  // → true
console.log(seen.add('x'));  // → false

const sorted = new TreeSet<number>();
[5, 1, 3].forEach((n) => sorted.add(n));
console.log(sorted.toString());     // → [1, 3, 5]
console.log(sorted.ceiling(2));     // → 3
console.log(sorted.headSet(3).toString()); // → [1]

const ordered = LinkedHashSet.of('z', 'a', 'm'); // keeps insertion order
// with new:
// const ordered = new LinkedHashSet<string>();
// ordered.add('z');
// ordered.add('a');
// ordered.add('m');
console.log(ordered.toString());    // → [z, a, m]
```

### Maps

```ts
import { HashMap, TreeMap } from '@nodestd/collections';

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

Missing keys return `null`, not `undefined`. See [Null and undefined](./core-concepts.md#null-and-undefined).

### Streams and collectors

Streams are lazy pipelines over a collection, array or iterable. Collectors reduce a stream to a result.

```ts
import { List, Stream, IntStream, Collectors } from '@nodestd/collections';

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

See [Streams overview](../streams/overview.md) and [Collectors](../streams/collectors.md).

## Iterating

Every collection is a JS iterable. Maps iterate as `[key, value]` pairs.

```ts
import { ArrayList, LinkedHashMap } from '@nodestd/collections';

const list = ArrayList.of(1, 2, 3);
// with new:
// const list = new ArrayList<number>();
// list.add(1);
// list.add(2);
// list.add(3);

for (const n of list) {
  // for..of works on every collection
}
list.forEach((n) => { /* fastest way to visit every element */ });
console.log([...list]);            // → [ 1, 2, 3 ]
console.log(Array.from(list, (n) => n * 10)); // → [ 10, 20, 30 ]

const m = LinkedHashMap.of<string, number>(['a', 1], ['b', 2]);
// with new:
// const m = new LinkedHashMap<string, number>();
// m.put('a', 1);
// m.put('b', 2);
for (const [k, v] of m) {
  // k: string, v: number
}
console.log([...m]); // → [ [ 'a', 1 ], [ 'b', 2 ] ]
m.forEach((k, v) => { /* map forEach is (key, value) */ });

// An explicit iterator can remove elements safely during iteration
const it = list.iterator();
while (it.hasNext()) if (it.next() === 2) it.remove();
console.log(list.toString()); // → [1, 3]
```

> [!IMPORTANT]
> Iteration is fail-fast. Structurally modifying a collection inside a `for..of` over it throws
> `ConcurrentModificationException`. Use `iterator().remove()` or `removeIf` instead. See
> [Fail-fast iteration](./core-concepts.md#fail-fast-iteration).

## Typing collections

Declare variables and parameters with the interfaces (`List`, `Set`, `Map`, `Deque`, `NavigableMap`, …) and choose
the implementation at construction time.

```ts
import { ArrayList, LinkedList, List, Deque, NavigableMap, TreeMap, Collection } from '@nodestd/collections';

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

Type parameters are inferred from factory arguments: `ArrayList.of(1, 2)` is an `ArrayList<number>`. Pass them
explicitly to empty constructors (`new HashMap<string, number>()`); otherwise TypeScript infers `unknown`.

Comparators are plain functions `(a, b) => number` and type-check like any callback:

```ts
import { TreeSet, Comparator } from '@nodestd/collections';

interface User { name: string; age: number }
const byAge = new TreeSet<User>(Comparator.comparing((u: User) => u.age));
byAge.add({ name: 'b', age: 30 });
byAge.add({ name: 'a', age: 20 });
console.log(byAge.first().name); // → a
```

## Browsers and bundlers

- The library is plain ES2020 with no Node-specific APIs. It runs in modern browsers, Deno, Bun, workers and edge
  runtimes.
- Bundlers (Vite, webpack, esbuild, Rollup, Parcel) select the ESM build through the `exports` map. The package is a
  single module, so unused classes are tree-shaken only as far as the bundler can prove them unused. Importing the
  package also registers the stream engine with the collections, which is why `list.stream()` works without
  importing `Stream`.
- `Symbol.dispose` support on streams (`using s = list.stream()`) is available only where the runtime defines
  `Symbol.dispose`.
- A bundler that merges the library with application code may rename clashing classes (`HashMap2`), and a minifier
  shortens names further. Printing and equality are unaffected. Only `constructor.name` and class names quoted in
  some error messages (`ClassCastException`) change. Exception `name`s are unaffected.

> [!WARNING]
> Load one copy of the library. If an application loads two copies (for example the CommonJS build through
> `require` and the ESM build through `import`), collections from both still compare equal and interoperate, but
> `instanceof` across copies is `false`. Check exceptions by `e.name`.

## Supported runtimes

| Runtime | Support |
|---|---|
| Node.js | 18 and newer (`engines: { node: ">=18" }`) |
| Browsers | Evergreen browsers (ES2020) |
| TypeScript | 5.x recommended |

## Next steps

| Page | Read it for |
|---|---|
| [Core concepts](./core-concepts.md) | The semantics that differ from built-in JS collections. Recommended next. |
| [Data structures primer](./data-structures.md) | What `ArrayList`, `ArrayDeque`, `TreeMap` and the other structures are and how they store data |
| [Choosing a collection](./choosing-a-collection.md) | Which class to pick |
| [Coming from JS](./coming-from-js.md) | `Array`, `Map` and `Set` equivalents |
| [Introduction](../README.md) | The full list of pages |
