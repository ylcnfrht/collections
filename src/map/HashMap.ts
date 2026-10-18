import { AbstractCollection } from '../abstract/AbstractCollection';
import { AbstractMap, entryEquals, entryHash, entryToString } from '../abstract/AbstractMap';
import { AbstractSet } from '../abstract/AbstractSet';
import {
  ConcurrentModificationException,
  IllegalArgumentException,
  IllegalStateException,
  NoSuchElementException,
} from '../exceptions';
import { Collection } from '../interfaces/Collection';
import { Iterator } from '../interfaces/Iterator';
import { Map, MapEntry } from '../interfaces/Map';
import { Set } from '../interfaces/Set';
import { Spliterator } from '../stream/Spliterator';
import { hashSpliterator } from '../stream/Spliterators';
import { toArrayWith, WritableArrayLike } from '../util/arrays';
import { isEntry } from '../util/guards';
import { INSPECT, equals, hashCode, requireNonNull } from '../util/Objects';

/**
 * True when a key's value equality is exactly SameValueZero: every primitive, and every
 * object/function without an equals() method that is not a Date. Such keys live in a native Map.
 */
export function isPlainKey(k: unknown): boolean {
  return (typeof k !== 'object' && typeof k !== 'function') || k === null || (typeof (k as { equals?: unknown }).equals !== 'function' && !(k instanceof Date));
}

/** Non-negative int32 keys (and -0) that may live in the dense index table. */
export function isIndexKey(k: unknown): k is number {
  return typeof k === 'number' && k >>> 0 === k;
}

/** Index keys go to the dense table only while it stays at least ~25% full; others use the native Map. */
export function fitsIndexTable(k: number, length: number, count: number): boolean {
  return k < length + 1024 && k < 4 * count + 1024;
}

/** Validates the (initialCapacity, loadFactor) hints shared by HashMap and HashSet. */
export function checkCapacity(initialCapacity: number, loadFactor?: number): void {
  if (!(initialCapacity >= 0)) throw new IllegalArgumentException(`Illegal initial capacity: ${initialCapacity}`);
  if (loadFactor !== undefined && !(loadFactor > 0)) throw new IllegalArgumentException(`Illegal load factor: ${loadFactor}`);
}

/** Wraps a cursor as a JS iterator; a plain object is much faster than a generator. */
export function jsIterator<T, R = T>(it: Iterator<T>, f?: (t: T) => R): IterableIterator<R> {
  return {
    next(): IteratorResult<R> {
      if (!it.hasNext()) return { value: undefined, done: true };
      const v = it.next();
      return { value: f === undefined ? (v as unknown as R) : f(v), done: false };
    },
    [Symbol.iterator]() {
      return this;
    },
  };
}

/** A mapping. entrySet() hands these out directly, so setValue writes through. */
export class HashNode<K, V> implements MapEntry<K, V> {
  readonly key: K;
  value: V;
  /** @internal hashCode(key) at insertion, for bucket keys; removal must not rehash a key that mutated since */
  hash = 0;
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
    return entryEquals(this, o);
  }
  hashCode(): number {
    return entryHash(this);
  }
  [INSPECT](): string {
    return this.toString();
  }
  toString(): string {
    return entryToString(this);
  }
}

/** Fail-fast cursor over nodes; what views and subclasses iterate with. */
export interface NodeIterator<K, V> {
  hasNext(): boolean;
  /** @throws NoSuchElementException / ConcurrentModificationException */
  nextNode(): HashNode<K, V>;
  /** Removes the last returned node. @throws IllegalStateException */
  remove(): void;
}

type Bucket<K, V> = HashNode<K, V> | HashNode<K, V>[];

