import {
  ArrayIndexOutOfBoundsException,
  IllegalArgumentException,
  IndexOutOfBoundsException,
  NoSuchElementException,
  UnsupportedOperationException,
} from '../exceptions';
import { Collection } from '../interfaces/Collection';
import { Enumeration, Iterator } from '../interfaces/Iterator';
import { toArrayWith, WritableArrayLike } from '../util/arrays';
import { equals, requireNonNull } from '../util/Objects';
import { ArrayList } from './ArrayList';

function aioobe(index: number, size: number): never {
  throw new ArrayIndexOutOfBoundsException(`Array index out of range: ${index} (size ${size})`);
}

/**
 * Legacy growable array list: an {@link ArrayList} plus the old element-style methods (`elementAt`,
 * `addElement`, `elements()`, …), a reported `capacity()` with `capacityIncrement`, and
 * {@link ArrayIndexOutOfBoundsException} for bad indexes. It is meant for porting code that uses
 * them; new code should use {@link ArrayList}.
 *
 * Complexity, null policy (`null` and `undefined` allowed) and index-order iteration are those of
 * {@link ArrayList}. JS is single-threaded, so there is no synchronization.
 */
export class Vector<E> extends ArrayList<E> {
  /** Capacity reported by capacity(); the native array manages real storage. */
  private cap: number;
  /** Amount `capacity()` grows by when outgrown; 0 or less means it doubles. Fixed at construction. */
  readonly capacityIncrement: number;

  /** Creates an empty vector with capacity 10 that doubles when outgrown. */
  constructor();
  /**
   * Creates an empty vector with the given reported capacity.
   * @param initialCapacity - initial value of `capacity()`
   * @param capacityIncrement - amount the capacity grows by when outgrown; 0 or less (the default) means it doubles
   * @throws {@link IllegalArgumentException} if `initialCapacity` is negative or not an integer
   */
  constructor(initialCapacity: number, capacityIncrement?: number);
  /**
   * Creates a vector holding the elements of `c`, in its iteration order; `capacity()` is their count.
   * @throws {@link NullPointerException} if `c` is `null` or `undefined`
   */
  constructor(c: Collection<E>);
  constructor(arg?: number | Collection<E>, capacityIncrement = 0) {
    // ArrayList's constructor rejects a negative initialCapacity with IllegalArgumentException
    if (arguments.length === 0) super();
    else super(arg as Collection<E>);
    this.cap = arguments.length === 0 ? 10 : typeof arg === 'number' ? arg : this.es.length;
    this.capacityIncrement = capacityIncrement;
  }

  // Positional access reports ArrayIndexOutOfBoundsException (an IndexOutOfBoundsException), as the reference does.

  /**
   * Returns the element at `index`. O(1).
   * @throws {@link ArrayIndexOutOfBoundsException} if `index` < 0 or `index` >= `size()`
   */
  override get(index: number): E {
    if ((index >>> 0) !== index || index >= this.es.length) aioobe(index, this.es.length);
    return this.es[index];
  }

  /**
   * Replaces the element at `index` with `e`. O(1); not a structural change.
   * @returns the element previously at `index`
   * @throws {@link ArrayIndexOutOfBoundsException} if `index` < 0 or `index` >= `size()`
   */
  override set(index: number, e: E): E {
    if ((index >>> 0) !== index || index >= this.es.length) aioobe(index, this.es.length);
    return super.set(index, e);
  }

  /**
   * Removes the element at `index`, shifting later elements one position to the left. O(n − index).
   * Counts as a structural change even when `index` is invalid.
   * @returns the removed element
   * @throws {@link ArrayIndexOutOfBoundsException} if `index` < 0 or `index` >= `size()`
   */
  override removeAt(index: number): E {
    // like the reference, even a bad index fails open iterators
    this.modCount++;
    if ((index >>> 0) !== index || index >= this.es.length) aioobe(index, this.es.length);
    return super.removeAt(index);
  }

  /** @internal Vector is not an ArrayList in the reference: its nested sublists start fresh */
  override nestedSubListsInheritStaleness(): boolean {
    return false;
  }

  /**
   * Appends `e` to the end of this vector, in amortized O(1), growing `capacity()` when outgrown.
   * @returns always `true`
   */
  override add(e: E): boolean;
  /**
   * Inserts `e` at `index`, shifting later elements one position to the right. O(n − index); grows
   * `capacity()` when outgrown.
   * @throws {@link ArrayIndexOutOfBoundsException} if `index` < 0 or `index` > `size()`
   */
  override add(index: number, e: E): void;
  override add(a: E | number, b?: E): boolean | void {
    if (arguments.length >= 2) return super.add(a as number, b as E);
    // ArrayList's append inlined: push() goes through here, and the extra super call showed up in it
    const es = this.es;
    if (es.length >= this.cap) this.grow(es.length + 1);
    es.push(a as E);
    this.modCount++;
    return true;
  }

