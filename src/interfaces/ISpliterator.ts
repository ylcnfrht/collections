export interface ISpliterator<E> {
  tryAdvance(action: (e: E) => void): boolean;
  forEachRemaining(action: (e: E) => void): void;
}
