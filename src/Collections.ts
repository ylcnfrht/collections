import { entryEquals, entryHash, entryToString, mapIterator, SimpleImmutableEntry } from './abstract/AbstractMap';
import {
  IllegalArgumentException,
  IllegalStateException,
  IndexOutOfBoundsException,
  NoSuchElementException,
  UnsupportedOperationException,
} from './exceptions';
import {
  buildMap,
  buildSet,
  ImmutableCollectionBase,
  ImmutableList,
  ImmutableListBase,
  ImmutableMapBase,
  ImmutableSetBase,
  lock,
  SEQUENCED_MUTATORS,
  uoe,
} from './immutable/ImmutableCollections';
import { Collection, SequencedCollection } from './interfaces/Collection';
import { Deque, Queue } from './interfaces/Queue';
import { Enumeration, Iterator, ListIterator } from './interfaces/Iterator';
import { List } from './interfaces/List';
import { Map, MapEntry, NavigableMap, SequencedMap, SortedMap } from './interfaces/Map';
import { NavigableSet, SequencedSet, Set, SortedSet } from './interfaces/Set';
import { Comparator, naturalCompare, reverseOrder } from './util/Comparator';
import { toArrayWith, WritableArrayLike } from './util/arrays';
import { isRandomAccess, isSet, RANDOM_ACCESS, SET_BRAND } from './util/guards';
import { checkPositionIndex, equals, requireNonNull } from './util/Objects';
import {
  checkedCollection,
  checkedList,
  checkedMap,
  checkedNavigableMap,
  checkedNavigableSet,
  checkedQueue,
  checkedSet,
  checkedSortedMap,
  checkedSortedSet,
  delegate,
  identityEquality,
  synchronizedCollection,
  synchronizedList,
  synchronizedMap,
  synchronizedNavigableMap,
  synchronizedNavigableSet,
  synchronizedSet,
  synchronizedSortedMap,
  synchronizedSortedSet,
} from './legacy/Wrappers';
import type { TypeCheck } from './legacy/Wrappers';
import { ArrayList } from './list/ArrayList';
import { jsIterator } from './map/HashMap';
import { TreeMap } from './map/TreeMap';
import { TreeSet } from './set/TreeSet';

// ---- algorithms
// RandomAccess lists use get/set; other lists use list iterators (or one array copy) so everything stays O(n) on a LinkedList.

// Every algorithm throws NullPointerException for a null/undefined collection argument.

/** Stable sort; null/omitted comparator = natural ordering. */
export function sort<E>(list: List<E>, c?: Comparator<E> | null): void {
  requireNonNull(list).sort(c ?? null);
}

export function reverse(list: List<unknown>): void {
  const n = requireNonNull(list).size();
  if (isRandomAccess(list)) {
    for (let i = 0, j = n - 1; i < j; i++, j--) list.set(i, list.set(j, list.get(i)));
    return;
  }
  const fwd = list.listIterator();
  const rev = list.listIterator(n);
  for (let i = 0, mid = n >> 1; i < mid; i++) {
    const tmp = fwd.next();
    fwd.set(rev.previous());
    rev.set(tmp);
  }
}

/** Random source for shuffle: a function returning a number in [0, 1) (like Math.random), or a generator with nextInt(bound) in [0, bound). */
export type RandomSource = (() => number) | { nextInt(bound: number): number };

/**
 * Fisher–Yates shuffle. rnd is a `() => number` in [0, 1) (default Math.random) or an object with
 * `nextInt(bound)` returning an integer in [0, bound), like a RandomGenerator.
 * @throws NullPointerException if list or an explicit rnd is null
 */
