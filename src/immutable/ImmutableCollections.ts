import { AbstractCollection } from '../abstract/AbstractCollection';
import { AbstractList, removeWhere, ReverseOrderListView, subListRangeCheck } from '../abstract/AbstractList';

export { removeWhere, ReverseOrderListView };
import { AbstractMap, mapIterator, SimpleImmutableEntry } from '../abstract/AbstractMap';
import { AbstractSet } from '../abstract/AbstractSet';
import {
  IllegalArgumentException,
  IllegalStateException,
  IndexOutOfBoundsException,
  ArrayIndexOutOfBoundsException,
  NoSuchElementException,
  NullPointerException,
  UnsupportedOperationException,
} from '../exceptions';
import { Collection } from '../interfaces/Collection';
import { Iterator, ListIterator } from '../interfaces/Iterator';
import { List as ListType } from '../interfaces/List';
import { Map as MapType, MapEntry } from '../interfaces/Map';
import { Set as SetType } from '../interfaces/Set';
import { HashMap, isPlainKey, jsIterator } from '../map/HashMap';
import { HashSet } from '../set/HashSet';
import { toArrayWith, WritableArrayLike } from '../util/arrays';
import { naturalCompare } from '../util/Comparator';
import { Spliterator } from '../stream/Spliterator';
import { ArraySpliterator } from '../stream/Spliterators';
import { isEntry, isList, RANDOM_ACCESS } from '../util/guards';
import { checkIndex, checkPositionIndex, equals, hashCode, requireNonNull, toString } from '../util/Objects';

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

/** Null query against a collection from List.of/Set.of/Map.of (which reject null queries, as their nulls can never be present). */
function nullQuery(): never {
  throw new NullPointerException();
}

// the reference backs 1- and 2-element List.of lists with a class that throws IndexOutOfBoundsException,
// and every other size with an array, whose get throws ArrayIndexOutOfBoundsException
function listOf<E>(es: E[]): ImmutableList<E> {
  return new ImmutableList(es, true, true, es.length !== 1 && es.length !== 2);
}

function outOfBounds(index: number, length: number): never {
  throw new IndexOutOfBoundsException(`Index ${index} out of bounds for length ${length}`);
}

/**
 * Unmodifiable random-access list over a frozen array. Built by List.of/copyOf (null elements and null
 * queries rejected) and by Collections.emptyList/singletonList/nCopies (nulls allowed).
 */
export class ImmutableList<E> extends ImmutableListBase<E> {
  /** @internal frozen backing array */
  readonly es: readonly E[];
  /** @internal true when no element is null/undefined */
  readonly nullFree: boolean;
  /** @internal true for List.of/copyOf lists: null queries throw NullPointerException, and List.copyOf may return it as-is */
  readonly nullHostile: boolean;

  /** @internal get() throws ArrayIndexOutOfBoundsException, as the reference does for List.of of 0 or 3+ elements */
  readonly arrayIndexErrors: boolean;

  constructor(es: readonly E[], nullFree: boolean, nullHostile = false, arrayIndexErrors = false) {
    super();
    this.es = Object.freeze(es);
    this.nullFree = nullFree;
    this.nullHostile = nullHostile;
    this.arrayIndexErrors = arrayIndexErrors;
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
    if ((index >>> 0) !== index || index >= a.length) {
      if (this.arrayIndexErrors) throw new ArrayIndexOutOfBoundsException(`Index ${index} out of bounds for length ${a.length}`);
      outOfBounds(index, a.length);
    }
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
    if (o == null && this.nullHostile) nullQuery();
    const a = this.es;
    // SameValueZero keys match exactly what native indexOf finds (NaN aside)
    if (isPlainKey(o) && o === o) return a.indexOf(o as E);
    for (let i = 0; i < a.length; i++) if (equals(o, a[i])) return i;
    return -1;
  }

  override lastIndexOf(o: unknown): number {
    if (o == null && this.nullHostile) nullQuery();
    const a = this.es;
    if (isPlainKey(o) && o === o) return a.lastIndexOf(o as E);
    for (let i = a.length - 1; i >= 0; i--) if (equals(o, a[i])) return i;
    return -1;
  }

