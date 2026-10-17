import { AbstractSequentialList } from '../abstract/AbstractSequentialList';
import { ReversedList } from '../abstract/AbstractList';
import { ConcurrentModificationException, IllegalStateException, NoSuchElementException } from '../exceptions';
import { Collection } from '../interfaces/Collection';
import { Iterator, ListIterator } from '../interfaces/Iterator';
import { List } from '../interfaces/List';
import { Deque } from '../interfaces/Queue';
import { Comparator, stableSort } from '../util/Comparator';
import { isList } from '../util/guards';
import { checkIndex, checkPositionIndex, equals, hashCode, requireNonNull, toString } from '../util/Objects';

class Node<E> {
  item: E;
  prev: Node<E> | null;
  next: Node<E> | null;
  constructor(prev: Node<E> | null, item: E, next: Node<E> | null) {
    this.item = item;
    this.prev = prev;
    this.next = next;
  }
}

// Objects.equals(o, x) without the call for primitive targets: === plus NaN === NaN.
function isPrimitive(o: unknown): boolean {
  return o === null || (typeof o !== 'object' && typeof o !== 'function');
}

/** Doubly linked List and Deque. Allows null and undefined elements. */
export class LinkedList<E> extends AbstractSequentialList<E> implements List<E>, Deque<E> {
  /** @internal */ first: Node<E> | null = null;
  /** @internal */ last: Node<E> | null = null;
  /** @internal */ _size = 0;

  constructor(c?: Collection<E>) {
    super();
    if (c !== undefined) this.addAllAt(0, c);
  }

  static of<E>(...xs: E[]): LinkedList<E> {
    const l = new LinkedList<E>();
    for (let i = 0; i < xs.length; i++) l.linkLast(xs[i]);
    return l;
  }

  /** Shallow independent copy. */
  clone(): LinkedList<E> {
    const c = new LinkedList<E>();
    for (let x = this.first; x !== null; x = x.next) c.linkLast(x.item);
    return c;
  }

  // linking

  /** @internal */
  linkLast(e: E): void {
    const l = this.last;
    const n = new Node<E>(l, e, null);
    this.last = n;
    if (l === null) this.first = n;
    else l.next = n;
    this._size++;
    this.modCount++;
  }

  /** @internal */
  linkFirst(e: E): void {
    const f = this.first;
    const n = new Node<E>(null, e, f);
    this.first = n;
    if (f === null) this.last = n;
    else f.prev = n;
    this._size++;
    this.modCount++;
  }

  /** @internal */
  linkBefore(e: E, succ: Node<E>): void {
    const pred = succ.prev;
    const n = new Node<E>(pred, e, succ);
    succ.prev = n;
    if (pred === null) this.first = n;
    else pred.next = n;
    this._size++;
    this.modCount++;
  }

  /** @internal */
  unlink(x: Node<E>): E {
    const e = x.item;
    const prev = x.prev;
    const next = x.next;
    if (prev === null) this.first = next;
    else {
      prev.next = next;
      x.prev = null;
    }
    if (next === null) this.last = prev;
    else {
      next.prev = prev;
      x.next = null;
    }
    x.item = undefined as E; // drop the reference for GC
    this._size--;
    this.modCount++;
    return e;
  }

  private unlinkFirst(f: Node<E>): E {
    const e = f.item;
    const next = f.next;
    f.item = undefined as E;
    f.next = null;
    this.first = next;
    if (next === null) this.last = null;
    else next.prev = null;
    this._size--;
    this.modCount++;
    return e;
  }

  private unlinkLast(l: Node<E>): E {
    const e = l.item;
    const prev = l.prev;
    l.item = undefined as E;
    l.prev = null;
    this.last = prev;
    if (prev === null) this.first = null;
    else prev.next = null;
    this._size--;
    this.modCount++;
    return e;
  }

  /** @internal Node at a valid index, walking from the nearer end. */
  node(index: number): Node<E> {
    if (index < this._size >> 1) {
      let x = this.first!;
      for (let i = 0; i < index; i++) x = x.next!;
      return x;
    }
    let x = this.last!;
    for (let i = this._size - 1; i > index; i--) x = x.prev!;
    return x;
  }

