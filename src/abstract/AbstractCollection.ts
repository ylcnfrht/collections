import { UnsupportedOperationException } from '../exceptions';
import { Collection } from '../interfaces/Collection';
import { Iterator } from '../interfaces/Iterator';
import { streamFactories } from '../stream/hook';
import { Spliterator } from '../stream/Spliterator';
import { IteratorSpliterator } from '../stream/Spliterators';
import type { Stream } from '../stream/Stream';
import { toArrayWith, WritableArrayLike } from '../util/arrays';
import { INSPECT, equals, identityHashCode, requireNonNull, toString } from '../util/Objects';

/**
 * Skeleton implementation of the `Collection` interface, built entirely on `iterator()` and `size()`.
 *
 * A read-only subclass implements those two methods and inherits everything else: `contains`, `toArray`,
 * the bulk operations, `forEach`, `stream()`, `spliterator()`, `for..of` and `toString()`. To make it modifiable,
 * override `add(e)` (which throws {@link UnsupportedOperationException} by default) and return an iterator whose
 * `remove()` works; `remove`, `removeIf`, `removeAll`, `retainAll` and `clear` all go through it.
 * There is no `modCount` here: fail-fast behaviour is whatever the subclass's iterator provides.
 * `equals`/`hashCode` are identity-based; override them (or extend `AbstractList`/`AbstractSet`) for value equality.
 * The defaults are linear scans; override any method the storage can do faster.
 */
export abstract class AbstractCollection<E> implements Collection<E> {
  /** Returns an iterator over the elements. Subclasses implement it; its `remove()` backs every removal method. */
  abstract iterator(): Iterator<E>;
  /** Returns the number of elements. Subclasses implement it. */
  abstract size(): number;

  /** Returns `size() === 0`. */
  isEmpty(): boolean {
    return this.size() === 0;
  }

  /** Returns `true` if some element equals `o` (by `Objects.equals`); a linear scan of `iterator()`. */
  contains(o: unknown): boolean {
    const it = this.iterator();
    while (it.hasNext()) if (equals(o, it.next())) return true;
    return false;
  }

  /** Returns a new array of the elements in iteration order. */
  toArray(): E[];
  /**
   * Copies the elements in iteration order into `generator(size())` and returns that array.
   * @param generator - receives the element count and returns a plain or typed array of at least that length
   * @throws {@link IndexOutOfBoundsException} if the generated typed array is too short
   * @throws {@link NullPointerException} if `generator` or its result is `null`
   */
  toArray<A extends WritableArrayLike<E>>(generator: (length: number) => A): A;
  toArray<A extends WritableArrayLike<E>>(generator?: (length: number) => A): E[] | A {
    const out: E[] = [];
    const it = this.iterator();
    while (it.hasNext()) out.push(it.next());
    return arguments.length > 0 ? toArrayWith(out, generator as (length: number) => A) : out;
  }

  /**
   * Adds `e`; returns `true` if the collection changed. Not supported by default.
   * @throws {@link UnsupportedOperationException} unless a subclass overrides it
   */
  add(_e: E): boolean {
    throw new UnsupportedOperationException();
  }

  /**
   * Removes the first element equal to `o` through the iterator's `remove()`; returns `true` if one was removed.
   * @throws {@link UnsupportedOperationException} if the iterator does not support `remove()` and a match is found
   */
  remove(o: unknown): boolean {
    const it = this.iterator();
    while (it.hasNext()) {
      if (equals(o, it.next())) {
        it.remove();
        return true;
      }
    }
    return false;
  }

  /**
   * Returns `true` if this collection contains every element of `c` (calls `contains` for each).
   * @throws {@link NullPointerException} if `c` is `null`
   */
  containsAll(c: Collection<unknown>): boolean {
    requireNonNull(c);
    const it = c.iterator();
    while (it.hasNext()) if (!this.contains(it.next())) return false;
    return true;
  }