  override contains(o: unknown): boolean {
    return this.indexOf(o) >= 0;
  }

  override toArray(): E[];
  override toArray<A extends WritableArrayLike<E>>(generator: (length: number) => A): A;
  override toArray<A extends WritableArrayLike<E>>(generator?: (length: number) => A): E[] | A {
    return arguments.length > 0 ? toArrayWith(this.es, generator as (length: number) => A) : this.es.slice();
  }

  override forEach(action: (e: E) => void): void {
    requireNonNull(action);
    const a = this.es;
    for (let i = 0; i < a.length; i++) action(a[i]);
  }

  override iterator(): Iterator<E> {
    return new ArrayItr(this.es, 0);
  }

  /** ORDERED|SIZED|SUBSIZED over the frozen array, splitting in halves (what the reference's List.of reports). */
  override spliterator(): Spliterator<E> {
    return new ArraySpliterator(this.es, 0, this.es.length, Spliterator.ORDERED | Spliterator.SIZED | Spliterator.SUBSIZED);
  }

  override listIterator(index = 0): ListIterator<E> {
    checkPositionIndex(index, this.es.length);
    return new ArrayItr(this.es, index);
  }

  // the native array iterator is a plain object, not a generator
  override [Symbol.iterator](): Generator<E> {
    return this.es[Symbol.iterator]() as unknown as Generator<E>;
  }

  // shortcut: subList copies (O(k)) instead of viewing; contents can never change, so it is indistinguishable
  override subList(fromIndex: number, toIndex: number): ListType<E> {
    subListRangeCheck(fromIndex, toIndex, this.es.length);
    return new ImmutableList(this.es.slice(fromIndex, toIndex), this.nullFree, this.nullHostile);
  }

  override reversed(): ListType<E> {
    return ReverseOrderListView.of(this, false);
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
    /** @internal no null elements */ readonly nullFree: boolean,
    /** @internal Set.of/copyOf: null queries throw */ readonly nullHostile = false
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
    if (o == null && this.nullHostile) nullQuery();
    return this.lookup.contains(o);
  }

  override toArray(): E[];
  override toArray<A extends WritableArrayLike<E>>(generator: (length: number) => A): A;
  override toArray<A extends WritableArrayLike<E>>(generator?: (length: number) => A): E[] | A {
    return arguments.length > 0 ? toArrayWith(this.es, generator as (length: number) => A) : this.es.slice();
  }

  override forEach(action: (e: E) => void): void {
    requireNonNull(action);
    const a = this.es;
    for (let i = 0; i < a.length; i++) action(a[i]);
  }

  iterator(): Iterator<E> {
    return new ArrayItr(this.es, 0);
  }