  private findFirst(o: unknown): Node<E> | null {
    if (isPrimitive(o)) {
      const nan = o !== o;
      for (let x = this.first; x !== null; x = x.next) if (x.item === o || (nan && x.item !== x.item)) return x;
    } else {
      for (let x = this.first; x !== null; x = x.next) if (equals(o, x.item)) return x;
    }
    return null;
  }

  private findLast(o: unknown): Node<E> | null {
    if (isPrimitive(o)) {
      const nan = o !== o;
      for (let x = this.last; x !== null; x = x.prev) if (x.item === o || (nan && x.item !== x.item)) return x;
    } else {
      for (let x = this.last; x !== null; x = x.prev) if (equals(o, x.item)) return x;
    }
    return null;
  }

  // Collection / List

  size(): number {
    return this._size;
  }

  override isEmpty(): boolean {
    return this._size === 0;
  }

  override add(e: E): boolean;
  override add(index: number, e: E): void;
  override add(a: E | number, b?: E): boolean | void {
    if (arguments.length >= 2) {
      this.addAtIndex(a as number, b as E);
      return;
    }
    this.linkLast(a as E);
    return true;
  }

  protected override addAtIndex(index: number, e: E): void {
    checkPositionIndex(index, this._size);
    if (index === this._size) this.linkLast(e);
    else this.linkBefore(e, this.node(index));
  }

  protected override addAllAt(index: number, c: Collection<E>): boolean {
    checkPositionIndex(index, this._size);
    requireNonNull(c);
    const a = c.toArray();
    const n = a.length;
    if (n === 0) return false;
    let succ: Node<E> | null;
    let pred: Node<E> | null;
    if (index === this._size) {
      succ = null;
      pred = this.last;
    } else {
      succ = this.node(index);
      pred = succ.prev;
    }
    for (let i = 0; i < n; i++) {
      const x = new Node<E>(pred, a[i], null);
      if (pred === null) this.first = x;
      else pred.next = x;
      pred = x;
    }
    if (succ === null) this.last = pred;
    else {
      pred!.next = succ;
      succ.prev = pred;
    }
    this._size += n;
    this.modCount++;
    return true;
  }

  override get(index: number): E {
    checkIndex(index, this._size);
    return this.node(index).item;
  }

  override set(index: number, e: E): E {
    checkIndex(index, this._size);
    const x = this.node(index);
    const old = x.item;
    x.item = e;
    return old;
  }

  override removeAt(index: number): E {
    checkIndex(index, this._size);
    return this.unlink(this.node(index));
  }

  override contains(o: unknown): boolean {
    return this.findFirst(o) !== null;
  }

  override indexOf(o: unknown): number {
    let i = 0;
    if (isPrimitive(o)) {
      const nan = o !== o;
      for (let x = this.first; x !== null; x = x.next, i++) if (x.item === o || (nan && x.item !== x.item)) return i;
    } else {
      for (let x = this.first; x !== null; x = x.next, i++) if (equals(o, x.item)) return i;
    }
    return -1;
  }

  override lastIndexOf(o: unknown): number {
    let i = this._size - 1;
    if (isPrimitive(o)) {
      const nan = o !== o;
      for (let x = this.last; x !== null; x = x.prev, i--) if (x.item === o || (nan && x.item !== x.item)) return i;
    } else {
      for (let x = this.last; x !== null; x = x.prev, i--) if (equals(o, x.item)) return i;
    }
    return -1;
  }

  override toArray(): E[] {
    const out = new Array<E>(this._size);
    let i = 0;
    for (let x = this.first; x !== null; x = x.next) out[i++] = x.item;
    return out;
  }

  override clear(): void {
    if (this._size === 0) return;
    // unlink every node so a stray iterator or node reference can't keep the whole chain alive
    for (let x = this.first; x !== null; ) {
      const next = x.next;
      x.item = undefined as E;
      x.prev = x.next = null;
      x = next;
    }
    this.first = this.last = null;
    this._size = 0;
    this.modCount++;
  }

