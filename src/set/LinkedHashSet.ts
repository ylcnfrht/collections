import { AbstractSet, requireCollection } from '../abstract/AbstractSet';
import { IllegalArgumentException } from '../exceptions';
import { Collection } from '../interfaces/Collection';
import { Iterator } from '../interfaces/Iterator';
import { SequencedSet } from '../interfaces/Set';
import { Spliterator } from '../stream/Spliterator';
import { checkCapacity } from '../map/HashMap';
import { LinkedHashMap } from '../map/LinkedHashMap';
import { toArrayWith, WritableArrayLike } from '../util/arrays';
import { HashSet } from './HashSet';

const UNUSED_STORAGE = { ints: Object.freeze([]), fast: new globalThis.Set(), buckets: new globalThis.Map() };

/**
 * A hash {@link Set} that iterates in insertion order (re-adding an element keeps its place) and supports the
 * {@link SequencedSet} operations. Elements are equal by `equals()`/`hashCode()`; `null` and `undefined` are allowed.
 * `add`, `remove` and `contains` run in O(1) expected time, as do first/last access and removal; iterators are
 * fail-fast. Backed by a {@link LinkedHashMap}.
 *
 * Extends HashSet so `instanceof HashSet` holds, but HashSet keeps no map to reuse: every method is
 * overridden to use a LinkedHashMap instead, and the inherited storage fields (shared empty ones) and modCount stay unused.
 */
export class LinkedHashSet<E> extends HashSet<E> implements SequencedSet<E> {
  /** @internal */
  readonly map: LinkedHashMap<E, boolean>;
  private rev: ReversedLinkedHashSet<E> | undefined;

  /** Creates an empty set. */
  constructor();
  /**
   * Creates an empty set. The arguments are sizing hints only: they are validated but storage grows on demand.
   * @throws {@link IllegalArgumentException} if `initialCapacity` is negative or NaN, or `loadFactor` is not positive
   */
  constructor(initialCapacity: number, loadFactor?: number);
  /**
   * Creates a set with the elements of `c`, in `c`'s iteration order; duplicates are dropped.
   * @throws {@link IllegalArgumentException} if `c` is neither a number nor a collection
   */
  constructor(c: Collection<E>);
  constructor(a?: number | Collection<E>, loadFactor?: number) {
    // never hand the collection to super: its addAll would run before map exists
    super();
    // HashSet's storage is never touched here (every method using it is overridden): share empty ones, ~370 bytes less per set
    Object.assign(this, UNUSED_STORAGE);
    this.map = new LinkedHashMap<E, boolean>();
    if (typeof a === 'number') checkCapacity(a, loadFactor);
    else if (a !== undefined) this.addAll(requireCollection<E>(a, 'a capacity or a Collection'));
  }

  /**
   * Returns an empty set intended for `numElements` elements (capacity is only a hint, so this just validates it).
   * @throws {@link IllegalArgumentException} if `numElements` is negative or NaN
   */
  static newLinkedHashSet<E>(numElements: number): LinkedHashSet<E> {
    if (!(numElements >= 0)) throw new IllegalArgumentException(`Negative number of elements: ${numElements}`);
    return new LinkedHashSet<E>();
  }

  /** Returns a new set of the given elements in argument order; a repeated element keeps its first position. */
  static override of<E>(...xs: E[]): LinkedHashSet<E> {
    const s = new LinkedHashSet<E>();
    for (const x of xs) s.add(x);
    return s;
  }

  /** Shallow copy of the same runtime class (subclass fields included), in the same order. */
  override clone(): LinkedHashSet<E> {
    const s = this.cloneShell();
    const w = s as unknown as { map: LinkedHashMap<E, boolean>; rev: unknown };
    w.map = new LinkedHashMap<E, boolean>();
    for (const e of this) w.map.put(e, true);
    w.rev = undefined;
    return s;
  }

  /** Returns the number of elements. O(1). */
  override size(): number {
    return this.map.size();
  }

  /** Returns `true` if this set has no elements. O(1). */
  override isEmpty(): boolean {
    return this.map.isEmpty();
  }

  /**
   * Returns `true` if this set contains an element equal to `o` (by `equals()`, SameValueZero for primitives). O(1)
   * expected.
   */
  override contains(o: unknown): boolean {
    return this.map.containsKey(o);
  }

  /**
   * Adds `e` if no equal element is present. O(1) expected. `null` and `undefined` are allowed. A new element goes to
   * the end; re-adding an element keeps its place.
   * @returns `true` if the set changed
   */
  override add(e: E): boolean {
    return this.map.put(e, true) === null;
  }

  /**
   * Removes the element equal to `o`, if present. O(1) expected.
   * @returns `true` if an element was removed
   */
  override remove(o: unknown): boolean {
    return this.map.removeKey(o) !== undefined;
  }

  /** Removes all elements. */
  override clear(): void {
    this.map.clear();
  }

  /** Returns a fail-fast iterator over the elements, in insertion order; its `remove` is supported. */
  override iterator(): Iterator<E> {
    return this.map.sequencedKeySet().iterator();
  }

