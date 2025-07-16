export interface IIterable<E> {
  forEach(action: (item: E) => void): void;
}
