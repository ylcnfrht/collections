import { Comparator } from '../util/Comparator';
import { Collection, SequencedCollection } from './Collection';
import { Iterator } from './Iterator';

/**
 * A collection without duplicate elements: `add(e)` returns `false` when an equal element (by `Objects.equals`, or
 * by comparison for sorted sets) is already present. Two sets are equal when they have the same size and each
 * contains every element of the other, whatever their classes; the hash code is the sum of the element hashes, in
 * 32-bit arithmetic. Shadows the JS `Set` global when imported; alias it if you need both.
 */
export interface Set<E> extends Collection<E> {}

/**
 * A set with a defined encounter order (`LinkedHashSet`, `TreeSet`). On an insertion-ordered set, `addFirst` and
 * `addLast` move an element that is already present to that end.
 */
export interface SequencedSet<E> extends Set<E>, SequencedCollection<E> {
  /** Returns a live reverse-ordered view: changes through either side are visible in the other. */
  reversed(): SequencedSet<E>;
}

/**
 * A set kept in ascending order by natural ordering or a comparator. The comparator (or `compareTo`) alone decides
 * whether two elements are the same. `addFirst`/`addLast` throw `UnsupportedOperationException`. With natural
 * ordering, `null` elements throw `NullPointerException` and elements with no natural order throw
 * `ClassCastException`. Range views are live and reject adding an element outside their range with
 * `IllegalArgumentException`.
 */
export interface SortedSet<E> extends SequencedSet<E> {
  /** Returns the comparator that orders this set, or `null` when it uses natural ordering. */
  comparator(): Comparator<E> | null;
  /**
   * Returns the lowest element.
   * @throws {@link NoSuchElementException} if this set is empty
   */
  first(): E;
  /**
   * Returns the highest element.
   * @throws {@link NoSuchElementException} if this set is empty
   */
  last(): E;
  /**
   * Returns a live view of the elements strictly less than `toElement`.
   * @throws {@link NullPointerException} if `toElement` is null and this set rejects null
   * @throws {@link IllegalArgumentException} if this set is itself a range view and `toElement` is outside its range
   */
  headSet(toElement: E): SortedSet<E>;
  /**
   * Returns a live view of the elements greater than or equal to `fromElement`.
   * @throws {@link NullPointerException} if `fromElement` is null and this set rejects null
   * @throws {@link IllegalArgumentException} if this set is itself a range view and `fromElement` is outside its range
   */
  tailSet(fromElement: E): SortedSet<E>;
  /**
   * Returns a live view of the elements from `fromElement` (inclusive) to `toElement` (exclusive).
   * @throws {@link IllegalArgumentException} if `fromElement` is greater than `toElement`, or either is outside this
   * view's range
   * @throws {@link NullPointerException} if either bound is null and this set rejects null
   */
  subSet(fromElement: E, toElement: E): SortedSet<E>;
  /** Returns a live descending view: changes through either side are visible in the other. */
  reversed(): SortedSet<E>;
}

/**
 * A sorted set with navigation methods that return the closest match for a given element (`lower`, `floor`,
 * `ceiling`, `higher`, each `null` when there is none) and range views with explicit inclusive flags.
 */
export interface NavigableSet<E> extends SortedSet<E> {
  /**
   * Returns the greatest element strictly less than `e`, or `null` if there is none.
   * @throws {@link NullPointerException} if `e` is null and this set rejects null
   */
  lower(e: E): E | null;
  /**
   * Returns the greatest element less than or equal to `e`, or `null` if there is none.
   * @throws {@link NullPointerException} if `e` is null and this set rejects null
   */
  floor(e: E): E | null;
  /**
   * Returns the least element greater than or equal to `e`, or `null` if there is none.
   * @throws {@link NullPointerException} if `e` is null and this set rejects null
   */
  ceiling(e: E): E | null;
  /**
   * Returns the least element strictly greater than `e`, or `null` if there is none.
   * @throws {@link NullPointerException} if `e` is null and this set rejects null
   */
  higher(e: E): E | null;
  /** Removes and returns the lowest element, or `null` if this set is empty. */
  pollFirst(): E | null;
  /** Removes and returns the highest element, or `null` if this set is empty. */
  pollLast(): E | null;
  /** Returns a live view of this set in descending order: changes through either side are visible in the other. */
  descendingSet(): NavigableSet<E>;
  /** Returns a fail-fast iterator over the elements in descending order. */
  descendingIterator(): Iterator<E>;
  /**
   * Returns a live view of the elements strictly less than `toElement`; same as `headSet(toElement, false)`.
   * @throws {@link IllegalArgumentException} if this set is itself a range view and `toElement` is outside its range
   */
  headSet(toElement: E): SortedSet<E>;
  /**
   * Returns a live view of the elements less than (or, if `inclusive`, equal to) `toElement`.
   * @throws {@link IllegalArgumentException} if this set is itself a range view and `toElement` is outside its range
   * @throws {@link NullPointerException} if `toElement` is null and this set rejects null
   */
  headSet(toElement: E, inclusive: boolean): NavigableSet<E>;
  /**
   * Returns a live view of the elements greater than or equal to `fromElement`; same as `tailSet(fromElement, true)`.
   * @throws {@link IllegalArgumentException} if this set is itself a range view and `fromElement` is outside its range
   */
  tailSet(fromElement: E): SortedSet<E>;
  /**
   * Returns a live view of the elements greater than (or, if `inclusive`, equal to) `fromElement`.
   * @throws {@link IllegalArgumentException} if this set is itself a range view and `fromElement` is outside its range
   * @throws {@link NullPointerException} if `fromElement` is null and this set rejects null
   */
  tailSet(fromElement: E, inclusive: boolean): NavigableSet<E>;
  /**
   * Returns a live view of the elements from `fromElement` (inclusive) to `toElement` (exclusive); same as
   * `subSet(fromElement, true, toElement, false)`.
   * @throws {@link IllegalArgumentException} if `fromElement` is greater than `toElement`, or either is outside this
   * view's range
   */
  subSet(fromElement: E, toElement: E): SortedSet<E>;
  /**
   * Returns a live view of the elements between `fromElement` and `toElement`, each end included when its flag is set.
   * @throws {@link IllegalArgumentException} if `fromElement` is greater than `toElement`, or either is outside this
   * view's range
   * @throws {@link NullPointerException} if either bound is null and this set rejects null
   */
  subSet(fromElement: E, fromInclusive: boolean, toElement: E, toInclusive: boolean): NavigableSet<E>;
  /** Returns a live descending view; same as `descendingSet()`. */
  reversed(): NavigableSet<E>;
}
