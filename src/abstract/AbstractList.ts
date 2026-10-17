import {
  ConcurrentModificationException,
  IllegalArgumentException,
  IllegalStateException,
  IndexOutOfBoundsException,
  NoSuchElementException,
  UnsupportedOperationException,
} from '../exceptions';
import { Collection } from '../interfaces/Collection';
import { Iterator, ListIterator } from '../interfaces/Iterator';
import { List } from '../interfaces/List';
import { Comparator, stableSort } from '../util/Comparator';
import { isList } from '../util/guards';
import { checkIndex, checkPositionIndex, equals, hashCode, requireNonNull } from '../util/Objects';
import { AbstractCollection } from './AbstractCollection';

/**
 * Skeleton of AbstractList for random-access storage.
 *
 * Subclasses implement get(i) and size(); modifiable ones override set(i, e),
 * addAtIndex(i, e) and removeAt(i), and MUST increment `modCount` on every
 * structural change (add/remove) so iterators and subLists fail fast.
 */
export abstract class AbstractList<E> extends AbstractCollection<E> implements List<E> {
  /** @internal Structural modification counter used by fail-fast iterators. */
  modCount = 0;

  abstract get(index: number): E;

  set(_index: number, _e: E): E {
    throw new UnsupportedOperationException();
  }

  /** Positional insert behind add(index, e). Override this instead of the overloaded add(). */
  protected addAtIndex(_index: number, _e: E): void {
    throw new UnsupportedOperationException();
  }

  removeAt(_index: number): E {
    throw new UnsupportedOperationException();
  }

  override add(e: E): boolean;
  override add(index: number, e: E): void;
  override add(a: E | number, b?: E): boolean | void {
    if (arguments.length >= 2) {
      this.addAtIndex(a as number, b as E);
      return;
    }
    this.addAtIndex(this.size(), a as E);
    return true;
  }

  override addAll(c: Collection<E>): boolean;
  override addAll(index: number, c: Collection<E>): boolean;
  override addAll(a: Collection<E> | number, b?: Collection<E>): boolean {
    if (arguments.length >= 2) return this.addAllAt(a as number, b as Collection<E>);
    return this.addAllAt(this.size(), a as Collection<E>);
  }

  /** Positional bulk insert behind addAll(index, c). Subclasses may override for bulk efficiency. */
  protected addAllAt(index: number, c: Collection<E>): boolean {
    checkPositionIndex(index, this.size());
    requireNonNull(c);
    const arr = c.toArray();
    for (const e of arr) this.addAtIndex(index++, e);
    return arr.length > 0;
  }

  indexOf(o: unknown): number {
    const it = this.listIterator();
    while (it.hasNext()) if (equals(o, it.next())) return it.previousIndex();
    return -1;
  }

  lastIndexOf(o: unknown): number {
    const it = this.listIterator(this.size());
    while (it.hasPrevious()) if (equals(o, it.previous())) return it.nextIndex();
    return -1;
  }

  override clear(): void {
    this.removeRange(0, this.size());
  }

  /** Removes [fromIndex, toIndex). Public so views can delegate. */
  removeRange(fromIndex: number, toIndex: number): void {
    const it = this.listIterator(fromIndex);
    for (let i = 0, n = toIndex - fromIndex; i < n; i++) {
      it.next();
      it.remove();
    }
  }

  iterator(): Iterator<E> {
    return new Itr(this);
  }

  listIterator(index = 0): ListIterator<E> {
    checkPositionIndex(index, this.size());
    return new ListItr(this, index);
  }

  subList(fromIndex: number, toIndex: number): List<E> {
    subListRangeCheck(fromIndex, toIndex, this.size());
    return new SubList(this, null, 0, fromIndex, toIndex);
  }

  replaceAll(operator: (e: E) => E): void {
    requireNonNull(operator);
    const it = this.listIterator();
    while (it.hasNext()) it.set(operator(it.next()));
  }

  sort(c: Comparator<E> | null = null): void {
    const a = stableSort(this.toArray(), c);
    const it = this.listIterator();
    for (const e of a) {
      it.next();
      it.set(e);
    }
  }

