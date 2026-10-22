import { EmptyStackException } from '../exceptions';
import { Vector } from './Vector';

/**
 * Legacy last-in-first-out stack built on {@link Vector}. The top of the stack is the end of the
 * vector, so `push`, `pop` and `peek` are O(1). An empty `pop()` or `peek()` throws
 * {@link EmptyStackException}. Permits `null` and `undefined`.
 *
 * Iteration, `toString()` and `toArray()` go bottom to top (index order), and every list method
 * stays available. For new code, use {@link ArrayDeque} as a stack.
 */
export class Stack<E> extends Vector<E> {
  /** Creates a stack holding `xs` pushed in argument order, so the last argument is on top. */
  static override of<E>(...xs: E[]): Stack<E> {
    return super.of(...xs) as Stack<E>;
  }

  /**
   * Pushes `e` onto the top in amortized O(1); same as `addElement`.
   * @returns `e`
   */
  push(e: E): E {
    this.add(e);
    return e;
  }

  /**
   * Removes and returns the top element. O(1).
   * @throws {@link EmptyStackException} if the stack is empty
   */
  pop(): E {
    const a = this.es;
    if (a.length === 0) throw new EmptyStackException('Stack is empty');
    this.modCount++;
    return a.pop() as E;
  }

  /**
   * Returns the top element without removing it. O(1).
   * @throws {@link EmptyStackException} if the stack is empty
   */
  peek(): E {
    const a = this.es;
    if (a.length === 0) throw new EmptyStackException('Stack is empty');
    return a[a.length - 1];
  }

  /** Returns `true` if the stack has no elements; same as `isEmpty`. */
  empty(): boolean {
    return this.es.length === 0;
  }

  /**
   * Returns the 1-based distance of `o` from the top (the top itself is 1), using the occurrence
   * nearest the top, or -1 when absent. O(n).
   */
  search(o: unknown): number {
    const i = this.lastIndexOf(o);
    return i >= 0 ? this.es.length - i : -1;
  }
}
