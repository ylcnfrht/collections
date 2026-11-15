---
title: Gatherers
description: Custom intermediate stream operations - the built-in Gatherers and writing your own with Gatherer.ofSequential and Integrator.
sidebar:
  order: 5
---

A gatherer is a custom intermediate operation, applied with `stream.gather(gatherer)`. Unlike a
[collector](/collections/streams/collectors/), which reduces the stream at the end, a gatherer transforms it while it flows: one
element to many or many to one, with state, extra elements at the end, and an early stop. Number streams have no
`gather`.

## How a gatherer works

| Part | Signature | Default |
|---|---|---|
| initializer | `() => state` | `null` state |
| integrator (required) | `(state, element, downstream) => boolean` | |
| combiner | `(left, right) => state` | none: sequential-only |
| finisher | `(state, downstream) => void` | does nothing |

The initializer runs once. The integrator runs per element and may call `downstream.push(x)` any number of times;
`push` returns `false` once the downstream wants no more (for example, a `limit` was reached). The integrator
returns `true` to continue or `false` to stop the upstream; returning `downstream.push(x)` stops exactly when the
downstream does. The finisher runs once, after the last element or after a stop, and can push what is left in the
state. `downstream.isRejecting()` is `true` once a `push` would be ignored: check it before expensive work and in
finishers.

## Built-in gatherers

All are sequential.

| Gatherer | Emits | Input → output |
|---|---|---|
| `Gatherers.fold(initial, folder)` | one value at the end, also for an empty stream | `a, b, c` → `abc` |
| `Gatherers.scan(initial, scanner)` | every intermediate accumulation | `1, 2, 3, 4` → `1, 3, 6, 10` |
| `Gatherers.windowFixed(n)` | unmodifiable lists of `n`, the last may be shorter | `1..5`, n=2 → `[1, 2], [3, 4], [5]` |
| `Gatherers.windowSliding(n)` | overlapping unmodifiable lists of `n`; one shorter window if the stream has fewer than `n` | `1..4`, n=2 → `[1, 2], [2, 3], [3, 4]` |
| `Gatherers.mapConcurrent(max, f)` | `f(e)`, like `map` | see below |

A window size below 1 throws `IllegalArgumentException`.

`mapConcurrent` keeps the JDK signature but runs nothing concurrently: `f` is called synchronously, in order.
`max` must be at least 1 and is otherwise ignored. Promises are not awaited; for real concurrency, map to promises
and use `Promise.all`. A mapper error that is not a `RuntimeException` is wrapped in one, with the original as its
`cause`.

```ts
import { Stream, Gatherers, List } from '@ylcnfrht/collections';

console.log(Stream.of('a', 'b', 'c').gather(Gatherers.fold(() => '', (acc: string, s: string) => acc + s)).toList()); // → [abc]
console.log(Stream.of(1, 2, 3, 4).gather(Gatherers.scan(() => 0, (acc: number, x: number) => acc + x)).toList()); // → [1, 3, 6, 10]
console.log(Stream.of(1, 2, 3, 4).gather(Gatherers.windowSliding(2)).toList()); // → [[1, 2], [2, 3], [3, 4]]
console.log(Stream.of(1, 2).gather(Gatherers.windowSliding(3)).toList()); // → [[1, 2]]

try {
  Stream.of(1).gather(Gatherers.mapConcurrent(2, () => {
    throw new Error('boom');
  })).toList();
} catch (e) {
  console.log((e as Error).name, (e as Error).message); // → RuntimeException Error: boom
}

// a.andThen(b) is one gatherer, the same as .gather(a).gather(b)
const pairSums = Gatherers.windowFixed<number>(2).andThen(
  Gatherers.scan(() => 0, (acc: number, w: List<number>) => acc + w.stream().mapToInt((x) => x).sum()),
);
console.log(Stream.of(1, 2, 3, 4, 5, 6).gather(pairSums).toList()); // → [3, 10, 21]
```

## Writing your own

Use `Gatherer.ofSequential(initializer?, integrator, finisher?)`. Wrap the integrator in `Integrator.ofGreedy(…)`
when it never stops on its own (it only returns `true` or what `push` returns): it lets the engine skip
short-circuit checks. `Integrator.of(…)` marks one that may stop by itself.

