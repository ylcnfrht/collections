export interface IListIterator<E> extends Iterator<E> {
  hasNext(): boolean;
  next(): IteratorResult<E, any>;
  hasPrevious(): boolean;
  previous(): E;
  nextIndex(): number;
  previousIndex(): number;
  remove(): void;
  set(e: E): void;
  add(e: E): void;
}
