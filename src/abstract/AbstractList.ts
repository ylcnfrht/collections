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
import { BaseSpliterator, Spliterator } from '../stream/Spliterator';
import { IteratorSpliterator } from '../stream/Spliterators';
import { toArrayWith, WritableArrayLike } from '../util/arrays';
import { Comparator, reverseOrder, stableSort } from '../util/Comparator';
import { isList, isRandomAccess, RANDOM_ACCESS } from '../util/guards';
import { checkFromToIndex, checkIndex, checkPositionIndex, equals, hashCode, requireNonNull } from '../util/Objects';
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

  /**
   * Removes [fromIndex, toIndex). Public so views can delegate.
   * @throws IndexOutOfBoundsException for a bad range, before anything is removed
   */
  removeRange(fromIndex: number, toIndex: number): void {
    removeRangeCheck(fromIndex, toIndex, this.size());
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

  /**
   * ORDERED|SIZED|SUBSIZED. RandomAccess lists get a late-binding, fail-fast, index-based spliterator
   * that splits in halves; others one over iterator().
   */
  override spliterator(): Spliterator<E> {
    if (isRandomAccess(this)) return new RandomAccessSpliterator(this);
    return new IteratorSpliterator(this, null, -1, ORDERED_SIZED);
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
    return ReverseOrderListView.of(this, true);
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

const ORDERED_SIZED = Spliterator.ORDERED | Spliterator.SIZED | Spliterator.SUBSIZED;

/** Index-based spliterator over a random-access AbstractList, bound to its size and modCount at first use. */
class RandomAccessSpliterator<E> extends BaseSpliterator<E> {
  constructor(
    private readonly list: AbstractList<E>,
    private index = 0,
    private fence = -1,
    private expectedModCount = 0
  ) {
    super();
  }

  private getFence(): number {
    if (this.fence < 0) {
      this.expectedModCount = this.list.modCount;
      this.fence = this.list.size();
    }
    return this.fence;
  }

  private get(i: number): E {
    try {
      return this.list.get(i);
    } catch (e) {
      if (e instanceof IndexOutOfBoundsException) throw new ConcurrentModificationException();
      throw e;
    }
  }

  private check(): void {
    if (this.list.modCount !== this.expectedModCount) throw new ConcurrentModificationException();
  }

  override trySplit(): Spliterator<E> | null {
    const hi = this.getFence();
    const lo = this.index;
    const mid = (lo + hi) >>> 1;
    if (lo >= mid) return null;
    this.index = mid;
    return new RandomAccessSpliterator(this.list, lo, mid, this.expectedModCount);
  }

  tryAdvance(action: (e: E) => void): boolean {
    requireNonNull(action);
    const i = this.index;
    if (i >= this.getFence()) return false;
    this.index = i + 1;
    action(this.get(i));
    this.check();
    return true;
  }

  override forEachRemaining(action: (e: E) => void): void {
    requireNonNull(action);
    const hi = this.getFence();
    let i = this.index;
    this.index = hi;
    for (; i < hi; i++) action(this.get(i));
    this.check();
  }

  estimateSize(): number {
    return this.getFence() - this.index;
  }

  characteristics(): number {
    return ORDERED_SIZED;
  }
}

export function removeRangeCheck(fromIndex: number, toIndex: number, size: number): void {
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex < 0 || toIndex > size || fromIndex > toIndex) {
    throw new IndexOutOfBoundsException(`From Index: ${fromIndex} To Index: ${toIndex}, Size: ${size}`);
  }
}

export function subListRangeCheck(fromIndex: number, toIndex: number, size: number): void {
  if (!(fromIndex >= 0) || !Number.isInteger(fromIndex)) throw new IndexOutOfBoundsException(`fromIndex = ${fromIndex}`);
  if (!(toIndex <= size) || !Number.isInteger(toIndex)) throw new IndexOutOfBoundsException(`toIndex = ${toIndex}`);
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
    const i = this.cursor;
    this.list.add(i, e);
    // advance only once the add succeeded, so a refused add leaves the cursor put
    this.cursor = i + 1;
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

  get [RANDOM_ACCESS](): boolean {
    return isRandomAccess(this.root);
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

  /**
   * On an array-backed root, one pass: test every element first, then replace the range with the survivors
   * (removing one by one would shift the root's tail per hit). A throwing filter removes nothing; the survivors
   * go in before the old range comes out, so a root that cannot add loses nothing either.
   */
  override removeIf(filter: (e: E) => boolean): boolean {
    if (!isRandomAccess(this.root)) return super.removeIf(filter);
    requireNonNull(filter);
    this.checkForComodification();
    const a = this.toArray();
    const keep = a.filter((e) => !filter(e));
    this.checkForComodification();
    if (keep.length === a.length) return false;
    if (keep.length !== 0) this.addAll(0, new ArrayView(keep));
    this.removeRange(keep.length, keep.length + a.length);
    return true;
  }

  override removeRange(fromIndex: number, toIndex: number): void {
    removeRangeCheck(fromIndex, toIndex, this._size);
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

  override iterator(): Iterator<E> {
    return this.listIterator();
  }

  override listIterator(index = 0): ListIterator<E> {
    this.checkForComodification();
    checkPositionIndex(index, this._size);
    const it = this.root.listIterator(this.offset + index);
    const offset = this.offset;
    const self = this;
    const root = this.root as AbstractList<E> & { trimToSize?: unknown; elementAt?: unknown };
    // The reference's ArrayList sub-list iterator checks for comodification before its bounds;
    // other lists (Vector included) use AbstractList's, which checks bounds first.
    const checkFirst = root.trimToSize !== undefined && root.elementAt === undefined;
    let expectedModCount = root.modCount;
    const check = () => {
      if (checkFirst && root.modCount !== expectedModCount) throw new ConcurrentModificationException();
    };
    return {
      hasNext: () => it.nextIndex() - offset < self._size,
      next() {
        check();
        if (it.nextIndex() - offset >= self._size) throw new NoSuchElementException();
        return it.next();
      },
      hasPrevious: () => it.previousIndex() - offset >= 0,
      previous() {
        check();
        if (it.previousIndex() - offset < 0) throw new NoSuchElementException();
        return it.previous();
      },
      nextIndex: () => it.nextIndex() - offset,
      previousIndex: () => it.previousIndex() - offset,
      remove() {
        it.remove();
        expectedModCount = root.modCount;
        self.updateSizeAndModCount(-1);
      },
      set: (e: E) => it.set(e),
      add(e: E) {
        it.add(e);
        expectedModCount = root.modCount;
        self.updateSizeAndModCount(1);
      },
      forEachRemaining(action: (e: E) => void) {
        requireNonNull(action);
        while (this.hasNext()) action(this.next());
      },
    };
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

function checkClosedRange(index: number, size: number): void {
  if (!Number.isInteger(index) || index < 0 || index > size) throw new IndexOutOfBoundsException(`Index: ${index}, Size: ${size}`);
}

/**
 * The reference's reverse-ordered list view (List.reversed()); iterators delegate to the base list so they stay
 * fail-fast, and bulk operations run on the base in one pass. An unmodifiable one (List.of lists) throws
 * UnsupportedOperationException from every mutator before anything else; a modifiable one (the default
 * reversed() of Collections.unmodifiableList, emptyList, singletonList, nCopies) validates and delegates,
 * so the base decides whether the call fails.
 */
export class ReverseOrderListView<E> extends AbstractList<E> {
  static of<E>(list: List<E>, modifiable: boolean): List<E> {
    return list instanceof ReverseOrderListView ? list.base : new ReverseOrderListView(list, modifiable, isRandomAccess(list));
  }

  private constructor(readonly base: List<E>, private readonly modifiable: boolean, private readonly randomAccess: boolean) {
    super();
  }

  get [RANDOM_ACCESS](): boolean {
    return this.randomAccess;
  }

  private checkModifiable(): void {
    if (!this.modifiable) throw new UnsupportedOperationException();
  }

  size(): number {
    return this.base.size();
  }
  override isEmpty(): boolean {
    return this.base.isEmpty();
  }
  get(index: number): E {
    const n = this.base.size();
    checkIndex(index, n);
    return this.base.get(n - index - 1);
  }
  override contains(o: unknown): boolean {
    return this.base.contains(o);
  }
  override containsAll(c: Collection<unknown>): boolean {
    return this.base.containsAll(c);
  }
  override indexOf(o: unknown): number {
    const i = this.base.lastIndexOf(o);
    return i === -1 ? -1 : this.base.size() - i - 1;
  }
  override lastIndexOf(o: unknown): number {
    const i = this.base.indexOf(o);
    return i === -1 ? -1 : this.base.size() - i - 1;
  }
  override toArray(): E[];
  override toArray<A extends WritableArrayLike<E>>(generator: (length: number) => A): A;
  override toArray<A extends WritableArrayLike<E>>(generator?: (length: number) => A): E[] | A {
    const a = this.base.toArray().reverse();
    return arguments.length > 0 ? toArrayWith(a, generator as (length: number) => A) : a;
  }
  // for-each over this: the action is only dereferenced once there is an element
  override forEach(action: (e: E) => void): void {
    const it = this.iterator();
    while (it.hasNext()) requireNonNull(action)(it.next());
  }

  override iterator(): Iterator<E> {
    const it = this.base.listIterator(this.base.size());
    return {
      hasNext: () => it.hasPrevious(),
      next: () => it.previous(),
      remove: () => {
        this.checkModifiable();
        it.remove();
      },
      forEachRemaining(action: (e: E) => void): void {
        requireNonNull(action);
        while (it.hasPrevious()) action(it.previous());
      },
    };
  }

  override listIterator(index = 0): ListIterator<E> {
    const size = this.base.size();
    checkClosedRange(index, size);
    const base = this.base;
    const it = base.listIterator(size - index);
    const check = () => this.checkModifiable();
    // add() steps the base iterator back with previous(), which would let a following set()/remove() hit the
    // added element (the reference allows that); ListIterator specifies IllegalStateException there
    let afterAdd = false;
    const checkState = () => {
      if (afterAdd) throw new IllegalStateException();
    };
    return {
      hasNext: () => it.hasPrevious(),
      next(): E {
        const e = it.previous();
        afterAdd = false;
        return e;
      },
      hasPrevious: () => it.hasNext(),
      previous(): E {
        const e = it.next();
        afterAdd = false;
        return e;
      },
      nextIndex: () => base.size() - it.nextIndex(),
      previousIndex: () => base.size() - it.nextIndex() - 1,
      remove(): void {
        check();
        checkState();
        it.remove();
      },
      set(e: E): void {
        check();
        checkState();
        it.set(e);
      },
      add(e: E): void {
        check();
        it.add(e);
        it.previous();
        afterAdd = true;
      },
      forEachRemaining(action: (e: E) => void): void {
        requireNonNull(action);
        while (this.hasNext()) action(this.next());
      },
    };
  }

  override spliterator(): Spliterator<E> {
    return new IteratorSpliterator(this, null, -1, ORDERED_SIZED);
  }

  // add(e) and add(index, e) both land here: add(e) is base.add(0, e)
  protected override addAtIndex(index: number, e: E): void {
    this.checkModifiable();
    const size = this.base.size();
    checkClosedRange(index, size);
    this.base.add(size - index, e);
  }

  protected override addAllAt(index: number, c: Collection<E>): boolean {
    this.checkModifiable();
    const size = this.base.size();
    checkClosedRange(index, size);
    const adds = c.toArray();
    if (adds.length === 0) return false;
    this.base.addAll(size - index, new ArrayView(adds.reverse()));
    return true;
  }

  override clear(): void {
    this.checkModifiable();
    this.base.clear();
  }

  override remove(o: unknown): boolean {
    this.checkModifiable();
    return super.remove(o);
  }

  override removeAll(c: Collection<unknown>): boolean {
    this.checkModifiable();
    requireNonNull(c);
    return removeWhere(this, (e) => c.contains(e));
  }

  override retainAll(c: Collection<unknown>): boolean {
    this.checkModifiable();
    requireNonNull(c);
    return removeWhere(this, (e) => !c.contains(e));
  }

  override removeIf(filter: (e: E) => boolean): boolean {
    this.checkModifiable();
    return this.base.removeIf(filter);
  }

  override replaceAll(operator: (e: E) => E): void {
    this.checkModifiable();
    this.base.replaceAll(operator);
  }

  override sort(c: Comparator<E> | null = null): void {
    this.checkModifiable();
    this.base.sort(reverseOrder(c));
  }

  override set(index: number, e: E): E {
    this.checkModifiable();
    const n = this.base.size();
    checkIndex(index, n);
    return this.base.set(n - index - 1, e);
  }

  override removeAt(index: number): E {
    this.checkModifiable();
    const n = this.base.size();
    checkIndex(index, n);
    return this.base.removeAt(n - index - 1);
  }

  override subList(fromIndex: number, toIndex: number): List<E> {
    const n = this.base.size();
    checkFromToIndex(fromIndex, toIndex, n);
    // a plain view: the reference does not mark it RandomAccess
    return new ReverseOrderListView(this.base.subList(n - toIndex, n - fromIndex), this.modifiable, false);
  }

  override reversed(): List<E> {
    return this.base;
  }

  override removeRange(fromIndex: number, toIndex: number): void {
    this.checkModifiable();
    super.removeRange(fromIndex, toIndex);
  }
}

/** The reference's iterator-based removal loop (AbstractCollection.removeAll/retainAll), bypassing removeIf overrides. */
export function removeWhere<E>(c: Collection<E>, pred: (e: E) => boolean): boolean {
  const it = c.iterator();
  let modified = false;
  while (it.hasNext()) {
    if (pred(it.next())) {
      it.remove();
      modified = true;
    }
  }
  return modified;
}

/** Read-only list over an array, to hand a snapshot to addAll. */
class ArrayView<E> extends AbstractList<E> {
  constructor(private readonly a: E[]) {
    super();
  }
  get(index: number): E {
    checkIndex(index, this.a.length);
    return this.a[index];
  }
  size(): number {
    return this.a.length;
  }
}
