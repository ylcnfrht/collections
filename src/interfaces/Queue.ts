import { Collection, SequencedCollection } from './Collection';
import { Iterator } from './Iterator';

/**
 * A collection that holds elements for processing, with a head. Each operation comes in two forms: one throws when
 * the queue is empty (`remove()`, `element()`), the other returns `null` (`poll()`, `peek()`). `ArrayDeque` and
 * `PriorityQueue` reject `null` elements (`NullPointerException`), so there a `null` result always means "empty";
 * `LinkedList` accepts `null`, which makes `poll()`/`peek()` ambiguous. Queues use identity `equals`/`hashCode`,
 * except those that are also a `List`.
 */
export interface Queue<E> extends Collection<E> {
  /**
   * Inserts `e` into this queue.
   * @returns `true` if `e` was added (the library's queues are unbounded, so always `true`)
   * @throws {@link NullPointerException} if `e` is null and this queue rejects null
   * @throws {@link ClassCastException} if the queue orders elements and `e` cannot be compared with them
   */
  offer(e: E): boolean;
  /**
   * Removes and returns the head of this queue.
   * @throws {@link NoSuchElementException} if this queue is empty
   */
  remove(): E;
  /**
   * Removes one element equal to `o`, if present.
   * @returns `true` if an element was removed
   */
  remove(o: unknown): boolean;
  /** Removes and returns the head of this queue, or `null` if it is empty. */
  poll(): E | null;
  /**
   * Returns the head of this queue without removing it.
   * @throws {@link NoSuchElementException} if this queue is empty
   */
  element(): E;
  /** Returns the head of this queue without removing it, or `null` if it is empty. */
  peek(): E | null;
}

/**
 * A double-ended queue: elements can be inserted, inspected and removed at both ends, so it serves as a FIFO queue
 * (`offer`/`poll` work at the tail/head) or a LIFO stack (`push`/`pop` work at the head). Methods returning `null`
 * mean "empty".
 */
export interface Deque<E> extends Queue<E>, SequencedCollection<E> {
  /**
   * Removes and returns the first element; same as `removeFirst()`.
   * @throws {@link NoSuchElementException} if this deque is empty
   */
  remove(): E;
  /**
   * Removes the first element equal to `o`, if present; same as `removeFirstOccurrence(o)`.
   * @returns `true` if an element was removed
   */
  remove(o: unknown): boolean;
  /**
   * Inserts `e` at the front.
   * @returns `true` if `e` was added
   * @throws {@link NullPointerException} if `e` is null and this deque rejects null
   */
  offerFirst(e: E): boolean;
  /**
   * Inserts `e` at the end.
   * @returns `true` if `e` was added
   * @throws {@link NullPointerException} if `e` is null and this deque rejects null
   */
  offerLast(e: E): boolean;
  /** Removes and returns the first element, or `null` if this deque is empty. */
  pollFirst(): E | null;
  /** Removes and returns the last element, or `null` if this deque is empty. */
  pollLast(): E | null;
  /** Returns the first element without removing it, or `null` if this deque is empty. */
  peekFirst(): E | null;
  /** Returns the last element without removing it, or `null` if this deque is empty. */
  peekLast(): E | null;
  /**
   * Removes the first element (from head to tail) equal to `o`.
   * @returns `true` if an element was removed
   */
  removeFirstOccurrence(o: unknown): boolean;
  /**
   * Removes the last element (the first found from tail to head) equal to `o`.
   * @returns `true` if an element was removed
   */
  removeLastOccurrence(o: unknown): boolean;
  /**
   * Pushes `e` onto the stack this deque represents, that is, inserts it at the front; same as `addFirst(e)`.
   * @throws {@link NullPointerException} if `e` is null and this deque rejects null
   */
  push(e: E): void;
  /**
   * Pops the top of the stack this deque represents, that is, removes and returns the first element; same as
   * `removeFirst()`.
   * @throws {@link NoSuchElementException} if this deque is empty
   */
  pop(): E;
  /** Returns a fail-fast iterator over the elements from last to first. */
  descendingIterator(): Iterator<E>;
  /** Returns a live reverse-ordered view: changes through either side are visible in the other. */
  reversed(): Deque<E>;
}
