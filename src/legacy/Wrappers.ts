import { ClassCastException } from '../exceptions';
import { ImmutableList } from '../immutable/ImmutableCollections';
import { Collection } from '../interfaces/Collection';
import { Iterator, ListIterator } from '../interfaces/Iterator';
import { List } from '../interfaces/List';
import { Map, MapEntry, NavigableMap, SortedMap } from '../interfaces/Map';
import { Queue } from '../interfaces/Queue';
import { NavigableSet, Set, SortedSet } from '../interfaces/Set';
import { identityHashCode, requireNonNull } from '../util/Objects';

type Methods = Record<PropertyKey, unknown>;

/**
 * View that forwards every property to target (methods bound to it), except the ones in
 * overrides(view). `instanceof`, brands and getters all read through, so the view passes for the target's
 * type. Methods the target lacks stay missing.
 */
export function delegate<T extends object>(target: T, overrides: (view: T) => Methods): T {
  const bound = new globalThis.Map<PropertyKey, unknown>();
  let own: Methods = {};
  const view = new Proxy(target, {
    get(t, p) {
      if (Object.prototype.hasOwnProperty.call(own, p)) return own[p];
      const v = Reflect.get(t, p);
      if (typeof v !== 'function') return v;
      let b = bound.get(p);
      if (b === undefined) bound.set(p, (b = v.bind(t)));
      return b;
    },
  });
  own = overrides(view);
  return view;
}

/** equals/hashCode by identity, for wrappers that do not pass them through (plain Collection, Queue as LIFO). */
export function identityEquality(view: object): Methods {
  return { equals: (o: unknown) => o === view, hashCode: () => identityHashCode(view) };
}

// ---- checked wrappers

/** Runtime element check standing in for a Class token, e.g. `(x): x is string => typeof x === 'string'`. */
export type TypeCheck = (o: unknown) => boolean;

function describe(o: unknown): string {
  return typeof o === 'object' ? (o as object).constructor?.name ?? 'Object' : typeof o;
}

function checker(type: TypeCheck, what: string): <T>(o: T) => T {
  requireNonNull(type);
  return (o) => {
    // null passes: the backing collection decides whether it permits nulls
    if (o != null && !type(o)) throw new ClassCastException(`Attempt to insert ${describe(o)} ${what} that fails the type check`);
    return o;
  };
}

/** Checks every element first, so a bad one leaves the target untouched. */
function checkedCopy<E>(c: Collection<E>, check: <T>(o: T) => T): Collection<E> {
  const a = requireNonNull(c).toArray();
  for (let i = 0; i < a.length; i++) check(a[i]);
  return new ImmutableList(a, false);
}

const VIEW_METHODS = ['subList', 'reversed', 'headSet', 'tailSet', 'subSet', 'descendingSet'];

/**
 * Checks every way an element can enter: add/addAll (also positional), addFirst/addLast, offer*,
 * push, set, replaceAll, listIterator add/set, and the same on subList/reversed/sub-set views.
 */
function checkedColl<C extends Collection<E>, E>(c: C, check: <T>(o: T) => T, identity: boolean): C {
  requireNonNull(c);
  const t = c as unknown as Methods & Record<string, (...a: unknown[]) => unknown>;
  return delegate(c, (view) => {
    const o: Methods = identity ? identityEquality(view) : {};
    const has = (n: string) => typeof t[n] === 'function';
    // the element is the last argument of add(e), add(i, e), set(i, e) and the one-argument inserters
    for (const n of ['add', 'addFirst', 'addLast', 'offer', 'offerFirst', 'offerLast', 'push', 'set']) {
      if (has(n)) o[n] = (...a: unknown[]) => (check(a[a.length - 1]), t[n](...a));
    }
    if (has('addAll')) {
      o.addAll = (...a: unknown[]) => {
        a[a.length - 1] = checkedCopy(a[a.length - 1] as Collection<E>, check);
        return t.addAll(...a);
      };
    }
    if (has('replaceAll')) o.replaceAll = (op: (e: E) => E) => (requireNonNull(op), t.replaceAll((e: E) => check(op(e))));
    if (has('listIterator')) o.listIterator = (...a: unknown[]) => checkedIterator(t.listIterator(...a) as ListIterator<E>, check);
    for (const n of VIEW_METHODS) {
      if (has(n)) o[n] = (...a: unknown[]) => checkedColl(t[n](...a) as Collection<E>, check, false);
    }
    return o;
  });
}

