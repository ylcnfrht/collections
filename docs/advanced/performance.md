# Performance

The collections have the asymptotic costs documented for the Java Collections Framework and are tuned for V8. This page lists the cost of each operation, how to choose a structure for a workload, the design choices behind the numbers, and measured benchmark results against native `Array`/`Map`/`Set`, `js-sdsl`, `mnemonist` and `@datastructures-js/priority-queue`, including the cases where this library is slower.

## Complexity tables

n is the size of the collection. "Amortized" means occasional resizes are averaged over many calls. Hash costs are *expected* costs, assuming `hashCode()` spreads keys well.

### Lists

| Operation | `ArrayList` / `Vector` / `Stack` | `LinkedList` | `List.of` / `nCopies` |
| --- | --- | --- | --- |
| `get(i)` / `set(i, e)` | O(1) | O(min(i, n−i)), walking from the nearer end | O(1) (immutable) |
| `add(e)` (append) | O(1) amortized | O(1) | — |
| `add(i, e)` / `removeAt(i)` | O(n − i) (shifts the tail) | O(min(i, n−i)) to find the position, then O(1) | — |
| `addFirst` / `removeFirst` | O(n) | O(1) | — |
| `addLast` / `removeLast` | O(1) amortized | O(1) | — |
| `contains` / `indexOf` / `remove(o)` | O(n) | O(n) | O(n) |
| `iterator().remove()` / `listIterator().add()` | O(n) | O(1) | — |
| `subList(a, b)` | O(1) (a live view) | O(1) (a live view) | O(1) |
| `sort` | O(n log n), stable | O(n log n) (array copy + write-back) | — |
| iteration | O(n) | O(n) | O(n) |
| random access (`isRandomAccess`) | yes | no | yes |

### Queues and deques

| Operation | `ArrayDeque` | `LinkedList` (as a deque) | `PriorityQueue` |
| --- | --- | --- | --- |
| `offer` / `add` / `addLast` | O(1) amortized | O(1) | O(log n) |
| `addFirst` / `push` | O(1) amortized | O(1) | — |
| `poll` / `pollFirst` / `pop` | O(1) | O(1) | O(log n) |
| `pollLast` | O(1) | O(1) | — |
| `peek` / `peekFirst` / `peekLast` | O(1) | O(1) | O(1) |
| `contains` / `remove(o)` | O(n) | O(n) | O(n) |
| `new X(collection)` | O(n) | O(n) | O(n) heapify |
| iteration order | first to last | first to last | heap order (not sorted) |
| `null` elements | rejected | allowed | rejected |

### Sets and maps

| Operation | `HashMap` / `HashSet` | `LinkedHashMap` / `LinkedHashSet` | `TreeMap` / `TreeSet` | `IdentityHashMap` |
| --- | --- | --- | --- | --- |
| `get` / `containsKey` / `contains` | O(1) expected | O(1) expected | O(log n) | O(1) |
| `put` / `add` | O(1) expected | O(1) expected | O(log n); O(1) to find the slot when appending above the maximum | O(1) |
| `remove` | O(1) expected | O(1) expected | O(log n) | O(1) |
| `containsValue` | O(n) | O(n) | O(n) | O(n) |
| `floor`/`ceiling`/`higher`/`lower` | — | — | O(log n) | — |
| `firstKey` / `lastKey` | — | O(1) (`firstEntry`/`lastEntry`, sequenced) | O(log n) / O(1) (the maximum is cached) | — |
| `pollFirstEntry` / `pollLastEntry` | — | O(1) | O(log n) | — |
| `headMap` / `tailMap` / `subMap` views | — | — | O(1) to create; O(log n) per operation | — |
| iteration (whole map) | O(n) | O(n), in insertion or access order | O(n), sorted (O(1) amortized per step) | O(n) |
| worst case per lookup | O(k) for k keys sharing one `hashCode()` | same | O(log n) guaranteed | O(1) |

With `accessOrder = true` or `LinkedHashMap.lru(n)`, every `get` hit also moves the entry to the end, still in O(1).

### Streams

Streams are lazy. Nothing runs until a terminal operation, and every element then passes through the whole chain of stages before the next one starts. The per-element cost of a pipeline is the sum of its stages' costs.

| Operation | Cost | Notes |
| --- | --- | --- |
| `filter`, `map`, `mapToInt`/`mapToObj`, `peek` | O(1) per element | consecutive `filter`s fuse into one stage, as do consecutive `map`s |
| `flatMap` / `mapMulti` | O(1) per produced element | `mapMulti` avoids creating a stream per element |
| `limit(k)`, `takeWhile`, `findFirst`, `anyMatch`, ... | short-circuit | stop pulling from the source once satisfied; work on infinite streams |
| `skip(k)`, `dropWhile` | O(1) per element | |
| `distinct()` | O(n) expected, O(n) memory | hash-based, by `equals`/`hashCode` |
| `sorted()` | O(n log n), O(n) memory | a barrier: buffers everything, then replays. Number streams sort a `Float64Array`. |
| `count()` | O(1) if the size is known | a `SIZED` pipeline (no `filter`/`flatMap`/...) answers from the source size without running the stages, so `peek` is not called |
| `toList`, `toArray`, `collect`, `reduce`, `sum`, `forEach` | O(n) | |
| `Collectors.groupingBy` / `toMap` | O(n) expected | backed by `HashMap` unless you pass a map factory |
| `Collectors.toMap` into a `TreeMap` | O(n log n) | |
| `parallel()` | same as sequential | JS runs it sequentially; results are the same |

