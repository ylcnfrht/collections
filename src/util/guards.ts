import type { List } from '../interfaces/List';
import type { Map, MapEntry } from '../interfaces/Map';
import type { Set } from '../interfaces/Set';

// TS interfaces vanish at runtime, so set and random-access checks use brands.
export const SET_BRAND: unique symbol = Symbol.for('@nodestd/collections.Set');
export const RANDOM_ACCESS: unique symbol = Symbol.for('@nodestd/collections.RandomAccess');

/** Marker for lists with O(1) get(index), like RandomAccess. */
export interface RandomAccess {
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

export function isRandomAccess(o: unknown): o is RandomAccess {
  return (o as Partial<RandomAccess>)?.[RANDOM_ACCESS] === true;
}