```ts
import { Stream, Gatherer, Integrator, HashSet, Downstream, List } from '@ylcnfrht/collections';

// keep the first element for each key
function distinctBy<T, K>(key: (t: T) => K) {
  return Gatherer.ofSequential(
    () => new HashSet<K>(),
    Integrator.ofGreedy((seen: HashSet<K>, e: T, down: Downstream<T>) => (seen.add(key(e)) ? down.push(e) : true)),
  );
}
console.log(Stream.of('apple', 'avocado', 'banana', 'cherry').gather(distinctBy((s: string) => s[0])).toList()); // → [apple, banana, cherry]

// group consecutive elements; the finisher emits the last chunk
function chunkWhile<T>(together: (prev: T, next: T) => boolean) {
  type State = { chunk: T[] };
  return Gatherer.ofSequential(
    (): State => ({ chunk: [] }),
    Integrator.ofGreedy((s: State, e: T, down: Downstream<List<T>>) => {
      if (s.chunk.length > 0 && !together(s.chunk[s.chunk.length - 1], e)) {
        const full = s.chunk;
        s.chunk = [];
        if (!down.push(List.of(...full))) return false;
      }
      s.chunk.push(e);
      return true;
    }),
    (s: State, down: Downstream<List<T>>) => {
      if (s.chunk.length > 0 && !down.isRejecting()) down.push(List.of(...s.chunk));
    },
  );
}
console.log(Stream.of(1, 2, 4, 5, 6, 9).gather(chunkWhile((a: number, b: number) => b === a + 1)).toList()); // → [[1, 2], [4, 5, 6], [9]]

// short-circuit: elements up to and including the first match, on an infinite stream
const takeUntil = <T>(stop: (t: T) => boolean) =>
  Gatherer.ofSequential(Integrator.of((_s: null, e: T, down: Downstream<T>) => down.push(e) && !stop(e)));
console.log(Stream.iterate(1, (x) => x + 1).gather(takeUntil((x: number) => x * x > 10)).toList()); // → [1, 2, 3, 4]
```

A gatherer can also be a plain object with an `integrator()` method; missing members take their defaults:

```ts
import { Stream, Downstream } from '@ylcnfrht/collections';

const tag = { integrator: () => (_state: unknown, e: number, down: Downstream<string>) => down.push(`#${e}`) };
console.log(Stream.of(1, 2).gather(tag).toList()); // → [#1, #2]
```

## Gatherer.of and the arity rule

| Factory | Combiner | Forms |
|---|---|---|
| `Gatherer.ofSequential(…)` | none (sequential-only) | `(integrator)`, `(initializer, integrator)`, `(integrator, finisher)`, `(initializer, integrator, finisher)` |
| `Gatherer.of(…)` | parallel-capable | `(integrator)`, `(integrator, finisher)` (stateless), `(initializer, integrator, combiner, finisher)` |

Evaluation is always sequential, so `Gatherer.of` only declares that the gatherer is parallel-safe; its combiner
must then merge two states correctly. The defaults are `Gatherer.defaultInitializer()`, `defaultCombiner()` (throws
`UnsupportedOperationException` when called) and `defaultFinisher()`.

`ofSequential(a, b)` has two overloads with two functions, `(initializer, integrator)` and `(integrator, finisher)`.
The library tells them apart by the first function's declared parameter count (`fn.length`): a function with no
parameters that is not greedy is an initializer, anything else an integrator.

:::caution
An integrator that declares no parameters (`() => true`, or one using `arguments`) is read as an initializer. Wrap
it in `Integrator.ofGreedy(…)` or use the three-argument form.
:::

```ts
import { Stream, Gatherer, Downstream } from '@ylcnfrht/collections';

// no parameters: (initializer, integrator)
const withState = Gatherer.ofSequential(
  () => ({ seen: 0 }),
  (s: { seen: number }, e: number, down: Downstream<string>) => down.push(`${++s.seen}:${e}`),
);
console.log(Stream.of(7, 8).gather(withState).toList()); // → [1:7, 2:8]

// parameters: (integrator, finisher)
const withEnd = Gatherer.ofSequential(
  (_s: null, e: number, down: Downstream<number>) => down.push(e),
  (_s: null, down: Downstream<number>) => {
    down.push(-1);
  },
);
console.log(Stream.of(7, 8).gather(withEnd).toList()); // → [7, 8, -1]
```
