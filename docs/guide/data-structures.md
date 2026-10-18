# Data structures primer

JS gives you arrays, `Map` and `Set`. This library adds the classic data structures from the Java Collections
Framework, each built for a different access pattern. If names like `ArrayList`, `ArrayDeque` or `TreeMap` are new to
you, this page explains what each one is, when to reach for it, and how it lays out your data in memory. Every
section has the same shape: what it is, when to use it, how it stores data, and what it costs.

- [At a glance](#at-a-glance)
- [ArrayList](#arraylist) · [LinkedList](#linkedlist) · [ArrayDeque](#arraydeque) · [PriorityQueue](#priorityqueue)
- [HashMap and HashSet](#hashmap-and-hashset) · [LinkedHashMap and LinkedHashSet](#linkedhashmap-and-linkedhashset) · [TreeMap and TreeSet](#treemap-and-treeset)
- [Immutable collections](#immutable-collections)
- [Reading the costs](#reading-the-costs)

## At a glance

| Structure | Closest JS equivalent | Order | Use it for |
|---|---|---|---|
| `ArrayList` | `Array` | insertion, by index | the default list: index access, appending |
| `LinkedList` | none | insertion | frequent adds/removes at both ends or through an iterator |
| `ArrayDeque` | `Array` used with `push`/`shift` | insertion | queues and stacks (FIFO / LIFO) |
| `PriorityQueue` | none | smallest first | "always give me the most urgent item" |
| `HashMap` / `HashSet` | `Map` / `Set` | none | fast lookup by key, with value-equal keys |
| `LinkedHashMap` / `LinkedHashSet` | `Map` / `Set` | insertion or access | lookup plus a predictable order; LRU caches |
| `TreeMap` / `TreeSet` | none | sorted | sorted data, ranges, "nearest key" queries |
| `List.of`, `Set.of`, `Map.of` | `Object.freeze([...])` | per type | constants and safe sharing |

## ArrayList

**What it is:** a resizable array. It is the closest relative of a JS array, plus the list API (`get`, `set`,
`removeAt`, `indexOf`, `subList`, …), value equality and fail-fast iteration.

**Use it when:** you need a general-purpose list: reading by index, appending, sorting. This is the default
choice; pick something else only when its access pattern fits better.

**How it stores data:** one contiguous array. Index access jumps straight to a slot; inserting in the middle
shifts every later element.

```text
 ArrayList ['a', 'x', 'b', 'c']

 index:    0     1     2     3
        ┌─────┬─────┬─────┬─────┐
        │ 'a' │ 'x' │ 'b' │ 'c' │      one contiguous array
        └─────┴─────┴─────┴─────┘
 get(2)       → read slot 2 directly                 O(1)
 add(1, 'x')  → shift 'b', 'c' one slot right, then write   O(n)
```

```ts
import { ArrayList } from 'ts-collections-framework';

const list = ArrayList.of('a', 'b', 'c');
list.add(1, 'x');
console.log(list.toString()); // → [a, x, b, c]
console.log(list.get(2)); // → b
```

**Costs:** `get`/`set` O(1) · `add` at the end O(1) amortized · insert/remove in the middle O(n) · `contains` O(n).
More: [Lists](../collections/lists.md#arraylist).

## LinkedList

**What it is:** a chain of nodes, each pointing to its previous and next neighbour. It implements both `List` and
`Deque`.

**Use it when:** you add and remove at both ends, or insert/remove while walking with a list iterator. For a plain
queue or stack, [`ArrayDeque`](#arraydeque) is usually faster.

**How it stores data:** every element lives in its own node; the list keeps references to the first and last node.
Relinking a node is cheap, but reaching index `i` means walking there.

```text
  first                                       last
    │                                           │
    ▼                                           ▼
 ┌───────┐  next   ┌───────┐  next   ┌───────┐  next   ┌───────┐
 │   1   │ ──────▶ │   2   │ ──────▶ │   3   │ ──────▶ │   4   │
 │       │ ◀────── │       │ ◀────── │       │ ◀────── │       │
 └───────┘  prev   └───────┘  prev   └───────┘  prev   └───────┘
 addFirst / addLast / removeFirst / removeLast → relink one node     O(1)
 get(i) → walk from the nearer end                                   O(n)
```

```ts
import { LinkedList } from 'ts-collections-framework';

const line = LinkedList.of(2, 3);
line.addFirst(1);
line.addLast(4);
console.log(line.toString()); // → [1, 2, 3, 4]
console.log(line.removeFirst()); // → 1
```

**Costs:** add/remove at either end O(1) · `get(i)` O(n) · insert/remove through an iterator O(1).
More: [Lists](../collections/lists.md#linkedlist).

## ArrayDeque

**What it is:** a double-ended queue ("deck") backed by a circular array. It is the recommended structure for both
queues (first in, first out) and stacks (last in, first out).

**Use it when:** you process items in arrival order (task queues, breadth-first search) or need a stack. Unlike
`Array.prototype.shift()`, which moves every element, removing from the front is O(1). It does not accept `null`.

**How it stores data:** a fixed-size array used as a ring. `head` marks the first element and `tail` the next free
slot; both wrap around the end, so nothing ever shifts. When the ring fills up, it doubles.

```text
 after addLast('b'), addFirst('a'), push('top')

 slot:     0       1       2       3       4       5       6       7
        ┌───────┬───────┬───────┬───────┬───────┬───────┬───────┬───────┐
        │  'b'  │       │       │       │       │       │ 'top' │  'a'  │
        └───────┴───────┴───────┴───────┴───────┴───────┴───────┴───────┘
                    ▲                                       ▲
                   tail                                    head
 logical order: top, a, b        (reading starts at head and wraps around to slot 0)
```

```ts
import { ArrayDeque } from 'ts-collections-framework';

const tasks = new ArrayDeque<string>();
tasks.addLast('b');
tasks.addFirst('a');
tasks.push('top'); // push adds at the front, like a stack
console.log(tasks.toString()); // → [top, a, b]
console.log(tasks.pollLast()); // → b
console.log(tasks.pop()); // → top
```

**Costs:** add/remove/peek at either end O(1) amortized · `contains` O(n).
More: [Queues and deques](../collections/queues-and-deques.md#arraydeque).

## PriorityQueue

**What it is:** a queue that always hands out its smallest element first (by natural order or by a comparator you
pass). It is a binary heap.

**Use it when:** you repeatedly need "the next most important item": schedulers, Dijkstra's shortest path, merging
sorted streams, keeping the top-k results.

**How it stores data:** a tree kept in a plain array. The smallest element sits at the root (index 0), and every
parent is smaller than its children. Children of index `i` live at `2i + 1` and `2i + 2`. The array is only partly
ordered, so iterating it does **not** give sorted order; `poll()` does.

```text
 after adding 5, 1, 8, 3

            1                 array:  [ 1, 3, 8, 5 ]
          /   \               index:    0  1  2  3
         3     8
        /                     parent of i: ⌊(i − 1) / 2⌋
       5                      children of i: 2i + 1, 2i + 2
 peek() → read the root                              O(1)
 add / poll → sift the element up or down one level at a time   O(log n)
```

```ts
import { PriorityQueue } from 'ts-collections-framework';

const queue = new PriorityQueue<number>();
[5, 1, 8, 3].forEach((n) => queue.add(n));
console.log(queue.poll()); // → 1
console.log(queue.poll()); // → 3
```

**Costs:** `peek` O(1) · `add`/`poll` O(log n) · `remove(element)`/`contains` O(n).
More: [Queues and deques](../collections/queues-and-deques.md#priorityqueue).

## HashMap and HashSet

**What they are:** a hash table mapping keys to values (`HashMap`), and a set of unique elements built on the same
idea (`HashSet`). They play the roles of JS `Map` and `Set`, with one important difference: keys are compared with
`equals()`/`hashCode()` when your objects define them, so two different objects with the same content are the same
key.

**Use them when:** you look things up by key or check membership, and you don't care about order.

**How they store data:** each key's `hashCode()` picks a bucket; lookup checks only that bucket, comparing with
`equals()`. Primitive keys (numbers, strings, …) and objects without `equals()` take a fast path through JS's own
`Map`, so they cost about the same as a native `Map`.

```text
 key ──hashCode()──▶ bucket            (one lookup touches one bucket)

 bucket 0 │
 bucket 1 │ ── Point(1, 2) → 'home'
 bucket 2 │ ── Point(3, 0) → 'shop' ── Point(0, 3) → 'park'    ← a shared bucket: entries told apart by equals()
 bucket 3 │
```

```ts
import { HashSet } from 'ts-collections-framework';

class Point {
  constructor(readonly x: number, readonly y: number) {}
  equals(o: unknown): boolean {
    return o instanceof Point && o.x === this.x && o.y === this.y;
  }
  hashCode(): number {
    return 31 * this.x + this.y;
  }
}

const visited = new HashSet<Point>();
visited.add(new Point(1, 2));
console.log(visited.contains(new Point(1, 2))); // → true
console.log(new Set([new Point(1, 2)]).has(new Point(1, 2))); // → false
```

**Costs:** `get`/`put`/`remove`/`contains` O(1) on average · iteration order unspecified.
More: [Maps](../collections/maps.md#hashmap) · [Sets](../collections/sets.md#hashset).

## LinkedHashMap and LinkedHashSet

**What they are:** a hash table plus a doubly linked list running through all entries. The table gives O(1)
lookup; the list gives a predictable order.

**Use them when:** you want hash-table speed and a stable iteration order (insertion order by default). With
access order, every read moves the entry to the end, which makes an LRU cache: the least recently used entry is
always at the front, ready to evict.

**How they store data:**

```text
 hash table (lookup)       +       linked list through the entries (order)

 bucket │ 'a' → 1  ─┐
 bucket │ 'b' → 2  ─┼──▶  head ⇄ ['a' → 1] ⇄ ['b' → 2] ⇄ ['c' → 3] ⇄ tail
 bucket │ 'c' → 3  ─┘
 access order: get('a') moves ['a' → 1] next to tail; eviction removes the entry at head
```

```ts
import { LinkedHashMap } from 'ts-collections-framework';

const cache = LinkedHashMap.lru<string, string>(2); // keeps the 2 most recently used entries
cache.put('a', '1');
cache.put('b', '2');
cache.get('a'); // 'a' is now the most recently used
cache.put('c', '3'); // evicts 'b', the least recently used
console.log(cache.keySet().toString()); // → [a, c]
```

**Costs:** same as `HashMap`, plus ordered iteration.
More: [Maps](../collections/maps.md#linkedhashmap).

## TreeMap and TreeSet

**What they are:** a sorted map and a sorted set, kept in a balanced binary search tree (a red-black tree).
`TreeSet` is the key set of a `TreeMap`.

**Use them when:** you need data in sorted order at all times, range queries ("all keys between 10 and 20"), or
nearest-key lookups ("the largest key ≤ 85"). JS has no built-in equivalent.

**How they store data:** every node holds one entry; smaller keys go left, larger keys go right. The tree rebalances
itself on every change, so every path from the root is short, about log₂ n steps.

```text
 after putting 70=C, 90=A, 80=B

              80=B
             /    \
          70=C    90=A
 smaller keys to the left, larger to the right
 floorKey(85): 85 > 80, remember 80 and go right; 85 < 90, go left; nothing there → 80
 iteration visits left → node → right: ascending key order
```

```ts
import { TreeMap, TreeSet } from 'ts-collections-framework';

const grades = new TreeMap<number, string>();
grades.put(70, 'C');
grades.put(90, 'A');
grades.put(80, 'B');
console.log(grades.toString()); // → {70=C, 80=B, 90=A}
console.log(grades.floorKey(85)); // → 80
console.log(grades.headMap(85).toString()); // → {70=C, 80=B}

console.log(TreeSet.of(5, 1, 3).ceiling(2)); // → 3
```

**Costs:** `get`/`put`/`remove`/`floorKey`/`ceilingKey` O(log n) · `firstKey`/`lastKey` O(log n) · in-order
iteration O(n).
More: [Maps](../collections/maps.md#treemap) · [Sets](../collections/sets.md#treeset).

## Immutable collections

**What they are:** `List.of`, `Set.of` and `Map.of` create collections that can never change. Every mutator throws
`UnsupportedOperationException`, and they reject `null`.

**Use them when:** you define constants, return data that callers must not modify, or share data safely between
modules.

**How they store data:** a frozen array (lists), plus a lookup index for sets and maps. Nothing can resize or shift,
so reads are as fast as on the mutable classes.

```ts
import { List } from 'ts-collections-framework';

const weekdays = List.of('Mon', 'Tue', 'Wed');
try {
  weekdays.add('Thu');
} catch (e) {
  console.log((e as Error).name); // → UnsupportedOperationException
}
```

More: [Immutable collections and wrappers](../collections/immutable-and-wrappers.md).

## Reading the costs

The costs above use big-O notation: how the time of one operation grows with the number of elements `n`.

| Notation | Meaning | With 1,000,000 elements |
|---|---|---|
| O(1) | constant: independent of size | one step |
| O(log n) | grows very slowly (each step halves the work) | about 20 steps |
| O(n) | proportional to size | up to a million steps |

"Amortized" means an operation is usually O(1) and occasionally more expensive (for example when an array doubles),
averaging out to O(1). Full tables for every operation: [Performance](../advanced/performance.md). To pick a
structure step by step: [Choosing a collection](./choosing-a-collection.md).
