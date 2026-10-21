# Queues and deques

A `Queue<E>` holds elements waiting to be processed and hands them out from its head. A `Deque<E>` (double-ended queue, pronounced "deck") adds and removes at both ends, so it serves as a FIFO queue and as a LIFO stack. This page covers both interfaces, the implementations `ArrayDeque`, `PriorityQueue` and `LinkedList`, and the `Collections.asLifoQueue` adapter.

> [!NOTE]
> Concurrent and blocking queues (`ConcurrentLinkedQueue`, `BlockingQueue`, `DelayQueue`, …) are not included. [Not included](../advanced/compatibility.md#not-included) explains why and what to use instead.

## The Queue interface

`Queue<E>` extends `Collection<E>` with three operations: insert at the tail, remove from the head, and examine the head. Each comes in two forms. One throws when it cannot do its job; the other reports failure through its return value.

| Operation | Throws on failure | Returns a special value |
| --- | --- | --- |
| insert at tail | `add(e)` | `offer(e)`: `false` if rejected |
| remove head | `remove()`: `NoSuchElementException` if empty | `poll()`: `null` if empty |
| examine head | `element()`: `NoSuchElementException` if empty | `peek()`: `null` if empty |

Use `poll` and `peek` where an empty queue is a normal condition, such as a processing loop. Use `remove` and `element` where an empty queue indicates a bug.

```ts
import { ArrayDeque, Queue } from '@nodestd/collections';

const q: Queue<string> = new ArrayDeque<string>();
q.offer('first');
q.add('second');
console.log(q.peek());             // → first
console.log(q.poll());             // → first
console.log(q.remove());           // → second

console.log(q.poll());             // → null
console.log(q.peek());             // → null
try {
  q.remove();
} catch (e) {
  console.log((e as Error).name);  // → NoSuchElementException
}
try {
  q.element();
} catch (e) {
  console.log((e as Error).name);  // → NoSuchElementException
}
```

`remove(o)` with an argument is the ordinary `Collection.remove`: it removes one element equal to `o` (by `equals()`) and returns a `boolean`.

> [!IMPORTANT]
> Because `poll()` and `peek()` use `null` to mean "empty", `ArrayDeque` and `PriorityQueue` reject `null` and `undefined` elements with `NullPointerException`. `LinkedList` accepts them, which makes `poll()` ambiguous; check `isEmpty()` instead.

## The Deque interface

`Deque<E>` extends `Queue<E>` and `SequencedCollection<E>`. Each end has the same pairs of throwing and value-returning methods:

| Operation | Head, throws | Head, special value | Tail, throws | Tail, special value |
| --- | --- | --- | --- | --- |
| insert | `addFirst(e)` | `offerFirst(e)` | `addLast(e)` | `offerLast(e)` |
| remove | `removeFirst()` | `pollFirst()` | `removeLast()` | `pollLast()` |
| examine | `getFirst()` | `peekFirst()` | `getLast()` | `peekLast()` |

The `Queue` methods map onto the tail for insertion and the head for removal, so a deque used through `Queue` is FIFO:

| `Queue` method | `Deque` equivalent |
| --- | --- |
| `add(e)` / `offer(e)` | `addLast(e)` / `offerLast(e)` |
| `remove()` / `poll()` | `removeFirst()` / `pollFirst()` |
| `element()` / `peek()` | `getFirst()` / `peekFirst()` |

`removeFirstOccurrence(o)` and `removeLastOccurrence(o)` remove one element equal to `o`, scanning from the head or from the tail.

```ts
import { ArrayDeque } from '@nodestd/collections';

const d = new ArrayDeque<number>();
d.offerLast(2);
d.offerLast(3);
d.offerFirst(1);
console.log(d.toString());         // → [1, 2, 3]
console.log(d.peekFirst(), d.peekLast()); // → 1 3
console.log(d.pollLast());         // → 3
console.log(d.pollFirst());        // → 1
console.log(d.toString());         // → [2]
```

### Using a deque as a stack

| Stack method | `Deque` equivalent |
| --- | --- |
| `push(e)` | `addFirst(e)` |
| `pop()` | `removeFirst()` |
| `peek()` | `peekFirst()` |

The head of the deque is the top of the stack, so iteration and `toString()` go top first.

```ts
import { ArrayDeque } from '@nodestd/collections';

const stack = new ArrayDeque<string>();
stack.push('a');
stack.push('b');
stack.push('c');
console.log(stack.toString());     // → [c, b, a]
console.log(stack.pop());          // → c
console.log(stack.peek());         // → b
console.log(stack.size());         // → 2
```

This is the recommended stack for new code, rather than the legacy [`Stack`](./lists.md#stack) class.

## Implementations

| Need | Use | Why |
| --- | --- | --- |
| FIFO queue, stack, or both ends | `ArrayDeque` | O(1) at both ends, one array, unambiguous `poll()` |
| Always take the smallest or highest-priority item | `PriorityQueue` | O(log n) insert and remove-min |
| A queue that is also a `List`, or holds `null` | `LinkedList` | implements `List` and `Deque` |
| Pass a stack to code that expects a `Queue` | `Collections.asLifoQueue(deque)` | LIFO view of a deque |
| Sorted iteration, not only sorted removal | `TreeSet` / `TreeMap` ([sets](./sets.md), [maps](./maps.md)) | a heap iterates in heap order |

The [data structures primer](../guide/data-structures.md) shows how `ArrayDeque` and `PriorityQueue` lay out their data.

### ArrayDeque

<ClassInfo name="ArrayDeque" />

`ArrayDeque<E>` is a resizable circular array (ring buffer). It is the general-purpose `Queue`, `Deque` and stack: every end operation is O(1), and there is no per-element node allocation.

The backing array's length is always a power of two, at least 8 and 16 by default. Two indexes, `head` and `tail`, wrap around the end of the array, so no element is ever shifted. When the array fills, it doubles, and the shorter of the two wrapped segments is moved into the new half; the copy is amortized O(1) per insert. The deque never shrinks: `clear()` empties it but keeps the capacity.

`ArrayDeque` does not offer indexed access; use `ArrayList` for that.

::: code-group

```ts [Basic]
import { ArrayDeque } from '@nodestd/collections';

const queue = new ArrayDeque<string>();
queue.offer('a');
queue.add('b');
queue.offer('c');
console.log(queue.peek());         // → a
console.log(queue.poll());         // → a
console.log(queue.size());         // → 2
console.log([...queue]);           // → [ 'b', 'c' ]
```

```ts [Intermediate]
import { ArrayDeque } from '@nodestd/collections';

// undo history: push each edit, pop to revert the latest one
class Editor {
  text = '';
  private readonly history = new ArrayDeque<string>();

  type(s: string): void {
    this.history.push(this.text);
    this.text += s;
  }

  undo(): void {
    const previous = this.history.poll();
    if (previous !== null) this.text = previous;
  }
}

const ed = new Editor();
ed.type('Hello');
ed.type(', world');
ed.type('!');
ed.undo();
console.log(ed.text);              // → Hello, world
ed.undo();
console.log(ed.text);              // → Hello
```

:::

### PriorityQueue

<ClassInfo name="PriorityQueue" />

`PriorityQueue<E>` is an unbounded queue whose head is always the least element, by natural ordering or by a `Comparator` you supply. It is a binary min-heap stored in an array: the children of index `i` are at `2i + 1` and `2i + 2`. `offer` appends and sifts the element up; `poll` moves the last element to the root and sifts it down. Both are O(log n), and `peek` is O(1).

Ordering rules are described in [priority ordering](#priority-ordering).

::: code-group

```ts [Basic]
import { PriorityQueue } from '@nodestd/collections';

const pq = new PriorityQueue<number>();
pq.offer(5);
pq.offer(1);
pq.add(3);
console.log(pq.peek());            // → 1
console.log(pq.size());            // → 3
console.log(pq.poll());            // → 1
console.log(pq.poll());            // → 3
console.log(pq.poll());            // → 5
```

```ts [Intermediate]
import { PriorityQueue, Comparator } from '@nodestd/collections';

// k smallest: a max-heap of size k evicts the largest candidate
function smallestK(values: number[], k: number): number[] {
  const heap = new PriorityQueue<number>(Comparator.reverseOrder<number>());
  for (const v of values) {
    heap.offer(v);
    if (heap.size() > k) heap.poll();
  }
  const out: number[] = [];
  let x: number | null;
  while ((x = heap.poll()) !== null) out.unshift(x);
  return out;
}

console.log(smallestK([7, 2, 9, 4, 1, 8, 3], 3)); // → [ 1, 2, 3 ]
```

:::

### LinkedList as a queue

[`LinkedList`](./lists.md#linkedlist) implements `Deque`, so every method on this page works on it, with O(1) end operations. Choose it over `ArrayDeque` when:

- you also need the `List` API (indexed access, `ListIterator`, `subList`) on the same object;
- you must store `null` elements. Then check `isEmpty()` before `poll()`, since `null` is ambiguous.

Otherwise `ArrayDeque` is lighter: it allocates no node object per element.

::: code-group

```ts [Basic]
import { LinkedList, Queue } from '@nodestd/collections';

const q: Queue<string> = new LinkedList<string>();
q.offer('a');
q.offer('b');
console.log(q.poll());             // → a
console.log(q.peek());             // → b

const withNull = new LinkedList<string | null>();
withNull.add(null);
console.log(withNull.poll());      // → null
console.log(withNull.isEmpty());   // → true
```

```ts [Intermediate]
import { LinkedList } from '@nodestd/collections';

// FIFO job queue where a pending job can be cancelled by value
const jobs = new LinkedList<string>();
jobs.offer('resize-1');
jobs.offer('resize-2');
jobs.offer('upload-1');
jobs.offer('resize-3');

console.log(jobs.remove('resize-2')); // → true
console.log(jobs.indexOf('upload-1')); // → 1
console.log(jobs.toString());      // → [resize-1, upload-1, resize-3]

const done: string[] = [];
while (!jobs.isEmpty()) done.push(jobs.poll()!);
console.log(done);                 // → [ 'resize-1', 'upload-1', 'resize-3' ]
```

:::

### Collections.asLifoQueue

`Collections.asLifoQueue(deque)` returns a `Queue` view of a deque whose `add` and `offer` push onto the front. Code that takes a `Queue` and calls `add`/`poll` then processes items last-in-first-out. This turns a breadth-first algorithm into a depth-first one without changing it.

```ts
import { ArrayDeque, Collections } from '@nodestd/collections';

const backing = new ArrayDeque<number>();
const lifo = Collections.asLifoQueue(backing);
lifo.add(1);
lifo.add(2);
lifo.add(3);
console.log(lifo.toString());      // → [3, 2, 1]
console.log(lifo.poll());          // → 3
console.log(backing.toString());   // → [2, 1]
```

The view is live, and its `equals` and `hashCode` use identity. Other adapters are described on [the Collections utilities page](../utilities/collections.md).

## Creating a queue

| Form | Result |
| --- | --- |
| `new ArrayDeque<E>()` | empty deque with 16 slots |
| `new ArrayDeque<E>(n)` | empty deque sized for `n` elements (rounded up to a power of two, at most 2^25 slots; beyond that it grows on demand) |
| `new ArrayDeque<E>(collection)`, `ArrayDeque.of(a, b, c)` | deque of the elements, head first |
| `new PriorityQueue<E>()` | empty queue, natural ordering |
| `new PriorityQueue<E>(comparator)` | empty queue ordered by `comparator` (`null` for natural ordering) |
| `new PriorityQueue<E>(initialCapacity, comparator?)` | the same, with a capacity hint |
| `new PriorityQueue<E>(collection)`, `PriorityQueue.of(a, b, c)` | heap of the elements, built in O(n) |
| `q.clone()` | independent shallow copy (`ArrayDeque`) |

```ts
import { ArrayDeque, ArrayList } from '@nodestd/collections';

const a = new ArrayDeque<number>();            // 16 slots
const b = new ArrayDeque<number>(1000);        // room for 1000 without growing
const c = ArrayDeque.of(1, 2, 3);
// with new:
// const c = new ArrayDeque<number>();
// c.add(1);
// c.add(2);
// c.add(3);
const d = new ArrayDeque(ArrayList.of('x', 'y')); // copy of any collection
const e = c.clone();                           // independent shallow copy
e.addLast(4);
console.log(a.size(), b.size());               // → 0 0
console.log(c.toString(), d.toString(), e.toString()); // → [1, 2, 3] [x, y] [1, 2, 3, 4]
```

`new PriorityQueue(collection)` builds the heap bottom-up in O(n), which is cheaper than n separate `offer` calls (O(n log n)). If the source is a `PriorityQueue` or a sorted collection such as a `TreeSet`, its comparator is inherited.

```ts
import { PriorityQueue, ArrayList, TreeSet, Comparator } from '@nodestd/collections';

const pq = new PriorityQueue(ArrayList.of(5, 1, 4));
console.log(pq.peek());                        // → 1

const desc = new TreeSet<number>(Comparator.reverseOrder<number>());
desc.addAll(ArrayList.of(1, 2, 3));
const fromTree = new PriorityQueue(desc);      // keeps the reverse ordering
console.log(fromTree.poll());                  // → 3
```

## Priority ordering

Without a comparator, a `PriorityQueue` uses natural ordering: numbers numerically, strings by UTF-16 code unit, and objects through their `compareTo()` method (see [ordering](../guide/core-concepts.md#ordering-natural-order-and-comparators)). Adding an object with no natural ordering throws `ClassCastException`. Pass a comparator for max-heaps, objects and multi-key priorities. `comparator()` returns the comparator in use, or `null` for natural ordering.

```ts
import { PriorityQueue, Comparator } from '@nodestd/collections';

// max-heap
const max = new PriorityQueue<number>(Comparator.reverseOrder<number>());
[3, 9, 1].forEach((n) => max.offer(n));
console.log(max.poll());           // → 9

// objects by a key
interface Job { name: string; priority: number }
const jobs = new PriorityQueue<Job>(Comparator.comparing((j: Job) => j.priority));
jobs.add({ name: 'deploy', priority: 2 });
jobs.add({ name: 'hotfix', priority: 1 });
console.log(jobs.poll()?.name);    // → hotfix

// no comparator and no natural ordering
const bad = new PriorityQueue<object>();
try {
  bad.add({});
} catch (e) {
  console.log((e as Error).name);  // → ClassCastException
}
```

> [!NOTE]
> A `PriorityQueue` is not stable: ties are broken arbitrarily. If insertion order among equal elements matters, add a sequence number to the comparator, as in the [task scheduler recipe](#task-scheduler-with-priorityqueue).

## Views

`descendingIterator()` walks a deque from tail to head. `reversed()` returns a [live](../guide/core-concepts.md#live-views), reverse-ordered `Deque` view: its first element is the original's last, and writes go through to the original. Both are O(1) to create.

```ts
import { ArrayDeque } from '@nodestd/collections';

const d = ArrayDeque.of(1, 2, 3);

const it = d.descendingIterator();
const back: number[] = [];
while (it.hasNext()) back.push(it.next());
console.log(back);                 // → [ 3, 2, 1 ]

const rev = d.reversed();
console.log(rev.toString());       // → [3, 2, 1]
rev.addFirst(4);                   // = d.addLast(4)
rev.push(5);                       // = d.addLast(5)
console.log(d.toString());         // → [1, 2, 3, 4, 5]
console.log(rev.peek());           // → 5
```

## Iteration

A deque iterates from head to tail. Iterators over `ArrayDeque`, `PriorityQueue` and `LinkedList` are [fail-fast](../guide/core-concepts.md#fail-fast-iteration): changing the queue during iteration, other than through the iterator's own `remove()`, throws `ConcurrentModificationException`.

> [!WARNING]
> A `PriorityQueue` does not iterate in priority order. Iteration, `toString()`, `toArray()` and streams walk the heap array, which only guarantees that the first element is the minimum. To get elements in priority order, `poll()` them out.

```ts
import { PriorityQueue } from '@nodestd/collections';

const pq = PriorityQueue.of(5, 1, 4, 2, 3);
// with new:
// const pq = new PriorityQueue<number>();
// for (const n of [5, 1, 4, 2, 3]) pq.add(n);
console.log(pq.toString());        // → [1, 2, 4, 5, 3]
console.log([...pq]);              // → [ 1, 2, 4, 5, 3 ]
console.log(pq.peek());            // → 1

const drained: number[] = [];
let x: number | null;
while ((x = pq.poll()) !== null) drained.push(x);
console.log(drained);              // → [ 1, 2, 3, 4, 5 ]
```

To get a sorted copy without draining, copy and sort (`const l = new ArrayList(pq); l.sort(null)`), or keep the data in a [`TreeSet`](./sets.md#treeset) or [`TreeMap`](./maps.md#treemap).

## Recipes

### Breadth-first search with ArrayDeque

The deque holds the frontier. `poll()` returning `null` ends the loop.

```ts
import { ArrayDeque, HashMap, HashSet, ArrayList, List } from '@nodestd/collections';

const graph = new HashMap<string, List<string>>();
graph.put('a', ArrayList.of('b', 'c'));
graph.put('b', ArrayList.of('d'));
graph.put('c', ArrayList.of('d', 'e'));
graph.put('d', ArrayList.of('f'));

function bfs(start: string): string[] {
  const order: string[] = [];
  const seen = new HashSet<string>();
  const frontier = new ArrayDeque<string>();
  frontier.offer(start);
  seen.add(start);
  let node: string | null;
  while ((node = frontier.poll()) !== null) {
    order.push(node);
    for (const next of graph.getOrDefault(node, ArrayList.of<string>())) {
      if (seen.add(next)) frontier.offer(next);   // add() is false if already seen
    }
  }
  return order;
}

console.log(bfs('a'));             // → [ 'a', 'b', 'c', 'd', 'e', 'f' ]
```

Replace `offer`/`poll` with `push`/`pop`, or wrap the deque in `Collections.asLifoQueue`, and the same loop performs a depth-first search.

### Sliding-window maximum with a deque

Keep a deque of indexes whose values are decreasing. The front is the maximum of the current window. Drop it when it leaves the window, and drop smaller values from the back when a larger one arrives. Each index enters and leaves once, so the pass is O(n).

```ts
import { ArrayDeque } from '@nodestd/collections';

function windowMax(values: number[], k: number): number[] {
  const idx = new ArrayDeque<number>();
  const out: number[] = [];
  values.forEach((v, i) => {
    if (!idx.isEmpty() && idx.peekFirst()! <= i - k) idx.pollFirst();        // left the window
    while (!idx.isEmpty() && values[idx.peekLast()!] <= v) idx.pollLast();   // dominated
    idx.offerLast(i);
    if (i >= k - 1) out.push(values[idx.peekFirst()!]);
  });
  return out;
}

console.log(windowMax([1, 3, -1, -3, 5, 3, 6, 7], 3)); // → [ 3, 3, 5, 5, 6, 7 ]
```

### Task scheduler with PriorityQueue

Order tasks by due time, then priority, then insertion sequence. The sequence number makes the order deterministic, because the heap is not stable.

```ts
import { PriorityQueue, Comparator } from '@nodestd/collections';

interface Task { name: string; due: number; priority: number; seq: number }

const schedule = new PriorityQueue<Task>(
  Comparator.thenComparing(
    Comparator.comparing((t: Task) => t.due),
    Comparator.comparing((t: Task) => t.priority),
    Comparator.comparing((t: Task) => t.seq),
  ),
);

let seq = 0;
const submit = (name: string, due: number, priority: number) =>
  schedule.offer({ name, due, priority, seq: seq++ });

submit('backup', 30, 2);
submit('email', 10, 1);
submit('report', 10, 0);
submit('cleanup', 10, 1);

const ran: string[] = [];
let t: Task | null;
while ((t = schedule.poll()) !== null) ran.push(`${t.due}:${t.name}`);
console.log(ran); // → [ '10:report', '10:email', '10:cleanup', '30:backup' ]
```

### Top-k largest with a bounded min-heap

Keep a min-heap of at most `k` elements, and evict the smallest whenever it grows past `k`. The remaining elements are the `k` largest, found in O(n log k) time and O(k) memory.

```ts
import { PriorityQueue, ArrayList } from '@nodestd/collections';

function topK(values: Iterable<number>, k: number): number[] {
  const heap = new PriorityQueue<number>();
  for (const v of values) {
    heap.offer(v);
    if (heap.size() > k) heap.poll();     // drop the smallest
  }
  const result = new ArrayList(heap);
  result.sort(null);
  return result.reversed().toArray();     // largest first
}

console.log(topK([5, 1, 9, 3, 7, 8, 2], 3)); // → [ 9, 8, 7 ]
```

For the k smallest, use a max-heap (`Comparator.reverseOrder()`) the same way.

### k-way merge of sorted lists

Put the head of each sorted input in a priority queue, together with the iterator it came from. Repeatedly take the smallest, then offer the next element from the same input. Merging `k` lists with `n` elements in total costs O(n log k).

```ts
import { PriorityQueue, Comparator, ArrayList, Iterator, List } from '@nodestd/collections';

function merge(lists: List<number>[]): List<number> {
  type Head = { value: number; rest: Iterator<number> };
  const heads = new PriorityQueue<Head>(Comparator.comparing((h: Head) => h.value));
  for (const l of lists) {
    const it = l.iterator();
    if (it.hasNext()) heads.offer({ value: it.next(), rest: it });
  }
  const out = new ArrayList<number>();
  let h: Head | null;
  while ((h = heads.poll()) !== null) {
    out.add(h.value);
    if (h.rest.hasNext()) heads.offer({ value: h.rest.next(), rest: h.rest });
  }
  return out;
}

const merged = merge([ArrayList.of(1, 4, 7), ArrayList.of(2, 5, 8), ArrayList.of(0, 3, 6, 9)]);
console.log(merged.toString()); // → [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
```

## Complexity

For `LinkedList`, see [list complexity](./lists.md#linkedlist-complexity). Measurements are on the [performance](../advanced/performance.md) page.

### ArrayDeque complexity

| Operation | Cost | Notes |
| --- | --- | --- |
| `addFirst`, `addLast`, `offer*`, `push`, `add` | O(1) amortized | growth doubles the array |
| `pollFirst`, `pollLast`, `removeFirst`, `removeLast`, `poll`, `pop` | O(1) | |
| `peek*`, `getFirst`, `getLast`, `element` | O(1) | |
| `size`, `isEmpty` | O(1) | computed from head and tail |
| `contains`, `remove(o)`, `removeFirstOccurrence`, `removeLastOccurrence` | O(n) | |
| `removeIf`, `removeAll`, `retainAll` | O(n) | single pass |
| `reversed()`, `descendingIterator()` | O(1) | views |

### PriorityQueue complexity

| Operation | Cost | Notes |
| --- | --- | --- |
| `offer`, `add` | O(log n) | sift up |
| `poll`, `remove()` | O(log n) | sift down |
| `peek`, `element` | O(1) | |
| `size`, `isEmpty` | O(1) | |
| `remove(o)`, `contains(o)` | O(n) | linear search, then O(log n) repair for `remove` |
| `new PriorityQueue(collection)`, `PriorityQueue.of(...)` | O(n) | heapify |
| `removeIf`, `removeAll`, `retainAll` | O(n) | filter, then re-heapify |
| iterate all | O(n) | heap order, not sorted |
| drain all with `poll` | O(n log n) | sorted order |

## Pitfalls

- **`PriorityQueue` iteration is not sorted.** Only `poll()` returns elements in priority order. See [iteration](#iteration).
- **`ArrayDeque` and `PriorityQueue` reject `null`.** Adding `null` or `undefined` throws `NullPointerException`.
- **`push` and `add` work on opposite ends.** On a deque, `push` adds at the head and `add` at the tail. Mixing stack and queue methods on one deque reorders its elements.
- **`PriorityQueue` is not stable.** Equal elements come out in arbitrary order unless the comparator breaks ties.