  /** DISTINCT|SIZED|SUBSIZED over the frozen array (what the reference's Set.of reports). */
  override spliterator(): Spliterator<E> {
    return new ArraySpliterator(this.es, 0, this.es.length, Spliterator.DISTINCT | Spliterator.SIZED | Spliterator.SUBSIZED);
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

/**
 * @internal Builds a set; rejectDup throws on a repeated element, nullFree throws on null/undefined,
 * nullHostile makes null queries throw.
 */
export function buildSet<E>(src: readonly E[], rejectDup: boolean, nullFree: boolean, nullHostile = false): ImmutableSet<E> {
  const lookup = new HashSet<E>();
  const es: E[] = [];
  for (let i = 0; i < src.length; i++) {
    const e = src[i];
    if (nullFree) requireNonNull(e);
    if (lookup.add(e)) es.push(e);
    else if (rejectDup) throw new IllegalArgumentException(`duplicate element: ${toString(e)}`);
  }
  return new ImmutableSet(es, lookup, nullFree, nullHostile);
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
    /** @internal no null keys/values */ readonly nullFree: boolean,
    /** @internal Map.of/ofEntries/copyOf: null queries throw */ readonly nullHostile = false
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
    if (v !== undefined) return v;
    // null/undefined keys are plain and never stored in a null-hostile map, so only misses pay for the check
    if (key == null && this.nullHostile) nullQuery();
    return null;
  }

  override containsKey(key: unknown): boolean {
    if (key == null && this.nullHostile) nullQuery();
    return isPlainKey(key) ? this.plain.has(key) : this.other.containsKey(key);
  }

  override containsValue(value: unknown): boolean {
    if (value == null && this.nullHostile) nullQuery();
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
    // a one-entry Map.of answers Set.of(entry)
    return (this.ens ??= this.nullHostile && this.entries.length === 1 ? buildSet(this.entries.slice(), false, true, true) : new EntrySetView(this));
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

// The reference's Map.of/copyOf views. keySet()/values() are AbstractMap's: clear() calls the map's clear() (which
// throws even when empty) and removal goes through an iterator whose remove() throws, so a call that removes nothing
// returns false. entrySet() is a plain AbstractSet over the entries (clear() of an empty one does nothing), except
// for a one-entry map, whose entrySet() is a Set.of(entry): every mutator throws and contains(null) is rejected.
class EntrySetView<K, V> extends AbstractSet<MapEntry<K, V>> {
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
    if (k == null) return false;
    return this.map.containsKey(k) && equals(this.map.get(k), o.getValue());
  }
  override toArray(): MapEntry<K, V>[];
  override toArray<A extends WritableArrayLike<MapEntry<K, V>>>(generator: (length: number) => A): A;
  override toArray<A extends WritableArrayLike<MapEntry<K, V>>>(generator?: (length: number) => A): MapEntry<K, V>[] | A {
    return arguments.length > 0 ? toArrayWith(this.map.entries, generator as (length: number) => A) : this.map.entries.slice();
  }
}

class KeySetView<K, V> extends AbstractSet<K> {
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
  override clear(): void {
    this.map.clear();
  }
}

class ValuesView<K, V> extends AbstractCollection<V> {
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
  override clear(): void {
    this.map.clear();
  }
}

/**
 * @internal Builds a map from entries, checking each in turn the way the reference does: with nullFree, a null key
 * then a null value throws NullPointerException; a repeated key throws IllegalArgumentException.
 */
export function buildMap<K, V>(entries: MapEntry<K, V>[], nullFree: boolean, nullHostile = false): ImmutableMap<K, V> {
  const plain = new globalThis.Map<unknown, V>();
  const other = new HashMap<K, V>();
  for (let i = 0; i < entries.length; i++) {
    const k = entries[i].getKey();
    const v = entries[i].getValue();
    if (nullFree) {
      requireNonNull(k);
      requireNonNull(v);
    }
    const p = isPlainKey(k);
    if (p ? plain.has(k) : other.containsKey(k)) throw new IllegalArgumentException(`duplicate key: ${toString(k)}`);
    if (p) plain.set(k, v);
    else other.put(k, v);
  }
  return new ImmutableMap(entries, plain, other, nullFree, nullHostile);
}

/** Entry made by Map.entry / Map.Entry.copyOf: immutable, key and value never null. */
class KeyValueHolder<K, V> extends SimpleImmutableEntry<K, V> {}

function immutableEntry<K, V>(k: K, v: V): MapEntry<K, V> {
  return new KeyValueHolder(requireNonNull(k) as K, requireNonNull(v) as V);
}

function rejectNulls<E>(a: E[]): E[] {
  for (let i = 0; i < a.length; i++) requireNonNull(a[i]);
  return a;
}

// ---- lazily computed collections (List.ofLazy, Set.ofLazy, Map.ofLazy)

const UNSET: unique symbol = Symbol('unset');
const BUSY: unique symbol = Symbol('busy');
/** Error state of a slot: remembers the failing exception's name. */
class Failed {
  constructor(readonly name: string) {}
}

function withCause<T extends Error>(e: T, cause: unknown): T {
  (e as { cause?: unknown }).cause = cause;
  return e;
}

/**
 * Slots computed at most once by fn. A throwing fn (or a null result) moves the slot to an error state:
 * that call throws NoSuchElementException with the exception as cause, later calls throw one naming it.
 */
class LazySlots<A, R> {
  private readonly slots: (R | typeof UNSET | typeof BUSY | Failed)[];
  private left: number;
  constructor(n: number, private fn: ((a: A) => R) | null) {
    this.slots = new Array(n).fill(UNSET);
    this.left = n;
    if (n === 0) this.fn = null;
  }

  get(i: number, arg: A): R {
    const v = this.slots[i];
    if (v !== UNSET && v !== BUSY && !(v instanceof Failed)) return v;
    if (v instanceof Failed) throw new NoSuchElementException(`Unable to access the lazy element: previous computation failed with ${v.name}`);
    if (v === BUSY) {
      throw withCause(new NoSuchElementException('Recursive computation of a lazy element'), new IllegalStateException('Recursive invocation'));
    }
    this.slots[i] = BUSY;
    let r: R;
    try {
      r = (this.fn as (a: A) => R)(arg);
      if (r === null || r === undefined) throw new NullPointerException('The computing function returned null');
    } catch (e) {
      this.settle(i, new Failed((e as Error)?.name ?? (e as object)?.constructor?.name ?? typeof e));
      throw withCause(new NoSuchElementException(`Unable to compute the lazy element: ${toString(e)}`), e);
    }
    this.settle(i, r);
    return r;
  }

  private settle(i: number, v: R | Failed): void {
    this.slots[i] = v;
    // the function is no longer needed once every slot is settled
    if (--this.left === 0) this.fn = null;
  }
}

class LazyList<E> extends ImmutableListBase<E> {
  private readonly slots: LazySlots<number, E>;
  constructor(private readonly n: number, fn: (i: number) => E) {
    super();
    this.slots = new LazySlots(n, fn);
  }
  get [RANDOM_ACCESS](): true {
    return true;
  }
  size(): number {
    return this.n;
  }
  get(index: number): E {
    checkIndex(index, this.n);
    return this.slots.get(index, index);
  }
  override contains(o: unknown): boolean {
    return this.indexOf(o) >= 0;
  }
  override indexOf(o: unknown): number {
    if (o == null) nullQuery();
    return super.indexOf(o);
  }
  override lastIndexOf(o: unknown): number {
    if (o == null) nullQuery();
    return super.lastIndexOf(o);
  }
}

/** Index of each key/candidate, with null queries rejected. */
class KeyIndex<K> {
  readonly keys: K[];
  private readonly index = new HashMap<K, number>();
  constructor(src: SetType<K>) {
    this.keys = requireNonNull(src).toArray();
    for (let i = 0; i < this.keys.length; i++) this.index.put(requireNonNull(this.keys[i]) as K, i);
  }
  indexOf(o: unknown): number {
    if (o == null) nullQuery();
    const i = this.index.get(o);
    return i === null ? -1 : i;
  }
}

class LazySet<E> extends ImmutableSetBase<E> {
  private readonly slots: LazySlots<E, boolean>;
  constructor(private readonly candidates: KeyIndex<E>, predicate: (e: E) => boolean) {
    super();
    this.slots = new LazySlots(candidates.keys.length, (e) => predicate(e) === true);
  }
  override contains(o: unknown): boolean {
    const i = this.candidates.indexOf(o);
    return i >= 0 && this.slots.get(i, o as E);
  }
  /** Computes every membership status. */
  private members(): E[] {
    const ks = this.candidates.keys;
    const out: E[] = [];
    for (let i = 0; i < ks.length; i++) if (this.slots.get(i, ks[i])) out.push(ks[i]);
    return out;
  }
  size(): number {
    return this.members().length;
  }
  iterator(): Iterator<E> {
    const ks = this.candidates.keys;
    let i = 0;
    const advance = (): void => {
      while (i < ks.length && !this.slots.get(i, ks[i])) i++;
    };
    return {
      hasNext: () => (advance(), i < ks.length),
      next: () => {
        advance();
        if (i >= ks.length) throw new NoSuchElementException();
        return ks[i++];
      },
      remove: uoe,
      forEachRemaining(action: (e: E) => void) {
        requireNonNull(action);
        while (this.hasNext()) action(this.next());
      },
    };
  }
}

class LazyMap<K, V> extends ImmutableMapBase<K, V> {
  private readonly slots: LazySlots<K, V>;
  private ks: SetType<K> | undefined;
  private ens: SetType<MapEntry<K, V>> | undefined;
  constructor(private readonly keyIndex: KeyIndex<K>, fn: (k: K) => V) {
    super();
    this.slots = new LazySlots(keyIndex.keys.length, fn);
  }
  override size(): number {
    return this.keyIndex.keys.length;
  }
  override containsKey(key: unknown): boolean {
    return this.keyIndex.indexOf(key) >= 0;
  }
  override get(key: unknown): V | null {
    const i = this.keyIndex.indexOf(key);
    return i < 0 ? null : this.slots.get(i, key as K);
  }
  override getOrDefault(key: unknown, defaultValue: V): V {
    const i = this.keyIndex.indexOf(key);
    return i < 0 ? defaultValue : this.slots.get(i, key as K);
  }
  override containsValue(value: unknown): boolean {
    if (value == null) nullQuery();
    return super.containsValue(value);
  }
  override keySet(): SetType<K> {
    return (this.ks ??= buildSet(this.keyIndex.keys, false, true, true));
  }
  entrySet(): SetType<MapEntry<K, V>> {
    return (this.ens ??= new LazyEntrySet(this));
  }
  /** @internal entry i; its value is computed on first read */
  entryAt(i: number): MapEntry<K, V> {
    const k = this.keyIndex.keys[i];
    return new SimpleImmutableEntry(k, this.slots.get(i, k));
  }
}

class LazyEntrySet<K, V> extends ImmutableSetBase<MapEntry<K, V>> {
  constructor(private readonly map: LazyMap<K, V>) {
    super();
  }
  size(): number {
    return this.map.size();
  }
  override contains(o: unknown): boolean {
    if (!isEntry(o)) return false;
    const k = o.getKey();
    return k != null && this.map.containsKey(k) && equals(this.map.get(k), o.getValue());
  }
  iterator(): Iterator<MapEntry<K, V>> {
    let i = 0;
    const n = this.map.size();
    return {
      hasNext: () => i < n,
      next: () => {
        if (i >= n) throw new NoSuchElementException();
        return this.map.entryAt(i++);
      },
      remove: uoe,
      forEachRemaining: (action: (e: MapEntry<K, V>) => void) => {
        requireNonNull(action);
        while (i < n) action(this.map.entryAt(i++));
      },
    };
  }
}

export type List<E> = ListType<E>;
export type Set<E> = SetType<E>;
export type Map<K, V> = MapType<K, V>;

/** Unmodifiable lists: random access, null elements and null queries rejected, value equality with any List. */
export const List = {
  of<E>(...elements: E[]): ListType<E> {
    // the rest array is fresh, so it can be frozen in place
    return listOf(rejectNulls(elements));
  },
  copyOf<E>(c: Collection<E>): ListType<E> {
    if (c instanceof ImmutableList && c.nullHostile) return c;
    return listOf(rejectNulls(requireNonNull(c).toArray()));
  },
  /**
   * @experimental preview. Unmodifiable random-access list of `size` elements, each computed by
   * computingFunction(index) on first access and at most once. A throwing function, a null/undefined
   * result or a recursive access for the same index throws NoSuchElementException (with the failure as
   * `cause`); that index then stays failed and throws NoSuchElementException without calling the function
   * again. subList/reversed views are lazy too; equals/hashCode/toString compute elements.
   * @throws IllegalArgumentException if size is negative or not an integer
   * @throws NullPointerException if computingFunction is null
   */
  ofLazy<E>(size: number, computingFunction: (index: number) => E): ListType<E> {
    if (!(Number.isInteger(size) && size >= 0)) throw new IllegalArgumentException(`size: ${size}`);
    return new LazyList(size, requireNonNull(computingFunction));
  },
};

/** Unmodifiable sets: null elements and null queries rejected, value equality with any Set; iteration order is unspecified. */
export const Set = {
  /** @throws IllegalArgumentException on a duplicate element */
  of<E>(...elements: E[]): SetType<E> {
    return buildSet(elements, true, true, true);
  },
  /** Duplicates are dropped. */
  copyOf<E>(c: Collection<E>): SetType<E> {
    if (c instanceof ImmutableSet && c.nullHostile) return c;
    return buildSet(requireNonNull(c).toArray(), false, true, true);
  },
  /**
   * @experimental preview. Unmodifiable set whose members are the elementCandidates for which
   * computingFunction returns true, each status computed on first access (contains, iteration, size)
   * and at most once. Failures behave as in List.ofLazy. Later changes to elementCandidates are not seen.
   * contains(null) throws NullPointerException; a non-candidate is never a member.
   * @throws NullPointerException if elementCandidates, one of them, or computingFunction is null
   */
  ofLazy<E>(elementCandidates: SetType<E>, computingFunction: (e: E) => boolean): SetType<E> {
    const candidates = new KeyIndex(elementCandidates);
    return new LazySet(candidates, requireNonNull(computingFunction));
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
  // unchecked entries: buildMap checks each pair (nulls, then a duplicate key) in argument order, as the reference does
  const entries: MapEntry<K, V>[] = [];
  for (let i = 0; i < kvs.length; i += 2) entries.push(new KeyValueHolder(kvs[i] as K, kvs[i + 1] as V));
  return buildMap(entries, true, true);
}

/** Map.Entry statics. */
const Entry = {
  /** Orders entries by key in natural order (null keys throw NullPointerException). */
  comparingByKey<K, V>(cmp?: (a: K, b: K) => number): (a: MapEntry<K, V>, b: MapEntry<K, V>) => number {
    const c = arguments.length > 0 ? requireNonNull(cmp) : naturalCompare;
    return (a, b) => c(a.getKey(), b.getKey());
  },
  /** Orders entries by value in natural order (null values throw NullPointerException). */
  comparingByValue<K, V>(cmp?: (a: V, b: V) => number): (a: MapEntry<K, V>, b: MapEntry<K, V>) => number {
    const c = arguments.length > 0 ? requireNonNull(cmp) : naturalCompare;
    return (a, b) => c(a.getValue(), b.getValue());
  },
  /**
   * Unmodifiable, null-free copy of e (like Map.entry); returns e itself when it already is one.
   * @throws NullPointerException if e, its key or its value is null
   */
  copyOf<K, V>(e: MapEntry<K, V>): MapEntry<K, V> {
    if (requireNonNull(e) instanceof KeyValueHolder) return e;
    return immutableEntry(e.getKey(), e.getValue());
  },
};

/** Unmodifiable maps: null keys/values and null queries rejected, duplicate keys rejected; iteration order is unspecified. */
export const Map = {
  /** Map.of(k1, v1, k2, v2, ...). @throws IllegalArgumentException on an odd argument count or a duplicate key */
  of: mapOf,
  ofEntries<K, V>(...entries: MapEntry<K, V>[]): MapType<K, V> {
    const es: MapEntry<K, V>[] = [];
    for (const e of entries) es.push(new KeyValueHolder(requireNonNull(e).getKey(), e.getValue()));
    return buildMap(es, true, true);
  },
  /** Immutable entry; setValue throws UnsupportedOperationException. */
  entry<K, V>(k: K, v: V): MapEntry<K, V> {
    return immutableEntry(k, v);
  },
  copyOf<K, V>(m: MapType<K, V>): MapType<K, V> {
    if (m instanceof ImmutableMap && m.nullHostile) return m;
    const es: MapEntry<K, V>[] = [];
    for (const e of requireNonNull(m).entrySet().toArray()) es.push(new KeyValueHolder(e.getKey(), e.getValue()));
    return buildMap(es, true, true);
  },
  /**
   * @experimental preview. Unmodifiable map with the given keys whose values are computed by
   * computingFunction(key) on first access (get, getOrDefault, values/entrySet iteration, equals,
   * hashCode, toString) and at most once per key. Failures behave as in List.ofLazy. Later changes to
   * keys are not seen. get of a non-key is null; null queries throw NullPointerException.
   * @throws NullPointerException if keys, one of them, or computingFunction is null
   */
  ofLazy<K, V>(keys: SetType<K>, computingFunction: (key: K) => V): MapType<K, V> {
    const index = new KeyIndex(keys);
    return new LazyMap(index, requireNonNull(computingFunction));
  },
  /** Map.Entry statics: comparingByKey, comparingByValue, copyOf. */
  Entry,
};
