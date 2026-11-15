# Collectors

A collector describes a mutable reduction: how to create a container, add an element to it, merge two
containers, and turn the container into the final result. It is passed to `stream.collect(collector)`. This page
lists every `Collectors` method with an example, shows how to write a custom collector with `Collector.of`, and
ends with recipes.

## Overview

`Collectors` provides ready-made collectors for collections, maps, strings, numbers, grouping and partitioning.
Most accept a downstream collector, so they compose into one-pass aggregations.

| Category | Methods |
|---|---|
| Collections | `toList`, `toSet`, `toCollection`, `toUnmodifiableList`, `toUnmodifiableSet` |
| Maps | `toMap`, `toUnmodifiableMap`, `toConcurrentMap` |
| Strings | `joining` |
| Numbers | `counting`, `summingInt/Long/Double`, `averagingInt/Long/Double`, `summarizingInt/Long/Double` |
| Reductions | `minBy`, `maxBy`, `reducing` |
| Grouping | `groupingBy`, `groupingByConcurrent`, `partitioningBy` |
| Adapters | `mapping`, `filtering`, `flatMapping`, `collectingAndThen`, `teeing` |

Every example below is self-contained. Hash-based results are printed through `get` or collected into a
`TreeMap`, so the printed order is deterministic.

## To collections

| Collector | Result | Nulls | Modifiable |
|---|---|---|---|
| `toList()` | `ArrayList` | allowed | yes |
| `toSet()` | `HashSet` | allowed | yes |
| `toCollection(factory)` | whatever `factory()` returns | as the collection | as the collection |
| `toUnmodifiableList()` | unmodifiable list | `NullPointerException` | no |
| `toUnmodifiableSet()` | unmodifiable set (duplicates dropped) | `NullPointerException` | no |

> [!NOTE]
> `stream.toList()` is a stream method, not a collector. It returns an unmodifiable list that allows `null`,
> unlike `toUnmodifiableList()`.

```ts
import { Stream, Collectors, TreeSet, Comparator } from '@ylcnfrht/typescript-collection-framework';

const list = Stream.of('b', 'a', 'b').collect(Collectors.toList());
list.add('c');
console.log(list); // → [b, a, b, c]

console.log(Stream.of('b', 'a', 'b').collect(Collectors.toSet()).size()); // → 2

const desc = Stream.of('b', 'c', 'a').collect(Collectors.toCollection(() => new TreeSet<string>(Comparator.reverseOrder())));
console.log(desc); // → [c, b, a]

const frozen = Stream.of(1, 2).collect(Collectors.toUnmodifiableList());
try {
  frozen.add(3);
} catch (e) {
  console.log((e as Error).name); // → UnsupportedOperationException
}
try {
  Stream.of('x', null).collect(Collectors.toUnmodifiableList());
} catch (e) {
  console.log((e as Error).name); // → NullPointerException
}
console.log(Stream.of(1, 1, 2).collect(Collectors.toUnmodifiableSet()).size()); // → 2
```

## The toMap family

`toMap(keyMapper, valueMapper)` builds a `HashMap`. Pass a merge function to combine values for equal keys, and a
map factory to choose the map type (for example a `TreeMap` for sorted keys or a `LinkedHashMap` for encounter
order).

::: code-group

```ts [Basic]
import { Stream, Collectors } from '@ylcnfrht/typescript-collection-framework';

// word -> its length
const lengths = Stream.of('map', 'filter', 'reduce').collect(Collectors.toMap((w: string) => w, (w: string) => w.length));

console.log(lengths.get('filter')); // → 6
console.log(lengths.size()); // → 3
```

```ts [Intermediate]
import { Stream, Collectors, TreeMap } from '@ylcnfrht/typescript-collection-framework';

type Line = { sku: string; qty: number };
const cart: Line[] = [
  { sku: 'B-200', qty: 1 },
  { sku: 'A-100', qty: 2 },
  { sku: 'B-200', qty: 3 },
  { sku: 'C-300', qty: 1 },
];

// merge duplicate SKUs by adding quantities; TreeMap sorts by SKU
const quantities = Stream.ofArray(cart).collect(
  Collectors.toMap(
    (l: Line) => l.sku,
    (l: Line) => l.qty,
    (a: number, b: number) => a + b,
    () => new TreeMap<string, number>(),
  ),
);

console.log(quantities); // → {A-100=2, B-200=4, C-300=1}
```

