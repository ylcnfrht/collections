import { UnsupportedOperationException } from '../exceptions';
import { Collection } from '../interfaces/Collection';
import { Iterator } from '../interfaces/Iterator';
import { Map, MapEntry } from '../interfaces/Map';
import { Set } from '../interfaces/Set';
import { isEntry, isMap } from '../util/guards';
import { INSPECT, equals, hashCode, requireNonNull, toString } from '../util/Objects';
import { AbstractCollection } from './AbstractCollection';
import { AbstractSet } from './AbstractSet';

/**
 * Skeleton implementation of the `Map` interface, built entirely on `entrySet()`.
 *
 * A read-only subclass implements `entrySet()` and inherits the whole `Map` interface: lookups, live `keySet()` and
 * `values()` views, value `equals`/`hashCode` with any `Map`, `toString()`, `for..of` over `[key, value]` pairs, and
 * the default methods (`getOrDefault`, `putIfAbsent`, `replace`, `compute*`, `merge`, ...). To make it modifiable,
 * override `put(key, value)` (which throws {@link UnsupportedOperationException} by default) and give the entry set
 * an iterator whose `remove()` works (and entries whose `setValue` works, for `replaceAll`).
 * Lookups are linear scans of the entry set; override the protected `findEntry` (or the lookup methods) for faster
 * access. There is no `modCount`: fail-fast behaviour is whatever the entry-set iterator provides.
 * A `null` value from `get` means "absent", so the defaults treat a key mapped to `null` like a missing key where
 * the `Map` contract says so.
 */
export abstract class AbstractMap<K, V> implements Map<K, V> {
  /** Returns the set of mappings that every other method is built on. Subclasses implement it. */
  abstract entrySet(): Set<MapEntry<K, V>>;

  private keySetView: Set<K> | undefined;
  private valuesView: Collection<V> | undefined;

  /** Returns `entrySet().size()`. */
  size(): number {
    return this.entrySet().size();
  }

  /** Returns `size() === 0`. */
  isEmpty(): boolean {
    return this.size() === 0;
  }

  /**
   * Backs clone(): a shallow copy of this object that keeps its runtime class and every field
   * (subclass fields included), with the cached key/value views reset. The caller must give the
   * copy fresh storage before using it.
   */
  protected cloneShell(): this {
    const m = Object.assign(Object.create(Object.getPrototypeOf(this)) as object, this) as this;
    m.keySetView = m.valuesView = undefined;
    return m;
  }

  /** Returns the entry for key, or undefined. Subclasses override for O(1)/O(log n) lookup. */
  protected findEntry(key: unknown): MapEntry<K, V> | undefined {
    const it = this.entrySet().iterator();
    while (it.hasNext()) {
      const e = it.next();
      if (equals(key, e.getKey())) return e;
    }
    return undefined;
  }

  /** Returns `true` if `findEntry(key)` finds a mapping (a linear scan by default). */
  containsKey(key: unknown): boolean {
    return this.findEntry(key) !== undefined;
  }

  /** Returns `true` if some mapping's value equals `value`; always a linear scan of the entry set. */
  containsValue(value: unknown): boolean {
    const it = this.entrySet().iterator();
    while (it.hasNext()) if (equals(value, it.next().getValue())) return true;
    return false;
  }

  /** Returns the value mapped to `key`, or `null` if there is none; uses `findEntry` (a linear scan by default). */
  get(key: unknown): V | null {
    const e = this.findEntry(key);
    return e === undefined ? null : e.getValue();
  }

  /**
   * Maps `key` to `value` and returns the previous value, or `null`. Not supported by default.
   * @throws {@link UnsupportedOperationException} unless a subclass overrides it
   */
  put(_key: K, _value: V): V | null {
    throw new UnsupportedOperationException();
  }

  /**
   * Removes the mapping for `key` through the entry-set iterator's `remove()` and returns its value, or `null` if
   * there was none.
   */
  remove(key: unknown): V | null;
  /** Removes the mapping for `key` only if it is mapped to a value equal to `value`; returns `true` if removed. */
  remove(key: unknown, value: unknown): boolean;
  remove(key: unknown, value?: unknown): V | null | boolean {
    if (arguments.length >= 2) {
      const e = this.findEntry(key);
      if (e === undefined || !equals(e.getValue(), value)) return false;
      this.remove(key);
      return true;
    }
    const it = this.entrySet().iterator();
    while (it.hasNext()) {
      const e = it.next();
      if (equals(key, e.getKey())) {
        const v = e.getValue();
        it.remove();
        return v;
      }
    }
    return null;
  }

