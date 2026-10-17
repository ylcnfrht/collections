import { IllegalArgumentException, IllegalStateException, NoSuchElementException } from '../exceptions';
import { Collection } from '../interfaces/Collection';
import { Queue } from '../interfaces/Queue';
import { requireNonNull } from '../util/Objects';
import { AbstractCollection } from './AbstractCollection';

/**
 * Skeleton of AbstractQueue for queues that reject null elements:
 * a `null` from poll()/peek() always means "empty".
 */
export abstract class AbstractQueue<E> extends AbstractCollection<E> implements Queue<E> {
  abstract offer(e: E): boolean;
  abstract poll(): E | null;
  abstract peek(): E | null;

  override add(e: E): boolean {
    if (this.offer(e)) return true;
    throw new IllegalStateException('Queue full');
  }

  override remove(): E;
  override remove(o: unknown): boolean;
  override remove(o?: unknown): E | boolean {
    if (arguments.length > 0) return super.remove(o);
    const x = this.poll();
    if (x !== null) return x;
    throw new NoSuchElementException();
  }

  element(): E {
    const x = this.peek();
    if (x !== null) return x;
    throw new NoSuchElementException();
  }

  override clear(): void {
    while (this.poll() !== null);
  }

  override addAll(c: Collection<E>): boolean {
    requireNonNull(c);
    if ((c as unknown) === this) throw new IllegalArgumentException();
    return super.addAll(c);
  }
}
