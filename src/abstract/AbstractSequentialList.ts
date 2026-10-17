import { Collection } from '../interfaces/Collection';
import { Iterator, ListIterator } from '../interfaces/Iterator';
import { checkIndex, checkPositionIndex, requireNonNull } from '../util/Objects';
import { AbstractList } from './AbstractList';

/**
 * Skeleton of AbstractSequentialList for linked storage: positional
 * operations are built on listIterator(index), which subclasses must implement
 * (with set/add/remove support for a modifiable list, and modCount tracking).
 */
export abstract class AbstractSequentialList<E> extends AbstractList<E> {
  abstract override listIterator(index?: number): ListIterator<E>;

  get(index: number): E {
    checkIndex(index, this.size());
    return this.listIterator(index).next();
  }

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

  override iterator(): Iterator<E> {
    return this.listIterator();
  }
}