## Choosing for speed

| You need | Use | Avoid |
| --- | --- | --- |
| an indexed list, mostly appends and reads | `ArrayList` | `LinkedList`: O(n) `get(i)` and poor cache locality |
| a FIFO queue or a stack | `ArrayDeque` | `ArrayList.removeAt(0)` / `Array.shift()`: O(n) per call; `LinkedList`: one allocation per element |
| many inserts/removes in the middle through an iterator | `LinkedList` | `ArrayList` with `iterator().remove()` in a loop (O(n²)); use `ArrayList.removeIf` instead (one O(n) pass) |
| the smallest (or largest) element repeatedly | `PriorityQueue` | sorting after every insert |
| membership / lookup by value | `HashSet` / `HashMap` | `list.contains` in a loop |
| the same, in a predictable order | `LinkedHashSet` / `LinkedHashMap` | sorting a `HashMap`'s keys every time |
| sorted order, range queries, nearest key | `TreeMap` / `TreeSet` | a sorted array with `splice` once it gets large (O(n) inserts) |
| an LRU cache | `LinkedHashMap.lru(maxSize)` | hand-rolled `Map` delete + set |
| keys compared by reference, even if they define `equals` | `IdentityHashMap` | |
| a read-only snapshot | `List.of` / `Set.of` / `Map.of` / `copyOf` | defensive copies into modifiable collections |
| number crunching in a pipeline | `IntStream` / `DoubleStream` (`mapToInt`, `IntStream.range`) | `Stream<number>` with `reduce` for sums and stats |

A sorted array with binary search beats `TreeMap` for read-mostly data: about 2.5× on `get` and 3.5× on `floor`/`ceiling` in the benchmarks below, and over 10× on iteration. If you build the data once and then only query it, consider an `ArrayList` plus `Collections.binarySearch`. Use `TreeMap` when inserts and removals are interleaved with queries.

## Design choices behind the numbers

### `ArrayList`: a packed native array

The backing array never has holes. Every index in `[0, size)` holds a value, so V8 keeps it in a packed elements kind, and `get`, `set` and `push` compile to plain array accesses. For that reason the `initialCapacity` argument is only validated, never used to preallocate: preallocating would create holes. `forEach` and `removeIf` check `modCount` once at the end instead of after every callback.

### `HashMap`: hybrid storage

One map keeps three kinds of storage. Each key goes to the fastest one that is still correct for it:

| Key | Storage |
| --- | --- |
| integer in `0..2^30-1`, while the table would stay at least 25% full | dense array indexed by the key |
| equality is SameValueZero: primitives, and objects without `equals()` that are not `Date`s | native `Map` |
| anything else (objects with `equals()`/`hashCode()`, `Date`s) | bucket table keyed by `hashCode()`, each bucket a node or an array of colliding nodes |

Small integer keys (ids, indices, counters) never get hashed, so lookups are faster than the native `Map`. Integers from 2^30 up skip the table altogether: they could never fit it, and since they are not V8 small integers, even probing it would take a slow path. Strings and plain objects use the native `Map`, whose equality is exactly `Objects.equals` for those types. Only keys with an `equals()`/`hashCode()` method, and `Date`s, pay for a user-defined hash. `HashSet` uses the same layout. `LinkedHashMap` adds a doubly linked list through the nodes, so ordered iteration, `pollFirstEntry` and LRU moves are O(1).

### `ArrayDeque`: a power-of-two ring buffer

`head` is the index of the first element and `tail` is the next free slot. Because the capacity is a power of two, wrapping is a bitmask (`(i + 1) & (cap - 1)`), not a modulo. Vacated slots are filled with a small integer rather than `undefined`, so a deque of numbers stays in V8's fast numeric elements kinds, and removed objects can still be garbage-collected. Removing from the middle shifts whichever side is shorter. `new ArrayDeque(n)` really preallocates, unlike the `ArrayList`/`HashMap` capacity hints, up to 2^25 slots: from 2^26 on V8 turns a preallocated array into a slow dictionary, so larger buffers grow by `push`.

### `PriorityQueue`: hole-based sifting with a number fast path

A binary min-heap in a plain array. Sifting moves a *hole* and writes the moving element once at the end, which halves the writes compared with swapping. When the queue uses natural ordering and has only seen non-`NaN` numbers, it compares with a plain `<`. Constructing from a collection heapifies in O(n). `offer` finds the slot with comparisons first and only then shifts, so a comparator that throws leaves the heap intact.

### `TreeMap`: a red-black tree with parent pointers

Nodes link to their parent, so iterators step to the in-order successor without a stack, at O(1) amortized per step. The greatest node is cached, which makes `lastKey()` O(1) and lets ascending inserts attach a new maximum without descending the tree. Number and string keys are compared inline, without the generic natural-ordering dispatch. Node fields are laid out so a descent touches as few cache lines as possible.

