---
title: Custom collections
description: Build your own list, set, queue or map on the Abstract* skeletons and keep the contracts the library relies on.
sidebar:
  order: 1
---

The skeleton classes implement most of a collection interface on top of a few primitive methods. Implement the
primitives and you inherit `contains`, `indexOf`, `subList`, `equals`/`hashCode`/`toString`, bulk operations, `stream()`,
`spliterator()`, `for..of`, sequenced methods such as `getFirst`/`reversed`, and fail-fast iteration. The result works
anywhere a library collection does: in `Collections.*`, as a copy-constructor argument, in `equals` against built-in
collections, and as a stream source.

```text
AbstractCollection         iterator(), size()
├── AbstractList           + get(i)                  (has modCount)
│   └── AbstractSequentialList   + listIterator(i)
├── AbstractQueue          + offer(e), poll(), peek()
└── AbstractSet
AbstractMap                entrySet()                (separate root: a map is not a collection)
```

## What each skeleton requires

Mutators (`add`, `set`, `put`, ...) default to throwing `UnsupportedOperationException`; override them to make the
collection modifiable.

| Skeleton | Read-only: implement | Modifiable: also override | Gives you |
| --- | --- | --- | --- |
| `AbstractCollection<E>` | `iterator()`, `size()` | `add(e)`; an iterator whose `remove()` works | the whole `Collection` interface, `stream()`, `for..of` |
| `AbstractList<E>` | `get(i)`, `size()` | `set(i, e)`; to grow or shrink, `addAtIndex(i, e)` and `removeAt(i)` that bump `modCount` | `List` + `SequencedCollection`: iterators, `subList`, `reversed()`, `sort`, value `equals`/`hashCode` |
| `AbstractSequentialList<E>` | `listIterator(index)`, `size()` | a list iterator with `set`/`add`/`remove` and its own `modCount` tracking | positional `get`/`set`/`add`/`removeAt` built on the list iterator |
| `AbstractQueue<E>` | `offer`, `poll`, `peek`, `iterator()`, `size()` | nothing more | `add` (throws `IllegalStateException` when `offer` refuses), `remove()`, `element()`, `clear`, `addAll` |
| `AbstractSet<E>` | `iterator()`, `size()` | `add(e)`; an iterator with `remove()` | set `equals`/`hashCode`, a fast `removeAll`, a `DISTINCT` (or `SORTED`) spliterator |
| `AbstractMap<K, V>` | `entrySet()` | `put(k, v)`; an entry-set iterator with `remove()` | the whole `Map` interface, `keySet()`/`values()` views, `compute*`, `merge` |

The defaults are correct but generic: `AbstractCollection.contains` is a linear scan and `AbstractMap.get` walks
`entrySet()`. Override what your storage does faster (`contains`, `size`, and `findEntry` on a map).
`AbstractQueue` assumes the queue rejects `null`, because `poll()` and `peek()` return `null` for "empty".
`AbstractMap` also exports `SimpleEntry` (mutable) and `SimpleImmutableEntry` (`setValue` throws) for building entry sets.

## Contracts to keep

### modCount

Every iterator, `subList` view and spliterator of an `AbstractList` records `modCount` and throws
`ConcurrentModificationException` when it changes underneath them. Increment it once per structural change.

| Operation | Bump `modCount`? |
| --- | --- |
| `addAtIndex`, `removeAt`, `clear`, an eviction | yes, once per call |
| `set(i, e)`, and `sort` (which uses `set`) | no |
| a failed operation that changed nothing | no |

The iterator's own `remove()`/`add()` go through `removeAt`/`addAtIndex` and then adopt the new count, so they keep
working. `AbstractCollection`, `AbstractSet` and `AbstractMap` have no `modCount`: their iterators are whatever you
return. Delegate to a library collection's iterator to inherit fail-fast behaviour, or keep a counter yourself.

### Override addAtIndex, not add

`List.add(e)` appends and `add(index, e)` inserts. `AbstractList.add` tells them apart by argument count and routes both
to one protected hook, as do the other insert paths:

