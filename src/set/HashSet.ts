import { AbstractSet, requireCollection } from '../abstract/AbstractSet';
import { ConcurrentModificationException, IllegalArgumentException, IllegalStateException, NoSuchElementException } from '../exceptions';
import { Collection } from '../interfaces/Collection';
import { Iterator } from '../interfaces/Iterator';
import { Spliterator } from '../stream/Spliterator';
import { hashSpliterator } from '../stream/Spliterators';
import { checkCapacity, fitsIndexTable, isIndexKey, isPlainKey, jsIterator } from '../map/HashMap';
import { toArrayWith, WritableArrayLike } from '../util/arrays';
import { equals, hashCode, requireNonNull } from '../util/Objects';

/**
 * Hash table set. Elements are equal by Objects.equals; null/undefined allowed; order unspecified.
 * Same hybrid storage as HashMap: small non-negative integers as flags in a dense array, other
 * SameValueZero elements in a native Set, elements with equals()/hashCode() and Dates in hashCode
 * buckets (always arrays, so iterators can track them).
 */
export class HashSet<E> extends AbstractSet<E> {
  /** @internal ints[e] === 1 when index element e is present (0 or a hole otherwise) */
  ints: number[] = [];
  /** @internal */
  intCount = 0;
  /** @internal */
  readonly fast = new globalThis.Set<unknown>();
  /** @internal */
  readonly buckets = new globalThis.Map<number, E[]>();
  /** @internal */
  valueCount = 0;
  /** Structural modification count; iterators compare against it. */
  modCount = 0;

  constructor();
  constructor(initialCapacity: number, loadFactor?: number);
  constructor(c: Collection<E>);
  /** @throws IllegalArgumentException for a negative capacity, non-positive load factor, or an argument that is neither a number nor a collection */
  constructor(a?: number | Collection<E>, loadFactor?: number) {
    super();
    if (typeof a === 'number') checkCapacity(a, loadFactor);
    else if (a !== undefined) this.addAll(requireCollection<E>(a, 'a capacity or a Collection'));
  }

  /**
   * An empty HashSet sized for numElements. Capacity is only a hint here, so this just validates it.
   * @throws IllegalArgumentException if numElements is negative or NaN
   */
  static newHashSet<E>(numElements: number): HashSet<E> {
    if (!(numElements >= 0)) throw new IllegalArgumentException(`Negative number of elements: ${numElements}`);
    return new HashSet<E>();
  }

  static of<E>(...xs: E[]): HashSet<E> {
    const s = new HashSet<E>();
    for (const x of xs) s.add(x);
    return s;
  }

  clone(): HashSet<E> {
    const s = new HashSet<E>();
    s.ints = this.ints.slice();
    s.intCount = this.intCount;
    for (const e of this.fast) s.fast.add(e);
    for (const [h, b] of this.buckets) s.buckets.set(h, b.slice());
    s.valueCount = this.valueCount;
    return s;
  }

  size(): number {
    return this.intCount + this.fast.size + this.valueCount;
  }

  override isEmpty(): boolean {
    return this.intCount + this.fast.size + this.valueCount === 0;
  }

  override contains(o: unknown): boolean {
    if (isIndexKey(o)) return this.ints[o] === 1 || (this.fast.size !== 0 && this.fast.has(o));
    if (isPlainKey(o)) return this.fast.has(o);
    if (this.valueCount === 0) return false;
    const b = this.buckets.get(hashCode(o));
    if (b === undefined) return false;
    for (let i = 0; i < b.length; i++) if (equals(o, b[i])) return true;
    return false;
  }

