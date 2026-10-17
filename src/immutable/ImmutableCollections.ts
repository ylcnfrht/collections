import { AbstractCollection } from '../abstract/AbstractCollection';
import { AbstractList, subListRangeCheck } from '../abstract/AbstractList';
import { AbstractMap, mapIterator, SimpleImmutableEntry } from '../abstract/AbstractMap';
import { AbstractSet } from '../abstract/AbstractSet';
import { IllegalArgumentException, IndexOutOfBoundsException, NoSuchElementException, UnsupportedOperationException } from '../exceptions';
import { Collection } from '../interfaces/Collection';
import { Iterator, ListIterator } from '../interfaces/Iterator';
import { List as ListType } from '../interfaces/List';
import { Map as MapType, MapEntry } from '../interfaces/Map';
import { Set as SetType } from '../interfaces/Set';
import { HashMap, isPlainKey, jsIterator } from '../map/HashMap';
import { HashSet } from '../set/HashSet';
import { isEntry, isList, RANDOM_ACCESS } from '../util/guards';
import { checkPositionIndex, equals, hashCode, requireNonNull, toString } from '../util/Objects';

/** Thrown by every mutator of an unmodifiable collection, whether or not the call would change anything. */
export function uoe(): never {
  throw new UnsupportedOperationException();
}

/** Replaces the named inherited methods with uoe on ctor's prototype. */
export function lock(ctor: { prototype: object }, names: readonly string[]): void {
  for (const n of names) Object.defineProperty(ctor.prototype, n, { value: uoe, writable: true, configurable: true });
}

export const COLLECTION_MUTATORS = ['add', 'addAll', 'remove', 'removeIf', 'retainAll', 'removeAll', 'clear'] as const;
export const SEQUENCED_MUTATORS = ['addFirst', 'addLast', 'removeFirst', 'removeLast'] as const;
const LIST_MUTATORS = [
  ...COLLECTION_MUTATORS,
  ...SEQUENCED_MUTATORS,
  'set',
  'removeAt',
  'replaceAll',
  'sort',
  'addAtIndex',
  'addAllAt',
  'removeRange',
];
export const MAP_MUTATORS = [
  'put',
  'remove',
  'putAll',
  'clear',
  'replaceAll',
  'putIfAbsent',
  'replace',
  'computeIfAbsent',
  'computeIfPresent',
  'compute',
  'merge',
] as const;

/** Base of every unmodifiable collection here: all Collection mutators throw. */
export abstract class ImmutableCollectionBase<E> extends AbstractCollection<E> {}
lock(ImmutableCollectionBase, COLLECTION_MUTATORS);

/** Base of every unmodifiable set here. */
export abstract class ImmutableSetBase<E> extends AbstractSet<E> {}
lock(ImmutableSetBase, COLLECTION_MUTATORS);

/** Base of every unmodifiable list (List.of lists and Collections.unmodifiableList views). */
export abstract class ImmutableListBase<E> extends AbstractList<E> {}
lock(ImmutableListBase, LIST_MUTATORS);

/** Base of every unmodifiable map; the default mutators throw too. */
export abstract class ImmutableMapBase<K, V> extends AbstractMap<K, V> {}
lock(ImmutableMapBase, MAP_MUTATORS);

