---
title: Ordering
description: Natural order of numbers, strings, dates and Comparable objects, and how to pass a comparator instead.
sidebar:
  order: 2
---

`TreeSet`, `TreeMap`, `PriorityQueue`, `list.sort(null)`, `Stream.sorted()` and `Collections.sort` use *natural
order* unless you pass a comparator. Natural order is defined for:

| Type | Order |
|---|---|
| objects with `compareTo` | `a.compareTo(b)` (see [Writing equals and hashCode](/concepts/equality/#writing-equals-and-hashcode)) |
| `number` | numeric; `-0` equals `0`, `NaN` sorts after everything else |
| `string` | UTF-16 code unit order, not `localeCompare` |
| `bigint` | numeric |
| `boolean` | `false < true` |
| `Date` | by time |
| anything else | throws `ClassCastException`, even on the first `add` to a `TreeSet` |

A **comparator** is a plain function `(a, b) => number`. The `Comparator` object holds helpers that build and combine
them:

```ts
import { ArrayList, Comparator, TreeSet, PriorityQueue } from '@ylcnfrht/collections';

interface Person { name: string; age: number | null }
const people = ArrayList.of<Person>(
  { name: 'Cleo', age: 31 }, { name: 'Ann', age: 31 }, { name: 'Bob', age: 25 }, { name: 'Dan', age: null },
);

const byAgeThenName = Comparator.thenComparing(
  Comparator.comparing((p: Person) => p.age, Comparator.nullsLast(Comparator.naturalOrder<number>())),
  Comparator.comparing((p: Person) => p.name),
);
people.sort(byAgeThenName);
console.log(people.stream().map((p) => p.name).toList().toString()); // → [Bob, Ann, Cleo, Dan]

const desc = new TreeSet<number>((a, b) => b - a); // a plain lambda works too
[1, 3, 2].forEach((n) => desc.add(n));
console.log(desc.toString()); // → [3, 2, 1]

const maxHeap = new PriorityQueue<number>(Comparator.reverseOrder<number>());
[4, 9, 1].forEach((n) => maxHeap.add(n));
console.log(maxHeap.poll()); // → 9

try {
  new TreeSet<object>().add({}); // no natural order
} catch (e) {
  console.log((e as Error).name); // → ClassCastException
}
```

Every helper (`naturalOrder`, `reverseOrder`, `reversed`, `comparing`, `thenComparing`, `nullsFirst`, `nullsLast`,
...) is on [Comparator and Objects](/utilities/comparator-and-objects/).