  /**
   * Calls `put` for each mapping of a snapshot of `m`'s entries.
   * @throws {@link NullPointerException} if `m` is `null`
   * @throws {@link UnsupportedOperationException} if `put` is not supported and `m` is not empty
   */
  putAll(m: Map<K, V>): void {
    requireNonNull(m);
    for (const e of m.entrySet().toArray()) this.put(e.getKey(), e.getValue());
  }

  /** Removes every mapping via `entrySet().clear()`. */
  clear(): void {
    this.entrySet().clear();
  }

  /**
   * Returns a live view of the keys, backed by the entry set (created once and cached). It supports removal but
   * not addition.
   */
  keySet(): Set<K> {
    return (this.keySetView ??= new KeySetView(this));
  }

  /**
   * Returns a live view of the values, backed by the entry set (created once and cached). It supports removal but
   * not addition.
   */
  values(): Collection<V> {
    return (this.valuesView ??= new ValuesView(this));
  }

  /** Makes the map usable with `for..of` and spread, yielding `[key, value]` pairs in entry-set order. */
  *[Symbol.iterator](): IterableIterator<[K, V]> {
    const it = this.entrySet().iterator();
    while (it.hasNext()) {
      const e = it.next();
      yield [e.getKey(), e.getValue()];
    }
  }

  /**
   * Returns `true` if `o` is a `Map` with the same mappings (any `Map` implementation). A
   * {@link ClassCastException} or {@link NullPointerException} from `o`'s lookups counts as "not equal".
   */
  equals(o: unknown): boolean {
    if (o === this) return true;
    if (!isMap(o) || o.size() !== this.size()) return false;
    try {
      const it = this.entrySet().iterator();
      while (it.hasNext()) {
        const e = it.next();
        const k = e.getKey();
        const v = e.getValue();
        if (v === null) {
          if (!(o.get(k) === null && o.containsKey(k))) return false;
        } else if (!equals(v, o.get(k))) return false;
      }
    } catch (e) {
      if ((e as Error)?.name === 'ClassCastException' || (e as Error)?.name === 'NullPointerException') return false;
      throw e;
    }
    return true;
  }

  /** Returns the sum of `hashCode(key) ^ hashCode(value)` over the mappings, so equal maps hash the same. */
  hashCode(): number {
    let h = 0;
    const it = this.entrySet().iterator();
    while (it.hasNext()) h = (h + entryHash(it.next())) | 0;
    return h;
  }

  /** Node's `util.inspect` hook: `console.log` prints the `toString()` form. */
  [INSPECT](): string {
    return this.toString();
  }
  /** Returns `{k1=v1, k2=v2}` in entry-set order; a key or value that is this map prints as `(this Map)`. */
  toString(): string {
    const parts: string[] = [];
    const it = this.entrySet().iterator();
    while (it.hasNext()) {
      const e = it.next();
      const k = e.getKey();
      const v = e.getValue();
      parts.push(`${(k as unknown) === this ? '(this Map)' : toString(k)}=${(v as unknown) === this ? '(this Map)' : toString(v)}`);
    }
    return `{${parts.join(', ')}}`;
  }

  // Map default methods

  /** Returns the value mapped to `key`, or `defaultValue` when there is no mapping (a mapping to `null` returns `null`). */
  getOrDefault(key: unknown, defaultValue: V): V;

  /** Returns the value mapped to `key`, or `defaultValue` when there is no mapping (a mapping to `null` returns `null`). */
  getOrDefault(key: unknown, defaultValue: V | null): V | null;

  getOrDefault(key: unknown, defaultValue: V | null): V | null {
    const e = this.findEntry(key);
    return e === undefined ? defaultValue : e.getValue();
  }

  /**
   * Calls `action(key, value)` for each mapping in entry-set order.
   * @throws {@link NullPointerException} if `action` is `null`
   */
  forEach(action: (key: K, value: V) => void): void {
    requireNonNull(action);
    const it = this.entrySet().iterator();
    while (it.hasNext()) {
      const e = it.next();
      action(e.getKey(), e.getValue());
    }
  }

  /**
   * Replaces each value with `fn(key, value)`, through the entries' `setValue`.
   * @throws {@link NullPointerException} if `fn` is `null`
   * @throws {@link UnsupportedOperationException} if the entries do not support `setValue`
   */
  replaceAll(fn: (key: K, value: V) => V): void {
    requireNonNull(fn);
    const it = this.entrySet().iterator();
    while (it.hasNext()) {
      const e = it.next();
      e.setValue(fn(e.getKey(), e.getValue()));
    }
  }

