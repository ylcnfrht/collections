import { AbstractList } from '../abstracts/AbstractList';
import {
  NoSuchElementException,
  NullPointerException,
} from '../exceptions/exceptions';
import { IComparator } from '../interfaces/IComparator';
import { IList } from '../interfaces/Ilist';
import { IUnaryOperator } from '../interfaces/IUnaryOperator';

export class ArrayList<E> extends AbstractList<E> {
  constructor() {
    super();
  }

  remove(): E;
  remove(o: E): boolean;
  remove(arg?: E): E | boolean {
    if (arg === undefined) {
      if (this.isEmpty()) throw new NoSuchElementException();
      return this.removeAt(0);
    } else {
      const index = this.items.indexOf(arg);
      if (index !== -1) {
        this.items.splice(index, 1);
        return true;
      }
      return false;
    }
  }

  public removeAt(index: number): E {
    this.rangeCheck(index);

    const removedElement = this.items[index];
    this.items.splice(index, 1);

    return removedElement;
  }

  public get(index: number): E {
    this.rangeCheck(index);

    return this.getElementData(index);
  }

  public set(index: number, element: E) {
    const oldValue: E = this.getElementData(index);
    this.items[index] = element;
    return oldValue;
  }

  public add(e: E): boolean;
  public add(index: number, e: E): void;
  public add(arg1: number | E, arg2?: E): boolean | void {
    if (typeof arg1 === 'number' && arg2 !== undefined) {
      this.addAt(arg1, arg2);
    } else if (arg2 === undefined) {
      this.addAt(this.size(), arg1 as E);
      return true;
    }
  }

  public addAt(index: number, e: E): void {
    this.items.splice(index, 0, e);
  }

  public size(): number {
    return this.items.length;
  }

  replaceAll(operator: IUnaryOperator<E>): void {
    for (let i = 0; i < this.size(); i++) {
      this.set(i, operator(this.get(i)));
    }
  }

  sort(comparator: IComparator<E>): void {
    this.items.sort((a, b) => comparator.compare(a, b));
  }

  addFirst(e: E): void {
    if (e === null) throw new NullPointerException();
    this.addAt(0, e);
  }

  addLast(e: E): void {
    if (e === null) throw new NullPointerException();
    this.addAt(this.size(), e);
  }

  getFirst(): E {
    if (this.isEmpty()) throw new NoSuchElementException();
    return this.get(0);
  }

  getLast(): E {
    if (this.isEmpty()) throw new NoSuchElementException();
    return this.get(this.size() - 1);
  }

  removeFirst(): E {
    if (this.isEmpty()) throw new NoSuchElementException();
    return this.removeAt(0);
  }
  removeLast(): E {
    if (this.isEmpty()) throw new NoSuchElementException();
    return this.removeAt(this.size() - 1);
  }

  reversed(): E[] {
    return [...this.toArray()].reverse();
  }

  subList(fromIndex: number, toIndex: number): E[] {
    return this.items.slice(fromIndex, toIndex);
  }

  public arraysEqual<T>(a: T[], b: T[]): boolean {
    return a.length === b.length && a.every((val, index) => val === b[index]);
  }

  public removeRange<T>(array: T[], fromIndex: number, toIndex: number): void {
    array.splice(fromIndex, toIndex - fromIndex);
  }

  public indexOf(o: E): number {
    return this.items.indexOf(o);
  }

  public lastIndexOf(o: E): number {
    return this.items.lastIndexOf(o);
  }
}
