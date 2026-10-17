import { Comparator } from '../util/Comparator';
import { Collection, SequencedCollection } from './Collection';
import { Iterator } from './Iterator';

/** Collection without duplicates. Shadows the JS Set global when imported; alias it if you need both. */
export interface Set<E> extends Collection<E> {}

/** SequencedSet */
export interface SequencedSet<E> extends Set<E>, SequencedCollection<E> {
  reversed(): SequencedSet<E>;
}

/** SortedSet. addFirst/addLast throw UnsupportedOperationException. */
export interface SortedSet<E> extends SequencedSet<E> {
  /** null when using natural ordering */
  comparator(): Comparator<E> | null;
  /** @throws NoSuchElementException when empty */
  first(): E;
  /** @throws NoSuchElementException when empty */
  last(): E;
  headSet(toElement: E): SortedSet<E>;
  tailSet(fromElement: E): SortedSet<E>;
  subSet(fromElement: E, toElement: E): SortedSet<E>;
}

/** NavigableSet */
export interface NavigableSet<E> extends SortedSet<E> {
  lower(e: E): E | null;
  floor(e: E): E | null;
  ceiling(e: E): E | null;
  higher(e: E): E | null;
  pollFirst(): E | null;
  pollLast(): E | null;
  descendingSet(): NavigableSet<E>;
  descendingIterator(): Iterator<E>;
  headSet(toElement: E): SortedSet<E>;
  headSet(toElement: E, inclusive: boolean): NavigableSet<E>;
  tailSet(fromElement: E): SortedSet<E>;
  tailSet(fromElement: E, inclusive: boolean): NavigableSet<E>;
  subSet(fromElement: E, toElement: E): SortedSet<E>;
  subSet(fromElement: E, fromInclusive: boolean, toElement: E, toInclusive: boolean): NavigableSet<E>;
  reversed(): NavigableSet<E>;
}