  override add(e: E): boolean {
    if (isIndexKey(e)) {
      const ints = this.ints;
      if (ints[e] === 1 || (this.fast.size !== 0 && this.fast.has(e))) return false;
      if (fitsIndexTable(e, ints.length, this.intCount)) {
        ints[e] = 1;
        this.intCount++;
      } else this.fast.add(e);
      this.modCount++;
      return true;
    }
    if (isPlainKey(e)) {
      const s = this.fast.size;
      this.fast.add(e);
      if (this.fast.size === s) return false;
      this.modCount++;
      return true;
    }
    const h = hashCode(e);
    const b = this.buckets.get(h);
    if (b === undefined) this.buckets.set(h, [e]);
    else {
      for (let i = 0; i < b.length; i++) if (equals(e, b[i])) return false;
      b.push(e);
    }
    this.valueCount++;
    this.modCount++;
    return true;
  }

  override remove(o: unknown): boolean {
    if (isIndexKey(o) && this.ints[o] === 1) {
      this.removeIndex(o);
      return true;
    }
    if (isPlainKey(o)) {
      if (!this.fast.delete(o)) return false;
      this.modCount++;
      return true;
    }
    if (this.valueCount === 0) return false;
    const h = hashCode(o);
    const b = this.buckets.get(h);
    if (b === undefined) return false;
    for (let i = 0; i < b.length; i++) {
      if (equals(o, b[i])) {
        this.unlink(h, b, i);
        return true;
      }
    }
    return false;
  }

  /** @internal */
  unlink(h: number, b: E[], i: number): void {
    b.splice(i, 1);
    if (b.length === 0) this.buckets.delete(h);
    this.valueCount--;
    this.modCount++;
  }

  private removeIndex(i: number): void {
    const ints = this.ints;
    ints[i] = 0;
    // a fresh array frees memory; live iterators keep scanning the old (now empty) one
    if (--this.intCount === 0) this.ints = [];
    else if (ints.length >= 4 * this.intCount + 1024) {
      // below the ~25% fill that fitsIndexTable keeps on insert: drop the trailing holes (each is scanned once)
      let n = ints.length;
      while (ints[n - 1] !== 1) n--;
      if (n !== ints.length) ints.length = n;
    }
    this.modCount++;
  }

  /** @internal removes an index or plain element (iterator.remove) */
  removeExact(e: E): void {
    if (isIndexKey(e) && this.ints[e] === 1) this.removeIndex(e);
    else {
      this.fast.delete(e);
      this.modCount++;
    }
  }

  override clear(): void {
    this.ints = [];
    this.intCount = 0;
    this.fast.clear();
    this.buckets.clear();
    this.valueCount = 0;
    this.modCount++;
  }

  iterator(): Iterator<E> {
    return new HashSetIterator(this);
  }

  /** SIZED|DISTINCT (SIZED until split); late-binding, fail-fast. */
  override spliterator(): Spliterator<E> {
    return hashSpliterator(this, this, true);
  }

  // a plain iterator object is faster than a generator
  override [Symbol.iterator](): IterableIterator<E> {
    return jsIterator(new HashSetIterator(this));
  }

  override forEach(action: (e: E) => void): void {
    requireNonNull(action);
    const mc = this.modCount;
    if (this.intCount !== 0) {
      const ints = this.ints;
      for (let i = 0; i < ints.length; i++) {
        if (ints[i] !== 1) continue;
        action(i as unknown as E);
        if (mc !== this.modCount) throw new ConcurrentModificationException();
      }
    }
    for (const e of this.fast) {
      action(e as E);
      if (mc !== this.modCount) throw new ConcurrentModificationException();
    }
    if (this.valueCount === 0) return;
    for (const b of this.buckets.values()) {
      for (let i = 0; i < b.length; i++) {
        action(b[i]);
        if (mc !== this.modCount) throw new ConcurrentModificationException();
      }
    }
  }

  override toArray(): E[];
  override toArray<A extends WritableArrayLike<E>>(generator: (length: number) => A): A;
  override toArray<A extends WritableArrayLike<E>>(generator?: (length: number) => A): E[] | A {
    const out: E[] = [];
    if (this.intCount !== 0) {
      const ints = this.ints;
      for (let i = 0; i < ints.length; i++) if (ints[i] === 1) out.push(i as unknown as E);
    }
    for (const e of this.fast) out.push(e as E);
    if (this.valueCount !== 0) for (const b of this.buckets.values()) for (let i = 0; i < b.length; i++) out.push(b[i]);
    return arguments.length > 0 ? toArrayWith(out, generator as (length: number) => A) : out;
  }

