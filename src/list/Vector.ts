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

/** ArrayList plus the legacy element methods. Single-threaded JS needs no synchronization. */
export class Vector<E> extends ArrayList<E> {
  /** Capacity reported by capacity(); the native array manages real storage. */
  private cap: number;
  /** Amount capacity grows by when outgrown; 0 or less means it doubles. */
  readonly capacityIncrement: number;

  constructor();
  constructor(initialCapacity: number, capacityIncrement?: number);
  constructor(c: Collection<E>);
  constructor(arg?: number | Collection<E>, capacityIncrement = 0) {
    // ArrayList's constructor rejects a negative initialCapacity with IllegalArgumentException
    if (arguments.length === 0) super();
    else super(arg as Collection<E>);
    this.cap = arguments.length === 0 ? 10 : typeof arg === 'number' ? arg : this.es.length;
    this.capacityIncrement = capacityIncrement;
  }

  // Positional access reports ArrayIndexOutOfBoundsException (an IndexOutOfBoundsException), as the reference does.

  override get(index: number): E {
    if ((index >>> 0) !== index || index >= this.es.length) aioobe(index, this.es.length);
    return this.es[index];
  }

  override set(index: number, e: E): E {
    if ((index >>> 0) !== index || index >= this.es.length) aioobe(index, this.es.length);
    return super.set(index, e);
  }

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

  override add(e: E): boolean;
  override add(index: number, e: E): void;
  override add(a: E | number, b?: E): boolean | void {
    if (arguments.length >= 2) return super.add(a as number, b as E);
    this.ensure(this.es.length + 1);
    return super.add(a as E);
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

  static override of<E>(...xs: E[]): Vector<E> {
    // ArrayList.of fills the backing array directly, past this class's capacity bookkeeping
    const v = super.of(...xs) as Vector<E>;
    v.ensure(xs.length);
    return v;
  }

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

  /** @throws IllegalArgumentException if minCapacity is not an integer */
  override ensureCapacity(minCapacity: number): void {
    if (!Number.isInteger(minCapacity)) throw new IllegalArgumentException(`Illegal Capacity: ${minCapacity}`);
    // like the reference: open iterators fail fast after any positive request
    if (minCapacity > 0) this.modCount++;
    this.ensure(minCapacity);
  }

  private ensure(minCapacity: number): void {
    if (minCapacity > this.cap) this.grow(minCapacity);
  }

  override trimToSize(): void {
    super.trimToSize();
    this.cap = this.es.length;
  }

  capacity(): number {
    return this.cap;
  }

  /** Searches forward from index. @throws IndexOutOfBoundsException if index < 0 */
  override indexOf(o: unknown, index?: number): number {
    if (arguments.length < 2) return super.indexOf(o);
    const i0 = index as number;
    if (!Number.isInteger(i0) || i0 < 0) throw new IndexOutOfBoundsException(`Index: ${i0}`);
    const a = this.es;
    for (let i = i0, n = a.length; i < n; i++) if (equals(o, a[i])) return i;
    return -1;
  }

  /** Searches backward from index. @throws IndexOutOfBoundsException if index >= size() */
  override lastIndexOf(o: unknown, index?: number): number {
    if (arguments.length < 2) return super.lastIndexOf(o);
    const i0 = index as number;
    const a = this.es;
    if (!Number.isInteger(i0) || i0 >= a.length) throw new IndexOutOfBoundsException(`${i0} >= ${a.length}`);
    for (let i = i0; i >= 0; i--) if (equals(o, a[i])) return i;
    return -1;
  }

  /** Grows with null elements or truncates. @throws ArrayIndexOutOfBoundsException if newSize < 0 */
  setSize(newSize: number): void {
    const a = this.es;
    if (!Number.isInteger(newSize) || newSize < 0) aioobe(newSize, a.length);
    this.modCount++;
    this.ensure(newSize);
    if (newSize < a.length) a.length = newSize;
    else while (a.length < newSize) a.push(null as E);
  }

  /**
   * Copies the elements into anArray. A plain array grows if too short; a fixed-size
   * (typed) array that is too short throws IndexOutOfBoundsException.
   * @throws NullPointerException if anArray is null
   */
  copyInto(anArray: WritableArrayLike<E>): void {
    toArrayWith(this.es, () => anArray);
  }

  /** Index-based, not fail-fast enumeration of the elements. */
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

  /** @throws ArrayIndexOutOfBoundsException */
  elementAt(index: number): E {
    if ((index >>> 0) !== index || index >= this.es.length) aioobe(index, this.es.length);
    return this.es[index];
  }

  firstElement(): E {
    if (this.es.length === 0) throw new NoSuchElementException();
    return this.es[0];
  }

  lastElement(): E {
    if (this.es.length === 0) throw new NoSuchElementException();
    return this.es[this.es.length - 1];
  }

  addElement(e: E): void {
    this.add(e);
  }

  /** Like the reference, open iterators fail fast afterwards even when o is not found. */
  override remove(o: unknown): boolean {
    this.modCount++;
    return super.remove(o);
  }

  removeElement(o: unknown): boolean {
    return this.remove(o);
  }

  /** @throws ArrayIndexOutOfBoundsException */
  removeElementAt(index: number): void {
    if ((index >>> 0) !== index || index >= this.es.length) aioobe(index, this.es.length);
    this.removeAt(index);
  }

  /** @throws ArrayIndexOutOfBoundsException if index > size() */
  insertElementAt(e: E, index: number): void {
    if ((index >>> 0) !== index || index > this.es.length) aioobe(index, this.es.length);
    this.add(index, e);
  }

  /** @throws ArrayIndexOutOfBoundsException */
  setElementAt(e: E, index: number): void {
    if ((index >>> 0) !== index || index >= this.es.length) aioobe(index, this.es.length);
    this.es[index] = e;
  }

  removeAllElements(): void {
    this.clear();
  }
}
