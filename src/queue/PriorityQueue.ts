import { AbstractQueue } from '../abstract/AbstractQueue';
import {
  ConcurrentModificationException,
  IllegalArgumentException,
  IllegalStateException,
  NoSuchElementException,
  NullPointerException,
} from '../exceptions';
import { Collection } from '../interfaces/Collection';
import { Iterator } from '../interfaces/Iterator';
import { Spliterator } from '../stream/Spliterator';
import { OwnedArraySpliterator } from '../stream/Spliterators';
import { toArrayWith, WritableArrayLike } from '../util/arrays';
import { Comparator, naturalCompare } from '../util/Comparator';
import { equals, requireNonNull } from '../util/Objects';

/** a < b under naturalCompare, with numbers and strings compared inline. */
function natLess(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return a < b || (b !== b && a === a); // NaN is largest
  if (typeof a === 'string' && typeof b === 'string') return a < b;
  return naturalCompare(a, b) < 0;
}

function siftDownNat<E>(q: E[], k: number, x: E, n: number): void {
  const half = n >>> 1;
  while (k < half) {
    let c = 2 * k + 1;
    let cv = q[c];
    const r = c + 1;
    if (r < n) {
      const rv = q[r];
      if (natLess(rv, cv)) {
        c = r;
        cv = rv;
      }
    }
    if (!natLess(cv, x)) break;
    q[k] = cv;
    k = c;
  }
  q[k] = x;
}

/** siftDownNat for heaps known to hold only non-NaN numbers. */
function siftDownNum(q: number[], k: number, x: number, n: number): void {
  const half = n >>> 1;
  while (k < half) {
    let c = 2 * k + 1;
    let cv = q[c];
    const r = c + 1;
    if (r < n) {
      const rv = q[r];
      if (rv < cv) {
        c = r;
        cv = rv;
      }
    }
    if (cv >= x) break;
    q[k] = cv;
    k = c;
  }
  q[k] = x;
}

function siftDownCmp<E>(q: E[], k: number, x: E, n: number, cmp: Comparator<E>): void {
  const half = n >>> 1;
  while (k < half) {
    let c = 2 * k + 1;
    let cv = q[c];
    const r = c + 1;
    if (r < n) {
      const rv = q[r];
      if (cmp(rv, cv) < 0) {
        c = r;
        cv = rv;
      }
    }
    if (cmp(cv, x) >= 0) break;
    q[k] = cv;
    k = c;
  }
  q[k] = x;
}

/** Hole from slot k (already holding x or about to) moves up while x < parent. */
function siftUpFrom<E>(q: E[], k: number, x: E, cmp: Comparator<E> | null): void {
  if (cmp === null) {
    while (k > 0) {
      const p = (k - 1) >>> 1;
      const pv = q[p];
      if (!natLess(x, pv)) break;
      q[k] = pv;
      k = p;
    }
  } else {
    while (k > 0) {
      const p = (k - 1) >>> 1;
      const pv = q[p];
      if (cmp(x, pv) >= 0) break;
      q[k] = pv;
      k = p;
    }
  }
  q[k] = x;
}

function allNums(q: unknown[]): boolean {
  for (let i = 0; i < q.length; i++) {
    const x = q[i];
    if (typeof x !== 'number' || x !== x) return false;
  }
  return true;
}

function heapify<E>(q: E[], cmp: Comparator<E> | null): void {
  const n = q.length;
  if (cmp === null) {
    // a lone element is never compared, so check it explicitly
    if (n === 1) natLess(q[0], q[0]);
    for (let i = (n >>> 1) - 1; i >= 0; i--) siftDownNat(q, i, q[i], n);
  } else {
    for (let i = (n >>> 1) - 1; i >= 0; i--) siftDownCmp(q, i, q[i], n, cmp);
  }
}

function checkedCopy<E>(xs: readonly E[]): E[] {
  const q = xs.slice();
  for (let i = 0; i < q.length; i++) if (q[i] === null || q[i] === undefined) throw new NullPointerException();
  return q;
}

/**
 * Unbounded priority queue on a binary min-heap. The head is the least element by the
 * comparator (natural ordering when null). Iteration and toArray() follow heap order, not sorted order.
 * Rejects null and undefined.
 */
export class PriorityQueue<E> extends AbstractQueue<E> {
  /** @internal heap array; length is the size */
  queue: E[];
  /** @internal */
  modCount = 0;
  private readonly cmp: Comparator<E> | null;
  /** natural ordering and every element is a non-NaN number: sift with plain < */
  private nums: boolean;

