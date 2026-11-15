---
title: Comparator and Objects
description: Comparator factories and combinators, natural ordering rules, and the Objects equality, hashing and checking helpers.
sidebar:
  order: 2
---

A comparator is a plain function `(a, b) => number`, the same kind `Array.prototype.sort` takes. The `Comparator` object
builds and combines them. `Objects` holds the equality and hashing rules every hash-based collection uses, plus null and
index checks. For the concepts behind both, see [Ordering](/collections/concepts/ordering/) and
[Equality](/collections/concepts/equality/).

```ts nocheck
type Comparator<T> = (a: T, b: T) => number; // < 0: a first, 0: tie, > 0: b first
```

Methods that the Java API puts on a comparator (`c.reversed()`, `c.thenComparing(d)`) are functions here that take the
comparator first: `Comparator.reversed(c)`, `Comparator.thenComparing(c, d)`.

## Natural ordering

`naturalCompare(a, b)` is used whenever no comparator is given. Rules, in order:

| Values | Order |
| --- | --- |
| `null` or `undefined` on either side | throws `NullPointerException` (wrap with `nullsFirst`/`nullsLast`) |
| `a` has a `compareTo` method | `a.compareTo(b)` |
| two numbers | numeric; `NaN` is greater than everything and equal to itself; `-0` equals `0` |
| two strings | by UTF-16 code units: uppercase before lowercase, no locale rules |
| two bigints | numeric |
| two booleans | `false < true` |
| two `Date`s | by `getTime()` |
| anything else, or two different types | throws `ClassCastException` |

```ts
import { ArrayList, naturalCompare } from '@ylcnfrht/collections';

console.log(naturalCompare('B', 'a'), naturalCompare(10n, 9n), naturalCompare(-0, 0)); // → -1 1 0

const nums = ArrayList.of(3, NaN, -Infinity, 1);
nums.sort(null); // natural order
console.log(nums); // → [-Infinity, 1, 3, NaN]

try {
  naturalCompare(1, '1');
} catch (e) {
  console.log((e as Error).name, (e as Error).message); // → ClassCastException number cannot be compared to string
}

// user-facing text: pass a collator instead
const names = ArrayList.of('émile', 'Zoe', 'adam');
names.sort(new Intl.Collator('en').compare);
console.log(names); // → [adam, émile, Zoe]
```

A class with `compareTo(o): number` (the `Comparable<T>` interface) gets a natural ordering and works in `TreeSet`,
`TreeMap`, `PriorityQueue`, `Collections.sort`/`max` and `Stream.sorted()` without a comparator. Return `0` exactly when
`equals` returns `true`: a sorted collection treats elements that compare as `0` as the same element.

## Comparator helpers

| Helper | Returns |
| --- | --- |
| `naturalOrder()` | `naturalCompare` |
| `reverseOrder()` | the shared reverse of natural order |
| `reversed(c)` | `c` reversed; `reversed(reversed(c)) === c` |
| `comparing(key, keyCmp?)` | compares `key(a)` with `key(b)`, by `keyCmp` or natural order |
| `comparingInt/Long/Double(key)` | compares numeric keys; `NaN` last, `-0` equals `0`; `comparingLong` also accepts bigints |
| `thenComparing(c, ...more)` | `c`, then each of `more` to break ties |
| `thenComparingBy(c, key, keyCmp?)` | `c`, then `comparing(key, keyCmp)` |
| `thenComparingInt/Long/Double(c, key)` | `c`, then a numeric key |
| `nullsFirst(c?)` / `nullsLast(c?)` | allows `null`/`undefined`, placing them first or last |
| `max(c, a, b)` / `min(c, a, b)` | the greater or lesser of two values; `a` on a tie |

