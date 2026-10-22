import { AbstractList, removeRangeCheck } from '../abstract/AbstractList';
import {
  ConcurrentModificationException,
  IllegalArgumentException,
  IllegalStateException,
  IndexOutOfBoundsException,
  NoSuchElementException,
} from '../exceptions';
import { Collection } from '../interfaces/Collection';
import { Iterator, ListIterator } from '../interfaces/Iterator';
import { Spliterator } from '../stream/Spliterator';
import { OwnedArraySpliterator } from '../stream/Spliterators';
import { toArrayWith, WritableArrayLike } from '../util/arrays';
import { Comparator, compareNumbers, naturalCompare, stableSort } from '../util/Comparator';
import { isList, RANDOM_ACCESS } from '../util/guards';
import { checkPositionIndex, equals, hashCode, requireNonNull, toString } from '../util/Objects';

// Kept out of line so the hot accessors stay small enough to inline.
function outOfBounds(index: number, length: number): never {
  throw new IndexOutOfBoundsException(`Index ${index} out of bounds for length ${length}`);
}

/**
 * Resizable list backed by a dense native array; the default {@link List} implementation.
 *
 * `get` and `set` are O(1), appending is amortized O(1), and inserting or removing at index `i`
 * is O(n − i) because the tail shifts (so `addFirst`/`removeFirst` are O(n)). `contains`, `indexOf`
 * and `remove(o)` are O(n) scans; `sort` is a stable O(n log n). Permits `null` and `undefined`
 * elements. Iterates in index order; iterators, `forEach` and views are fail-fast, and `sort`
 * and `replaceAll` count as structural changes (`set` does not).
 *
 * The backing array never contains holes: every index in [0, size) holds a value, so the engine
 * keeps it in a packed elements kind.
 */
export class ArrayList<E> extends AbstractList<E> {
  /** @internal Backing array; never reassigned, so iterators may cache it. */
  readonly es: E[];

  /** Creates an empty list. */
  constructor();
  /**
   * Creates an empty list. `initialCapacity` is validated but only a hint: nothing is
   * preallocated, since preallocating would create holes in the backing array.
   * @param initialCapacity - expected number of elements
   * @throws {@link IllegalArgumentException} if `initialCapacity` is negative or not an integer
   */
  constructor(initialCapacity: number);
  /**
   * Creates a list holding the elements of `c`, in its iteration order. O(n).
   * @throws {@link NullPointerException} if `c` is `null` or `undefined`
   */
  constructor(c: Collection<E>);
  constructor(arg?: number | Collection<E>) {
    super();
    if (arguments.length === 0 || typeof arg === 'number') {
      if (typeof arg === 'number' && !(Number.isInteger(arg) && arg >= 0)) throw new IllegalArgumentException(`Illegal Capacity: ${arg}`);
      this.es = [];
    } else {
      requireNonNull(arg);
      this.es = arg instanceof ArrayList ? (arg.es.slice() as E[]) : dense((arg as Collection<E>).toArray());
    }
  }

  /**
   * Creates a mutable list holding `xs` in argument order. Unlike `List.of`, the result is
   * modifiable and may hold `null` and `undefined`. Called on a subclass, returns an instance of it.
   */
  static of<E>(...xs: E[]): ArrayList<E> {
    const l = new this<E>();
    const a = l.es;
    for (let i = 0; i < xs.length; i++) a.push(xs[i]);
    return l;
  }

  /** @internal as the reference's ArrayList: a sublist of a stale sublist is stale too */
  override nestedSubListsInheritStaleness(): boolean {
    return true;
  }

  /** Marker for O(1) positional access; always `true`. */
  get [RANDOM_ACCESS](): true {
    return true;
  }

  /**
   * Does nothing: capacity is only a hint, and the native array manages its own storage.
   * Kept for API compatibility; the argument is not validated.
   */
  ensureCapacity(_minCapacity: number): void {}

  /**
   * Does not change storage (the native array manages it), but counts as a structural change,
   * so open iterators fail fast afterwards.
   */
  trimToSize(): void {
    this.modCount++;
  }

  /** Returns a shallow, independent copy of the same runtime class, in O(n). */
  clone(): this {
    return new (this.constructor as new (c: Collection<E>) => this)(this);
  }

  /** Returns the number of elements. O(1). */
  size(): number {
    return this.es.length;
  }

  /** Returns `true` if this list has no elements. O(1). */
  override isEmpty(): boolean {
    return this.es.length === 0;
  }

