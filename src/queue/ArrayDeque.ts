import { AbstractCollection } from '../abstract/AbstractCollection';
import {
  ConcurrentModificationException,
  IllegalStateException,
  NoSuchElementException,
  NullPointerException,
} from '../exceptions';
import { Collection } from '../interfaces/Collection';
import { Iterator } from '../interfaces/Iterator';
import { Deque } from '../interfaces/Queue';
import { BaseSpliterator, Spliterator } from '../stream/Spliterator';
import { IteratorSpliterator } from '../stream/Spliterators';
import { toArrayWith, WritableArrayLike } from '../util/arrays';
import { equals, requireNonNull, toString } from '../util/Objects';

const MIN_CAPACITY = 8;
const DEFAULT_CAPACITY = 16;
const MAX_CAPACITY = 2 ** 30;

/**
 * Filler for vacated slots. A Smi holds no reference (so removed elements can be collected) and,
 * unlike undefined, keeps numeric buffers in V8's fast Smi/double elements kinds.
 * Code never reads a free slot as an element: emptiness comes from head/tail only.
 */
const FREE = 0;

// holey preallocation: filling to keep it packed costs more than the hole checks it saves. From 2^26 slots on,
// V8 makes a preallocated array a slow dictionary, so a bigger hint preallocates 2^25 and grows from there.
function slots(n: number): unknown[] {
  return new Array(Math.min(n, 2 ** 25));
}

/** Smallest power of two strictly greater than n (one slot always stays empty), at most MAX_CAPACITY. */
function capacityFor(n: number): number {
  if (!(n >= MIN_CAPACITY)) return MIN_CAPACITY;
  // the size argument is only a hint: clamp instead of rejecting
  if (n >= MAX_CAPACITY) return MAX_CAPACITY;
  let c = MIN_CAPACITY;
  while (c <= n) c *= 2;
  return c;
}

function isSmi(o: unknown): boolean {
  return typeof o === 'number' && (o | 0) === o && o >= -0x40000000 && o < 0x40000000 && 1 / o !== -Infinity;
}

function checkElement(e: unknown): void {
  if (e === null || e === undefined) throw new NullPointerException();
}

/**
 * Resizable circular-array (ring buffer) {@link Deque}: the general-purpose queue, deque and stack.
 *
 * Every operation at either end is O(1) (adds are amortized), with no per-element allocation.
 * `contains`, `remove(o)` and the `remove*Occurrence` methods are O(n); removing an inner element
 * shifts whichever side is shorter. Rejects `null` and `undefined` with {@link NullPointerException},
 * so a `null` from `poll()` or `peek()` always means empty. Iterates head to tail; iterators and
 * `forEach` are fail-fast.
 *
 * The buffer length is a power of two, at least 8 and 16 by default; one slot always stays free.
 * When it fills, it doubles in place, moving the shorter wrapped segment. It never shrinks:
 * `clear()` keeps the capacity.
 */
export class ArrayDeque<E> extends AbstractCollection<E> implements Deque<E> {
  /** @internal */ elements: unknown[];
  /** @internal */ head = 0;
  /** @internal */ tail = 0;
  /** @internal Structural modification counter used by fail-fast iterators. */
  modCount = 0;

  /** Creates an empty deque with the default 16-slot buffer. */
  constructor();
  /**
   * Creates an empty deque sized for `numElements`: the buffer is the smallest power of two greater
   * than `numElements` (at least 8, at most 2^30). It is only a hint: a negative or non-integer value
   * is not rejected, and the deque still grows past it.
   * @param numElements - expected number of elements
   */
  constructor(numElements: number);
  /**
   * Creates a deque holding the elements of `c`, in its iteration order (head first). O(n).
   * @throws {@link NullPointerException} if `c` is `null` or `undefined`, or holds `null` or `undefined`
   */
  constructor(c: Collection<E>);
  constructor(arg?: number | Collection<E>) {
    super();
    if (arguments.length === 0) {
      this.elements = slots(DEFAULT_CAPACITY);
    } else if (typeof arg === 'number') {
      this.elements = slots(capacityFor(arg));
    } else {
      const xs = requireNonNull(arg).toArray();
      this.elements = slots(capacityFor(xs.length));
      this.copyIn(xs);
    }
  }

