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
import { INSPECT, hashCode, identityHashCode, requireNonNull, toString } from '../util/Objects';
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
  [INSPECT](): string {
    return this.toString();
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
 * A {@link Map} whose keys and values compare by reference (`===`, except `NaN` equals `NaN`; `equals()` and
 * `hashCode()` are ignored). `containsValue`, `remove(k, v)`, `replace(k, old, new)`, entry and map equality, and the
 * views all use that rule. Use it when the object itself matters, not its value, e.g. visited nodes in a graph walk.
 *
 * Backed by a native `Map`, which uses exactly that key rule. `null` and `undefined` keys and values are allowed;
 * iteration order is unspecified. `get`, `put`, `containsKey` and `remove` are O(1); iterators are fail-fast.
 */
export class IdentityHashMap<K, V> extends AbstractMap<K, V> {
  /** @internal */
  nodes = new globalThis.Map<K, IdentityNode<K, V>>();
  /** Structural modification count; iterators compare against it. */
  modCount = 0;
  private es: EntrySet<K, V> | undefined;
  private ks: KeySet<K, V> | undefined;
  private vs: Values<K, V> | undefined;

  /** Creates an empty map. */
  constructor();
  /**
   * Creates an empty map; `expectedMaxSize` is a validated sizing hint only.
   * @throws {@link IllegalArgumentException} if `expectedMaxSize` is negative or NaN
   */
  constructor(expectedMaxSize: number);
  /**
   * Creates a map with the mappings of `map`; keys that are distinct by reference stay distinct.
   * @throws {@link NullPointerException} if `map` is `null` or `undefined`
   */
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

  /** Returns the number of mappings. O(1). */
  override size(): number {
    return this.nodes.size;
  }

  /** Returns `true` if this map has no mappings. O(1). */
  override isEmpty(): boolean {
    return this.nodes.size === 0;
  }

  protected override findEntry(key: unknown): MapEntry<K, V> | undefined {
    return this.nodes.get(key as K);
  }

  /**
   * Returns the value mapped to `key`, or `null` if there is none (or the key maps to `null`). O(1); `key` is found by
   * reference, so an equal but distinct object is not found.
   */
  override get(key: unknown): V | null {
    const n = this.nodes.get(key as K);
    return n === undefined ? null : n.value;
  }

  /** Returns `true` if this map has a mapping for `key` (compared by reference), even if it maps to `null`. O(1). */
  override containsKey(key: unknown): boolean {
    return this.nodes.has(key as K);
  }

  /** Returns `true` if one or more keys map to `value`, compared by reference. O(n). */
  override containsValue(value: unknown): boolean {
    for (const n of this.nodes.values()) if (same(value, n.value)) return true;
    return false;
  }

  /**
   * Maps `key` to `value`, replacing any previous value. O(1). A key that is not `===` to an existing key adds a new
   * mapping, even if it `equals()` one.
   * @returns the previous value, or `null` if there was no mapping
   */
  override put(key: K, value: V): V | null {
    const n = this.nodes.get(key);
    if (n !== undefined) return n.setValue(value);
    this.nodes.set(key, new IdentityNode(key, value));
    this.modCount++;
    return null;
  }

  /**
   * Removes the mapping for `key` (compared by reference), if present. O(1).
   * @returns the removed value, or `null` if there was no mapping
   */
  override remove(key: unknown): V | null;
  /**
   * Removes the mapping for `key` only if it is currently mapped to `value`, both compared by reference. O(1).
   * @returns `true` if the mapping was removed
   */
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

  /**
   * Replaces the value for `key` (compared by reference) only if `key` currently has a mapping (even to `null`). O(1).
   * @returns the previous value, or `null` if there was no mapping
   */
  override replace(key: K, value: V): V | null;
  /**
   * Replaces the value for `key` with `newValue` only if it is currently mapped to `oldValue`, both compared by
   * reference. O(1).
   * @returns `true` if the value was replaced
   */
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

  /** Removes all mappings. */
  override clear(): void {
    this.nodes.clear();
    this.modCount++;
  }

  /**
   * Returns a live view of the keys, compared by reference. Removing from it removes the mapping; it does not support
   * `add` (`UnsupportedOperationException`).
   */
  override keySet(): Set<K> {
    return (this.ks ??= new KeySet(this));
  }

  /**
   * Returns a live view of the values; its `contains` and `remove` compare by reference. Removing from it removes the
   * mapping; it does not support `add` (`UnsupportedOperationException`).
   */
  override values(): Collection<V> {
    return (this.vs ??= new Values(this));
  }

  /**
   * Returns a live view of the mappings. Its entries compare key and value by reference and `setValue` writes through;
   * removing from it removes the mapping, and it does not support `add` (`UnsupportedOperationException`).
   */
  entrySet(): Set<MapEntry<K, V>> {
    return (this.es ??= new EntrySet(this));
  }

  // a plain iterator object is faster than a generator
  /** Returns a fail-fast iterator over the mappings as `[key, value]` pairs, in unspecified order. */
  override [Symbol.iterator](): IterableIterator<[K, V]> {
    return jsIterator(new IdentityIterator(this), (n) => [n.key, n.value] as [K, V]);
  }

  /**
   * Calls `action` for each mapping, in iteration order.
   * @throws {@link NullPointerException} if `action` is null
   * @throws {@link ConcurrentModificationException} if `action` structurally modifies this map
   */
  override forEach(action: (key: K, value: V) => void): void {
    requireNonNull(action);
    const mc = this.modCount;
    for (const n of this.nodes.values()) {
      action(n.key, n.value);
      if (mc !== this.modCount) throw new ConcurrentModificationException();
    }
  }

  /** Returns `true` if `o` is a map with the same mappings, keys and values both compared by reference. */
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

  /**
   * Returns the sum over all entries of the key's identity hash code XOR the value's `hashCode()`, in 32-bit
   * arithmetic, so it is consistent with reference equality.
   */
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
  /**
   * Always by c.contains over these keys, as the reference: the inherited version switches to this.remove (by
   * identity) when this set is larger, so the result depended on the sizes.
   */
  override removeAll(c: Collection<unknown>): boolean {
    requireNonNull(c);
    return this.removeIf((k) => c.contains(k));
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
