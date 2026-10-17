import { AbstractCollection } from '../abstract/AbstractCollection';
import { AbstractMap, mapIterator } from '../abstract/AbstractMap';
import { AbstractSet } from '../abstract/AbstractSet';
import { ConcurrentModificationException, IllegalArgumentException, IllegalStateException, NoSuchElementException } from '../exceptions';
import { Collection } from '../interfaces/Collection';
import { Iterator } from '../interfaces/Iterator';
import { Map, MapEntry } from '../interfaces/Map';
import { Set } from '../interfaces/Set';
import { Spliterator } from '../stream/Spliterator';
import { hashSpliterator } from '../stream/Spliterators';
import { isEntry, isMap } from '../util/guards';
import { hashCode, identityHashCode, requireNonNull, toString } from '../util/Objects';
import { jsIterator } from './HashMap';

/** Reference equality: ===, except NaN equals NaN (SameValueZero, the native Map key rule). */
const same = (a: unknown, b: unknown): boolean => a === b || (a !== a && b !== b);

/** Entry whose key and value compare by reference; setValue writes through. */
class IdentityNode<K, V> implements MapEntry<K, V> {
  readonly key: K;
  value: V;
  constructor(key: K, value: V) {
    this.key = key;
    this.value = value;
  }
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
    if (o === this) return true;
    if (!isEntry(o)) return false;
    return same(this.key, o.getKey()) && same(this.value, o.getValue());
  }
  hashCode(): number {
    return identityHash(this.key, this.value);
  }
  toString(): string {
    return `${toString(this.key)}=${toString(this.value)}`;
  }
}

// values hash with hashCode(): reference-equal values have equal hashCodes, so equals/hashCode stay consistent
function identityHash(k: unknown, v: unknown): number {
  return identityHashCode(k) ^ hashCode(v);
}

/**
 * Map whose keys and values compare by reference (===, except NaN equals NaN; equals()/hashCode() ignored):
 * containsValue, remove(k, v), replace(k, old, new), entry and map equality, and the views all use it.
 * Backed by a native Map, which uses exactly that key rule.
 */
export class IdentityHashMap<K, V> extends AbstractMap<K, V> {
  /** @internal */
  nodes = new globalThis.Map<K, IdentityNode<K, V>>();
  /** Structural modification count; iterators compare against it. */
  modCount = 0;
  private es: EntrySet<K, V> | undefined;
  private ks: KeySet<K, V> | undefined;
  private vs: Values<K, V> | undefined;

  constructor();
  constructor(expectedMaxSize: number);
  constructor(map: Map<K, V>);
  constructor(a?: number | Map<K, V>) {
    super();
    if (typeof a === 'number') {
      if (!(a >= 0)) throw new IllegalArgumentException(`expectedMaxSize is negative: ${a}`);
    } else if (a !== undefined) this.putAll(requireNonNull(a));
  }

  /** Shallow copy of the same runtime class (subclass fields included). */
  clone(): IdentityHashMap<K, V> {
    const m = this.cloneShell();
    m.nodes = new globalThis.Map();
    for (const n of this.nodes.values()) m.nodes.set(n.key, new IdentityNode(n.key, n.value));
    m.modCount = 0;
    m.es = m.ks = m.vs = undefined;
    return m;
  }

  override size(): number {
    return this.nodes.size;
  }

  override isEmpty(): boolean {
    return this.nodes.size === 0;
  }

  protected override findEntry(key: unknown): MapEntry<K, V> | undefined {
    return this.nodes.get(key as K);
  }

  override get(key: unknown): V | null {
    const n = this.nodes.get(key as K);
    return n === undefined ? null : n.value;
  }

  override containsKey(key: unknown): boolean {
    return this.nodes.has(key as K);
  }

  override containsValue(value: unknown): boolean {
    for (const n of this.nodes.values()) if (same(value, n.value)) return true;
    return false;
  }

  override put(key: K, value: V): V | null {
    const n = this.nodes.get(key);
    if (n !== undefined) return n.setValue(value);
    this.nodes.set(key, new IdentityNode(key, value));
    this.modCount++;
    return null;
  }

  override remove(key: unknown): V | null;
  override remove(key: unknown, value: unknown): boolean;
  override remove(key: unknown, value?: unknown): V | null | boolean {
    const n = this.nodes.get(key as K);
    if (arguments.length >= 2) {
      if (n === undefined || !same(n.value, value)) return false;
    } else if (n === undefined) return null;
    this.nodes.delete(key as K);
    this.modCount++;
    return arguments.length >= 2 ? true : n.value;
  }

  override replace(key: K, value: V): V | null;
  override replace(key: K, oldValue: V, newValue: V): boolean;
  override replace(key: K, a: V, b?: V): V | null | boolean {
    const n = this.nodes.get(key);
    if (arguments.length >= 3) {
      if (n === undefined || !same(n.value, a)) return false;
      n.value = b as V;
      return true;
    }
    return n === undefined ? null : n.setValue(a);
  }

  override clear(): void {
    this.nodes.clear();
    this.modCount++;
  }

  override keySet(): Set<K> {
    return (this.ks ??= new KeySet(this));
  }