/**
 * Hash table map. Keys are equal by Objects.equals; null/undefined keys and values allowed.
 * Iteration order is unspecified.
 *
 * Storage is hybrid: small non-negative integer keys live in a dense array indexed by the key
 * (faster than any hash); other keys whose equality is SameValueZero (primitives, plain objects)
 * live in a native Map; keys with equals()/hashCode() and Dates live in a bucket table keyed by
 * hashCode(). An integer key that would make the array sparse goes to the native Map instead,
 * so lookups of index keys check the array, then the native Map. A key object whose equals() claims equality with a primitive is still a distinct
 * key from that primitive (equals must be symmetric, and a primitive never equals an object).
 *
 * Extension hooks (for LinkedHashMap and friends):
 * - newNode(key, value): creates every node; override to return a HashNode subclass.
 * - afterNodeInsertion(node): after a new mapping was added (modCount already bumped).
 * - afterNodeAccess(node): on a hit by get/getOrDefault, put/putIfAbsent on an existing key,
 *   replace that matched, and computeIfAbsent/computeIfPresent/compute/merge on an existing key
 *   (when they keep or update it). Not fired by containsKey, entry.setValue or replaceAll.
 * - afterNodeRemoval(node): after a mapping was removed (not fired by clear(): override clear()).
 * - newNodeIterator(): the cursor behind every view iterator and [Symbol.iterator].
 * - forEachNode(action): the traversal behind forEach, replaceAll, view forEach/toArray and copies.
 * Subclasses that keep their own order override newNodeIterator, forEachNode, clear and clone;
 * removeNode(node) is the way to delete a node from such a subclass iterator.
 */
export class HashMap<K, V> extends AbstractMap<K, V> {
  /** @internal index keys: ints[key] is the node */
  ints: (HashNode<K, V> | undefined)[] = [];
  /** @internal number of nodes in ints */
  intCount = 0;
  /** @internal other SameValueZero keys */
  fast = new globalThis.Map<unknown, HashNode<K, V>>();
  /** @internal hashCode -> node(s) for keys with equals() and Dates */
  buckets = new globalThis.Map<number, Bucket<K, V>>();
  /** @internal number of nodes in buckets */
  valueCount = 0;
  /** Structural modification count (new key, removal, clear); iterators compare against it. */
  modCount = 0;
  private ks: KeySet<K, V> | undefined;
  private vs: Values<K, V> | undefined;
  private es: EntrySet<K, V> | undefined;

  constructor();
  constructor(initialCapacity: number, loadFactor?: number);
  constructor(map: Map<K, V>);
  constructor(a?: number | Map<K, V>, loadFactor?: number) {
    super();
    if (typeof a === 'number') checkCapacity(a, loadFactor);
    else if (a !== undefined) this.putAll(requireNonNull(a));
  }

  static of<K, V>(...pairs: [K, V][]): HashMap<K, V> {
    const m = new HashMap<K, V>();
    for (const [k, v] of pairs) m.put(k, v);
    return m;
  }

  /**
   * An empty map sized for numMappings mappings (a sizing hint only).
   * @throws IllegalArgumentException if numMappings is negative or NaN
   */
  static newHashMap<K, V>(numMappings: number): HashMap<K, V> {
    if (!(numMappings >= 0)) throw new IllegalArgumentException(`Negative number of mappings: ${numMappings}`);
    return new HashMap<K, V>();
  }

  /** Shallow copy (keys and values are not cloned) of the same runtime class, subclass fields included. */
  clone(): HashMap<K, V> {
    const m = this.cloneShell();
    m.reinitialize();
    this.forEachNode((n) => m.copyNode(n.key, n.value));
    return m;
  }

  /** clone(): gives a shell fresh, empty storage and views. */
  protected reinitialize(): void {
    this.ints = [];
    this.intCount = 0;
    this.fast = new globalThis.Map();
    this.buckets = new globalThis.Map();
    this.valueCount = 0;
    this.modCount = 0;
    this.ks = this.vs = this.es = undefined;
  }

  /** clone(): adds a mapping for an absent key without firing afterNodeInsertion (so nothing is evicted). */
  protected copyNode(key: K, value: V): HashNode<K, V> {
    const n = this.newNode(key, value);
    this.insertNode(n);
    return n;
  }

  // hooks

  /** Runs before the key is hashed into storage: don't make the node reachable from here (link it in afterNodeInsertion). */
  protected newNode(key: K, value: V): HashNode<K, V> {
    return new HashNode(key, value);
  }
  protected afterNodeInsertion(_node: HashNode<K, V>): void {}
  protected afterNodeAccess(_node: HashNode<K, V>): void {}
  protected afterNodeRemoval(_node: HashNode<K, V>): void {}