  /**
   * Creates a deque holding `xs`, the first argument at the head.
   * @throws {@link NullPointerException} if any argument is `null` or `undefined`
   */
  static of<E>(...xs: E[]): ArrayDeque<E> {
    const d = new ArrayDeque<E>(xs.length);
    d.copyIn(xs);
    return d;
  }

  /** Returns a shallow, independent copy of the same runtime class (same capacity), in O(capacity). */
  clone(): ArrayDeque<E> {
    const d = new (this.constructor as new () => ArrayDeque<E>)();
    d.elements = this.elements.slice();
    d.head = this.head;
    d.tail = this.tail;
    return d;
  }

  // ---- size ----

  /** Returns the number of elements. O(1), computed from the head and tail indexes. */
  size(): number {
    return (this.tail - this.head) & (this.elements.length - 1);
  }

  /** Returns `true` if this deque has no elements. O(1). */
  override isEmpty(): boolean {
    return this.head === this.tail;
  }

  // ---- insertion ----

  /**
   * Inserts `e` at the front, in amortized O(1).
   * @throws {@link NullPointerException} if `e` is `null` or `undefined`
   */
  addFirst(e: E): void {
    if (e === null || e === undefined) throw new NullPointerException();
    const a = this.elements;
    const h = (this.head = (this.head - 1) & (a.length - 1));
    a[h] = e;
    this.modCount++;
    if (h === this.tail) this.grow();
  }

  /**
   * Inserts `e` at the end, in amortized O(1).
   * @throws {@link NullPointerException} if `e` is `null` or `undefined`
   */
  addLast(e: E): void {
    if (e === null || e === undefined) throw new NullPointerException();
    const a = this.elements;
    const t = this.tail;
    a[t] = e;
    this.modCount++;
    if ((this.tail = (t + 1) & (a.length - 1)) === this.head) this.grow();
  }

  /**
   * Inserts `e` at the front; same as `addFirst(e)`. Amortized O(1).
   * @returns always `true` (the deque is unbounded)
   * @throws {@link NullPointerException} if `e` is `null` or `undefined`
   */
  offerFirst(e: E): boolean {
    this.addFirst(e);
    return true;
  }

  /**
   * Inserts `e` at the end; same as `addLast(e)`. Amortized O(1).
   * @returns always `true` (the deque is unbounded)
   * @throws {@link NullPointerException} if `e` is `null` or `undefined`
   */
  offerLast(e: E): boolean {
    this.addLast(e);
    return true;
  }

  /**
   * Inserts `e` at the end; same as `addLast(e)`. Amortized O(1).
   * @returns always `true`
   * @throws {@link NullPointerException} if `e` is `null` or `undefined`
   */
  override add(e: E): boolean {
    this.addLast(e);
    return true;
  }

  /**
   * Inserts `e` at the end; same as `addLast(e)`. Amortized O(1).
   * @returns always `true` (the deque is unbounded)
   * @throws {@link NullPointerException} if `e` is `null` or `undefined`
   */
  offer(e: E): boolean {
    this.addLast(e);
    return true;
  }

  /**
   * Pushes `e` onto the stack this deque represents, that is, inserts it at the front; same as `addFirst(e)`. Amortized O(1).
   * @throws {@link NullPointerException} if `e` is `null` or `undefined`
   */
  push(e: E): void {
    this.addFirst(e);
  }

  /**
   * Appends every element of `c` at the end, in `c`'s iteration order. Every element is checked first,
   * so a rejected element leaves the deque unchanged.
   * @returns `true` if this deque changed (`c` was not empty)
   * @throws {@link NullPointerException} if `c` is null, or holds `null` or `undefined`
   */
  override addAll(c: Collection<E>): boolean {
    const xs = requireNonNull(c).toArray();
    // validate first so a rejected element leaves the deque unchanged
    for (let i = 0; i < xs.length; i++) checkElement(xs[i]);
    if (xs.length === 0) return false;
    this.copyIn(xs);
    return true;
  }

