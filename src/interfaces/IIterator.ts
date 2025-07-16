export interface IIterator<E> {
  hasNext(): boolean;
  next(): E;
  remove(): void;
  forEachRemaining(action: (element: E) => void): void;
}
