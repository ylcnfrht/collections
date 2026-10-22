import { Comparator } from '../util/Comparator';
import { Collection, SequencedCollection } from './Collection';
import { ListIterator } from './Iterator';

/**
 * An ordered collection with positional (zero-based) access; duplicates and, depending on the implementation, `null`
 * are allowed. Removal by position is `removeAt(index)`, because TypeScript cannot tell `remove(index)` from
 * `remove(element)` on a `List<number>`.
 *
 * Two lists are equal when they hold equal elements in the same order, whatever their classes. The hash code is
 * `h = 31 * h + hash(e)` over the elements, starting from 1, in 32-bit arithmetic. Index arguments must be integers;
 * a non-integer index is out of bounds.
 */
export interface List<E> extends SequencedCollection<E> {
  /**
   * Appends `e` to the end of this list.
   * @returns always `true`
   * @throws {@link UnsupportedOperationException} if this list is unmodifiable
   * @throws {@link NullPointerException} if `e` is null and this list rejects null
   */
  add(e: E): boolean;
  /**
   * Inserts `e` at `index`, shifting the element there and all later ones one position to the right.
   * @throws {@link IndexOutOfBoundsException} if index < 0 or index > size()
   * @throws {@link UnsupportedOperationException} if this list is unmodifiable
   */
  add(index: number, e: E): void;
  /**
   * Appends every element of `c`, in `c`'s iteration order.
   * @returns `true` if this list changed (`c` was not empty)
   * @throws {@link NullPointerException} if `c` is null
   * @throws {@link UnsupportedOperationException} if this list is unmodifiable
   */
  addAll(c: Collection<E>): boolean;
  /**
   * Inserts every element of `c` at `index`, in `c`'s iteration order, shifting later elements right.
   * @returns `true` if this list changed (`c` was not empty)
   * @throws {@link IndexOutOfBoundsException} if index < 0 or index > size()
   * @throws {@link NullPointerException} if `c` is null
   * @throws {@link UnsupportedOperationException} if this list is unmodifiable
   */
  addAll(index: number, c: Collection<E>): boolean;
  /**
   * Returns the element at `index`.
   * @throws {@link IndexOutOfBoundsException} if index < 0 or index >= size()
   */
  get(index: number): E;
  /**
   * Replaces the element at `index` with `e`. Not a structural change, so open iterators stay valid.
   * @returns the element previously at `index`
   * @throws {@link IndexOutOfBoundsException} if index < 0 or index >= size()
   * @throws {@link UnsupportedOperationException} if this list does not support `set`
   */
  set(index: number, e: E): E;
  /**
   * Removes the element at `index`, shifting later elements one position to the left.
   * @returns the removed element
   * @throws {@link IndexOutOfBoundsException} if index < 0 or index >= size()
   * @throws {@link UnsupportedOperationException} if this list is unmodifiable
   */
  removeAt(index: number): E;
  /** Returns the index of the first element equal to `o` (by `Objects.equals`), or -1 if there is none. */
  indexOf(o: unknown): number;
  /** Returns the index of the last element equal to `o` (by `Objects.equals`), or -1 if there is none. */
  lastIndexOf(o: unknown): number;
  /**
   * Returns a fail-fast list iterator starting at `index`: the first `next()` returns the element at `index`.
   * @param index - start position, 0 by default
   * @throws {@link IndexOutOfBoundsException} if index < 0 or index > size()
   */
  listIterator(index?: number): ListIterator<E>;
  /**
   * Returns a live view of the range [fromIndex, toIndex): changes through either side are visible in the other.
   * A structural change made to this list other than through the view makes the view fail fast
   * (`ConcurrentModificationException`). The view is random-access when this list is.
   * @throws {@link IndexOutOfBoundsException} if fromIndex < 0 or toIndex > size()
   * @throws {@link IllegalArgumentException} if fromIndex > toIndex
   */
  subList(fromIndex: number, toIndex: number): List<E>;
  /**
   * Replaces each element with the result of `operator` applied to it, in order.
   * @throws {@link NullPointerException} if `operator` is null
   * @throws {@link UnsupportedOperationException} if this list does not support `set`
   */
  replaceAll(operator: (e: E) => E): void;
  /**
   * Sorts this list in place. The sort is stable: equal elements keep their relative order.
   * @param c - the comparator; `null` or omitted means natural ordering
   * @throws {@link ClassCastException} if natural ordering is used and the elements have none
   * @throws {@link UnsupportedOperationException} if this list does not support `set`
   */
  sort(c?: Comparator<E> | null): void;
  /** Returns a live reverse-ordered view: changes through either side are visible in the other. Random-access when this list is. */
  reversed(): List<E>;
}