```text
add(e)            → addAtIndex(size(), e); return true
add(index, e)     → addAtIndex(index, e)
addAll(c)         → addAllAt(size(), c)
addAll(index, c)  → addAllAt(index, c)
addFirst / addLast, listIterator().add, subList(...).add  → addAtIndex
```

Overriding only `add(e)` would turn `add(0, x)` into a wrong append and miss inserts through views and iterators.
`addAllAt` defaults to a loop of `addAtIndex`; override it if your storage can insert a batch at once. Validate indices
with `Objects.checkIndex` (for `get`/`set`/`removeAt`) and `0 <= index <= size()` (for `addAtIndex`), throwing
`IndexOutOfBoundsException`.

### The RANDOM_ACCESS brand

Add `get [RANDOM_ACCESS](): true` (and `implements RandomAccess`) when `get(i)` is O(1); `AbstractList` does not add it.
With the brand, `Collections` algorithms use indexed loops, `subList` views report the brand too, and `spliterator()`
splits by index. Leave it off for linked storage, or those algorithms become O(n²).

### Sorted sets

`AbstractSet.spliterator()` reports `DISTINCT | SIZED | SUBSIZED`. If the set also has `comparator()`, `first()`,
`last()` and `headSet()`, it is treated as sorted: the spliterator adds `SORTED | ORDERED` and `getComparator()` returns
your `comparator()` (`null` for natural order), so streams can skip a redundant `sorted()`. The check is structural:
the class need not declare `implements SortedSet`. For the full `NavigableSet` API, extending `TreeSet` is less work.

## Example: a computed range (AbstractCollection)

A collection need not store its elements. `IntRange` uses O(1) memory and answers `contains` in O(1).

```ts
import { AbstractCollection, HashSet, NoSuchElementException, UnsupportedOperationException } from '@ylcnfrht/collections';
import type { Iterator } from '@ylcnfrht/collections';

class IntRange extends AbstractCollection<number> {
  constructor(private readonly start: number, private readonly end: number, private readonly step = 1) {
    super();
    if (!Number.isInteger(step) || step <= 0) throw new RangeError('step must be a positive integer');
  }
  size(): number {
    return Math.max(0, Math.ceil((this.end - this.start) / this.step));
  }
  iterator(): Iterator<number> {
    let i = 0;
    const n = this.size();
    const { start, step } = this;
    return {
      hasNext: () => i < n,
      next: () => {
        if (i >= n) throw new NoSuchElementException();
        return start + step * i++;
      },
      remove: () => {
        throw new UnsupportedOperationException('read-only');
      },
      forEachRemaining(action) {
        while (i < n) action(start + step * i++);
      },
    };
  }
  override contains(o: unknown): boolean {
    return typeof o === 'number' && Number.isInteger(o) && o >= this.start && o < this.end && (o - this.start) % this.step === 0;
  }
}

const evens = new IntRange(0, 10, 2);
console.log(evens.size(), evens); // → 5 [0, 2, 4, 6, 8]
console.log(evens.stream().mapToInt((x) => x * x).sum(), new HashSet(evens).contains(8)); // → 120 true

try {
  evens.add(12);
} catch (e) {
  console.log((e as Error).name); // → UnsupportedOperationException
}
evens.removeIf((x) => x > 100); // matches nothing, so iterator().remove() is never called
```

`removeIf` and `clear` work through `iterator().remove()`, so they throw only when they reach an element to remove. A
plain `AbstractCollection` uses identity `equals`; extend `AbstractSet` or `AbstractList` for value equality.

## Example: a ring list (AbstractList)

`RingList` keeps the last `capacity` elements; appending to a full list evicts the oldest. It has O(1) `get`, so it
carries the brand.

