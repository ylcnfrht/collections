# Comparator and Objects

This page covers how values are ordered and compared throughout the library. A comparator is a function `(a, b) => number`, and the `Comparator` object provides factories and combinators for building one. Natural ordering (`naturalCompare`) applies when no comparator is given. `Objects` holds the equality and hashing rules that every hash-based collection uses, plus null and index checks.

## Comparators are functions

```ts nocheck
type Comparator<T> = (a: T, b: T) => number; // < 0: a first, 0: tie, > 0: b first
```

A comparator is the same kind of function that `Array.prototype.sort` accepts, so you can pass a lambda wherever the library expects one. The Java API puts methods on the comparator, such as `c.reversed()` or `c.thenComparing(d)`. Here those methods are functions that take the comparator as their first argument: `Comparator.reversed(c)` and `Comparator.thenComparing(c, d)`.

```ts
import { ArrayList, Comparator, TreeSet } from '@ylcnfrht/collections';

const byLength = (a: string, b: string) => a.length - b.length;
const words = ArrayList.of('banana', 'fig', 'apple');
// with new:
// const words = new ArrayList<string>();
// words.add('banana');
// words.add('fig');
// words.add('apple');
words.sort(byLength);
console.log(words); // → [fig, apple, banana]

const set = new TreeSet<string>(Comparator.reversed(byLength));
set.addAll(words);
console.log(set); // → [banana, apple, fig]
```

> [!IMPORTANT]
> A sorted collection decides equality with its comparator, not with `equals`. Two elements that compare as `0` count as the same element, so a `TreeSet` ordered by length keeps one word per length.

```ts
import { TreeSet } from '@ylcnfrht/collections';

const byLen = new TreeSet<string>((a, b) => a.length - b.length);
byLen.add('cat');
console.log(byLen.add('dog'), byLen.size()); // → false 1
```

## Natural ordering

`naturalCompare(a, b)` is the default comparator. It applies these rules, in this order:

| Values | Order |
| --- | --- |
| `null` or `undefined` on either side | throws `NullPointerException` (wrap with `nullsFirst`/`nullsLast` to allow them) |
| `a` has a `compareTo` method | `a.compareTo(b)` |
| two numbers | numeric. `NaN` is greater than everything (sorts last) and equal to itself. `-0` equals `0`. |
| two strings | by UTF-16 code units: uppercase before lowercase, no locale rules |
| two bigints | numeric |
| two booleans | `false < true` |
| two `Date`s | by `getTime()` |
| anything else, or two different types | throws `ClassCastException` |

```ts
import { ArrayList, naturalCompare } from '@ylcnfrht/collections';

console.log(naturalCompare(1, 2)); // → -1
console.log(naturalCompare('B', 'a')); // → -1
console.log(naturalCompare(10n, 9n)); // → 1
console.log(naturalCompare(false, true)); // → -1
console.log(naturalCompare(new Date(2020, 0, 1), new Date(2019, 0, 1))); // → 1
console.log(naturalCompare(-0, 0)); // → 0

const nums = ArrayList.of(3, NaN, -Infinity, 1);
nums.sort(null); // natural order
console.log(nums); // → [-Infinity, 1, 3, NaN]

try {
  naturalCompare(1, '1');
} catch (e) {
  console.log((e as Error).name, (e as Error).message); // → ClassCastException number cannot be compared to string
}
try {
  naturalCompare({}, {});
} catch (e) {
  console.log((e as Error).message); // → Object cannot be compared to Object
}
```

Plain objects have no natural order: give them a `compareTo` method or pass a comparator.

Strings are compared by UTF-16 code units, the same order `Array.prototype.sort()` uses by default. This order is fast and deterministic, but it is not the alphabetical order of any language. For user-facing sorting, pass a collator:

```ts
import { ArrayList } from '@ylcnfrht/collections';

const names = ArrayList.of('émile', 'Zoe', 'adam');
names.sort(null);
console.log(names); // → [Zoe, adam, émile]

const collator = new Intl.Collator('en');
names.sort(collator.compare);
console.log(names); // → [adam, émile, Zoe]
```

## The Comparable interface

```ts nocheck
interface Comparable<T> {
  compareTo(o: T): number;
}
```