  protected newNodeIterator(): NodeIterator<K, V> {
    return new HashIterator(this);
  }

  /** Visits every node; fail-fast if action structurally modifies the map. */
  protected forEachNode(action: (node: HashNode<K, V>) => void): void {
    const mc = this.modCount;
    const ints = this.ints;
    if (this.intCount !== 0) {
      for (let i = 0; i < ints.length; i++) {
        const n = ints[i];
        if (n === undefined) continue;
        action(n);
        if (mc !== this.modCount) throw new ConcurrentModificationException();
      }
    }
    for (const n of this.fast.values()) {
      action(n);
      if (mc !== this.modCount) throw new ConcurrentModificationException();
    }
    if (this.valueCount === 0) return;
    for (const b of this.buckets.values()) {
      if (Array.isArray(b)) {
        for (let i = 0; i < b.length; i++) {
          action(b[i]);
          if (mc !== this.modCount) throw new ConcurrentModificationException();
        }
      } else {
        action(b);
        if (mc !== this.modCount) throw new ConcurrentModificationException();
      }
    }
  }

  // node primitives

  /** @internal */
  nodeIterator(): NodeIterator<K, V> {
    return this.newNodeIterator();
  }

  /** @internal */
  eachNode(action: (node: HashNode<K, V>) => void): void {
    this.forEachNode(action);
  }

  /** The node for key, or undefined. Fires no hook. */
  getNode(key: unknown): HashNode<K, V> | undefined {
    if (isIndexKey(key)) {
      const n = this.ints[key];
      return n !== undefined || this.fast.size === 0 ? n : this.fast.get(key);
    }
    if (isPlainKey(key)) return this.fast.get(key);
    if (this.valueCount === 0) return undefined;
    const b = this.buckets.get(hashCode(key));
    if (b === undefined) return undefined;
    if (!Array.isArray(b)) return equals(key, b.key) ? b : undefined;
    for (let i = 0; i < b.length; i++) if (equals(key, b[i].key)) return b[i];
    return undefined;
  }

  /** Inserts a mapping for a key known to be absent. */
  private addNode(key: K, value: V): HashNode<K, V> {
    const n = this.newNode(key, value);
    this.insertNode(n);
    this.modCount++;
    this.afterNodeInsertion(n);
    return n;
  }

  /** Puts a node for an absent key into storage; no modCount bump, no hook. */
  private insertNode(n: HashNode<K, V>): void {
    const key = n.key;
    if (isIndexKey(key) && fitsIndexTable(key, this.ints.length, this.intCount)) {
      this.ints[key] = n;
      this.intCount++;
    } else if (isPlainKey(key)) {
      this.fast.set(key, n);
    } else {
      const h = (n.hash = hashCode(key));
      const b = this.buckets.get(h);
      if (b === undefined) this.buckets.set(h, n);
      else if (Array.isArray(b)) b.push(n);
      else this.buckets.set(h, [b, n]);
      this.valueCount++;
    }
  }

  /** Removes exactly this node (by identity). */
  removeNode(node: HashNode<K, V>): void {
    const k = node.key;
    if (isIndexKey(k) && this.ints[k] === node) {
      const ints = this.ints;
      ints[k] = undefined;
      // a fresh array frees memory; live iterators keep scanning the old (now empty) one
      if (--this.intCount === 0) this.ints = [];
      else if (ints.length >= 4 * this.intCount + 1024) {
        // below the ~25% fill that fitsIndexTable keeps on insert: drop the trailing holes (each is scanned once)
        let n = ints.length;
        while (ints[n - 1] === undefined) n--;
        if (n !== ints.length) ints.length = n;
      }
    } else if (this.fast.get(k) === node) {
      // by where the node is, not by isPlainKey: a key object may have gained or lost equals() since insertion
      this.fast.delete(k);
    } else {
      const h = node.hash;
      const b = this.buckets.get(h);
      if (b === node) this.buckets.delete(h);
      else if (Array.isArray(b)) {
        // arrays are kept (never collapsed to a single node) so live iterators can track them
        b.splice(b.indexOf(node), 1);
        if (b.length === 0) this.buckets.delete(h);
      }
      this.valueCount--;
    }
    this.modCount++;
    this.afterNodeRemoval(node);
  }

