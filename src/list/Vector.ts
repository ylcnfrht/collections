import { NoSuchElementException } from '../exceptions';
import { Collection } from '../interfaces/Collection';
import { ArrayList } from './ArrayList';

/** ArrayList plus the legacy element methods. Single-threaded JS needs no synchronization. */
export class Vector<E> extends ArrayList<E> {
  /** Capacity hint reported by capacity(); the native array manages real storage. */
  private cap: number;

  constructor();
  constructor(initialCapacity: number);
  constructor(c: Collection<E>);
  constructor(arg?: number | Collection<E>) {
    if (arguments.length === 0) super();
    else super(arg as Collection<E>);
    this.cap = typeof arg === 'number' ? arg : Math.max(10, this.es.length);
  }

  static override of<E>(...xs: E[]): Vector<E> {
    return super.of(...xs) as Vector<E>;
  }

  override clone(): this {
    const c = super.clone();
    (c as Vector<E>).cap = this.cap;
    return c;
  }

  override ensureCapacity(minCapacity: number): void {
    if (minCapacity > this.capacity()) this.cap = Math.max(minCapacity, this.capacity() * 2);
  }

  override trimToSize(): void {
    this.cap = this.es.length;
  }

  capacity(): number {
    // grows by doubling, like the reference, whenever size outran the hint
    while (this.cap < this.es.length) this.cap = Math.max(1, this.cap * 2);
    return this.cap;
  }

  elementAt(index: number): E {
    return this.get(index);
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

  removeElement(o: unknown): boolean {
    return this.remove(o);
  }

  removeElementAt(index: number): void {
    this.removeAt(index);
  }

  insertElementAt(e: E, index: number): void {
    this.add(index, e);
  }

  setElementAt(e: E, index: number): void {
    this.set(index, e);
  }

  removeAllElements(): void {
    this.clear();
  }
}