  // ---- removal ----

  /** Removes and returns the first element in O(1), or `null` if this deque is empty. */
  pollFirst(): E | null {
    const a = this.elements;
    const h = this.head;
    if (h === this.tail) return null;
    const e = a[h] as E;
    a[h] = FREE;
    this.head = (h + 1) & (a.length - 1);
    this.modCount++;
    return e;
  }

  /** Removes and returns the last element in O(1), or `null` if this deque is empty. */
  pollLast(): E | null {
    if (this.head === this.tail) return null;
    const a = this.elements;
    const t = (this.tail - 1) & (a.length - 1);
    const e = a[t] as E;
    a[t] = FREE;
    this.tail = t;
    this.modCount++;
    return e;
  }

  /**
   * Removes and returns the first element. O(1).
   * @throws {@link NoSuchElementException} if the deque is empty
   */
  removeFirst(): E {
    const e = this.pollFirst();
    if (e === null) throw new NoSuchElementException();
    return e;
  }

  /**
   * Removes and returns the last element. O(1).
   * @throws {@link NoSuchElementException} if the deque is empty
   */
  removeLast(): E {
    const e = this.pollLast();
    if (e === null) throw new NoSuchElementException();
    return e;
  }

  /** Removes and returns the head in O(1), or `null` if this deque is empty; same as `pollFirst()`. */
  poll(): E | null {
    return this.pollFirst();
  }

  /**
   * Pops the top of the stack this deque represents, that is, removes and returns the first element; same as `removeFirst()`. O(1).
   * @throws {@link NoSuchElementException} if the deque is empty
   */
  pop(): E {
    return this.removeFirst();
  }

  /**
   * Removes and returns the first element; same as `removeFirst()`. O(1).
   * @throws {@link NoSuchElementException} if the deque is empty
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
   * Removes the first element (from head to tail) equal to `o`. O(n): a scan, then a shift of the shorter
   * side. `null` or `undefined` simply returns `false`.
   * @returns `true` if an element was removed
   */
  removeFirstOccurrence(o: unknown): boolean {
    const i = this.indexOf(o);
    if (i < 0) return false;
    this.delete(i);
    return true;
  }

  /**
   * Removes the last element (the first found from tail to head) equal to `o`. O(n): a scan, then a shift
   * of the shorter side. `null` or `undefined` simply returns `false`.
   * @returns `true` if an element was removed
   */
  removeLastOccurrence(o: unknown): boolean {
    const i = this.lastIndexOf(o);
    if (i < 0) return false;
    this.delete(i);
    return true;
  }

  /**
   * Removes every element for which `filter` returns `true`, in O(n). Every element is tested before
   * anything is removed, so a throwing predicate, or one that modifies the deque, leaves the deque unchanged.
   * @returns `true` if any element was removed
   * @throws {@link NullPointerException} if `filter` is null
   * @throws {@link ConcurrentModificationException} if `filter` structurally modifies this deque
   */
  override removeIf(filter: (e: E) => boolean): boolean {
    requireNonNull(filter);
    const a = this.elements;
    const mask = a.length - 1;
    const h = this.head;
    const n = this.size();
    const mc = this.modCount;
    // two phases: test everything first, so a throwing or deque-modifying predicate changes nothing
    let dead: Uint8Array | null = null;
    for (let r = 0; r < n; r++) {
      const hit = filter(a[(h + r) & mask] as E);
      if (this.modCount !== mc) throw new ConcurrentModificationException();
      if (hit) (dead ??= new Uint8Array(n))[r] = 1;
    }
    if (dead === null) return false;
    let w = 0;
    for (let r = 0; r < n; r++) {
      if (dead[r] === 0) {
        if (w !== r) a[(h + w) & mask] = a[(h + r) & mask];
        w++;
      }
    }
    for (let i = w; i < n; i++) a[(h + i) & mask] = FREE;
    this.tail = (h + w) & mask;
    this.modCount++;
    return true;
  }