  /** @internal removes key's mapping, returning the removed node */
  removeKey(key: unknown): HashNode<K, V> | undefined {
    if (typeof key !== 'number' && isPlainKey(key)) {
      const n = this.fast.get(key);
      if (n === undefined) return undefined;
      this.fast.delete(key);
      this.modCount++;
      this.afterNodeRemoval(n);
      return n;
    }
    const n = this.getNode(key);
    if (n !== undefined) this.removeNode(n);
    return n;
  }

  // Map

  override size(): number {
    return this.intCount + this.fast.size + this.valueCount;
  }

  override isEmpty(): boolean {
    return this.intCount + this.fast.size + this.valueCount === 0;
  }

  protected override findEntry(key: unknown): MapEntry<K, V> | undefined {
    return this.getNode(key);
  }

  override get(key: unknown): V | null {
    let n: HashNode<K, V> | undefined;
    if (isIndexKey(key)) {
      n = this.ints[key];
      if (n === undefined && this.fast.size !== 0) n = this.fast.get(key);
    } else n = isPlainKey(key) ? this.fast.get(key) : this.getNode(key);
    if (n === undefined) return null;
    this.afterNodeAccess(n);
    return n.value;
  }

  override containsKey(key: unknown): boolean {
    return this.getNode(key) !== undefined;
  }

  override containsValue(value: unknown): boolean {
    if (this.intCount !== 0) {
      const ints = this.ints;
      for (let i = 0; i < ints.length; i++) {
        const n = ints[i];
        if (n !== undefined && equals(value, n.value)) return true;
      }
    }
    for (const n of this.fast.values()) if (equals(value, n.value)) return true;
    if (this.valueCount === 0) return false;
    for (const b of this.buckets.values()) {
      if (Array.isArray(b)) {
        for (let i = 0; i < b.length; i++) if (equals(value, b[i].value)) return true;
      } else if (equals(value, b.value)) return true;
    }
    return false;
  }

  override put(key: K, value: V): V | null {
    if (isIndexKey(key)) {
      const ints = this.ints;
      let n = ints[key];
      if (n === undefined && this.fast.size !== 0) n = this.fast.get(key);
      if (n === undefined) {
        n = this.newNode(key, value);
        if (fitsIndexTable(key, ints.length, this.intCount)) {
          ints[key] = n;
          this.intCount++;
        } else this.fast.set(key, n);
        this.modCount++;
        this.afterNodeInsertion(n);
        return null;
      }
      const old = n.value;
      n.value = value;
      this.afterNodeAccess(n);
      return old;
    }
    if (isPlainKey(key)) {
      const n = this.fast.get(key);
      if (n === undefined) {
        const nn = this.newNode(key, value);
        this.fast.set(key, nn);
        this.modCount++;
        this.afterNodeInsertion(nn);
        return null;
      }
      const old = n.value;
      n.value = value;
      this.afterNodeAccess(n);
      return old;
    }
    const n = this.getNode(key);
    if (n === undefined) {
      this.addNode(key, value);
      return null;
    }
    const old = n.value;
    n.value = value;
    this.afterNodeAccess(n);
    return old;
  }

  override remove(key: unknown): V | null;
  override remove(key: unknown, value: unknown): boolean;
  override remove(key: unknown, value?: unknown): V | null | boolean {
    if (arguments.length >= 2) {
      const n = this.getNode(key);
      if (n === undefined || !equals(n.value, value)) return false;
      this.removeNode(n);
      return true;
    }
    const n = this.removeKey(key);
    return n === undefined ? null : n.value;
  }

  override putAll(m: Map<K, V>): void {
    requireNonNull(m);
    if (m === this) return;
    if (m instanceof HashMap) {
      (m as HashMap<K, V>).forEachNode((n) => this.put(n.key, n.value));
      return;
    }
    for (const e of m.entrySet().toArray()) this.put(e.getKey(), e.getValue());
  }

