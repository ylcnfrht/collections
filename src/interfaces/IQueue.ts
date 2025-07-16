import { ICollection } from './ICollection';
export interface IQueue<E> extends Omit<ICollection<E>, 'remove'> {
  add(e: E): boolean;
  offer(e: E): boolean;
  remove(): E;
  poll(): E | null;
  element(): E;
  peek(): E | null;
}