  /** Removes all elements. O(n); keeps the current capacity, since the buffer never shrinks. */
  override clear(): void {
    const a = this.elements;
    const h = this.head;
    const t = this.tail;
    if (h <= t) a.fill(FREE, h, t);
    else a.fill(FREE, h).fill(FREE, 0, t);
    this.head = this.tail = 0;
    this.modCount++;
  }

  // ---- examination ----

  /** Returns the first element without removing it, in O(1), or `null` if this deque is empty. */
  peekFirst(): E | null {
    return this.head === this.tail ? null : (this.elements[this.head] as E);
  }

  /** Returns the last element without removing it, in O(1), or `null` if this deque is empty. */
  peekLast(): E | null {
    const a = this.elements;
    return this.head === this.tail ? null : (a[(this.tail - 1) & (a.length - 1)] as E);
  }

  /** Returns the head without removing it, in O(1), or `null` if this deque is empty; same as `peekFirst()`. */
  peek(): E | null {
    return this.peekFirst();
  }

  /**
   * Returns the first element. O(1).
   * @throws {@link NoSuchElementException} if the deque is empty
   */
  getFirst(): E {
    if (this.head === this.tail) throw new NoSuchElementException();
    return this.elements[this.head] as E;
  }

  /**
   * Returns the last element. O(1).
   * @throws {@link NoSuchElementException} if the deque is empty
   */
  getLast(): E {
    if (this.head === this.tail) throw new NoSuchElementException();
    const a = this.elements;
    return a[(this.tail - 1) & (a.length - 1)] as E;
  }

  /**
   * Returns the head without removing it, in O(1); same as `getFirst()`.
   * @throws {@link NoSuchElementException} if the deque is empty
   */
  element(): E {
    return this.getFirst();
  }

  /** Returns `true` if this deque contains an element equal to `o` (by `Objects.equals`). O(n); `false` for `null` or `undefined`. */
  override contains(o: unknown): boolean {
    return this.indexOf(o) >= 0;
  }

  // ---- bulk / views ----

  /** Returns a new array with all elements, head to tail. Changing the array does not affect this deque. O(n). */
  override toArray(): E[];
  /**
   * Fills an array created by `generator(size())` with the elements head to tail, and returns it. O(n).
   * @param generator - creates the target array for a given length
   */
  override toArray<A extends WritableArrayLike<E>>(generator: (length: number) => A): A;
  override toArray<A extends WritableArrayLike<E>>(generator?: (length: number) => A): E[] | A {
    if (arguments.length > 0) return toArrayWith(this.toArray(), generator as (length: number) => A);
    const a = this.elements;
    const h = this.head;
    const t = this.tail;
    if (h <= t) return a.slice(h, t) as E[];
    const out = a.slice(h) as E[];
    for (let i = 0; i < t; i++) out.push(a[i] as E);
    return out;
  }

  /**
   * Calls `action` for each element, head to tail.
   * @throws {@link NullPointerException} if `action` is null
   * @throws {@link ConcurrentModificationException} if `action` structurally modifies this deque
   */
  override forEach(action: (e: E) => void): void {
    requireNonNull(action);
    const a = this.elements;
    const mask = a.length - 1;
    const mc = this.modCount;
    for (let i = this.head, t = this.tail; i !== t; i = (i + 1) & mask) {
      action(a[i] as E);
      if (this.modCount !== mc) throw new ConcurrentModificationException();
    }
  }

  /** Returns the elements head to tail as `[a, b, c]`; an element that is this deque prints as `(this Collection)`. */
  override toString(): string {
    const a = this.elements;
    const mask = a.length - 1;
    let s = '[';
    for (let i = this.head, t = this.tail; i !== t; i = (i + 1) & mask) {
      const e = a[i];
      if (i !== this.head) s += ', ';
      s += (e as unknown) === this ? '(this Collection)' : toString(e);
    }
    return s + ']';
  }

  /** Returns a fail-fast iterator over the elements, head to tail. Its `remove` is O(n), shifting the shorter side. */
  iterator(): Iterator<E> {
    return new AscendingIterator(this);
  }