/** Read-only ListIterator over an array. */
export class ArrayItr<E> implements ListIterator<E> {
  constructor(private readonly a: readonly E[], private i: number) {}
  hasNext(): boolean {
    return this.i < this.a.length;
  }
  next(): E {
    if (this.i >= this.a.length) throw new NoSuchElementException();
    return this.a[this.i++];
  }
  hasPrevious(): boolean {
    return this.i > 0;
  }
  previous(): E {
    if (this.i <= 0) throw new NoSuchElementException();
    return this.a[--this.i];
  }
  nextIndex(): number {
    return this.i;
  }
  previousIndex(): number {
    return this.i - 1;
  }
  forEachRemaining(action: (e: E) => void): void {
    requireNonNull(action);
    const a = this.a;
    while (this.i < a.length) action(a[this.i++]);
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

function outOfBounds(index: number, length: number): never {
  throw new IndexOutOfBoundsException(`Index ${index} out of bounds for length ${length}`);
}

/**
 * Unmodifiable random-access list over a frozen array. Built by List.of/copyOf (nulls rejected)
 * and by Collections.emptyList/singletonList/nCopies (nulls allowed).
 */
export class ImmutableList<E> extends ImmutableListBase<E> {
  /** @internal frozen backing array */
  readonly es: readonly E[];
  /** @internal true when nulls were rejected at construction, so List.copyOf may return it as-is */
  readonly nullFree: boolean;

  constructor(es: readonly E[], nullFree: boolean) {
    super();
    this.es = Object.freeze(es);
    this.nullFree = nullFree;
  }

  get [RANDOM_ACCESS](): true {
    return true;
  }

  size(): number {
    return this.es.length;
  }

  override isEmpty(): boolean {
    return this.es.length === 0;
  }

  get(index: number): E {
    const a = this.es;
    if ((index >>> 0) !== index || index >= a.length) outOfBounds(index, a.length);
    return a[index];
  }

  override getFirst(): E {
    if (this.es.length === 0) throw new NoSuchElementException();
    return this.es[0];
  }

  override getLast(): E {
    const a = this.es;
    if (a.length === 0) throw new NoSuchElementException();
    return a[a.length - 1];
  }

  override indexOf(o: unknown): number {
    const a = this.es;
    // SameValueZero keys match exactly what native indexOf finds (NaN aside)
    if (isPlainKey(o) && o === o) return a.indexOf(o as E);
    for (let i = 0; i < a.length; i++) if (equals(o, a[i])) return i;
    return -1;
  }

  override lastIndexOf(o: unknown): number {
    const a = this.es;
    if (isPlainKey(o) && o === o) return a.lastIndexOf(o as E);
    for (let i = a.length - 1; i >= 0; i--) if (equals(o, a[i])) return i;
    return -1;
  }

  override contains(o: unknown): boolean {
    return this.indexOf(o) >= 0;
  }

  override toArray(): E[] {
    return this.es.slice();
  }

  override forEach(action: (e: E) => void): void {
    requireNonNull(action);
    const a = this.es;
    for (let i = 0; i < a.length; i++) action(a[i]);
  }

  override iterator(): Iterator<E> {
    return new ArrayItr(this.es, 0);
  }

  override listIterator(index = 0): ListIterator<E> {
    checkPositionIndex(index, this.es.length);
    return new ArrayItr(this.es, index);
  }

  // the native array iterator is a plain object, not a generator
  override [Symbol.iterator](): Generator<E> {
    return this.es[Symbol.iterator]() as unknown as Generator<E>;
  }

  // shortcut: subList/reversed copy (O(k)) instead of viewing; contents can never change, so it is indistinguishable
  override subList(fromIndex: number, toIndex: number): ListType<E> {
    subListRangeCheck(fromIndex, toIndex, this.es.length);
    return new ImmutableList(this.es.slice(fromIndex, toIndex), this.nullFree);
  }

  override reversed(): ListType<E> {
    return new ImmutableList(this.es.slice().reverse(), this.nullFree);
  }

  override equals(o: unknown): boolean {
    if (o === this) return true;
    if (!isList(o)) return false;
    const a = this.es;
    const b = o instanceof ImmutableList ? (o.es as unknown[]) : null;
    if (b !== null) {
      if (b.length !== a.length) return false;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && !equals(a[i], b[i])) return false;
      return true;
    }
    const it = o.iterator();
    for (let i = 0; i < a.length; i++) {
      if (!it.hasNext()) return false;
      const y = it.next();
      if (a[i] !== y && !equals(a[i], y)) return false;
    }
    return !it.hasNext();
  }

  override hashCode(): number {
    const a = this.es;
    let h = 1;
    for (let i = 0; i < a.length; i++) h = (Math.imul(31, h) + hashCode(a[i])) | 0;
    return h;
  }

  override toString(): string {
    const a = this.es;
    let s = '[';
    for (let i = 0; i < a.length; i++) s += (i > 0 ? ', ' : '') + toString(a[i]);
    return s + ']';
  }
}

/**
 * Unmodifiable set: elements in a frozen array (iteration follows it; treat the order as unspecified),
 * lookups through a private HashSet.
 */
export class ImmutableSet<E> extends ImmutableSetBase<E> {
  constructor(
    /** @internal */ readonly es: readonly E[],
    private readonly lookup: HashSet<E>,
    /** @internal */ readonly nullFree: boolean
  ) {
    super();
    Object.freeze(es);
  }

