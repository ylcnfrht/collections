import { AbstractCollection } from '../abstract/AbstractCollection';
import { AbstractMap, SimpleImmutableEntry } from '../abstract/AbstractMap';
import { AbstractSet } from '../abstract/AbstractSet';
import {
  ConcurrentModificationException,
  IllegalArgumentException,
  IllegalStateException,
  NoSuchElementException,
  UnsupportedOperationException,
} from '../exceptions';
import { SequencedCollection } from '../interfaces/Collection';
import { Iterator } from '../interfaces/Iterator';
import { Map, MapEntry, SequencedMap } from '../interfaces/Map';
import { SequencedSet } from '../interfaces/Set';
import { SET_BRAND, isEntry } from '../util/guards';
import { equals, requireNonNull } from '../util/Objects';
import { HashMap, HashNode, NodeIterator, checkCapacity, isIndexKey, isPlainKey } from './HashMap';

/** A HashNode threaded on the map's doubly linked list. */
export class LinkedNode<K, V> extends HashNode<K, V> {
  before: LinkedNode<K, V> | null;
  after: LinkedNode<K, V> | null;
  constructor(key: K, value: V, before: LinkedNode<K, V> | null) {
    super(key, value);
    this.before = before;
    this.after = null;
  }
}

// what an iterator yields per node
const KEY = 0;
const VALUE = 1;
const ENTRY = 2;
const PAIR = 3;
type Kind = typeof KEY | typeof VALUE | typeof ENTRY | typeof PAIR;

function project<K, V>(kind: Kind, n: LinkedNode<K, V>): unknown {
  return kind === KEY ? n.key : kind === VALUE ? n.value : kind === ENTRY ? n : [n.key, n.value];
}

/**
 * Hash map with a predictable iteration order: insertion order by default (re-putting a key keeps
 * its place), or access order when constructed with accessOrder = true (every get, put, compute or merge
 * hit moves the key to the end, which makes it a structural change for live iterators).
 * Override removeEldestEntry, or use LinkedHashMap.lru(n), to build an LRU cache.
 */
export class LinkedHashMap<K, V> extends HashMap<K, V> implements SequencedMap<K, V> {
  /** @internal eldest node */
  head: LinkedNode<K, V> | null = null;
  /** @internal youngest node */
  tail: LinkedNode<K, V> | null = null;
  readonly accessOrder: boolean;
  /** @internal evict the eldest entry while size exceeds this (set by lru()) */
  maxSize = Infinity;
  private lks: LinkedKeySet<K, V> | undefined;
  private lvs: LinkedValues<K, V> | undefined;
  private les: LinkedEntrySet<K, V> | undefined;
  private rev: ReversedLinkedHashMap<K, V> | undefined;

  constructor();
  constructor(initialCapacity: number, loadFactor?: number, accessOrder?: boolean);
  constructor(map: Map<K, V>);
  constructor(a?: number | Map<K, V>, loadFactor?: number, accessOrder = false) {
    // never hand the map to super: its putAll would run before our fields exist
    super();
    if (typeof a === 'number') checkCapacity(a, loadFactor);
    this.accessOrder = typeof a === 'number' && accessOrder;
    if (a !== undefined && typeof a !== 'number') this.putAll(requireNonNull(a));
  }

  static override of<K, V>(...pairs: [K, V][]): LinkedHashMap<K, V> {
    const m = new LinkedHashMap<K, V>();
    for (const [k, v] of pairs) m.put(k, v);
    return m;
  }

  /** An access-ordered map that evicts its least recently used entry beyond maxSize entries. */
  static lru<K, V>(maxSize: number): LinkedHashMap<K, V> {
    if (!(maxSize >= 1)) throw new IllegalArgumentException(`Illegal max size: ${maxSize}`);
    const m = new LinkedHashMap<K, V>(0, 0.75, true);
    m.maxSize = maxSize;
    return m;
  }

  override clone(): LinkedHashMap<K, V> {
    const m = new LinkedHashMap<K, V>(0, 0.75, this.accessOrder);
    m.maxSize = this.maxSize;
    for (let n = this.head; n !== null; n = n.after) m.put(n.key, n.value);
    return m;
  }

