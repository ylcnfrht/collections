---
title: Null and errors
description: Which methods return null and which throw, the throwing and non-throwing method pairs, which collections accept null, and the exception types.
sidebar:
  order: 3
---

The library has one notion of "nothing": `null`.

- Lookups that can find nothing **return `null`**, never `undefined`: `Map.get`, `Queue.poll`/`peek`,
  `NavigableSet.ceiling`/`floor`, `NavigableMap.firstEntry`, `Map.put` (the previous value), and so on.
- Methods that must return an element **throw** on an empty collection: `getFirst()`, `element()`, `remove()` (no
  argument) and `firstKey()` throw `NoSuchElementException`; `Stack.pop()` throws `EmptyStackException`.
- Collections that reject `null` treat `undefined` the same way. Collections that permit `null` store `undefined` as
  given, but do not rely on telling the two apart.

```ts
import { HashMap, TreeSet } from '@ylcnfrht/collections';

const m = new HashMap<string, number>();
console.log(m.get('missing')); // → null
console.log(m.put('a', 1));    // → null
console.log(m.put('a', 2));    // → 1

console.log(TreeSet.of(10, 20).ceiling(25)); // → null
```

:::note
Because `null` means "absent", `get` is ambiguous on a map that stores `null` values. Use `containsKey` or
`getOrDefault` there.
:::

## Throwing and non-throwing pairs

Most operations that throw on an empty collection have a twin that returns `null`. Throw when emptiness is a bug;
return `null` when it is an expected case.

| Throws when there is nothing | Returns `null` instead | Exception |
|---|---|---|
| `queue.remove()` | `queue.poll()` | `NoSuchElementException` |
| `queue.element()` | `queue.peek()` | `NoSuchElementException` |
| `deque.removeFirst()` / `removeLast()` | `deque.pollFirst()` / `pollLast()` | `NoSuchElementException` |
| `deque.getFirst()` / `getLast()` | `deque.peekFirst()` / `peekLast()` | `NoSuchElementException` |
| `deque.pop()` | `deque.pollFirst()` | `NoSuchElementException` |
| `sortedMap.firstKey()` / `lastKey()` | `navigableMap.firstEntry()` / `lastEntry()` (then `?.getKey()`) | `NoSuchElementException` |
| `stack.pop()` / `stack.peek()` | `stack.empty()` first, or an `ArrayDeque` with `pollFirst()` / `peekFirst()` | `EmptyStackException` |
| `iterator.next()` | `iterator.hasNext()` first | `NoSuchElementException` |
| `optional.get()` / `orElseThrow()` | `optional.orElse(null)`, `orElseGet(fn)`, `ifPresent(fn)` | `NoSuchElementException` |

These have no `null`-returning twin; check `isEmpty()` or the index first:

| Throws | Exception |
|---|---|
| `list.get(index)`, `list.set(index, e)`, `list.removeAt(index)` out of range | `IndexOutOfBoundsException` |
| `list.getFirst()` / `getLast()` / `removeFirst()` / `removeLast()` on an empty list (a `LinkedList` also has `peekFirst()` / `pollFirst()`) | `NoSuchElementException` |
| `sortedSet.first()` / `last()` on an empty set (`pollFirst()` / `pollLast()` return `null` but remove the element) | `NoSuchElementException` |
| `Collections.min` / `max` of an empty collection | `NoSuchElementException` |

Lookups never throw for finding nothing: `map.get`, `map.remove(key)`, `floor`/`ceiling`/`lower`/`higher`,
`firstEntry`/`lastEntry` and `stream.findFirst()` (an empty `Optional`) all report it without an exception.
Exceptions that signal a programming error (`ConcurrentModificationException`, `NullPointerException`,
`UnsupportedOperationException`) have no non-throwing form.

```ts
import { ArrayDeque, TreeMap, ArrayList } from '@ylcnfrht/collections';

const queue = new ArrayDeque<string>();
console.log(queue.poll()); // → null
try {
  queue.remove();
} catch (e) {
  console.log((e as Error).name); // → NoSuchElementException
}

const prices = new TreeMap<number, string>();
console.log(prices.firstEntry()?.getKey() ?? 'none'); // → none

const list = new ArrayList<number>();
console.log(list.isEmpty() ? null : list.getFirst()); // → null
```

## Which collections accept null

| Accepts `null` elements / keys | Rejects (throws `NullPointerException`) |
|---|---|
| `ArrayList`, `LinkedList`, `Vector`, `Stack` | `ArrayDeque`, `PriorityQueue` |
| `HashSet`, `LinkedHashSet` | `TreeSet` (natural order; a `nullsFirst`/`nullsLast` comparator allows it) |
| `HashMap`, `LinkedHashMap`, `IdentityHashMap` (keys and values) | `TreeMap` keys (values may be `null`) |
| `Collections.unmodifiable*` wrappers (whatever the backing collection accepts) | `List.of`, `Set.of`, `Map.of`, `copyOf`: elements, keys, values, and even `contains(null)` |

```ts
import { ArrayList, ArrayDeque, List } from '@ylcnfrht/collections';

const ok = new ArrayList<string | null>();
ok.add(null);
console.log(ok.toString()); // → [null]

try {
  new ArrayDeque<string | null>().add(null);
} catch (e) {
  console.log((e as Error).name); // → NullPointerException
}
try {
  List.of<string | null>(null);
} catch (e) {
  console.log((e as Error).name); // → NullPointerException
}
```

## Exceptions

All library exceptions extend `RuntimeException`, which extends `Error`. `ArrayIndexOutOfBoundsException` extends
`IndexOutOfBoundsException`; every other one extends `RuntimeException` directly. Each sets `name` explicitly, so
`e.name` survives minification. `instanceof` works when a single copy of the library is loaded (see
[Browsers and bundlers](/start/installation/#browsers-and-bundlers)).

| Exception | Typical cause |
|---|---|
| `IndexOutOfBoundsException` | `get(5)` on a 3-element list, bad `subList` range |
| `ArrayIndexOutOfBoundsException` | index errors in array-backed legacy methods (`Vector.elementAt`, ...) |
| `NoSuchElementException` | `getFirst()`, `iterator().next()`, `firstKey()`, `Optional.get()` with nothing there |
| `EmptyStackException` | `Stack.pop()`/`peek()` on an empty stack |
| `NullPointerException` | a `null` where it is not allowed (see [above](#which-collections-accept-null)) |
| `IllegalArgumentException` | negative capacity, duplicate in `Set.of`, key outside a sorted view's range |
| `IllegalStateException` | `iterator.remove()` twice, a stream used twice, `Collectors.toMap` duplicate key |
| `UnsupportedOperationException` | mutating an unmodifiable or immutable collection (see [Immutable collections and wrappers](/collections/immutable-and-wrappers/)) |
| `ConcurrentModificationException` | changing a collection while iterating it |
| `ClassCastException` | natural ordering of values that have none, `checked*` wrappers |

```ts
import {
  ArrayList, Stack, Vector, RuntimeException, IndexOutOfBoundsException, ArrayIndexOutOfBoundsException,
} from '@ylcnfrht/collections';

try {
  new ArrayList<number>().get(0);
} catch (e) {
  console.log(e instanceof IndexOutOfBoundsException, e instanceof RuntimeException, e instanceof Error); // → true true true
}
try {
  new Stack<number>().pop();
} catch (e) {
  console.log((e as Error).name); // → EmptyStackException
}
try {
  new Vector<number>().elementAt(3);
} catch (e) {
  console.log(e instanceof ArrayIndexOutOfBoundsException); // → true
}
```
