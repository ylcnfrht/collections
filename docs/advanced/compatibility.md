# Compatibility with the Java API

The library follows the Java Collections Framework: the same method names, results, exceptions and edge cases. Where TypeScript or the JS runtime makes an exact copy impossible or harmful, it adapts in a small, documented set of ways. This page lists those adaptations, the stream differences, the reference behaviours it deliberately does not copy, and the APIs newer than the reference runtime used for testing.

## TypeScript adaptations

| Classic API | Here | Why |
|---|---|---|
| `list.remove(int index)` | `list.removeAt(index)` | On a `List<number>`, `remove(1)` could mean either; `remove(o)` always means "the element equal to `o`". |
| `Comparator` objects with default methods (`c.reversed()`, `c.thenComparing(…)`) | comparators are functions `(a, b) => number`; the helpers are on the `Comparator` object: `Comparator.reversed(c)`, `Comparator.thenComparing(c1, c2)`, `Comparator.thenComparingBy(c, key)` | Lambdas are plain functions, and functions cannot carry default methods without wrapping. |
| Functional interfaces (`Predicate`, `Function`, `BiFunction`, `Supplier`, `Consumer`, …) | plain functions | Same reason. `Predicate.not(p)` becomes `(x) => !p(x)`. |
| `Set`, `Map`, `Iterator`, `List` type names | same names | They shadow the JS globals in a module that imports them; alias (`import { Map as CMap }`) or use `globalThis.Map`. |
| `new TreeMap(SortedMap)` vs `new TreeMap(Map)`, likewise `TreeSet`, `PriorityQueue` | one constructor; a *sorted* source always keeps its comparator | Overloads are resolved at compile time in the reference; here the static type is gone at run time, so the runtime type decides. |
| `Gatherer.ofSequential(a, b)` | resolved by the first function's arity | Both two-argument overloads take two functions. A first function declaring no parameters is the initializer (`ofSequential(initializer, integrator)`); otherwise it is `ofSequential(integrator, finisher)`. Use `Integrator.ofGreedy` or the 3-argument form if your integrator declares no parameters. |
| `AutoCloseable` streams with try-with-resources | `close()`, plus `[Symbol.dispose]()` so `using s = …` works | The JS explicit-resource-management protocol, present where the runtime defines `Symbol.dispose`. |
| Static factories `List.of`, `Set.of`, `Map.of`, `Map.entry` | same, on the `List`/`Set`/`Map` objects | `List`, `Set`, `Map` are both interfaces and factory objects. |
| Absent results | `null` (never `undefined`) | Matches the reference; collections that reject `null` also reject `undefined`. |
| JS extras | `ArrayList.of(...)`, `HashMap.of([k, v], …)`, `Stream.from(iterable)`, `Stream.ofArray(arr)`, `[Symbol.iterator]` on every collection and stream | Convenience; not in the reference. |

A sorted source keeps its comparator, even when passed where a plain `Map` is expected:

```ts
import { TreeMap, Map } from '@nodestd/collections';

const desc = new TreeMap<number, string>((a, b) => b - a);
desc.put(1, 'one');
desc.put(2, 'two');

const asMap: Map<number, string> = desc;
const copy = new TreeMap<number, string>(asMap);
console.log(copy.toString());           // → {2=two, 1=one}
console.log(copy.comparator() !== null); // → true
```

`Gatherer.ofSequential` with the two shapes:

```ts
import { Stream, Gatherer, Integrator, Downstream } from '@nodestd/collections';

// () => state: an initializer, so this is ofSequential(initializer, integrator)
const runningSum = Gatherer.ofSequential(
  () => ({ sum: 0 }),
  Integrator.ofGreedy((s: { sum: number }, x: number, down: Downstream<number>) => down.push((s.sum += x))),
);
console.log(Stream.of(1, 2, 3).gather(runningSum).toList().toString()); // → [1, 3, 6]

// (state, element, downstream) => …: an integrator, so this is ofSequential(integrator, finisher)
const withEnd = Gatherer.ofSequential(
  (_s: null, x: string, down: Downstream<string>) => down.push(x),
  (_s: null, down: Downstream<string>) => { down.push('END'); },
);
console.log(Stream.of('a', 'b').gather(withEnd).toList().toString()); // → [a, b, END]
```

Streams close with `using`:

```ts
import { List } from '@nodestd/collections';

let closed = false;
{
  using s = List.of(1, 2, 3).stream().onClose(() => { closed = true; });
  console.log(s.count()); // → 3
}
console.log(closed); // → true
```

## Behaviour when a callback throws

`removeIf` follows the reference when the predicate throws or modifies the collection. `ArrayList` and `Vector`
test every element first and remove nothing. `LinkedList` removes as it goes, so elements removed before the throw
stay removed. These calls differ from the reference:

| Call | Reference | Here |
|---|---|---|
| `Vector.subList(…).removeIf` | removes as it goes | tests first, removes nothing on a throw (as `ArrayList.subList`) |
| `reversed().removeAll`/`retainAll` | removes through the view, testing in view order | one `removeIf` on the base, testing in base order (linear instead of quadratic), so a different subset is removed when `contains` throws |
| `Collections.sort`/`List.sort` with a comparator that throws | may leave the list partly sorted | leaves it unchanged |