  constructor();
  constructor(comparator: Comparator<E> | null);
  constructor(initialCapacity: number, comparator?: Comparator<E> | null);
  constructor(c: Collection<E>);
  constructor(a?: number | Comparator<E> | Collection<E> | null, b?: Comparator<E> | null) {
    super();
    if (typeof a === 'number') {
      if (!(a >= 1)) throw new IllegalArgumentException(`Illegal capacity: ${a}`);
      this.cmp = b ?? null;
      this.queue = [];
    } else if (typeof a === 'function' || a === null || a === undefined) {
      this.cmp = a ?? null;
      this.queue = [];
    } else if (a instanceof PriorityQueue) {
      this.cmp = a.cmp;
      this.queue = a.queue.slice();
    } else {
      const sorted = (a as { comparator?: unknown }).comparator;
      this.cmp = typeof sorted === 'function' ? (sorted.call(a) as Comparator<E> | null) ?? null : null;
      this.queue = checkedCopy(a.toArray());
      heapify(this.queue, this.cmp);
    }
    this.nums = this.cmp === null && allNums(this.queue);
  }

  static of<E>(...xs: E[]): PriorityQueue<E> {
    const pq = new PriorityQueue<E>();
    pq.queue = checkedCopy(xs);
    heapify(pq.queue, null);
    pq.nums = allNums(pq.queue);
    return pq;
  }

  comparator(): Comparator<E> | null {
    return this.cmp;
  }

  size(): number {
    return this.queue.length;
  }

  offer(e: E): boolean {
    if (e === null || e === undefined) throw new NullPointerException();
    const q = this.queue;
    const n = q.length;
    if (this.nums) {
      if (typeof e === 'number' && e === e) {
        // numbers can't throw, so sift in one pass; push first so the array grows via the fast path
        q.push(e);
        let k = n;
        while (k > 0) {
          const p = (k - 1) >>> 1;
          const pv = q[p] as unknown as number;
          if (e >= pv) break;
          q[k] = pv as unknown as E;
          k = p;
        }
        q[k] = e;
        this.modCount++;
        return true;
      }
      this.nums = false;
    }
    const cmp = this.cmp;
    // two passes: find the slot with compares only, then shift; a throwing compare leaves the heap untouched
    let k = n;
    if (cmp === null) {
      if (n === 0 && typeof e !== 'number' && typeof e !== 'string') naturalCompare(e, e);
      while (k > 0) {
        const p = (k - 1) >>> 1;
        if (!natLess(e, q[p])) break;
        k = p;
      }
    } else {
      while (k > 0) {
        const p = (k - 1) >>> 1;
        if (cmp(e, q[p]) >= 0) break;
        k = p;
      }
    }
    q.push(e);
    let i = n;
    while (i > k) {
      const p = (i - 1) >>> 1;
      q[i] = q[p];
      i = p;
    }
    q[k] = e;
    this.modCount++;
    return true;
  }

  // shortcut: a comparator that throws mid-poll/remove can leave the heap inconsistent; only offer() is transactional.
  poll(): E | null {
    const q = this.queue;
    const n = q.length;
    if (n === 0) return null;
    this.modCount++;
    const result = q[0];
    const x = q.pop() as E;
    if (n > 1) {
      const cmp = this.cmp;
      if (this.nums) siftDownNum(q as unknown as number[], 0, x as unknown as number, n - 1);
      else if (cmp === null) siftDownNat(q, 0, x, n - 1);
      else siftDownCmp(q, 0, x, n - 1, cmp);
    }
    return result;
  }

  peek(): E | null {
    const q = this.queue;
    return q.length === 0 ? null : q[0];
  }

  override remove(): E;
  override remove(o: unknown): boolean;
  override remove(o?: unknown): E | boolean {
    if (arguments.length === 0) return super.remove();
    const i = this.indexOf(o);
    if (i < 0) return false;
    this.removeAt(i);
    return true;
  }

  override contains(o: unknown): boolean {
    return this.indexOf(o) >= 0;
  }

  private indexOf(o: unknown): number {
    if (o === null || o === undefined) return -1;
    const q = this.queue;
    const n = q.length;
    if (typeof o === 'object' || typeof o === 'function') {
      for (let i = 0; i < n; i++) if (equals(o, q[i])) return i;
    } else if (o !== o) {
      for (let i = 0; i < n; i++) if (q[i] !== q[i]) return i;
    } else {
      for (let i = 0; i < n; i++) if ((q[i] as unknown) === o) return i;
    }
    return -1;
  }

  /**
   * @internal Removes slot i. Returns the former last element if it ended up before i
   * (an iterator at i would otherwise skip it), else null.
   */
  removeAt(i: number): E | null {
    const q = this.queue;
    this.modCount++;
    const s = q.length - 1;
    const moved = q.pop() as E;
    if (s === i) return null;
    const cmp = this.cmp;
    if (cmp === null) siftDownNat(q, i, moved, s);
    else siftDownCmp(q, i, moved, s, cmp);
    if (q[i] === moved) {
      siftUpFrom(q, i, moved, cmp);
      if (q[i] !== moved) return moved;
    }
    return null;
  }