  override clear(): void {
    this.ints = [];
    this.intCount = 0;
    this.fast.clear();
    this.buckets.clear();
    this.valueCount = 0;
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

  // a plain iterator object is faster than a generator
  override [Symbol.iterator](): IterableIterator<[K, V]> {
    // unless a subclass changed the order, the cursor doubles as the JS iterator (one less hop per step)
    if (this.newNodeIterator === HashMap.prototype.newNodeIterator) return new HashIterator(this);
    const it = this.newNodeIterator();
    return {
      next(): IteratorResult<[K, V]> {
        if (!it.hasNext()) return { value: undefined, done: true };
        const n = it.nextNode();
        return { value: [n.key, n.value], done: false };
      },
      [Symbol.iterator]() {
        return this;
      },
    };
  }

  override hashCode(): number {
    let h = 0;
    this.forEachNode((n) => (h = (h + entryHash(n)) | 0));
    return h;
  }

  // default methods

  override getOrDefault(key: unknown, defaultValue: V): V {
    const n = this.getNode(key);
    if (n === undefined) return defaultValue;
    this.afterNodeAccess(n);
    return n.value;
  }

  override forEach(action: (key: K, value: V) => void): void {
    requireNonNull(action);
    this.forEachNode((n) => action(n.key, n.value));
  }

  override replaceAll(fn: (key: K, value: V) => V): void {
    requireNonNull(fn);
    this.forEachNode((n) => {
      n.value = fn(n.key, n.value);
    });
  }

  override putIfAbsent(key: K, value: V): V | null {
    const n = this.getNode(key);
    if (n === undefined) {
      this.addNode(key, value);
      return null;
    }
    this.afterNodeAccess(n);
    // a key mapped to null counts as absent
    if (n.value !== null) return n.value;
    n.value = value;
    return null;
  }

  override replace(key: K, value: V): V | null;
  override replace(key: K, oldValue: V, newValue: V): boolean;
  override replace(key: K, a: V, b?: V): V | null | boolean {
    const n = this.getNode(key);
    if (arguments.length >= 3) {
      if (n === undefined || !equals(n.value, a)) return false;
      n.value = b as V;
      this.afterNodeAccess(n);
      return true;
    }
    if (n === undefined) return null;
    const old = n.value;
    n.value = a;
    this.afterNodeAccess(n);
    return old;
  }

  override computeIfAbsent(key: K, fn: (key: K) => V | null | undefined): V | null {
    requireNonNull(fn);
    const n = this.getNode(key);
    if (n !== undefined && n.value !== null) {
      this.afterNodeAccess(n);
      return n.value;
    }
    const mc = this.modCount;
    const v = fn(key);
    if (mc !== this.modCount) throw new ConcurrentModificationException();
    if (v === null || v === undefined) return null;
    this.store(key, v, n);
    return v;
  }

  override computeIfPresent(key: K, fn: (key: K, value: V) => V | null | undefined): V | null {
    requireNonNull(fn);
    const n = this.getNode(key);
    if (n === undefined || n.value === null) return null;
    const mc = this.modCount;
    const v = fn(key, n.value);
    if (mc !== this.modCount) throw new ConcurrentModificationException();
    if (v === null || v === undefined) {
      this.removeNode(n);
      return null;
    }
    this.store(key, v, n);
    return v;
  }

  override compute(key: K, fn: (key: K, value: V | null) => V | null | undefined): V | null {
    requireNonNull(fn);
    const n = this.getNode(key);
    const mc = this.modCount;
    const v = fn(key, n === undefined ? null : n.value);
    if (mc !== this.modCount) throw new ConcurrentModificationException();
    if (v === null || v === undefined) {
      if (n !== undefined) this.removeNode(n);
      return null;
    }
    this.store(key, v, n);
    return v;
  }

  override merge(key: K, value: V, fn: (oldValue: V, value: V) => V | null | undefined): V | null {
    requireNonNull(fn);
    requireNonNull(value);
    const n = this.getNode(key);
    const mc = this.modCount;
    const v = n === undefined || n.value === null ? value : fn(n.value, value);
    if (mc !== this.modCount) throw new ConcurrentModificationException();
    if (v === null || v === undefined) {
      this.removeNode(n!); // only fn can return null, and fn runs only on an existing node
      return null;
    }
    this.store(key, v, n);
    return v;
  }

  /** Writes a computed value; n is the node looked up before fn ran (fn made no structural change). */
  private store(key: K, v: V, n: HashNode<K, V> | undefined): void {
    if (n === undefined) this.addNode(key, v);
    else {
      n.value = v;
      this.afterNodeAccess(n);
    }
  }
}

/** Fail-fast cursor: the native fast-key Map first, then the buckets. */
class HashIterator<K, V> implements NodeIterator<K, V> {
  private ints: (HashNode<K, V> | undefined)[] | null;
  private ii = 0;
  private fastIt: IterableIterator<HashNode<K, V>> | null;
  private bucketIt: IterableIterator<Bucket<K, V>> | null = null;
  private arr: HashNode<K, V>[] | null = null;
  private ai = 0;
  private remaining: number;
  private last: HashNode<K, V> | null = null;
  private expected: number;

