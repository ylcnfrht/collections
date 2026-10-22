import { Comparator } from '../util/Comparator';
import { Collection, SequencedCollection } from './Collection';
import { Set, NavigableSet, SequencedSet } from './Set';

/**
 * A key-value pair of a map. Entries reached by iterating a map's `entrySet()` are live: `setValue` writes through
 * to the map. Entries returned by navigation and first/last methods are immutable snapshots.
 */
export interface MapEntry<K, V> {
  /** Returns the key. */
  getKey(): K;
  /** Returns the value. */
  getValue(): V;
  /**
   * Replaces the value (and, for a live entry, the value in the backing map).
   * @returns the previous value
   * @throws {@link UnsupportedOperationException} if the entry is immutable (a snapshot or from an unmodifiable map)
   * @throws {@link NullPointerException} if `value` is null and the backing map rejects null values
   */
  setValue(value: V): V;
  /** Returns `true` if `o` is an entry with an equal key and an equal value (by `Objects.equals`). */
  equals(o: unknown): boolean;
  /** Returns `hash(key) ^ hash(value)`, so equal entries hash equally. */
  hashCode(): number;
  /** Returns `key=value`. */
  toString(): string;
}

/**
 * An object that maps keys to values, at most one value per key. Keys compare by `Objects.equals` (or by the
 * comparator in sorted maps). `get` and the other lookups return `null` for a missing key, so on a map that stores
 * `null` values use `containsKey` or `getOrDefault` to tell the two apart. Mutating methods throw
 * `UnsupportedOperationException` on an unmodifiable map; maps that reject `null` keys or values throw
 * `NullPointerException`. Iteration over the map and its views is fail-fast (`ConcurrentModificationException`).
 *
 * Two maps are equal when they hold the same mappings, whatever their classes; the hash code is the sum over all
 * entries of `hash(key) ^ hash(value)`, in 32-bit arithmetic. Also iterable as `[key, value]` pairs, so
 * `new globalThis.Map(map)` works. Shadows the JS `Map` global when imported; alias it if you need both.
 */
export interface Map<K, V> extends Iterable<[K, V]> {
  /** Returns the number of mappings. */
  size(): number;
  /** Returns `true` if this map has no mappings. */
  isEmpty(): boolean;
  /**
   * Returns `true` if this map has a mapping for `key`, even if it maps to `null`.
   * @throws {@link NullPointerException} if `key` is null and this map rejects null keys
   */
  containsKey(key: unknown): boolean;
  /** Returns `true` if one or more keys map to a value equal to `value`. Usually O(n). */
  containsValue(value: unknown): boolean;
  /**
   * Returns the value mapped to `key`, or `null` if there is none (or the key maps to `null`).
   * @throws {@link NullPointerException} if `key` is null and this map rejects null keys
   */
  get(key: unknown): V | null;
  /**
   * Maps `key` to `value`, replacing any previous value.
   * @returns the previous value, or `null` if there was no mapping
   * @throws {@link UnsupportedOperationException} if this map is unmodifiable
   * @throws {@link NullPointerException} if `key` or `value` is null and this map rejects it
   * @throws {@link IllegalArgumentException} if `key` is outside the range of a sorted map view
   */
  put(key: K, value: V): V | null;
  /**
   * Removes the mapping for `key`, if present.
   * @returns the removed value, or `null` if there was no mapping
   * @throws {@link UnsupportedOperationException} if this map is unmodifiable
   */
  remove(key: unknown): V | null;
  /**
   * Removes the mapping for `key` only if it is currently mapped to a value equal to `value`.
   * @returns `true` if the mapping was removed
   * @throws {@link UnsupportedOperationException} if this map is unmodifiable
   */
  remove(key: unknown, value: unknown): boolean;
  /**
   * Copies every mapping of `m` into this map, as `put` would.
   * @throws {@link NullPointerException} if `m` is null
   * @throws {@link UnsupportedOperationException} if this map is unmodifiable
   */
  putAll(m: Map<K, V>): void;
  /**
   * Removes all mappings.
   * @throws {@link UnsupportedOperationException} if this map is unmodifiable
   */
  clear(): void;
  /**
   * Returns a live view of the keys. Removing from it removes the mapping; it does not support `add`
   * (`UnsupportedOperationException`).
   */
  keySet(): Set<K>;
  /**
   * Returns a live view of the values. Removing from it removes the mapping; it does not support `add`
   * (`UnsupportedOperationException`).
   */
  values(): Collection<V>;
  /**
   * Returns a live view of the mappings. Its entries are live (`setValue` writes through), removing from it removes
   * the mapping, and it does not support `add` (`UnsupportedOperationException`).
   */
  entrySet(): Set<MapEntry<K, V>>;
  /** Returns `true` if `o` is a map with the same mappings, whatever its class. */
  equals(o: unknown): boolean;
  /** Returns the sum over all entries of `hash(key) ^ hash(value)`, in 32-bit arithmetic. */
  hashCode(): number;
  /** Returns the mappings in iteration order as `{k1=v1, k2=v2}`; a key or value that is this map prints as `(this Map)`. */
  toString(): string;