  override values(): Collection<V> {
    return (this.vs ??= new Values(this));
  }

  entrySet(): Set<MapEntry<K, V>> {
    return (this.es ??= new EntrySet(this));
  }

  // typed as Generator to match the base signature; a plain iterator object is faster
  override [Symbol.iterator](): Generator<[K, V]> {
    return jsIterator(new IdentityIterator(this), (n) => [n.key, n.value] as [K, V]) as unknown as Generator<[K, V]>;
  }

  override forEach(action: (key: K, value: V) => void): void {
    requireNonNull(action);
    const mc = this.modCount;
    for (const n of this.nodes.values()) {
      action(n.key, n.value);
      if (mc !== this.modCount) throw new ConcurrentModificationException();
    }
  }

  /** True when o is a Map with the same key/value pairs, both compared by reference. */
  override equals(o: unknown): boolean {
    if (o === this) return true;
    if (o instanceof IdentityHashMap) {
      if (o.size() !== this.size()) return false;
      for (const n of this.nodes.values()) {
        const m = (o as IdentityHashMap<K, V>).nodes.get(n.key);
        if (m === undefined || !same(n.value, m.value)) return false;
      }
      return true;
    }
    return isMap(o) && this.entrySet().equals(o.entrySet());
  }

  override hashCode(): number {
    let h = 0;
    for (const n of this.nodes.values()) h = (h + identityHash(n.key, n.value)) | 0;
    return h;
  }
}

class IdentityIterator<K, V> implements Iterator<IdentityNode<K, V>> {
  private readonly it: IterableIterator<IdentityNode<K, V>>;
  private remaining: number;
  private last: IdentityNode<K, V> | null = null;
  private expected: number;

  constructor(private readonly map: IdentityHashMap<K, V>) {
    this.it = map.nodes.values();
    this.remaining = map.nodes.size;
    this.expected = map.modCount;
  }
  hasNext(): boolean {
    return this.remaining > 0;
  }
  next(): IdentityNode<K, V> {
    if (this.map.modCount !== this.expected) throw new ConcurrentModificationException();
    if (this.remaining <= 0) throw new NoSuchElementException();
    this.remaining--;
    return (this.last = this.it.next().value as IdentityNode<K, V>);
  }
  remove(): void {
    if (this.last === null) throw new IllegalStateException();
    if (this.map.modCount !== this.expected) throw new ConcurrentModificationException();
    this.map.nodes.delete(this.last.key);
    this.last = null;
    this.expected = ++this.map.modCount;
  }
  forEachRemaining(action: (n: IdentityNode<K, V>) => void): void {
    requireNonNull(action);
    while (this.remaining > 0) action(this.next());
  }
}

class EntrySet<K, V> extends AbstractSet<MapEntry<K, V>> {
  constructor(private readonly map: IdentityHashMap<K, V>) {
    super();
  }
  iterator(): Iterator<MapEntry<K, V>> {
    return new IdentityIterator(this.map);
  }
  override spliterator(): Spliterator<MapEntry<K, V>> {
    return hashSpliterator(this, this.map, true);
  }
  size(): number {
    return this.map.size();
  }
  private find(o: unknown): IdentityNode<K, V> | undefined {
    if (!isEntry(o)) return undefined;
    const n = this.map.nodes.get(o.getKey() as K);
    return n !== undefined && same(n.value, o.getValue()) ? n : undefined;
  }
  override contains(o: unknown): boolean {
    return this.find(o) !== undefined;
  }
  override remove(o: unknown): boolean {
    const n = this.find(o);
    if (n === undefined) return false;
    this.map.remove(n.key);
    return true;
  }
  override clear(): void {
    this.map.clear();
  }
}

class KeySet<K, V> extends AbstractSet<K> {
  constructor(private readonly map: IdentityHashMap<K, V>) {
    super();
  }
  iterator(): Iterator<K> {
    return mapIterator(new IdentityIterator(this.map), (n) => n.key);
  }
  override spliterator(): Spliterator<K> {
    return hashSpliterator(this, this.map, true);
  }
  size(): number {
    return this.map.size();
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
  /** Sum of the keys' identity hash codes (keys compare by reference). */
  override hashCode(): number {
    let h = 0;
    for (const k of this.map.nodes.keys()) h = (h + identityHashCode(k)) | 0;
    return h;
  }
}

class Values<K, V> extends AbstractCollection<V> {
  constructor(private readonly map: IdentityHashMap<K, V>) {
    super();
  }
  iterator(): Iterator<V> {
    return mapIterator(new IdentityIterator(this.map), (n) => n.value);
  }
  override spliterator(): Spliterator<V> {
    return hashSpliterator(this, this.map, false);
  }
  size(): number {
    return this.map.size();
  }
  override contains(v: unknown): boolean {
    return this.map.containsValue(v);
  }
  /** Removes one mapping whose value is v by reference. */
  override remove(v: unknown): boolean {
    for (const n of this.map.nodes.values()) {
      if (same(n.value, v)) {
        this.map.remove(n.key);
        return true;
      }
    }
    return false;
  }
  override clear(): void {
    this.map.clear();
  }
}
