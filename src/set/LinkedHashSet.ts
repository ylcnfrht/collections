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
 * Hash set that iterates in insertion order (re-adding an element keeps its place).
 * Extends HashSet so `instanceof HashSet` holds, but HashSet keeps no map to reuse: every method is
 * overridden to use a LinkedHashMap instead, and the inherited storage fields (shared empty ones) and modCount stay unused.
 */
export class LinkedHashSet<E> extends HashSet<E> implements SequencedSet<E> {
  /** @internal */
  readonly map: LinkedHashMap<E, boolean>;
  private rev: ReversedLinkedHashSet<E> | undefined;

  constructor();
  constructor(initialCapacity: number, loadFactor?: number);
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
   * An empty LinkedHashSet sized for numElements (capacity is only a hint, so this just validates it).
   * @throws IllegalArgumentException if numElements is negative or NaN
   */
  static newLinkedHashSet<E>(numElements: number): LinkedHashSet<E> {
    if (!(numElements >= 0)) throw new IllegalArgumentException(`Negative number of elements: ${numElements}`);
    return new LinkedHashSet<E>();
  }

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

  override size(): number {
    return this.map.size();
  }

  override isEmpty(): boolean {
    return this.map.isEmpty();
  }

  override contains(o: unknown): boolean {
    return this.map.containsKey(o);
  }

  override add(e: E): boolean {
    return this.map.put(e, true) === null;
  }

  override remove(o: unknown): boolean {
    return this.map.removeKey(o) !== undefined;
  }

  override clear(): void {
    this.map.clear();
  }

  override iterator(): Iterator<E> {
    return this.map.sequencedKeySet().iterator();
  }

  /** SIZED|SUBSIZED|DISTINCT|ORDERED, late-binding (the backing key set's). */
  override spliterator(): Spliterator<E> {
    return this.map.sequencedKeySet().spliterator();
  }

  override [Symbol.iterator](): IterableIterator<E> {
    return this.map.sequencedKeySet()[Symbol.iterator]() as IterableIterator<E>;
  }

  override forEach(action: (e: E) => void): void {
    this.map.sequencedKeySet().forEach(action);
  }

  override toArray(): E[];
  override toArray<A extends WritableArrayLike<E>>(generator: (length: number) => A): A;
  override toArray<A extends WritableArrayLike<E>>(generator?: (length: number) => A): E[] | A {
    const out = this.map.sequencedKeySet().toArray();
    return arguments.length > 0 ? toArrayWith(out, generator as (length: number) => A) : out;
  }

  override removeIf(filter: (e: E) => boolean): boolean {
    return this.map.sequencedKeySet().removeIf(filter);
  }

  // SequencedSet

  getFirst(): E {
    return this.map.sequencedKeySet().getFirst();
  }

  getLast(): E {
    return this.map.sequencedKeySet().getLast();
  }

  removeFirst(): E {
    return this.map.sequencedKeySet().removeFirst();
  }

  removeLast(): E {
    return this.map.sequencedKeySet().removeLast();
  }

  /** Adds e, or moves it, to the front. */
  addFirst(e: E): void {
    this.map.putFirst(e, true);
  }

  /** Adds e, or moves it, to the end. */
  addLast(e: E): void {
    this.map.putLast(e, true);
  }

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
