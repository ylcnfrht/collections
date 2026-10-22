import { WritableArrayLike } from '../util/arrays';
import type { Spliterator } from '../stream/Spliterator';
import type { Stream } from '../stream/Stream';
import { Iterator } from './Iterator';

/**
 * The root interface of the collection hierarchy: a group of elements.
 *
 * Membership tests (`contains`, `remove`, `containsAll`, ...) use `Objects.equals`: the element's own `equals()` when
 * it has one, `Date`s by time, otherwise SameValueZero; never plain `===`. Mutating methods are optional operations:
 * an unmodifiable or immutable collection throws `UnsupportedOperationException` from them. Implementations that
 * reject `null` throw `NullPointerException` when given one. Iteration is fail-fast: a structural change made other
 * than through the iterator makes the next step throw `ConcurrentModificationException`. Collections are also
 * iterable with `for..of` and spread.
 */
export interface Collection<E> extends Iterable<E> {
  /**
   * Returns a fail-fast iterator over the elements, in this collection's encounter order (if it has one).
   * Its `remove()` throws `UnsupportedOperationException` on an unmodifiable collection.
   */
  iterator(): Iterator<E>;
  /**
   * Calls `action` for each element, in iteration order.
   * @throws {@link NullPointerException} if `action` is null
   * @throws {@link ConcurrentModificationException} if `action` structurally modifies this collection
   */
  forEach(action: (e: E) => void): void;
  /** Returns the number of elements. */
  size(): number;
  /** Returns `true` if this collection has no elements. */
  isEmpty(): boolean;
  /**
   * Returns `true` if this collection contains an element equal to `o` (by `Objects.equals`).
   * @throws {@link NullPointerException} if `o` is null and this collection rejects null (for example the immutable
   * collections and sorted collections with natural ordering)
   */
  contains(o: unknown): boolean;
  /** Returns a new array with all elements, in iteration order. Changing the array does not affect this collection. */
  toArray(): E[];
  /**
   * Fills an array created by `generator(size())`, in iteration order, and returns it; e.g. `n => new Float64Array(n)`.
   * @param generator - creates the target array for a given length
   */
  toArray<A extends WritableArrayLike<E>>(generator: (length: number) => A): A;
  /**
   * Ensures this collection contains `e`.
   * @returns `true` if the collection changed (a set returns `false` for a duplicate)
   * @throws {@link UnsupportedOperationException} if this collection is unmodifiable
   * @throws {@link NullPointerException} if `e` is null and this collection rejects null
   * @throws {@link IllegalArgumentException} if some property of `e` prevents adding it (for example a key outside a
   * sorted view's range)
   * @throws {@link IllegalStateException} if a capacity-bounded queue is full
   */
  add(e: E): boolean;
  /**
   * Removes one element equal to `o`, if present.
   * @returns `true` if an element was removed
   * @throws {@link UnsupportedOperationException} if this collection is unmodifiable
   * @throws {@link NullPointerException} if `o` is null and this collection rejects null
   */
  remove(o: unknown): boolean;
  /**
   * Returns `true` if this collection contains every element of `c`.
   * @throws {@link NullPointerException} if `c` is null
   */
  containsAll(c: Collection<unknown>): boolean;
  /**
   * Adds every element of `c`, in `c`'s iteration order. `c` is copied first, so `addAll(this)` terminates.
   * @returns `true` if this collection changed
   * @throws {@link NullPointerException} if `c` is null, or contains null and this collection rejects null
   * @throws {@link UnsupportedOperationException} if this collection is unmodifiable
   */
  addAll(c: Collection<E>): boolean;
  /**
   * Removes every element that is also contained in `c`.
   * @returns `true` if this collection changed
   * @throws {@link NullPointerException} if `c` is null
   * @throws {@link UnsupportedOperationException} if this collection is unmodifiable
   */
  removeAll(c: Collection<unknown>): boolean;
  /**
   * Removes every element for which `filter` returns `true`.
   * @returns `true` if any element was removed
   * @throws {@link NullPointerException} if `filter` is null
   * @throws {@link UnsupportedOperationException} if this collection is unmodifiable and an element matches
   */
  removeIf(filter: (e: E) => boolean): boolean;
  /**
   * Keeps only the elements that are also contained in `c`, removing all others.
   * @returns `true` if this collection changed
   * @throws {@link NullPointerException} if `c` is null
   * @throws {@link UnsupportedOperationException} if this collection is unmodifiable
   */
  retainAll(c: Collection<unknown>): boolean;
  /**
   * Removes all elements.
   * @throws {@link UnsupportedOperationException} if this collection is unmodifiable
   */
  clear(): void;
  /**
   * Compares this collection with `o` for equality. A `List` equals any other `List` with the same elements in the
   * same order; a `Set` equals any other `Set` with the same elements; other collections (queues, deques, `values()`
   * views) use identity.
   */
  equals(o: unknown): boolean;
  /**
   * Returns a hash code consistent with `equals`. A list hashes as `h = 31 * h + hash(e)` starting from 1, a set as
   * the sum of its element hashes (both in 32-bit arithmetic); other collections use an identity hash.
   */
  hashCode(): number;
  /** Returns the elements in iteration order as `[a, b, c]`; an element that is this collection prints as `(this Collection)`. */
  toString(): string;
  /** Returns a spliterator over the elements, used to build streams. Fail-fast like the iterator. */
  spliterator(): Spliterator<E>;
  /** Returns a sequential stream over this collection. */
  stream(): Stream<E>;
  /** Returns a stream flagged as parallel; it is evaluated sequentially (JS is single-threaded). */
  parallelStream(): Stream<E>;
}

/**
 * A collection with a defined encounter order and two accessible ends: lists, deques, `LinkedHashSet`, `TreeSet`.
 * Sorted collections place elements themselves, so their `addFirst`/`addLast` throw `UnsupportedOperationException`.
 */
export interface SequencedCollection<E> extends Collection<E> {
  /** Returns a live reverse-ordered view: changes through either side are visible in the other. */
  reversed(): SequencedCollection<E>;
  /**
   * Adds `e` as the first element (for a set that already holds it, moves it to the front).
   * @throws {@link UnsupportedOperationException} if this collection is unmodifiable or sorted
   * @throws {@link NullPointerException} if `e` is null and this collection rejects null
   */
  addFirst(e: E): void;
  /**
   * Adds `e` as the last element (for a set that already holds it, moves it to the end).
   * @throws {@link UnsupportedOperationException} if this collection is unmodifiable or sorted
   * @throws {@link NullPointerException} if `e` is null and this collection rejects null
   */
  addLast(e: E): void;
  /**
   * Returns the first element.
   * @throws {@link NoSuchElementException} if this collection is empty
   */
  getFirst(): E;
  /**
   * Returns the last element.
   * @throws {@link NoSuchElementException} if this collection is empty
   */
  getLast(): E;
  /**
   * Removes and returns the first element.
   * @throws {@link NoSuchElementException} if this collection is empty
   * @throws {@link UnsupportedOperationException} if this collection is unmodifiable
   */
  removeFirst(): E;
  /**
   * Removes and returns the last element.
   * @throws {@link NoSuchElementException} if this collection is empty
   * @throws {@link UnsupportedOperationException} if this collection is unmodifiable
   */
  removeLast(): E;
}
