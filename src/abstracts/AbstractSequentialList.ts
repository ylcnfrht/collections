import { ICollection } from '../interfaces/ICollection';
import { AbstractList } from './AbstractList';

export abstract class AbstractSequentialList<E> extends AbstractList<E> {
  protected items: E[] = [];

  constructor() {
    super();
  }

  public get(index: number): E {
    if (index < 0 || index >= this.size()) {
      throw new Error(`IndexOutOfBoundsException: Index: ${index}`);
    }
    return this.items[index];
  }

  public set(index: number, element: E): E {
    if (index < 0 || index >= this.size()) {
      throw new Error(`IndexOutOfBoundsException: Index: ${index}`);
    }
    const oldValue = this.items[index];
    this.items[index] = element;
    return oldValue;
  }

  public add(e: E): boolean;
  public add(index: number, e: E): void;
  public add(arg1: number | E, arg2?: E): boolean | void {
    if (typeof arg1 === 'number' && arg2 !== undefined) {
      const index = arg1;
      const element = arg2;
      if (index < 0 || index > this.size()) {
        throw new Error(`IndexOutOfBoundsException: Index: ${index}`);
      }
      this.items.splice(index, 0, element);
    } else if (arg2 === undefined) {
      const element = arg1 as E;
      this.items.push(element);
      return true;
    }
  }

  public removeAt(index: number): E {
    if (index < 0 || index >= this.size()) {
      throw new Error(`IndexOutOfBoundsException: Index: ${index}`);
    }
    return this.items.splice(index, 1)[0];
  }

  public addAll(collection: ICollection<E>): boolean;
  public addAll(index: number, collection: ICollection<E>): boolean;
  public addAll(arg1: number | ICollection<E>, arg2?: ICollection<E>): boolean {
    if (typeof arg1 !== 'number' && arg2 === undefined) {
      const collection = arg1.toArray();
      if (!collection || collection.length === 0) return false;
      this.items.push(...collection);
      return true;
    } else if (typeof arg1 === 'number' && arg2 !== undefined) {
      const index = arg1;
      const collection = arg2.toArray();;
      if (index < 0 || index > this.size()) {
        throw new Error(`IndexOutOfBoundsException: Index: ${index}`);
      }
      if (!collection || collection.length === 0) return false;
      this.items.splice(index, 0, ...collection);
      return true;
    }
    throw new Error('Invalid arguments');
  }

  public iterator(): IterableIterator<E> {
    return this.items[Symbol.iterator]();
  }

  public size(): number {
    return this.items.length;
  }
}
