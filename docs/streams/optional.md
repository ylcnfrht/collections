# Optional

`Optional<T>` holds either one non-null value or nothing. Stream operations that may have no result
(`findFirst`, `min`, `max`, `reduce(op)`, `Collectors.minBy`) return an `Optional` instead of `null`. The empty
case is then visible in the type and handled with `orElse`, `map` or `ifPresent` instead of `null` checks.
`OptionalInt`, `OptionalLong` and `OptionalDouble` are the number variants returned by
[number streams](number-streams.md).

## Creating optionals

| Factory | Result |
|---|---|
| `Optional.of(value)` | an optional holding `value`; `null`/`undefined` throws `NullPointerException` |
| `Optional.ofNullable(value)` | holding `value`, or empty for `null`/`undefined` |
| `Optional.empty()` | the empty optional (a shared instance) |

```ts
import { Optional } from '@ylcnfrht/typescript-collection-framework';

console.log(Optional.of('ts')); // → Optional[ts]
console.log(Optional.ofNullable(null)); // → Optional.empty
console.log(Optional.ofNullable(undefined).isEmpty()); // → true
console.log(Optional.empty<number>().isPresent()); // → false
try {
  Optional.of(null);
} catch (e) {
  console.log((e as Error).name); // → NullPointerException
}
```

## Getting the value out

| Method | Present | Empty |
|---|---|---|
| `get()` / `orElseThrow()` | the value | throws `NoSuchElementException` ("No value present") |
| `orElseThrow(supplier)` | the value | throws what `supplier()` returns |
| `orElse(other)` | the value | `other` (evaluated eagerly) |
| `orElseGet(supplier)` | the value | `supplier()` (evaluated only when empty) |
| `isPresent()` / `isEmpty()` | `true` / `false` | `false` / `true` |

```ts
import { Optional, IllegalArgumentException } from '@ylcnfrht/typescript-collection-framework';

const some = Optional.of(5);
const none = Optional.empty<number>();

console.log(some.get(), some.orElseThrow()); // → 5 5
console.log(none.orElse(0)); // → 0
console.log(none.orElseGet(() => 6 * 7)); // → 42

try {
  none.get();
} catch (e) {
  console.log((e as Error).name, (e as Error).message); // → NoSuchElementException No value present
}
try {
  none.orElseThrow(() => new IllegalArgumentException('no config'));
} catch (e) {
  console.log((e as Error).name, (e as Error).message); // → IllegalArgumentException no config
}
```

> [!TIP]
> Prefer `orElseGet` when the fallback is expensive: `orElse(compute())` always calls `compute()`, even when a
> value is present.

## Transforming: map, flatMap, filter, or

| Method | Present | Empty |
|---|---|---|
| `map(f)` | `Optional.ofNullable(f(value))` — empty if `f` returns `null`/`undefined` | empty |
| `flatMap(f)` | `f(value)`, which must return an `Optional` (`null` throws `NullPointerException`) | empty |
| `filter(p)` | itself if `p(value)`, else empty | empty |
| `or(supplier)` | itself | `supplier()` (another optional) |

```ts
import { Optional } from '@ylcnfrht/typescript-collection-framework';

type User = { name: string; email?: string; manager?: User };
const ann: User = { name: 'Ann', email: 'ann@example.com' };
const bob: User = { name: 'Bob', manager: ann };

console.log(Optional.of(ann).map((u) => u.email)); // → Optional[ann@example.com]
console.log(Optional.of(bob).map((u) => u.email)); // → Optional.empty

const managerOf = (u: User) => Optional.ofNullable(u.manager);
console.log(Optional.of(bob).flatMap(managerOf).map((m) => m.name)); // → Optional[Ann]

console.log(Optional.of(17).filter((age) => age >= 18)); // → Optional.empty
console.log(Optional.empty<string>().or(() => Optional.of('fallback'))); // → Optional[fallback]
```

## Side effects: ifPresent, ifPresentOrElse

`ifPresent(action)` calls `action(value)` when a value is present. `ifPresentOrElse(action, emptyAction)` also
calls `emptyAction()` when the optional is empty.

```ts
import { Optional } from '@ylcnfrht/typescript-collection-framework';

const log: string[] = [];
Optional.of('saved').ifPresent((v) => log.push(v));
Optional.empty<string>().ifPresent((v) => log.push(v));
Optional.empty<string>().ifPresentOrElse((v) => log.push(v), () => log.push('nothing to save'));
console.log(log); // → [ 'saved', 'nothing to save' ]
```

## stream()

`optional.stream()` is a stream of zero or one element. With `flatMap`, it drops the empty optionals from a stream
of optionals:

```ts
import { Stream, Optional } from '@ylcnfrht/typescript-collection-framework';

console.log(Optional.of('x').stream().map((s) => s + '!').toList()); // → [x!]

const lookups = Stream.of(Optional.of(1), Optional.empty<number>(), Optional.of(3));
console.log(lookups.flatMap((o) => o.stream()).toList()); // → [1, 3]
```