  /** Returns the value mapped to `key`, or `defaultValue` if there is no mapping. A key mapped to `null` returns `null`. */
  getOrDefault(key: unknown, defaultValue: V): V;
  /** Returns the value mapped to `key`, or `defaultValue` (here possibly `null`) if there is no mapping. */
  getOrDefault(key: unknown, defaultValue: V | null): V | null;
  /**
   * Calls `action` for each mapping, in iteration order.
   * @throws {@link NullPointerException} if `action` is null
   * @throws {@link ConcurrentModificationException} if `action` structurally modifies this map
   */
  forEach(action: (key: K, value: V) => void): void;
  /**
   * Replaces each value with `fn(key, value)`, in iteration order.
   * @throws {@link NullPointerException} if `fn` is null, or it returns null and this map rejects null values
   * @throws {@link UnsupportedOperationException} if this map is unmodifiable
   */
  replaceAll(fn: (key: K, value: V) => V): void;
  /**
   * Maps `key` to `value` if it is absent or mapped to `null`.
   * @returns the current value if it was non-null (and nothing changed), otherwise `null`
   * @throws {@link UnsupportedOperationException} if this map is unmodifiable
   */
  putIfAbsent(key: K, value: V): V | null;
  /**
   * Replaces the value for `key` only if `key` currently has a mapping (even to `null`).
   * @returns the previous value, or `null` if there was no mapping
   */
  replace(key: K, value: V): V | null;
  /**
   * Replaces the value for `key` with `newValue` only if it is currently mapped to a value equal to `oldValue`.
   * @returns `true` if the value was replaced
   */
  replace(key: K, oldValue: V, newValue: V): boolean;
  /**
   * If `key` is absent or mapped to `null`, stores `fn(key)` unless that is `null`/`undefined` (then nothing is stored).
   * @returns the existing non-null value, the newly stored value, or `null`
   * @throws {@link NullPointerException} if `fn` is null
   * @throws {@link ConcurrentModificationException} if `fn` structurally modifies this map (hashed and tree maps detect it)
   */
  computeIfAbsent(key: K, fn: (key: K) => V | null | undefined): V | null;
  /**
   * If `key` has a non-null value, replaces it with `fn(key, value)`; a `null`/`undefined` result removes the mapping.
   * @returns the new value, or `null` if the key was absent or has been removed
   * @throws {@link NullPointerException} if `fn` is null
   * @throws {@link ConcurrentModificationException} if `fn` structurally modifies this map (hashed and tree maps detect it)
   */
  computeIfPresent(key: K, fn: (key: K, value: V) => V | null | undefined): V | null;
  /**
   * Stores `fn(key, current)`, where `current` is the mapped value or `null`; a `null`/`undefined` result removes the
   * mapping (or leaves the key absent).
   * @returns the new value, or `null` if there is now no mapping
   * @throws {@link NullPointerException} if `fn` is null
   * @throws {@link ConcurrentModificationException} if `fn` structurally modifies this map (hashed and tree maps detect it)
   */
  compute(key: K, fn: (key: K, value: V | null) => V | null | undefined): V | null;
  /**
   * If `key` is absent or mapped to `null`, maps it to `value`; otherwise stores `fn(oldValue, value)`, and a
   * `null`/`undefined` result removes the mapping. `merge(k, 1, (a, b) => a + b)` counts occurrences.
   * @returns the new value, or `null` if the mapping was removed
   * @throws {@link NullPointerException} if `value` or `fn` is null
   * @throws {@link ConcurrentModificationException} if `fn` structurally modifies this map (hashed and tree maps detect it)
   */
  merge(key: K, value: V, fn: (oldValue: V, value: V) => V | null | undefined): V | null;
}