  /**
   * Called after each insertion with the eldest entry; returning true removes it.
   * May also modify the map itself (then return false).
   */
  protected removeEldestEntry(_eldest: MapEntry<K, V>): boolean {
    return false;
  }

  // hooks

  protected override newNode(key: K, value: V): HashNode<K, V> {
    return new LinkedNode(key, value, null);
  }

  protected override afterNodeInsertion(node: HashNode<K, V>): void {
    // linked only now: hashing a self-containing key must not see the node yet
    const n = node as LinkedNode<K, V>;
    const t = this.tail;
    n.before = t;
    if (t === null) this.head = n;
    else t.after = n;
    this.tail = n;
    const h = this.head!;
    if (this.size() > this.maxSize || this.removeEldestEntry(h)) this.removeNode(h);
  }

  protected override afterNodeAccess(node: HashNode<K, V>): void {
    if (this.accessOrder && this.tail !== node) {
      this.moveToLast(node as LinkedNode<K, V>);
      this.modCount++;
    }
  }

  protected override afterNodeRemoval(node: HashNode<K, V>): void {
    const n = node as LinkedNode<K, V>;
    this.unlink(n);
    n.before = n.after = null;
  }

  protected override newNodeIterator(): NodeIterator<K, V> {
    return new LinkedIterator(this, false, ENTRY);
  }

  protected override forEachNode(action: (node: HashNode<K, V>) => void): void {
    const mc = this.modCount;
    for (let n = this.head; n !== null; n = n.after) {
      action(n);
      if (mc !== this.modCount) throw new ConcurrentModificationException();
    }
  }

  // list primitives

  private unlink(n: LinkedNode<K, V>): void {
    const b = n.before;
    const a = n.after;
    if (b === null) this.head = a;
    else b.after = a;
    if (a === null) this.tail = b;
    else a.before = b;
  }

  private moveToLast(n: LinkedNode<K, V>): void {
    this.unlink(n);
    const t = this.tail;
    n.before = t;
    n.after = null;
    if (t === null) this.head = n;
    else t.after = n;
    this.tail = n;
  }

  private moveToFirst(n: LinkedNode<K, V>): void {
    this.unlink(n);
    const h = this.head;
    n.after = h;
    n.before = null;
    if (h === null) this.tail = n;
    else h.before = n;
    this.head = n;
  }

  // Map

  // own copy so the access hook inlines here instead of at HashMap.get's shared call site
  override get(key: unknown): V | null {
    let n: LinkedNode<K, V> | undefined;
    if (isIndexKey(key)) {
      n = this.ints[key] as LinkedNode<K, V> | undefined;
      if (n === undefined && this.fast.size !== 0) n = this.fast.get(key) as LinkedNode<K, V> | undefined;
    } else n = (isPlainKey(key) ? this.fast.get(key) : this.getNode(key)) as LinkedNode<K, V> | undefined;
    if (n === undefined) return null;
    if (this.accessOrder && this.tail !== n) {
      this.moveToLast(n);
      this.modCount++;
    }
    return n.value;
  }

  override containsValue(value: unknown): boolean {
    for (let n = this.head; n !== null; n = n.after) if (equals(value, n.value)) return true;
    return false;
  }

  override clear(): void {
    super.clear();
    this.head = this.tail = null;
  }

  override forEach(action: (key: K, value: V) => void): void {
    requireNonNull(action);
    const mc = this.modCount;
    for (let n = this.head; n !== null; n = n.after) {
      action(n.key, n.value);
      if (mc !== this.modCount) throw new ConcurrentModificationException();
    }
  }

  override keySet(): SequencedSet<K> {
    return this.sequencedKeySet();
  }

  override values(): SequencedCollection<V> {
    return this.sequencedValues();
  }

  override entrySet(): SequencedSet<MapEntry<K, V>> {
    return this.sequencedEntrySet();
  }

  override [Symbol.iterator](): Generator<[K, V]> {
    return new LinkedJsIterator(this, false, PAIR) as unknown as Generator<[K, V]>;
  }

  // SequencedMap

  sequencedKeySet(): SequencedSet<K> {
    return (this.lks ??= new LinkedKeySet(this, false));
  }

  sequencedValues(): SequencedCollection<V> {
    return (this.lvs ??= new LinkedValues(this, false));
  }

