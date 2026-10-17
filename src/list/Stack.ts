import { NoSuchElementException } from '../exceptions';
import { Vector } from './Vector';

/** LIFO stack on top of Vector. Empty pop()/peek() throw NoSuchElementException (the EmptyStackException role). */
export class Stack<E> extends Vector<E> {
  static override of<E>(...xs: E[]): Stack<E> {
    return super.of(...xs) as Stack<E>;
  }

  push(e: E): E {
    this.es.push(e);
    this.modCount++;
    return e;
  }

  /** @throws NoSuchElementException when empty */
  pop(): E {
    const a = this.es;
    if (a.length === 0) throw new NoSuchElementException('Stack is empty');
    this.modCount++;
    return a.pop() as E;
  }

  /** @throws NoSuchElementException when empty */
  peek(): E {
    const a = this.es;
    if (a.length === 0) throw new NoSuchElementException('Stack is empty');
    return a[a.length - 1];
  }

  empty(): boolean {
    return this.es.length === 0;
  }

  /** 1-based distance from the top, or -1 when absent. */
  search(o: unknown): number {
    const i = this.lastIndexOf(o);
    return i >= 0 ? this.es.length - i : -1;
  }
}
