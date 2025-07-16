import {
  IndexOutOfBoundsException,
  NoSuchElementException,
  NullPointerException,
} from '../exceptions/exceptions';
import { IComparator } from '../interfaces/IComparator';
import { IList } from '../interfaces/Ilist';
import { IUnaryOperator } from '../interfaces/IUnaryOperator';
import { AbstractCollection } from './AbstractCollection';

export abstract class AbstractList<E>
  extends AbstractCollection<E>
  implements IList<E>
{
  constructor() {
    super();
  }

  abstract size(): number;
  abstract get(index: number): E;
  abstract set(index: number, element: E): E;
  abstract remove(): E;
  abstract remove(o: E): boolean;

  add(e: E): boolean;
  add(index: number, e: E): void;
  add(a: number | E, b?: E): boolean | void {
    if (typeof a === 'number') {
      this.addAtIndex(a, b!);
    } else {
      return this.addElement(a);
    }
  }

  private addElement(e: E): boolean {
    this.addAtIndex(this.size(), e);
    return true;
  }

  private addAtIndex(index: number, e: E): void {
    throw new Error('Unsupported operation');
  }

  public removeAt(index: number): E {
    this.rangeCheck(index);

    const removedElement = this.items[index];
    this.items.splice(index, 1);

    return removedElement;
  }

  protected getElementData(index: number): E {
    return this.items[index];
  }

  public addAt(index: number, e: E): void {
    this.items.splice(index, 0, e);
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

  protected rangeCheck(index: number) {
    if (index < 0 || index >= this.size()) {
      throw new IndexOutOfBoundsException(this.outOfBoundsMsg(index));
    }
  }

  private outOfBoundsMsg(fromIndex: number, toIndex?: number): string {
    if (toIndex === undefined) {
      return 'Index: ' + fromIndex + ', Size: ' + this.size();
    }
    return 'From Index: ' + fromIndex + ' > To Index: ' + toIndex;
  }
}