  /**
   * Returns a spliterator over the elements, used to build streams; fail-fast like the iterator. SIZED, SUBSIZED,
   * DISTINCT and ORDERED; late-binding.
   */
  override spliterator(): Spliterator<E> {
    return this.map.sequencedKeySet().spliterator();
  }

  /** Returns a fail-fast iterator over the elements, in insertion order. */
  override [Symbol.iterator](): IterableIterator<E> {
    return this.map.sequencedKeySet()[Symbol.iterator]() as IterableIterator<E>;
  }

  /**
   * Calls `action` for each element, in insertion order.
   * @throws {@link NullPointerException} if `action` is null
   * @throws {@link ConcurrentModificationException} if `action` structurally modifies this set
   */
  override forEach(action: (e: E) => void): void {
    this.map.sequencedKeySet().forEach(action);
  }

  /** Returns a new array with all elements, in insertion order. Changing the array does not affect this set. */
  override toArray(): E[];
  /**
   * Fills an array created by `generator(size())` with the elements, in insertion order, and returns it.
   * @param generator - creates the target array for a given length
   */
  override toArray<A extends WritableArrayLike<E>>(generator: (length: number) => A): A;
  override toArray<A extends WritableArrayLike<E>>(generator?: (length: number) => A): E[] | A {
    const out = this.map.sequencedKeySet().toArray();
    return arguments.length > 0 ? toArrayWith(out, generator as (length: number) => A) : out;
  }

  /**
   * Removes every element for which `filter` returns `true`, in one O(n) pass.
   * @returns `true` if any element was removed
   * @throws {@link NullPointerException} if `filter` is null
   * @throws {@link ConcurrentModificationException} if `filter` structurally modifies this set
   */
  override removeIf(filter: (e: E) => boolean): boolean {
    return this.map.sequencedKeySet().removeIf(filter);
  }

  // SequencedSet

  /**
   * Returns the first (eldest) element. O(1).
   * @throws {@link NoSuchElementException} if this set is empty
   */
  getFirst(): E {
    return this.map.sequencedKeySet().getFirst();
  }

  /**
   * Returns the last (youngest) element. O(1).
   * @throws {@link NoSuchElementException} if this set is empty
   */
  getLast(): E {
    return this.map.sequencedKeySet().getLast();
  }

  /**
   * Removes and returns the first element. O(1).
   * @throws {@link NoSuchElementException} if this set is empty
   */
  removeFirst(): E {
    return this.map.sequencedKeySet().removeFirst();
  }

  /**
   * Removes and returns the last element. O(1).
   * @throws {@link NoSuchElementException} if this set is empty
   */
  removeLast(): E {
    return this.map.sequencedKeySet().removeLast();
  }

  /** Adds `e` as the first element, or moves it to the front if already present. O(1) expected. */
  addFirst(e: E): void {
    this.map.putFirst(e, true);
  }

  /** Adds `e` as the last element, or moves it to the end if already present. O(1) expected. */
  addLast(e: E): void {
    this.map.putLast(e, true);
  }

  /**
   * Returns a live reverse-ordered view: changes through either side are visible in the other. Writes go to this set:
   * `add` of a new element appends it here, so it shows up first in the view.
   */
  reversed(): SequencedSet<E> {
    return (this.rev ??= new ReversedLinkedHashSet(this));
  }
}

/** Live reverse-ordered view; add() appends to the base (so it shows up first here). */
class ReversedLinkedHashSet<E> extends AbstractSet<E> implements SequencedSet<E> {
  constructor(private readonly base: LinkedHashSet<E>) {
    super();
  }
  private keys(): SequencedSet<E> {
    return this.base.map.sequencedKeySet().reversed();
  }
  iterator(): Iterator<E> {
    return this.keys().iterator();
  }
  override [Symbol.iterator](): IterableIterator<E> {
    return this.keys()[Symbol.iterator]() as IterableIterator<E>;
  }
  size(): number {
    return this.base.size();
  }
  override isEmpty(): boolean {
    return this.base.isEmpty();
  }
  override contains(o: unknown): boolean {
    return this.base.contains(o);
  }
  override add(e: E): boolean {
    return this.base.add(e);
  }
  override remove(o: unknown): boolean {
    return this.base.remove(o);
  }
  override clear(): void {
    this.base.clear();
  }
  override forEach(action: (e: E) => void): void {
    this.keys().forEach(action);
  }
  override toArray(): E[];
  override toArray<A extends WritableArrayLike<E>>(generator: (length: number) => A): A;
  override toArray<A extends WritableArrayLike<E>>(generator?: (length: number) => A): E[] | A {
    const out = this.keys().toArray();
    return arguments.length > 0 ? toArrayWith(out, generator as (length: number) => A) : out;
  }
  reversed(): SequencedSet<E> {
    return this.base;
  }
  getFirst(): E {
    return this.base.getLast();
  }
  getLast(): E {
    return this.base.getFirst();
  }
  removeFirst(): E {
    return this.base.removeLast();
  }
  removeLast(): E {
    return this.base.removeFirst();
  }
  addFirst(e: E): void {
    this.base.addLast(e);
  }
  addLast(e: E): void {
    this.base.addFirst(e);
  }
}