export function shuffle(list: List<unknown>, rnd: RandomSource = Math.random): void {
  requireNonNull(list);
  requireNonNull(rnd);
  const f = typeof rnd === 'function' ? rnd : null;
  const pick = (bound: number) => (f !== null ? Math.floor(f() * bound) : (rnd as { nextInt(bound: number): number }).nextInt(bound));
  if (isRandomAccess(list)) {
    for (let i = list.size() - 1; i > 0; i--) {
      const j = pick(i + 1);
      list.set(i, list.set(j, list.get(i)));
    }
    return;
  }
  const a = list.toArray();
  for (let i = a.length - 1; i > 0; i--) {
    const j = pick(i + 1);
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  writeBack(list, a);
}

function writeBack<E>(list: List<E>, a: E[]): void {
  const it = list.listIterator();
  for (let i = 0; i < a.length; i++) {
    it.next();
    it.set(a[i]);
  }
}

/** @throws IndexOutOfBoundsException */
export function swap(list: List<unknown>, i: number, j: number): void {
  requireNonNull(list).set(i, list.set(j, list.get(i)));
}

export function fill<E>(list: List<E>, v: E): void {
  requireNonNull(list);
  if (isRandomAccess(list)) {
    for (let i = 0, n = list.size(); i < n; i++) list.set(i, v);
    return;
  }
  const it = list.listIterator();
  while (it.hasNext()) {
    it.next();
    it.set(v);
  }
}

/** Copies src over the first src.size() elements of dest. @throws IndexOutOfBoundsException if dest is shorter */
export function copy<E>(dest: List<E>, src: List<E>): void {
  requireNonNull(dest);
  const n = requireNonNull(src).size();
  if (n > dest.size()) throw new IndexOutOfBoundsException('Source does not fit in dest');
  if (isRandomAccess(dest) && isRandomAccess(src)) {
    for (let i = 0; i < n; i++) dest.set(i, src.get(i));
    return;
  }
  const d = dest.listIterator();
  const s = src.iterator();
  while (s.hasNext()) {
    d.next();
    d.set(s.next());
  }
}

/** @throws NoSuchElementException when empty */
export function min<E>(coll: Collection<E>, c?: Comparator<E> | null): E {
  return extreme(coll, c ?? naturalCompare, -1);
}

/** @throws NoSuchElementException when empty */
export function max<E>(coll: Collection<E>, c?: Comparator<E> | null): E {
  return extreme(coll, c ?? naturalCompare, 1);
}

function extreme<E>(coll: Collection<E>, cmp: Comparator<E>, sign: number): E {
  const it = requireNonNull(coll).iterator();
  if (!it.hasNext()) throw new NoSuchElementException();
  let best = it.next();
  while (it.hasNext()) {
    const e = it.next();
    if (cmp(e, best) * sign > 0) best = e;
  }
  return best;
}

/** Number of elements equal (Objects.equals) to o. */
export function frequency(coll: Collection<unknown>, o: unknown): number {
  let n = 0;
  const it = requireNonNull(coll).iterator();
  while (it.hasNext()) if (equals(o, it.next())) n++;
  return n;
}

/** True when the two collections have no element in common. */
export function disjoint(c1: Collection<unknown>, c2: Collection<unknown>): boolean {
  requireNonNull(c1);
  requireNonNull(c2);
  // iterate one side and ask contains() of the side most likely to answer fast: a set, else the larger one
  let iter = c1;
  let look = c2;
  // sizes read through iter/look: Set and Collection are structurally equal, so a negated guard narrows c1/c2 to never
  const s1 = isSet(c1);
  const s2 = isSet(c2);
  if (s1 ? !s2 : !s2 && iter.size() > look.size()) [iter, look] = [c2, c1];
  if (iter.isEmpty() || look.isEmpty()) return true;
  const it = iter.iterator();
  while (it.hasNext()) if (look.contains(it.next())) return false;
  return true;
}

/**
 * Binary search in a list sorted by c (natural ordering when omitted).
 * @returns the index of a match, else -(insertionPoint) - 1
 */
export function binarySearch<E>(list: List<E>, key: E, c?: Comparator<E> | null): number {
  const cmp = c ?? naturalCompare;
  let lo = 0;
  let hi = requireNonNull(list).size() - 1;
  if (isRandomAccess(list)) {
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const r = cmp(list.get(mid), key);
      if (r < 0) lo = mid + 1;
      else if (r > 0) hi = mid - 1;
      else return mid;
    }
    return -(lo + 1);
  }
  // O(n) iterator moves, O(log n) comparisons
  const it = list.listIterator();
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const r = cmp(moveTo(it, mid), key);
    if (r < 0) lo = mid + 1;
    else if (r > 0) hi = mid - 1;
    else return mid;
  }
  return -(lo + 1);
}

function moveTo<E>(it: ListIterator<E>, index: number): E {
  let i = it.nextIndex();
  let e: E;
  if (i <= index) {
    do e = it.next();
    while (i++ < index);
  } else {
    do e = it.previous();
    while (--i > index);
  }
  return e;
}

/**
 * Moves the element at i to (i + distance) mod size. Any integer distance (negative, larger than size) is fine.
 * @throws IllegalArgumentException if distance is not an integer (NaN, fractions, infinities)
 */
export function rotate(list: List<unknown>, distance: number): void {
  requireNonNull(list);
  if (!Number.isInteger(distance)) throw new IllegalArgumentException(`distance: ${distance}`);
  const n = list.size();
  if (n === 0) return;
  let d = distance % n;
  if (d < 0) d += n;
  if (d === 0) return;
  if (isRandomAccess(list)) {
    // cycle leader: every element moves once
    for (let start = 0, moved = 0; moved !== n; start++) {
      let displaced = list.get(start);
      let i = start;
      do {
        i += d;
        if (i >= n) i -= n;
        displaced = list.set(i, displaced);
        moved++;
      } while (i !== start);
    }
    return;
  }
  const a = list.toArray();
  writeBack(list, a.slice(n - d).concat(a.slice(0, n - d)));
}

/** Immutable list of n copies of o (o may be null). @throws IllegalArgumentException when n is negative or not an integer */
export function nCopies<E>(n: number, o: E): List<E> {
  if (!(Number.isInteger(n) && n >= 0)) throw new IllegalArgumentException(`List length = ${n}`);
  // shortcut: materializes n slots (O(n) memory); switch to a computed list if huge counts show up
  return new ImmutableList(new Array<E>(n).fill(o), o != null);
}

/** Adds every element; true if the collection changed. */
export function addAll<E>(coll: Collection<E>, ...elements: E[]): boolean {
  requireNonNull(coll);
  let changed = false;
  for (let i = 0; i < elements.length; i++) if (coll.add(elements[i])) changed = true;
  return changed;
}