## Stream differences

| Topic | Reference | Here |
|---|---|---|
| `parallel()` / `parallelStream()` | runs on a thread pool | only sets the flag (`isParallel()` is `true`); evaluation is sequential. Results of order-independent and encounter-order terminals are the same; side-effect order is the sequential one. |
| `Gatherers.mapConcurrent` | maps ahead on virtual threads | maps sequentially, in order; same results and exception types |
| `LongStream` | 64-bit `long` | JS `number`, exact up to `Number.MAX_SAFE_INTEGER` (2^53 − 1); no `bigint` |
| `IntStream` | 32-bit, wraps on overflow | values are not coerced to 32 bits and `sum()` does not wrap |
| Spliterator sizes | `long`, `Long.MAX_VALUE` when unknown | numbers; unknown size is `Infinity` |
| `-0` vs `0` | `-0.0` and `0.0` differ for doubles | `DoubleStream.distinct()`/`sorted()` keep them apart like the reference; everywhere else (`Stream.distinct`, sets, maps, `equals`) `-0` equals `0` (SameValueZero) |
| `iterator()`/`spliterator()` over `flatMap` | buffers the whole mapped stream | pulls it one element at a time (an infinite inner stream still yields); an upstream `peek` may observe fewer elements |

```ts
import { List, LongStream, IntStream, DoubleStream, Stream } from '@nodestd/collections';

console.log(List.of(1, 2).parallelStream().isParallel());          // → true
console.log(IntStream.of(2147483647, 1).sum());                    // → 2147483648
console.log(LongStream.of(Number.MAX_SAFE_INTEGER).sum());          // → 9007199254740991
console.log(Stream.iterate(1, (x) => x + 1).spliterator().estimateSize()); // → Infinity
console.log(DoubleStream.of(0, -0).distinct().count(), Stream.of(0, -0).distinct().count()); // → 2 1
```

## Reference quirks we deliberately do not copy

The [differential tests](./testing.md#differential-testing-against-the-jdk) found a few places where the JDK contradicts its own documented
contract. In each case this library follows the documentation:

| Quirk in the reference | What the contract says / what we do |
|---|---|
| `HashMap`/`HashSet` spliterators drop `SIZED` from `characteristics()` after traversal begins (also through `synchronizedSet`, `unmodifiableSet`, `checkedSet`) | characteristics must be stable; ours keeps `SIZED` |
| The `ListIterator` of a `reversed()` list view (on `ArrayList`, `LinkedList`, `Vector`, `Stack`, `AbstractList` subclasses, and their `subList`s) accepts `set()`/`remove()` right after `add()` | `ListIterator` specifies `IllegalStateException` there; ours throws it |
| `ArrayList.subList(…).replaceAll` does not check for a structural change of the list since the view was made | sublists are fail-fast; ours throws `ConcurrentModificationException` |
| `reversed()` of an unmodifiable or synchronized sorted set/map uses a generic view: `add` of an element already present returns `true`, and `compute`/`merge` may run before the unsupported write is refused | ours refuses the write with `UnsupportedOperationException` up front and keeps set semantics |

```ts
import { ArrayList } from '@nodestd/collections';

const it = ArrayList.of('a').reversed().listIterator(1);
it.add('bb');
try {
  it.remove(); // not allowed right after add()
} catch (e) {
  console.log((e as Error).name); // → IllegalStateException
}
```

The full list, with a minimal reproduction script for each, is in the generated
[compatibility report](../COMPATIBILITY.md#divergences).

## APIs newer than the JDK

A few APIs are newer than the JDK version used by the differential tests (the report states the
exact version). They are implemented from their specification and covered by unit tests, but are excluded from the
differential comparison:

| API | What it does |
|---|---|
| `List.ofLazy(size, fn)`, `Set.ofLazy(candidates, fn)`, `Map.ofLazy(keys, fn)` | unmodifiable collections whose elements/values are computed on first access, at most once (preview API) |
| `Comparator.max(c, a, b)`, `Comparator.min(c, a, b)` | the larger/smaller of two values under a comparator |

```ts
import { List, Comparator } from '@nodestd/collections';

let calls = 0;
const squares = List.ofLazy(5, (i) => { calls++; return i * i; });
console.log(squares.get(3), calls); // → 9 1
console.log(squares.get(3), calls); // → 9 1
console.log(Comparator.max(Comparator.naturalOrder<string>(), 'pear', 'apple')); // → pear
```

## How compatibility is verified

Every interface and class was audited member by member against the Java API documentation: names, argument handling, return values and thrown exceptions. The test suite then checks that behaviour in four layers: contract suites, a black-box conformance suite written from the documentation, model-based random tests, and differential testing against a real JDK. In the latest proof run, 1,692,438 operations were compared and no divergence was classified as a library bug. Every divergence is either an intentional difference listed on this page or a reference quirk.

[How the library is tested](./testing.md#differential-testing-against-the-jdk) explains the differential harness and how to run it. The generated [compatibility report](../COMPATIBILITY.md) lists every normalisation, every divergence with a minimal reproduction, and the per-member API coverage.
