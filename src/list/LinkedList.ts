import { AbstractSequentialList } from '../abstract/AbstractSequentialList';
import { ReverseOrderListView } from '../abstract/AbstractList';
import { ConcurrentModificationException, IllegalStateException, NoSuchElementException } from '../exceptions';
import { Collection } from '../interfaces/Collection';
import { Iterator, ListIterator } from '../interfaces/Iterator';
import { List } from '../interfaces/List';
import { Deque } from '../interfaces/Queue';
import { BaseSpliterator, Spliterator } from '../stream/Spliterator';
import { ArraySpliterator, BATCH_UNIT, IteratorSpliterator, MAX_BATCH } from '../stream/Spliterators';
import { toArrayWith, WritableArrayLike } from '../util/arrays';
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

/**
 * Doubly linked list that implements both {@link List} and {@link Deque}, so one object serves as a
 * list, a FIFO queue and a stack.
 *
 * Adding, removing and reading at either end is O(1), and so are `add`, `set` and `remove` through a
 * `ListIterator`. Positional access (`get`, `set`, `add(i, e)`, `removeAt`) walks from the nearer end,
 * O(min(i, n − i)). `contains`, `indexOf` and `remove(o)` are O(n).
 *
 * Permits `null` and `undefined` elements. Because `poll()` and `peek()` return `null` when the list
 * is empty, check `isEmpty()` when `null` may be stored. Iterates head to tail; iterators, `forEach`
 * and views are fail-fast.
 */
export class LinkedList<E> extends AbstractSequentialList<E> implements List<E>, Deque<E> {
  /** @internal */ first: Node<E> | null = null;
  /** @internal */ last: Node<E> | null = null;
  /** @internal */ _size = 0;

  /** Creates an empty list. */
  constructor();
  /**
   * Creates a list holding the elements of `c`, in its iteration order. O(n).
   * @throws {@link NullPointerException} if `c` is `null` or `undefined`
   */
  constructor(c: Collection<E>);
  constructor(c?: Collection<E>) {
    super();
    // an explicit undefined is a null collection: NullPointerException
    if (arguments.length > 0) this.addAllAt(0, c as Collection<E>);
  }

  /** Creates a mutable list holding `xs` in argument order; `null` and `undefined` are allowed. */
  static of<E>(...xs: E[]): LinkedList<E> {
    const l = new LinkedList<E>();
    for (let i = 0; i < xs.length; i++) l.linkLast(xs[i]);
    return l;
  }