  /** Returns a fail-fast iterator over the elements from last to first. Its `remove` is O(n), shifting the shorter side. */
  descendingIterator(): Iterator<E> {
    return new DescendingIterator(this);
  }

  /**
   * Returns a spliterator over the elements, used to build streams: `ORDERED | SIZED | SUBSIZED | NONNULL`,
   * head to tail, late-binding, splits in halves. It is not modCount-based: it traverses the range bound at
   * first use, and throws {@link ConcurrentModificationException} when it reaches a slot vacated in the meantime.
   */
  override spliterator(): Spliterator<E> {
    return new DeqSpliterator(this);
  }

  /** Returns a JS iterator over the elements, head to tail, for `for...of` and spread; fail-fast. */
  override [Symbol.iterator](): IterableIterator<E> {
    return new JsIterator(this);
  }

  /**
   * Returns a live reverse-ordered view in O(1): its head is this deque's tail, and changes through either
   * side are visible in the other.
   */
  reversed(): Deque<E> {
    return new ReversedDeque(this);
  }

  // ---- internals ----

  /**
   * True when Objects.equals(o, x) is exactly o === x (no NaN, Date or equals() method) and the
   * buffer is dense enough that also scanning free slots with the native indexOf still wins.
   */
  private nativeScan(o: unknown): boolean {
    if (this.size() * 4 < this.elements.length) return false;
    if (typeof o === 'object' || typeof o === 'function') {
      return typeof (o as { equals?: unknown }).equals !== 'function' && !(o instanceof Date);
    }
    return o === o;
  }

  /** Physical index of the first element equal to o, or -1. */
  private indexOf(o: unknown): number {
    if (o === null || o === undefined || this.head === this.tail) return -1;
    if (!this.nativeScan(o)) return this.scanIndexOf(o);
    const a = this.elements;
    const h = this.head;
    const t = this.tail;
    if (h > t) {
      const j = a.indexOf(o, h);
      if (j >= 0) return j;
    }
    const from = h > t ? 0 : h;
    if (isSmi(o)) {
      // sentinel in the always-free slot at tail stops the scan there; a Smi never changes the elements kind
      a[t] = o;
      const j = a.indexOf(o, from);
      a[t] = FREE;
      return j < t ? j : -1;
    }
    // a hit at or past tail is a free slot and comes after every live hit
    const j = a.indexOf(o, from);
    return j < t ? j : -1;
  }

  /** indexOf by element-wise Objects.equals semantics (o is non-null). */
  private scanIndexOf(o: unknown): number {
    const a = this.elements;
    const mask = a.length - 1;
    const t = this.tail;
    let i = this.head;
    if (typeof o === 'object' || typeof o === 'function') {
      for (; i !== t; i = (i + 1) & mask) if (equals(o, a[i])) return i;
    } else if (o !== o) {
      for (; i !== t; i = (i + 1) & mask) if (a[i] !== a[i]) return i;
    } else {
      // primitives: Objects.equals reduces to === (+0/-0 equal, NaN handled above)
      for (; i !== t; i = (i + 1) & mask) if (a[i] === o) return i;
    }
    return -1;
  }

  /** Physical index of the last element equal to o, or -1. */
  private lastIndexOf(o: unknown): number {
    if (o === null || o === undefined) return -1;
    const a = this.elements;
    const mask = a.length - 1;
    const h = this.head;
    let i = this.tail;
    // no native path: V8's lastIndexOf is slower than this loop
    if (typeof o === 'object' || typeof o === 'function') {
      while (i !== h) if (equals(o, a[(i = (i - 1) & mask)])) return i;
    } else if (o !== o) {
      while (i !== h) if (a[(i = (i - 1) & mask)] !== a[i]) return i;
    } else {
      while (i !== h) if (a[(i = (i - 1) & mask)] === o) return i;
    }
    return -1;
  }