function indexed<E>(l: List<E>): List<E> {
  return isRandomAccess(requireNonNull(l)) ? l : new ImmutableList(l.toArray(), false);
}

/** First index where target occurs as a contiguous run in source, or -1. */
export function indexOfSubList(source: List<unknown>, target: List<unknown>): number {
  const s = indexed(source);
  const t = indexed(target);
  const n = s.size();
  const m = t.size();
  outer: for (let i = 0; i <= n - m; i++) {
    for (let j = 0; j < m; j++) if (!equals(t.get(j), s.get(i + j))) continue outer;
    return i;
  }
  return -1;
}

/** Last index where target occurs as a contiguous run in source, or -1. */
export function lastIndexOfSubList(source: List<unknown>, target: List<unknown>): number {
  const s = indexed(source);
  const t = indexed(target);
  const m = t.size();
  outer: for (let i = s.size() - m; i >= 0; i--) {
    for (let j = 0; j < m; j++) if (!equals(t.get(j), s.get(i + j))) continue outer;
    return i;
  }
  return -1;
}

/** Replaces every element equal to oldVal with newVal; true if any was replaced. */
export function replaceAll<E>(list: List<E>, oldVal: E, newVal: E): boolean {
  requireNonNull(list);
  let found = false;
  if (isRandomAccess(list)) {
    for (let i = 0, n = list.size(); i < n; i++) {
      if (equals(oldVal, list.get(i))) {
        list.set(i, newVal);
        found = true;
      }
    }
    return found;
  }
  const it = list.listIterator();
  while (it.hasNext()) {
    if (equals(oldVal, it.next())) {
      it.set(newVal);
      found = true;
    }
  }
  return found;
}

/** Reverse of c (or of natural ordering); shared with Comparator.reverseOrder/reversed. */
export { reverseOrder };

// ---- empty iterators

/** Shared cursor over nothing: next/previous throw NoSuchElementException, remove/set IllegalStateException, add UnsupportedOperationException. */
const EMPTY_ITERATOR: ListIterator<never> = Object.freeze({
  hasNext: () => false,
  next(): never {
    throw new NoSuchElementException();
  },
  hasPrevious: () => false,
  previous(): never {
    throw new NoSuchElementException();
  },
  nextIndex: () => 0,
  previousIndex: () => -1,
  remove(): void {
    throw new IllegalStateException();
  },
  set(): void {
    throw new IllegalStateException();
  },
  add(): void {
    throw new UnsupportedOperationException();
  },
  forEachRemaining(action: (e: never) => void): void {
    requireNonNull(action);
  },
});

export function emptyIterator<E>(): Iterator<E> {
  return EMPTY_ITERATOR;
}

export function emptyListIterator<E>(): ListIterator<E> {
  return EMPTY_ITERATOR;
}

const EMPTY_ENUMERATION: Enumeration<never> = Object.freeze({
  hasMoreElements: () => false,
  nextElement(): never {
    throw new NoSuchElementException();
  },
  asIterator: () => EMPTY_ITERATOR,
});

export function emptyEnumeration<E>(): Enumeration<E> {
  return EMPTY_ENUMERATION;
}

// ---- empty and singleton collections (null elements allowed)

/** emptyList(): iterators are the empty iterators, sort is a no-op. */
class EmptyList<E> extends ImmutableList<E> {
  override iterator(): Iterator<E> {
    return EMPTY_ITERATOR;
  }
  override listIterator(index = 0): ListIterator<E> {
    checkPositionIndex(index, 0);
    return EMPTY_ITERATOR;
  }
  override sort(_c?: Comparator<E> | null): void {}
}

/** Shared immutable empty list, same instance as emptyList(). */
export const EMPTY_LIST: List<never> = new EmptyList<never>([], true);
/** Shared immutable empty set, same instance as emptySet(). */
export const EMPTY_SET: Set<never> = buildSet<never>([], false, true);
/** Shared immutable empty map, same instance as emptyMap(). */
export const EMPTY_MAP: Map<never, never> = buildMap<never, never>([], true);

export function emptyList<E>(): List<E> {
  return EMPTY_LIST;
}

export function emptySet<E>(): Set<E> {
  return EMPTY_SET;
}

export function emptyMap<K, V>(): Map<K, V> {
  return EMPTY_MAP;
}

export function singletonList<E>(o: E): List<E> {
  return new ImmutableList([o], o != null);
}

export function singleton<E>(o: E): Set<E> {
  return buildSet([o], false, false);
}

export function singletonMap<K, V>(key: K, value: V): Map<K, V> {
  return buildMap([new SimpleImmutableEntry(key, value)], false);
}

// ---- unmodifiable views: read-through, every mutator throws UnsupportedOperationException

/** Read-only cursor over another cursor. */
class ReadOnlyItr<E> implements ListIterator<E> {
  constructor(private readonly it: ListIterator<E>) {}
  hasNext(): boolean {
    return this.it.hasNext();
  }
  next(): E {
    return this.it.next();
  }
  hasPrevious(): boolean {
    return this.it.hasPrevious();
  }
  previous(): E {
    return this.it.previous();
  }
  nextIndex(): number {
    return this.it.nextIndex();
  }
  previousIndex(): number {
    return this.it.previousIndex();
  }
  forEachRemaining(action: (e: E) => void): void {
    this.it.forEachRemaining(action);
  }
  remove(): void {
    uoe();
  }
  set(_e: E): void {
    uoe();
  }
  add(_e: E): void {
    uoe();
  }
}