  sequencedEntrySet(): SequencedSet<MapEntry<K, V>> {
    return (this.les ??= new LinkedEntrySet(this, false));
  }

  reversed(): SequencedMap<K, V> {
    return (this.rev ??= new ReversedLinkedHashMap(this));
  }

  firstEntry(): MapEntry<K, V> | null {
    const n = this.head;
    return n === null ? null : new SimpleImmutableEntry(n.key, n.value);
  }

  lastEntry(): MapEntry<K, V> | null {
    const n = this.tail;
    return n === null ? null : new SimpleImmutableEntry(n.key, n.value);
  }

  pollFirstEntry(): MapEntry<K, V> | null {
    const n = this.head;
    if (n === null) return null;
    this.removeNode(n);
    return new SimpleImmutableEntry(n.key, n.value);
  }

  pollLastEntry(): MapEntry<K, V> | null {
    const n = this.tail;
    if (n === null) return null;
    this.removeNode(n);
    return new SimpleImmutableEntry(n.key, n.value);
  }

  /** Inserts or updates the mapping and moves it to the front. */
  putFirst(key: K, value: V): V | null {
    return this.putAt(key, value, true);
  }

  /** Inserts or updates the mapping and moves it to the end. */
  putLast(key: K, value: V): V | null {
    return this.putAt(key, value, false);
  }

  private putAt(key: K, value: V, first: boolean): V | null {
    let n = this.getNode(key) as LinkedNode<K, V> | undefined;
    let old: V | null = null;
    if (n === undefined) {
      this.put(key, value);
      // removeEldestEntry may have evicted the new node itself
      n = this.getNode(key) as LinkedNode<K, V> | undefined;
      if (n === undefined) return null;
    } else {
      old = n.value;
      n.value = value;
      this.modCount++;
    }
    if (first) this.moveToFirst(n);
    else this.moveToLast(n);
    return old;
  }
}

/** Fail-fast cursor along the list; doubles as a NodeIterator and a view Iterator. */
class LinkedIterator<K, V, T> implements NodeIterator<K, V>, Iterator<T> {
  private nxt: LinkedNode<K, V> | null;
  private last: LinkedNode<K, V> | null = null;
  private expected: number;

  constructor(private readonly map: LinkedHashMap<K, V>, private readonly rev: boolean, private readonly kind: Kind) {
    this.nxt = rev ? map.tail : map.head;
    this.expected = map.modCount;
  }

  hasNext(): boolean {
    return this.nxt !== null;
  }

  nextNode(): LinkedNode<K, V> {
    if (this.map.modCount !== this.expected) throw new ConcurrentModificationException();
    const n = this.nxt;
    if (n === null) throw new NoSuchElementException();
    this.nxt = this.rev ? n.before : n.after;
    return (this.last = n);
  }

  next(): T {
    return project(this.kind, this.nextNode()) as T;
  }

  remove(): void {
    const n = this.last;
    if (n === null) throw new IllegalStateException();
    if (this.map.modCount !== this.expected) throw new ConcurrentModificationException();
    this.last = null;
    this.map.removeNode(n);
    this.expected = this.map.modCount;
  }

  forEachRemaining(action: (t: T) => void): void {
    requireNonNull(action);
    while (this.nxt !== null) action(this.next());
  }
}

/** JS iterator protocol over the list (a plain object: much faster than a generator). */
class LinkedJsIterator<K, V, T> {
  private nxt: LinkedNode<K, V> | null;
  private readonly expected: number;

  constructor(private readonly map: LinkedHashMap<K, V>, private readonly rev: boolean, private readonly kind: Kind) {
    this.nxt = rev ? map.tail : map.head;
    this.expected = map.modCount;
  }

  next(): IteratorResult<T> {
    const n = this.nxt;
    if (n === null) return { value: undefined, done: true };
    if (this.map.modCount !== this.expected) throw new ConcurrentModificationException();
    this.nxt = this.rev ? n.before : n.after;
    return { value: project(this.kind, n) as T, done: false };
  }

  [Symbol.iterator](): this {
    return this;
  }
}

