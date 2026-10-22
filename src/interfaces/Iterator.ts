/**
 * A cursor over a collection (`hasNext`/`next`/`remove`). Distinct from the JS iterator protocol, which collections
 * also implement. Iterators returned by the library's collections are fail-fast: after a structural change made
 * other than through this iterator, the next step throws `ConcurrentModificationException`.
 */
export interface Iterator<E> {
  /** Returns `true` if `next()` would return an element. */
  hasNext(): boolean;
  /**
   * Returns the next element and advances the cursor.
   * @throws {@link NoSuchElementException} if there are no more elements
   * @throws {@link ConcurrentModificationException} if the collection was structurally modified other than through
   * this iterator
   */
  next(): E;
  /**
   * Removes the element last returned by `next()` from the underlying collection.
   * @throws {@link IllegalStateException} if `next()` has not been called, or `remove()` was already called after the
   * last `next()`
   * @throws {@link UnsupportedOperationException} if the collection is unmodifiable or the iterator does not support
   * removal
   * @throws {@link ConcurrentModificationException} if the collection was structurally modified other than through
   * this iterator
   */
  remove(): void;
  /**
   * Calls `action` for each remaining element, in order, until the iterator is exhausted.
   * @throws {@link NullPointerException} if `action` is null
   */
  forEachRemaining(action: (e: E) => void): void;
}

/** A legacy cursor (`Vector.elements`, `Collections.enumeration`). Not fail-fast. */
export interface Enumeration<E> {
  /** Returns `true` if `nextElement()` would return an element. */
  hasMoreElements(): boolean;
  /**
   * Returns the next element.
   * @throws {@link NoSuchElementException} if there are no more elements
   */
  nextElement(): E;
  /** Adapts this enumeration to an {@link Iterator} whose `remove()` throws `UnsupportedOperationException`. */
  asIterator(): Iterator<E>;
}

/**
 * An iterator for lists that moves in both directions, reports its position, and can replace or insert elements.
 * The cursor sits between elements: between `previous()` (index `previousIndex()`) and `next()` (index `nextIndex()`).
 */
export interface ListIterator<E> extends Iterator<E> {
  /** Returns `true` if `previous()` would return an element. */
  hasPrevious(): boolean;
  /**
   * Returns the previous element and moves the cursor backwards.
   * @throws {@link NoSuchElementException} if the cursor is at the start of the list
   * @throws {@link ConcurrentModificationException} if the list was structurally modified other than through this
   * iterator
   */
  previous(): E;
  /** Returns the index of the element the next `next()` would return, or the list size at the end. */
  nextIndex(): number;
  /** Returns the index of the element the next `previous()` would return, or -1 at the start. */
  previousIndex(): number;
  /**
   * Replaces the element last returned by `next()` or `previous()` with `e`.
   * @throws {@link IllegalStateException} if neither `next()` nor `previous()` has been called, or `remove()` or
   * `add()` was called after the last one
   * @throws {@link UnsupportedOperationException} if the list does not support `set`
   */
  set(e: E): void;
  /**
   * Inserts `e` immediately before the cursor: a following `next()` is unaffected and a following `previous()`
   * returns `e`. After it, `remove()` and `set()` throw `IllegalStateException` until `next()` or `previous()` is called.
   * @throws {@link UnsupportedOperationException} if the list is unmodifiable
   */
  add(e: E): void;
}