  /**
   * Calls `add` for each element of a snapshot of `c` (so `addAll(this)` terminates); returns `true` if any call
   * changed the collection.
   * @throws {@link NullPointerException} if `c` is `null`
   * @throws {@link UnsupportedOperationException} if `add` is not supported and `c` is not empty
   */
  addAll(c: Collection<E>): boolean {
    requireNonNull(c);
    let modified = false;
    // snapshot first so addAll(this) terminates
    for (const e of c.toArray()) if (this.add(e)) modified = true;
    return modified;
  }

  /**
   * Removes every element that `c` contains, through the iterator's `remove()`; returns `true` if any was removed.
   * @throws {@link NullPointerException} if `c` is `null`
   */
  removeAll(c: Collection<unknown>): boolean {
    requireNonNull(c);
    return this.removeIf((e) => c.contains(e));
  }

  /**
   * Removes every element that `c` does not contain, through the iterator's `remove()`; returns `true` if any was
   * removed.
   * @throws {@link NullPointerException} if `c` is `null`
   */
  retainAll(c: Collection<unknown>): boolean {
    requireNonNull(c);
    return this.removeIf((e) => !c.contains(e));
  }

  /**
   * Removes every element for which `filter` returns `true`, through the iterator's `remove()`; returns `true` if
   * any was removed.
   * @throws {@link NullPointerException} if `filter` is `null`
   */
  removeIf(filter: (e: E) => boolean): boolean {
    requireNonNull(filter);
    let removed = false;
    const it = this.iterator();
    while (it.hasNext()) {
      if (filter(it.next())) {
        it.remove();
        removed = true;
      }
    }
    return removed;
  }

  /**
   * Removes every element by walking the iterator and calling its `remove()`.
   * @throws {@link UnsupportedOperationException} if the iterator does not support `remove()` and the collection is not empty
   */
  clear(): void {
    const it = this.iterator();
    while (it.hasNext()) {
      it.next();
      it.remove();
    }
  }

  /**
   * Calls `action` for each element in iteration order.
   * @throws {@link NullPointerException} if `action` is `null`
   */
  forEach(action: (e: E) => void): void {
    requireNonNull(action);
    const it = this.iterator();
    while (it.hasNext()) action(it.next());
  }

  /** Makes the collection usable with `for..of` and spread; walks `iterator()`. */
  *[Symbol.iterator](): IterableIterator<E> {
    const it = this.iterator();
    while (it.hasNext()) yield it.next();
  }

  /** Late-binding SIZED|SUBSIZED spliterator over iterator(), splitting in batches; collections override with faster ones. */
  spliterator(): Spliterator<E> {
    return new IteratorSpliterator(this, null, -1, Spliterator.SIZED | Spliterator.SUBSIZED);
  }

  /** Returns a sequential stream over `spliterator()`. */
  stream(): Stream<E> {
    return streamFactories().stream(this.spliterator(), false);
  }

  /** Returns a stream over `spliterator()` flagged as parallel. */
  parallelStream(): Stream<E> {
    return streamFactories().stream(this.spliterator(), true);
  }

  /** Identity by default; List/Set/Map subclasses override with value equality. */
  equals(o: unknown): boolean {
    return this === o;
  }

  /** Identity hash by default, consistent with the identity `equals`. */
  hashCode(): number {
    return identityHashCode(this);
  }

  /** Node's `util.inspect` hook: `console.log` prints the `toString()` form. */
  [INSPECT](): string {
    return this.toString();
  }
  /** Returns `[e1, e2, ...]` in iteration order; an element that is this collection prints as `(this Collection)`. */
  toString(): string {
    const parts: string[] = [];
    const it = this.iterator();
    while (it.hasNext()) {
      const e = it.next();
      parts.push((e as unknown) === this ? '(this Collection)' : toString(e));
    }
    return `[${parts.join(', ')}]`;
  }
}