  /** @internal identity removal, for iterator.remove() of a forgetMeNot element */
  removeEq(o: E): void {
    const q = this.queue;
    for (let i = 0; i < q.length; i++) {
      if (q[i] === o) {
        this.removeAt(i);
        return;
      }
    }
  }

  override clear(): void {
    this.modCount++;
    this.queue.length = 0;
    this.nums = this.cmp === null;
  }

  override toArray(): E[];
  override toArray<A extends WritableArrayLike<E>>(generator: (length: number) => A): A;
  override toArray<A extends WritableArrayLike<E>>(generator?: (length: number) => A): E[] | A {
    return arguments.length > 0 ? toArrayWith(this.queue, generator as (length: number) => A) : this.queue.slice();
  }

  override removeIf(filter: (e: E) => boolean): boolean {
    requireNonNull(filter);
    const q = this.queue;
    const n = q.length;
    const mc = this.modCount;
    // filter into a fresh array: a throwing or reentrant predicate sees the queue unchanged
    const kept: E[] = [];
    for (let i = 0; i < n; i++) {
      const e = q[i];
      const hit = filter(e);
      // stop at once: a modified heap may no longer hold n elements
      if (mc !== this.modCount) throw new ConcurrentModificationException();
      if (!hit) kept.push(e);
    }
    if (kept.length === n) return false;
    this.modCount++;
    heapify(kept, this.cmp);
    this.queue = kept;
    this.nums = this.cmp === null && allNums(kept);
    return true;
  }

  override forEach(action: (e: E) => void): void {
    requireNonNull(action);
    const q = this.queue;
    const mc = this.modCount;
    for (let i = 0; i < q.length; i++) {
      action(q[i]);
      if (mc !== this.modCount) throw new ConcurrentModificationException();
    }
  }

  iterator(): Iterator<E> {
    return new Itr(this);
  }

  /** SIZED|SUBSIZED|NONNULL, in heap order; late-binding, fail-fast, splits in halves. */
  override spliterator(): Spliterator<E> {
    return new OwnedArraySpliterator(this, () => this.queue, Spliterator.SIZED | Spliterator.SUBSIZED | Spliterator.NONNULL);
  }

  // plain object iterator: much faster than a generator in for..of
  override [Symbol.iterator](): Generator<E> {
    const pq = this;
    const mc = this.modCount;
    let i = 0;
    const it = {
      next(): IteratorResult<E> {
        if (pq.modCount !== mc) throw new ConcurrentModificationException();
        const q = pq.queue;
        return i < q.length ? { value: q[i++], done: false } : { value: undefined, done: true };
      },
      [Symbol.iterator]() {
        return it;
      },
    };
    return it as unknown as Generator<E>;
  }
}

class Itr<E> implements Iterator<E> {
  private cursor = 0;
  private lastRet = -1;
  private expectedModCount: number;
  /** elements moved from unvisited slots to before the cursor by remove() */
  private forgetMeNot: E[] | null = null;
  private fmnIndex = 0;
  private lastRetElt: E | null = null;

  constructor(private readonly pq: PriorityQueue<E>) {
    this.expectedModCount = pq.modCount;
  }

  hasNext(): boolean {
    return this.cursor < this.pq.queue.length || (this.forgetMeNot !== null && this.fmnIndex < this.forgetMeNot.length);
  }

  next(): E {
    const pq = this.pq;
    if (pq.modCount !== this.expectedModCount) throw new ConcurrentModificationException();
    if (this.cursor < pq.queue.length) return pq.queue[(this.lastRet = this.cursor++)];
    const fmn = this.forgetMeNot;
    if (fmn !== null && this.fmnIndex < fmn.length) {
      this.lastRet = -1;
      const e = fmn[this.fmnIndex];
      fmn[this.fmnIndex++] = undefined as unknown as E;
      return (this.lastRetElt = e);
    }
    throw new NoSuchElementException();
  }

  remove(): void {
    const pq = this.pq;
    if (pq.modCount !== this.expectedModCount) throw new ConcurrentModificationException();
    if (this.lastRet !== -1) {
      const moved = pq.removeAt(this.lastRet);
      this.lastRet = -1;
      if (moved === null) this.cursor--;
      else (this.forgetMeNot ??= []).push(moved);
    } else if (this.lastRetElt !== null) {
      pq.removeEq(this.lastRetElt);
      this.lastRetElt = null;
    } else {
      throw new IllegalStateException();
    }
    this.expectedModCount = pq.modCount;
  }

  forEachRemaining(action: (e: E) => void): void {
    requireNonNull(action);
    while (this.hasNext()) action(this.next());
  }
}
