import { IllegalArgumentException, IllegalStateException, NoSuchElementException } from '../exceptions';
import { Collection } from '../interfaces/Collection';
import { Queue } from '../interfaces/Queue';
import { requireNonNull } from '../util/Objects';
import { AbstractCollection } from './AbstractCollection';

/**
 * Skeleton implementation of the `Queue` interface for queues that reject `null` elements, since a `null` from
 * `poll()`/`peek()` always means "empty".
 *
 * A subclass implements `offer`, `poll`, `peek`, `iterator()` and `size()`. It inherits the throwing variants
 * `add` ({@link IllegalStateException} when `offer` refuses), `remove()` and `element()`
 * ({@link NoSuchElementException} when empty), plus `clear` (polls until empty) and `addAll`. Fail-fast behaviour is
 * whatever the subclass's iterator provides.
 */
export abstract class AbstractQueue<E> extends AbstractCollection<E> implements Queue<E> {
  /** Inserts `e` if there is room; returns `false` when a bounded queue is full. Subclasses implement it and reject `null`. */
  abstract offer(e: E): boolean;
  /** Removes and returns the head, or `null` when empty. Subclasses implement it. */
  abstract poll(): E | null;
  /** Returns the head without removing it, or `null` when empty. Subclasses implement it. */
  abstract peek(): E | null;

  /**
   * Inserts `e` via `offer`; returns `true`.
   * @throws {@link IllegalStateException} if `offer` returns `false` (the queue is full)
   */
  override add(e: E): boolean {
    if (this.offer(e)) return true;
    throw new IllegalStateException('Queue full');
  }

  /**
   * Removes and returns the head, via `poll`.
   * @throws {@link NoSuchElementException} if the queue is empty
   */
  override remove(): E;
  /** Removes one element equal to `o` through the iterator; returns `true` if one was removed. */
  override remove(o: unknown): boolean;
  override remove(o?: unknown): E | boolean {
    if (arguments.length > 0) return super.remove(o);
    const x = this.poll();
    if (x !== null) return x;
    throw new NoSuchElementException();
  }

  /**
   * Returns the head without removing it, via `peek`.
   * @throws {@link NoSuchElementException} if the queue is empty
   */
  element(): E {
    const x = this.peek();
    if (x !== null) return x;
    throw new NoSuchElementException();
  }

  /** Removes every element by calling `poll()` until it returns `null`. */
  override clear(): void {
    while (this.poll() !== null);
  }

  /**
   * Calls `add` for each element of `c`; returns `true` if the queue changed.
   * @throws {@link NullPointerException} if `c` is `null`
   * @throws {@link IllegalArgumentException} if `c` is this queue
   * @throws {@link IllegalStateException} if the queue fills up part-way (earlier elements stay added)
   */
  override addAll(c: Collection<E>): boolean {
    requireNonNull(c);
    if ((c as unknown) === this) throw new IllegalArgumentException();
    return super.addAll(c);
  }
}