## equals, hashCode, toString

Two optionals are equal when both are empty or both hold equal values (`equals` semantics, so optionals of equal
lists are equal). `hashCode()` is the value's hash code, `0` when empty. `toString()` prints `Optional[value]` or
`Optional.empty`.

```ts
import { Optional, List } from '@ylcnfrht/typescript-collection-framework';

console.log(Optional.of(List.of(1)).equals(Optional.of(List.of(1)))); // → true
console.log(Optional.empty().equals(Optional.empty())); // → true
console.log(Optional.of(1).equals(Optional.of(2))); // → false
console.log(Optional.empty().hashCode()); // → 0
console.log(Optional.of(List.of(1, 2)).toString()); // → Optional[[1, 2]]
```

## Number optionals

`OptionalInt`, `OptionalLong` and `OptionalDouble` hold a `number`. They have `of`, `empty`, `isPresent`,
`isEmpty`, `ifPresent`, `ifPresentOrElse`, `orElse`, `orElseGet`, `orElseThrow`, `stream()` (an `IntStream`,
`LongStream` or `DoubleStream`), `equals`, `hashCode` and `toString`, plus a typed getter: `getAsInt()`,
`getAsLong()`, `getAsDouble()`. As in the Java API, they have no `map`, `filter` or `flatMap`. To get an
`Optional<number>`, box the stream first with `boxed()`.

```ts
import { IntStream, OptionalInt, OptionalLong, OptionalDouble } from '@ylcnfrht/typescript-collection-framework';

const max = IntStream.of(3, 9, 4).max();
console.log(max, max.getAsInt()); // → OptionalInt[9] 9
console.log(IntStream.empty().min().orElse(-1)); // → -1
console.log(OptionalLong.of(3)); // → OptionalLong[3]
console.log(OptionalDouble.of(1)); // → OptionalDouble[1.0]
console.log(OptionalDouble.of(1e21)); // → OptionalDouble[1.0E21]
console.log(OptionalInt.of(4).stream().sum()); // → 4

// different number types never compare equal
console.log(OptionalDouble.empty().equals(OptionalInt.empty())); // → false
// OptionalDouble compares like the Java API: NaN equals NaN, 0.0 differs from -0.0
console.log(OptionalDouble.of(NaN).equals(OptionalDouble.of(NaN)), OptionalDouble.of(0).equals(OptionalDouble.of(-0))); // → true false

try {
  OptionalInt.empty().getAsInt();
} catch (e) {
  console.log((e as Error).name); // → NoSuchElementException
}
```

`OptionalDouble.toString()` formats the number the way the Java API prints doubles (`1.0`, `1.0E21`).

## Null rules

- An `Optional` never holds `null` or `undefined`: `of(null)` throws, `ofNullable(null)` and `map(() => null)` are
  empty.
- `flatMap` must return an optional; returning `null` throws `NullPointerException`.
- Function arguments of `map`, `flatMap`, `filter`, `or` and `ifPresentOrElse` throw `NullPointerException` when
  `null`, even on an empty optional. `ifPresent` and `orElseGet` check theirs only when they would call it, as in
  the Java API.
- `orElse(null)` is allowed and returns `null` when empty (typed `T | null`). This is useful when handing a value
  to code that expects `null`. `orElseGet(() => null)` works the same way.
- Stream terminals that return an `Optional` throw `NullPointerException` if the chosen element is `null`
  (`Stream.of(null).findFirst()`). Filter out nulls first.

```ts
import { Optional, Stream } from '@ylcnfrht/typescript-collection-framework';

console.log(Optional.of(1).map(() => null).isPresent()); // → false
console.log(Optional.empty<string | null>().orElse(null)); // → null
try {
  Optional.of(1).flatMap(() => null as never);
} catch (e) {
  console.log((e as Error).name); // → NullPointerException
}
console.log(Stream.of(null, 'a').filter((x) => x !== null).findFirst()); // → Optional[a]
```

## Idioms: replacing null checks

```ts
import { Optional, Stream, HashMap } from '@ylcnfrht/typescript-collection-framework';

type Config = { db?: { host?: string; port?: number } };
const config: Config = { db: { host: 'localhost' } };

// nested lookups with defaults, instead of chained null checks
const port = Optional.ofNullable(config.db).map((db) => db.port).orElse(5432);
const host = Optional.ofNullable(config.db).map((db) => db.host).orElseThrow();
console.log(host, port); // → localhost 5432

// a map lookup that may miss
const prices = new HashMap<string, number>();
prices.put('tea', 3);
const price = (item: string) => Optional.ofNullable(prices.get(item));
console.log(price('tea').map((p) => p * 2).orElse(0), price('cake').map((p) => p * 2).orElse(0)); // → 6 0

// first match or a default
console.log(Stream.of('alpha', 'beta').filter((s) => s.startsWith('g')).findFirst().orElse('none')); // → none
```

> [!TIP]
> Use `Optional` for return values that may be absent. For fields and parameters, `T | null` is usually simpler.