function checkedIterator<E>(it: ListIterator<E>, check: <T>(o: T) => T): ListIterator<E> {
  return delegate(it, () => ({ add: (e: E) => it.add(check(e)), set: (e: E) => it.set(check(e)) }));
}

/** View that throws ClassCastException when an element failing type is inserted. equals/hashCode are by identity. */
export function checkedCollection<E>(c: Collection<E>, type: TypeCheck): Collection<E> {
  return checkedColl(c, checker(type, 'element'), true);
}
export function checkedQueue<E>(q: Queue<E>, type: TypeCheck): Queue<E> {
  return checkedColl(q, checker(type, 'element'), false);
}
export function checkedList<E>(l: List<E>, type: TypeCheck): List<E> {
  return checkedColl(l, checker(type, 'element'), false);
}
export function checkedSet<E>(s: Set<E>, type: TypeCheck): Set<E> {
  return checkedColl(s, checker(type, 'element'), false);
}
export function checkedSortedSet<E>(s: SortedSet<E>, type: TypeCheck): SortedSet<E> {
  return checkedColl(s, checker(type, 'element'), false);
}
export function checkedNavigableSet<E>(s: NavigableSet<E>, type: TypeCheck): NavigableSet<E> {
  return checkedColl(s, checker(type, 'element'), false);
}

const MAP_VIEW_METHODS = ['headMap', 'tailMap', 'subMap', 'descendingMap', 'reversed'];

/**
 * Checks keys and values on put/putFirst/putLast/putIfAbsent/replace/putAll, results of
 * replaceAll, compute, computeIfAbsent, computeIfPresent and merge, entry.setValue through entrySet()/sequencedEntrySet(), and sub-map views.
 */
function checkedMapView<M extends Map<K, V>, K, V>(m: M, ck: <T>(o: T) => T, cv: <T>(o: T) => T): M {
  requireNonNull(m);
  const t = m as unknown as Record<string, (...a: unknown[]) => unknown>;
  return delegate(m, () => {
    const o: Methods = {};
    const has = (n: string) => typeof t[n] === 'function';
    // key first, value last: put(k, v), putIfAbsent(k, v), replace(k, v), replace(k, old, v)
    for (const n of ['put', 'putFirst', 'putLast', 'putIfAbsent', 'replace']) {
      if (has(n)) o[n] = (...a: unknown[]) => (ck(a[0]), cv(a[a.length - 1]), t[n](...a));
    }
    o.putAll = (src: Map<K, V>) => {
      for (const e of requireNonNull(src).entrySet().toArray()) {
        ck(e.getKey());
        cv(e.getValue());
      }
      return m.putAll(src);
    };
    o.replaceAll = (fn: (k: K, v: V) => V) => (requireNonNull(fn), m.replaceAll((k, v) => cv(fn(k, v))));
    o.computeIfAbsent = (k: K, fn: (k: K) => V | null | undefined) => (requireNonNull(fn), m.computeIfAbsent(k, (x) => cv(fn(ck(x)))));
    o.computeIfPresent = (k: K, fn: (k: K, v: V) => V | null | undefined) =>
      (requireNonNull(fn), m.computeIfPresent(k, (x, v) => cv(fn(ck(x), v))));
    o.compute = (k: K, fn: (k: K, v: V | null) => V | null | undefined) => (requireNonNull(fn), m.compute(k, (x, v) => cv(fn(ck(x), v))));
    o.merge = (k: K, v: V, fn: (a: V, b: V) => V | null | undefined) => (ck(k), cv(v), requireNonNull(fn), m.merge(k, v, (a, b) => cv(fn(a, b))));
    for (const n of ['entrySet', 'sequencedEntrySet']) if (has(n)) o[n] = () => checkedEntrySet(t[n]() as Set<MapEntry<K, V>>, cv);
    for (const n of MAP_VIEW_METHODS) if (has(n)) o[n] = (...a: unknown[]) => checkedMapView(t[n](...a) as Map<K, V>, ck, cv);
    return o;
  });
}

