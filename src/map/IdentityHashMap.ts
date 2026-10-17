import { AbstractMap } from '../abstract/AbstractMap';
import { AbstractSet } from '../abstract/AbstractSet';
import { ConcurrentModificationException, IllegalArgumentException, IllegalStateException, NoSuchElementException } from '../exceptions';
import { Iterator } from '../interfaces/Iterator';
import { Map, MapEntry } from '../interfaces/Map';
import { Set } from '../interfaces/Set';
import { isEntry } from '../util/guards';
import { equals, hashCode, identityHashCode, requireNonNull, toString } from '../util/Objects';
import { jsIterator } from './HashMap';

/** Entry whose key compares by reference; setValue writes through. */
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
    const k = o.getKey();
    return (k === this.key || (k !== k && this.key !== this.key)) && equals(this.value, o.getValue());
  }
  hashCode(): number {
    return identityHash(this.key, this.value);
  }
  toString(): string {
    return `${toString(this.key)}=${toString(this.value)}`;
  }
}

// values compare with Objects.equals, so they hash with hashCode() to keep equals/hashCode consistent
function identityHash(k: unknown, v: unknown): number {
  return identityHashCode(k) ^ hashCode(v);
}

/**
 * Map whose keys compare by reference (===, except NaN equals NaN; equals()/hashCode() ignored).
 * Values compare with Objects.equals. Backed by a native Map, which uses exactly that key rule.
 */
export class IdentityHashMap<K, V> extends AbstractMap<K, V> {
  /** @internal */
  readonly nodes = new globalThis.Map<K, IdentityNode<K, V>>();
  /** Structural modification count; iterators compare against it. */
  modCount = 0;
  private es: EntrySet<K, V> | undefined;

  constructor();
  constructor(expectedMaxSize: number);
  constructor(map: Map<K, V>);
  constructor(a?: number | Map<K, V>) {
    super();
    if (typeof a === 'number') {
      if (!(a >= 0)) throw new IllegalArgumentException(`expectedMaxSize is negative: ${a}`);
    } else if (a !== undefined) this.putAll(requireNonNull(a));
  }

  clone(): IdentityHashMap<K, V> {
    return new IdentityHashMap<K, V>(this);
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
    for (const n of this.nodes.values()) if (equals(value, n.value)) return true;
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
      if (n === undefined || !equals(n.value, value)) return false;
    } else if (n === undefined) return null;
    this.nodes.delete(key as K);
    this.modCount++;
    return arguments.length >= 2 ? true : n.value;
  }

  override clear(): void {
    this.nodes.clear();
    this.modCount++;
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

  /** Identity maps compare keys by reference with each other; otherwise the usual Map equality. */
  override equals(o: unknown): boolean {
    if (o === this) return true;
    if (!(o instanceof IdentityHashMap)) return super.equals(o);
    if (o.size() !== this.size()) return false;
    for (const n of this.nodes.values()) {
      const m = (o as IdentityHashMap<K, V>).nodes.get(n.key);
      if (m === undefined || !equals(n.value, m.value)) return false;
    }
    return true;
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
  size(): number {
    return this.map.size();
  }
  private find(o: unknown): IdentityNode<K, V> | undefined {
    if (!isEntry(o)) return undefined;
    const n = this.map.nodes.get(o.getKey() as K);
    return n !== undefined && equals(n.value, o.getValue()) ? n : undefined;
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