  size(): number {
    return this.es.length;
  }

  override isEmpty(): boolean {
    return this.es.length === 0;
  }

  override contains(o: unknown): boolean {
    return this.lookup.contains(o);
  }

  override toArray(): E[] {
    return this.es.slice();
  }

  override forEach(action: (e: E) => void): void {
    requireNonNull(action);
    const a = this.es;
    for (let i = 0; i < a.length; i++) action(a[i]);
  }

  iterator(): Iterator<E> {
    return new ArrayItr(this.es, 0);
  }

  override [Symbol.iterator](): Generator<E> {
    return this.es[Symbol.iterator]() as unknown as Generator<E>;
  }

  override hashCode(): number {
    let h = 0;
    for (let i = 0; i < this.es.length; i++) h = (h + hashCode(this.es[i])) | 0;
    return h;
  }
}

/** @internal Builds a set; rejectDup throws on a repeated element, nullFree throws on null/undefined. */
export function buildSet<E>(src: readonly E[], rejectDup: boolean, nullFree: boolean): ImmutableSet<E> {
  const lookup = new HashSet<E>();
  const es: E[] = [];
  for (let i = 0; i < src.length; i++) {
    const e = src[i];
    if (nullFree) requireNonNull(e);
    if (lookup.add(e)) es.push(e);
    else if (rejectDup) throw new IllegalArgumentException(`duplicate element: ${toString(e)}`);
  }
  return new ImmutableSet(es, lookup, nullFree);
}

/**
 * Unmodifiable map: immutable entries in a frozen array (iteration follows it; treat the order as unspecified),
 * lookups through a native Map for SameValueZero keys (the common case, as fast as a bare native Map)
 * and a private HashMap for keys with equals()/hashCode() and Dates. The two never overlap:
 * such a key is never equal to a SameValueZero key.
 */
export class ImmutableMap<K, V> extends ImmutableMapBase<K, V> {
  private ks: SetType<K> | undefined;
  private vs: Collection<V> | undefined;
  private ens: SetType<MapEntry<K, V>> | undefined;

  constructor(
    /** @internal */ readonly entries: readonly MapEntry<K, V>[],
    /** @internal */ readonly plain: globalThis.Map<unknown, V>,
    /** @internal */ readonly other: HashMap<K, V>,
    /** @internal */ readonly nullFree: boolean
  ) {
    super();
    Object.freeze(entries);
  }

  override size(): number {
    return this.entries.length;
  }

  override isEmpty(): boolean {
    return this.entries.length === 0;
  }

  override get(key: unknown): V | null {
    // primitive test inlined ahead of isPlainKey: keeps the common get to one native lookup
    if ((typeof key === 'object' || typeof key === 'function') && !isPlainKey(key)) return this.other.get(key);
    const v = this.plain.get(key);
    return v === undefined ? null : v;
  }

  override containsKey(key: unknown): boolean {
    return isPlainKey(key) ? this.plain.has(key) : this.other.containsKey(key);
  }