  /**
   * Removes the element at physical index i, shifting whichever side is shorter.
   * Returns true when the tail side moved back one slot (iterators must adjust).
   * @internal
   */
  delete(i: number): boolean {
    const a = this.elements;
    const mask = a.length - 1;
    const h = this.head;
    const t = this.tail;
    this.modCount++;
    if (((i - h) & mask) < ((t - i) & mask)) {
      for (let j = i; j !== h; ) {
        const p = (j - 1) & mask;
        a[j] = a[p];
        j = p;
      }
      a[h] = FREE;
      this.head = (h + 1) & mask;
      return false;
    }
    for (let j = i, nx = (i + 1) & mask; nx !== t; j = nx, nx = (nx + 1) & mask) a[j] = a[nx];
    this.tail = (t - 1) & mask;
    a[this.tail] = FREE;
    return true;
  }

  /** Doubles capacity in place when full (head === tail), moving the shorter wrapped part. */
  private grow(): void {
    const a = this.elements;
    const cap = a.length;
    // a length-extended array turns into a slow dictionary from 2^26 slots on: past that, push
    if (cap * 2 < 2 ** 26) a.length = cap * 2;
    else for (let i = 0; i < cap; i++) a.push(FREE);
    const h = this.head;
    if (h < cap - h) {
      for (let i = 0; i < h; i++) {
        a[cap + i] = a[i];
        a[i] = FREE;
      }
      this.tail = cap + h;
    } else {
      for (let i = h; i < cap; i++) {
        a[i + cap] = a[i];
        a[i] = FREE;
      }
      this.head = h + cap;
    }
  }

  private copyIn(xs: readonly E[]): void {
    for (let i = 0; i < xs.length; i++) this.addLast(xs[i]);
  }
}

class AscendingIterator<E> implements Iterator<E> {
  private cursor: number;
  private remaining: number;
  private lastRet = -1;
  private expected: number;

  constructor(private readonly d: ArrayDeque<E>) {
    this.cursor = d.head;
    this.remaining = d.size();
    this.expected = d.modCount;
  }

  hasNext(): boolean {
    return this.remaining > 0;
  }

  next(): E {
    const d = this.d;
    // exhausted first, as the reference: next() past the end is NoSuchElementException even after a change
    if (this.remaining <= 0) throw new NoSuchElementException();
    if (d.modCount !== this.expected) throw new ConcurrentModificationException();
    const a = d.elements;
    const i = this.cursor;
    this.lastRet = i;
    this.cursor = (i + 1) & (a.length - 1);
    this.remaining--;
    return a[i] as E;
  }

  remove(): void {
    if (this.lastRet < 0) throw new IllegalStateException();
    const d = this.d;
    if (d.modCount !== this.expected) throw new ConcurrentModificationException();
    if (d.delete(this.lastRet)) this.cursor = (this.cursor - 1) & (d.elements.length - 1);
    this.lastRet = -1;
    this.expected = d.modCount;
  }

  forEachRemaining(action: (e: E) => void): void {
    requireNonNull(action);
    while (this.remaining > 0) action(this.next());
  }
}

class DescendingIterator<E> implements Iterator<E> {
  private cursor: number;
  private remaining: number;
  private lastRet = -1;
  private expected: number;

  constructor(private readonly d: ArrayDeque<E>) {
    this.cursor = (d.tail - 1) & (d.elements.length - 1);
    this.remaining = d.size();
    this.expected = d.modCount;
  }

  hasNext(): boolean {
    return this.remaining > 0;
  }

  next(): E {
    const d = this.d;
    // exhausted first, as the reference: next() past the end is NoSuchElementException even after a change
    if (this.remaining <= 0) throw new NoSuchElementException();
    if (d.modCount !== this.expected) throw new ConcurrentModificationException();
    const a = d.elements;
    const i = this.cursor;
    this.lastRet = i;
    this.cursor = (i - 1) & (a.length - 1);
    this.remaining--;
    return a[i] as E;
  }

  remove(): void {
    if (this.lastRet < 0) throw new IllegalStateException();
    const d = this.d;
    if (d.modCount !== this.expected) throw new ConcurrentModificationException();
    // head side shifted forward: the next element moved up one slot
    if (!d.delete(this.lastRet)) this.cursor = (this.cursor + 1) & (d.elements.length - 1);
    this.lastRet = -1;
    this.expected = d.modCount;
  }