  protected override addAtIndex(index: number, e: E): void {
    // the reference's order: an index past the end fails first; a negative one only after counting the change
    if (index > this.es.length) aioobe(index, this.es.length);
    this.modCount++;
    if ((index >>> 0) !== index) aioobe(index, this.es.length);
    this.ensure(this.es.length + 1);
    super.addAtIndex(index, e);
  }

  protected override addAllAt(index: number, c: Collection<E>): boolean {
    if ((index >>> 0) !== index || index > this.es.length) aioobe(index, this.es.length);
    const n = requireNonNull(c).size();
    // a bulk add grows once, to fit everything, like the reference
    if (n > 0) this.ensure(this.es.length + n);
    return super.addAllAt(index, c);
  }

  /**
   * Creates a vector holding `xs` in argument order. `capacity()` starts at 10 and grows once,
   * as for a bulk add, if `xs` needs more. Called on a subclass, returns an instance of it.
   */
  static override of<E>(...xs: E[]): Vector<E> {
    // ArrayList.of fills the backing array directly, past this class's capacity bookkeeping
    const v = super.of(...xs) as Vector<E>;
    v.ensure(xs.length);
    return v;
  }

  /** Returns a shallow, independent copy whose `capacity()` equals its size; `capacityIncrement` is kept. */
  override clone(): this {
    const c = super.clone() as Vector<E>;
    c.cap = this.es.length; // the reference copies only the elements, so a clone's capacity is its size
    (c as { capacityIncrement: number }).capacityIncrement = this.capacityIncrement;
    return c as this;
  }

  private grow(minCapacity: number): void {
    const old = this.cap;
    this.cap = old + Math.max(minCapacity - old, this.capacityIncrement > 0 ? this.capacityIncrement : old);
  }

  /**
   * Raises `capacity()` to at least `minCapacity`: it grows by `capacityIncrement` (or doubles when
   * that is 0 or less), or straight to `minCapacity` if that is larger. Real storage is unaffected.
   * Any positive request counts as a structural change, so open iterators fail fast afterwards.
   * @throws {@link IllegalArgumentException} if `minCapacity` is not an integer
   */
  override ensureCapacity(minCapacity: number): void {
    if (!Number.isInteger(minCapacity)) throw new IllegalArgumentException(`Illegal Capacity: ${minCapacity}`);
    // like the reference: open iterators fail fast after any positive request
    if (minCapacity > 0) this.modCount++;
    this.ensure(minCapacity);
  }

  private ensure(minCapacity: number): void {
    if (minCapacity > this.cap) this.grow(minCapacity);
  }

  /** Sets `capacity()` to `size()`. Counts as a structural change, so open iterators fail fast afterwards. */
  override trimToSize(): void {
    super.trimToSize();
    this.cap = this.es.length;
  }

  /**
   * Returns the reported capacity: how many elements fit before it next grows. It is bookkeeping
   * for ported code; the engine manages the real storage.
   */
  capacity(): number {
    return this.cap;
  }

  /**
   * Returns the index of the first element equal to `o`, searching forward from `index`
   * (from 0 when omitted), or -1. O(n).
   * @throws {@link IndexOutOfBoundsException} if `index` < 0
   */
  override indexOf(o: unknown, index?: number): number {
    if (arguments.length < 2) return super.indexOf(o);
    const i0 = index as number;
    if (!Number.isInteger(i0) || i0 < 0) throw new IndexOutOfBoundsException(`Index: ${i0}`);
    const a = this.es;
    for (let i = i0, n = a.length; i < n; i++) if (equals(o, a[i])) return i;
    return -1;
  }

  /**
   * Returns the index of the last element equal to `o`, searching backward from `index`
   * (from the end when omitted), or -1. O(n).
   * @throws {@link IndexOutOfBoundsException} if `index` >= `size()`
   */
  override lastIndexOf(o: unknown, index?: number): number {
    if (arguments.length < 2) return super.lastIndexOf(o);
    const i0 = index as number;
    const a = this.es;
    if (!Number.isInteger(i0) || i0 >= a.length) throw new IndexOutOfBoundsException(`${i0} >= ${a.length}`);
    for (let i = i0; i >= 0; i--) if (equals(o, a[i])) return i;
    return -1;
  }