/**
 * A map with a defined encounter order and two accessible ends (`LinkedHashMap`, `TreeMap`). The first/last entry
 * methods return immutable snapshots, or `null` when the map is empty.
 */
export interface SequencedMap<K, V> extends Map<K, V> {
  /** Returns a live reverse-ordered view: changes through either side are visible in the other. */
  reversed(): SequencedMap<K, V>;
  /** Returns the first entry as an immutable snapshot, or `null` if this map is empty. */
  firstEntry(): MapEntry<K, V> | null;
  /** Returns the last entry as an immutable snapshot, or `null` if this map is empty. */
  lastEntry(): MapEntry<K, V> | null;
  /** Removes and returns the first entry as an immutable snapshot, or `null` if this map is empty. */
  pollFirstEntry(): MapEntry<K, V> | null;
  /** Removes and returns the last entry as an immutable snapshot, or `null` if this map is empty. */
  pollLastEntry(): MapEntry<K, V> | null;
  /**
   * Maps `key` to `value` and moves the mapping to the front.
   * @returns the previous value, or `null` if there was no mapping
   * @throws {@link UnsupportedOperationException} if this map is sorted or unmodifiable
   */
  putFirst(key: K, value: V): V | null;
  /**
   * Maps `key` to `value` and moves the mapping to the end.
   * @returns the previous value, or `null` if there was no mapping
   * @throws {@link UnsupportedOperationException} if this map is sorted or unmodifiable
   */
  putLast(key: K, value: V): V | null;
  /** Returns a live, sequenced view of the keys. */
  sequencedKeySet(): SequencedSet<K>;
  /** Returns a live, sequenced view of the values. */
  sequencedValues(): SequencedCollection<V>;
  /** Returns a live, sequenced view of the mappings. */
  sequencedEntrySet(): SequencedSet<MapEntry<K, V>>;
}

/**
 * A map whose keys are kept in ascending order by natural ordering or a comparator, which alone decides key
 * equality. `putFirst`/`putLast` throw `UnsupportedOperationException`. With natural ordering, `null` keys throw
 * `NullPointerException` and keys with no natural order throw `ClassCastException`. Range views are live and reject
 * putting a key outside their range with `IllegalArgumentException`.
 */
export interface SortedMap<K, V> extends SequencedMap<K, V> {
  /** Returns the comparator that orders the keys, or `null` when natural ordering is used. */
  comparator(): Comparator<K> | null;
  /**
   * Returns the lowest key.
   * @throws {@link NoSuchElementException} if this map is empty
   */
  firstKey(): K;
  /**
   * Returns the highest key.
   * @throws {@link NoSuchElementException} if this map is empty
   */
  lastKey(): K;
  /**
   * Returns a live view of the mappings whose keys are strictly less than `toKey`.
   * @throws {@link IllegalArgumentException} if this map is itself a range view and `toKey` is outside its range
   * @throws {@link NullPointerException} if `toKey` is null and this map rejects null keys
   */
  headMap(toKey: K): SortedMap<K, V>;
  /**
   * Returns a live view of the mappings whose keys are greater than or equal to `fromKey`.
   * @throws {@link IllegalArgumentException} if this map is itself a range view and `fromKey` is outside its range
   * @throws {@link NullPointerException} if `fromKey` is null and this map rejects null keys
   */
  tailMap(fromKey: K): SortedMap<K, V>;
  /**
   * Returns a live view of the mappings with keys from `fromKey` (inclusive) to `toKey` (exclusive).
   * @throws {@link IllegalArgumentException} if `fromKey` is greater than `toKey`, or either is outside this view's range
   * @throws {@link NullPointerException} if either bound is null and this map rejects null keys
   */
  subMap(fromKey: K, toKey: K): SortedMap<K, V>;
  /** Returns a live descending view: changes through either side are visible in the other. */
  reversed(): SortedMap<K, V>;
}

