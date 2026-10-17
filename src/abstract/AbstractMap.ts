import { UnsupportedOperationException } from '../exceptions';
import { Collection } from '../interfaces/Collection';
import { Iterator } from '../interfaces/Iterator';
import { Map, MapEntry } from '../interfaces/Map';
import { Set } from '../interfaces/Set';
import { isEntry, isMap } from '../util/guards';
import { equals, hashCode, requireNonNull, toString } from '../util/Objects';
import { AbstractCollection } from './AbstractCollection';
import { AbstractSet } from './AbstractSet';

/**
 * Skeleton of AbstractMap: everything is built on entrySet().
 * A modifiable map overrides put() and gives entrySet() an iterator with remove().
 * Includes the standard Map default methods (getOrDefault, compute*, merge, ...).
 */
export abstract class AbstractMap<K, V> implements Map<K, V> {
  abstract entrySet(): Set<MapEntry<K, V>>;

  private keySetView: Set<K> | undefined;
  private valuesView: Collection<V> | undefined;

  size(): number {
    return this.entrySet().size();
  }

  isEmpty(): boolean {
    return this.size() === 0;
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

  containsKey(key: unknown): boolean {
    return this.findEntry(key) !== undefined;
  }

  containsValue(value: unknown): boolean {
    const it = this.entrySet().iterator();
    while (it.hasNext()) if (equals(value, it.next().getValue())) return true;
    return false;
  }

  get(key: unknown): V | null {
    const e = this.findEntry(key);
    return e === undefined ? null : e.getValue();
  }

  put(_key: K, _value: V): V | null {
    throw new UnsupportedOperationException();
  }

  remove(key: unknown): V | null;
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

  putAll(m: Map<K, V>): void {
    requireNonNull(m);
    for (const e of m.entrySet().toArray()) this.put(e.getKey(), e.getValue());
  }

  clear(): void {
    this.entrySet().clear();
  }

  keySet(): Set<K> {
    return (this.keySetView ??= new KeySetView(this));
  }

  values(): Collection<V> {
    return (this.valuesView ??= new ValuesView(this));
  }

  *[Symbol.iterator](): IterableIterator<[K, V]> {
    const it = this.entrySet().iterator();
    while (it.hasNext()) {
      const e = it.next();
      yield [e.getKey(), e.getValue()];
    }
  }

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

  hashCode(): number {
    let h = 0;
    const it = this.entrySet().iterator();
    while (it.hasNext()) h = (h + entryHash(it.next())) | 0;
    return h;
  }

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

  getOrDefault(key: unknown, defaultValue: V): V {
    const e = this.findEntry(key);
    return e === undefined ? defaultValue : e.getValue();
  }

  forEach(action: (key: K, value: V) => void): void {
    requireNonNull(action);
    const it = this.entrySet().iterator();
    while (it.hasNext()) {
      const e = it.next();
      action(e.getKey(), e.getValue());
    }
  }

  replaceAll(fn: (key: K, value: V) => V): void {
    requireNonNull(fn);
    const it = this.entrySet().iterator();
    while (it.hasNext()) {
      const e = it.next();
      e.setValue(fn(e.getKey(), e.getValue()));
    }
  }

  putIfAbsent(key: K, value: V): V | null {
    const cur = this.get(key);
    return cur === null ? this.put(key, value) : cur;
  }

  replace(key: K, value: V): V | null;
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

  computeIfAbsent(key: K, fn: (key: K) => V | null | undefined): V | null {
    requireNonNull(fn);
    const old = this.get(key);
    if (old !== null) return old;
    const v = fn(key);
    if (v === null || v === undefined) return null;
    this.put(key, v);
    return v;
  }

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

/** AbstractMap.SimpleEntry: mutable key/value pair. */
export class SimpleEntry<K, V> implements MapEntry<K, V> {
  constructor(private readonly key: K, private value: V) {}
  getKey(): K {
    return this.key;
  }
  getValue(): V {
    return this.value;
  }
  setValue(value: V): V {
    const old = this.value;
    this.value = value;
    return old;
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

/** AbstractMap.SimpleImmutableEntry: setValue throws UnsupportedOperationException. */
export class SimpleImmutableEntry<K, V> implements MapEntry<K, V> {
  constructor(private readonly key: K, private readonly value: V) {}
  getKey(): K {
    return this.key;
  }
  getValue(): V {
    return this.value;
  }
  setValue(_value: V): V {
    throw new UnsupportedOperationException();
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

export { entryEquals, entryHash, entryToString };