```ts
import { AbstractList, ConcurrentModificationException, IllegalStateException, IndexOutOfBoundsException, List, Objects, RANDOM_ACCESS } from '@ylcnfrht/collections';
import type { RandomAccess } from '@ylcnfrht/collections';

class RingList<E> extends AbstractList<E> implements RandomAccess {
  private readonly buf: E[];
  private head = 0; // physical index of element 0
  private count = 0;

  constructor(readonly capacity: number) {
    super();
    if (!Number.isInteger(capacity) || capacity <= 0) throw new RangeError('capacity must be a positive integer');
    this.buf = new Array<E>(capacity);
  }
  get [RANDOM_ACCESS](): true {
    return true;
  }
  private phys(i: number): number {
    return (this.head + i) % this.capacity;
  }
  size(): number {
    return this.count;
  }
  get(index: number): E {
    Objects.checkIndex(index, this.count);
    return this.buf[this.phys(index)];
  }
  override set(index: number, e: E): E {
    Objects.checkIndex(index, this.count);
    const p = this.phys(index);
    const old = this.buf[p];
    this.buf[p] = e; // not structural: no modCount++
    return old;
  }
  protected override addAtIndex(index: number, e: E): void {
    if (!Number.isInteger(index) || index < 0 || index > this.count) {
      throw new IndexOutOfBoundsException(`Index: ${index}, Size: ${this.count}`);
    }
    if (this.count === this.capacity) {
      if (index !== this.count) throw new IllegalStateException('full: only appends evict');
      this.buf[this.head] = e; // overwrite the oldest slot, which becomes the newest
      this.head = (this.head + 1) % this.capacity;
      this.modCount++;
      return;
    }
    for (let i = this.count; i > index; i--) this.buf[this.phys(i)] = this.buf[this.phys(i - 1)];
    this.buf[this.phys(index)] = e;
    this.count++;
    this.modCount++;
  }
  override removeAt(index: number): E {
    Objects.checkIndex(index, this.count);
    const old = this.buf[this.phys(index)];
    for (let i = index; i < this.count - 1; i++) this.buf[this.phys(i)] = this.buf[this.phys(i + 1)];
    this.buf[this.phys(this.count - 1)] = undefined as E; // drop the reference
    this.count--;
    this.modCount++;
    return old;
  }
}

const recent = new RingList<number>(3);
for (let i = 1; i <= 5; i++) recent.add(i);
console.log(recent, recent.equals(List.of(3, 4, 5))); // → [3, 4, 5] true

// inherited: indexOf, subList and reversed views, sort, insert by index
console.log(recent.indexOf(4), recent.subList(1, 3), recent.reversed()); // → 1 [4, 5] [5, 4, 3]
recent.removeAt(0);
recent.add(0, 9);
recent.sort(null);
console.log(recent); // → [4, 5, 9]

// an eviction is structural, so an open iterator fails
try {
  for (const x of recent) if (x === 4) recent.add(7);
} catch (e) {
  console.log(e instanceof ConcurrentModificationException); // → true
}
recent.removeIf((x) => x > 5); // goes through the iterator's remove(): no exception
console.log(recent); // → [5]
```

## Example: a bounded queue (AbstractQueue)

`offer` returns `false` when full, and the inherited `add` turns that into `IllegalStateException`. Storage delegates to
an `ArrayDeque`, which supplies a fail-fast iterator with `remove()`.

```ts
import { AbstractQueue, ArrayDeque, IllegalArgumentException, Objects } from '@ylcnfrht/collections';
import type { Iterator } from '@ylcnfrht/collections';

class BoundedQueue<E> extends AbstractQueue<E> {
  private readonly items: ArrayDeque<E>;
  constructor(readonly capacity: number) {
    super();
    if (!Number.isInteger(capacity) || capacity <= 0) throw new IllegalArgumentException(`capacity: ${capacity}`);
    this.items = new ArrayDeque<E>(capacity);
  }
  offer(e: E): boolean {
    Objects.requireNonNull(e); // null means "empty" to poll()/peek()
    if (this.items.size() >= this.capacity) return false;
    this.items.addLast(e);
    return true;
  }
  poll(): E | null {
    return this.items.pollFirst();
  }
  peek(): E | null {
    return this.items.peekFirst();
  }
  iterator(): Iterator<E> {
    return this.items.iterator();
  }
  size(): number {
    return this.items.size();
  }
}

const q = new BoundedQueue<string>(2);
console.log(q.offer('a'), q.offer('b'), q.offer('c')); // → true true false
try {
  q.add('c');
} catch (e) {
  console.log((e as Error).name, (e as Error).message); // → IllegalStateException Queue full
}
console.log(q.element(), q.remove(), q.poll(), q.poll()); // → a a b null
```