  constructor(private readonly map: HashMap<K, V>) {
    this.ints = map.intCount === 0 ? null : map.ints;
    this.fastIt = map.fast.values();
    this.remaining = map.size();
    this.expected = map.modCount;
  }

  hasNext(): boolean {
    return this.remaining > 0;
  }

  /** JS iterator protocol: [key, value] pairs. */
  next(): IteratorResult<[K, V]> {
    if (this.remaining <= 0) return { value: undefined, done: true };
    const n = this.nextNode();
    return { value: [n.key, n.value], done: false };
  }

  [Symbol.iterator](): this {
    return this;
  }

  nextNode(): HashNode<K, V> {
    if (this.map.modCount !== this.expected) throw new ConcurrentModificationException();
    if (this.remaining <= 0) throw new NoSuchElementException();
    this.remaining--;
    const ints = this.ints;
    if (ints !== null) {
      while (this.ii < ints.length) {
        const n = ints[this.ii++];
        if (n !== undefined) return (this.last = n);
      }
      this.ints = null;
    }
    if (this.fastIt !== null) {
      const r = this.fastIt.next();
      if (!r.done) return (this.last = r.value);
      this.fastIt = null;
      this.bucketIt = this.map.buckets.values();
    }
    for (;;) {
      const arr = this.arr;
      if (arr !== null && this.ai < arr.length) return (this.last = arr[this.ai++]);
      this.arr = null;
      const r = this.bucketIt!.next();
      if (r.done) throw new ConcurrentModificationException();
      if (!Array.isArray(r.value)) return (this.last = r.value);
      this.arr = r.value;
      this.ai = 0;
    }
  }

