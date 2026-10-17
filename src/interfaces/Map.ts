import { Comparator } from '../util/Comparator';
import { Collection, SequencedCollection } from './Collection';
import { Set, NavigableSet, SequencedSet } from './Set';

/** Map.Entry */
export interface MapEntry<K, V> {
  getKey(): K;
  getValue(): V;
  /** @returns the previous value. @throws UnsupportedOperationException on immutable entries */
  setValue(value: V): V;
  equals(o: unknown): boolean;
  hashCode(): number;
  toString(): string;
}

/**
 * Map of keys to values. Shadows the JS Map global when imported; alias it if you need both.
 * `get` and friends return `null` for a missing key.
 * Also iterable as [key, value] pairs, so `new globalThis.Map(map)` works.
 */
export interface Map<K, V> extends Iterable<[K, V]> {
  size(): number;
  isEmpty(): boolean;
  containsKey(key: unknown): boolean;
  containsValue(value: unknown): boolean;
  get(key: unknown): V | null;
  /** @returns the previous value, or null */
  put(key: K, value: V): V | null;
  /** @returns the removed value, or null */
  remove(key: unknown): V | null;
  /** Removes only if currently mapped to value. */
  remove(key: unknown, value: unknown): boolean;
  putAll(m: Map<K, V>): void;
  clear(): void;
  /** Live views. */
  keySet(): Set<K>;
  values(): Collection<V>;
  entrySet(): Set<MapEntry<K, V>>;
  equals(o: unknown): boolean;
  hashCode(): number;
  toString(): string;

  getOrDefault(key: unknown, defaultValue: V): V;
  forEach(action: (key: K, value: V) => void): void;
  replaceAll(fn: (key: K, value: V) => V): void;
  putIfAbsent(key: K, value: V): V | null;
  replace(key: K, value: V): V | null;
  replace(key: K, oldValue: V, newValue: V): boolean;
  /** A function result of null/undefined means "no mapping". */
  computeIfAbsent(key: K, fn: (key: K) => V | null | undefined): V | null;
  computeIfPresent(key: K, fn: (key: K, value: V) => V | null | undefined): V | null;
  compute(key: K, fn: (key: K, value: V | null) => V | null | undefined): V | null;
  merge(key: K, value: V, fn: (oldValue: V, value: V) => V | null | undefined): V | null;
}

/** SequencedMap */
export interface SequencedMap<K, V> extends Map<K, V> {
  reversed(): SequencedMap<K, V>;
  firstEntry(): MapEntry<K, V> | null;
  lastEntry(): MapEntry<K, V> | null;
  pollFirstEntry(): MapEntry<K, V> | null;
  pollLastEntry(): MapEntry<K, V> | null;
  putFirst(key: K, value: V): V | null;
  putLast(key: K, value: V): V | null;
  sequencedKeySet(): SequencedSet<K>;
  sequencedValues(): SequencedCollection<V>;
  sequencedEntrySet(): SequencedSet<MapEntry<K, V>>;
}

/** SortedMap. putFirst/putLast throw UnsupportedOperationException. */
export interface SortedMap<K, V> extends SequencedMap<K, V> {
  comparator(): Comparator<K> | null;
  /** @throws NoSuchElementException when empty */
  firstKey(): K;
  /** @throws NoSuchElementException when empty */
  lastKey(): K;
  headMap(toKey: K): SortedMap<K, V>;
  tailMap(fromKey: K): SortedMap<K, V>;
  subMap(fromKey: K, toKey: K): SortedMap<K, V>;
}

/** NavigableMap. Entries returned by navigation methods are immutable snapshots. */
export interface NavigableMap<K, V> extends SortedMap<K, V> {
  lowerEntry(key: K): MapEntry<K, V> | null;
  lowerKey(key: K): K | null;
  floorEntry(key: K): MapEntry<K, V> | null;
  floorKey(key: K): K | null;
  ceilingEntry(key: K): MapEntry<K, V> | null;
  ceilingKey(key: K): K | null;
  higherEntry(key: K): MapEntry<K, V> | null;
  higherKey(key: K): K | null;
  descendingMap(): NavigableMap<K, V>;
  navigableKeySet(): NavigableSet<K>;
  descendingKeySet(): NavigableSet<K>;
  headMap(toKey: K): SortedMap<K, V>;
  headMap(toKey: K, inclusive: boolean): NavigableMap<K, V>;
  tailMap(fromKey: K): SortedMap<K, V>;
  tailMap(fromKey: K, inclusive: boolean): NavigableMap<K, V>;
  subMap(fromKey: K, toKey: K): SortedMap<K, V>;
  subMap(fromKey: K, fromInclusive: boolean, toKey: K, toInclusive: boolean): NavigableMap<K, V>;
  reversed(): NavigableMap<K, V>;
}
