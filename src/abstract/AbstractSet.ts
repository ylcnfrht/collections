import { IllegalArgumentException } from '../exceptions';
import { Collection } from '../interfaces/Collection';
import { Set } from '../interfaces/Set';
import { SET_BRAND, isSet } from '../util/guards';
import { hashCode, requireNonNull } from '../util/Objects';
import { Spliterator } from '../stream/Spliterator';
import { IteratorSpliterator } from '../stream/Spliterators';
import { AbstractCollection } from './AbstractCollection';

/** Skeleton of AbstractSet: value equality with any Set, hashCode = sum of element hashes. */
export abstract class AbstractSet<E> extends AbstractCollection<E> implements Set<E> {
  get [SET_BRAND](): true {
    return true;
  }

  override equals(o: unknown): boolean {
    if (o === this) return true;
    if (!isSet(o) || o.size() !== this.size()) return false;
    try {
      return this.containsAll(o);
    } catch (e) {
      // a sorted set may reject foreign element types; that counts as "not equal"
      if ((e as Error)?.name === 'ClassCastException' || (e as Error)?.name === 'NullPointerException') return false;
      throw e;
    }
  }

  /**
   * Removes every element also in c. Walks the smaller side, sized by size():
   * when this set is larger, iterates c and calls this.remove(e) for each element (so this set's
   * equality decides, and remove(null) may throw NullPointerException);
   * otherwise iterates this set, removing (iterator.remove, via removeIf) each element c.contains().
   * @throws NullPointerException if c is null, or this set contains null and c does not permit null
   */
  override removeAll(c: Collection<unknown>): boolean {
    requireNonNull(c);
    if (this.size() > c.size()) {
      let modified = false;
      const it = c.iterator();
      while (it.hasNext()) if (this.remove(it.next())) modified = true;
      return modified;
    }
    return this.removeIf((e) => c.contains(e));
  }

  /** Late-binding DISTINCT|SIZED|SUBSIZED spliterator over iterator(). */
  override spliterator(): Spliterator<E> {
    return new IteratorSpliterator(this, null, -1, Spliterator.DISTINCT | Spliterator.SIZED | Spliterator.SUBSIZED);
  }

  override hashCode(): number {
    let h = 0;
    const it = this.iterator();
    while (it.hasNext()) h = (h + hashCode(it.next())) | 0;
    return h;
  }
}

/** Constructor guard: a copy-constructor argument must be a collection (anything with toArray()). @internal */
export function requireCollection<E>(c: unknown, what: string): Collection<E> {
  if (typeof (requireNonNull(c) as { toArray?: unknown }).toArray !== 'function') {
    throw new IllegalArgumentException(`expected ${what}`);
  }
  return c as Collection<E>;
}
