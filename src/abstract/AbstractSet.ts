import { Set } from '../interfaces/Set';
import { SET_BRAND, isSet } from '../util/guards';
import { hashCode } from '../util/Objects';
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

  override hashCode(): number {
    let h = 0;
    const it = this.iterator();
    while (it.hasNext()) h = (h + hashCode(it.next())) | 0;
    return h;
  }
}