`Comparator.max` and `Comparator.min` are newer than the JDK the library is tested against
(see [Compatibility](/collections/reference/compatibility/#apis-newer-than-the-jdk)).

```ts
import { ArrayList, Comparator, naturalCompare } from '@ylcnfrht/collections';

const l = ArrayList.of(2, 3, 1);
l.sort(Comparator.reverseOrder());
console.log(l); // → [3, 2, 1]

const r = Comparator.reversed(naturalCompare);
console.log(r === Comparator.reverseOrder(), Comparator.reversed(r) === naturalCompare); // → true true

const byLen = Comparator.comparing((s: string) => s.length);
console.log(Comparator.max(byLen, 'ab', 'xyz'), Comparator.min(byLen, 'ab', 'cd')); // → xyz ab
```

### comparing

`comparing(key)` compares extracted keys by natural order; a second argument compares the keys another way. The numeric
variants skip natural ordering's type dispatch.

```ts
import { ArrayList, Comparator } from '@ylcnfrht/collections';

interface Person {
  name: string;
  age: number;
}
const people = ArrayList.of<Person>({ name: 'bob', age: 31 }, { name: 'Alice', age: 25 }, { name: 'carol', age: 31 });
const names = () => people.stream().map((p) => p.name).toList();

people.sort(Comparator.comparing((p: Person) => p.name));
console.log(names()); // → [Alice, bob, carol]

// case-insensitive names, reverse order
people.sort(Comparator.comparing((p: Person) => p.name.toLowerCase(), Comparator.reverseOrder()));
console.log(names()); // → [carol, bob, Alice]

// stable: carol and bob tie at 31 and keep their previous order
people.sort(Comparator.comparingInt((p: Person) => p.age));
console.log(names()); // → [Alice, carol, bob]
```

### Multi-key sorts

Each later comparator runs only when everything before it returned `0`.

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
const order = Comparator.thenComparing<Emp>(
  Comparator.comparing((e) => e.dept),
  Comparator.reversed(Comparator.comparingInt((e) => e.salary)),
  Comparator.comparing((e) => e.name),
);
console.log(staff.stream().sorted(order).map((e) => e.name).toList()); // → [ann, eve, bea, dan]

// the same with thenComparingBy, which takes a key and an optional key comparator
const same = Comparator.thenComparingBy(
  Comparator.thenComparingBy(Comparator.comparing((e: Emp) => e.dept), (e: Emp) => e.salary, Comparator.reverseOrder<number>()),
  (e: Emp) => e.name,
);
console.log(staff.stream().sorted(same).map((e) => e.name).toList()); // → [ann, eve, bea, dan]
```

### nullsFirst and nullsLast

`nullsFirst(c)` / `nullsLast(c)` put `null` and `undefined` at one end and compare the rest with `c`. With no argument
the rest use natural order; with an explicit `null` the rest all compare equal, so a stable sort keeps their order.

Composition stays null-friendly: `reversed(nullsFirst(c))` is `nullsLast(reversed(c))`, and in
`thenComparing(nullsFirst(c), d)` the comparator `d` is never called with `null`.

```ts
import { ArrayList, Comparator } from '@ylcnfrht/collections';

const xs = ArrayList.of<number | null>(3, null, 1);
xs.sort(Comparator.nullsFirst());
console.log(xs); // → [null, 1, 3]
xs.sort(Comparator.nullsLast(Comparator.reverseOrder<number>()));
console.log(xs); // → [3, 1, null]

const keep = ArrayList.of<string | null>('b', null, 'a');
keep.sort(Comparator.nullsFirst<string>(null));
console.log(keep); // → [null, b, a]

// sort by a key that may be missing
interface Task {
  title: string;
  due?: Date;
}
const tasks = ArrayList.of<Task>({ title: 'later' }, { title: 'b', due: new Date(2030, 1, 1) }, { title: 'a', due: new Date(2030, 0, 1) });
tasks.sort(Comparator.comparing((t: Task) => t.due, Comparator.nullsLast<Date>()));
console.log(tasks.stream().map((t) => t.title).toList()); // → [a, b, later]
```

A `TreeMap` or `TreeSet` decides key equality with its comparator, so a case-insensitive comparator merges keys that
differ only in case:

```ts
import { Comparator, TreeMap } from '@ylcnfrht/collections';

const ci = new TreeMap<string, number>(Comparator.comparing((s: string) => s.toLowerCase()));
ci.put('Apple', 1);
ci.put('apple', 2); // same key: the value is replaced, the first key is kept
console.log(ci); // → {Apple=2}
```

## Objects

| Function | What it does |
| --- | --- |
| `equals(a, b)` | `a.equals(b)` if `a` has the method; `Date`s by time; otherwise SameValueZero (`NaN` equals `NaN`, `-0` equals `0`) |
| `hashCode(o)` | an int32 hash consistent with `equals` (table below) |
| `hash(...values)` | `h = 31 * h + hashCode(v)`, starting at 1 |
| `identityHashCode(o)` | a stable per-object hash that ignores `hashCode()` |
| `requireNonNull(o, msg?)` | returns `o` narrowed to non-null, or throws `NullPointerException`; `msg` may be a string or a supplier |
| `requireNonNullElse(o, d)` / `requireNonNullElseGet(o, f)` | `o`, or a default; throws if both are null |
| `isNull(o)` / `nonNull(o)` | `o == null` / `o != null` |
| `checkIndex`, `checkFromToIndex`, `checkFromIndexSize` | return the first argument, or throw `IndexOutOfBoundsException` (also for non-integers) |
| `toString(o, default?)` | the string form collections use, with an optional null default |
| `compare(a, b, c)` | `0` when `a === b` (without calling `c`), else `c(a, b)` |
| `deepEquals(a, b)` | like `equals`, but compares arrays and typed arrays element by element, recursively |
| `toIdentityString(o)` | `ClassName@hexIdentityHash`, ignoring the object's own `toString`/`hashCode` |

```ts
import { Objects } from '@ylcnfrht/collections';

console.log(Objects.equals(NaN, NaN), Objects.equals(new Date(5), new Date(5))); // → true true
console.log(Objects.equals(null, undefined), Objects.equals([1], [1])); // → false false
console.log(Objects.deepEquals([1, [2, 3]], [1, [2, 3]])); // → true
console.log(Objects.hash(1, 'a')); // → 1089

function greet(name: string | null | undefined): string {
  return `hi ${Objects.requireNonNull(name, () => 'name is required')}`;
}
try {
  greet(undefined);
} catch (e) {
  console.log((e as Error).name, (e as Error).message); // → NullPointerException name is required
}
console.log(Objects.requireNonNullElse(null, 'default')); // → default

const fail = (f: () => unknown) => {
  try {
    return String(f());
  } catch (e) {
    return (e as Error).message;
  }
};
console.log(fail(() => Objects.checkIndex(2, 3))); // → 2
console.log(fail(() => Objects.checkIndex(3, 3))); // → Index 3 out of bounds for length 3
console.log(fail(() => Objects.checkFromToIndex(2, 1, 3))); // → Range [2, 1) out of bounds for length 3
console.log(fail(() => Objects.checkFromIndexSize(2, 2, 3))); // → Range [2, 2 + 2) out of bounds for length 3
```

Arrays and plain objects have no `equals`, so they compare by reference. To use them as values in hash-based
collections, wrap them in a list or give them a class with `equals`/`hashCode` (see
[Writing equals and hashCode](/collections/concepts/equality/#writing-equals-and-hashcode)).

### How hashCode is computed

Numbers, strings, booleans and bigints hash with the JDK's formulas, bit for bit.

| Value | Hash |
| --- | --- |
| `null`, `undefined` | `0` |
| int32 number (including `-0`) | the number itself |
| any other number (fractions, ≥ 2³¹, `±Infinity`) | high 32 bits XOR low 32 bits of the IEEE-754 double (`1.5` → `1073217536`) |
| `NaN` | `0x7ff80000` (`2146959360`) for every NaN |
| string | `h = 31·h + charCode` over UTF-16 units, in 32-bit arithmetic |
| boolean | `true` → `1231`, `false` → `1237` |
| bigint | truncated to 64 bits, then high 32 bits XOR low 32 bits |
| `Date` | the number hash of `getTime()` |
| object with `hashCode()` | `o.hashCode() \| 0` |
| any other object, function or symbol | identity hash, assigned on first use and stable for the object's lifetime |

```ts
import { ArrayList, Objects } from '@ylcnfrht/collections';

console.log(Objects.hashCode('hello'), Objects.hashCode(2 ** 31), Objects.hashCode(true)); // → 99162322 1105199104 1231
console.log(Objects.hashCode(ArrayList.of(1, 2)) === Objects.hashCode(ArrayList.of(1, 2))); // → true
```

Identity hashes are kept in a `WeakMap`, so hashing an object does not keep it alive. Symbols are the exception: their
hashes are held in a regular `Map` and never freed.