## Example: a bidirectional map (AbstractMap)

`BiMap` keeps values unique and offers a live `inverse()` view. It overrides `put` (modifiable), `findEntry` (O(1) `get`,
`containsKey`, `getOrDefault`, `replace`), and `size`/`clear` for speed. The entry-set iterator's `remove()` keeps both
directions in sync, which makes `keySet().remove`, `values().removeIf` and the inherited `remove(key)` correct.

```ts
import { AbstractMap, AbstractSet, IllegalArgumentException, LinkedHashMap, Map, Objects, SimpleImmutableEntry } from '@ylcnfrht/collections';
import type { Iterator, MapEntry, Set } from '@ylcnfrht/collections';

class BiMap<K, V> extends AbstractMap<K, V> {
  constructor(
    private readonly fwd = new LinkedHashMap<K, V>(),
    private readonly bwd = new LinkedHashMap<V, K>(),
  ) {
    super();
  }
  inverse(): BiMap<V, K> {
    return new BiMap<V, K>(this.bwd, this.fwd);
  }
  override size(): number {
    return this.fwd.size();
  }
  protected override findEntry(key: unknown): MapEntry<K, V> | undefined {
    return this.fwd.containsKey(key) ? new SimpleImmutableEntry(key as K, this.fwd.get(key) as V) : undefined;
  }
  override put(key: K, value: V): V | null {
    if (this.bwd.containsKey(value) && !Objects.equals(this.bwd.get(value), key)) {
      throw new IllegalArgumentException(`value already bound: ${String(value)}`);
    }
    const old = this.fwd.put(key, value);
    if (old !== null) this.bwd.remove(old);
    this.bwd.put(value, key);
    return old;
  }
  override clear(): void {
    this.fwd.clear();
    this.bwd.clear();
  }
  entrySet(): Set<MapEntry<K, V>> {
    const { fwd, bwd } = this;
    return new (class extends AbstractSet<MapEntry<K, V>> {
      size(): number {
        return fwd.size();
      }
      iterator(): Iterator<MapEntry<K, V>> {
        const it = fwd.entrySet().iterator();
        let last: MapEntry<K, V> | null = null;
        return {
          hasNext: () => it.hasNext(),
          next: () => (last = it.next(), new SimpleImmutableEntry(last)), // a snapshot: setValue would bypass bwd
          remove: () => {
            it.remove(); // throws IllegalStateException if next() was not called
            bwd.remove(last!.getValue());
          },
          forEachRemaining(action) {
            while (it.hasNext()) action(this.next());
          },
        };
      }
    })();
  }
}

const codes = new BiMap<string, number>();
codes.put('ok', 200);
codes.put('teapot', 418);
codes.inverse().put(404, 'not found');
console.log(codes, codes.inverse().get(418)); // → {ok=200, teapot=418, not found=404} teapot
try {
  codes.put('fine', 200);
} catch (e) {
  console.log((e as Error).name); // → IllegalArgumentException
}
codes.keySet().remove('ok');
console.log(codes.inverse().containsKey(200), codes.equals(Map.of('teapot', 418, 'not found', 404))); // → false true
```

`replaceAll` and `entry.setValue` throw `UnsupportedOperationException` here because the entries are immutable
snapshots. To support them, return entries whose `setValue` also updates `bwd`.

## Checklist

- Implement the abstract methods from the [table](#what-each-skeleton-requires); override mutators only for a
  modifiable collection.
- Lists: override `addAtIndex`/`removeAt`, not `add`/`remove`. Bump `modCount` on every structural change, never in
  `set`.
- Validate indices so callers get `IndexOutOfBoundsException`.
- Add `[RANDOM_ACCESS]` only when `get(i)` is O(1).
- Iterators implement `hasNext`, `next`, `remove` and `forEachRemaining`. `next()` past the end throws
  `NoSuchElementException`; `remove()` without a preceding `next()` throws `IllegalStateException`. Delegating to a
  library iterator handles both.
- Queues on `AbstractQueue` reject `null`.
- Element types need `equals`/`hashCode` (and `compareTo` for sorted use): see
  [Equality](/collections/concepts/equality/#writing-equals-and-hashcode).