function readOnly<E>(it: Iterator<E>): Iterator<E> {
  return new ReadOnlyItr(it as ListIterator<E>);
}

class UnmodifiableCollection<E> extends ImmutableCollectionBase<E> {
  constructor(readonly c: Collection<E>) {
    super();
  }
  iterator(): Iterator<E> {
    return readOnly(this.c.iterator());
  }
  // JS iterators have no remove, so the backing one can be handed out
  override [Symbol.iterator](): Generator<E> {
    return this.c[Symbol.iterator]() as Generator<E>;
  }
  size(): number {
    return this.c.size();
  }
  override isEmpty(): boolean {
    return this.c.isEmpty();
  }
  override contains(o: unknown): boolean {
    return this.c.contains(o);
  }
  override containsAll(c: Collection<unknown>): boolean {
    return this.c.containsAll(c);
  }
  override toArray(): E[];
  override toArray<A extends WritableArrayLike<E>>(generator: (length: number) => A): A;
  override toArray<A extends WritableArrayLike<E>>(generator?: (length: number) => A): E[] | A {
    return arguments.length > 0 ? this.c.toArray(generator as (length: number) => A) : this.c.toArray();
  }
  override forEach(action: (e: E) => void): void {
    this.c.forEach(action);
  }
  override toString(): string {
    return this.c.toString();
  }
}

class UnmodifiableSequencedCollection<E> extends UnmodifiableCollection<E> implements SequencedCollection<E> {
  private get s(): SequencedCollection<E> {
    return this.c as SequencedCollection<E>;
  }
  reversed(): SequencedCollection<E> {
    return new UnmodifiableSequencedCollection(this.s.reversed());
  }
  getFirst(): E {
    return this.s.getFirst();
  }
  getLast(): E {
    return this.s.getLast();
  }
  declare addFirst: (e: E) => void;
  declare addLast: (e: E) => void;
  declare removeFirst: () => E;
  declare removeLast: () => E;
}
lock(UnmodifiableSequencedCollection, SEQUENCED_MUTATORS);

class UnmodifiableSet<E> extends UnmodifiableCollection<E> implements Set<E> {
  get [SET_BRAND](): true {
    return true;
  }
  override equals(o: unknown): boolean {
    return o === this || this.c.equals(o);
  }
  override hashCode(): number {
    return this.c.hashCode();
  }
}

class UnmodifiableSequencedSet<E> extends UnmodifiableSet<E> implements SequencedSet<E> {
  getFirst(): E {
    return (this.c as SequencedSet<E>).getFirst();
  }
  getLast(): E {
    return (this.c as SequencedSet<E>).getLast();
  }
  reversed(): SequencedSet<E> {
    return new UnmodifiableSequencedSet((this.c as SequencedSet<E>).reversed());
  }
  declare addFirst: (e: E) => void;
  declare addLast: (e: E) => void;
  declare removeFirst: () => E;
  declare removeLast: () => E;
}
lock(UnmodifiableSequencedSet, SEQUENCED_MUTATORS);

/** Serves SortedSet and NavigableSet views; methods the backing set lacks fail when called. */
class UnmodifiableNavigableSet<E> extends UnmodifiableSequencedSet<E> implements NavigableSet<E> {
  private get s(): NavigableSet<E> {
    return this.c as NavigableSet<E>;
  }
  comparator(): Comparator<E> | null {
    return this.s.comparator();
  }
  first(): E {
    return this.s.first();
  }
  last(): E {
    return this.s.last();
  }
  lower(e: E): E | null {
    return this.s.lower(e);
  }
  floor(e: E): E | null {
    return this.s.floor(e);
  }
  ceiling(e: E): E | null {
    return this.s.ceiling(e);
  }
  higher(e: E): E | null {
    return this.s.higher(e);
  }
  headSet(toElement: E, inclusive?: boolean): NavigableSet<E> {
    return wrapNavSet(arguments.length < 2 ? this.s.headSet(toElement) : this.s.headSet(toElement, inclusive as boolean));
  }
  tailSet(fromElement: E, inclusive?: boolean): NavigableSet<E> {
    return wrapNavSet(arguments.length < 2 ? this.s.tailSet(fromElement) : this.s.tailSet(fromElement, inclusive as boolean));
  }
  subSet(fromElement: E, a: E | boolean, b?: E, c?: boolean): NavigableSet<E> {
    return wrapNavSet(
      arguments.length >= 4 ? this.s.subSet(fromElement, a as boolean, b as E, c as boolean) : this.s.subSet(fromElement, a as E)
    );
  }
  descendingSet(): NavigableSet<E> {
    return wrapNavSet(this.s.descendingSet());
  }
  descendingIterator(): Iterator<E> {
    return readOnly(this.s.descendingIterator());
  }
  override reversed(): NavigableSet<E> {
    return wrapNavSet(this.s.reversed());
  }
  declare pollFirst: () => E | null;
  declare pollLast: () => E | null;
}
lock(UnmodifiableNavigableSet, ['pollFirst', 'pollLast']);

