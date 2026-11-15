---
title: Equality
description: How collections compare elements with equals() and hashCode(), the contract they rely on, and how to write both for your own classes.
sidebar:
  order: 1
---

Built-in JS collections compare objects by identity. Here every membership test (`contains`, `indexOf`, `remove(o)`,
`containsKey`, `get`, `equals` between collections) uses one rule, exposed as `Objects.equals(a, b)`:

1. If `a` has an `equals()` method, `a.equals(b)` decides.
2. Two `Date`s are equal when `getTime()` is equal.
3. Otherwise **SameValueZero**, the rule of JS `Map`/`Set`: `NaN` equals `NaN`, `0` equals `-0`, objects and arrays
   compare by identity.

Hashed collections (`HashMap`, `HashSet`, ...) also call `hashCode()`. The library's collections and map entries
implement both, so two lists with the same elements are equal whatever their class, and a list works as a map key.

```ts
import { ArrayList, LinkedList, HashSet, HashMap, List, Objects } from '@ylcnfrht/collections';

console.log(ArrayList.of(1, 2).equals(LinkedList.of(1, 2))); // → true

const routes = new HashMap<List<string>, string>();
routes.put(List.of('users', 'id'), 'userHandler');
console.log(routes.get(List.of('users', 'id'))); // → userHandler

const days = new HashSet<Date>();
days.add(new Date(0));
console.log(days.contains(new Date(0))); // → true

console.log(Objects.equals(NaN, NaN)); // → true

const arrays = new HashSet<number[]>();
arrays.add([1, 2]);
console.log(arrays.contains([1, 2])); // → false
```

Hash codes use the JDK formulas, so they are stable across runs and match the JDK: a string hashes as
`s[0]*31^(n-1) + ... + s[n-1]`, a list as `31 * h + hash(e)` over its elements, a set as the sum of its element
hashes.

```ts
import { Objects, List } from '@ylcnfrht/collections';

console.log(Objects.hashCode('ab'));   // → 3105
console.log(List.of(1, 2).hashCode()); // → 994
console.log(Objects.hash(1, 2));       // → 994
console.log(Objects.hashCode(null));   // → 0
```

## The equals/hashCode contract

| Rule | Why |
|---|---|
| `a.equals(a)` is true | otherwise a lookup cannot find an element that was added |
| `a.equals(b)` if and only if `b.equals(a)` | lookup order must not matter |
| transitive, and consistent over time | hashed and sorted structures assume it |
| `a.equals(b)` implies `a.hashCode() === b.hashCode()` | a `HashMap` looks in the bucket chosen by the hash first; an equal key in another bucket is never found |
| `a.equals(null)` is false | |

:::caution
Do not change an element's `equals`/`hashCode` while it is in a hashed collection, or its `compareTo` while it is in
a sorted one. The collection can no longer find it.
:::

## Writing equals and hashCode

Implement `equals(o: unknown): boolean` and `hashCode(): number`. `Objects.hash(...)` combines field hashes;
`Objects.equals` compares fields null-safely. To give the class a natural order, implement `Comparable<T>`
(`compareTo(o: T): number`).

```ts
import { HashSet, HashMap, TreeSet, Objects, Comparable } from '@ylcnfrht/collections';

class Point implements Comparable<Point> {
  constructor(readonly x: number, readonly y: number) {}

  equals(o: unknown): boolean {
    return o instanceof Point && o.x === this.x && o.y === this.y;
  }
  hashCode(): number {
    return Objects.hash(this.x, this.y);
  }
  compareTo(o: Point): number {
    return this.x - o.x || this.y - o.y;
  }
  toString(): string {
    return `(${this.x},${this.y})`;
  }
}

const visited = new HashSet<Point>();
visited.add(new Point(1, 2));
visited.add(new Point(1, 2)); // equal: not added again
console.log(visited.size()); // → 1

const labels = new HashMap<Point, string>();
labels.put(new Point(0, 0), 'origin');
console.log(labels.get(new Point(0, 0))); // → origin

const sorted = TreeSet.of(new Point(2, 0), new Point(1, 5), new Point(1, 1)); // uses compareTo
console.log(sorted.toString()); // → [(1,1), (1,5), (2,0)]
```

:::note
Sorted collections decide equality with `compareTo` (or the comparator) only. Two elements that compare as `0` are
the same element to a `TreeSet`, even if `equals` returns `false`. Keep `compareTo` consistent with `equals`.
:::