:::

> [!WARNING]
> Without a merge function, keys must be unique. A duplicate key throws `IllegalStateException` with the message
> `Duplicate key K (attempted merging values V1 and V2)`. A `null` value throws `NullPointerException`, because
> the map's `merge` semantics do not allow it.

| Form | Duplicate keys | Map |
|---|---|---|
| `toMap(k, v)` | `IllegalStateException` | `HashMap` |
| `toMap(k, v, merge)` | `merge(old, new)` | `HashMap` |
| `toMap(k, v, merge, factory)` | `merge(old, new)` | `factory()` |
| `toUnmodifiableMap(k, v)` / `(k, v, merge)` | as above | unmodifiable, no null keys or values |
| `toConcurrentMap(…)` | as `toMap` | a map (same three forms; concurrency is moot in JS) |

```ts
import { Stream, Collectors, TreeMap, LinkedHashMap } from '@ylcnfrht/typescript-collection-framework';

type Emp = { name: string; dept: string; salary: number };
const staff: Emp[] = [
  { name: 'Ann', dept: 'eng', salary: 120 },
  { name: 'Bob', dept: 'eng', salary: 100 },
  { name: 'Cid', dept: 'ops', salary: 90 },
];

const salaryByName = Stream.ofArray(staff).collect(Collectors.toMap((e: Emp) => e.name, (e: Emp) => e.salary));
console.log(salaryByName.get('Bob')); // → 100

try {
  Stream.ofArray(staff).collect(Collectors.toMap((e: Emp) => e.dept, (e: Emp) => e.salary));
} catch (e) {
  console.log((e as Error).name); // → IllegalStateException
  console.log((e as Error).message); // → Duplicate key eng (attempted merging values 120 and 100)
}

const payroll = Stream.ofArray(staff).collect(
  Collectors.toMap((e: Emp) => e.dept, (e: Emp) => e.salary, (a: number, b: number) => a + b, () => new TreeMap<string, number>()),
);
console.log(payroll); // → {eng=220, ops=90}

const byName = Stream.ofArray(staff).collect(
  Collectors.toMap((e: Emp) => e.name, (e: Emp) => e.dept, (a: string) => a, () => new LinkedHashMap<string, string>()),
);
console.log(byName); // → {Ann=eng, Bob=eng, Cid=ops}

const frozen = Stream.ofArray(staff).collect(Collectors.toUnmodifiableMap((e: Emp) => e.name, (e: Emp) => e.salary));
try {
  frozen.put('Zed', 1);
} catch (e) {
  console.log((e as Error).name); // → UnsupportedOperationException
}
```

## joining

Concatenates `string` elements (a `null` element is written as `"null"`). Optional delimiter, prefix and suffix;
an empty stream gives `prefix + suffix`.

::: code-group

```ts [Basic]
import { Stream, Collectors } from '@ylcnfrht/typescript-collection-framework';

console.log(Stream.of('a', 'b', 'c').collect(Collectors.joining())); // → abc
console.log(Stream.of('a', 'b', 'c').collect(Collectors.joining(', '))); // → a, b, c
console.log(Stream.of('a', 'b').collect(Collectors.joining(', ', '[', ']'))); // → [a, b]
console.log(Stream.empty<string>().collect(Collectors.joining(', ', '[', ']'))); // → []
console.log(Stream.of(1, 2, 3).map(String).collect(Collectors.joining('-'))); // → 1-2-3
```

```ts [Intermediate]
import { Stream, Collectors } from '@ylcnfrht/typescript-collection-framework';

type User = { name: string; active: boolean };
const users: User[] = [
  { name: 'cid', active: true },
  { name: 'ann', active: true },
  { name: 'bob', active: false },
  { name: 'ann', active: true },
];

// distinct active users, sorted and capitalised, as one display line
const line = Stream.ofArray(users)
  .filter((u) => u.active)
  .map((u) => u.name)
  .distinct()
  .sorted()
  .map((n) => n[0].toUpperCase() + n.slice(1))
  .collect(Collectors.joining(', ', 'Active: ', '.'));

console.log(line); // → Active: Ann, Cid.
```