  /**
   * Returns the element at `index`. O(1).
   * @throws {@link IndexOutOfBoundsException} if `index` < 0 or `index` >= `size()`
   */
  get(index: number): E {
    const a = this.es;
    // (index >>> 0) === index rejects negatives, fractions and NaN in one compare
    if ((index >>> 0) !== index || index >= a.length) outOfBounds(index, a.length);
    return a[index];
  }

  /**
   * Replaces the element at `index` with `e`. O(1); not a structural change, so open iterators stay valid.
   * @returns the element previously at `index`
   * @throws {@link IndexOutOfBoundsException} if `index` < 0 or `index` >= `size()`
   */
  override set(index: number, e: E): E {
    const a = this.es;
    if ((index >>> 0) !== index || index >= a.length) outOfBounds(index, a.length);
    const old = a[index];
    a[index] = e;
    return old;
  }

  // same arguments.length dispatch as AbstractList.add, inlined so append is a bare push
  /**
   * Appends `e` to the end of this list, in amortized O(1). `null` and `undefined` are allowed.
   * @returns always `true`
   */
  override add(e: E): boolean;
  /**
   * Inserts `e` at `index`, shifting the element there and all later ones one position to the right.
   * O(n − index).
   * @throws {@link IndexOutOfBoundsException} if `index` < 0 or `index` > `size()`
   */
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

  /**
   * Removes the element at `index`, shifting later elements one position to the left.
   * O(n − index); O(1) for the last element.
   * @returns the removed element
   * @throws {@link IndexOutOfBoundsException} if `index` < 0 or `index` >= `size()`
   */
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

  /**
   * Removes the first element equal to `o` (by `Objects.equals`), if present. O(n): a linear scan,
   * then a shift of the tail.
   * @returns `true` if an element was removed
   */
  override remove(o: unknown): boolean {
    const i = this.indexOf(o);
    if (i < 0) return false;
    this.removeAt(i);
    return true;
  }

  /** Returns `true` if this list contains an element equal to `o` (by `Objects.equals`). O(n) scan; `null` is allowed. */
  override contains(o: unknown): boolean {
    return this.indexOf(o) >= 0;
  }

  /**
   * Returns the index of the first element equal to `o` (by `Objects.equals`), or -1 if there is none.
   * O(n) scan from the front; `NaN` matches `NaN`.
   */
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

  /**
   * Returns the index of the last element equal to `o` (by `Objects.equals`), or -1 if there is none.
   * O(n) scan from the back; `NaN` matches `NaN`.
   */
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

  /** Returns a new array with all elements, in index order. Changing the array does not affect this list. O(n). */
  override toArray(): E[];
  /**
   * Fills an array created by `generator(size())` with the elements in index order, and returns it. O(n).
   * @param generator - creates the target array for a given length
   */
  override toArray<A extends WritableArrayLike<E>>(generator: (length: number) => A): A;
  override toArray<A extends WritableArrayLike<E>>(generator?: (length: number) => A): E[] | A {
    return arguments.length > 0 ? toArrayWith(this.es, generator as (length: number) => A) : this.es.slice();
  }

  /** Removes all elements. Truncates the backing array, so no references to the removed elements are kept. */
  override clear(): void {
    this.modCount++;
    this.es.length = 0;
  }