function checkedEntry<K, V>(e: MapEntry<K, V>, cv: <T>(o: T) => T): MapEntry<K, V> {
  return delegate(e, () => ({ setValue: (v: V) => e.setValue(cv(v)) }));
}

function checkedEntrySet<K, V>(s: Set<MapEntry<K, V>>, cv: <T>(o: T) => T): Set<MapEntry<K, V>> {
  const wrap = (e: MapEntry<K, V>) => checkedEntry(e, cv);
  return delegate(s, () => ({
    iterator: (): Iterator<MapEntry<K, V>> => {
      const it = s.iterator();
      return delegate(it, () => ({ next: () => wrap(it.next()), forEachRemaining: (f: (e: MapEntry<K, V>) => void) => it.forEachRemaining((e) => f(wrap(e))) }));
    },
    *[Symbol.iterator]() {
      for (const e of s) yield wrap(e);
    },
    toArray: (...a: unknown[]) => {
      const es = s.toArray().map(wrap);
      return a.length > 0 ? new ImmutableList(es, false).toArray(a[0] as (n: number) => MapEntry<K, V>[]) : es;
    },
    forEach: (f: (e: MapEntry<K, V>) => void) => (requireNonNull(f), s.forEach((e) => f(wrap(e)))),
  }));
}

export function checkedMap<K, V>(m: Map<K, V>, keyType: TypeCheck, valueType: TypeCheck): Map<K, V> {
  return checkedMapView(m, checker(keyType, 'key'), checker(valueType, 'value'));
}
export function checkedSortedMap<K, V>(m: SortedMap<K, V>, keyType: TypeCheck, valueType: TypeCheck): SortedMap<K, V> {
  return checkedMapView(m, checker(keyType, 'key'), checker(valueType, 'value'));
}
export function checkedNavigableMap<K, V>(m: NavigableMap<K, V>, keyType: TypeCheck, valueType: TypeCheck): NavigableMap<K, V> {
  return checkedMapView(m, checker(keyType, 'key'), checker(valueType, 'value'));
}

// ---- synchronized wrappers
// JS runs one thread per realm, so there is nothing to lock: these are plain delegating views with their
// own identity. They exist so ported code keeps working.

/** Delegating view; equals/hashCode are by identity, as for the reference wrapper. */
export function synchronizedCollection<E>(c: Collection<E>): Collection<E> {
  return delegate(requireNonNull(c), identityEquality);
}
const passThrough = (): Methods => ({});
export function synchronizedList<E>(l: List<E>): List<E> {
  return delegate(requireNonNull(l), passThrough);
}
export function synchronizedSet<E>(s: Set<E>): Set<E> {
  return delegate(requireNonNull(s), passThrough);
}
export function synchronizedSortedSet<E>(s: SortedSet<E>): SortedSet<E> {
  return delegate(requireNonNull(s), passThrough);
}
export function synchronizedNavigableSet<E>(s: NavigableSet<E>): NavigableSet<E> {
  return delegate(requireNonNull(s), passThrough);
}
export function synchronizedMap<K, V>(m: Map<K, V>): Map<K, V> {
  return delegate(requireNonNull(m), passThrough);
}
export function synchronizedSortedMap<K, V>(m: SortedMap<K, V>): SortedMap<K, V> {
  return delegate(requireNonNull(m), passThrough);
}
export function synchronizedNavigableMap<K, V>(m: NavigableMap<K, V>): NavigableMap<K, V> {
  return delegate(requireNonNull(m), passThrough);
}
