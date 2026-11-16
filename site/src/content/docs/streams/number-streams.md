---
title: Number streams
description: IntStream, LongStream and DoubleStream - factories, sum and average, summary statistics, conversions and how they differ from the JDK.
sidebar:
  order: 3
---

`IntStream`, `LongStream` and `DoubleStream` are streams of JS `number`s with aggregates (`sum`, `average`, `min`,
`max`, `summaryStatistics`) that return plain numbers or number optionals. They follow the same rules as `Stream`
(see the [overview](/streams/overview/)) and share most of its [operations](/streams/operations/).

## Creating

| Factory | Int | Long | Double |
|---|---|---|---|
| `of(…)`, `ofArray(array)`, `empty()`, `builder()`, `concat(a, b)` | yes | yes | yes |
| `iterate(seed, f)`, `iterate(seed, hasNext, next)`, `generate(s)` | yes | yes | yes |
| `range(start, end)` (end exclusive), `rangeClosed(start, end)` | yes | yes | |
| `stream.mapToInt/Long/Double(f)` | yes | yes | yes |

```ts
import { IntStream, LongStream, DoubleStream } from '@ylcnfrht/collections';

console.log(IntStream.range(0, 4).toArray()); // → [ 0, 1, 2, 3 ]
console.log(IntStream.range(5, 1).count()); // → 0
console.log(LongStream.rangeClosed(1, 15).reduce(1, (a, b) => a * b)); // → 1307674368000
console.log(IntStream.iterate(0, (i) => i < 10, (i) => i + 3).toArray()); // → [ 0, 3, 6, 9 ]
console.log(DoubleStream.iterate(1, (x) => x / 2).limit(4).toArray()); // → [ 1, 0.5, 0.25, 0.125 ]
```

## Aggregates

| Operation | Returns | Empty stream |
|---|---|---|
| `sum()`, `count()` | `number` | `0` |
| `average()` | `OptionalDouble` | empty |
| `min()`, `max()`, `reduce(op)` | `OptionalInt` / `OptionalLong` / `OptionalDouble` | empty |
| `reduce(identity, op)` | `number` | `identity` |
| `summaryStatistics()` | `Int/Long/DoubleSummaryStatistics` | count 0 |