When a class has `compareTo`, its instances get a natural ordering. They then work in `TreeSet`, `TreeMap`, `PriorityQueue`, `Collections.sort`, `Collections.max` and `Stream.sorted()` with no comparator. Make `compareTo` consistent with `equals`: return `0` exactly when `equals` returns `true`.

```ts
import { PriorityQueue, TreeSet } from '@ylcnfrht/collections';
import type { Comparable } from '@ylcnfrht/collections';

class Version implements Comparable<Version> {
  constructor(readonly major: number, readonly minor: number) {}
  compareTo(o: Version): number {
    return this.major - o.major || this.minor - o.minor;
  }
  equals(o: unknown): boolean {
    return o instanceof Version && this.compareTo(o) === 0;
  }
  hashCode(): number {
    return this.major * 31 + this.minor;
  }
  toString(): string {
    return `${this.major}.${this.minor}`;
  }
}

const versions = new TreeSet<Version>();
versions.add(new Version(1, 10));
versions.add(new Version(1, 2));
versions.add(new Version(0, 9));
console.log(versions); // → [0.9, 1.2, 1.10]
console.log(versions.contains(new Version(1, 2))); // → true

const pq = new PriorityQueue<Version>();
pq.add(new Version(2, 0));
pq.add(new Version(1, 5));
console.log(String(pq.poll())); // → 1.5
```

## Comparator helpers

| Helper | Returns |
| --- | --- |
| `naturalOrder()` | `naturalCompare` |
| `reverseOrder()` | the shared reverse of natural order |
| `reversed(c)` | `c` reversed (`reversed(reversed(c)) === c`) |
| `comparing(key, keyCmp?)` | compares `key(a)` with `key(b)`, using `keyCmp` or natural order |
| `comparingInt/Long/Double(key)` | compares numeric keys (`comparingLong` also accepts bigints) |
| `thenComparing(c, ...more)` | `c`, then each comparator in `more` to break ties |
| `thenComparingBy(c, key, keyCmp?)` | `c`, then `comparing(key, keyCmp)` |
| `thenComparingInt/Long/Double(c, key)` | `c`, then a numeric key |
| `nullsFirst(c?)` / `nullsLast(c?)` | allows `null`/`undefined`, placing them first or last |
| `max(c, a, b)` / `min(c, a, b)` | the greater or lesser of two values (`a` on a tie) |

### naturalOrder, reverseOrder, reversed

```ts
import { ArrayList, Comparator, naturalCompare } from '@ylcnfrht/collections';

const l = ArrayList.of(2, 3, 1);
l.sort(Comparator.reverseOrder());
console.log(l); // → [3, 2, 1]
l.sort(Comparator.naturalOrder());
console.log(l); // → [1, 2, 3]

const r = Comparator.reversed(naturalCompare);
console.log(r === Comparator.reverseOrder()); // → true
console.log(Comparator.reversed(r) === naturalCompare); // → true
```

### comparing and comparingInt/Long/Double

`comparing(key)` extracts a key from each element and compares the keys by natural ordering. Pass a second argument to compare the keys some other way. The numeric variants skip the type dispatch of natural ordering. Like natural ordering, they put `NaN` last and treat `-0` as equal to `0`.

```ts
import { ArrayList, Comparator } from '@ylcnfrht/collections';

interface Person {
  name: string;
  age: number;
}
const people = ArrayList.of<Person>(
  { name: 'bob', age: 31 },
  { name: 'Alice', age: 25 },
  { name: 'carol', age: 31 },
);
const names = () => people.stream().map((p) => p.name).toList();

people.sort(Comparator.comparing((p: Person) => p.name));
console.log(names()); // → [Alice, bob, carol]

// key comparator: case-insensitive names, longest first
people.sort(Comparator.comparing((p: Person) => p.name.toLowerCase(), Comparator.reverseOrder()));
console.log(names()); // → [carol, bob, Alice]

people.sort(Comparator.comparingInt((p: Person) => p.age));
console.log(names()); // → [Alice, carol, bob]

// bigint keys
const ids = ArrayList.of({ id: 3n }, { id: 1n });
ids.sort(Comparator.comparingLong((x: { id: bigint }) => x.id));
console.log(ids.stream().map((x) => String(x.id)).toList()); // → [1, 3]
```

