---
title: Spliterators
description: The Spliterator protocol, characteristic flags, the Spliterators utilities and building custom stream sources with StreamSupport.
sidebar:
  order: 7
---

A spliterator is how every stream reads its source. You need it to build a stream over a custom source, or to see
why an operation is fast on one collection and slower on another. For JS iterables, `Stream.from(iterable)` is
usually enough (see [sources](/collections/streams/overview/#sources)).

## The protocol

| Method | Does |
|---|---|
| `tryAdvance(action)` | calls `action` on the next element and returns `true`, or returns `false` |
| `forEachRemaining(action)` | calls `action` on every remaining element, usually faster than a `tryAdvance` loop |
| `trySplit()` | splits off a prefix into a new spliterator and keeps the rest, or returns `null` |
| `estimateSize()` | remaining elements; exact when `SIZED`, `Infinity` when unknown |
| `getExactSizeIfKnown()` | `estimateSize()` if `SIZED`, else `-1` |
| `characteristics()`, `hasCharacteristics(flags)` | the flags below, OR-ed / whether all given flags are set |
| `getComparator()` | the comparator when `SORTED` (`null` = natural order); otherwise throws `IllegalStateException` |

A spliterator is single-use and not meant to be shared. Streams run sequentially and never call `trySplit`, but it
is part of the contract: array and range spliterators split in half, and a custom one may return `null`.

```ts
import { IntStream } from '@ylcnfrht/collections';

const rest = IntStream.range(0, 8).spliterator();
const prefix = rest.trySplit()!; // 0..4, `rest` keeps 4..8
const got: number[] = [];
console.log(prefix.tryAdvance((x) => got.push(x)), prefix.estimateSize()); // → true 3
prefix.forEachRemaining((x) => got.push(x));
console.log(got, rest.estimateSize()); // → [ 0, 1, 2, 3 ] 4
```

## Characteristic flags

| Flag | Value | Promise |
|---|---|---|
| `Spliterator.ORDERED` | `0x10` | a defined encounter order |
| `Spliterator.DISTINCT` | `0x1` | no two elements are `equals` |
| `Spliterator.SORTED` | `0x4` | follows `getComparator()`; implies `ORDERED` |
| `Spliterator.SIZED` | `0x40` | `estimateSize()` is exact |
| `Spliterator.SUBSIZED` | `0x4000` | every `trySplit` result is `SIZED` too |
| `Spliterator.NONNULL` | `0x100` | no `null` elements |
| `Spliterator.IMMUTABLE` | `0x400` | the source cannot change during traversal |
| `Spliterator.CONCURRENT` | `0x1000` | the source may change safely during traversal |

The engine trusts them: `distinct()` on a `DISTINCT` source and `sorted()` on a naturally `SORTED` one are no-ops,
and `count()` and `toArray()` on a `SIZED` pipeline skip the counting pass. Report only flags that are true; a wrong
flag gives wrong results.

| Source | Characteristics |
|---|---|
| `ArrayList`, `Vector`, `LinkedList`, `List.of(…)` | `ORDERED`, `SIZED`, `SUBSIZED` |
| `ArrayDeque` | `ORDERED`, `SIZED`, `SUBSIZED`, `NONNULL` |
| `PriorityQueue` | `SIZED`, `SUBSIZED`, `NONNULL` |
| `HashSet`, `HashMap` key and entry sets | `DISTINCT`, `SIZED` |
| `HashMap.values()` | `SIZED` |
| `LinkedHashSet`, `LinkedHashMap` key set | `DISTINCT`, `ORDERED`, `SIZED`, `SUBSIZED` |
| `TreeSet`, `TreeMap` key and entry sets | `DISTINCT`, `SORTED`, `ORDERED`, `SIZED` |
| `TreeMap.values()` | `ORDERED`, `SIZED` |
| `Set.of(…)` | `DISTINCT`, `SIZED`, `SUBSIZED` |
| `Stream.of(…)`, `Stream.ofArray(…)` | `ORDERED`, `SIZED`, `SUBSIZED`, `IMMUTABLE` |
| `IntStream.range(…)` | `ORDERED`, `SIZED`, `SUBSIZED`, `IMMUTABLE`, `NONNULL`, `DISTINCT`, `SORTED` |
| `Stream.iterate(…)` | `ORDERED`, `IMMUTABLE`, unknown size |
| `Stream.generate(…)` | `IMMUTABLE`, unknown size |
| `Stream.from(iterable)` | `ORDERED`, unknown size; a JS array is read like `Stream.ofArray`, a library collection through its own spliterator |

Collection spliterators are late-binding and fail-fast: changes made after `stream()` but before the terminal
operation are seen, and structural changes during traversal throw `ConcurrentModificationException`.

```ts
import { Spliterator, TreeSet, List, ArrayList } from '@ylcnfrht/collections';

const sp = new TreeSet(List.of(3, 1, 2)).spliterator();
console.log(sp.hasCharacteristics(Spliterator.SORTED | Spliterator.DISTINCT), sp.getComparator()); // → true null

const list = new ArrayList<number>();
list.add(1);
const s = list.stream().map((x) => x * 10);
list.add(2); // before the terminal: included
console.log(s.toList()); // → [10, 20]
try {
  list.stream().forEach((x) => {
    if (x === 1) list.add(99);
  });
} catch (e) {
  console.log((e as Error).name); // → ConcurrentModificationException
}
```

## Spliterators utilities

| Method | Returns |
|---|---|
| `Spliterators.spliterator(array, characteristics)` | over an array-like (typed arrays too); adds `SIZED` and `SUBSIZED` |
| `Spliterators.spliterator(array, from, to, characteristics)` | over `array[from..to)`; bad bounds throw `ArrayIndexOutOfBoundsException` |
| `Spliterators.spliterator(collection, characteristics)` | over a collection's iterator, sized by `size()` |
| `Spliterators.spliterator(iterator, size, characteristics)` | over an iterator with a known size |
| `Spliterators.spliteratorUnknownSize(iterator, characteristics)` | over an iterator, size `Infinity` |
| `Spliterators.iterator(spliterator)` | an `Iterator` (`hasNext`/`next`) |
| `Spliterators.emptySpliterator()` | no elements; also `emptyInt/Long/DoubleSpliterator` |
| `Spliterators.AbstractSpliterator`, `AbstractInt/Long/DoubleSpliterator` | base classes: implement `tryAdvance` only |

Iterator arguments are the library's `Iterator` (`hasNext()`/`next()`), as returned by `collection.iterator()`.

```ts
import { Spliterators, Spliterator, List } from '@ylcnfrht/collections';

const seen: number[] = [];
Spliterators.spliterator([10, 20, 30, 40], 1, 3, Spliterator.ORDERED).forEachRemaining((x) => seen.push(x));
console.log(seen); // → [ 20, 30 ]

try {
  Spliterators.spliterator([1, 2, 3], 3, 1, 0);
} catch (e) {
  console.log((e as Error).name, (e as Error).message); // → ArrayIndexOutOfBoundsException origin(3) > fence(1)
}

const unknown = Spliterators.spliteratorUnknownSize(List.of('a', 'b').iterator(), Spliterator.ORDERED);
console.log(unknown.estimateSize(), unknown.getExactSizeIfKnown()); // → Infinity -1
```

## Custom sources with StreamSupport

Extend `Spliterators.AbstractSpliterator<T>` (or the `Int`/`Long`/`Double` variant) and implement `tryAdvance`. Call
`super(estimatedSize, characteristics)` with `Infinity` when the size is unknown; `SIZED` implies `SUBSIZED`. You
get `forEachRemaining`, `estimateSize`, `characteristics` and a `trySplit` that copies batches into an array.

`StreamSupport.stream(spliterator, parallel)` wraps it in a `Stream`; `intStream`, `longStream` and `doubleStream`
build number streams. `parallel` only sets `isParallel()`.

```ts
import { Spliterators, Spliterator, StreamSupport } from '@ylcnfrht/collections';

// the lines of a string, read lazily
class LineSpliterator extends Spliterators.AbstractSpliterator<string> {
  private pos = 0;
  constructor(private readonly text: string) {
    super(Infinity, Spliterator.ORDERED | Spliterator.NONNULL | Spliterator.IMMUTABLE);
  }
  tryAdvance(action: (line: string) => void): boolean {
    if (this.pos > this.text.length) return false;
    const end = this.text.indexOf('\n', this.pos);
    const stop = end === -1 ? this.text.length : end;
    action(this.text.slice(this.pos, stop));
    this.pos = stop + 1;
    return true;
  }
}

const lines = (text: string) => StreamSupport.stream(new LineSpliterator(text), false);
console.log(lines('a\nbb\n\nccc').filter((l) => l.length > 0).toList()); // → [a, bb, ccc]

class Fibonacci extends Spliterators.AbstractLongSpliterator {
  private a = 0;
  private b = 1;
  constructor() {
    super(Infinity, Spliterator.ORDERED | Spliterator.NONNULL | Spliterator.IMMUTABLE);
  }
  tryAdvance(action: (n: number) => void): boolean {
    action(this.a);
    [this.a, this.b] = [this.b, this.a + this.b];
    return true;
  }
}
console.log(StreamSupport.longStream(new Fibonacci(), false).limit(8).boxed().toList()); // → [0, 1, 1, 2, 3, 5, 8, 13]
```

`StreamSupport.stream(() => spliterator, characteristics, parallel)` creates the spliterator only when the terminal
operation starts (or `spliterator()`/`iterator()` is first called), for a source that may still change after the
pipeline is built. `characteristics` must match what the supplied spliterator reports.

```ts
import { StreamSupport, Spliterator, ArrayList } from '@ylcnfrht/collections';

const buffer = new ArrayList<string>();
buffer.add('first');
const s = StreamSupport.stream(() => buffer.spliterator(), Spliterator.ORDERED | Spliterator.SIZED | Spliterator.SUBSIZED, false);
buffer.add('second'); // the supplier has not run yet
console.log(s.toList()); // → [first, second]
```
