import { AbstractList } from '../abstract/AbstractList';
import {
  ConcurrentModificationException,
  IllegalArgumentException,
  IllegalStateException,
  IndexOutOfBoundsException,
  NoSuchElementException,
} from '../exceptions';
import { Collection } from '../interfaces/Collection';
import { Iterator, ListIterator } from '../interfaces/Iterator';
import { Comparator, naturalCompare, stableSort } from '../util/Comparator';
import { isList, RANDOM_ACCESS } from '../util/guards';
import { checkPositionIndex, equals, hashCode, requireNonNull, toString } from '../util/Objects';

// Kept out of line so the hot accessors stay small enough to inline.
function outOfBounds(index: number, length: number): never {
  throw new IndexOutOfBoundsException(`Index ${index} out of bounds for length ${length}`);
}

// Same order as naturalCompare for numbers (NaN last, -0 == +0), without its type dispatch.
function compareNumbers(a: number, b: number): number {
  if (a < b) return -1;
  if (a > b) return 1;
  const an = a !== a;
  return an === (b !== b) ? 0 : an ? 1 : -1;
}

/**
 * Resizable list backed by a dense native array. Never contains holes: every index in
 * [0, size) holds a value, so V8 keeps the backing store in a packed elements kind.
 */
export class ArrayList<E> extends AbstractList<E> {
  /** @internal Backing array; never reassigned, so iterators may cache it. */
  readonly es: E[];

  constructor();
  /** initialCapacity is only a hint: preallocating would create holes. */
  constructor(initialCapacity: number);
  constructor(c: Collection<E>);
  constructor(arg?: number | Collection<E>) {
    super();
    if (arguments.length === 0 || typeof arg === 'number') {
      if (typeof arg === 'number' && !(arg >= 0)) throw new IllegalArgumentException(`Illegal Capacity: ${arg}`);
      this.es = [];
    } else {
      requireNonNull(arg);
      this.es = arg instanceof ArrayList ? (arg.es.slice() as E[]) : dense((arg as Collection<E>).toArray());
    }
  }

  static of<E>(...xs: E[]): ArrayList<E> {
    const l = new this<E>();
    const a = l.es;
    for (let i = 0; i < xs.length; i++) a.push(xs[i]);
    return l;
  }

  get [RANDOM_ACCESS](): true {
    return true;
  }

  /** Capacity hint; the native array manages its own storage. */
  ensureCapacity(_minCapacity: number): void {}

  trimToSize(): void {}

  /** Shallow, independent copy of the same class. */
  clone(): this {
    return new (this.constructor as new (c: Collection<E>) => this)(this);
  }

  size(): number {
    return this.es.length;
  }

  override isEmpty(): boolean {
    return this.es.length === 0;
  }

  get(index: number): E {
    const a = this.es;
    // (index >>> 0) === index rejects negatives, fractions and NaN in one compare
    if ((index >>> 0) !== index || index >= a.length) outOfBounds(index, a.length);
    return a[index];
  }

  override set(index: number, e: E): E {
    const a = this.es;
    if ((index >>> 0) !== index || index >= a.length) outOfBounds(index, a.length);
    const old = a[index];
    a[index] = e;
    return old;
  }

  // same arguments.length dispatch as AbstractList.add, inlined so append is a bare push
  override add(e: E): boolean;
  override add(index: number, e: E): void;
  override add(a: E | number, b?: E): boolean | void {
    if (arguments.length >= 2) {
      this.addAtIndex(a as number, b as E);
      return;
    }
    this.es.push(a as E);
    this.modCount++;
    return true;
  }

  protected override addAtIndex(index: number, e: E): void {
    const a = this.es;
    const n = a.length;
    if (index === n) a.push(e);
    else if (index === 0) a.unshift(e);
    else a.splice(checkPositionIndex(index, n), 0, e);
    this.modCount++;
  }