function wrapNavSet<E>(s: SortedSet<E>): NavigableSet<E> {
  return new UnmodifiableNavigableSet(s);
}

class UnmodifiableList<E> extends ImmutableListBase<E> {
  constructor(private readonly l: List<E>) {
    super();
  }
  get [RANDOM_ACCESS](): boolean {
    return isRandomAccess(this.l);
  }
  size(): number {
    return this.l.size();
  }
  override isEmpty(): boolean {
    return this.l.isEmpty();
  }
  get(index: number): E {
    return this.l.get(index);
  }
  override getFirst(): E {
    return this.l.getFirst();
  }
  override getLast(): E {
    return this.l.getLast();
  }
  override indexOf(o: unknown): number {
    return this.l.indexOf(o);
  }
  override lastIndexOf(o: unknown): number {
    return this.l.lastIndexOf(o);
  }
  override contains(o: unknown): boolean {
    return this.l.contains(o);
  }
  override containsAll(c: Collection<unknown>): boolean {
    return this.l.containsAll(c);
  }
  override toArray(): E[];
  override toArray<A extends WritableArrayLike<E>>(generator: (length: number) => A): A;
  override toArray<A extends WritableArrayLike<E>>(generator?: (length: number) => A): E[] | A {
    return arguments.length > 0 ? this.l.toArray(generator as (length: number) => A) : this.l.toArray();
  }
  override forEach(action: (e: E) => void): void {
    this.l.forEach(action);
  }
  override iterator(): Iterator<E> {
    return new ReadOnlyItr(this.l.listIterator());
  }
  override listIterator(index?: number): ListIterator<E> {
    return new ReadOnlyItr(this.l.listIterator(index));
  }
  override [Symbol.iterator](): Generator<E> {
    return this.l[Symbol.iterator]() as Generator<E>;
  }
  override subList(fromIndex: number, toIndex: number): List<E> {
    return new UnmodifiableList(this.l.subList(fromIndex, toIndex));
  }
  override reversed(): List<E> {
    return new UnmodifiableList(this.l.reversed());
  }
  override equals(o: unknown): boolean {
    return o === this || this.l.equals(o);
  }
  override hashCode(): number {
    return this.l.hashCode();
  }
  override toString(): string {
    return this.l.toString();
  }
}

class UnmodifiableEntry<K, V> implements MapEntry<K, V> {
  constructor(private readonly e: MapEntry<K, V>) {}
  getKey(): K {
    return this.e.getKey();
  }
  getValue(): V {
    return this.e.getValue();
  }
  setValue(_value: V): V {
    return uoe();
  }
  equals(o: unknown): boolean {
    return entryEquals(this, o);
  }
  hashCode(): number {
    return entryHash(this);
  }
  toString(): string {
    return entryToString(this);
  }
}

function wrapEntry<K, V>(e: MapEntry<K, V> | null): MapEntry<K, V> | null {
  return e === null ? null : new UnmodifiableEntry(e);
}

/** Entry set whose entries reject setValue. Also serves sequencedEntrySet(). */
class UnmodifiableEntrySet<K, V> extends UnmodifiableSet<MapEntry<K, V>> implements SequencedSet<MapEntry<K, V>> {
  private get s(): SequencedSet<MapEntry<K, V>> {
    return this.c as SequencedSet<MapEntry<K, V>>;
  }
  override iterator(): Iterator<MapEntry<K, V>> {
    return mapIterator(readOnly(this.c.iterator()), (e) => new UnmodifiableEntry(e) as MapEntry<K, V>);
  }
  override [Symbol.iterator](): Generator<MapEntry<K, V>> {
    return jsIterator(this.iterator()) as unknown as Generator<MapEntry<K, V>>;
  }
  override toArray(): MapEntry<K, V>[];
  override toArray<A extends WritableArrayLike<MapEntry<K, V>>>(generator: (length: number) => A): A;
  override toArray<A extends WritableArrayLike<MapEntry<K, V>>>(generator?: (length: number) => A): MapEntry<K, V>[] | A {
    const a: MapEntry<K, V>[] = this.c.toArray().map((e) => new UnmodifiableEntry(e));
    return arguments.length > 0 ? toArrayWith(a, generator as (length: number) => A) : a;
  }
  override forEach(action: (e: MapEntry<K, V>) => void): void {
    requireNonNull(action);
    this.c.forEach((e) => action(new UnmodifiableEntry(e)));
  }
  override toString(): string {
    return this.c.toString();
  }
  getFirst(): MapEntry<K, V> {
    return new UnmodifiableEntry(this.s.getFirst());
  }
  getLast(): MapEntry<K, V> {
    return new UnmodifiableEntry(this.s.getLast());
  }
  reversed(): SequencedSet<MapEntry<K, V>> {
    return new UnmodifiableEntrySet(this.s.reversed());
  }
  declare addFirst: (e: MapEntry<K, V>) => void;
  declare addLast: (e: MapEntry<K, V>) => void;
  declare removeFirst: () => MapEntry<K, V>;
  declare removeLast: () => MapEntry<K, V>;
}
lock(UnmodifiableEntrySet, SEQUENCED_MUTATORS);

