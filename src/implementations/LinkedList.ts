import { AbstractSequentialList } from '../abstracts/AbstractSequentialList';
import {
  IndexOutOfBoundsException,
  NoSuchElementException,
} from '../exceptions/exceptions';
import { ICollection } from '../interfaces/ICollection';
import { IList } from '../interfaces/Ilist';
import { ArrayList } from './ArrayList';
import { Node } from './Node';

export class LinkedList<E> extends AbstractSequentialList<E> implements IList<E> {
  addFirst(e: E): void {
    const node = new Node(e);
    node.next = this.head;
    this.head = node;

    if (this._size === 0) {
      this.tail = node;
    }

    this._size++;
  }

  add(e: E): boolean;
  add(index: number, e: E): void;
  add(arg1: number | E, arg2?: E): boolean | void {
    if (typeof arg1 === 'number' && arg2 !== undefined) {
      this.addAt(arg1, arg2);
    } else if (arg1 !== undefined) {
      this.addLast(arg1 as E);
      return true;
    }
  }

  getFirst(): E {
    if (!this.head) throw new NoSuchElementException();

    return this.head.value;
  }

  getLast(): E {
    if (!this.tail) throw new NoSuchElementException();

    return this.tail.value;
  }

  removeFirst(): E {
    if (!this.head) throw new NoSuchElementException();
    const value = this.head?.value;
    this.head = this.head?.next;
    this._size--;

    if (this._size === 0) {
      this.tail = null;
    }

    return value;
  }
  removeLast(): E {
    if (!this.head) throw new NoSuchElementException();

    if (this.head === this.tail) {
      const { value } = this.head;
      this.head = this.tail = null;
      this._size = 0;
      return value;
    }

    let node = this.head;
    while (node.next!.next) {
      node = node.next!;
    }

    const { value } = node.next!;
    node.next = null;
    this.tail = node;
    this._size--;
    return value;
  }

  private head: Node<E> | null = null;
  private tail: Node<E> | null = null;
  private _size: number = 0;

  size(): number {
    return this._size;
  }

  isEmpty(): boolean {
    return this._size === 0;
  }

  contains(e: E): boolean {
    let current = this.head;

    while (current) {
      if (current.value === e) return true;
      current = current.next;
    }

    return false;
  }

  toArray(): E[] {
    const array: E[] = [];
    this.forEach((value) => array.push(value));

    return array;
  }

  addLast(e: E): boolean {
    const node = new Node(e);

    if (!this.head) {
      this.head = node;
      this.tail = node;
    } else {
      this.tail!.next = node;
      this.tail = node;
    }

    this._size++;
    return true;
  }

  remove(): E;
  remove(e: E): boolean;
  remove(e?: E): E | boolean {
    if (e === undefined) {
      return this.removeFirst();
    }

    let current = this.head;
    let prev: Node<E> | null = null;

    while (current) {
      if (current.value === e) {
        if (prev) prev.next = current.next;
        else this.head = current.next;
        if (current === this.tail) this.tail = prev;

        this._size--;
        return true;
      }

      prev = current;
      current = current.next;
    }

    return false;
  }

  containsAll(c: ICollection<E>): boolean {
    let result = true;

    c.forEach((item) => {
      if (!this.contains(item)) {
        result = false;
      }
    });

    return result;
  }

  addAll(index: number | ICollection<E>, c?: ICollection<E>): boolean {
    if (index instanceof LinkedList) {
      c = index as ICollection<E>;
      c?.toArray().forEach((item) => this.add(item));
    } else if (typeof index === 'number' && c instanceof LinkedList) {
      if (index > this._size) throw new IndexOutOfBoundsException();
      c.toArray().forEach((item, idx) => this.addAt(index + idx, item));
    }
    return true;
  }

  addAt(index: number, item: E): void {
    if (index > this._size) throw new IndexOutOfBoundsException();

    let current = this.head;
    let currentIndex = 0;

    if (index === 0) {
      const newNode = new Node(item);
      newNode.next = this.head;
      this.head = newNode;
      this._size++;
      return;
    }

    while (current && currentIndex < index - 1) {
      current = current.next;
      currentIndex++;
    }

    if (current) {
      const newNode = new Node(item);
      newNode.next = current.next;
      current.next = newNode;
      this._size++;

      if (newNode.next === null) {
        this.tail = newNode;
      }
    }
  }

  removeIf(filter: (item: E) => boolean): boolean {
    let current = this.head;
    let removed = false;

    while (current) {
      if (filter(current.value)) {
        this.remove(current.value);
        removed = true;
      }
      current = current?.next;
    }

    return removed;
  }

  removeAll(c: ICollection<E>): boolean {
    let removed = false;
    c.forEach((item) => {
      if (this.remove(item)) {
        removed = true;
      }
    });

    return removed;
  }

  retainAll(c: ICollection<E>): boolean {
    let retained = false;
    let current = this.head;

    while (current) {
      if (!c.contains(current.value)) {
        this.remove(current.value);
        retained = true;
      }
      current = current.next;
    }

    return retained;
  }

  clear(): void {
    this.head = null;
    this.tail = null;
    this._size = 0;
  }
  equals(e: Object): boolean {
    if (!(e instanceof LinkedList)) return false;
    if (this._size !== e.size()) return false;

    let current = this.head;
    let otherCurrent = e.head;

    while (current) {
      if (current.value !== otherCurrent?.value) return false;
      current = current.next;
      otherCurrent = otherCurrent?.next;
    }

    return true;
  }

  hashCode(): number {
    let hash = 0;
    let current = this.head;

    while (current) {
      hash = (hash * 31 + (current.value as unknown as number)) & 0xffffffff;
      current = current.next;
    }

    return hash;
  }

  forEach(action: (item: E) => void): void {
    let current = this.head;

    while (current) {
      action(current.value);
      current = current.next;
    }
  }

  reversed(): E[] {
    const result: E[] = [];
    let current = this.head;

    while (current) {
      result.push(current.value);
      current = current.next;
    }

    return result.reverse();
  }
}