### Streams: a push-based engine with stage fusion

A pipeline is a linked list of stages. When the terminal operation runs, every stage wraps the next stage's *sink*, and the source spliterator pushes elements down the chain of sinks to the terminal sink (`reduce`, `toList`, ...).

- **Bulk push.** If no stage can stop early, the source runs one tight loop (`acceptArray` for array-backed sources), with no per-element `hasNext()`/`next()` protocol.
- **Pushed cancellation.** A short-circuiting sink calls `stop()`, which flags itself and every sink upstream of it, up to a buffering barrier such as `sorted()`. The driver then reads one `cancelled` field before each element instead of asking every stage.
- **Fusion.** `filter(a).filter(b)` becomes one stage running `a(t) && b(t)`, and `map(f).map(g)` becomes one stage running `g(f(t))`. A chain of sinks of the same class is a recursive call the JIT does not inline, so removing a hop is measurable.
- **Monomorphic shapes.** Every sink class initialises all its fields in its constructor, so instances share one hidden class.
- **Number streams** have their own sinks: a `Float64Array` sort, a number-specialised `distinct`, and a Kahan-compensated `sum` for `DoubleStream`.

## Tips

### Prefer `forEach` over `for..of`

A JS iterator has to return a `{ value, done }` result for every element and check for concurrent modification. The collection's own `forEach` is a plain loop with one check at the end. In the benchmarks, `ArrayList.forEach` beats native `Array.forEach`, while `for..of` over an `ArrayList` runs at about a third of native speed. The same holds for maps: `map.forEach((k, v) => ...)` was 1.5× faster than `for (const [k, v] of map)`.

```ts
import { ArrayList, HashMap } from '@ylcnfrht/typescript-collection-framework';

const list = ArrayList.of(1, 2, 3);
// with new:
// const list = new ArrayList<number>();
// list.add(1);
// list.add(2);
// list.add(3);
let sum = 0;
list.forEach((x) => (sum += x)); // fastest whole-list pass
for (let i = 0, n = list.size(); i < n; i++) sum += list.get(i); // also fast: indexed get on a random-access list
console.log(sum); // → 12

const m = new HashMap<string, number>();
m.put('a', 1);
m.put('b', 2);
let total = 0;
m.forEach((_k, v) => (total += v)); // no [key, value] array per entry
console.log(total); // → 3
```

### Presize an `ArrayDeque`, not other collections

`new ArrayList(n)`, `new HashMap(n)`, `HashMap.newHashMap(n)` and `new PriorityQueue(n)` validate `n`, but the native storage grows on its own, so they do not preallocate. `new ArrayDeque(n)` does preallocate. That about doubled `addLast` throughput in the deque benchmark, so presize a deque whenever you know its size.

### Prefer `ArrayDeque` over `LinkedList` for queues and stacks

Both are O(1) at the ends, but `LinkedList` allocates a node per element and scatters elements across memory. `ArrayDeque` is a single array. Use `LinkedList` only when you need `null` elements, or O(1) inserts and removes in the middle through a `ListIterator`.

### Use `IntStream`/`DoubleStream` for numeric work

JS numbers are never boxed, so the gain does not come from avoiding allocation as it would in the JDK. It comes from specialised operations: `sum()`, `average()`, `summaryStatistics()`, typed-array `sorted()` and number `distinct()`. In the `distinct + sorted` benchmark, `IntStream` was 2.3× faster than `Stream<number>`. Switch with `mapToInt` and back with `boxed()` or `mapToObj`:

```ts
import { IntStream, List } from '@ylcnfrht/typescript-collection-framework';

const orders = List.of({ qty: 3 }, { qty: 5 }, { qty: 3 });
console.log(orders.stream().mapToInt((o) => o.qty).sum()); // → 11
console.log(orders.stream().mapToInt((o) => o.qty).distinct().sorted().boxed().toList()); // → [3, 5]
console.log(IntStream.range(0, 1000).filter((i) => i % 7 === 0).count()); // → 143
```

### `count()` may skip the pipeline

When the size is known from the source, `count()` returns it without traversing, so side effects in `peek` or `map` never run. This matches the JDK. Do not rely on `peek` for side effects.

```ts
import { List } from '@ylcnfrht/typescript-collection-framework';

let peeked = 0;
const n = List.of(1, 2, 3).stream().peek(() => peeked++).map((x) => x * 2).count();
console.log(n, peeked); // → 3 0
```

### Other tips

- Use `removeIf(pred)` instead of removing through an iterator in a loop. On an `ArrayList` it is one O(n) compaction.
- Use `Stream.ofArray(array)` (or `IntStream.ofArray`) to stream a JS array without copying it.
- Give hash keys a cheap `hashCode()`. It runs on every lookup. `Objects.hash(a, b)` is fine, and so is caching the hash in a `readonly` field of an immutable object.

## Isolated comparison

The numbers in this section come from `npm run bench:isolated`, which is built so that no implementation can affect another:

- **One implementation per process.** Every (workload, implementation) pair runs alone in a fresh Docker container. Only that implementation's package is loaded, which matters because collections.js replaces built-ins such as `Array.prototype.find`, `Object.is` and `Array.from` when it loads.
- **Same environment.** All containers start from one image: Node.js v24.12.0, the same package versions, and the published build (`dist/`) of this library. Each is pinned to one CPU (`--cpuset-cpus 1 --cpus 1 --memory 2g --network none`).
- **Same data, same test.** Every workload has one seeded dataset and one test loop, written once in `bench/isolated/workloads.ts`. Implementations plug in through a small adapter (`put`, `get`, `offer`, `poll`, ...).
- **Same answer.** Before timing, every implementation must return the same checksum on that data, for example the same number of LRU cache hits. The run stops if any implementation disagrees.
- **Order and repeats.** Containers run one at a time, in shuffled order, 3 times each. The tables show the median.

Docker on macOS runs a Linux virtual machine, so the absolute ops/s differ from the in-process tables further down; compare the ratios. Ratios are relative to the baseline named in each heading. Run on 2026-10-21, Apple M1 Pro.


### Run it in your browser

Every workload of the isolated comparison runs on your device when you press a button: the same data, the same test and the same implementations, each in its own Web Worker. Next to each of your ratios is the one the isolated run measured. Run all takes about two minutes.

<TryBenchmark />

### ArrayList add + get, 100k appends, 100k indexed reads

| Implementation | add/get calls/s | runs/s | ±% | vs native Array |
| --- | ---: | ---: | ---: | ---: |
| native Array | 130,200,756 | 651 | 8.4 | 1.00× |
| **@ylcnfrht/typescript-collection-framework ArrayList** | 112,004,838 | 560 | 7.8 | 0.86× |
| js-sdsl Vector | 104,838,337 | 524 | 7.2 | 0.81× |

One run performs 200,000 add/get calls.

### ArrayList sort, 100k random numbers, comparator

| Implementation | elements/s | runs/s | ±% | vs native Array |
| --- | ---: | ---: | ---: | ---: |
| js-sdsl Vector | 4,761,193 | 48 | 2.1 | 1.11× |
| **@ylcnfrht/typescript-collection-framework ArrayList** | 4,591,039 | 46 | 3.0 | 1.07× |
| native Array | 4,308,037 | 43 | 5.7 | 1.00× |

One run performs 100,000 elements.

### ArrayDeque as a queue, size 1k, 100k offer + poll

| Implementation | offer/poll calls/s | runs/s | ±% | vs native Array push + shift |
| --- | ---: | ---: | ---: | ---: |
| mnemonist CircularBuffer (fixed capacity) | 473,410,176 | 2,367 | 0.6 | 10.68× |
| **@ylcnfrht/typescript-collection-framework ArrayDeque** | 356,157,173 | 1,781 | 1.1 | 8.03× |
| js-sdsl Deque | 296,660,231 | 1,483 | 1.6 | 6.69× |
| collections.js Deque | 215,586,726 | 1,078 | 0.4 | 4.86× |
| native Array push + shift | 44,333,778 | 222 | 0.7 | 1.00× |

One run performs 200,000 offer/poll calls.

### LinkedList as a queue, size 1k, 100k offer + poll

| Implementation | offer/poll calls/s | runs/s | ±% | vs native Array push + shift |
| --- | ---: | ---: | ---: | ---: |
| **@ylcnfrht/typescript-collection-framework LinkedList** | 378,341,657 | 1,892 | 2.3 | 9.22× |
| js-sdsl LinkList | 313,269,686 | 1,566 | 3.1 | 7.64× |
| collections.js List | 164,580,519 | 823 | 1.2 | 4.01× |
| native Array push + shift | 41,025,264 | 205 | 2.8 | 1.00× |

One run performs 200,000 offer/poll calls.

### Stack push + pop, 100k pushes, then 100k pops

| Implementation | push/pop calls/s | runs/s | ±% | vs native Array push + pop |
| --- | ---: | ---: | ---: | ---: |
| native Array push + pop | 134,905,094 | 675 | 7.7 | 1.00× |
| js-sdsl Stack | 121,692,068 | 608 | 7.4 | 0.90× |
| mnemonist Stack | 117,847,424 | 589 | 7.6 | 0.87× |
| **@ylcnfrht/typescript-collection-framework ArrayDeque** | 113,176,372 | 566 | 7.3 | 0.84× |
| **@ylcnfrht/typescript-collection-framework Stack** | 107,075,519 | 535 | 7.0 | 0.79× |

One run performs 200,000 push/pop calls.

### PriorityQueue churn, size 1k, 100k offer + poll

| Implementation | offer/poll calls/s | runs/s | ±% | vs sorted array |
| --- | ---: | ---: | ---: | ---: |
| js-sdsl PriorityQueue | 59,880,686 | 299 | 1.5 | 1.07× |
| **@ylcnfrht/typescript-collection-framework PriorityQueue** | 58,911,542 | 295 | 1.6 | 1.05× |
| mnemonist Heap | 57,245,759 | 286 | 0.4 | 1.02× |
| sorted array | 56,175,659 | 281 | 0.8 | 1.00× |
| collections.js Heap | 20,376,169 | 102 | 0.6 | 0.36× |
| @datastructures-js/priority-queue | 12,798,137 | 64 | 0.8 | 0.23× |

One run performs 200,000 offer/poll calls.

### HashSet add + has, 100k integers