class UnmodifiableMap<K, V> extends ImmutableMapBase<K, V> {
  private ks: Set<K> | undefined;
  private vs: Collection<V> | undefined;
  private ens: Set<MapEntry<K, V>> | undefined;

  constructor(readonly m: Map<K, V>) {
    super();
  }
  override size(): number {
    return this.m.size();
  }
  override isEmpty(): boolean {
    return this.m.isEmpty();
  }
  override containsKey(key: unknown): boolean {
    return this.m.containsKey(key);
  }
  override containsValue(value: unknown): boolean {
    return this.m.containsValue(value);
  }
  override get(key: unknown): V | null {
    return this.m.get(key);
  }
  override getOrDefault(key: unknown, defaultValue: V): V {
    return this.m.getOrDefault(key, defaultValue);
  }
  override forEach(action: (key: K, value: V) => void): void {
    this.m.forEach(action);
  }
  override keySet(): Set<K> {
    return (this.ks ??= new UnmodifiableSet(this.m.keySet()));
  }
  override values(): Collection<V> {
    return (this.vs ??= new UnmodifiableCollection(this.m.values()));
  }
  entrySet(): Set<MapEntry<K, V>> {
    return (this.ens ??= new UnmodifiableEntrySet(this.m.entrySet()));
  }
  // yields fresh [key, value] pairs, so nothing writes back
  override [Symbol.iterator](): Generator<[K, V]> {
    return this.m[Symbol.iterator]() as Generator<[K, V]>;
  }
  override equals(o: unknown): boolean {
    return o === this || this.m.equals(o);
  }
  override hashCode(): number {
    return this.m.hashCode();
  }
  override toString(): string {
    return this.m.toString();
  }
}

class UnmodifiableSequencedMap<K, V> extends UnmodifiableMap<K, V> implements SequencedMap<K, V> {
  private get q(): SequencedMap<K, V> {
    return this.m as SequencedMap<K, V>;
  }
  reversed(): SequencedMap<K, V> {
    return new UnmodifiableSequencedMap(this.q.reversed());
  }
  firstEntry(): MapEntry<K, V> | null {
    return wrapEntry(this.q.firstEntry());
  }
  lastEntry(): MapEntry<K, V> | null {
    return wrapEntry(this.q.lastEntry());
  }
  sequencedKeySet(): SequencedSet<K> {
    return new UnmodifiableSequencedSet(this.q.sequencedKeySet());
  }
  sequencedValues(): SequencedCollection<V> {
    return new UnmodifiableSequencedCollection(this.q.sequencedValues());
  }
  sequencedEntrySet(): SequencedSet<MapEntry<K, V>> {
    return new UnmodifiableEntrySet(this.q.sequencedEntrySet());
  }
  declare pollFirstEntry: () => MapEntry<K, V> | null;
  declare pollLastEntry: () => MapEntry<K, V> | null;
  declare putFirst: (key: K, value: V) => V | null;
  declare putLast: (key: K, value: V) => V | null;
}
lock(UnmodifiableSequencedMap, ['pollFirstEntry', 'pollLastEntry', 'putFirst', 'putLast']);

/** Serves SortedMap and NavigableMap views; methods the backing map lacks fail when called. */
class UnmodifiableNavigableMap<K, V> extends UnmodifiableSequencedMap<K, V> implements NavigableMap<K, V> {
  private get n(): NavigableMap<K, V> {
    return this.m as NavigableMap<K, V>;
  }
  comparator(): Comparator<K> | null {
    return this.n.comparator();
  }
  firstKey(): K {
    return this.n.firstKey();
  }
  lastKey(): K {
    return this.n.lastKey();
  }
  lowerEntry(key: K): MapEntry<K, V> | null {
    return wrapEntry(this.n.lowerEntry(key));
  }
  floorEntry(key: K): MapEntry<K, V> | null {
    return wrapEntry(this.n.floorEntry(key));
  }
  ceilingEntry(key: K): MapEntry<K, V> | null {
    return wrapEntry(this.n.ceilingEntry(key));
  }
  higherEntry(key: K): MapEntry<K, V> | null {
    return wrapEntry(this.n.higherEntry(key));
  }
  lowerKey(key: K): K | null {
    return this.n.lowerKey(key);
  }
  floorKey(key: K): K | null {
    return this.n.floorKey(key);
  }
  ceilingKey(key: K): K | null {
    return this.n.ceilingKey(key);
  }
  higherKey(key: K): K | null {
    return this.n.higherKey(key);
  }
  headMap(toKey: K, inclusive?: boolean): NavigableMap<K, V> {
    return wrapNavMap(arguments.length < 2 ? this.n.headMap(toKey) : this.n.headMap(toKey, inclusive as boolean));
  }
  tailMap(fromKey: K, inclusive?: boolean): NavigableMap<K, V> {
    return wrapNavMap(arguments.length < 2 ? this.n.tailMap(fromKey) : this.n.tailMap(fromKey, inclusive as boolean));
  }
  subMap(fromKey: K, a: K | boolean, b?: K, c?: boolean): NavigableMap<K, V> {
    return wrapNavMap(arguments.length >= 4 ? this.n.subMap(fromKey, a as boolean, b as K, c as boolean) : this.n.subMap(fromKey, a as K));
  }
  descendingMap(): NavigableMap<K, V> {
    return wrapNavMap(this.n.descendingMap());
  }
  override reversed(): NavigableMap<K, V> {
    return wrapNavMap(this.n.reversed());
  }
  navigableKeySet(): NavigableSet<K> {
    return wrapNavSet(this.n.navigableKeySet());
  }
  descendingKeySet(): NavigableSet<K> {
    return wrapNavSet(this.n.descendingKeySet());
  }
  override sequencedKeySet(): SequencedSet<K> {
    return wrapNavSet(this.n.sequencedKeySet() as SortedSet<K>);
  }
}

