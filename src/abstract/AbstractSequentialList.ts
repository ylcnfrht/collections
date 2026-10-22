import { Collection } from '../interfaces/Collection';
import { Iterator, ListIterator } from '../interfaces/Iterator';
import { checkIndex, checkPositionIndex, requireNonNull } from '../util/Objects';
import { AbstractList } from './AbstractList';

/**
 * Skeleton implementation of the `List` interface for sequential (linked) storage: positional operations
 * (`get`, `set`, `add(index, e)`, `removeAt`, `addAll(index, c)`) walk `listIterator(index)`, so each costs O(index).
 *
 * A subclass implements `listIterator(index)` and `size()`. For a modifiable list, the list iterator must support
 * `set`, `add` and `remove`; the class does its own `modCount` tracking in that iterator, incrementing `modCount`
 * on each structural change and throwing {@link ConcurrentModificationException} when it changes behind the
 * iterator. Do not add the {@link RandomAccess} brand.
 */
export abstract class AbstractSequentialList<E> extends AbstractList<E> {
  /**
   * Returns a list iterator starting at `index` (default 0). Subclasses implement it; every positional operation is
   * built on it.
   * @throws {@link IndexOutOfBoundsException} if `index < 0 || index > size()`
   */
  abstract override listIterator(index?: number): ListIterator<E>;

  /**
   * Returns the element at `index` by walking a list iterator; O(index).
   * @throws {@link IndexOutOfBoundsException} if `index < 0 || index >= size()`
   */
  get(index: number): E {
    checkIndex(index, this.size());
    return this.listIterator(index).next();
  }

  /**
   * Replaces the element at `index` through the list iterator's `set` and returns the old one.
   * @throws {@link IndexOutOfBoundsException} if `index < 0 || index >= size()`
   * @throws {@link UnsupportedOperationException} if the list iterator does not support `set`
   */
  override set(index: number, e: E): E {
    checkIndex(index, this.size());
    const it = this.listIterator(index);
    const old = it.next();
    it.set(e);
    return old;
  }

  protected override addAtIndex(index: number, e: E): void {
    checkPositionIndex(index, this.size());
    this.listIterator(index).add(e);
  }

  /**
   * Removes and returns the element at `index` through the list iterator's `remove`.
   * @throws {@link IndexOutOfBoundsException} if `index < 0 || index >= size()`
   * @throws {@link UnsupportedOperationException} if the list iterator does not support `remove`
   */
  override removeAt(index: number): E {
    checkIndex(index, this.size());
    const it = this.listIterator(index);
    const old = it.next();
    it.remove();
    return old;
  }

  protected override addAllAt(index: number, c: Collection<E>): boolean {
    checkPositionIndex(index, this.size());
    requireNonNull(c);
    const arr = c.toArray();
    const it = this.listIterator(index);
    for (const e of arr) it.add(e);
    return arr.length > 0;
  }

  /** Returns an iterator over the elements in order; it is `listIterator()`, so it fails fast the same way. */
  override iterator(): Iterator<E> {
    return this.listIterator();
  }
}