  override containsValue(value: unknown): boolean {
    const a = this.entries;
    for (let i = 0; i < a.length; i++) if (equals(value, a[i].getValue())) return true;
    return false;
  }

  override getOrDefault(key: unknown, defaultValue: V): V {
    return this.containsKey(key) ? (this.get(key) as V) : defaultValue;
  }

  override forEach(action: (key: K, value: V) => void): void {
    requireNonNull(action);
    const a = this.entries;
    for (let i = 0; i < a.length; i++) action(a[i].getKey(), a[i].getValue());
  }

  entrySet(): SetType<MapEntry<K, V>> {
    return (this.ens ??= new EntrySetView(this));
  }

  override keySet(): SetType<K> {
    return (this.ks ??= new KeySetView(this));
  }

  override values(): Collection<V> {
    return (this.vs ??= new ValuesView(this));
  }

  override [Symbol.iterator](): Generator<[K, V]> {
    return jsIterator(new ArrayItr(this.entries, 0), (e) => [e.getKey(), e.getValue()] as [K, V]) as unknown as Generator<[K, V]>;
  }

  override hashCode(): number {
    let h = 0;
    for (const e of this.entries) h = (h + e.hashCode()) | 0;
    return h;
  }
}

class EntrySetView<K, V> extends ImmutableSetBase<MapEntry<K, V>> {
  constructor(private readonly map: ImmutableMap<K, V>) {
    super();
  }
  iterator(): Iterator<MapEntry<K, V>> {
    return new ArrayItr(this.map.entries, 0);
  }
  override [Symbol.iterator](): Generator<MapEntry<K, V>> {
    return this.map.entries[Symbol.iterator]() as unknown as Generator<MapEntry<K, V>>;
  }
  size(): number {
    return this.map.entries.length;
  }
  override contains(o: unknown): boolean {
    if (!isEntry(o)) return false;
    const k = o.getKey();
    return this.map.containsKey(k) && equals(this.map.get(k), o.getValue());
  }
  override toArray(): MapEntry<K, V>[] {
    return this.map.entries.slice();
  }
}

class KeySetView<K, V> extends ImmutableSetBase<K> {
  constructor(private readonly map: ImmutableMap<K, V>) {
    super();
  }
  iterator(): Iterator<K> {
    return mapIterator(new ArrayItr(this.map.entries, 0), (e) => e.getKey());
  }
  override [Symbol.iterator](): Generator<K> {
    return jsIterator(this.iterator()) as unknown as Generator<K>;
  }
  size(): number {
    return this.map.entries.length;
  }
  override contains(o: unknown): boolean {
    return this.map.containsKey(o);
  }
}

class ValuesView<K, V> extends ImmutableCollectionBase<V> {
  constructor(private readonly map: ImmutableMap<K, V>) {
    super();
  }
  iterator(): Iterator<V> {
    return mapIterator(new ArrayItr(this.map.entries, 0), (e) => e.getValue());
  }
  override [Symbol.iterator](): Generator<V> {
    return jsIterator(this.iterator()) as unknown as Generator<V>;
  }
  size(): number {
    return this.map.entries.length;
  }
  override contains(o: unknown): boolean {
    return this.map.containsValue(o);
  }
}

/** @internal Builds a map from immutable entries; a repeated key throws IllegalArgumentException. */
export function buildMap<K, V>(entries: MapEntry<K, V>[], nullFree: boolean): ImmutableMap<K, V> {
  const plain = new globalThis.Map<unknown, V>();
  const other = new HashMap<K, V>();
  for (let i = 0; i < entries.length; i++) {
    const k = entries[i].getKey();
    const p = isPlainKey(k);
    if (p ? plain.has(k) : other.containsKey(k)) throw new IllegalArgumentException(`duplicate key: ${toString(k)}`);
    if (p) plain.set(k, entries[i].getValue());
    else other.put(k, entries[i].getValue());
  }
  return new ImmutableMap(entries, plain, other, nullFree);
}

function immutableEntry<K, V>(k: K, v: V): MapEntry<K, V> {
  return new SimpleImmutableEntry(requireNonNull(k) as K, requireNonNull(v) as V);
}

function rejectNulls<E>(a: E[]): E[] {
  for (let i = 0; i < a.length; i++) requireNonNull(a[i]);
  return a;
}

export type List<E> = ListType<E>;
export type Set<E> = SetType<E>;
export type Map<K, V> = MapType<K, V>;

/** Unmodifiable lists: random access, null elements rejected, value equality with any List. */
export const List = {
  of<E>(...elements: E[]): ListType<E> {
    // the rest array is fresh, so it can be frozen in place
    return new ImmutableList(rejectNulls(elements), true);
  },
  copyOf<E>(c: Collection<E>): ListType<E> {
    if (c instanceof ImmutableList && c.nullFree) return c;
    return new ImmutableList(rejectNulls(requireNonNull(c).toArray()), true);
  },
};

/** Unmodifiable sets: null elements rejected, value equality with any Set; iteration order is unspecified. */
export const Set = {
  /** @throws IllegalArgumentException on a duplicate element */
  of<E>(...elements: E[]): SetType<E> {
    return buildSet(elements, true, true);
  },
  /** Duplicates are dropped. */
  copyOf<E>(c: Collection<E>): SetType<E> {
    if (c instanceof ImmutableSet && c.nullFree) return c;
    return buildSet(requireNonNull(c).toArray(), false, true);
  },
};

function mapOf<K, V>(): MapType<K, V>;
function mapOf<K, V>(k1: K, v1: V): MapType<K, V>;
function mapOf<K, V>(k1: K, v1: V, k2: K, v2: V): MapType<K, V>;
function mapOf<K, V>(k1: K, v1: V, k2: K, v2: V, k3: K, v3: V): MapType<K, V>;
function mapOf<K, V>(k1: K, v1: V, k2: K, v2: V, k3: K, v3: V, k4: K, v4: V): MapType<K, V>;
function mapOf<K, V>(k1: K, v1: V, k2: K, v2: V, k3: K, v3: V, k4: K, v4: V, k5: K, v5: V): MapType<K, V>;
function mapOf<K, V>(...keysAndValues: (K | V)[]): MapType<K, V>;
function mapOf<K, V>(...kvs: unknown[]): MapType<K, V> {
  if (kvs.length % 2 !== 0) throw new IllegalArgumentException('Map.of needs key/value pairs');
  const entries: MapEntry<K, V>[] = [];
  for (let i = 0; i < kvs.length; i += 2) entries.push(immutableEntry(kvs[i] as K, kvs[i + 1] as V));
  return buildMap(entries, true);
}

/** Unmodifiable maps: null keys/values rejected, duplicate keys rejected; iteration order is unspecified. */
export const Map = {
  /** Map.of(k1, v1, k2, v2, ...). @throws IllegalArgumentException on an odd argument count or a duplicate key */
  of: mapOf,
  ofEntries<K, V>(...entries: MapEntry<K, V>[]): MapType<K, V> {
    const es: MapEntry<K, V>[] = [];
    for (const e of entries) es.push(immutableEntry(requireNonNull(e).getKey(), e.getValue()));
    return buildMap(es, true);
  },
  /** Immutable entry; setValue throws UnsupportedOperationException. */
  entry<K, V>(k: K, v: V): MapEntry<K, V> {
    return immutableEntry(k, v);
  },
  copyOf<K, V>(m: MapType<K, V>): MapType<K, V> {
    if (m instanceof ImmutableMap && m.nullFree) return m;
    const es: MapEntry<K, V>[] = [];
    for (const e of requireNonNull(m).entrySet().toArray()) es.push(immutableEntry(e.getKey(), e.getValue()));
    return buildMap(es, true);
  },
};
