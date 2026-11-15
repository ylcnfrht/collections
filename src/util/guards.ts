import type { List } from '../interfaces/List';
import type { Map, MapEntry } from '../interfaces/Map';
import type { Set } from '../interfaces/Set';

// TS interfaces vanish at runtime, so set and random-access checks use brands.
export const SET_BRAND: unique symbol = Symbol.for('@ylcnfrht/typescript-collection-framework.Set');
/**
 * Brand key of the {@link RandomAccess} marker: a list whose `[RANDOM_ACCESS]` property is `true` has O(1)
 * `get(index)`. A registered symbol (`Symbol.for`), so separate copies of the library agree on it.
 */
export const RANDOM_ACCESS: unique symbol = Symbol.for('@ylcnfrht/typescript-collection-framework.RandomAccess');

/**
 * Marker for lists with fast (O(1)) positional access, such as `ArrayList`, `Vector` and `List.of` lists.
 * Generic algorithms (e.g. `Collections.binarySearch`, `Collections.reverse`) check it with {@link isRandomAccess}
 * and use `get`/`set` loops instead of iterators. A custom list opts in by defining `[RANDOM_ACCESS]` as `true`.
 */
export interface RandomAccess {
  /** Always `true`; its presence is the marker. */
  readonly [RANDOM_ACCESS]: true;
}

export function isList(o: unknown): o is List<unknown> {
  const l = o as List<unknown>;
  return typeof l?.listIterator === 'function' && typeof l.get === 'function' && typeof l.iterator === 'function';
}

export function isSet(o: unknown): o is Set<unknown> {
  return (o as { [SET_BRAND]?: boolean })?.[SET_BRAND] === true;
}

export function isMap(o: unknown): o is Map<unknown, unknown> {
  return typeof (o as Map<unknown, unknown>)?.entrySet === 'function' && typeof (o as Map<unknown, unknown>).containsKey === 'function';
}

export function isEntry(o: unknown): o is MapEntry<unknown, unknown> {
  return typeof (o as MapEntry<unknown, unknown>)?.getKey === 'function' && typeof (o as MapEntry<unknown, unknown>).getValue === 'function';
}

/** Returns `true` when `o` carries the {@link RandomAccess} marker (its `[RANDOM_ACCESS]` property is `true`). */
export function isRandomAccess(o: unknown): o is RandomAccess {
  return (o as Partial<RandomAccess>)?.[RANDOM_ACCESS] === true;
}