| Implementation | add/has calls/s | runs/s | ±% | vs native Set |
| --- | ---: | ---: | ---: | ---: |
| **@ylcnfrht/typescript-collection-framework HashSet** | 87,477,463 | 437 | 7.2 | 4.25× |
| native Set | 20,561,628 | 103 | 12.2 | 1.00× |
| js-sdsl HashSet | 19,752,692 | 99 | 13.7 | 0.96× |
| collections.js FastSet | 7,035,142 | 35 | 8.9 | 0.34× |

One run performs 200,000 add/has calls.

### LinkedHashSet add + has, 100k integers, insertion order

| Implementation | add/has calls/s | runs/s | ±% | vs native Set |
| --- | ---: | ---: | ---: | ---: |
| **@ylcnfrht/typescript-collection-framework LinkedHashSet** | 70,101,442 | 351 | 16.5 | 3.20× |
| native Set | 21,924,666 | 110 | 11.6 | 1.00× |

One run performs 200,000 add/has calls.

### TreeSet add + contains, 100k random keys, 100k queries

| Implementation | add/contains calls/s | runs/s | ±% | vs js-sdsl OrderedSet |
| --- | ---: | ---: | ---: | ---: |
| **@ylcnfrht/typescript-collection-framework TreeSet** | 3,584,814 | 18 | 8.8 | 1.14× |
| js-sdsl OrderedSet | 3,151,988 | 16 | 7.3 | 1.00× |
| collections.js SortedSet | 515,718 | 3 | 4.2 | 0.16× |

One run performs 200,000 add/contains calls.

### HashMap.get, 100k integer keys

| Implementation | get calls/s | runs/s | ±% | vs native Map |
| --- | ---: | ---: | ---: | ---: |
| **@ylcnfrht/typescript-collection-framework HashMap** | 167,333,439 | 1,673 | 0.6 | 3.48× |
| js-sdsl HashMap | 143,983,554 | 1,440 | 0.5 | 2.99× |
| native Map | 48,121,175 | 481 | 1.7 | 1.00× |
| collections.js FastMap | 11,080,756 | 111 | 0.5 | 0.23× |

One run performs 100,000 get calls.

### HashMap.put, 100k string keys

| Implementation | put calls/s | runs/s | ±% | vs native Map |
| --- | ---: | ---: | ---: | ---: |
| native Map | 10,146,634 | 101 | 11.6 | 1.00× |
| **@ylcnfrht/typescript-collection-framework HashMap** | 7,659,198 | 77 | 13.6 | 0.75× |
| js-sdsl HashMap | 6,171,878 | 62 | 16.8 | 0.61× |
| collections.js FastMap | 1,691,274 | 17 | 10.7 | 0.17× |

One run performs 100,000 put calls.

### HashMap with value keys, 10k points with equals()/hashCode()

| Implementation | put/get calls/s | runs/s | ±% | vs native Map with string keys |
| --- | ---: | ---: | ---: | ---: |
| **@ylcnfrht/typescript-collection-framework HashMap** | 10,179,703 | 509 | 1.9 | 1.19× |
| native Map with string keys | 8,570,940 | 429 | 2.4 | 1.00× |
| collections.js FastMap | 3,662,150 | 183 | 3.0 | 0.43× |

One run performs 20,000 put/get calls.

### LinkedHashMap put + iterate, 100k entries, insertion order

| Implementation | puts and visited entries/s | runs/s | ±% | vs native Map |
| --- | ---: | ---: | ---: | ---: |
| **@ylcnfrht/typescript-collection-framework LinkedHashMap** | 59,794,647 | 299 | 15.0 | 2.74× |
| native Map | 21,842,667 | 109 | 10.9 | 1.00× |

One run performs 200,000 puts and visited entries.

### LRU cache, capacity 1k, 100k get-or-put

| Implementation | get-or-put calls/s | runs/s | ±% | vs native Map delete + set |
| --- | ---: | ---: | ---: | ---: |
| **@ylcnfrht/typescript-collection-framework LinkedHashMap.lru** | 28,223,450 | 282 | 0.7 | 4.86× |
| mnemonist LRUMap | 18,171,958 | 182 | 0.6 | 3.13× |
| native Map delete + set | 5,813,243 | 58 | 0.7 | 1.00× |
| collections.js LruMap | 715,041 | 7 | 1.9 | 0.12× |

One run performs 100,000 get-or-put calls.

### TreeMap put, 100k random integer keys

| Implementation | put calls/s | runs/s | ±% | vs js-sdsl OrderedMap |
| --- | ---: | ---: | ---: | ---: |
| js-sdsl OrderedMap | 4,490,276 | 45 | 7.1 | 1.00× |
| **@ylcnfrht/typescript-collection-framework TreeMap** | 4,201,360 | 42 | 5.4 | 0.94× |
| collections.js SortedMap | 255,774 | 3 | 6.0 | 0.06× |

One run performs 100,000 put calls.

### TreeMap floor + ceiling, 100k keys, 100k queries