  override removeAt(index: number): E {
    const a = this.es;
    const n = a.length;
    if ((index >>> 0) !== index || index >= n) outOfBounds(index, n);
    this.modCount++;
    if (index === n - 1) return a.pop() as E;
    if (index === 0) return a.shift() as E;
    const old = a[index];
    a.splice(index, 1);
    return old;
  }

  override remove(o: unknown): boolean {
    const i = this.indexOf(o);
    if (i < 0) return false;
    this.removeAt(i);
    return true;
  }

  override contains(o: unknown): boolean {
    return this.indexOf(o) >= 0;
  }

  override indexOf(o: unknown): number {
    const a = this.es;
    if (o === null || (typeof o !== 'object' && typeof o !== 'function')) {
      // equals(primitive, x) is === except NaN equals NaN
      if (o === o) return a.indexOf(o as E);
      for (let i = 0, n = a.length; i < n; i++) if (a[i] !== a[i]) return i;
      return -1;
    }
    const eq = (o as { equals?: unknown }).equals;
    if (typeof eq !== 'function' || o instanceof Date) {
      if (!(o instanceof Date)) return a.indexOf(o as E);
      for (let i = 0, n = a.length; i < n; i++) if (equals(o, a[i])) return i;
      return -1;
    }
    // hoisted Objects.equals(o, x) for an object with equals(): identity, null guard, then eq.call
    for (let i = 0, n = a.length; i < n; i++) {
      const x = a[i];
      if (x === o || (x != null && eq.call(o, x) === true)) return i;
    }
    return -1;
  }

  override lastIndexOf(o: unknown): number {
    const a = this.es;
    if (o === null || (typeof o !== 'object' && typeof o !== 'function')) {
      if (o === o) return a.lastIndexOf(o as E);
      for (let i = a.length - 1; i >= 0; i--) if (a[i] !== a[i]) return i;
      return -1;
    }
    const eq = (o as { equals?: unknown }).equals;
    if (typeof eq !== 'function' || o instanceof Date) {
      if (!(o instanceof Date)) return a.lastIndexOf(o as E);
      for (let i = a.length - 1; i >= 0; i--) if (equals(o, a[i])) return i;
      return -1;
    }
    for (let i = a.length - 1; i >= 0; i--) {
      const x = a[i];
      if (x === o || (x != null && eq.call(o, x) === true)) return i;
    }
    return -1;
  }

  override toArray(): E[] {
    return this.es.slice();
  }

  override clear(): void {
    this.modCount++;
    this.es.length = 0;
  }

  override forEach(action: (e: E) => void): void {
    requireNonNull(action);
    forEachImpl(this, this.es, action);
  }

  protected override addAllAt(index: number, c: Collection<E>): boolean {
    const a = this.es;
    const n = a.length;
    checkPositionIndex(index, n);
    requireNonNull(c);
    const src = c instanceof ArrayList ? (c.es as E[]) : c.toArray();
    const m = src.length;
    this.modCount++;
    if (m === 0) return false;
    if (index === n) {
      for (let i = 0; i < m; i++) a.push(src[i]);
      return true;
    }
    // src may be this.es (addAll(this)), so snapshot the inserted part before shifting
    const ins = src === a ? src.slice() : src;
    // grow with real values first so no hole is ever created, then shift the tail and fill the gap
    for (let i = 0; i < m; i++) a.push(ins[i]);
    for (let i = n - 1; i >= index; i--) a[i + m] = a[i];
    for (let i = 0; i < m; i++) a[index + i] = ins[i];
    return true;
  }

  override removeRange(fromIndex: number, toIndex: number): void {
    const n = this.es.length;
    if (fromIndex < 0 || toIndex > n || fromIndex > toIndex) {
      throw new IndexOutOfBoundsException(`From Index: ${fromIndex} To Index: ${toIndex}, Size: ${n}`);
    }
    if (fromIndex === toIndex) return;
    this.modCount++;
    if (toIndex === n) this.es.length = fromIndex;
    else this.es.splice(fromIndex, toIndex - fromIndex);
  }