  // SequencedCollection

  addFirst(e: E): void {
    this.add(0, e);
  }

  addLast(e: E): void {
    this.add(e);
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

  reversed(): List<E> {
    return new ReversedList(this);
  }

  // Object

  override equals(o: unknown): boolean {
    if (o === this) return true;
    if (!isList(o)) return false;
    const a = this.listIterator();
    const b = o.listIterator();
    while (a.hasNext() && b.hasNext()) if (!equals(a.next(), b.next())) return false;
    return !(a.hasNext() || b.hasNext());
  }

  override hashCode(): number {
    let h = 1;
    const it = this.iterator();
    while (it.hasNext()) {
      const e = it.next();
      h = (Math.imul(31, h) + ((e as unknown) === this ? 0 : hashCode(e))) | 0;
    }
    return h;
  }
}

export function subListRangeCheck(fromIndex: number, toIndex: number, size: number): void {
  if (fromIndex < 0) throw new IndexOutOfBoundsException(`fromIndex = ${fromIndex}`);
  if (toIndex > size) throw new IndexOutOfBoundsException(`toIndex = ${toIndex}`);
  if (fromIndex > toIndex) throw new IllegalArgumentException(`fromIndex(${fromIndex}) > toIndex(${toIndex})`);
}

class Itr<E> implements Iterator<E> {
  protected cursor = 0;
  protected lastRet = -1;
  protected expectedModCount: number;

  constructor(protected readonly list: AbstractList<E>) {
    this.expectedModCount = list.modCount;
  }

  hasNext(): boolean {
    return this.cursor !== this.list.size();
  }

  next(): E {
    this.checkForComodification();
    const i = this.cursor;
    if (i >= this.list.size()) throw new NoSuchElementException();
    const e = this.list.get(i);
    this.lastRet = i;
    this.cursor = i + 1;
    return e;
  }

  remove(): void {
    if (this.lastRet < 0) throw new IllegalStateException();
    this.checkForComodification();
    this.list.removeAt(this.lastRet);
    if (this.lastRet < this.cursor) this.cursor--;
    this.lastRet = -1;
    this.expectedModCount = this.list.modCount;
  }

  forEachRemaining(action: (e: E) => void): void {
    requireNonNull(action);
    while (this.hasNext()) action(this.next());
  }

  protected checkForComodification(): void {
    if (this.list.modCount !== this.expectedModCount) throw new ConcurrentModificationException();
  }
}

class ListItr<E> extends Itr<E> implements ListIterator<E> {
  constructor(list: AbstractList<E>, index: number) {
    super(list);
    this.cursor = index;
  }

  hasPrevious(): boolean {
    return this.cursor !== 0;
  }

  previous(): E {
    this.checkForComodification();
    const i = this.cursor - 1;
    if (i < 0) throw new NoSuchElementException();
    const e = this.list.get(i);
    this.lastRet = this.cursor = i;
    return e;
  }

  nextIndex(): number {
    return this.cursor;
  }

  previousIndex(): number {
    return this.cursor - 1;
  }

  set(e: E): void {
    if (this.lastRet < 0) throw new IllegalStateException();
    this.checkForComodification();
    this.list.set(this.lastRet, e);
    this.expectedModCount = this.list.modCount;
  }

  add(e: E): void {
    this.checkForComodification();
    this.list.add(this.cursor++, e);
    this.lastRet = -1;
    this.expectedModCount = this.list.modCount;
  }
}

/** Live view of root[offset, offset + size). Detects structural changes made around it. */
class SubList<E> extends AbstractList<E> {
  private readonly offset: number;
  private _size: number;

  constructor(
    private readonly root: AbstractList<E>,
    private readonly parent: SubList<E> | null,
    parentOffset: number,
    fromIndex: number,
    toIndex: number
  ) {
    super();
    this.offset = parentOffset + fromIndex;
    this._size = toIndex - fromIndex;
    this.modCount = root.modCount;
  }

