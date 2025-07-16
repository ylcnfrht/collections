import { ICollection } from './ICollection';

export interface ISequencedCollection<E> extends ICollection<E> {
  reversed(): E[];
  addFirst(e: E): void;
  addLast(e: E): void;
  getFirst(): E;
  getLast(): E;
  removeFirst(): E;
  removeLast(): E;
}