/** Shared body of the ordered key/value/entry views, in either direction. */
abstract class LinkedView<K, V, T> extends AbstractCollection<T> implements SequencedCollection<T> {
  constructor(protected readonly map: LinkedHashMap<K, V>, protected readonly rev: boolean, private readonly kind: Kind) {
    super();
  }
  abstract reversed(): SequencedCollection<T>;
  iterator(): Iterator<T> {
    return new LinkedIterator<K, V, T>(this.map, this.rev, this.kind);
  }
  override [Symbol.iterator](): Generator<T> {
    return new LinkedJsIterator<K, V, T>(this.map, this.rev, this.kind) as unknown as Generator<T>;
  }
  size(): number {
    return this.map.size();
  }
  override isEmpty(): boolean {
    return this.map.isEmpty();
  }
  override clear(): void {
    this.map.clear();
  }
  override forEach(action: (t: T) => void): void {
    requireNonNull(action);
    const m = this.map;
    const mc = m.modCount;
    for (let n = this.rev ? m.tail : m.head; n !== null; n = this.rev ? n.before : n.after) {
      action(project(this.kind, n) as T);
      if (mc !== m.modCount) throw new ConcurrentModificationException();
    }
  }
  override toArray(): T[] {
    const out: T[] = [];
    const m = this.map;
    for (let n = this.rev ? m.tail : m.head; n !== null; n = this.rev ? n.before : n.after) out.push(project(this.kind, n) as T);
    return out;
  }
  private end(first: boolean): LinkedNode<K, V> {
    const n = first !== this.rev ? this.map.head : this.map.tail;
    if (n === null) throw new NoSuchElementException();
    return n;
  }
  getFirst(): T {
    return project(this.kind, this.end(true)) as T;
  }
  getLast(): T {
    return project(this.kind, this.end(false)) as T;
  }
  removeFirst(): T {
    const n = this.end(true);
    this.map.removeNode(n);
    return project(this.kind, n) as T;
  }
  removeLast(): T {
    const n = this.end(false);
    this.map.removeNode(n);
    return project(this.kind, n) as T;
  }
  addFirst(_e: T): void {
    throw new UnsupportedOperationException();
  }
  addLast(_e: T): void {
    throw new UnsupportedOperationException();
  }
}

// AbstractSet's equality, borrowed (views can't extend both bases)
const setProto = AbstractSet.prototype as unknown as {
  equals(this: unknown, o: unknown): boolean;
  hashCode(this: unknown): number;
};

abstract class LinkedSetView<K, V, T> extends LinkedView<K, V, T> implements SequencedSet<T> {
  get [SET_BRAND](): true {
    return true;
  }
  abstract override reversed(): SequencedSet<T>;
  override equals(o: unknown): boolean {
    return setProto.equals.call(this, o);
  }
  override hashCode(): number {
    return setProto.hashCode.call(this);
  }
}

class LinkedKeySet<K, V> extends LinkedSetView<K, V, K> {
  constructor(map: LinkedHashMap<K, V>, rev: boolean, private r?: LinkedKeySet<K, V>) {
    super(map, rev, KEY);
  }
  reversed(): SequencedSet<K> {
    return (this.r ??= new LinkedKeySet(this.map, !this.rev, this));
  }
  override contains(k: unknown): boolean {
    return this.map.containsKey(k);
  }
  override remove(k: unknown): boolean {
    return this.map.removeKey(k) !== undefined;
  }
}

class LinkedValues<K, V> extends LinkedView<K, V, V> {
  constructor(map: LinkedHashMap<K, V>, rev: boolean, private r?: LinkedValues<K, V>) {
    super(map, rev, VALUE);
  }
  reversed(): SequencedCollection<V> {
    return (this.r ??= new LinkedValues(this.map, !this.rev, this));
  }
  override contains(v: unknown): boolean {
    return this.map.containsValue(v);
  }
}

