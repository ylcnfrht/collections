import { ICollection } from './ICollection';
import { IComparator } from './IComparator';
import { ISequencedCollection } from './ISequencedCollection';
import { IUnaryOperator } from './IUnaryOperator';

export interface IList<E> extends ISequencedCollection<E> {
  size(): number;
  isEmpty(): boolean;
  contains(e: E): boolean;
  // iterator<E>(): IIterator<E>;
  toArray(): E[];
  toArray<T>(a: T[]): T[];
  add(e: E): boolean;
  addFirst(e: E): void;
  containsAll(c: ICollection<E>): boolean;
  addAll<T extends E>(collection: ICollection<T>): boolean;
  addAll(index: number, collection: ICollection<E>): boolean;
  removeAll(c: ICollection<E>): boolean;
  retainAll(c: ICollection<E>): boolean;
  replaceAll(operator: IUnaryOperator<E>): void; // TODO
  sort(comparator: IComparator<E>): void;
  clear(): void;
  equals(o: Object): boolean;
  hashCode(): number;
  get(index: number): E;
  set(index: number, element: E): E;
  set(index: number, element: E): void;
  remove(): E;
  remove(o: E): boolean;
  removeAt(index: number): E;
  indexOf(o: E): number;
  lastIndexOf(o: E): number;
  // lastIterator(index: number): IListIterator<E>;
  // subList(fromIndex: number, toIndex: number): IList<E>;
  subList(fromIndex: number, toIndex: number): E[];
  // spliterator(): ISpliterator<E>;
}
