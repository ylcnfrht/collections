import { Collection, SequencedCollection } from './Collection';
import { Iterator } from './Iterator';

/** Queue. Methods returning `null` mean "empty". */
export interface Queue<E> extends Collection<E> {
  offer(e: E): boolean;
  /** @throws NoSuchElementException when empty */
  remove(): E;
  remove(o: unknown): boolean;
  poll(): E | null;
  /** @throws NoSuchElementException when empty */
  element(): E;
  peek(): E | null;
}

/** Deque */
export interface Deque<E> extends Queue<E>, SequencedCollection<E> {
  remove(): E;
  remove(o: unknown): boolean;
  offerFirst(e: E): boolean;
  offerLast(e: E): boolean;
  pollFirst(): E | null;
  pollLast(): E | null;
  peekFirst(): E | null;
  peekLast(): E | null;
  removeFirstOccurrence(o: unknown): boolean;
  removeLastOccurrence(o: unknown): boolean;
  push(e: E): void;
  /** @throws NoSuchElementException when empty */
  pop(): E;
  descendingIterator(): Iterator<E>;
  reversed(): Deque<E>;
}
