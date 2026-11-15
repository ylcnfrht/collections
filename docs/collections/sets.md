# Sets

A set is a collection without duplicates. This page covers the `Set` interface and its sorted and sequenced variants, the implementations `HashSet`, `LinkedHashSet` and `TreeSet`, and their operations, views and costs.

> [!NOTE]
> `EnumSet` and concurrent sets (`ConcurrentSkipListSet`, `CopyOnWriteArraySet`) are not included. [Not included](../advanced/compatibility.md#not-included) explains why and what to use instead.

## The Set interface

Unlike the native JS `Set`, which compares elements with SameValueZero, the sets in this package decide whether an element is a duplicate with `equals()`/`hashCode()`, or with a comparator for `TreeSet`. Two distinct `Point(1, 2)` objects therefore count as one element. [Value equality](../guide/core-concepts.md#value-equality) explains how `equals()` and `hashCode()` work for primitives, plain objects and your own classes.

Every set in the package, and every set built on `AbstractSet`, follows three rules:

| Rule | Meaning |
| --- | --- |
| Uniqueness by `equals` | `add(e)` returns `false` and changes nothing when an element equal to `e` is already present. Hash sets find candidates by `hashCode()` first; tree sets use the comparator. |
| Value equality | `a.equals(b)` is `true` when `b` is any `Set` of the same size and `a` contains every element of `b`. A `HashSet` equals a `TreeSet` with the same elements; order never matters. |
| `hashCode` is a sum | A set's `hashCode()` is the sum of its elements' hash codes, so equal sets have equal hashes whatever their implementation or order. |

```ts
import { HashSet, TreeSet, LinkedHashSet, Objects } from '@ylcnfrht/collections';

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

const points = new HashSet<Point>();
console.log(points.add(new Point(1, 2))); // → true
// an equal element is already there
console.log(points.add(new Point(1, 2))); // → false
console.log(points.size());               // → 1
console.log(points.contains(new Point(1, 2))); // → true

// value equality across implementations, order ignored
const hashed = HashSet.of(3, 1, 2);
// with new:
// const hashed = new HashSet<number>();
// hashed.add(3);
// hashed.add(1);
// hashed.add(2);
const sorted = TreeSet.of(1, 2, 3);
// with new:
// const sorted = new TreeSet<number>();
// sorted.add(1);
// sorted.add(2);
// sorted.add(3);
const linked = LinkedHashSet.of(2, 3, 1);
// with new:
// const linked = new LinkedHashSet<number>();
// linked.add(2);
// linked.add(3);
// linked.add(1);
console.log(hashed.equals(sorted), sorted.equals(linked)); // → true true
console.log(hashed.hashCode() === linked.hashCode());      // → true
// 1 + 2 + 3
console.log(TreeSet.of(1, 2, 3).hashCode());               // → 6
```

The more specific interfaces add ordering:

| Interface | Adds | Implemented by |
| --- | --- | --- |
| `Set<E>` | the rules above, on top of `Collection<E>` | all sets |
| `SequencedSet<E>` | first/last access and `reversed()` | `LinkedHashSet`, `TreeSet` |
| `SortedSet<E>`, `NavigableSet<E>` | sorted order, nearest-element queries, range views | `TreeSet` |

## Implementations

| Class | Iteration order | `add` / `remove` / `contains` | Use it for |
| --- | --- | --- | --- |
| `HashSet` | unspecified | O(1) average | the default set |
| `LinkedHashSet` | insertion order | O(1) average | deduplication that keeps order; sequenced operations |
| `TreeSet` | sorted | O(log n) | sorted data, nearest-element queries, ranges |

The [data structures primer](../guide/data-structures.md#hashmap-and-hashset) shows how hash tables and trees store their data.

### HashSet

<ClassInfo name="HashSet" />

`HashSet` is the default choice. `null` and `undefined` are allowed as elements. To keep primitive-heavy sets at native speed, it routes each element to one of three internal stores, by the kind of equality the element needs:

- **Dense flag array.** Non-negative integers go into an array indexed by the value, as long as the array stays reasonably full. An integer that would make it sparse goes to the native `Set` instead.
- **Native `Set`.** Strings, numbers, booleans, bigints, symbols, `null`/`undefined`, and objects without an `equals()` method. Such objects are compared by identity, as in a native `Set`.
- **Hash buckets.** Objects with `equals()`/`hashCode()` (your own value classes and the package's collections) and `Date`s, which are equal when `getTime()` is equal. Elements with the same hash code share a bucket and are told apart with `equals()`.

The split is not observable: the set behaves as one hash set.

::: code-group

```ts [Basic]
import { HashSet } from '@ylcnfrht/collections';

const tags = new HashSet<string>();
console.log(tags.add('ts'));      // → true
console.log(tags.add('ts'));      // → false
tags.add('node');
console.log(tags.contains('ts')); // → true
console.log(tags.remove('node')); // → true
console.log(tags.size());         // → 1
for (const tag of tags) console.log(tag); // → ts
```

```ts [Intermediate]
import { HashSet, List } from '@ylcnfrht/collections';

const plain = new HashSet<object>();
plain.add({ id: 1 });
// no equals(): identity, like a native Set
console.log(plain.contains({ id: 1 })); // → false

const dates = new HashSet<Date>();
dates.add(new Date(0));
// Dates compare by time
console.log(dates.contains(new Date(0))); // → true

const lists = new HashSet<List<number>>();
lists.add(List.of(1, 2));
// collections have value equality
console.log(lists.contains(List.of(1, 2))); // → true
```

:::

### LinkedHashSet

<ClassInfo name="LinkedHashSet" />

`LinkedHashSet` is a `HashSet` (it passes `instanceof HashSet`) that remembers insertion order. It is a `SequencedSet`, so it adds the [sequenced operations](#sequenced-operations) and a reversed view.

::: code-group

```ts [Basic]
import { LinkedHashSet } from '@ylcnfrht/collections';

const steps = new LinkedHashSet<string>();
console.log(steps.add('build')); // → true
steps.add('test');
steps.add('deploy');
console.log(steps.add('build')); // → false
console.log(steps.contains('test')); // → true
console.log(steps.remove('test'));   // → true
console.log(steps.size());           // → 2
const order: string[] = [];
for (const step of steps) order.push(step); // insertion order
console.log(order.join(' '));        // → build deploy
```

```ts [Intermediate]
import { LinkedHashSet, ArrayList } from '@ylcnfrht/collections';

// unique page visits in first-seen order
const visits = ArrayList.of('home', 'docs', 'home', 'blog', 'docs');
console.log(new LinkedHashSet(visits).toString()); // → [home, docs, blog]

// recent searches: newest last, no repeats, at most 3 kept
const recent = new LinkedHashSet<string>();
const search = (q: string): void => {
  recent.addLast(q); // moves a repeated query to the end
  if (recent.size() > 3) recent.removeFirst();
};
for (const q of ['maps', 'sets', 'lists', 'maps', 'queues']) search(q);
console.log(recent.toString());            // → [lists, maps, queues]
console.log(recent.reversed().toString()); // → [queues, maps, lists]
```

:::

### TreeSet

<ClassInfo name="TreeSet" />

`TreeSet` keeps its elements sorted in a red-black tree, a self-balancing binary search tree. `add`, `remove` and `contains` are O(log n), even for already-sorted input, and iteration is always in order. It implements `NavigableSet`, which adds [navigation](#navigation) and [range views](#range-views).

`TreeSet` orders elements by natural ordering or by a comparator; see [ordering](#ordering-in-a-treeset). `null` elements throw `NullPointerException` under natural ordering.

::: code-group

```ts [Basic]
import { TreeSet } from '@ylcnfrht/collections';

const scores = new TreeSet<number>();
console.log(scores.add(70)); // → true
scores.add(95);
scores.add(82);
console.log(scores.add(70)); // → false
console.log(scores.contains(82)); // → true
console.log(scores.remove(95));   // → true
console.log(scores.size());       // → 2
let total = 0;
for (const s of scores) total += s; // ascending order
console.log(total);               // → 152
```

```ts [Intermediate]
import { TreeSet } from '@ylcnfrht/collections';

// booked meeting starts, in minutes since midnight
const booked = TreeSet.of(540, 600, 690, 840);
const hhmm = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// the meetings just before and after 10:30
console.log(hhmm(booked.floor(630)!), hhmm(booked.ceiling(630)!)); // → 10:00 11:30

// morning and afternoon, as live range views
console.log(booked.headSet(720).size()); // → 3
console.log(booked.tailSet(720).toString()); // → [840]

booked.add(780);
console.log(booked.tailSet(720).toString()); // → [780, 840]
console.log(hhmm(booked.first()), hhmm(booked.last())); // → 09:00 14:00
```

:::

## Creating a set

| Form | Result |
| --- | --- |
| `new HashSet<E>()`, `new LinkedHashSet<E>()` | empty set |
| `new HashSet<E>(initialCapacity, loadFactor?)` | empty set; the arguments are validated sizing hints (a negative capacity or a non-positive load factor throws `IllegalArgumentException`). Same for `LinkedHashSet`. |
| `new HashSet<E>(collection)`, `new LinkedHashSet<E>(collection)` | copy of any collection, duplicates dropped |
| `HashSet.of(a, b, c)`, `LinkedHashSet.of(…)`, `TreeSet.of(…)` | set of the arguments |
| `HashSet.newHashSet<E>(n)`, `LinkedHashSet.newLinkedHashSet<E>(n)` | empty set intended for `n` elements |
| `new TreeSet<E>()` | empty set, natural ordering |
| `new TreeSet<E>(comparator)` | empty set ordered by `comparator` |
| `new TreeSet<E>(collection)` | copy; keeps the comparator if the source is a sorted set, otherwise natural ordering |
| `s.clone()` | shallow copy of the same class |

The backing stores grow on their own, so the size passed to `newHashSet` and `newLinkedHashSet` is only a hint. The factories validate it (a negative or `NaN` count throws `IllegalArgumentException`) and exist so that code ported from the Java Collections Framework keeps compiling.

```ts
import { HashSet, LinkedHashSet } from '@ylcnfrht/collections';

const seen = HashSet.newHashSet<string>(1000);
const ordered = LinkedHashSet.newLinkedHashSet<string>(1000);
console.log(seen.isEmpty(), ordered.size()); // → true 0
try {
  HashSet.newHashSet(-1);
} catch (e) {
  console.log((e as Error).name); // → IllegalArgumentException
}
```

## Core operations

All sets have the full `Collection` API (`add`, `remove`, `contains`, `addAll`, `removeIf`, `stream()`, `toArray()`, `for...of`, …).

### Set algebra

The bulk operations implement the set-theory operators. They mutate the receiver, so copy first to keep the inputs. Copying into a `TreeSet` gives a sorted result.

| Operation | Recipe | Returns |
| --- | --- | --- |
| union A ∪ B | `copy.addAll(b)` | `true` if anything was added |
| intersection A ∩ B | `copy.retainAll(b)` | `true` if anything was removed |
| difference A − B | `copy.removeAll(b)` | `true` if anything was removed |
| subset A ⊆ B | `b.containsAll(a)` | `boolean` |
| disjoint | `Collections.disjoint(a, b)` | `boolean` |

```ts
import { HashSet, TreeSet, Collections } from '@ylcnfrht/collections';

const a = HashSet.of(1, 2, 3, 4);
const b = HashSet.of(3, 4, 5);

const union = new TreeSet<number>(a);
union.addAll(b);
console.log(union.toString()); // → [1, 2, 3, 4, 5]

const intersection = new TreeSet<number>(a);
intersection.retainAll(b);
console.log(intersection.toString()); // → [3, 4]

const difference = new TreeSet<number>(a);
difference.removeAll(b);
console.log(difference.toString()); // → [1, 2]

// symmetric difference: (A ∪ B) − (A ∩ B)
const symmetric = new TreeSet<number>(union);
symmetric.removeAll(intersection);
console.log(symmetric.toString()); // → [1, 2, 5]

console.log(a.containsAll(HashSet.of(1, 2)));        // → true
console.log(Collections.disjoint(a, HashSet.of(9))); // → true
```

The argument of `addAll`, `retainAll` and `removeAll` can be any collection. `retainAll`, and `removeAll` when the set is not larger than the argument, test membership with the argument's own `contains()`, which is O(n) for a list; prefer a set argument for large inputs. A `removeAll` on a larger set walks the argument and removes each of its elements instead, as the reference does.

### Sequenced operations

`LinkedHashSet` and `TreeSet` are [sequenced collections](../guide/core-concepts.md#sequenced-collections):

| Method | Returns | `LinkedHashSet` | `TreeSet` |
| --- | --- | --- | --- |
| `getFirst()` / `getLast()` | `E` | oldest / newest element | smallest / largest element |
| `removeFirst()` / `removeLast()` | `E` | removes the oldest / newest | removes the smallest / largest |
| `addFirst(e)` / `addLast(e)` | `void` | adds, or moves an existing element, to the front / back | throws `UnsupportedOperationException` |
| `reversed()` | `SequencedSet<E>` | live reverse-ordered view | live descending view |

The empty-set `get*` and `remove*` methods throw `NoSuchElementException`. On a `LinkedHashSet`, `add()` of an element that is already present keeps its position, while `addFirst` and `addLast` move it:

```ts
import { LinkedHashSet } from '@ylcnfrht/collections';

const s = LinkedHashSet.of('a', 'b', 'c');
s.add('a');            // already present: position unchanged
console.log(s.toString()); // → [a, b, c]

s.addFirst('c');       // moves c to the front
console.log(s.toString()); // → [c, a, b]
s.addLast('c');        // and back to the end
console.log(s.toString()); // → [a, b, c]

console.log(s.getFirst(), s.getLast()); // → a c
console.log(s.removeFirst());           // → a
console.log(s.toString());              // → [b, c]
```

### Ordering in a TreeSet

Without a comparator, `TreeSet` uses natural ordering: numbers numerically, strings by UTF-16 code unit, bigints, booleans and `Date`s by value, and objects with a `compareTo()` method (the `Comparable` interface) by that method. Mixing types that cannot be compared throws `ClassCastException`. Pass a comparator to choose another order; `Comparator` provides `comparing`, `reverseOrder`, `thenComparing`, `nullsFirst` and more (see [ordering](../guide/core-concepts.md#ordering-natural-order-and-comparators)). `comparator()` returns the comparator, or `null` for natural ordering.

```ts
import { TreeSet, Comparator } from '@ylcnfrht/collections';

console.log(TreeSet.of(30, 4, 100).toString());       // → [4, 30, 100]
console.log(TreeSet.of('pear', 'Apple', 'fig').toString()); // → [Apple, fig, pear]

const desc = new TreeSet<number>(Comparator.reverseOrder<number>());
desc.add(1);
desc.add(3);
desc.add(2);
console.log(desc.toString()); // → [3, 2, 1]

const byLength = new TreeSet<string>(Comparator.comparing((s: string) => s.length));
byLength.add('ccc');
byLength.add('a');
console.log(byLength.toString()); // → [a, ccc]
```

> [!WARNING]
> In a `TreeSet`, the comparator defines equality. The set never calls `equals()`: two elements are duplicates when the comparator returns 0. A case-insensitive comparator gives a case-insensitive set, and a comparator that ignores some fields merges elements that differ only in those fields. With such a comparator, `equals()` between a `TreeSet` and another set can depend on which side you ask.

```ts
import { TreeSet, Comparator } from '@ylcnfrht/collections';

const tags = new TreeSet<string>(Comparator.comparing((s: string) => s.toLowerCase()));
console.log(tags.add('TypeScript')); // → true
// compares as 0: a duplicate
console.log(tags.add('typescript')); // → false
console.log(tags.contains('TYPESCRIPT')); // → true
console.log(tags.toString());        // → [TypeScript]

// byLength treats every 3-letter word as the same element
const byLength = new TreeSet<string>(Comparator.comparing((s: string) => s.length));
byLength.add('cat');
console.log(byLength.add('dog')); // → false
```

### Navigation

`TreeSet` finds the nearest element to a probe value, which need not be in the set.

| Method | Returns |
| --- | --- |
| `first()` / `last()` | smallest / largest element; `NoSuchElementException` when empty |
| `lower(e)` | greatest element strictly less than `e`, or `null` |
| `floor(e)` | greatest element less than or equal to `e`, or `null` |
| `ceiling(e)` | least element greater than or equal to `e`, or `null` |
| `higher(e)` | least element strictly greater than `e`, or `null` |
| `pollFirst()` / `pollLast()` | removes and returns the smallest / largest element, or `null` when empty |

When the probe is itself an element, `floor` and `ceiling` return it, while `lower` and `higher` skip past it.

```ts
import { TreeSet } from '@ylcnfrht/collections';

const s = TreeSet.of(10, 20, 30, 40);
console.log(s.lower(25), s.floor(25), s.ceiling(25), s.higher(25)); // → 20 20 30 30
console.log(s.lower(30), s.floor(30), s.ceiling(30), s.higher(30)); // → 20 30 30 40
console.log(s.floor(5), s.higher(40));                             // → null null
console.log(s.first(), s.last());                                  // → 10 40
```

With `pollFirst()` and `pollLast()`, a `TreeSet` works as a priority queue without duplicates:

```ts
import { TreeSet } from '@ylcnfrht/collections';

const pending = TreeSet.of(5, 1, 3);
console.log(pending.pollFirst()); // → 1
console.log(pending.pollLast());  // → 5
console.log(pending.toString());  // → [3]
console.log(new TreeSet<number>().pollFirst()); // → null
```

## Views

Set views are [live](../guide/core-concepts.md#live-views): they reflect later changes to the set, and changes made through them write through to it. Creating a view is O(1).

### Reversed view

`reversed()` on a `LinkedHashSet` returns a live view in reverse order. `add` on the view behaves like `add` on the set (it appends at the set's end), while `addFirst` on the view is `addLast` on the set.

```ts
import { LinkedHashSet } from '@ylcnfrht/collections';

const s = LinkedHashSet.of(1, 2, 3);
const r = s.reversed();
console.log(r.toString()); // → [3, 2, 1]

r.addFirst(4);             // front of the view = end of the set
console.log(s.toString()); // → [1, 2, 3, 4]
s.remove(2);
console.log(r.toString()); // → [4, 3, 1]
```

### Range views

| Call | Elements | Default bounds |
| --- | --- | --- |
| `headSet(to)` | `< to` | `to` exclusive |
| `headSet(to, inclusive)` | `< to` or `<= to` | as given |
| `tailSet(from)` | `>= from` | `from` inclusive |
| `tailSet(from, inclusive)` | `>= from` or `> from` | as given |
| `subSet(from, to)` | `from <= e < to` | half-open |
| `subSet(from, fromInc, to, toInc)` | as given | as given |

```ts
import { TreeSet } from '@ylcnfrht/collections';

const s = TreeSet.of(10, 20, 30, 40, 50);
console.log(s.headSet(30).toString());        // → [10, 20]
console.log(s.headSet(30, true).toString());  // → [10, 20, 30]
console.log(s.tailSet(30).toString());        // → [30, 40, 50]
console.log(s.tailSet(30, false).toString()); // → [40, 50]
console.log(s.subSet(20, 40).toString());     // → [20, 30]

const low = s.headSet(30);
s.add(5);                        // a change to the set shows in the view
console.log(low.toString());     // → [5, 10, 20]
low.remove(10);                  // a change through the view writes through
console.log(s.toString());       // → [5, 20, 30, 40, 50]
```

A view remembers its bounds. Adding an element outside them throws `IllegalArgumentException`, and so does requesting a nested range that reaches beyond them. `subSet(from, to)` with `from > to` is rejected the same way.

```ts
import { TreeSet } from '@ylcnfrht/collections';

const s = TreeSet.of(10, 20, 30, 40, 50);
const mid = s.subSet(20, true, 40, false); // [20, 40)

const nameOf = (f: () => unknown): string => {
  try {
    f();
    return 'no error';
  } catch (e) {
    return (e as Error).name;
  }
};
console.log(nameOf(() => mid.add(45)));         // → IllegalArgumentException
console.log(nameOf(() => mid.subSet(10, 30)));  // → IllegalArgumentException
console.log(nameOf(() => mid.headSet(45)));     // → IllegalArgumentException
console.log(nameOf(() => s.subSet(40, 20)));    // → IllegalArgumentException
console.log(mid.add(25), s.toString()); // → true [10, 20, 25, 30, 40, 50]
```

For a string `prefix`, the range `[prefix, prefix + '\uffff')` contains the strings that start with it, unless the character after the prefix is U+FFFF itself:

```ts
import { TreeSet } from '@ylcnfrht/collections';

const users = TreeSet.of('alice', 'albert', 'bob', 'alfred', 'carol');
const prefix = 'al';
console.log(users.subSet(prefix, prefix + '\uffff').toString()); // → [albert, alfred, alice]
```

### Descending view

`descendingSet()`, and its synonym `reversed()`, return a live view of a `TreeSet` in reverse order. `descendingIterator()` walks the set from the largest element down. In the descending view the navigation methods flip too: `first()` is the largest element and `headSet` takes the high end.

```ts
import { TreeSet } from '@ylcnfrht/collections';

const s = TreeSet.of(1, 2, 3);
const d = s.descendingSet();
console.log(d.toString());            // → [3, 2, 1]
console.log(d.first());               // → 3
console.log(d.headSet(2).toString()); // → [3]
s.add(0);
console.log(d.toString());            // → [3, 2, 1, 0]
console.log(s.descendingIterator().next()); // → 3
```

## Iteration

A `HashSet` iterates in an unspecified order, a `LinkedHashSet` in insertion order, and a `TreeSet` in sorted order. All set iterators are [fail-fast](../guide/core-concepts.md#fail-fast-iteration): changing a set while iterating it, other than through the iterator's own `remove()`, throws `ConcurrentModificationException`.

```ts
import { HashSet } from '@ylcnfrht/collections';

const s = HashSet.of(1, 2, 3, 4);
try {
  for (const x of s) s.remove(x); // structural change behind the iterator's back
} catch (e) {
  console.log((e as Error).name); // → ConcurrentModificationException
}

// the safe ways
const t = HashSet.of(1, 2, 3, 4);
t.removeIf((x) => x % 2 === 0);
const it = t.iterator();
while (it.hasNext()) if (it.next() === 3) it.remove();
console.log(t.toString()); // → [1]
```

## Complexity

n is the size of the set, r the number of elements in a range view.

| Operation | `HashSet` | `LinkedHashSet` | `TreeSet` |
| --- | --- | --- | --- |
| `add`, `remove`, `contains` | O(1) average | O(1) average | O(log n) |
| `size`, `isEmpty` | O(1) | O(1) | O(1) (range view: O(r)) |
| iteration (whole set) | O(n) | O(n) | O(n) |
| `getFirst`/`getLast`, `removeFirst`/`removeLast` | — | O(1) | O(log n) |
| `addFirst`/`addLast` (move) | — | O(1) | unsupported |
| `first`/`last`, `lower`/`floor`/`ceiling`/`higher` | — | — | O(log n) |
| `pollFirst`/`pollLast` | — | — | O(log n) |
| `headSet`/`tailSet`/`subSet`/`descendingSet` (creating the view) | — | — | O(1) |
| iteration order | unspecified | insertion | sorted |

Hash costs assume reasonable `hashCode()` implementations. Elements that share a hash code land in one bucket, which is scanned linearly. See [performance](../advanced/performance.md) for measurements.

## Pitfalls

### Mutating an element inside a hash set

> [!WARNING]
> Do not change the fields that `equals()`/`hashCode()` read while the element is in a hash set. The set filed the element under its hash code at insertion time. After the change, the element is still there (it appears in iteration and `size()`), but `contains` and `remove` can no longer find it.

```ts
import { HashSet, Objects } from '@ylcnfrht/collections';

class MutablePoint {
  constructor(public x: number, public y: number) {}
  equals(o: unknown): boolean {
    return o instanceof MutablePoint && o.x === this.x && o.y === this.y;
  }
  hashCode(): number {
    return Objects.hash(this.x, this.y);
  }
  toString(): string {
    return `(${this.x}, ${this.y})`;
  }
}

const set = new HashSet<MutablePoint>();
const p = new MutablePoint(1, 2);
set.add(p);

p.x = 9; // mutated while inside the set
console.log(set.contains(p));      // → false
console.log(set.remove(p));        // → false
console.log(set.size(), set.toString()); // → 1 [(9, 2)]
```

Make the fields used by `equals`/`hashCode` immutable (`readonly`), or remove the element, change it, and add it back. The same applies to the fields a `TreeSet` comparator reads, and to map keys.

### Other pitfalls

- **`HashSet` order is unspecified.** Small integers may appear sorted because they live in the dense array; do not depend on it. Use `LinkedHashSet` or `TreeSet`, or sort a copy.
- **Plain objects compare by identity.** `{ id: 1 }` and `{ id: 1 }` are two elements. Give the class `equals()` and `hashCode()` for value semantics.
- **The package's `Set` shadows the native `Set`.** Importing `Set` from the package hides the global one in that module; use `globalThis.Set` or an import alias.

See [choosing a collection](../guide/choosing-a-collection.md) for when to use which set, and [Collectors](../streams/collectors.md) for building sets from streams (`Collectors.toSet()`, `Collectors.toCollection(() => new TreeSet())`).
