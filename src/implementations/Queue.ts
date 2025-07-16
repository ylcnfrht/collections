import { NoSuchElementException } from '../exceptions/exceptions';
import { IQueue } from '../interfaces/IQueue';
import { LinkedList } from './LinkedList';

export class Queue<E> extends LinkedList<E> implements IQueue<E> {
  offer(e: E): boolean {
    this.add(e);

    return true;
  }
  poll(): E | null {
    if (this.isEmpty()) return null;

    return this.removeFirst();
  }

  remove(): E;
  remove(e: E): boolean;
  remove(e?: E): E | boolean {
    if (this.isEmpty()) throw new NoSuchElementException();

    return super.remove();
  }

  peek(): E | null {
    if (this.isEmpty()) return null;
    return this.getFirst();
  }

  element(): E {
    if (this.isEmpty()) throw new NoSuchElementException();

    return this.getFirst();
  }
}