function wrapNavMap<K, V>(m: SortedMap<K, V>): NavigableMap<K, V> {
  return new UnmodifiableNavigableMap(m);
}

export function unmodifiableCollection<E>(c: Collection<E>): Collection<E> {
  requireNonNull(c);
  return c.constructor === UnmodifiableCollection ? c : new UnmodifiableCollection(c);
}

export function unmodifiableSequencedCollection<E>(c: SequencedCollection<E>): SequencedCollection<E> {
  requireNonNull(c);
  return c instanceof UnmodifiableSequencedCollection ? c : new UnmodifiableSequencedCollection(c);
}

export function unmodifiableList<E>(list: List<E>): List<E> {
  requireNonNull(list);
  return list instanceof ImmutableListBase ? list : new UnmodifiableList(list);
}

export function unmodifiableSet<E>(s: Set<E>): Set<E> {
  requireNonNull(s);
  return s instanceof ImmutableSetBase || s instanceof UnmodifiableSet ? s : new UnmodifiableSet(s);
}

/** Unmodifiable view with set equality; wrapping an unmodifiable sequenced (or sorted) set returns it. */
export function unmodifiableSequencedSet<E>(s: SequencedSet<E>): SequencedSet<E> {
  requireNonNull(s);
  return s instanceof UnmodifiableSequencedSet ? s : new UnmodifiableSequencedSet(s);
}

export function unmodifiableSortedSet<E>(s: SortedSet<E>): SortedSet<E> {
  requireNonNull(s);
  return s instanceof UnmodifiableNavigableSet ? s : new UnmodifiableNavigableSet(s);
}

export function unmodifiableNavigableSet<E>(s: NavigableSet<E>): NavigableSet<E> {
  requireNonNull(s);
  return s instanceof UnmodifiableNavigableSet ? s : new UnmodifiableNavigableSet(s);
}

export function unmodifiableMap<K, V>(m: Map<K, V>): Map<K, V> {
  requireNonNull(m);
  return m instanceof ImmutableMapBase ? m : new UnmodifiableMap(m);
}

/** Unmodifiable view with map equality; wrapping an unmodifiable sequenced (or sorted) map returns it. */
export function unmodifiableSequencedMap<K, V>(m: SequencedMap<K, V>): SequencedMap<K, V> {
  requireNonNull(m);
  return m instanceof UnmodifiableSequencedMap ? m : new UnmodifiableSequencedMap(m);
}

export function unmodifiableSortedMap<K, V>(m: SortedMap<K, V>): SortedMap<K, V> {
  requireNonNull(m);
  return m instanceof UnmodifiableNavigableMap ? m : new UnmodifiableNavigableMap(m);
}

export function unmodifiableNavigableMap<K, V>(m: NavigableMap<K, V>): NavigableMap<K, V> {
  requireNonNull(m);
  return m instanceof UnmodifiableNavigableMap ? m : new UnmodifiableNavigableMap(m);
}

// ---- empty sorted collections: shared unmodifiable views of empty tree collections

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- one shared instance serves every element type (comparator() and methods are variance-sensitive)
const EMPTY_NAVIGABLE_SET: NavigableSet<any> = new UnmodifiableNavigableSet(new TreeSet());
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EMPTY_NAVIGABLE_MAP: NavigableMap<any, any> = new UnmodifiableNavigableMap(new TreeMap());

export function emptySortedSet<E>(): SortedSet<E> {
  return EMPTY_NAVIGABLE_SET;
}
export function emptyNavigableSet<E>(): NavigableSet<E> {
  return EMPTY_NAVIGABLE_SET;
}
export function emptySortedMap<K, V>(): SortedMap<K, V> {
  return EMPTY_NAVIGABLE_MAP;
}
export function emptyNavigableMap<K, V>(): NavigableMap<K, V> {
  return EMPTY_NAVIGABLE_MAP;
}

// ---- sets backed by maps, LIFO queue view

function setFromMap<E>(map: Map<E, boolean>, keys: Set<E>, sequenced: boolean): Set<E> {
  const m = map as SequencedMap<E, boolean>;
  return delegate(keys, (view) => {
    const add = (e: E) => map.put(e, true) === null;
    const o: Record<string, unknown> = {
      add,
      addAll(c: Collection<E>): boolean {
        let changed = false;
        for (const e of requireNonNull(c).toArray()) if (add(e)) changed = true;
        return changed;
      },
      equals: (x: unknown) => x === view || keys.equals(x),
    };
    if (sequenced) {
      o.addFirst = (e: E) => void m.putFirst(e, true);
      o.addLast = (e: E) => void m.putLast(e, true);
      o.reversed = () => setFromMap(m.reversed(), m.reversed().sequencedKeySet(), true);
    }
    return o;
  });
}