  override removeIf(filter: (e: E) => boolean): boolean {
    requireNonNull(filter);
    const a = this.es;
    const n = a.length;
    const mc = this.modCount;
    let i = 0;
    while (i < n && !filter(a[i])) i++;
    if (this.modCount !== mc) throw new ConcurrentModificationException();
    if (i === n) return false;
    let w = i++;
    try {
      // single compaction pass: survivors slide left over removed slots
      for (; i < n; i++) {
        const x = a[i];
        if (!filter(x)) a[w++] = x;
      }
    } finally {
      // a throwing or mutating predicate keeps the untested tail, so nothing is lost or duplicated
      for (const m = a.length; i < m; i++) a[w++] = a[i];
      a.length = w;
    }
    if (this.modCount++ !== mc) throw new ConcurrentModificationException();
    return true;
  }

  override replaceAll(operator: (e: E) => E): void {
    requireNonNull(operator);
    const a = this.es;
    const mc = this.modCount;
    const n = a.length;
    for (let i = 0; i < n && a.length === n; i++) a[i] = operator(a[i]);
    if (this.modCount !== mc) throw new ConcurrentModificationException();
  }

  override sort(c: Comparator<E> | null = null): void {
    const a = this.es;
    const mc = this.modCount;
    if (a.length > 1) {
      // Array.prototype.sort is stable but never passes undefined to the comparator
      if (a.includes(undefined as E)) stableSort(a, c);
      else if (c) a.sort(c);
      else sortNatural(a);
    }
    if (this.modCount !== mc) throw new ConcurrentModificationException();
    this.modCount++;
  }

  override getFirst(): E {
    if (this.es.length === 0) throw new NoSuchElementException();
    return this.es[0];
  }

  override getLast(): E {
    const a = this.es;
    if (a.length === 0) throw new NoSuchElementException();
    return a[a.length - 1];
  }

  override iterator(): Iterator<E> {
    return new ArrayListItr(this, 0);
  }

  override listIterator(index = 0): ListIterator<E> {
    checkPositionIndex(index, this.es.length);
    return new ArrayListItr(this, index);
  }

  // typed as Generator only to match the base signature; it is a plain next()-only iterator
  override [Symbol.iterator](): Generator<E> {
    return new ArrayListJsItr(this) as unknown as Generator<E>;
  }

  override equals(o: unknown): boolean {
    if (o === this) return true;
    if (!isList(o)) return false;
    const a = this.es;
    const n = a.length;
    if (o instanceof ArrayList) {
      const b = o.es;
      if (b.length !== n) return false;
      for (let i = 0; i < n; i++) {
        const x = a[i];
        const y = b[i];
        if (x !== y && !equals(x, y)) return false;
      }
      return true;
    }
    const it = o.iterator();
    for (let i = 0; i < n; i++) {
      if (!it.hasNext()) return false;
      const x = a[i];
      const y = it.next();
      if (x !== y && !equals(x, y)) return false;
    }
    return !it.hasNext();
  }

  override hashCode(): number {
    const a = this.es;
    let h = 1;
    for (let i = 0, n = a.length; i < n; i++) {
      const e = a[i];
      h = (Math.imul(31, h) + ((e as unknown) === this ? 0 : hashCode(e))) | 0;
    }
    return h;
  }

  override toString(): string {
    const a = this.es;
    let s = '[';
    for (let i = 0, n = a.length; i < n; i++) {
      if (i > 0) s += ', ';
      const e = a[i];
      s += (e as unknown) === this ? '(this Collection)' : toString(e);
    }
    return s + ']';
  }
}

// per-step size check is far cheaper than re-reading modCount after each opaque call; modCount is checked once at the end
function forEachImpl<E>(list: ArrayList<E>, a: E[], action: (e: E) => void): void {
  const mc = list.modCount;
  const n = a.length;
  for (let i = 0; i < n && a.length === n; i++) action(a[i]);
  if (list.modCount !== mc) throw new ConcurrentModificationException();
}

/** Copies into a fresh packed array; holes from a foreign toArray() become undefined. */
function dense<E>(src: E[]): E[] {
  const out: E[] = [];
  for (let i = 0; i < src.length; i++) out.push(src[i]);
  return out;
}