| Implementation | floor/ceiling calls/s | runs/s | ±% | vs js-sdsl OrderedMap |
| --- | ---: | ---: | ---: | ---: |
| **@ylcnfrht/typescript-collection-framework TreeMap** | 5,409,975 | 27 | 6.1 | 2.62× |
| js-sdsl OrderedMap | 2,065,374 | 10 | 7.3 | 1.00× |
| collections.js SortedSet | 788,266 | 4 | 5.8 | 0.38× |

One run performs 200,000 floor/ceiling calls.

### Stream filter → map → sum, 100k numbers

| Implementation | elements/s | runs/s | ±% | vs native Array filter/map/reduce |
| --- | ---: | ---: | ---: | ---: |
| **@ylcnfrht/typescript-collection-framework Stream** | 685,926,258 | 6,859 | 0.3 | 15.29× |
| **@ylcnfrht/typescript-collection-framework IntStream** | 677,719,459 | 6,777 | 0.4 | 15.10× |
| native Array filter/map/reduce | 44,870,170 | 449 | 5.4 | 1.00× |
| native Iterator helpers | 36,207,973 | 362 | 1.2 | 0.81× |

One run performs 100,000 elements.

## Benchmark results

The in-process suite covers many more cases than the [isolated comparison](#isolated-comparison), but loads every library into one process and runs directly on macOS. All numbers below come from one run of `npm run bench -- <group>` for each group, on:

| | |
| --- | --- |
| Machine | Apple M1 Pro, 16 GB, macOS 14 |
| Runtime | Node.js v24.12.0 |
| Library | `@ylcnfrht/typescript-collection-framework` 1.0.0 before release (commit `5f67687`) |
| Harness | `tinybench` 6.2.0, 300 ms per case after 100 ms warm-up |
| Competitors | `js-sdsl` 4.4.2, `mnemonist` 0.40.5, `@datastructures-js/priority-queue` 6.4.0 |

> [!WARNING]
> Read the results as rough ratios, not absolutes. Other work was running on the machine during the run, and some cases show ±10–30% relative margin of error (the `±%` column the harness prints). Re-run them on your own hardware before drawing fine-grained conclusions.

In the tables, >1.00× means this library was faster. Each ratio is our throughput divided by the other implementation's. "Best competitor" is the fastest of `js-sdsl`, `mnemonist` and `@datastructures-js` in that group.

### ArrayList (vs native Array, js-sdsl Vector)

| Benchmark | ours ops/s | vs native | vs js-sdsl |
| --- | ---: | ---: | ---: |
| append 10k | 40,038 | 0.98× | 1.03× |
| get-sum 10k (indexed) | 179,697 | 1.11× | 3.98× |
| for..of 10k | 48,518 | **0.33×** | 17.9× |
| forEach 10k | 86,448 | 1.45× | 1.17× |
| insert at front 1k | 12,053 | 1.05× | 1.50× |
| removeAt(0) drain 1k | 23,030 | 0.99× | 1.98× |
| indexOf (primitive) 10k | 1,604,137 | 1.00× | 3.53× |
| contains (objects with equals) 1k | 1,416,820 | 0.95× | 1.00× |
| sort 10k random numbers | 557 | 1.19× | 1.14× |
| removeIf half of 10k | 9,139 | 0.99× | 1.35× |

`ArrayList` is at native speed for everything except `for..of`, where the fail-fast iterator protocol costs about 3× (see [Tips](#tips)).

### HashMap, HashSet, LinkedHashMap (vs native Map/Set, js-sdsl, mnemonist)

| Benchmark | ours ops/s | vs native | vs best competitor |
| --- | ---: | ---: | ---: |
| HashMap put 100k int keys | 907 | 5.18× | 1.68× (js-sdsl) |
| HashMap get 100k int keys | 5,474 | 9.60× | 1.61× (js-sdsl) |
| HashMap get hit/miss mix 100k | 4,868 | 11.0× | 2.82× (js-sdsl) |
| HashMap put+delete 100k int keys | 347 | 3.34× | 2.08× (js-sdsl) |
| HashMap put 100k string keys | 111 | **0.83×** | 1.26× (js-sdsl) |
| HashMap put+get 100k sparse int keys | 113 | **0.76×** | 2.57× (js-sdsl) |
| HashMap put+get 10k Point keys (equals/hashCode) | 786 | 1.18× (native with string-encoded keys) | 1.51× (js-sdsl, identity only) |
| HashMap iterate entries 100k, `for..of` | 970 | 0.97× | 1.92× (js-sdsl) |
| HashMap iterate entries 100k, `forEach` | 1,423 | 1.42× | 2.81× (js-sdsl) |
| HashSet add+has 100k int | 987 | 6.41× | 6.62× (js-sdsl) |
| LinkedHashMap put 100k int keys | 580 | 3.05× | 1.23× (js-sdsl HashMap) |
| LinkedHashMap put 100k string keys | 104 | **0.69×** | 1.14× (js-sdsl HashMap) |
| LinkedHashMap get 100k int keys | 2,029 | 3.82× | 3.40× (js-sdsl HashMap) |
| LinkedHashMap ordered iteration 100k, `for..of` | 845 | **0.82×** (native `for..of`) | **0.80×** (js-sdsl `forEach`) |
| LinkedHashMap ordered iteration 100k, `forEach` | 1,294 | 1.06× (native `forEach`) | 1.22× (js-sdsl) |
| LRU cache, cap 1k, 100k get-or-put | 247 | 4.05× (native Map delete+set) | 1.36× (mnemonist LRUMap) |
| LinkedHashSet add+has 100k int | 335 | 2.75× | 2.20× (js-sdsl HashSet) |
| LinkedHashMap fill + pollFirstEntry drain 100k | 355 | 4.28× | 2.47× (js-sdsl HashMap) |

The large wins on integer keys come from the dense integer table. String keys are slower than a native `Map`, by 17% for `HashMap` and 31% for `LinkedHashMap`, because every operation goes through the hybrid dispatch, and `LinkedHashMap` also maintains its list. Sparse integer keys fall back to the native `Map` through that same dispatch, so they are 24% slower. If all your keys are strings and you need neither value equality nor the `Map` interface, a native `Map` is the faster choice.

### TreeMap, TreeSet (vs js-sdsl OrderedMap/OrderedSet, sorted array)

| Benchmark | ours ops/s | vs js-sdsl | vs sorted array |
| --- | ---: | ---: | ---: |
| put 100k random int keys | 48 | 1.00× | — |
| put 100k ascending keys | 334 | 1.36× | 2.39× (binary search + splice) |
| get 100k | 41 | **0.93×** | **0.41×** |
| floor + ceiling 100k queries | 30 | 2.14× | **0.29×** |
| iterate 100k in order, `forEach` | 926 | 1.79× | **0.09×** |
| iterate 100k in order, `for..of` | 613 | 2.71× | **0.08×** |
| remove 100k random keys (+ re-put) | 22 | **0.79×** | — |
| build 100k ascending + pollFirst drain | 151 | 3.08× | — |
| string keys 50k put + get | 24 | 1.20× | — |
| TreeSet add + contains 100k | 18 | 1.38× | — |

`TreeMap` is level with js-sdsl on random puts, slightly slower on `get` (7%) and random `remove` (21%), and faster everywhere else. A static sorted array wins every read-only workload, as expected (see [Choosing for speed](#choosing-for-speed)).

### PriorityQueue (vs js-sdsl, mnemonist, @datastructures-js)

| Benchmark | ours ops/s | vs best competitor | vs baseline |
| --- | ---: | ---: | ---: |
| offer 100k random numbers | 445 | **0.89×** (js-sdsl) | 8.56× (push + sort) |
| offer + poll all 100k (heap sort) | 84 | 1.01× (js-sdsl) | 1.62× (push + sort) |
| steady churn (size 1k, 100k offer/poll) | 365 | 1.13× (js-sdsl) | 1.52× (sorted array) |
| objects, custom comparator, offer + poll 10k | 554 | 1.22× (mnemonist) | **0.95×** (push + sort) |
| heapify 100k via constructor | 575 | 1.17× (js-sdsl copy) | 12.0× (sort) |
| peek loop 100k | 9,482 | 0.98× (mnemonist) | 0.99× |

Against `@datastructures-js/priority-queue` alone, the ratios were 2.1× (offer), 1.7× (heap sort), 5.4× (churn), 1.8× (objects) and 1.6× (heapify). js-sdsl's bare `push` is 11% faster on offer-only workloads. Once `poll` is involved, this library leads.

### ArrayDeque (vs native Array, js-sdsl Deque, mnemonist)

| Benchmark | ours ops/s | vs native | vs best competitor |
| --- | ---: | ---: | ---: |
| addLast 100k (growable) | 1,268 | **0.81×** (`push`) | **0.64×** (js-sdsl) |
| addLast 100k (preallocated) | 2,588 | — | **0.94×** (mnemonist FixedDeque) |
| addFirst 100k (growable) | 1,310 | — | **0.62×** (js-sdsl) |
| addFirst 100k (preallocated) | 1,988 | — | **0.79×** (mnemonist FixedDeque) |
| queue churn (size 1k, 100k offer+poll) | 2,068 | 12.2× (`push`/`shift`) | **0.69×** (mnemonist CircularBuffer) |
| stack push/pop 100k (growable) | 1,042 | **0.71×** | **0.67×** (js-sdsl) |
| stack push/pop 100k (preallocated) | 1,626 | — | **0.93×** (mnemonist FixedDeque) |
| pollFirst drain 100k (growable) | 1,210 | — | **0.77×** (js-sdsl) |
| pollFirst drain 100k (preallocated) | 1,622 | — | **0.81×** (mnemonist FixedDeque) |
| for..of 10k | 38,269 | **0.26×** | 1.47× (mnemonist) |
| contains (primitive) 10k | 222,809 | 1.01× (`includes`) | 36.6× (js-sdsl) |

This is the weakest group. `ArrayDeque` is 6–38% behind the fastest specialised deque on raw add/poll throughput. Every add does work the competitors skip: a `null` check, which the Java API requires, and a `modCount` update for fail-fast iterators. It is still 12× faster than using `Array.shift()` as a queue, and the gap shrinks to 6–21% when the deque is preallocated.

### Streams (vs native Array chains, Iterator helpers, hand-written loops)

| Benchmark | ours ops/s | vs native | vs `for` loop |
| --- | ---: | ---: | ---: |
| filter→map→sum 100k (`Stream`) | 6,488 | 10.2× (Array chain) | **0.65×** |
| filter→map→sum 100k (`IntStream`) | 6,630 | 10.4× (Array chain) | **0.66×** |
| filter→map→toList 100k | 3,078 | 3.85× (Array chain) | **0.86×** |
| filter→findFirst 1M (hit at 999) | 484,454 | **0.42×** (`Array.find`) | **0.42×** |
| limit(10) of an infinite iterate | 9,205,597 | 3.06× (Iterator helpers) | **0.42×** |
| distinct+sorted 10k (`Stream`) | 4,500 | 1.57× (Set + sort) | — |
| distinct+sorted 10k (`IntStream`) | 10,175 | 3.55× (Set + sort) | — |
| flatMap 10k×10 | 690 | 1.01× (`Array.flatMap`) | **0.40×** |
| mapMulti 10k×10 | 1,525 | 2.24× (`Array.flatMap`) | 0.88× |
| filter→collect(collector) 100k | 2,879 | 2.53× (`Array.filter`) | 0.90× |
| `IntStream.range(0, 1e6).sum()` | 602 | 8.99× (Iterator helpers) | **0.61×** |

Streams are 2–10× faster than chained `Array` methods, which allocate an intermediate array per stage, and than native Iterator helpers. They reach 60–90% of a hand-written loop on bulk pipelines. Short pipelines that end early, like `findFirst` or `limit` on tiny inputs, pay a fixed setup cost per stream and run at about 40% of a loop. For a single `find`, use `Array.find`. Prefer `mapMulti` over `flatMap` on hot paths: it avoids creating a stream per element.

### Collectors (vs native equivalents)

| Benchmark | ours ops/s | vs native |
| --- | ---: | ---: |
| `Collectors.toList` 100k | 1,369 | **0.74×** (`push` loop) |
| `Collectors.groupingBy(counting)` 100k | 2,002 | 3.31× (native `Map` counting) |
| `Collectors.joining` 100k | 841 | 2.10× (`push` + `join`) |
| `Collectors.toMap` 100k | 111 | **0.94×** (native `Map`), 0.99× (hand-written `HashMap`) |
| `Collectors.partitioningBy` 100k | 1,415 | **0.87×** (two arrays) |

`groupingBy` benefits from the `HashMap` integer path. `toList` and `partitioningBy` pay for the generic collector protocol, which runs supplier, accumulator and finisher as separate calls. When you only need a list, `stream.toList()` skips that protocol.

### Summary

| Where we are faster | Where we are slower |
| --- | --- |
| integer-keyed `HashMap`/`HashSet`/`LinkedHashMap` (3–11× native) | `for..of` over `ArrayList`/`ArrayDeque` (0.26–0.33× native arrays) |
| LRU caches (1.4× mnemonist, 4× native) | `ArrayDeque` raw add/poll (0.62–0.94× js-sdsl/mnemonist) |
| `PriorityQueue` with polling (1.0–1.2× the best, 1.6–5.4× @datastructures-js) | string-keyed `HashMap` (0.83×) and `LinkedHashMap` (0.69×) vs native `Map` |
| `TreeMap` ordered iteration, navigation, ascending builds (1.4–3× js-sdsl) | `TreeMap` get (0.93×) and remove (0.79×) vs js-sdsl; any tree vs a static sorted array |
| stream pipelines vs `Array` chains (2–10×) | short streams vs `Array.find` / a plain loop (0.4×) |

## Running the benchmarks

```sh
npm run bench                  # every bench/*.bench.ts file (several minutes)
npm run bench -- HashMap       # files whose name contains "HashMap" (HashMap and LinkedHashMap)
npm run bench -- TreeMap
npm run bench -- Stream
npm run bench:isolated         # isolated comparison in Docker (needs a running Docker daemon)
npm run bench:isolated -- --only lru-cache,hashmap-get-int --reps 5
node bench/demo/index.js       # HashMap.get vs a native Map, printing calls, time and ns per call
node bench/demo/index.js strings
```

`bench/demo/index.js` needs `npm run build` first; it runs the same `get` test on this library's `HashMap` and on a native `Map`, each in its own Node process, and prints the number of calls, the time taken, calls per second and nanoseconds per call.

The filter is a case-insensitive substring of the file name in `bench/`. The available files are `ArrayList`, `LinkedList`, `HashMap`, `LinkedHashMap`, `TreeMap`, `PriorityQueue`, `ArrayDeque`, `Collections`, `Stream`, `Collectors` and `Gatherers`. Each group prints a table of ops/sec, relative margin of error and the ratio to the fastest case. The run ends with a "Not fastest in" summary of every group where this library's case lost, and by how much.

For stable numbers:

- Close other heavy processes, and plug in a laptop. Thermal and power throttling move results by 10–20%.
- Run the same group two or three times and compare. Treat differences under about 10%, or within the printed `±%`, as noise.
- The benchmarks run the TypeScript sources through `ts-node --transpile-only`. That is the same code the published build contains, compiled to an equivalent ES2022 target.

To add a benchmark, create `bench/<Name>.bench.ts` that exports a default async function calling `compare(group, cases)` from `bench/harness.ts`. Name this library's case starting with `ours`, so the summary can find it.