/**
 * A sorted map with navigation methods that return the closest match for a given key (each `null` when there is
 * none) and range views with explicit inclusive flags. Entries returned by navigation methods are immutable
 * snapshots. A `null` argument throws `NullPointerException` when the map rejects null keys.
 */
export interface NavigableMap<K, V> extends SortedMap<K, V> {
  /** Returns the entry with the greatest key strictly less than `key` (an immutable snapshot), or `null`. */
  lowerEntry(key: K): MapEntry<K, V> | null;
  /** Returns the greatest key strictly less than `key`, or `null`. */
  lowerKey(key: K): K | null;
  /** Returns the entry with the greatest key less than or equal to `key` (an immutable snapshot), or `null`. */
  floorEntry(key: K): MapEntry<K, V> | null;
  /** Returns the greatest key less than or equal to `key`, or `null`. */
  floorKey(key: K): K | null;
  /** Returns the entry with the least key greater than or equal to `key` (an immutable snapshot), or `null`. */
  ceilingEntry(key: K): MapEntry<K, V> | null;
  /** Returns the least key greater than or equal to `key`, or `null`. */
  ceilingKey(key: K): K | null;
  /** Returns the entry with the least key strictly greater than `key` (an immutable snapshot), or `null`. */
  higherEntry(key: K): MapEntry<K, V> | null;
  /** Returns the least key strictly greater than `key`, or `null`. */
  higherKey(key: K): K | null;
  /** Returns a live view of this map in descending key order: changes through either side are visible in the other. */
  descendingMap(): NavigableMap<K, V>;
  /** Returns a live, ascending view of the keys. Removing from it removes the mapping; `add` is not supported. */
  navigableKeySet(): NavigableSet<K>;
  /** Returns a live, descending view of the keys. Removing from it removes the mapping; `add` is not supported. */
  descendingKeySet(): NavigableSet<K>;
  /**
   * Returns a live view of the mappings whose keys are strictly less than `toKey`; same as `headMap(toKey, false)`.
   * @throws {@link IllegalArgumentException} if this map is itself a range view and `toKey` is outside its range
   */
  headMap(toKey: K): SortedMap<K, V>;
  /**
   * Returns a live view of the mappings whose keys are less than (or, if `inclusive`, equal to) `toKey`.
   * @throws {@link IllegalArgumentException} if this map is itself a range view and `toKey` is outside its range
   */
  headMap(toKey: K, inclusive: boolean): NavigableMap<K, V>;
  /**
   * Returns a live view of the mappings whose keys are greater than or equal to `fromKey`; same as
   * `tailMap(fromKey, true)`.
   * @throws {@link IllegalArgumentException} if this map is itself a range view and `fromKey` is outside its range
   */
  tailMap(fromKey: K): SortedMap<K, V>;
  /**
   * Returns a live view of the mappings whose keys are greater than (or, if `inclusive`, equal to) `fromKey`.
   * @throws {@link IllegalArgumentException} if this map is itself a range view and `fromKey` is outside its range
   */
  tailMap(fromKey: K, inclusive: boolean): NavigableMap<K, V>;
  /**
   * Returns a live view of the mappings with keys from `fromKey` (inclusive) to `toKey` (exclusive); same as
   * `subMap(fromKey, true, toKey, false)`.
   * @throws {@link IllegalArgumentException} if `fromKey` is greater than `toKey`, or either is outside this view's range
   */
  subMap(fromKey: K, toKey: K): SortedMap<K, V>;
  /**
   * Returns a live view of the mappings with keys between `fromKey` and `toKey`, each end included when its flag is set.
   * @throws {@link IllegalArgumentException} if `fromKey` is greater than `toKey`, or either is outside this view's range
   */
  subMap(fromKey: K, fromInclusive: boolean, toKey: K, toInclusive: boolean): NavigableMap<K, V>;
  /** Returns a live descending view; same as `descendingMap()`. */
  reversed(): NavigableMap<K, V>;
}