  size(): number {
    this.checkForComodification();
    return this._size;
  }

  get(index: number): E {
    checkIndex(index, this._size);
    this.checkForComodification();
    return this.root.get(this.offset + index);
  }

  override set(index: number, e: E): E {
    checkIndex(index, this._size);
    this.checkForComodification();
    return this.root.set(this.offset + index, e);
  }

  protected override addAtIndex(index: number, e: E): void {
    checkPositionIndex(index, this._size);
    this.checkForComodification();
    this.root.add(this.offset + index, e);
    this.updateSizeAndModCount(1);
  }

  override removeAt(index: number): E {
    checkIndex(index, this._size);
    this.checkForComodification();
    const e = this.root.removeAt(this.offset + index);
    this.updateSizeAndModCount(-1);
    return e;
  }

  override removeRange(fromIndex: number, toIndex: number): void {
    this.checkForComodification();
    this.root.removeRange(this.offset + fromIndex, this.offset + toIndex);
    this.updateSizeAndModCount(fromIndex - toIndex);
  }

  protected override addAllAt(index: number, c: Collection<E>): boolean {
    checkPositionIndex(index, this._size);
    requireNonNull(c);
    const n = c.size();
    if (n === 0) return false;
    this.checkForComodification();
    this.root.addAll(this.offset + index, c);
    this.updateSizeAndModCount(n);
    return true;
  }

  override subList(fromIndex: number, toIndex: number): List<E> {
    subListRangeCheck(fromIndex, toIndex, this.size());
    return new SubList(this.root, this, this.offset, fromIndex, toIndex);
  }

  private checkForComodification(): void {
    if (this.root.modCount !== this.modCount) throw new ConcurrentModificationException();
  }

  private updateSizeAndModCount(delta: number): void {
    for (let s: SubList<E> | null = this; s; s = s.parent) {
      s._size += delta;
      s.modCount = this.root.modCount;
    }
  }
}

/** Live reverse-ordered view (List.reversed()). Iterators delegate to the base list so they stay fail-fast. */
export class ReversedList<E> extends AbstractList<E> {
  constructor(private readonly base: List<E>) {
    super();
  }

  size(): number {
    return this.base.size();
  }

  get(index: number): E {
    checkIndex(index, this.size());
    return this.base.get(this.size() - 1 - index);
  }

  override set(index: number, e: E): E {
    checkIndex(index, this.size());
    return this.base.set(this.size() - 1 - index, e);
  }

  protected override addAtIndex(index: number, e: E): void {
    checkPositionIndex(index, this.size());
    this.base.add(this.size() - index, e);
  }

  override removeAt(index: number): E {
    checkIndex(index, this.size());
    return this.base.removeAt(this.size() - 1 - index);
  }

  override iterator(): Iterator<E> {
    return this.listIterator();
  }

  override listIterator(index = 0): ListIterator<E> {
    checkPositionIndex(index, this.size());
    return new ReverseListItr(this.base, this.base.listIterator(this.size() - index));
  }

  override reversed(): List<E> {
    return this.base;
  }
}

class ReverseListItr<E> implements ListIterator<E> {
  constructor(private readonly base: List<E>, private readonly it: ListIterator<E>) {}
  hasNext(): boolean {
    return this.it.hasPrevious();
  }
  next(): E {
    return this.it.previous();
  }
  hasPrevious(): boolean {
    return this.it.hasNext();
  }
  previous(): E {
    return this.it.next();
  }
  nextIndex(): number {
    return this.base.size() - this.it.nextIndex();
  }
  previousIndex(): number {
    return this.nextIndex() - 1;
  }
  remove(): void {
    this.it.remove();
  }
  set(e: E): void {
    this.it.set(e);
  }
  add(e: E): void {
    // base add() leaves the new element behind the base cursor; step back so it sits behind ours
    this.it.add(e);
    this.it.previous();
  }
  forEachRemaining(action: (e: E) => void): void {
    requireNonNull(action);
    while (this.hasNext()) action(this.next());
  }
}