In the `comparingInt` sort, `carol` and `bob` are both 31 and keep their previous order (`carol` before `bob`), because the sort is stable.

### thenComparing and friends: multi-key sorts

The first comparator decides the order. Each later comparator is used only when everything before it returned `0`.

```ts
import { ArrayList, Comparator } from '@ylcnfrht/collections';

interface Emp {
  dept: string;
  salary: number;
  name: string;
}
const staff = ArrayList.of<Emp>(
  { dept: 'ops', salary: 50, name: 'dan' },
  { dept: 'dev', salary: 70, name: 'eve' },
  { dept: 'dev', salary: 90, name: 'ann' },
  { dept: 'ops', salary: 50, name: 'bea' },
);

// dept ascending, then salary descending, then name ascending
const order = Comparator.thenComparingBy(
  Comparator.thenComparingBy(
    Comparator.comparing((e: Emp) => e.dept),
    (e: Emp) => e.salary,
    Comparator.reverseOrder<number>(),
  ),
  (e: Emp) => e.name,
);
staff.sort(order);
console.log(staff.stream().map((e) => `${e.dept}/${e.salary}/${e.name}`).toList()); // → [dev/90/ann, dev/70/eve, ops/50/bea, ops/50/dan]

// the same, written with thenComparing over plain comparators
const same = Comparator.thenComparing<Emp>(
  Comparator.comparing((e) => e.dept),
  Comparator.reversed(Comparator.comparingInt((e) => e.salary)),
  Comparator.comparing((e) => e.name),
);
console.log(staff.stream().sorted(same).map((e) => e.name).toList()); // → [ann, eve, bea, dan]

// thenComparingInt / Double take a numeric key directly
const byDeptThenSalary = Comparator.thenComparingInt(Comparator.comparing((e: Emp) => e.dept), (e: Emp) => e.salary);
console.log(staff.stream().sorted(byDeptThenSalary).map((e) => e.name).toList()); // → [eve, ann, bea, dan]
```

### nullsFirst and nullsLast

Natural ordering rejects `null` and `undefined`. Wrap a comparator to accept them:

- `nullsFirst(c)` / `nullsLast(c)` put nulls at the start or end and compare the other values with `c`.
- With no argument, the other values are compared by natural ordering.
- With an explicit `null` argument, all non-null values compare as equal, so a stable sort keeps their order.

```ts
import { ArrayList, Comparator } from '@ylcnfrht/collections';

const xs = ArrayList.of<number | null>(3, null, 1);
xs.sort(Comparator.nullsFirst());
console.log(xs); // → [null, 1, 3]

xs.sort(Comparator.nullsLast(Comparator.reverseOrder<number>()));
console.log(xs); // → [3, 1, null]

const keepOrder = ArrayList.of<string | null>('b', null, 'a');
keepOrder.sort(Comparator.nullsFirst<string>(null));
console.log(keepOrder); // → [null, b, a]
```

When you compose null-friendly comparators, they stay null-friendly. This matches the Java API:

- `reversed(nullsFirst(c))` is `nullsLast(reversed(c))`. Reversing moves the nulls to the other end and also reverses the order of the other values.
- `thenComparing(nullsFirst(c), d)` keeps the nulls first and breaks ties among the other values with `d`. `d` is never called with `null`.

```ts
import { ArrayList, Comparator, naturalCompare } from '@ylcnfrht/collections';

const ys = ArrayList.of<string | null>('b', null, 'a');
ys.sort(Comparator.reversed(Comparator.nullsFirst<string>()));
console.log(ys); // → [b, a, null]

const byLenThenAlpha = Comparator.thenComparing(
  Comparator.nullsFirst<string>(Comparator.comparing((s: string) => s.length)),
  (a, b) => naturalCompare(a, b), // never sees null
);
const zs = ArrayList.of<string | null>('bb', null, 'a', 'ab');
zs.sort(byLenThenAlpha);
console.log(zs); // → [null, a, ab, bb]
```

To sort objects by a key that may be missing, wrap the key comparator:

