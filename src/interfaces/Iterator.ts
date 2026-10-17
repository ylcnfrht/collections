/** Cursor over a collection (hasNext/next/remove). Distinct from the JS iterator protocol, which collections also implement. */
export interface Iterator<E> {
  hasNext(): boolean;
  /** @throws NoSuchElementException when exhausted */
  next(): E;
  /** @throws IllegalStateException if next() was not called, or remove() already called */
  remove(): void;
  forEachRemaining(action: (e: E) => void): void;
}

/** Legacy cursor (Vector.elements, Collections.enumeration). Not fail-fast. */
export interface Enumeration<E> {
  hasMoreElements(): boolean;
  /** @throws NoSuchElementException when exhausted */
  nextElement(): E;
  /** Adapts this enumeration to an Iterator whose remove() throws UnsupportedOperationException. */
  asIterator(): Iterator<E>;
}

/** ListIterator */
export interface ListIterator<E> extends Iterator<E> {
  hasPrevious(): boolean;
  previous(): E;
  nextIndex(): number;
  previousIndex(): number;
  set(e: E): void;
  add(e: E): void;
}