/**
 * Set view of an empty map: add(e) is map.put(e, true) === null, everything else goes through map.keySet().
 * @throws IllegalArgumentException if map is not empty
 */
export function newSetFromMap<E>(map: Map<E, boolean>): Set<E> {
  if (!requireNonNull(map).isEmpty()) throw new IllegalArgumentException('Map is non-empty');
  return setFromMap(map, map.keySet(), false);
}

/**
 * Sequenced set view of an empty sequenced map: addFirst/addLast use putFirst/putLast, the rest goes
 * through map.sequencedKeySet(). @throws IllegalArgumentException if map is not empty
 */
export function newSequencedSetFromMap<E>(map: SequencedMap<E, boolean>): SequencedSet<E> {
  if (!requireNonNull(map).isEmpty()) throw new IllegalArgumentException('Map is non-empty');
  return setFromMap(map, map.sequencedKeySet(), true) as SequencedSet<E>;
}

/**
 * Last-in-first-out Queue view of a deque: add/offer push at the front, remove/poll/element/peek
 * read the front, addAll adds each element in turn at the front. equals/hashCode are by identity.
 */
export function asLifoQueue<E>(deque: Deque<E>): Queue<E> {
  const d = requireNonNull(deque);
  return delegate(d, (view) => ({
    ...identityEquality(view),
    add: (e: E) => (d.addFirst(e), true),
    offer: (e: E) => d.offerFirst(e),
    remove: (...a: unknown[]) => (a.length > 0 ? d.remove(a[0]) : d.removeFirst()),
    poll: () => d.pollFirst(),
    element: () => d.getFirst(),
    peek: () => d.peekFirst(),
    addAll(c: Collection<E>): boolean {
      const a = requireNonNull(c).toArray();
      for (const e of a) d.addFirst(e);
      return a.length > 0;
    },
  }));
}

// ---- legacy enumerations

/** Enumeration over c's iterator. */
export function enumeration<E>(c: Collection<E>): Enumeration<E> {
  const it = requireNonNull(c).iterator();
  return {
    hasMoreElements: () => it.hasNext(),
    nextElement: () => it.next(),
    asIterator: () => ({
      hasNext: () => it.hasNext(),
      next: () => it.next(),
      remove(): void {
        throw new UnsupportedOperationException('remove');
      },
      forEachRemaining(action: (e: E) => void): void {
        requireNonNull(action);
        while (it.hasNext()) action(it.next());
      },
    }),
  };
}

/** The remaining elements of e, in order, in a new ArrayList. */
export function list<E>(e: Enumeration<E>): ArrayList<E> {
  requireNonNull(e);
  const out = new ArrayList<E>();
  while (e.hasMoreElements()) out.add(e.nextElement());
  return out;
}

export {
  checkedCollection,
  checkedList,
  checkedMap,
  checkedNavigableMap,
  checkedNavigableSet,
  checkedQueue,
  checkedSet,
  checkedSortedMap,
  checkedSortedSet,
  synchronizedCollection,
  synchronizedList,
  synchronizedMap,
  synchronizedNavigableMap,
  synchronizedNavigableSet,
  synchronizedSet,
  synchronizedSortedMap,
  synchronizedSortedSet,
};
export type { TypeCheck };

export const Collections = {
  sort,
  reverse,
  shuffle,
  swap,
  fill,
  copy,
  min,
  max,
  frequency,
  disjoint,
  binarySearch,
  rotate,
  nCopies,
  addAll,
  indexOfSubList,
  lastIndexOfSubList,
  replaceAll,
  reverseOrder,
  emptyList,
  emptySet,
  emptyMap,
  emptySortedSet,
  emptyNavigableSet,
  emptySortedMap,
  emptyNavigableMap,
  emptyIterator,
  emptyListIterator,
  emptyEnumeration,
  singletonList,
  singleton,
  singletonMap,
  unmodifiableCollection,
  unmodifiableSequencedCollection,
  unmodifiableList,
  unmodifiableSet,
  unmodifiableSequencedSet,
  unmodifiableSortedSet,
  unmodifiableNavigableSet,
  unmodifiableMap,
  unmodifiableSequencedMap,
  unmodifiableSortedMap,
  unmodifiableNavigableMap,
  newSetFromMap,
  newSequencedSetFromMap,
  asLifoQueue,
  enumeration,
  list,
  checkedCollection,
  checkedList,
  checkedSet,
  checkedSortedSet,
  checkedNavigableSet,
  checkedQueue,
  checkedMap,
  checkedSortedMap,
  checkedNavigableMap,
  synchronizedCollection,
  synchronizedList,
  synchronizedSet,
  synchronizedSortedSet,
  synchronizedNavigableSet,
  synchronizedMap,
  synchronizedSortedMap,
  synchronizedNavigableMap,
  EMPTY_LIST,
  EMPTY_SET,
  EMPTY_MAP,
};
