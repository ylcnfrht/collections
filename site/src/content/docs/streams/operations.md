---
title: Stream operations
description: Every intermediate and terminal operation on Stream, with its rules, edge cases and exceptions.
sidebar:
  order: 2
---

Every operation on `Stream<T>`. Laziness, short-circuiting and the single-use rule are explained in the
[overview](/streams/overview/); number streams add their own operations, see [number streams](/streams/number-streams/).

## Intermediate operations

| Operation | What it does | Notes |
|---|---|---|
| `filter(p)` | keeps elements where `p` is true | |
| `map(f)` | transforms each element | `null` results flow through |
| `mapToInt/Long/Double(f)` | maps to a number stream | adds `sum`, `average`, … |
| `flatMap(f)` | replaces each element by the elements of the stream `f` returns | `null`/`undefined` = empty; each inner stream is closed once consumed, even on a short-circuit |
| `flatMapToInt/Long/Double(f)` | `flatMap` to a number stream | |
| `mapMulti(f)`, `mapMultiToInt/Long/Double(f)` | `f(x, emit)` calls `emit` zero or more times | no inner stream, cheaper than `flatMap` for a few values |
| `peek(action)` | runs `action` on each element as it passes | for debugging only: skipped elements and a `count()` that needs no traversal never reach it |
| `distinct()` | drops duplicates, keeps the first | `HashSet` [equality](/concepts/equality/): primitives by value, objects with `equals`/`hashCode` by content, plain objects by identity |
| `sorted()`, `sorted(cmp)` | stable sort, natural order or `cmp` | barrier; incomparable elements throw `ClassCastException`, `sorted(null)` throws `NullPointerException` |
| `limit(n)`, `skip(n)` | keeps the first `n` / drops the first `n` | `limit` short-circuits; negative or non-integer `n` throws `IllegalArgumentException` |
| `takeWhile(p)`, `dropWhile(p)` | keeps / drops the prefix where `p` holds | unlike `filter`, look at a prefix only; `takeWhile` short-circuits |
| `gather(g)` | applies a [gatherer](/streams/gatherers/) | short-circuits if the gatherer stops |
| `unordered()`, `parallel()`, `sequential()`, `onClose(h)` | see the [overview](/streams/overview/#order-and-parallel) | |

Natural order compares numbers numerically, strings by code unit and objects through `compareTo`. To build
comparators, see [Comparator](/utilities/comparator-and-objects/). To de-duplicate by a key, use a gatherer
such as [`distinctBy`](/streams/gatherers/#writing-your-own).

```ts
import { Stream, List, Comparator, Gatherers } from '@ylcnfrht/collections';

// mapping
console.log(Stream.of('a', 'bb', 'ccc').map((s) => s.length).toList()); // → [1, 2, 3]
console.log(Stream.of('one', 'three', 'five').mapToInt((w) => w.length).sum()); // → 12
console.log(Stream.of(1, 2, 3).flatMap((x) => (x === 2 ? null : Stream.of(x, x))).toList()); // → [1, 1, 3, 3]
const expanded = Stream.of(1, 2, 3).mapMulti<number>((x, emit) => {
  if (x !== 2) {
    emit(x);
    emit(-x);
  }
});
console.log(expanded.toList()); // → [1, -1, 3, -3]

// distinct and sorted
console.log(Stream.of(List.of(1), List.of(1)).distinct().count()); // → 1
console.log(Stream.of({ a: 1 }, { a: 1 }).distinct().count()); // → 2
console.log(Stream.of(10, 9, 1).sorted().toList()); // → [1, 9, 10]
console.log(Stream.of('pear', 'fig', 'apple').sorted(Comparator.comparing((s: string) => s.length)).toList()); // → [fig, pear, apple]
try {
  Stream.of({ x: 2 }, { x: 1 }).sorted().toList();
} catch (e) {
  console.log((e as Error).name); // → ClassCastException
}

// slicing
console.log(Stream.iterate(1, (x) => x + 1).skip(2).limit(3).toList()); // → [3, 4, 5]
console.log(Stream.of(1, 2, 3, 1).takeWhile((x) => x < 3).toList()); // → [1, 2]
console.log(Stream.of(1, 2, 3, 1).dropWhile((x) => x < 3).toList()); // → [3, 1]
try {
  Stream.of(1).limit(-1);
} catch (e) {
  console.log((e as Error).name); // → IllegalArgumentException
}

// gather
console.log(Stream.of(1, 2, 3, 4, 5).gather(Gatherers.windowFixed(2)).toList()); // → [[1, 2], [3, 4], [5]]

// flatMap closes inner streams as they are consumed
const log: string[] = [];
const first = Stream.of(1, 2, 3)
  .flatMap((x) => Stream.of(x * 10).onClose(() => log.push(`closed ${x}`)))
  .findFirst();
console.log(first, log); // → Optional[10] [ 'closed 1' ]
```

## Terminal operations

| Operation | Returns | Notes |
|---|---|---|
| `forEach(a)`, `forEachOrdered(a)` | `void` | both run in encounter order here; use `forEachOrdered` when the code relies on order |
| `toArray()` | a new JS array | |
| `toArray(generator)` | the array `generator(size)` returns, typed arrays included | sized stream: must be exactly that length, else `IllegalStateException`; unsized: at least that long, else `IndexOutOfBoundsException` |
| `reduce(identity, op)` | `T`; `identity` when empty | `identity` must be neutral for `op` (`0` for `+`) |
| `reduce(op)` | `Optional<T>` | empty when the stream is |
| `reduce(identity, acc, combiner)` | `U`, a different result type | |
| `collect(collector)` | the collector's result | see [collectors](/streams/collectors/) |
| `collect(supplier, acc, combiner)` | the container | `combiner` merges the second container into the first |
| `toList()` | unmodifiable `List` | accepts `null`, unlike `Collectors.toUnmodifiableList()`; mutators throw `UnsupportedOperationException` |
| `min(cmp)`, `max(cmp)` | `Optional<T>` | |
| `count()` | `number` | see the note below |
| `anyMatch`, `allMatch`, `noneMatch` | `boolean` | short-circuit; on an empty stream `anyMatch` is `false`, the others `true` |
| `findFirst()`, `findAny()` | `Optional<T>` | short-circuit; `findAny` always returns the first element here |
| `iterator()`, `spliterator()` | an [`Iterator`](/streams/overview/#iterating-a-stream-from-js) / a [`Spliterator`](/streams/spliterators/) | pull elements on demand |

`findFirst`, `findAny`, `min`, `max` and `reduce(op)` throw `NullPointerException` when the chosen element is
`null`, because an `Optional` cannot hold it. Accumulators and combiners must be associative: the combiner is never
called (evaluation is sequential) but must still be correct.

:::caution
When the size is known without a traversal (a sized source followed only by `map`, `peek`, `sorted`, `limit` or
`skip`), `count()` returns it without running the pipeline, so `peek` and `map` side effects do not happen.
:::

```ts
import { Stream, Comparator } from '@ylcnfrht/collections';

// reduce
console.log(Stream.of(1, 2, 3, 4).reduce(0, (a, b) => a + b)); // → 10
console.log(Stream.empty<number>().reduce((a, b) => a * b)); // → Optional.empty
console.log(Stream.of('ab', 'cde', 'f').reduce(0, (n, s) => n + s.length, (a, b) => a + b)); // → 6

// collect, manual form
const arr = Stream.of(1, 2, 3).collect(
  () => [] as number[],
  (a, x) => a.push(x * 2),
  (a, b) => a.push(...b),
);
console.log(arr); // → [ 2, 4, 6 ]

// toList and toArray
const list = Stream.of(1, null, 3).toList();
console.log(list); // → [1, null, 3]
try {
  list.add(4);
} catch (e) {
  console.log((e as Error).name); // → UnsupportedOperationException
}
const ints = Stream.of(1, 2, 3).toArray((n) => new Int32Array(n));
console.log(ints instanceof Int32Array); // → true
try {
  Stream.of(1, 2).toArray((n) => new Array<number>(n + 1));
} catch (e) {
  console.log((e as Error).name, (e as Error).message); // → IllegalStateException array length 3 is not the stream size 2
}

// min, max, count
const words = () => Stream.of('kiwi', 'banana', 'fig');
console.log(words().max(Comparator.comparing((s: string) => s.length))); // → Optional[banana]
const seen: string[] = [];
console.log(words().peek((w) => seen.push(w)).count(), seen.length); // → 3 0

// matching and finding
console.log(Stream.empty<number>().allMatch(() => false)); // → true
let tested = 0;
Stream.of(1, 2, 3, 4).anyMatch((x) => (tested++, x === 2));
console.log(tested); // → 2
console.log(Stream.of(4, 5, 6).filter((x) => x > 4).findFirst()); // → Optional[5]
try {
  Stream.of(null, 1).findFirst();
} catch (e) {
  console.log((e as Error).name); // → NullPointerException
}

// pulling
const it = Stream.iterate(1, (x) => x * 3).iterator();
console.log(it.next(), it.next(), it.next()); // → 1 3 9
```

## Exceptions

| Exception | When |
|---|---|
| `IllegalStateException` | the stream was already operated upon or closed; `toArray(generator)` returned the wrong length; `Collectors.toMap` met a duplicate key |
| `NullPointerException` | a required function argument is `null` (`sorted(null)`, `filter(null)`); `findFirst`/`findAny`/`min`/`max`/`reduce(op)` would return `null` |
| `IllegalArgumentException` | `limit`/`skip` with a negative or non-integer count |
| `ClassCastException` | natural-order comparison of values that are not comparable |
| `UnsupportedOperationException` | modifying the list from `toList()` |
| `IndexOutOfBoundsException` | `toArray(generator)` returned a too-short array for an unsized stream |

Exceptions thrown by callbacks propagate unchanged out of the terminal operation, except in
`Gatherers.mapConcurrent` (see [gatherers](/streams/gatherers/#built-in-gatherers)).