  /**
   * Sets the size: truncates the vector, or pads it with `null` elements. Raises `capacity()` if needed.
   * @throws {@link ArrayIndexOutOfBoundsException} if `newSize` < 0 or not an integer
   */
  setSize(newSize: number): void {
    const a = this.es;
    if (!Number.isInteger(newSize) || newSize < 0) aioobe(newSize, a.length);
    this.modCount++;
    this.ensure(newSize);
    if (newSize < a.length) a.length = newSize;
    else while (a.length < newSize) a.push(null as E);
  }

  /**
   * Copies the elements, in index order, into `anArray` from index 0. A plain array grows if too
   * short; a fixed-size (typed) array that is too short throws {@link IndexOutOfBoundsException}.
   * @throws {@link NullPointerException} if `anArray` is `null`
   */
  copyInto(anArray: WritableArrayLike<E>): void {
    toArrayWith(this.es, () => anArray);
  }

  /**
   * Returns a legacy {@link Enumeration} of the elements in index order. It is index-based and not
   * fail-fast; it is also JS-iterable and adapts to an {@link Iterator} through `asIterator()`.
   */
  elements(): Enumeration<E> & Iterable<E> {
    const self = this;
    let i = 0;
    const en = {
      hasMoreElements: () => i < self.es.length,
      nextElement(): E {
        if (i >= self.es.length) throw new NoSuchElementException('Vector Enumeration');
        return self.es[i++];
      },
      asIterator(): Iterator<E> {
        return {
          hasNext: () => en.hasMoreElements(),
          next: () => en.nextElement(),
          remove() {
            throw new UnsupportedOperationException('remove');
          },
          forEachRemaining(action: (e: E) => void) {
            requireNonNull(action);
            while (en.hasMoreElements()) action(en.nextElement());
          },
        };
      },
      *[Symbol.iterator](): IterableIterator<E> {
        while (en.hasMoreElements()) yield en.nextElement();
      },
    };
    return en;
  }

  /**
   * Returns the element at `index`; same as `get`. O(1).
   * @throws {@link ArrayIndexOutOfBoundsException} if `index` < 0 or `index` >= `size()`
   */
  elementAt(index: number): E {
    if ((index >>> 0) !== index || index >= this.es.length) aioobe(index, this.es.length);
    return this.es[index];
  }

  /**
   * Returns the first element; same as `getFirst`.
   * @throws {@link NoSuchElementException} if the vector is empty
   */
  firstElement(): E {
    if (this.es.length === 0) throw new NoSuchElementException();
    return this.es[0];
  }

  /**
   * Returns the last element; same as `getLast`.
   * @throws {@link NoSuchElementException} if the vector is empty
   */
  lastElement(): E {
    if (this.es.length === 0) throw new NoSuchElementException();
    return this.es[this.es.length - 1];
  }

  /** Appends `e`; same as `add(e)` but returns nothing. */
  addElement(e: E): void {
    this.add(e);
  }

  /**
   * Removes the first element equal to `o` (by `Objects.equals`), if present. O(n). Counts as a
   * structural change even when `o` is not found, so open iterators fail fast afterwards.
   * @returns `true` if an element was removed
   */
  override remove(o: unknown): boolean {
    this.modCount++;
    return super.remove(o);
  }

  /** Removes the first element equal to `o`; same as `remove(o)`. O(n). */
  removeElement(o: unknown): boolean {
    return this.remove(o);
  }

  /**
   * Removes the element at `index`; same as `removeAt` but returns nothing. O(n − index).
   * @throws {@link ArrayIndexOutOfBoundsException} if `index` < 0 or `index` >= `size()`
   */
  removeElementAt(index: number): void {
    if ((index >>> 0) !== index || index >= this.es.length) aioobe(index, this.es.length);
    this.removeAt(index);
  }

  /**
   * Inserts `e` at `index`; same as `add(index, e)` with the arguments swapped. O(n − index).
   * @throws {@link ArrayIndexOutOfBoundsException} if `index` < 0 or `index` > `size()`
   */
  insertElementAt(e: E, index: number): void {
    if ((index >>> 0) !== index || index > this.es.length) aioobe(index, this.es.length);
    this.add(index, e);
  }

  /**
   * Replaces the element at `index`; same as `set(index, e)` with the arguments swapped, but returns
   * nothing. O(1), not a structural change.
   * @throws {@link ArrayIndexOutOfBoundsException} if `index` < 0 or `index` >= `size()`
   */
  setElementAt(e: E, index: number): void {
    if ((index >>> 0) !== index || index >= this.es.length) aioobe(index, this.es.length);
    this.es[index] = e;
  }

  /** Removes every element; same as `clear`. `capacity()` is unchanged. */
  removeAllElements(): void {
    this.clear();
  }
}