  /** If `key` has no value (absent or mapped to `null`), puts `value` and returns the previous value; else returns the current value. */
  putIfAbsent(key: K, value: V): V | null {
    const cur = this.get(key);
    return cur === null ? this.put(key, value) : cur;
  }

  /** Puts `value` only if `key` already has a mapping; returns the previous value, or `null` if there was no mapping. */
  replace(key: K, value: V): V | null;
  /** Puts `newValue` only if `key` is mapped to a value equal to `oldValue`; returns `true` if replaced. */
  replace(key: K, oldValue: V, newValue: V): boolean;
  replace(key: K, a: V, b?: V): V | null | boolean {
    const e = this.findEntry(key);
    if (arguments.length >= 3) {
      if (e === undefined || !equals(e.getValue(), a)) return false;
      this.put(key, b as V);
      return true;
    }
    return e === undefined ? null : this.put(key, a);
  }

  /**
   * If `key` has no value (absent or mapped to `null`), puts `fn(key)` unless it returns `null`/`undefined`; returns
   * the current (possibly new) value, or `null`.
   * @throws {@link NullPointerException} if `fn` is `null`
   */
  computeIfAbsent(key: K, fn: (key: K) => V | null | undefined): V | null {
    requireNonNull(fn);
    const old = this.get(key);
    if (old !== null) return old;
    const v = fn(key);
    if (v === null || v === undefined) return null;
    this.put(key, v);
    return v;
  }

  /**
   * If `key` has a non-null value, replaces it with `fn(key, value)`, or removes the mapping when `fn` returns
   * `null`/`undefined`; returns the new value or `null`.
   * @throws {@link NullPointerException} if `fn` is `null`
   */
  computeIfPresent(key: K, fn: (key: K, value: V) => V | null | undefined): V | null {
    requireNonNull(fn);
    const old = this.get(key);
    if (old === null) return null;
    const v = fn(key, old);
    if (v === null || v === undefined) {
      this.remove(key);
      return null;
    }
    this.put(key, v);
    return v;
  }

  /**
   * Puts `fn(key, currentValueOrNull)`, or removes the mapping when `fn` returns `null`/`undefined`; returns the new
   * value or `null`.
   * @throws {@link NullPointerException} if `fn` is `null`
   */
  compute(key: K, fn: (key: K, value: V | null) => V | null | undefined): V | null {
    requireNonNull(fn);
    const old = this.get(key);
    const v = fn(key, old);
    if (v === null || v === undefined) {
      if (old !== null || this.containsKey(key)) this.remove(key);
      return null;
    }
    this.put(key, v);
    return v;
  }

  /**
   * Puts `value` if `key` has no value (absent or mapped to `null`), otherwise `fn(oldValue, value)`; removes the
   * mapping when `fn` returns `null`/`undefined`. Returns the new value or `null`.
   * @throws {@link NullPointerException} if `fn` or `value` is `null`
   */
  merge(key: K, value: V, fn: (oldValue: V, value: V) => V | null | undefined): V | null {
    requireNonNull(fn);
    requireNonNull(value);
    const old = this.get(key);
    const v = old === null ? value : fn(old, value);
    if (v === null || v === undefined) {
      this.remove(key);
      return null;
    }
    this.put(key, v);
    return v;
  }
}

function entryHash(e: MapEntry<unknown, unknown>): number {
  return hashCode(e.getKey()) ^ hashCode(e.getValue());
}

function entryEquals(e: MapEntry<unknown, unknown>, o: unknown): boolean {
  return o === e || (isEntry(o) && equals(e.getKey(), o.getKey()) && equals(e.getValue(), o.getValue()));
}

function entryToString(e: MapEntry<unknown, unknown>): string {
  return `${toString(e.getKey())}=${toString(e.getValue())}`;
}

/** Wraps an iterator, mapping each element; remove() passes through. */
export function mapIterator<T, R>(it: Iterator<T>, f: (t: T) => R): Iterator<R> {
  return {
    hasNext: () => it.hasNext(),
    next: () => f(it.next()),
    remove: () => it.remove(),
    forEachRemaining(action: (r: R) => void) {
      requireNonNull(action);
      while (it.hasNext()) action(f(it.next()));
    },
  };
}

