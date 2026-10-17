import { WritableArrayLike } from '../util/arrays';
import { Iterator } from './Iterator';

/**
 * Collection. Membership uses Objects.equals (element equals() if defined,
 * else SameValueZero), never plain ===.
 */
export interface Collection<E> extends Iterable<E> {
  iterator(): Iterator<E>;
  forEach(action: (e: E) => void): void;
  size(): number;
  isEmpty(): boolean;
  contains(o: unknown): boolean;
  toArray(): E[];
  /** Fills an array created by generator(size()); e.g. `n => new Float64Array(n)`. */
  toArray<A extends WritableArrayLike<E>>(generator: (length: number) => A): A;
  add(e: E): boolean;
  remove(o: unknown): boolean;
  containsAll(c: Collection<unknown>): boolean;
  addAll(c: Collection<E>): boolean;
  removeAll(c: Collection<unknown>): boolean;
  removeIf(filter: (e: E) => boolean): boolean;
  retainAll(c: Collection<unknown>): boolean;
  clear(): void;
  equals(o: unknown): boolean;
  hashCode(): number;
  toString(): string;
}

/** Collection with a defined order and two ends. */
export interface SequencedCollection<E> extends Collection<E> {
  reversed(): SequencedCollection<E>;
  addFirst(e: E): void;
  addLast(e: E): void;
  /** @throws NoSuchElementException when empty */
  getFirst(): E;
  /** @throws NoSuchElementException when empty */
  getLast(): E;
  /** @throws NoSuchElementException when empty */
  removeFirst(): E;
  /** @throws NoSuchElementException when empty */
  removeLast(): E;
}