class LinkedEntrySet<K, V> extends LinkedSetView<K, V, MapEntry<K, V>> {
  constructor(map: LinkedHashMap<K, V>, rev: boolean, private r?: LinkedEntrySet<K, V>) {
    super(map, rev, ENTRY);
  }
  reversed(): SequencedSet<MapEntry<K, V>> {
    return (this.r ??= new LinkedEntrySet(this.map, !this.rev, this));
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
}

/** Live reverse-ordered view; writes go to the base map (put of a new key lands at the base's end). */
class ReversedLinkedHashMap<K, V> extends AbstractMap<K, V> implements SequencedMap<K, V> {
  constructor(private readonly base: LinkedHashMap<K, V>) {
    super();
  }
  reversed(): SequencedMap<K, V> {
    return this.base;
  }
  override size(): number {
    return this.base.size();
  }
  override isEmpty(): boolean {
    return this.base.isEmpty();
  }
  override containsKey(key: unknown): boolean {
    return this.base.containsKey(key);
  }
  override containsValue(value: unknown): boolean {
    return this.base.containsValue(value);
  }
  override get(key: unknown): V | null {
    return this.base.get(key);
  }
  override put(key: K, value: V): V | null {
    return this.base.put(key, value);
  }
  override remove(key: unknown): V | null;
  override remove(key: unknown, value: unknown): boolean;
  override remove(key: unknown, value?: unknown): V | null | boolean {
    return arguments.length >= 2 ? this.base.remove(key, value) : this.base.remove(key);
  }
  override putAll(m: Map<K, V>): void {
    this.base.putAll(m);
  }
  override clear(): void {
    this.base.clear();
  }
  override keySet(): SequencedSet<K> {
    return this.base.sequencedKeySet().reversed();
  }
  override values(): SequencedCollection<V> {
    return this.base.sequencedValues().reversed();
  }
  entrySet(): SequencedSet<MapEntry<K, V>> {
    return this.base.sequencedEntrySet().reversed();
  }
  sequencedKeySet(): SequencedSet<K> {
    return this.keySet();
  }
  sequencedValues(): SequencedCollection<V> {
    return this.values();
  }
  sequencedEntrySet(): SequencedSet<MapEntry<K, V>> {
    return this.entrySet();
  }
  override [Symbol.iterator](): Generator<[K, V]> {
    return new LinkedJsIterator(this.base, true, PAIR) as unknown as Generator<[K, V]>;
  }
  override forEach(action: (key: K, value: V) => void): void {
    requireNonNull(action);
    this.entrySet().forEach((e) => action(e.getKey(), e.getValue()));
  }
  override replaceAll(fn: (key: K, value: V) => V): void {
    requireNonNull(fn);
    this.entrySet().forEach((e) => e.setValue(fn(e.getKey(), e.getValue())));
  }
  firstEntry(): MapEntry<K, V> | null {
    return this.base.lastEntry();
  }
  lastEntry(): MapEntry<K, V> | null {
    return this.base.firstEntry();
  }
  pollFirstEntry(): MapEntry<K, V> | null {
    return this.base.pollLastEntry();
  }
  pollLastEntry(): MapEntry<K, V> | null {
    return this.base.pollFirstEntry();
  }
  putFirst(key: K, value: V): V | null {
    return this.base.putLast(key, value);
  }
  putLast(key: K, value: V): V | null {
    return this.base.putFirst(key, value);
  }
  // the base's own versions keep its access-order and null-value semantics
  override getOrDefault(key: unknown, defaultValue: V): V {
    return this.base.getOrDefault(key, defaultValue);
  }
  override putIfAbsent(key: K, value: V): V | null {
    return this.base.putIfAbsent(key, value);
  }
  override replace(key: K, value: V): V | null;
  override replace(key: K, oldValue: V, newValue: V): boolean;
  override replace(key: K, a: V, b?: V): V | null | boolean {
    return arguments.length >= 3 ? this.base.replace(key, a, b as V) : this.base.replace(key, a);
  }
  override computeIfAbsent(key: K, fn: (key: K) => V | null | undefined): V | null {
    return this.base.computeIfAbsent(key, fn);
  }
  override computeIfPresent(key: K, fn: (key: K, value: V) => V | null | undefined): V | null {
    return this.base.computeIfPresent(key, fn);
  }
  override compute(key: K, fn: (key: K, value: V | null) => V | null | undefined): V | null {
    return this.base.compute(key, fn);
  }
  override merge(key: K, value: V, fn: (oldValue: V, value: V) => V | null | undefined): V | null {
    return this.base.merge(key, value, fn);
  }
}