class KeySetView<K, V> extends AbstractSet<K> {
  constructor(private readonly map: AbstractMap<K, V>) {
    super();
  }
  iterator(): Iterator<K> {
    return mapIterator(this.map.entrySet().iterator(), (e) => e.getKey());
  }
  size(): number {
    return this.map.size();
  }
  override isEmpty(): boolean {
    return this.map.isEmpty();
  }
  override contains(k: unknown): boolean {
    return this.map.containsKey(k);
  }
  override remove(k: unknown): boolean {
    if (!this.map.containsKey(k)) return false;
    this.map.remove(k);
    return true;
  }
  override clear(): void {
    this.map.clear();
  }
}

class ValuesView<K, V> extends AbstractCollection<V> {
  constructor(private readonly map: AbstractMap<K, V>) {
    super();
  }
  iterator(): Iterator<V> {
    return mapIterator(this.map.entrySet().iterator(), (e) => e.getValue());
  }
  size(): number {
    return this.map.size();
  }
  override isEmpty(): boolean {
    return this.map.isEmpty();
  }
  override contains(v: unknown): boolean {
    return this.map.containsValue(v);
  }
  override clear(): void {
    this.map.clear();
  }
}

/**
 * A mutable key/value pair (`setValue` works), handy for building a custom map's entry set. Equality and hash follow
 * the map-entry contract, so it equals any entry with an equal key and value; `toString()` gives `key=value`.
 */
export class SimpleEntry<K, V> implements MapEntry<K, V> {
  private readonly key: K;
  private value: V;
  /** Creates an entry with the key and value of `entry`. */
  constructor(entry: MapEntry<K, V>);
  /** Creates an entry mapping `key` to `value`; both may be `null`. */
  constructor(key: K, value: V);
  constructor(a: K | MapEntry<K, V>, b?: V) {
    const copy = arguments.length === 1 && isEntry(a);
    this.key = copy ? (a as MapEntry<K, V>).getKey() : (a as K);
    this.value = copy ? (a as MapEntry<K, V>).getValue() : (b as V);
  }
  /** Returns the key. */
  getKey(): K {
    return this.key;
  }
  /** Returns the value. */
  getValue(): V {
    return this.value;
  }
  /** Replaces the value and returns the old one. */
  setValue(value: V): V {
    const old = this.value;
    this.value = value;
    return old;
  }
  /** Returns `true` if `o` is a map entry with an equal key and an equal value. */
  equals(o: unknown): boolean {
    return entryEquals(this, o);
  }
  /** Returns `hashCode(key) ^ hashCode(value)`. */
  hashCode(): number {
    return entryHash(this);
  }
  /** Node's `util.inspect` hook: `console.log` prints the `toString()` form. */
  [INSPECT](): string {
    return this.toString();
  }
  /** Returns `key=value`. */
  toString(): string {
    return entryToString(this);
  }
}

/**
 * An immutable key/value pair: `setValue` throws {@link UnsupportedOperationException}. Equality and hash follow the
 * map-entry contract, so it equals any entry with an equal key and value; `toString()` gives `key=value`.
 */
export class SimpleImmutableEntry<K, V> implements MapEntry<K, V> {
  private readonly key: K;
  private readonly value: V;
  /** Creates an entry with the key and value of `entry`. */
  constructor(entry: MapEntry<K, V>);
  /** Creates an entry mapping `key` to `value`; both may be `null`. */
  constructor(key: K, value: V);
  constructor(a: K | MapEntry<K, V>, b?: V) {
    const copy = arguments.length === 1 && isEntry(a);
    this.key = copy ? (a as MapEntry<K, V>).getKey() : (a as K);
    this.value = copy ? (a as MapEntry<K, V>).getValue() : (b as V);
  }
  /** Returns the key. */
  getKey(): K {
    return this.key;
  }
  /** Returns the value. */
  getValue(): V {
    return this.value;
  }
  /**
   * Always throws.
   * @throws {@link UnsupportedOperationException} always
   */
  setValue(_value: V): V {
    throw new UnsupportedOperationException();
  }
  /** Returns `true` if `o` is a map entry with an equal key and an equal value. */
  equals(o: unknown): boolean {
    return entryEquals(this, o);
  }
  /** Returns `hashCode(key) ^ hashCode(value)`. */
  hashCode(): number {
    return entryHash(this);
  }
  /** Node's `util.inspect` hook: `console.log` prints the `toString()` form. */
  [INSPECT](): string {
    return this.toString();
  }
  /** Returns `key=value`. */
  toString(): string {
    return entryToString(this);
  }
}

export { entryEquals, entryHash, entryToString };