function sortNatural<E>(a: E[]): void {
  let allNum = true;
  let allStr = true;
  for (let i = 0; i < a.length && (allNum || allStr); i++) {
    const t = typeof a[i];
    if (t !== 'number') allNum = false;
    if (t !== 'string') allStr = false;
  }
  // default sort compares strings by UTF-16 code units, exactly like naturalCompare
  if (allStr) a.sort();
  else if (allNum) (a as unknown as number[]).sort(compareNumbers);
  else a.sort(naturalCompare);
}

/** Fail-fast ListIterator reading the backing array directly. */
class ArrayListItr<E> implements ListIterator<E> {
  private readonly a: E[];
  private cursor: number;
  private lastRet = -1;
  private expectedModCount: number;

  constructor(private readonly list: ArrayList<E>, index: number) {
    this.a = list.es;
    this.cursor = index;
    this.expectedModCount = list.modCount;
  }

  hasNext(): boolean {
    return this.cursor !== this.a.length;
  }

  next(): E {
    if (this.list.modCount !== this.expectedModCount) throw new ConcurrentModificationException();
    const i = this.cursor;
    if (i >= this.a.length) throw new NoSuchElementException();
    this.cursor = i + 1;
    return this.a[(this.lastRet = i)];
  }

  hasPrevious(): boolean {
    return this.cursor !== 0;
  }

  previous(): E {
    if (this.list.modCount !== this.expectedModCount) throw new ConcurrentModificationException();
    const i = this.cursor - 1;
    if (i < 0) throw new NoSuchElementException();
    if (i >= this.a.length) throw new ConcurrentModificationException();
    this.cursor = this.lastRet = i;
    return this.a[i];
  }

  nextIndex(): number {
    return this.cursor;
  }

  previousIndex(): number {
    return this.cursor - 1;
  }

  remove(): void {
    if (this.lastRet < 0) throw new IllegalStateException();
    if (this.list.modCount !== this.expectedModCount) throw new ConcurrentModificationException();
    this.list.removeAt(this.lastRet);
    this.cursor = this.lastRet;
    this.lastRet = -1;
    this.expectedModCount = this.list.modCount;
  }

  set(e: E): void {
    if (this.lastRet < 0) throw new IllegalStateException();
    if (this.list.modCount !== this.expectedModCount) throw new ConcurrentModificationException();
    this.list.set(this.lastRet, e);
  }

  add(e: E): void {
    if (this.list.modCount !== this.expectedModCount) throw new ConcurrentModificationException();
    this.list.add(this.cursor++, e);
    this.lastRet = -1;
    this.expectedModCount = this.list.modCount;
  }

  forEachRemaining(action: (e: E) => void): void {
    requireNonNull(action);
    const a = this.a;
    const mc = this.expectedModCount;
    let i = this.cursor;
    for (const n = a.length; i < n && this.list.modCount === mc; i++) action(a[i]);
    this.cursor = i;
    this.lastRet = i - 1;
    if (this.list.modCount !== mc) throw new ConcurrentModificationException();
  }
}

/** JS-protocol iterator: a plain class (not a generator) so for..of can inline next(). */
class ArrayListJsItr<E> {
  private readonly a: E[];
  private i = 0;
  private readonly n: number;
  private readonly mc: number;

  constructor(private readonly list: ArrayList<E>) {
    this.a = list.es;
    this.n = list.es.length;
    this.mc = list.modCount;
  }

  next(): IteratorResult<E> {
    const a = this.a;
    const i = this.i;
    // a size change fails fast at once; same-size changes are caught by the modCount check at the end
    if (a.length !== this.n) throw new ConcurrentModificationException();
    if (i < a.length) {
      this.i = i + 1;
      return { value: a[i], done: false };
    }
    if (this.list.modCount !== this.mc) throw new ConcurrentModificationException();
    return { value: undefined, done: true };
  }

  [Symbol.iterator](): this {
    return this;
  }
}