```ts
import { ArrayList, Comparator } from '@ylcnfrht/collections';

interface Task {
  title: string;
  due?: Date;
}
const tasks = ArrayList.of<Task>(
  { title: 'later' },
  { title: 'b', due: new Date(2030, 1, 1) },
  { title: 'a', due: new Date(2030, 0, 1) },
);
tasks.sort(Comparator.comparing((t: Task) => t.due, Comparator.nullsLast<Date>()));
console.log(tasks.stream().map((t) => t.title).toList()); // → [a, b, later]
```

### max and min

`Comparator.max(c, a, b)` and `Comparator.min(c, a, b)` return the greater or lesser of two values. On a tie they return `a`. These two do not exist in the Java API version this library was checked against.

```ts
import { Comparator } from '@ylcnfrht/collections';

const byLen = Comparator.comparing((s: string) => s.length);
console.log(Comparator.max(byLen, 'ab', 'xyz')); // → xyz
console.log(Comparator.min(byLen, 'ab', 'cd')); // → ab
```

### Recipes

```ts
import { ArrayList, Collectors, Comparator, List, Stream, TreeMap } from '@ylcnfrht/collections';

interface Item {
  sku: string;
  price: number;
  rating?: number;
}
const items = ArrayList.of<Item>(
  { sku: 'A1', price: 20, rating: 4.5 },
  { sku: 'B2', price: 10 },
  { sku: 'C3', price: 20, rating: 4.9 },
  { sku: 'D4', price: 10, rating: 3.0 },
);
const skus = (s: Stream<Item>) => s.map((i) => i.sku).toList();

// 1. Cheapest first, then best rated first; unrated items last within a price
const byPriceThenRating = Comparator.thenComparingBy(
  Comparator.comparingDouble((i: Item) => i.price),
  (i: Item) => i.rating,
  Comparator.nullsLast(Comparator.reverseOrder<number>()),
);
console.log(skus(items.stream().sorted(byPriceThenRating))); // → [D4, B2, C3, A1]

// 2. Top 2 by rating (unrated count as lowest)
const byRating = Comparator.comparing((i: Item) => i.rating, Comparator.nullsFirst<number>());
console.log(skus(items.stream().sorted(Comparator.reversed(byRating)).limit(2))); // → [C3, A1]

// 3. The most expensive item, ties broken by SKU
const best = items.stream().max(Comparator.thenComparingBy(Comparator.comparingInt((i: Item) => i.price), (i: Item) => i.sku));
console.log(best.get().sku); // → C3

// 4. A TreeMap with case-insensitive string keys
const ci = new TreeMap<string, number>(Comparator.comparing((s: string) => s.toLowerCase()));
ci.put('Apple', 1);
ci.put('apple', 2); // same key: the value is replaced, the first key is kept
console.log(ci); // → {Apple=2}

// 5. Group, then order each group
const grouped = items.stream().collect(Collectors.groupingBy((i: Item) => i.price, () => new TreeMap<number, List<string>>(), Collectors.mapping((i: Item) => i.sku, Collectors.toList())));
console.log(grouped); // → {10=[B2, D4], 20=[A1, C3]}
```

## Objects

`Objects` gathers the equality, hashing and checking helpers the collections use internally. Use them in your own `equals`/`hashCode` implementations and for argument validation.

| Function | What it does |
| --- | --- |
| `equals(a, b)` | value equality: `a.equals(b)` if `a` has the method; `Date`s by time; otherwise SameValueZero (`NaN` equals `NaN`, `-0` equals `0`) |
| `hashCode(o)` | a hash consistent with `equals` (see the table below) |
| `hash(...values)` | combines several hashes: `h = 31 * h + hashCode(v)`, starting at 1 |
| `identityHashCode(o)` | a stable per-object hash that ignores `hashCode()` |
| `requireNonNull(o, msg?)` | returns `o`, or throws `NullPointerException`. `msg` may be a string or a supplier. |
| `requireNonNullElse(o, d)` / `requireNonNullElseGet(o, f)` | `o`, or a default |
| `isNull(o)` / `nonNull(o)` | `o == null` / `o != null` |
| `checkIndex`, `checkFromToIndex`, `checkFromIndexSize` | bounds checks that throw `IndexOutOfBoundsException` |
| `toString(o, default?)` | the string form used by collection `toString()`, with an optional null default |
| `compare(a, b, c)` | `0` when `a === b`, else `c(a, b)` |
| `deepEquals(a, b)` | like `equals`, but compares arrays and typed arrays element by element, recursively |
| `toIdentityString(o)` | `ClassName@hexIdentityHash` |