  override forEach(action: (e: E) => void): void {
    requireNonNull(action);
    const mc = this.modCount;
    for (let x = this.first; x !== null; x = x.next) {
      action(x.item);
      if (this.modCount !== mc) throw new ConcurrentModificationException();
    }
  }

  override removeIf(filter: (e: E) => boolean): boolean {
    requireNonNull(filter);
    let expected = this.modCount;
    let removed = false;
    for (let x = this.first; x !== null; ) {
      const next = x.next;
      const hit = filter(x.item);
      if (this.modCount !== expected) throw new ConcurrentModificationException();
      if (hit) {
        this.unlink(x);
        expected++;
        removed = true;
      }
      x = next;
    }
    return removed;
  }

  override replaceAll(operator: (e: E) => E): void {
    requireNonNull(operator);
    const mc = this.modCount;
    for (let x = this.first; x !== null; x = x.next) {
      x.item = operator(x.item);
      if (this.modCount !== mc) throw new ConcurrentModificationException();
    }
  }

  override sort(c: Comparator<E> | null = null): void {
    const a = stableSort(this.toArray(), c);
    let i = 0;
    for (let x = this.first; x !== null; x = x.next) x.item = a[i++];
  }

  override iterator(): Iterator<E> {
    return new ListItr(this, 0);
  }

  override listIterator(index = 0): ListIterator<E> {
    checkPositionIndex(index, this._size);
    return new ListItr(this, index);
  }

  // plain iterator object instead of a generator: several times faster in for..of
  override [Symbol.iterator](): Generator<E> {
    return new ValueItr(this) as unknown as Generator<E>;
  }

  // SequencedCollection / Deque

  override addFirst(e: E): void {
    this.linkFirst(e);
  }

  override addLast(e: E): void {
    this.linkLast(e);
  }

  override getFirst(): E {
    const f = this.first;
    if (f === null) throw new NoSuchElementException();
    return f.item;
  }

  override getLast(): E {
    const l = this.last;
    if (l === null) throw new NoSuchElementException();
    return l.item;
  }

  override removeFirst(): E {
    const f = this.first;
    if (f === null) throw new NoSuchElementException();
    return this.unlinkFirst(f);
  }

  override removeLast(): E {
    const l = this.last;
    if (l === null) throw new NoSuchElementException();
    return this.unlinkLast(l);
  }

  offer(e: E): boolean {
    this.linkLast(e);
    return true;
  }

  offerFirst(e: E): boolean {
    this.linkFirst(e);
    return true;
  }

  offerLast(e: E): boolean {
    this.linkLast(e);
    return true;
  }

  poll(): E | null {
    const f = this.first;
    return f === null ? null : this.unlinkFirst(f);
  }

  pollFirst(): E | null {
    const f = this.first;
    return f === null ? null : this.unlinkFirst(f);
  }

  pollLast(): E | null {
    const l = this.last;
    return l === null ? null : this.unlinkLast(l);
  }

  peek(): E | null {
    const f = this.first;
    return f === null ? null : f.item;
  }

  peekFirst(): E | null {
    const f = this.first;
    return f === null ? null : f.item;
  }

  peekLast(): E | null {
    const l = this.last;
    return l === null ? null : l.item;
  }

  element(): E {
    return this.getFirst();
  }

  push(e: E): void {
    this.linkFirst(e);
  }

  pop(): E {
    return this.removeFirst();
  }

  /** remove() takes the head; remove(o) removes the first occurrence of o. */
  override remove(): E;
  override remove(o: unknown): boolean;
  override remove(o?: unknown): E | boolean {
    if (arguments.length === 0) return this.removeFirst();
    return this.removeFirstOccurrence(o);
  }

  removeFirstOccurrence(o: unknown): boolean {
    const x = this.findFirst(o);
    if (x === null) return false;
    this.unlink(x);
    return true;
  }

  removeLastOccurrence(o: unknown): boolean {
    const x = this.findLast(o);
    if (x === null) return false;
    this.unlink(x);
    return true;
  }