  /**
   * Calls `action` for each element, in index order.
   * @throws {@link NullPointerException} if `action` is null
   * @throws {@link ConcurrentModificationException} if `action` structurally modifies this list
   */
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
    removeRangeCheck(fromIndex, toIndex, n);
    // counted even when empty, as the reference (subList(i, i).clear() fails other open views)
    this.modCount++;
    if (fromIndex === toIndex) return;
    if (toIndex === n) this.es.length = fromIndex;
    else this.es.splice(fromIndex, toIndex - fromIndex);
  }

  /**
   * Removes every element for which `filter` returns `true`, in O(n) with one compaction pass. Every
   * element is tested before anything is removed, so a throwing predicate, or one that modifies the list,
   * leaves the list unchanged.
   * @returns `true` if any element was removed
   * @throws {@link NullPointerException} if `filter` is null
   * @throws {@link ConcurrentModificationException} if `filter` structurally modifies this list
   */
  override removeIf(filter: (e: E) => boolean): boolean {
    requireNonNull(filter);
    const a = this.es;
    const n = a.length;
    const mc = this.modCount;
    let i = 0;
    while (i < n && !filter(a[i])) i++;
    if (i === n) {
      if (this.modCount !== mc) throw new ConcurrentModificationException();
      return false;
    }
    // hits from the first one on; then one compaction pass
    const dead = new Uint8Array(n - i);
    dead[0] = 1;
    for (let j = i + 1; j < n; j++) if (filter(a[j])) dead[j - i] = 1;
    if (this.modCount !== mc) throw new ConcurrentModificationException();
    let w = i;
    for (let j = i + 1; j < n; j++) if (dead[j - i] === 0) a[w++] = a[j];
    a.length = w;
    this.modCount++;
    return true;
  }


  /**
   * Replaces each element with the result of `operator` applied to it, in order. O(n). Counts as a
   * structural change: open iterators fail fast afterwards.
   * @throws {@link NullPointerException} if `operator` is null
   * @throws {@link ConcurrentModificationException} if `operator` structurally modifies this list
   */
  override replaceAll(operator: (e: E) => E): void {
    requireNonNull(operator);
    const a = this.es;
    const mc = this.modCount;
    const n = a.length;
    for (let i = 0; i < n && a.length === n; i++) a[i] = operator(a[i]);
    if (this.modCount !== mc) throw new ConcurrentModificationException();
    // like the reference: open iterators fail fast after a bulk replace
    this.modCount++;
  }

  /**
   * Sorts this list in place. The sort is stable (equal elements keep their order) and O(n log n).
   * Counts as a structural change: open iterators fail fast afterwards.
   * @param c - the comparator; `null` or omitted means natural ordering
   * @throws {@link ClassCastException} if natural ordering is used and the elements have none
   * @throws {@link ConcurrentModificationException} if the comparator structurally modifies this list
   */
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

  /**
   * Returns the first element. O(1).
   * @throws {@link NoSuchElementException} if the list is empty
   */
  override getFirst(): E {
    if (this.es.length === 0) throw new NoSuchElementException();
    return this.es[0];
  }

  /**
   * Returns the last element. O(1).
   * @throws {@link NoSuchElementException} if the list is empty
   */
  override getLast(): E {
    const a = this.es;
    if (a.length === 0) throw new NoSuchElementException();
    return a[a.length - 1];
  }

  /** Returns a fail-fast iterator over the elements in index order. Its `remove` is O(n), like `removeAt`. */
  override iterator(): Iterator<E> {
    return new ArrayListItr(this, 0);
  }

  /**
   * Returns a fail-fast list iterator starting at `index`: the first `next()` returns the element at
   * `index`. Its `set` is O(1); its `add` and `remove` are O(n), like the positional methods.
   * @param index - start position, 0 by default
   * @throws {@link IndexOutOfBoundsException} if `index` < 0 or `index` > `size()`
   */
  override listIterator(index = 0): ListIterator<E> {
    checkPositionIndex(index, this.es.length);
    return new ArrayListItr(this, index);
  }

  /** Returns a spliterator over the elements, used to build streams: `ORDERED | SIZED | SUBSIZED`, late-binding, fail-fast, splits in halves. */
  override spliterator(): Spliterator<E> {
    return new OwnedArraySpliterator(this, () => this.es, Spliterator.ORDERED | Spliterator.SIZED | Spliterator.SUBSIZED);
  }

  /** Returns a JS iterator over the elements in index order, for `for...of` and spread; fail-fast. */
  override [Symbol.iterator](): IterableIterator<E> {
    return new ArrayListJsItr(this);
  }

  /** Returns `true` if `o` is a {@link List} of any class with equal elements in the same order. O(n). */
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
    const it = o.listIterator();
    for (let i = 0; i < n; i++) {
      if (!it.hasNext()) return false;
      const x = a[i];
      const y = it.next();
      if (x !== y && !equals(x, y)) return false;
    }
    return !it.hasNext();
  }

  /** Returns the list hash code, `h = 31 * h + hash(e)` from 1 in 32-bit arithmetic, consistent with `equals`. O(n). */
  override hashCode(): number {
    const a = this.es;
    let h = 1;
    for (let i = 0, n = a.length; i < n; i++) {
      const e = a[i];
      h = (Math.imul(31, h) + ((e as unknown) === this ? 0 : hashCode(e))) | 0;
    }
    return h;
  }

  /** Returns the elements in index order as `[a, b, c]`; an element that is this list prints as `(this Collection)`. */
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
    const i = this.cursor;
    this.list.add(i, e);
    this.cursor = i + 1;
    this.lastRet = -1;
    this.expectedModCount = this.list.modCount;
  }

  forEachRemaining(action: (e: E) => void): void {
    requireNonNull(action);
    const a = this.a;
    const mc = this.expectedModCount;
    let i = this.cursor;
    for (const n = a.length; i < n && this.list.modCount === mc; i++) action(a[i]);
    // nothing consumed: keep lastRet, so a following remove()/set() acts as before the call
    if (i !== this.cursor) {
      this.cursor = i;
      this.lastRet = i - 1;
    }
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