### equals, hash, hashCode, identityHashCode

```ts
import { Objects } from '@ylcnfrht/collections';

console.log(Objects.equals(NaN, NaN)); // → true
console.log(Objects.equals(-0, 0)); // → true
console.log(Objects.equals(new Date(5), new Date(5))); // → true
console.log(Objects.equals({}, {})); // → false
console.log(Objects.equals(null, undefined)); // → false
console.log(Objects.equals([1], [1])); // → false

console.log(Objects.hash(1, 'a')); // → 1089
console.log(Objects.hashCode('hello')); // → 99162322

const o = { x: 1 };
console.log(Objects.identityHashCode(o) === Objects.identityHashCode(o)); // → true
```

Arrays and plain objects have no `equals` method, so they compare by reference. Wrap them in a list, or give them a class with `equals`/`hashCode`, to use them as values in hash-based collections.

### How hashCode is computed

`Objects.hashCode` always returns an int32, and values that are `equals` always get the same hash. That is the property hash-based collections depend on. Numbers, strings, booleans and bigints hash with the same formulas as the JDK, so values match it bit for bit.

| Value | Hash | Example |
| --- | --- | --- |
| `null`, `undefined` | `0` | `hashCode(null)` → `0` |
| number that is an int32 (including `-0`) | the number itself | `hashCode(-1)` → `-1` |
| any other number (fractions, ≥ 2³¹, `±Infinity`) | high 32 bits XOR low 32 bits of the IEEE-754 double | `hashCode(1.5)` → `1073217536` |
| `NaN` | `0x7ff80000` (canonical NaN), so every NaN hashes the same | `2146959360` |
| string | `h = 31·h + charCode` over UTF-16 units, in 32-bit arithmetic | `hashCode('hello')` → `99162322` |
| boolean | `true` → `1231`, `false` → `1237` | |
| bigint | value truncated to 64 bits, then high 32 bits XOR low 32 bits | `hashCode(10n)` → `10` |
| `Date` | the double hash of `getTime()` | `hashCode(new Date(0))` → `0` |
| object with a `hashCode()` method | `o.hashCode() \| 0` | a `Point`, an `ArrayList` |
| any other object, function or symbol | identity hash: assigned on first use, stable for the object's lifetime | `{}`, arrays |

```ts
import { ArrayList, Objects } from '@ylcnfrht/collections';

console.log(Objects.hashCode(42), Objects.hashCode(-0), Objects.hashCode(2 ** 31)); // → 42 0 1105199104
console.log(Objects.hashCode(true), Objects.hashCode(false)); // → 1231 1237
console.log(Objects.hashCode(NaN) === Objects.hashCode(0 / 0)); // → true
// collections hash by content: equal lists hash the same
console.log(Objects.hashCode(ArrayList.of(1, 2)) === Objects.hashCode(ArrayList.of(1, 2))); // → true
```

Identity hashes are kept in a `WeakMap`, so hashing an object does not keep it alive. Symbols are the exception: their identity hashes are held in a regular `Map`, so they are never freed.

### Null checks

`requireNonNull(o, message?)` returns `o` with its type narrowed to non-null, so you can validate and assign in one line. Pass the message as a function when building it is costly. The function is only called if the check fails.

```ts
import { Objects } from '@ylcnfrht/collections';

function greet(name: string | null | undefined): string {
  const n = Objects.requireNonNull(name, () => 'name is required');
  return `hi ${n}`;
}
console.log(greet('ann')); // → hi ann
try {
  greet(undefined);
} catch (e) {
  console.log((e as Error).name, (e as Error).message); // → NullPointerException name is required
}

console.log(Objects.requireNonNullElse(null, 'default')); // → default
console.log(Objects.requireNonNullElseGet(undefined, () => 'computed')); // → computed
console.log(Objects.isNull(undefined), Objects.nonNull(0)); // → true true
try {
  Objects.requireNonNullElse(null, null); // both null
} catch (e) {
  console.log((e as Error).message); // → defaultObj
}
```

### Index checks

Each check returns its first argument on success. On failure it throws `IndexOutOfBoundsException` with a message in the reference format. An index that is not an integer, such as `1.5` or `NaN`, also fails.