  descendingIterator(): Iterator<E> {
    return new DescendingItr(this);
  }

  override reversed(): ReversedLinkedList<E> {
    return new ReversedLinkedList(this);
  }

  // Object

  override equals(o: unknown): boolean {
    if (o === this) return true;
    if (!isList(o) || o.size() !== this._size) return false;
    if (o instanceof LinkedList) {
      let y: Node<unknown> | null = o.first;
      for (let x = this.first; x !== null; x = x.next, y = y!.next) if (!equals(x.item, y!.item)) return false;
      return true;
    }
    const it = o.listIterator();
    for (let x = this.first; x !== null; x = x.next) if (!it.hasNext() || !equals(x.item, it.next())) return false;
    return !it.hasNext();
  }

  override hashCode(): number {
    let h = 1;
    for (let x = this.first; x !== null; x = x.next) {
      const e = x.item as unknown;
      h = (Math.imul(31, h) + (e === this ? 0 : hashCode(e))) | 0;
    }
    return h;
  }

  override toString(): string {
    let s = '[';
    for (let x = this.first; x !== null; x = x.next) {
      if (x !== this.first) s += ', ';
      s += (x.item as unknown) === this ? '(this Collection)' : toString(x.item);
    }
    return s + ']';
  }
}

class ListItr<E> implements ListIterator<E> {
  private lastReturned: Node<E> | null = null;
  private nextNode: Node<E> | null;
  private nextIdx: number;
  private expectedModCount: number;

  constructor(private readonly list: LinkedList<E>, index: number) {
    this.nextNode = index === list._size ? null : list.node(index);
    this.nextIdx = index;
    this.expectedModCount = list.modCount;
  }

  hasNext(): boolean {
    return this.nextIdx < this.list._size;
  }

  next(): E {
    this.check();
    const x = this.nextNode;
    if (x === null) throw new NoSuchElementException();
    this.lastReturned = x;
    this.nextNode = x.next;
    this.nextIdx++;
    return x.item;
  }

  hasPrevious(): boolean {
    return this.nextIdx > 0;
  }

  previous(): E {
    this.check();
    if (this.nextIdx <= 0) throw new NoSuchElementException();
    const x = this.nextNode === null ? this.list.last! : this.nextNode.prev!;
    this.lastReturned = this.nextNode = x;
    this.nextIdx--;
    return x.item;
  }

  nextIndex(): number {
    return this.nextIdx;
  }

  previousIndex(): number {
    return this.nextIdx - 1;
  }

  remove(): void {
    const r = this.lastReturned;
    if (r === null) throw new IllegalStateException();
    this.check();
    const after = r.next;
    this.list.unlink(r);
    // after previous() the cursor sat on r; otherwise r was behind the cursor
    if (this.nextNode === r) this.nextNode = after;
    else this.nextIdx--;
    this.lastReturned = null;
    this.expectedModCount++;
  }

  set(e: E): void {
    if (this.lastReturned === null) throw new IllegalStateException();
    this.check();
    this.lastReturned.item = e;
  }

  add(e: E): void {
    this.check();
    this.lastReturned = null;
    if (this.nextNode === null) this.list.linkLast(e);
    else this.list.linkBefore(e, this.nextNode);
    this.nextIdx++;
    this.expectedModCount++;
  }

  forEachRemaining(action: (e: E) => void): void {
    requireNonNull(action);
    while (this.hasNext()) action(this.next());
  }

  private check(): void {
    if (this.list.modCount !== this.expectedModCount) throw new ConcurrentModificationException();
  }
}

/** JS-protocol iterator for for..of and spread, fail-fast like the others. */
class ValueItr<E> {
  private node: Node<E> | null;
  private readonly expectedModCount: number;

  constructor(private readonly list: LinkedList<E>) {
    this.node = list.first;
    this.expectedModCount = list.modCount;
  }

  next(): IteratorResult<E> {
    if (this.list.modCount !== this.expectedModCount) throw new ConcurrentModificationException();
    const x = this.node;
    if (x === null) return { done: true, value: undefined };
    this.node = x.next;
    return { done: false, value: x.item };
  }

