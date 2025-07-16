import { IIterable } from './IIterable';

export interface ICollection<E> extends IIterable<E> {
  size(): number;
  isEmpty(): boolean;
  contains(o: E): boolean;
  toArray(): E[];
  add(e: E): boolean;
  remove(o: E): boolean;
  // remove(o?: E): E | boolean;
  containsAll(c: ICollection<E>): boolean;
  addAll(index: number, c: ICollection<E>): boolean;
  addAll(c: ICollection<E>): boolean;
  removeIf(filter: (item: E) => boolean): boolean;
  removeAll(c: ICollection<E>): boolean;
  retainAll(c: ICollection<E>): boolean;
  clear(): void;
  equals(o: Object): boolean;
  hashCode(): number;
}