:::

## Counting, summing, averaging, summarizing

| Collector | Result | Empty stream |
|---|---|---|
| `counting()` | `number` | `0` |
| `summingInt/Long/Double(f)` | `number` (the double variant is compensated) | `0` |
| `averagingInt/Long/Double(f)` | `number` | `0` |
| `summarizingInt/Long/Double(f)` | `Int/Long/DoubleSummaryStatistics` | count 0 |

They are most useful as downstream collectors of [`groupingBy`](#groupingby). See
[number streams](number-streams.md#summary-statistics) for the statistics objects.

```ts
import { Stream, Collectors } from '@ylcnfrht/typescript-collection-framework';

type Emp = { name: string; salary: number };
const staff: Emp[] = [
  { name: 'Ann', salary: 120 },
  { name: 'Bob', salary: 100 },
  { name: 'Cid', salary: 90 },
  { name: 'Dee', salary: 80 },
];
const s = () => Stream.ofArray(staff);

console.log(s().collect(Collectors.counting())); // → 4
console.log(s().collect(Collectors.summingInt((e: Emp) => e.salary))); // → 390
console.log(s().collect(Collectors.averagingInt((e: Emp) => e.salary))); // → 97.5
console.log(Stream.empty<Emp>().collect(Collectors.averagingDouble((e: Emp) => e.salary))); // → 0
console.log(s().collect(Collectors.summarizingInt((e: Emp) => e.salary)).toString()); // → IntSummaryStatistics{count=4, sum=390, min=80, average=97.500000, max=120}
console.log(Stream.of(0.1, 0.2, 0.3, 0.4).collect(Collectors.summingDouble((x: number) => x))); // → 1
```

## minBy, maxBy, reducing

`minBy(cmp)` / `maxBy(cmp)` return an `Optional` of the smallest / largest element. `reducing` is the collector
form of `stream.reduce`, mostly useful as a downstream:

| Form | Result |
|---|---|
| `reducing(op)` | `Optional<T>` |
| `reducing(identity, op)` | `T` |
| `reducing(identity, mapper, op)` | `U` — maps each element first |

```ts
import { Stream, Collectors, Comparator } from '@ylcnfrht/typescript-collection-framework';

type Emp = { name: string; salary: number };
const staff: Emp[] = [
  { name: 'Ann', salary: 120 },
  { name: 'Bob', salary: 100 },
];
const bySalary = Comparator.comparing((e: Emp) => e.salary);

console.log(Stream.ofArray(staff).collect(Collectors.minBy(bySalary)).map((e) => e.name)); // → Optional[Bob]
console.log(Stream.ofArray(staff).collect(Collectors.maxBy(bySalary)).get().name); // → Ann
console.log(Stream.of(3, 9, 4).collect(Collectors.reducing((a: number, b: number) => Math.max(a, b)))); // → Optional[9]
console.log(Stream.of(3, 9, 4).collect(Collectors.reducing(0, (a: number, b: number) => a + b))); // → 16
console.log(Stream.ofArray(staff).collect(Collectors.reducing(0, (e: Emp) => e.salary, (a: number, b: number) => a + b))); // → 220
```

## groupingBy

`groupingBy` puts each element into a bucket chosen by a classifier function, then reduces every bucket with a
downstream collector. The result is a map from each key to its bucket's downstream result.

::: code-group

```ts [Basic]
import { Stream, Collectors, TreeMap, List } from '@ylcnfrht/typescript-collection-framework';

// words grouped by their first letter, keys sorted
const byLetter = Stream.of('apple', 'avocado', 'banana', 'cherry', 'blueberry')
  .collect(Collectors.groupingBy((w: string) => w[0], () => new TreeMap<string, List<string>>(), Collectors.toList()));

console.log(byLetter); // → {a=[apple, avocado], b=[banana, blueberry], c=[cherry]}
```

```ts [Intermediate]
import { Stream, Collectors, TreeMap } from '@ylcnfrht/typescript-collection-framework';

type Order = { customer: string; amount: number };
const orders: Order[] = [
  { customer: 'globex', amount: 250 },
  { customer: 'acme', amount: 120 },
  { customer: 'initech', amount: 75 },
  { customer: 'acme', amount: 80 },
  { customer: 'globex', amount: 50 },
];

// total revenue per customer, sorted by customer name
const revenue = Stream.ofArray(orders).collect(
  Collectors.groupingBy(
    (o: Order) => o.customer,
    () => new TreeMap<string, number>(),
    Collectors.summingInt((o: Order) => o.amount),
  ),
);

console.log(revenue); // → {acme=200, globex=300, initech=75}
console.log(revenue.lastKey()); // → initech
```

:::

| Form | Map | Downstream |
|---|---|---|
| `groupingBy(classifier)` | `HashMap` | `toList()` |
| `groupingBy(classifier, downstream)` | `HashMap` | given |
| `groupingBy(classifier, mapFactory, downstream)` | `mapFactory()` | given |
| `groupingByConcurrent(…)` | the same three forms | |

A classifier returning `null` throws `NullPointerException` ("element cannot be mapped to a null key"). Buckets
keep the encounter order of their elements.

```ts
import { Stream, Collectors, TreeMap, Comparator, List } from '@ylcnfrht/typescript-collection-framework';

type Emp = { name: string; dept: string; salary: number };
const staff: Emp[] = [
  { name: 'Ann', dept: 'eng', salary: 120 },
  { name: 'Bob', dept: 'eng', salary: 100 },
  { name: 'Cid', dept: 'ops', salary: 90 },
  { name: 'Dee', dept: 'sales', salary: 80 },
];
const s = () => Stream.ofArray(staff);
const dept = (e: Emp) => e.dept;

// 1. classifier only: lists of elements in a HashMap
const byDept = s().collect(Collectors.groupingBy(dept));
console.log(byDept.get('eng')!.size(), byDept.keySet().size()); // → 2 3

// 2. with a downstream
const headcount = s().collect(Collectors.groupingBy(dept, Collectors.counting()));
console.log(headcount.get('eng'), headcount.get('ops')); // → 2 1

// 3. with a map factory: sorted keys
const names = s().collect(Collectors.groupingBy(dept, () => new TreeMap<string, List<string>>(), Collectors.mapping((e: Emp) => e.name, Collectors.toList())));
console.log(names); // → {eng=[Ann, Bob], ops=[Cid], sales=[Dee]}

const avg = s().collect(Collectors.groupingBy(dept, () => new TreeMap<string, number>(), Collectors.averagingInt((e: Emp) => e.salary)));
console.log(avg); // → {eng=110, ops=90, sales=80}

const top = s().collect(Collectors.groupingBy(dept, () => new TreeMap<string, string>(),
  Collectors.collectingAndThen(Collectors.maxBy(Comparator.comparing((e: Emp) => e.salary)), (o) => o.get().name)));
console.log(top); // → {eng=Ann, ops=Cid, sales=Dee}

// nested grouping: department, then high/low earners
const nested = s().collect(Collectors.groupingBy(dept, () => new TreeMap<string, TreeMap<boolean, number>>(),
  Collectors.groupingBy((e: Emp) => e.salary >= 100, () => new TreeMap<boolean, number>(), Collectors.counting())));
console.log(nested); // → {eng={true=2}, ops={false=1}, sales={false=1}}

try {
  s().collect(Collectors.groupingBy(() => null));
} catch (e) {
  console.log((e as Error).name, (e as Error).message); // → NullPointerException element cannot be mapped to a null key
}
```

## partitioningBy

`partitioningBy(predicate)` is `groupingBy` with exactly two buckets, `false` and `true`. Both are always present,
even when empty. The result map prints `false` first. The optional second argument is a downstream collector.

```ts
import { Stream, Collectors } from '@ylcnfrht/typescript-collection-framework';

const parts = Stream.of(1, 2, 3, 4, 5).collect(Collectors.partitioningBy((x: number) => x % 2 === 0));
console.log(parts); // → {false=[1, 3, 5], true=[2, 4]}
console.log(parts.get(true)); // → [2, 4]

console.log(Stream.empty<number>().collect(Collectors.partitioningBy((x: number) => x > 0))); // → {false=[], true=[]}

const counts = Stream.of('kiwi', 'fig', 'banana').collect(Collectors.partitioningBy((s: string) => s.length > 3, Collectors.counting()));
console.log(counts); // → {false=1, true=2}
```

## Adapting downstreams: mapping, filtering, flatMapping, collectingAndThen

These wrap another collector. They are the building blocks of `groupingBy` and `partitioningBy` downstreams.

| Adapter | Does |
|---|---|
| `mapping(f, downstream)` | passes `f(e)` to the downstream |
| `filtering(p, downstream)` | passes only elements matching `p` (unlike a `filter` before `groupingBy`, empty groups are kept) |
| `flatMapping(f, downstream)` | passes every element of the stream `f(e)` returns (`null` = none); each inner stream is closed |
| `collectingAndThen(downstream, finisher)` | applies `finisher` to the downstream's result |

```ts
import { Stream, Collectors, TreeMap, TreeSet, List } from '@ylcnfrht/typescript-collection-framework';

type Emp = { name: string; dept: string; salary: number; skills: string[] };
const staff: Emp[] = [
  { name: 'Ann', dept: 'eng', salary: 120, skills: ['ts', 'go'] },
  { name: 'Bob', dept: 'eng', salary: 100, skills: ['ts'] },
  { name: 'Cid', dept: 'ops', salary: 90, skills: ['bash'] },
  { name: 'Dee', dept: 'sales', salary: 80, skills: [] },
];
const s = () => Stream.ofArray(staff);
const dept = (e: Emp) => e.dept;

console.log(s().collect(Collectors.mapping((e: Emp) => e.name, Collectors.joining('|')))); // → Ann|Bob|Cid|Dee

// filtering keeps the ops and sales keys with a count of 0
const wellPaid = s().collect(Collectors.groupingBy(dept, () => new TreeMap<string, number>(), Collectors.filtering((e: Emp) => e.salary > 95, Collectors.counting())));
console.log(wellPaid); // → {eng=2, ops=0, sales=0}

const skills = s().collect(Collectors.groupingBy(dept, () => new TreeMap<string, TreeSet<string>>(),
  Collectors.flatMapping((e: Emp) => Stream.ofArray(e.skills), Collectors.toCollection(() => new TreeSet<string>()))));
console.log(skills); // → {eng=[go, ts], ops=[bash], sales=[]}

const size = s().collect(Collectors.collectingAndThen(Collectors.toList(), (l: List<Emp>) => l.size()));
console.log(size); // → 4
```

## teeing

`teeing(c1, c2, merger)` sends every element to two collectors and merges both results, computing two
aggregations in one pass.

```ts
import { Stream, Collectors } from '@ylcnfrht/typescript-collection-framework';

const salaries = () => Stream.of(120, 100, 90, 80);
const mean = salaries().collect(Collectors.teeing(
  Collectors.summingInt((x: number) => x),
  Collectors.counting(),
  (sum: number, n: number) => sum / n,
));
console.log(mean); // → 97.5

const range = salaries().collect(Collectors.teeing(
  Collectors.minBy((a: number, b: number) => a - b),
  Collectors.maxBy((a: number, b: number) => a - b),
  (lo, hi) => `${lo.get()}..${hi.get()}`,
));
console.log(range); // → 80..120
```

## Custom collectors with Collector.of

A collector is four functions plus a set of characteristics:

| Function | Signature | Role |
|---|---|---|
| supplier | `() => A` | creates a new container |
| accumulator | `(container: A, e: T) => void` | adds one element to a container |
| combiner | `(left: A, right: A) => A` | merges two containers (used by parallel evaluation) |
| finisher | `(container: A) => R` | turns the container into the result |

The `Collector` interface exposes each one through a method of the same name (`supplier()`, `accumulator()`, …)
that returns the function.

Evaluation is sequential, so the combiner is never called. It must still be correct.

| Characteristic | Meaning |
|---|---|
| `IDENTITY_FINISH` | the finisher is the identity; the container is the result |
| `UNORDERED` | the result does not depend on encounter order |
| `CONCURRENT` | one container may be fed concurrently (no effect in JS) |

`Collector.of(supplier, accumulator, combiner, ...characteristics)` has no finisher and always reports
`IDENTITY_FINISH`. `Collector.of(supplier, accumulator, combiner, finisher, ...characteristics)` reports exactly
the characteristics given. They are available as `Collector.Characteristics.UNORDERED` etc., or as the string
literals.

```ts
import { Stream, Collector, LinkedList } from '@ylcnfrht/typescript-collection-framework';

// container = result: a LinkedList built in reverse
const reversed = Collector.of(
  () => new LinkedList<number>(),
  (l: LinkedList<number>, x: number) => l.addFirst(x),
  (left: LinkedList<number>, right: LinkedList<number>) => {
    right.addAll(left);
    return right;
  },
);
console.log(Stream.of(1, 2, 3).collect(reversed)); // → [3, 2, 1]
console.log(reversed.characteristics()); // → [IDENTITY_FINISH]

// with a finisher: the median of the numbers
const median = Collector.of(
  () => [] as number[],
  (a: number[], x: number) => {
    a.push(x);
  },
  (a: number[], b: number[]) => a.concat(b),
  (a: number[]) => {
    const s = [...a].sort((x, y) => x - y);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  },
  Collector.Characteristics.UNORDERED,
);
console.log(Stream.of(5, 1, 4, 2).collect(median)); // → 3
console.log(median.characteristics()); // → [UNORDERED]
```

## Recipes

### Frequency map

Count occurrences, then rank the most frequent first:

```ts
import { Stream, Collectors, TreeMap, Comparator, MapEntry } from '@ylcnfrht/typescript-collection-framework';

const words = 'the cat and the hat and the bat'.split(' ');
const freq = Stream.ofArray(words).collect(Collectors.groupingBy((w: string) => w, () => new TreeMap<string, number>(), Collectors.counting()));
console.log(freq); // → {and=2, bat=1, cat=1, hat=1, the=3}

const ranked = freq.entrySet().stream()
  .sorted(Comparator.comparing((e: MapEntry<string, number>) => e.getValue(), Comparator.reverseOrder()))
  .map((e) => `${e.getKey()}:${e.getValue()}`)
  .limit(2)
  .toList();
console.log(ranked); // → [the:3, and:2]
```

### Top-N per group

```ts
import { Stream, Collectors, TreeMap, Comparator, List } from '@ylcnfrht/typescript-collection-framework';

type Sale = { region: string; amount: number };
const sales: Sale[] = [
  { region: 'north', amount: 5 }, { region: 'north', amount: 9 }, { region: 'north', amount: 7 },
  { region: 'south', amount: 3 }, { region: 'south', amount: 8 },
];
const top2 = Stream.ofArray(sales).collect(Collectors.groupingBy(
  (s: Sale) => s.region,
  () => new TreeMap<string, List<number>>(),
  Collectors.collectingAndThen(Collectors.toList(), (l: List<Sale>) =>
    l.stream().sorted(Comparator.comparing((s: Sale) => s.amount, Comparator.reverseOrder())).limit(2).map((s) => s.amount).toList()),
));
console.log(top2); // → {north=[9, 7], south=[8, 3]}
```

### Statistics per category

```ts
import { Stream, Collectors, TreeMap, DoubleSummaryStatistics } from '@ylcnfrht/typescript-collection-framework';

type Reading = { sensor: string; value: number };
const readings: Reading[] = [
  { sensor: 'a', value: 1.5 }, { sensor: 'b', value: 4 }, { sensor: 'a', value: 2.5 },
];
const stats = Stream.ofArray(readings).collect(Collectors.groupingBy(
  (r: Reading) => r.sensor, () => new TreeMap<string, DoubleSummaryStatistics>(), Collectors.summarizingDouble((r: Reading) => r.value)));
const a = stats.get('a')!;
console.log(a.getCount(), a.getMin(), a.getMax(), a.getAverage()); // → 2 1.5 2.5 2
```

### Index by key

On duplicate keys the last element wins; keys keep their encounter order.

```ts
import { Stream, Collectors, LinkedHashMap } from '@ylcnfrht/typescript-collection-framework';

type User = { id: number; name: string };
const users: User[] = [{ id: 2, name: 'old' }, { id: 1, name: 'one' }, { id: 2, name: 'two' }];
const byId = Stream.ofArray(users).collect(Collectors.toMap(
  (u: User) => u.id, (u: User) => u, (_old: User, latest: User) => latest, () => new LinkedHashMap<number, User>()));
console.log(byId.keySet(), byId.get(2)!.name); // → [2, 1] two
```

See [maps](../collections/maps.md) for the map types used here.