```ts
import { Objects } from '@ylcnfrht/collections';

console.log(Objects.checkIndex(2, 3)); // → 2
console.log(Objects.checkFromToIndex(1, 3, 3)); // → 1
console.log(Objects.checkFromIndexSize(1, 2, 3)); // → 1

const fail = (f: () => unknown): string => {
  try {
    f();
    return 'ok';
  } catch (e) {
    return (e as Error).message;
  }
};
console.log(fail(() => Objects.checkIndex(3, 3))); // → Index 3 out of bounds for length 3
console.log(fail(() => Objects.checkFromToIndex(2, 1, 3))); // → Range [2, 1) out of bounds for length 3
console.log(fail(() => Objects.checkFromIndexSize(2, 2, 3))); // → Range [2, 2 + 2) out of bounds for length 3
```

These checks are the ones to use when you [implement your own list](../advanced/custom-collections.md).

### toString, compare, deepEquals, toIdentityString

```ts
import { ArrayList, Objects, naturalCompare } from '@ylcnfrht/collections';

console.log(Objects.toString(null)); // → null
console.log(Objects.toString(undefined, 'n/a')); // → n/a
console.log(Objects.toString(5, 'n/a')); // → 5

// compare short-circuits identical arguments without calling the comparator
let calls = 0;
const counting = (a: number, b: number) => (calls++, naturalCompare(a, b));
console.log(Objects.compare(7, 7, counting), calls); // → 0 0
console.log(Objects.compare(1, 2, counting), calls); // → -1 1

console.log(Objects.deepEquals([1, [2, 3]], [1, [2, 3]])); // → true
console.log(Objects.deepEquals(new Int8Array([1]), new Int8Array([1]))); // → true
console.log(Objects.deepEquals([1], new Int8Array([1]))); // → false

console.log(/^ArrayList@[0-9a-f]+$/.test(Objects.toIdentityString(ArrayList.of(1)))); // → true
```

`toIdentityString` ignores any `toString()` or `hashCode()` the object defines. That makes it useful in logs where you need to tell apart two objects that are equal.

## Writing equals, hashCode and compareTo for your own types

Collections rely on three methods of your element types:

| Used by | Method | Rule |
| --- | --- | --- |
| `HashMap`, `HashSet`, `contains`, `indexOf`, `remove(o)`, list/set/map `equals` | `equals(o: unknown): boolean` | reflexive, symmetric, transitive. Return `false` for other types. |
| `HashMap`, `HashSet`, `LinkedHash*` | `hashCode(): number` | equal objects return equal hashes. Use `Objects.hash(...fields)`. |
| `TreeMap`, `TreeSet`, `PriorityQueue`, `sort(null)` | `compareTo(o): number` | a total order, ideally `0` exactly when `equals` |

```ts
import { HashMap, HashSet, Objects } from '@ylcnfrht/collections';

class Point {
  constructor(readonly x: number, readonly y: number) {}
  equals(o: unknown): boolean {
    return o instanceof Point && o.x === this.x && o.y === this.y;
  }
  hashCode(): number {
    return Objects.hash(this.x, this.y);
  }
  toString(): string {
    return `(${this.x}, ${this.y})`;
  }
}

const seen = new HashSet<Point>();
seen.add(new Point(1, 2));
console.log(seen.contains(new Point(1, 2))); // → true

const labels = new HashMap<Point, string>();
labels.put(new Point(0, 0), 'origin');
console.log(labels.get(new Point(0, 0))); // → origin
```

### Common mistakes

- **Mutating a key** after inserting it changes its hash or order. The collection then cannot find it. Use immutable fields (`readonly`) for anything `equals`, `hashCode` or `compareTo` reads.
- **`equals` without `hashCode`**: equal objects that hash differently land in different buckets, and lookups fail.
- **Asymmetric equality**: an object whose `equals` returns `true` for a primitive, such as `new Id(1).equals(1)`. A primitive never equals an object, so the library treats the two as different keys.
- **Subtracting large numbers** in `compareTo`: `a - b` can lose precision for values beyond 2⁵³, and returns `NaN` when either side is `NaN`. Use `naturalCompare(a, b)` or a `Comparator.comparingInt` key instead.