  return(value?: unknown): IteratorResult<E> {
    this.node = null;
    return { done: true, value };
  }

  throw(e?: unknown): IteratorResult<E> {
    throw e;
  }

  [Symbol.iterator](): this {
    return this;
  }
}

class DescendingItr<E> implements Iterator<E> {
  private lastReturned: Node<E> | null = null;
  private nextNode: Node<E> | null;
  private expectedModCount: number;

  constructor(private readonly list: LinkedList<E>) {
    this.nextNode = list.last;
    this.expectedModCount = list.modCount;
  }

  hasNext(): boolean {
    return this.nextNode !== null;
  }

  next(): E {
    this.check();
    const x = this.nextNode;
    if (x === null) throw new NoSuchElementException();
    this.lastReturned = x;
    this.nextNode = x.prev;
    return x.item;
  }

  remove(): void {
    const r = this.lastReturned;
    if (r === null) throw new IllegalStateException();
    this.check();
    this.list.unlink(r);
    this.lastReturned = null;
    this.expectedModCount++;
  }

  forEachRemaining(action: (e: E) => void): void {
    requireNonNull(action);
    while (this.hasNext()) action(this.next());
  }

  private check(): void {
    if (this.list.modCount !== this.expectedModCount) throw new ConcurrentModificationException();
  }
}

/** Live reverse view of a LinkedList: a List (via ReversedList) and a Deque with mirrored ends. */
export class ReversedLinkedList<E> extends ReversedList<E> implements Deque<E> {
  constructor(private readonly list: LinkedList<E>) {
    super(list);
  }

  override reversed(): LinkedList<E> {
    return this.list;
  }

  override isEmpty(): boolean {
    return this.list.isEmpty();
  }

  override contains(o: unknown): boolean {
    return this.list.contains(o);
  }

  override toArray(): E[] {
    return this.list.toArray().reverse();
  }

  override clear(): void {
    this.list.clear();
  }

  override add(e: E): boolean;
  override add(index: number, e: E): void;
  override add(a: E | number, b?: E): boolean | void {
    if (arguments.length >= 2) {
      this.addAtIndex(a as number, b as E);
      return;
    }
    this.list.linkFirst(a as E);
    return true;
  }

  override addFirst(e: E): void {
    this.list.linkLast(e);
  }

  override addLast(e: E): void {
    this.list.linkFirst(e);
  }

  override getFirst(): E {
    return this.list.getLast();
  }

  override getLast(): E {
    return this.list.getFirst();
  }

  override removeFirst(): E {
    return this.list.removeLast();
  }

  override removeLast(): E {
    return this.list.removeFirst();
  }

  offer(e: E): boolean {
    return this.list.offerFirst(e);
  }

  offerFirst(e: E): boolean {
    return this.list.offerLast(e);
  }

  offerLast(e: E): boolean {
    return this.list.offerFirst(e);
  }

  poll(): E | null {
    return this.list.pollLast();
  }

  pollFirst(): E | null {
    return this.list.pollLast();
  }

  pollLast(): E | null {
    return this.list.pollFirst();
  }

  peek(): E | null {
    return this.list.peekLast();
  }

  peekFirst(): E | null {
    return this.list.peekLast();
  }

  peekLast(): E | null {
    return this.list.peekFirst();
  }

  element(): E {
    return this.list.getLast();
  }

  push(e: E): void {
    this.list.addLast(e);
  }

  pop(): E {
    return this.list.removeLast();
  }

  override remove(): E;
  override remove(o: unknown): boolean;
  override remove(o?: unknown): E | boolean {
    if (arguments.length === 0) return this.list.removeLast();
    return this.list.removeLastOccurrence(o);
  }

  removeFirstOccurrence(o: unknown): boolean {
    return this.list.removeLastOccurrence(o);
  }

  removeLastOccurrence(o: unknown): boolean {
    return this.list.removeFirstOccurrence(o);
  }

  descendingIterator(): Iterator<E> {
    return this.list.iterator();
  }
}