  forEachRemaining(action: (e: E) => void): void {
    requireNonNull(action);
    while (this.remaining > 0) action(this.next());
  }
}

/** JS iteration protocol: plain object iterator (generators are much slower), fail-fast. */
class JsIterator<E> {
  private cursor: number;
  private remaining: number;
  private readonly a: unknown[];
  private readonly expected: number;

  constructor(private readonly d: ArrayDeque<E>) {
    this.a = d.elements;
    this.cursor = d.head;
    this.remaining = d.size();
    this.expected = d.modCount;
  }

  next(): IteratorResult<E> {
    if (this.d.modCount !== this.expected) throw new ConcurrentModificationException();
    if (this.remaining === 0) return { value: undefined, done: true };
    const a = this.a;
    const i = this.cursor;
    this.cursor = (i + 1) & (a.length - 1);
    this.remaining--;
    return { value: a[i] as E, done: false };
  }

  [Symbol.iterator](): this {
    return this;
  }
}

const DEQ_CHARACTERISTICS = Spliterator.ORDERED | Spliterator.SIZED | Spliterator.SUBSIZED | Spliterator.NONNULL;

/**
 * Spliterator over [cursor, end) of the circular buffer, bound to head/tail at first use. Like the reference it is
 * not modCount-based: it reads the slots it was bound to, so an element added at either end after binding is not
 * seen and traversal stops at the old end; reaching a vacated slot (one outside the live head..tail range) throws
 * ConcurrentModificationException in tryAdvance, while forEachRemaining only checks both ends of its range up front
 * and then passes null for vacated slots, as the reference does.
 */
class DeqSpliterator<E> extends BaseSpliterator<E> {
  private a: unknown[] = [];
  private mask = 0;
  private expected = 0;

  constructor(
    private readonly d: ArrayDeque<E>,
    private cursor = 0,
    private end = -1
  ) {
    super();
  }

  private getFence(): number {
    if (this.end < 0) {
      const d = this.d;
      this.a = d.elements;
      this.mask = this.a.length - 1;
      this.cursor = d.head;
      this.end = d.tail;
      this.expected = d.modCount;
    }
    return this.end;
  }

  /**
   * Whether physical slot i still holds a live element. The buffer grows in place (the reference allocates a new
   * array whose old slots it then misreads); a grown buffer counts as modified everywhere.
   * shortcut: a resize during traversal always throws, where the reference may yield stale slots.
   */
  private live(i: number): boolean {
    const d = this.d;
    if (d.modCount === this.expected) return true;
    if (d.elements.length - 1 !== this.mask) return false;
    return ((i - d.head) & this.mask) < ((d.tail - d.head) & this.mask);
  }

  override trySplit(): Spliterator<E> | null {
    const end = this.getFence();
    const i = this.cursor;
    const n = ((end - i) & this.mask) >> 1;
    if (n <= 0) return null;
    const mid = (i + n) & this.mask;
    this.cursor = mid;
    const s = new DeqSpliterator(this.d, i, mid);
    s.a = this.a;
    s.mask = this.mask;
    s.expected = this.expected;
    return s;
  }

  tryAdvance(action: (e: E) => void): boolean {
    requireNonNull(action);
    const end = this.getFence();
    const i = this.cursor;
    if (i === end) return false;
    if (!this.live(i)) throw new ConcurrentModificationException();
    this.cursor = (i + 1) & this.mask;
    action(this.a[i] as E);
    return true;
  }

  override forEachRemaining(action: (e: E) => void): void {
    requireNonNull(action);
    const end = this.getFence();
    const a = this.a;
    const mask = this.mask;
    let i = this.cursor;
    if (i === end) return;
    this.cursor = end;
    if (!this.live(i) || !this.live((end - 1) & mask)) throw new ConcurrentModificationException();
    const d = this.d;
    const mc = this.expected;
    for (; i !== end; i = (i + 1) & mask) {
      if (d.modCount === mc) action(a[i] as E);
      else if (d.elements.length - 1 !== mask) throw new ConcurrentModificationException();
      else action((this.live(i) ? a[i] : null) as E);
    }
  }