  /** Returns a shallow, independent copy of the same runtime class, in O(n). */
  clone(): LinkedList<E> {
    const c = new (this.constructor as new () => LinkedList<E>)();
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

  /** Returns the number of elements. O(1). */
  size(): number {
    return this._size;
  }

  /** Returns `true` if this list has no elements. O(1). */
  override isEmpty(): boolean {
    return this._size === 0;
  }

  /**
   * Appends `e` at the tail, in O(1). `null` and `undefined` are allowed.
   * @returns always `true`
   */
  override add(e: E): boolean;
  /**
   * Inserts `e` at `index`, shifting the element there and all later ones one position to the right.
   * Walks from the nearer end: O(min(index, n − index)), then O(1) to link.
   * @throws {@link IndexOutOfBoundsException} if `index` < 0 or `index` > `size()`
   */
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

  /**
   * Returns the element at `index`. O(min(index, n − index)), walking from the nearer end.
   * @throws {@link IndexOutOfBoundsException} if `index` < 0 or `index` >= `size()`
   */
  override get(index: number): E {
    checkIndex(index, this._size);
    return this.node(index).item;
  }

  /**
   * Replaces the element at `index` with `e`. O(min(index, n − index)), walking from the nearer end;
   * not a structural change.
   * @returns the element previously at `index`
   * @throws {@link IndexOutOfBoundsException} if `index` < 0 or `index` >= `size()`
   */
  override set(index: number, e: E): E {
    checkIndex(index, this._size);
    const x = this.node(index);
    const old = x.item;
    x.item = e;
    return old;
  }

  /**
   * Removes the element at `index`. O(min(index, n − index)) to reach the node, then O(1) to unlink it.
   * @returns the removed element
   * @throws {@link IndexOutOfBoundsException} if `index` < 0 or `index` >= `size()`
   */
  override removeAt(index: number): E {
    checkIndex(index, this._size);
    return this.unlink(this.node(index));
  }

  /** Returns `true` if this list contains an element equal to `o` (by `Objects.equals`). O(n) scan from the head; `null` is allowed. */
  override contains(o: unknown): boolean {
    return this.findFirst(o) !== null;
  }

  /**
   * Returns the index of the first element equal to `o` (by `Objects.equals`), or -1 if there is none.
   * O(n) scan from the head; `NaN` matches `NaN`.
   */
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

  /**
   * Returns the index of the last element equal to `o` (by `Objects.equals`), or -1 if there is none.
   * O(n) scan from the tail; `NaN` matches `NaN`.
   */
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

  /** Returns a new array with all elements, head to tail. Changing the array does not affect this list. O(n). */
  override toArray(): E[];
  /**
   * Fills an array created by `generator(size())` with the elements head to tail, and returns it. O(n).
   * @param generator - creates the target array for a given length
   */
  override toArray<A extends WritableArrayLike<E>>(generator: (length: number) => A): A;
  override toArray<A extends WritableArrayLike<E>>(generator?: (length: number) => A): E[] | A {
    const out = new Array<E>(this._size);
    let i = 0;
    for (let x = this.first; x !== null; x = x.next) out[i++] = x.item;
    return arguments.length > 0 ? toArrayWith(out, generator as (length: number) => A) : out;
  }

  /** Removes all elements. O(n): unlinks every node, so a stray reference to one cannot keep the others alive. */
  override clear(): void {
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

  /**
   * Calls `action` for each element, head to tail.
   * @throws {@link NullPointerException} if `action` is null
   * @throws {@link ConcurrentModificationException} if `action` structurally modifies this list
   */
  override forEach(action: (e: E) => void): void {
    requireNonNull(action);
    const mc = this.modCount;
    for (let x = this.first; x !== null; x = x.next) {
      action(x.item);
      if (this.modCount !== mc) throw new ConcurrentModificationException();
    }
  }

  /**
   * Removes every element for which `filter` returns `true`. O(n), unlinking each match as it goes, so
   * elements removed before a throwing predicate stay removed.
   * @returns `true` if any element was removed
   * @throws {@link NullPointerException} if `filter` is null
   * @throws {@link ConcurrentModificationException} if `filter` structurally modifies this list
   */
  override removeIf(filter: (e: E) => boolean): boolean {
    requireNonNull(filter);
    let mc = this.modCount;
    let removed = false;
    for (let x = this.first; x !== null; ) {
      const hit = filter(x.item);
      if (this.modCount !== mc) throw new ConcurrentModificationException();
      const next = x.next;
      if (hit) {
        this.unlink(x);
        mc = this.modCount;
        removed = true;
      }
      x = next;
    }
    return removed;
  }

  /**
   * Replaces each element with the result of `operator` applied to it, head to tail. O(n); not a
   * structural change.
   * @throws {@link NullPointerException} if `operator` is null
   * @throws {@link ConcurrentModificationException} if `operator` structurally modifies this list
   */
  override replaceAll(operator: (e: E) => E): void {
    requireNonNull(operator);
    const mc = this.modCount;
    for (let x = this.first; x !== null; x = x.next) {
      x.item = operator(x.item);
      if (this.modCount !== mc) throw new ConcurrentModificationException();
    }
  }

  /** Returns a fail-fast iterator over the elements, head to tail. Its `remove` is O(1). */
  override iterator(): Iterator<E> {
    return new ListItr(this, 0);
  }

  /**
   * Returns a fail-fast list iterator starting at `index`: the first `next()` returns the element at
   * `index`. Reaching it takes O(min(index, n − index)); then `add`, `set` and `remove` through it are O(1).
   * @param index - start position, 0 by default
   * @throws {@link IndexOutOfBoundsException} if `index` < 0 or `index` > `size()`
   */
  override listIterator(index = 0): ListIterator<E> {
    checkPositionIndex(index, this._size);
    return new ListItr(this, index);
  }

  /** Returns a spliterator over the elements, used to build streams: `ORDERED | SIZED | SUBSIZED`, late-binding, fail-fast, splits off growing array batches. */
  override spliterator(): Spliterator<E> {
    return new LLSpliterator(this);
  }

  // plain iterator object instead of a generator: several times faster in for..of
  /** Returns a JS iterator over the elements, head to tail, for `for...of` and spread; fail-fast. */
  override [Symbol.iterator](): IterableIterator<E> {
    return new ValueItr(this);
  }

  // SequencedCollection / Deque

  /** Inserts `e` at the head, in O(1). `null` and `undefined` are allowed. */
  override addFirst(e: E): void {
    this.linkFirst(e);
  }

  /** Appends `e` at the tail, in O(1). `null` and `undefined` are allowed. */
  override addLast(e: E): void {
    this.linkLast(e);
  }

  /**
   * Returns the first element. O(1).
   * @throws {@link NoSuchElementException} if the list is empty
   */
  override getFirst(): E {
    const f = this.first;
    if (f === null) throw new NoSuchElementException();
    return f.item;
  }

  /**
   * Returns the last element. O(1).
   * @throws {@link NoSuchElementException} if the list is empty
   */
  override getLast(): E {
    const l = this.last;
    if (l === null) throw new NoSuchElementException();
    return l.item;
  }

  /**
   * Removes and returns the first element. O(1).
   * @throws {@link NoSuchElementException} if the list is empty
   */
  override removeFirst(): E {
    const f = this.first;
    if (f === null) throw new NoSuchElementException();
    return this.unlinkFirst(f);
  }

  /**
   * Removes and returns the last element. O(1).
   * @throws {@link NoSuchElementException} if the list is empty
   */
  override removeLast(): E {
    const l = this.last;
    if (l === null) throw new NoSuchElementException();
    return this.unlinkLast(l);
  }

  /**
   * Inserts `e` at the tail, in O(1). `null` and `undefined` are allowed.
   * @returns always `true`
   */
  offer(e: E): boolean {
    this.linkLast(e);
    return true;
  }

  /**
   * Inserts `e` at the head, in O(1). `null` and `undefined` are allowed.
   * @returns always `true`
   */
  offerFirst(e: E): boolean {
    this.linkFirst(e);
    return true;
  }

  /**
   * Inserts `e` at the tail, in O(1). `null` and `undefined` are allowed.
   * @returns always `true`
   */
  offerLast(e: E): boolean {
    this.linkLast(e);
    return true;
  }

  /** Removes and returns the head in O(1), or `null` if this list is empty (ambiguous when `null` is stored: check `isEmpty()`). */
  poll(): E | null {
    const f = this.first;
    return f === null ? null : this.unlinkFirst(f);
  }

  /** Removes and returns the first element in O(1), or `null` if this list is empty (ambiguous when `null` is stored: check `isEmpty()`). */
  pollFirst(): E | null {
    const f = this.first;
    return f === null ? null : this.unlinkFirst(f);
  }

  /** Removes and returns the last element in O(1), or `null` if this list is empty (ambiguous when `null` is stored: check `isEmpty()`). */
  pollLast(): E | null {
    const l = this.last;
    return l === null ? null : this.unlinkLast(l);
  }

  /** Returns the head without removing it, in O(1), or `null` if this list is empty (ambiguous when `null` is stored: check `isEmpty()`). */
  peek(): E | null {
    const f = this.first;
    return f === null ? null : f.item;
  }

  /** Returns the first element without removing it, in O(1), or `null` if this list is empty (ambiguous when `null` is stored: check `isEmpty()`). */
  peekFirst(): E | null {
    const f = this.first;
    return f === null ? null : f.item;
  }

  /** Returns the last element without removing it, in O(1), or `null` if this list is empty (ambiguous when `null` is stored: check `isEmpty()`). */
  peekLast(): E | null {
    const l = this.last;
    return l === null ? null : l.item;
  }

  /**
   * Returns the head without removing it, in O(1); same as `getFirst()`.
   * @throws {@link NoSuchElementException} if the list is empty
   */
  element(): E {
    return this.getFirst();
  }

  /** Pushes `e` onto the stack this list represents, that is, inserts it at the head; same as `addFirst(e)`. O(1). */
  push(e: E): void {
    this.linkFirst(e);
  }

  /**
   * Pops the top of the stack this list represents, that is, removes and returns the head; same as `removeFirst()`. O(1).
   * @throws {@link NoSuchElementException} if the list is empty
   */
  pop(): E {
    return this.removeFirst();
  }

  /**
   * Removes and returns the head; same as `removeFirst()`. O(1).
   * @throws {@link NoSuchElementException} if the list is empty
   */
  override remove(): E;
  /**
   * Removes the first element equal to `o` (by `Objects.equals`), if present; same as
   * `removeFirstOccurrence(o)`. O(n).
   * @returns `true` if an element was removed
   */
  override remove(o: unknown): boolean;
  override remove(o?: unknown): E | boolean {
    if (arguments.length === 0) return this.removeFirst();
    return this.removeFirstOccurrence(o);
  }

  /**
   * Removes the first element (from head to tail) equal to `o`. O(n) scan from the head, then O(1) to unlink.
   * @returns `true` if an element was removed
   */
  removeFirstOccurrence(o: unknown): boolean {
    const x = this.findFirst(o);
    if (x === null) return false;
    this.unlink(x);
    return true;
  }

  /**
   * Removes the last element (the first found from tail to head) equal to `o`. O(n) scan from the tail,
   * then O(1) to unlink.
   * @returns `true` if an element was removed
   */
  removeLastOccurrence(o: unknown): boolean {
    const x = this.findLast(o);
    if (x === null) return false;
    this.unlink(x);
    return true;
  }

  /** Returns a fail-fast iterator over the elements from tail to head. Its `remove` is O(1). */
  descendingIterator(): Iterator<E> {
    return new DescendingItr(this);
  }

  /**
   * Returns a live, reverse-ordered view in O(1). The view is itself a `LinkedList` whose reads and
   * writes go through to this list, with the ends swapped.
   */
  override reversed(): LinkedList<E> {
    return new ReverseOrderLinkedListView(this);
  }

  // Object

  /** Returns `true` if `o` is a {@link List} of any class with equal elements in the same order. O(n). */
  override equals(o: unknown): boolean {
    if (o === this) return true;
    if (!isList(o) || o.size() !== this._size) return false;
    if (o instanceof LinkedList && !(o instanceof ReverseOrderLinkedListView)) {
      let y: Node<unknown> | null = o.first;
      for (let x = this.first; x !== null; x = x.next, y = y!.next) if (!equals(x.item, y!.item)) return false;
      return true;
    }
    const it = o.listIterator();
    for (let x = this.first; x !== null; x = x.next) if (!it.hasNext() || !equals(x.item, it.next())) return false;
    return !it.hasNext();
  }

  /** Returns the list hash code, `h = 31 * h + hash(e)` from 1 in 32-bit arithmetic, consistent with `equals`. O(n). */
  override hashCode(): number {
    let h = 1;
    for (let x = this.first; x !== null; x = x.next) {
      const e = x.item as unknown;
      h = (Math.imul(31, h) + (e === this ? 0 : hashCode(e))) | 0;
    }
    return h;
  }

  /** Returns the elements head to tail as `[a, b, c]`; an element that is this list prints as `(this Collection)`. */
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
    this.check();
    const r = this.lastReturned;
    if (r === null) throw new IllegalStateException();
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
const LL_CHARACTERISTICS = Spliterator.ORDERED | Spliterator.SIZED | Spliterator.SUBSIZED;

class LLSpliterator<E> extends BaseSpliterator<E> {
  private current: Node<E> | null = null;
  private est = -1;
  private expectedModCount = 0;
  private batch = 0;

  constructor(private readonly list: LinkedList<E>) {
    super();
  }

  private getEst(): number {
    if (this.est < 0) {
      const l = this.list;
      this.expectedModCount = l.modCount;
      this.current = l.first;
      this.est = l._size;
    }
    return this.est;
  }

  estimateSize(): number {
    return this.getEst();
  }

  override trySplit(): Spliterator<E> | null {
    const s = this.getEst();
    let p = this.current;
    if (s > 1 && p !== null) {
      const n = Math.min(this.batch + BATCH_UNIT, s, MAX_BATCH);
      const a: E[] = [];
      let j = 0;
      do a[j++] = p.item;
      while ((p = p.next) !== null && j < n);
      this.current = p;
      this.batch = j;
      this.est = s - j;
      return new ArraySpliterator(a, 0, j, LL_CHARACTERISTICS);
    }
    return null;
  }

  override forEachRemaining(action: (e: E) => void): void {
    requireNonNull(action);
    let n = this.getEst();
    let p = this.current;
    if (n > 0 && p !== null) {
      this.current = null;
      this.est = 0;
      do {
        const e = p.item;
        p = p.next;
        action(e);
      } while (p !== null && --n > 0);
    }
    if (this.list.modCount !== this.expectedModCount) throw new ConcurrentModificationException();
  }

  tryAdvance(action: (e: E) => void): boolean {
    requireNonNull(action);
    const q = this.getEst() > 0 ? this.current : null;
    if (q === null) return false;
    this.est--;
    this.current = q.next;
    action(q.item);
    if (this.list.modCount !== this.expectedModCount) throw new ConcurrentModificationException();
    return true;
  }

  characteristics(): number {
    return LL_CHARACTERISTICS;
  }
}

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
    this.check();
    const r = this.lastReturned;
    if (r === null) throw new IllegalStateException();
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

/**
 * Live reverse-ordered view of a LinkedList (what reversed() returns). It is a LinkedList so
 * reversed() keeps its type, but every method mirrors onto `base`: the inherited first/last/_size
 * of the view itself stay empty and are never read.
 */
class ReverseOrderLinkedListView<E> extends LinkedList<E> {
  private readonly base: LinkedList<E>;

  constructor(base: LinkedList<E>) {
    super();
    this.base = base;
    // views built by inherited code (subList) watch the base's counter, so they stay fail-fast
    Object.defineProperty(this, 'modCount', { get: () => base.modCount, configurable: true });
  }

  override reversed(): LinkedList<E> {
    return this.base;
  }

  override clone(): LinkedList<E> {
    const c = new (this.base.constructor as new () => LinkedList<E>)();
    for (let x = this.base.last; x !== null; x = x.prev) c.addLast(x.item);
    return c;
  }

  // Collection / List

  override size(): number {
    return this.base.size();
  }

  override isEmpty(): boolean {
    return this.base.isEmpty();
  }

  override contains(o: unknown): boolean {
    return this.base.contains(o);
  }

  override add(e: E): boolean;
  override add(index: number, e: E): void;
  override add(a: E | number, b?: E): boolean | void {
    if (arguments.length >= 2) {
      this.addAtIndex(a as number, b as E);
      return;
    }
    this.base.addFirst(a as E);
    return true;
  }

  protected override addAtIndex(index: number, e: E): void {
    const n = this.base.size();
    checkPositionIndex(index, n);
    this.base.add(n - index, e);
  }

  protected override addAllAt(index: number, c: Collection<E>): boolean {
    const n = this.base.size();
    checkPositionIndex(index, n);
    const a = requireNonNull(c).toArray();
    const rev = new LinkedList<E>();
    for (let i = 0; i < a.length; i++) rev.linkFirst(a[i]);
    return this.base.addAll(n - index, rev);
  }

  override get(index: number): E {
    const n = this.base.size();
    checkIndex(index, n);
    return this.base.get(n - 1 - index);
  }

  override set(index: number, e: E): E {
    const n = this.base.size();
    checkIndex(index, n);
    return this.base.set(n - 1 - index, e);
  }

  override removeAt(index: number): E {
    const n = this.base.size();
    checkIndex(index, n);
    return this.base.removeAt(n - 1 - index);
  }

  override indexOf(o: unknown): number {
    const i = this.base.lastIndexOf(o);
    return i < 0 ? -1 : this.base.size() - 1 - i;
  }

  override lastIndexOf(o: unknown): number {
    const i = this.base.indexOf(o);
    return i < 0 ? -1 : this.base.size() - 1 - i;
  }

  override toArray(): E[];
  override toArray<A extends WritableArrayLike<E>>(generator: (length: number) => A): A;
  override toArray<A extends WritableArrayLike<E>>(generator?: (length: number) => A): E[] | A {
    const out = this.base.toArray().reverse();
    return arguments.length > 0 ? toArrayWith(out, generator as (length: number) => A) : out;
  }

  override clear(): void {
    this.base.clear();
  }

  override forEach(action: (e: E) => void): void {
    requireNonNull(action);
    const base = this.base;
    const mc = base.modCount;
    for (let x = base.last; x !== null; x = x.prev) {
      action(x.item);
      if (base.modCount !== mc) throw new ConcurrentModificationException();
    }
  }

  override removeIf(filter: (e: E) => boolean): boolean {
    return this.base.removeIf(filter);
  }

  /** On the base, in its order, as the reference (removeIf is delegated the same way). */
  override replaceAll(operator: (e: E) => E): void {
    this.base.replaceAll(operator);
  }

  override iterator(): Iterator<E> {
    return this.base.descendingIterator();
  }

  override listIterator(index = 0): ListIterator<E> {
    return ReverseOrderListView.of(this.base, true).listIterator(index);
  }

  override subList(fromIndex: number, toIndex: number): List<E> {
    return ReverseOrderListView.of(this.base, true).subList(fromIndex, toIndex);
  }

  override [Symbol.iterator](): IterableIterator<E> {
    const it = this.base.descendingIterator();
    const js: IterableIterator<E> = {
      next: (): IteratorResult<E> => (it.hasNext() ? { value: it.next(), done: false } : { value: undefined, done: true }),
      [Symbol.iterator]() {
        return this;
      },
    };
    return js;
  }

  // SequencedCollection / Deque, ends swapped

  override addFirst(e: E): void {
    this.base.addLast(e);
  }

  override addLast(e: E): void {
    this.base.addFirst(e);
  }

  override getFirst(): E {
    return this.base.getLast();
  }

  override getLast(): E {
    return this.base.getFirst();
  }

  override removeFirst(): E {
    return this.base.removeLast();
  }

  override removeLast(): E {
    return this.base.removeFirst();
  }

  override offer(e: E): boolean {
    return this.base.offerFirst(e);
  }

  override offerFirst(e: E): boolean {
    return this.base.offerLast(e);
  }

  override offerLast(e: E): boolean {
    return this.base.offerFirst(e);
  }

  override poll(): E | null {
    return this.base.pollLast();
  }

  override pollFirst(): E | null {
    return this.base.pollLast();
  }

  override pollLast(): E | null {
    return this.base.pollFirst();
  }

  override peek(): E | null {
    return this.base.peekLast();
  }

  override peekFirst(): E | null {
    return this.base.peekLast();
  }

  override peekLast(): E | null {
    return this.base.peekFirst();
  }

  override element(): E {
    return this.base.getLast();
  }

  override push(e: E): void {
    this.base.addLast(e);
  }

  override pop(): E {
    return this.base.removeLast();
  }

  override remove(): E;
  override remove(o: unknown): boolean;
  override remove(o?: unknown): E | boolean {
    if (arguments.length === 0) return this.base.removeLast();
    return this.base.removeLastOccurrence(o);
  }

  override removeFirstOccurrence(o: unknown): boolean {
    return this.base.removeLastOccurrence(o);
  }

  override removeLastOccurrence(o: unknown): boolean {
    return this.base.removeFirstOccurrence(o);
  }

  override descendingIterator(): Iterator<E> {
    return this.base.iterator();
  }

  /** ORDERED|SIZED|SUBSIZED over iterator(), as the reference's reverse-ordered view. */
  override spliterator(): Spliterator<E> {
    return new IteratorSpliterator(this, null, -1, LL_CHARACTERISTICS);
  }

  // Object

  override equals(o: unknown): boolean {
    if (o === this) return true;
    if (!isList(o) || o.size() !== this.base.size()) return false;
    const it = o.iterator();
    for (let x = this.base.last; x !== null; x = x.prev) if (!it.hasNext() || !equals(x.item, it.next())) return false;
    return !it.hasNext();
  }

  override hashCode(): number {
    let h = 1;
    for (let x = this.base.last; x !== null; x = x.prev) {
      const e = x.item as unknown;
      h = (Math.imul(31, h) + (e === this ? 0 : hashCode(e))) | 0;
    }
    return h;
  }

  override toString(): string {
    let s = '[';
    for (let x = this.base.last; x !== null; x = x.prev) {
      if (x !== this.base.last) s += ', ';
      s += (x.item as unknown) === this ? '(this Collection)' : toString(x.item);
    }
    return s + ']';
  }
}