`summaryStatistics()` computes count, sum, min, max and average in one pass. The same objects come from
`Collectors.summarizingInt/Long/Double`, and you can build them yourself with `accept(value)` and
`combine(other)`. `toString()` prints the average (for doubles also sum, min and max) with six decimals; empty
statistics report min and max as the identity values (`2147483647`/`-2147483648` for int, `Infinity`/`-Infinity`
for double). `new IntSummaryStatistics(count, min, max, sum)` rebuilds stored statistics and throws
`IllegalArgumentException` when `count < 0` or `min > max`. The number optionals are covered in
[Optional](/streams/optional/#number-optionals).

```ts
import { IntStream, IntSummaryStatistics } from '@ylcnfrht/collections';

const scores = () => IntStream.of(70, 85, 90);
console.log(scores().sum()); // → 245
console.log(scores().average()); // → OptionalDouble[81.66666666666667]
console.log(scores().max().getAsInt()); // → 90
console.log(IntStream.empty().average().orElse(0)); // → 0

const st = IntStream.of(4, 8, 15, 16, 23, 42).summaryStatistics();
console.log(st.getCount(), st.getSum(), st.getMin(), st.getMax(), st.getAverage()); // → 6 108 4 42 18
console.log(st.toString()); // → IntSummaryStatistics{count=6, sum=108, min=4, average=18.000000, max=42}

const manual = new IntSummaryStatistics();
manual.accept(10);
manual.combine(IntStream.of(3, 20).summaryStatistics());
console.log(manual.toString()); // → IntSummaryStatistics{count=3, sum=33, min=3, average=11.000000, max=20}
console.log(new IntSummaryStatistics().toString()); // → IntSummaryStatistics{count=0, sum=0, min=2147483647, average=0.000000, max=-2147483648}
try {
  new IntSummaryStatistics(2, 6, 5, 6);
} catch (e) {
  console.log((e as Error).name, (e as Error).message); // → IllegalArgumentException Minimum greater than maximum
}
```

## Compensated double sums

`DoubleStream.sum()`, `average()`, `summaryStatistics()` and `Collectors.summingDouble/averagingDouble/summarizingDouble`
use compensated (Kahan) summation, so rounding error does not accumulate. A plain `reduce` does not compensate.
`IntStream` and `LongStream` sums are plain additions. `NaN` and infinities propagate.

```ts
import { DoubleStream } from '@ylcnfrht/collections';

const tenths = Array.from({ length: 10 }, () => 0.1);
console.log(tenths.reduce((a, b) => a + b)); // → 0.9999999999999999
console.log(DoubleStream.ofArray(tenths).sum()); // → 1
console.log(DoubleStream.ofArray(tenths).reduce(0, (a, b) => a + b)); // → 0.9999999999999999
```

## Converting between stream types

| From | Operation | To |
|---|---|---|
| `Stream<T>` | `mapToInt/Long/Double`, `flatMapToX`, `mapMultiToX` | number stream |
| any number stream | `boxed()` | `Stream<number>` |
| any number stream | `mapToObj(f)` | `Stream<U>` |
| `IntStream` | `asLongStream()`, `asDoubleStream()`, `mapToLong`, `mapToDouble` | Long / Double |
| `LongStream` | `asDoubleStream()`, `mapToInt`, `mapToDouble` | Int / Double |
| `DoubleStream` | `mapToInt`, `mapToLong` | Int / Long |

Number streams only have the three-argument `collect(supplier, acc, combiner)`; passing a `Collector` throws
`IllegalArgumentException`. Call `boxed()` first to use one.

```ts
import { IntStream, Collectors } from '@ylcnfrht/collections';

console.log(IntStream.range(0, 3).mapToObj((i) => 'abc'[i]).toList()); // → [a, b, c]
console.log(IntStream.of(1, 2).boxed().collect(Collectors.toList())); // → [1, 2]
console.log(IntStream.of(1, 2).asDoubleStream().map((x) => x / 4).toArray()); // → [ 0.25, 0.5 ]
```

## Differences from `Stream`

- `sorted()` takes no comparator and sorts ascending; for any other order use `boxed().sorted(cmp)`. Passing a
  comparator from JS throws `IllegalArgumentException`.
- No `gather`.
- `iterator()` returns a primitive iterator with `nextInt()`, `nextLong()` or `nextDouble()` besides
  `hasNext()`/`next()`.

```ts
import { IntStream } from '@ylcnfrht/collections';

console.log(IntStream.of(3, 1, 3, 2).distinct().sorted().toArray()); // → [ 1, 2, 3 ]
const it = IntStream.range(0, 3).iterator();
console.log(it.nextInt(), it.next(), it.hasNext()); // → 0 1 true
```

## Differences from the JDK

| Topic | JDK | This library |
|---|---|---|
| `IntStream` values | 32-bit `int`, arithmetic wraps | JS numbers: no 32-bit coercion, `sum()` does not wrap, non-integers stay as they are |
| `LongStream` values | 64-bit `long` | exact only up to `Number.MAX_SAFE_INTEGER`; use `bigint` in a `Stream<bigint>` beyond that |
| `DoubleStream.distinct()` / `sorted()` | `-0.0` differs from `0.0`, `NaN` equals `NaN`, `NaN` sorts last | the same |
| `Stream<number>.distinct()` | | `-0` equals `0`, `NaN` equals `NaN` |

```ts
import { IntStream, LongStream, DoubleStream, Stream } from '@ylcnfrht/collections';

console.log(IntStream.of(2147483647, 1).sum()); // → 2147483648
console.log(LongStream.of(Number.MAX_SAFE_INTEGER, 2).sum()); // → 9007199254740992
console.log(Stream.of(BigInt(Number.MAX_SAFE_INTEGER), 2n).reduce(0n, (a, b) => a + b)); // → 9007199254740993n
console.log(DoubleStream.of(0.0, -0.0, 0.0).distinct().count()); // → 2
console.log(DoubleStream.of(0.0, -0.0, NaN, -1).sorted().toArray()); // → [ -1, -0, 0, NaN ]
console.log(Stream.of(0, -0).distinct().count()); // → 1
```
