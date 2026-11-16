---
title: Optional
description: Optional and the number optionals - creating, reading, transforming, equality and the null rules.
sidebar:
  order: 6
---

`Optional<T>` holds one non-null value or nothing. Stream operations that may have no result (`findFirst`, `min`,
`max`, `reduce(op)`, `Collectors.minBy`) return one instead of `null`. Use it for return values that may be absent;
for fields and parameters `T | null` is usually simpler.

## API

| Method | Present | Empty |
|---|---|---|
| `Optional.of(v)` | holds `v`; `null`/`undefined` throws `NullPointerException` | |
| `Optional.ofNullable(v)` | holds `v` | for `null`/`undefined` |
| `Optional.empty()` | | a shared empty instance |
| `get()`, `orElseThrow()` | the value | throws `NoSuchElementException` ("No value present") |
| `orElseThrow(supplier)` | the value | throws what `supplier()` returns |
| `orElse(other)` | the value | `other`, evaluated eagerly; `orElse(null)` is allowed |
| `orElseGet(supplier)` | the value | `supplier()`, called only when empty |
| `isPresent()`, `isEmpty()` | `true`, `false` | `false`, `true` |
| `map(f)` | `ofNullable(f(value))` | empty |
| `flatMap(f)` | `f(value)`, an `Optional`; `null` throws `NullPointerException` | empty |
| `filter(p)` | itself if `p(value)`, else empty | empty |
| `or(supplier)` | itself | `supplier()`, another optional |
| `ifPresent(a)`, `ifPresentOrElse(a, emptyA)` | `a(value)` | nothing / `emptyA()` |
| `stream()` | one element | no elements |
| `equals`, `hashCode`, `toString` | equal values (`equals` semantics); the value's hash; `Optional[v]` | equal to empty; `0`; `Optional.empty` |

```ts
import { Optional, Stream, IllegalArgumentException } from '@ylcnfrht/collections';

type User = { name: string; email?: string; manager?: User };
const ann: User = { name: 'Ann', email: 'ann@example.com' };
const bob: User = { name: 'Bob', manager: ann };

console.log(Optional.of(ann).map((u) => u.email)); // → Optional[ann@example.com]
console.log(Optional.of(bob).map((u) => u.email)); // → Optional.empty
console.log(Optional.of(bob).flatMap((u) => Optional.ofNullable(u.manager)).map((m) => m.name)); // → Optional[Ann]
console.log(Optional.of(17).filter((age) => age >= 18).orElse(0)); // → 0
console.log(Optional.empty<string>().or(() => Optional.of('fallback'))); // → Optional[fallback]

const none = Optional.empty<number>();
console.log(none.orElseGet(() => 6 * 7)); // → 42
try {
  none.orElseThrow(() => new IllegalArgumentException('no config'));
} catch (e) {
  console.log((e as Error).name, (e as Error).message); // → IllegalArgumentException no config
}

// drop empty optionals from a stream
const lookups = Stream.of(Optional.of(1), Optional.empty<number>(), Optional.of(3));
console.log(lookups.flatMap((o) => o.stream()).toList()); // → [1, 3]
```

Prefer `orElseGet` when the fallback is expensive: `orElse(compute())` always calls `compute()`.

## Null rules

- An `Optional` never holds `null` or `undefined`: `of(null)` throws, `ofNullable(null)` and `map(() => null)` give
  empty.
- The function arguments of `map`, `flatMap`, `filter`, `or` and `ifPresentOrElse` throw `NullPointerException` when
  `null`, even on an empty optional. `ifPresent` and `orElseGet` check theirs only when they would call it.
- `orElse(null)` and `orElseGet(() => null)` return `null` when empty (typed `T | null`).
- Stream terminals that return an `Optional` throw `NullPointerException` if the chosen element is `null`; filter
  nulls out first. See [null and errors](/concepts/null-and-errors/).

```ts
import { Optional, Stream } from '@ylcnfrht/collections';

console.log(Optional.empty<string | null>().orElse(null)); // → null
try {
  Optional.of(1).flatMap(() => null as never);
} catch (e) {
  console.log((e as Error).name); // → NullPointerException
}
console.log(Stream.of(null, 'a').filter((x) => x !== null).findFirst()); // → Optional[a]
```

## Number optionals

`OptionalInt`, `OptionalLong` and `OptionalDouble` are returned by [number streams](/streams/number-streams/). They have
`of`, `empty`, `isPresent`, `isEmpty`, `ifPresent`, `ifPresentOrElse`, `orElse`, `orElseGet`, `orElseThrow`,
`stream()` (a number stream), `equals`, `hashCode`, `toString` and a typed getter (`getAsInt()`, `getAsLong()`,
`getAsDouble()`). They have no `map`, `filter` or `flatMap`; call `boxed()` on the stream to get an
`Optional<number>`.

Optionals of different number types are never equal. `OptionalDouble` treats `NaN` as equal to `NaN` and `0` as
different from `-0`, and prints doubles the JDK way (`1.0`, `1.0E21`).

```ts
import { IntStream, OptionalInt, OptionalDouble } from '@ylcnfrht/collections';

const max = IntStream.of(3, 9, 4).max();
console.log(max, max.getAsInt()); // → OptionalInt[9] 9
console.log(IntStream.empty().min().orElse(-1)); // → -1
console.log(OptionalDouble.of(1), OptionalDouble.of(1e21)); // → OptionalDouble[1.0] OptionalDouble[1.0E21]
console.log(OptionalDouble.empty().equals(OptionalInt.empty())); // → false
console.log(OptionalDouble.of(NaN).equals(OptionalDouble.of(NaN)), OptionalDouble.of(0).equals(OptionalDouble.of(-0))); // → true false
```