  estimateSize(): number {
    return (this.getFence() - this.cursor) & this.mask;
  }

  characteristics(): number {
    return DEQ_CHARACTERISTICS;
  }
}

/** Live mirrored view: first/last, iteration order and removal order are swapped. */
class ReversedDeque<E> extends AbstractCollection<E> implements Deque<E> {
  constructor(private readonly d: ArrayDeque<E>) {
    super();
  }

  size(): number {
    return this.d.size();
  }
  override isEmpty(): boolean {
    return this.d.isEmpty();
  }
  override contains(o: unknown): boolean {
    return this.d.contains(o);
  }
  override toArray(): E[];
  override toArray<A extends WritableArrayLike<E>>(generator: (length: number) => A): A;
  override toArray<A extends WritableArrayLike<E>>(generator?: (length: number) => A): E[] | A {
    const out = this.d.toArray().reverse();
    return arguments.length > 0 ? toArrayWith(out, generator as (length: number) => A) : out;
  }
  override clear(): void {
    this.d.clear();
  }
  override removeIf(filter: (e: E) => boolean): boolean {
    return this.d.removeIf(filter);
  }
  iterator(): Iterator<E> {
    return this.d.descendingIterator();
  }
  descendingIterator(): Iterator<E> {
    return this.d.iterator();
  }
  /** ORDERED|SIZED|SUBSIZED over iterator() (no NONNULL), as the reference's reverse-ordered deque view. */
  override spliterator(): Spliterator<E> {
    return new IteratorSpliterator(this, null, -1, Spliterator.ORDERED | Spliterator.SIZED | Spliterator.SUBSIZED);
  }
  override [Symbol.iterator](): IterableIterator<E> {
    const it = this.d.descendingIterator();
    const js: IterableIterator<E> = {
      next: (): IteratorResult<E> => (it.hasNext() ? { value: it.next(), done: false } : { value: undefined, done: true }),
      [Symbol.iterator]() {
        return this;
      },
    };
    return js;
  }
  reversed(): Deque<E> {
    return this.d;
  }

  override add(e: E): boolean {
    this.d.addFirst(e);
    return true;
  }
  override addAll(c: Collection<E>): boolean {
    const xs = requireNonNull(c).toArray();
    for (let i = 0; i < xs.length; i++) checkElement(xs[i]);
    for (let i = 0; i < xs.length; i++) this.d.addFirst(xs[i]);
    return xs.length > 0;
  }
  offer(e: E): boolean {
    return this.d.offerFirst(e);
  }
  addFirst(e: E): void {
    this.d.addLast(e);
  }
  addLast(e: E): void {
    this.d.addFirst(e);
  }
  offerFirst(e: E): boolean {
    return this.d.offerLast(e);
  }
  offerLast(e: E): boolean {
    return this.d.offerFirst(e);
  }
  push(e: E): void {
    this.d.addLast(e);
  }

  override remove(): E;
  override remove(o: unknown): boolean;
  override remove(o?: unknown): E | boolean {
    if (arguments.length === 0) return this.d.removeLast();
    return this.d.removeLastOccurrence(o);
  }
  poll(): E | null {
    return this.d.pollLast();
  }
  pollFirst(): E | null {
    return this.d.pollLast();
  }
  pollLast(): E | null {
    return this.d.pollFirst();
  }
  removeFirst(): E {
    return this.d.removeLast();
  }
  removeLast(): E {
    return this.d.removeFirst();
  }
  pop(): E {
    return this.d.removeLast();
  }
  removeFirstOccurrence(o: unknown): boolean {
    return this.d.removeLastOccurrence(o);
  }
  removeLastOccurrence(o: unknown): boolean {
    return this.d.removeFirstOccurrence(o);
  }

  peek(): E | null {
    return this.d.peekLast();
  }
  peekFirst(): E | null {
    return this.d.peekLast();
  }
  peekLast(): E | null {
    return this.d.peekFirst();
  }
  element(): E {
    return this.d.getLast();
  }
  getFirst(): E {
    return this.d.getLast();
  }
  getLast(): E {
    return this.d.getFirst();
  }
}