  override removeIf(filter: (e: E) => boolean): boolean {
    requireNonNull(filter);
    let mc = this.modCount;
    const start = mc;
    if (this.intCount !== 0) {
      const ints = this.ints;
      for (let i = 0; i < ints.length; i++) {
        if (ints[i] !== 1) continue;
        const hit = filter(i as unknown as E);
        if (mc !== this.modCount) throw new ConcurrentModificationException();
        if (hit) {
          this.removeIndex(i);
          mc = this.modCount;
        }
      }
    }
    for (const e of this.fast) {
      // deleting the current entry is safe during native Set iteration
      if (filter(e as E)) {
        if (mc !== this.modCount) throw new ConcurrentModificationException();
        this.fast.delete(e);
        mc = ++this.modCount;
      } else if (mc !== this.modCount) throw new ConcurrentModificationException();
    }
    if (this.valueCount !== 0) {
      for (const [h, b] of this.buckets) {
        for (let i = 0; i < b.length; ) {
          const hit = filter(b[i]);
          if (mc !== this.modCount) throw new ConcurrentModificationException();
          if (hit) {
            this.unlink(h, b, i);
            mc = this.modCount;
          } else i++;
        }
      }
    }
    return mc !== start;
  }
}

/** Fail-fast cursor: the native Set first, then the bucket arrays. */
class HashSetIterator<E> implements Iterator<E> {
  private ints: number[] | null;
  private ii = 0;
  private fastIt: IterableIterator<unknown> | null;
  private bucketIt: IterableIterator<[number, E[]]> | null = null;
  private arr: E[] | null = null;
  private h = 0;
  private ai = 0;
  private remaining: number;
  private canRemove = false;
  private last: E | undefined;
  private expected: number;

  constructor(private readonly set: HashSet<E>) {
    this.ints = set.intCount === 0 ? null : set.ints;
    this.fastIt = set.fast.values();
    this.remaining = set.size();
    this.expected = set.modCount;
  }

  hasNext(): boolean {
    return this.remaining > 0;
  }

  next(): E {
    if (this.set.modCount !== this.expected) throw new ConcurrentModificationException();
    if (this.remaining <= 0) throw new NoSuchElementException();
    this.remaining--;
    this.canRemove = true;
    const ints = this.ints;
    if (ints !== null) {
      while (this.ii < ints.length) {
        const i = this.ii++;
        if (ints[i] === 1) return (this.last = i as unknown as E);
      }
      this.ints = null;
    }
    if (this.fastIt !== null) {
      const r = this.fastIt.next();
      if (!r.done) return (this.last = r.value as E);
      this.fastIt = null;
      this.bucketIt = this.set.buckets.entries();
    }
    for (;;) {
      const arr = this.arr;
      if (arr !== null && this.ai < arr.length) return (this.last = arr[this.ai++]);
      const r = this.bucketIt!.next();
      if (r.done) throw new ConcurrentModificationException();
      [this.h, this.arr] = r.value;
      this.ai = 0;
    }
  }

  remove(): void {
    if (!this.canRemove) throw new IllegalStateException();
    if (this.set.modCount !== this.expected) throw new ConcurrentModificationException();
    this.canRemove = false;
    // a bucket element is unlinked by position, not rehashed: it may have mutated since insertion
    if (this.arr !== null) this.set.unlink(this.h, this.arr, --this.ai);
    else this.set.removeExact(this.last as E);
    this.expected = this.set.modCount;
  }

  forEachRemaining(action: (e: E) => void): void {
    requireNonNull(action);
    while (this.remaining > 0) action(this.next());
  }
}
