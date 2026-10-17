import { UnsupportedOperationException } from '../exceptions';
import { Collection } from '../interfaces/Collection';
import { Iterator } from '../interfaces/Iterator';
import { equals, identityHashCode, requireNonNull, toString } from '../util/Objects';

/**
 * Skeleton of AbstractCollection: everything is built on iterator() and size().
 * Subclasses own their storage; a modifiable collection overrides add() and returns an
 * iterator that supports remove().
 */
export abstract class AbstractCollection<E> implements Collection<E> {
  abstract iterator(): Iterator<E>;
  abstract size(): number;

  isEmpty(): boolean {
    return this.size() === 0;
  }

  contains(o: unknown): boolean {
    const it = this.iterator();
    while (it.hasNext()) if (equals(o, it.next())) return true;
    return false;
  }

  toArray(): E[] {
    const out: E[] = [];
    const it = this.iterator();
    while (it.hasNext()) out.push(it.next());
    return out;
  }

  add(_e: E): boolean {
    throw new UnsupportedOperationException();
  }

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

  containsAll(c: Collection<unknown>): boolean {
    requireNonNull(c);
    const it = c.iterator();
    while (it.hasNext()) if (!this.contains(it.next())) return false;
    return true;
  }

  addAll(c: Collection<E>): boolean {
    requireNonNull(c);
    let modified = false;
    // snapshot first so addAll(this) terminates
    for (const e of c.toArray()) if (this.add(e)) modified = true;
    return modified;
  }

  removeAll(c: Collection<unknown>): boolean {
    requireNonNull(c);
    return this.removeIf((e) => c.contains(e));
  }

  retainAll(c: Collection<unknown>): boolean {
    requireNonNull(c);
    return this.removeIf((e) => !c.contains(e));
  }

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

  clear(): void {
    const it = this.iterator();
    while (it.hasNext()) {
      it.next();
      it.remove();
    }
  }

  forEach(action: (e: E) => void): void {
    requireNonNull(action);
    const it = this.iterator();
    while (it.hasNext()) action(it.next());
  }

  *[Symbol.iterator](): Generator<E> {
    const it = this.iterator();
    while (it.hasNext()) yield it.next();
  }

  /** Identity by default; List/Set/Map subclasses override with value equality. */
  equals(o: unknown): boolean {
    return this === o;
  }

  hashCode(): number {
    return identityHashCode(this);
  }

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
