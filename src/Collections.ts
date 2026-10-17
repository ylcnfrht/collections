import { entryEquals, entryHash, entryToString, mapIterator, SimpleImmutableEntry } from './abstract/AbstractMap';
import { IllegalArgumentException, IndexOutOfBoundsException, NoSuchElementException } from './exceptions';
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
import { Iterator, ListIterator } from './interfaces/Iterator';
import { List } from './interfaces/List';
import { Map, MapEntry, NavigableMap, SortedMap } from './interfaces/Map';
import { NavigableSet, SequencedSet, Set, SortedSet } from './interfaces/Set';
import { Comparator, naturalCompare } from './util/Comparator';
import { isRandomAccess, isSet, RANDOM_ACCESS, SET_BRAND } from './util/guards';
import { equals, requireNonNull } from './util/Objects';
import { jsIterator } from './map/HashMap';

// ---- algorithms
// RandomAccess lists use get/set; other lists use list iterators (or one array copy) so everything stays O(n) on a LinkedList.

/** Stable sort; null/omitted comparator = natural ordering. */
export function sort<E>(list: List<E>, c?: Comparator<E> | null): void {
  list.sort(c ?? null);
}

export function reverse(list: List<unknown>): void {
  const n = list.size();
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

/** Fisher–Yates shuffle; random() must return a number in [0, 1). */
export function shuffle(list: List<unknown>, random: () => number = Math.random): void {
  requireNonNull(random);
  if (isRandomAccess(list)) {
    for (let i = list.size() - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      list.set(i, list.set(j, list.get(i)));
    }
    return;
  }
  const a = list.toArray();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
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
  list.set(i, list.set(j, list.get(i)));
}

export function fill<E>(list: List<E>, v: E): void {
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
  const n = src.size();
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
  const it = coll.iterator();
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
  const it = coll.iterator();
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
  let hi = list.size() - 1;
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

/** Moves the element at i to (i + distance) mod size. Any distance (negative, larger than size) is fine. */
export function rotate(list: List<unknown>, distance: number): void {
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

/** Immutable list of n copies of o (o may be null). @throws IllegalArgumentException when n < 0 */
export function nCopies<E>(n: number, o: E): List<E> {
  if (!(n >= 0)) throw new IllegalArgumentException(`List length = ${n}`);
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
  return isRandomAccess(l) ? l : new ImmutableList(l.toArray(), false);
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

const REVERSED_FROM: unique symbol = Symbol('reversedFrom');
type Reversed<T> = Comparator<T> & { [REVERSED_FROM]?: Comparator<T> };

const REVERSE_NATURAL: Reversed<unknown> = (a, b) => naturalCompare(b, a);
REVERSE_NATURAL[REVERSED_FROM] = naturalCompare;

/** Reverse of c (or of natural ordering); reversing a reversed comparator gives back the original. */
export function reverseOrder<T>(c?: Comparator<T> | null): Comparator<T> {
  if (c == null) return REVERSE_NATURAL;
  const from = (c as Reversed<T>)[REVERSED_FROM];
  if (from !== undefined) return from;
  const r: Reversed<T> = (a, b) => c(b, a);
  r[REVERSED_FROM] = c;
  return r;
}

// ---- empty and singleton collections (null elements allowed)

const EMPTY_LIST = new ImmutableList<never>([], true);
const EMPTY_SET = buildSet<never>([], false, true);
const EMPTY_MAP = buildMap<never, never>([], true);

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
  override toArray(): E[] {
    return this.c.toArray();
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

/** Serves SortedSet, NavigableSet and SequencedSet views; methods the backing set lacks fail when called. */
class UnmodifiableNavigableSet<E> extends UnmodifiableSet<E> implements NavigableSet<E> {
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
  getFirst(): E {
    return this.s.getFirst();
  }
  getLast(): E {
    return this.s.getLast();
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
  reversed(): NavigableSet<E> {
    return wrapNavSet(this.s.reversed());
  }
  declare pollFirst: () => E | null;
  declare pollLast: () => E | null;
  declare addFirst: (e: E) => void;
  declare addLast: (e: E) => void;
  declare removeFirst: () => E;
  declare removeLast: () => E;
}
lock(UnmodifiableNavigableSet, [...SEQUENCED_MUTATORS, 'pollFirst', 'pollLast']);

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
  override toArray(): E[] {
    return this.l.toArray();
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
  override toArray(): MapEntry<K, V>[] {
    return this.c.toArray().map((e) => new UnmodifiableEntry(e));
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

/** Serves SortedMap and NavigableMap views; methods the backing map lacks fail when called. */
class UnmodifiableNavigableMap<K, V> extends UnmodifiableMap<K, V> implements NavigableMap<K, V> {
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
  firstEntry(): MapEntry<K, V> | null {
    return wrapEntry(this.n.firstEntry());
  }
  lastEntry(): MapEntry<K, V> | null {
    return wrapEntry(this.n.lastEntry());
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
  reversed(): NavigableMap<K, V> {
    return wrapNavMap(this.n.reversed());
  }
  navigableKeySet(): NavigableSet<K> {
    return wrapNavSet(this.n.navigableKeySet());
  }
  descendingKeySet(): NavigableSet<K> {
    return wrapNavSet(this.n.descendingKeySet());
  }
  sequencedKeySet(): SequencedSet<K> {
    return wrapNavSet(this.n.sequencedKeySet() as SortedSet<K>);
  }
  sequencedValues(): SequencedCollection<V> {
    return new UnmodifiableSequencedCollection(this.n.sequencedValues());
  }
  sequencedEntrySet(): SequencedSet<MapEntry<K, V>> {
    return new UnmodifiableEntrySet(this.n.sequencedEntrySet());
  }
  declare pollFirstEntry: () => MapEntry<K, V> | null;
  declare pollLastEntry: () => MapEntry<K, V> | null;
  declare putFirst: (key: K, value: V) => V | null;
  declare putLast: (key: K, value: V) => V | null;
}
lock(UnmodifiableNavigableMap, ['pollFirstEntry', 'pollLastEntry', 'putFirst', 'putLast']);

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

export function unmodifiableSortedMap<K, V>(m: SortedMap<K, V>): SortedMap<K, V> {
  requireNonNull(m);
  return m instanceof UnmodifiableNavigableMap ? m : new UnmodifiableNavigableMap(m);
}

export function unmodifiableNavigableMap<K, V>(m: NavigableMap<K, V>): NavigableMap<K, V> {
  requireNonNull(m);
  return m instanceof UnmodifiableNavigableMap ? m : new UnmodifiableNavigableMap(m);
}

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
  singletonList,
  singleton,
  singletonMap,
  unmodifiableCollection,
  unmodifiableSequencedCollection,
  unmodifiableList,
  unmodifiableSet,
  unmodifiableSortedSet,
  unmodifiableNavigableSet,
  unmodifiableMap,
  unmodifiableSortedMap,
  unmodifiableNavigableMap,
};