  remove(): void {
    const n = this.last;
    if (n === null) throw new IllegalStateException();
    if (this.map.modCount !== this.expected) throw new ConcurrentModificationException();
    this.last = null;
    // removeNode splices the bucket array we are walking: step back over the hole
    if (this.arr !== null) {
      const i = this.arr.indexOf(n);
      if (i >= 0 && i < this.ai) this.ai--;
    }
    this.map.removeNode(n);
    this.expected = this.map.modCount;
  }
}

abstract class ViewIterator<K, V, T> implements Iterator<T> {
  constructor(protected readonly it: NodeIterator<K, V>) {}
  abstract next(): T;
  hasNext(): boolean {
    return this.it.hasNext();
  }
  remove(): void {
    this.it.remove();
  }
  forEachRemaining(action: (t: T) => void): void {
    requireNonNull(action);
    while (this.it.hasNext()) action(this.next());
  }
}

class KeyIterator<K, V> extends ViewIterator<K, V, K> {
  next(): K {
    return this.it.nextNode().key;
  }
}

class ValueIterator<K, V> extends ViewIterator<K, V, V> {
  next(): V {
    return this.it.nextNode().value;
  }
}

class EntryIterator<K, V> extends ViewIterator<K, V, MapEntry<K, V>> {
  next(): MapEntry<K, V> {
    return this.it.nextNode();
  }
}

class KeySet<K, V> extends AbstractSet<K> {
  constructor(private readonly map: HashMap<K, V>) {
    super();
  }
  iterator(): Iterator<K> {
    return new KeyIterator(this.map.nodeIterator());
  }
  override spliterator(): Spliterator<K> {
    return hashSpliterator(this, this.map, true);
  }
  override [Symbol.iterator](): IterableIterator<K> {
    return jsIterator(this.iterator());
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
    return this.map.removeKey(k) !== undefined;
  }
  override clear(): void {
    this.map.clear();
  }
  override forEach(action: (k: K) => void): void {
    requireNonNull(action);
    this.map.eachNode((n) => action(n.key));
  }
  override toArray(): K[];
  override toArray<A extends WritableArrayLike<K>>(generator: (length: number) => A): A;
  override toArray<A extends WritableArrayLike<K>>(generator?: (length: number) => A): K[] | A {
    const out: K[] = [];
    this.map.eachNode((n) => out.push(n.key));
    return arguments.length > 0 ? toArrayWith(out, generator as (length: number) => A) : out;
  }
}

class Values<K, V> extends AbstractCollection<V> {
  constructor(private readonly map: HashMap<K, V>) {
    super();
  }
  iterator(): Iterator<V> {
    return new ValueIterator(this.map.nodeIterator());
  }
  override spliterator(): Spliterator<V> {
    return hashSpliterator(this, this.map, false);
  }
  override [Symbol.iterator](): IterableIterator<V> {
    return jsIterator(this.iterator());
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
  override forEach(action: (v: V) => void): void {
    requireNonNull(action);
    this.map.eachNode((n) => action(n.value));
  }
  override toArray(): V[];
  override toArray<A extends WritableArrayLike<V>>(generator: (length: number) => A): A;
  override toArray<A extends WritableArrayLike<V>>(generator?: (length: number) => A): V[] | A {
    const out: V[] = [];
    this.map.eachNode((n) => out.push(n.value));
    return arguments.length > 0 ? toArrayWith(out, generator as (length: number) => A) : out;
  }
}

class EntrySet<K, V> extends AbstractSet<MapEntry<K, V>> {
  constructor(private readonly map: HashMap<K, V>) {
    super();
  }
  iterator(): Iterator<MapEntry<K, V>> {
    return new EntryIterator(this.map.nodeIterator());
  }
  override spliterator(): Spliterator<MapEntry<K, V>> {
    return hashSpliterator(this, this.map, true);
  }
  override [Symbol.iterator](): IterableIterator<MapEntry<K, V>> {
    return jsIterator(this.iterator());
  }
  size(): number {
    return this.map.size();
  }
  override isEmpty(): boolean {
    return this.map.isEmpty();
  }
  private find(o: unknown): HashNode<K, V> | undefined {
    if (!isEntry(o)) return undefined;
    const n = this.map.getNode(o.getKey());
    return n !== undefined && equals(n.value, o.getValue()) ? n : undefined;
  }
  override contains(o: unknown): boolean {
    return this.find(o) !== undefined;
  }
  override remove(o: unknown): boolean {
    const n = this.find(o);
    if (n === undefined) return false;
    this.map.removeNode(n);
    return true;
  }
  override clear(): void {
    this.map.clear();
  }
  override forEach(action: (e: MapEntry<K, V>) => void): void {
    requireNonNull(action);
    this.map.eachNode(action);
  }
  override toArray(): MapEntry<K, V>[];
  override toArray<A extends WritableArrayLike<MapEntry<K, V>>>(generator: (length: number) => A): A;
  override toArray<A extends WritableArrayLike<MapEntry<K, V>>>(generator?: (length: number) => A): MapEntry<K, V>[] | A {
    const out: MapEntry<K, V>[] = [];
    this.map.eachNode((n) => out.push(n));
    return arguments.length > 0 ? toArrayWith(out, generator as (length: number) => A) : out;
  }
}
