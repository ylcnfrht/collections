import { NavigableKeySet, TreeMap } from '../map/TreeMap';
import { requireCollection } from '../abstract/AbstractSet';
import { Collection } from '../interfaces/Collection';
import { NavigableSet } from '../interfaces/Set';
import { Comparator } from '../util/Comparator';
import { isSet } from '../util/guards';

// value stored for every element in the backing map
const PRESENT = true;

/**
 * A sorted {@link NavigableSet} backed by a {@link TreeMap} (a red-black tree). Elements are ordered by the comparator
 * given to the constructor, or naturally (numbers, strings, bigints, booleans, `Date`s, objects with `compareTo`) when
 * there is none; the ordering, not `equals()`, decides which elements are equal.
 *
 * `add`, `remove`, `contains` and the navigation methods (`floor`, `ceiling`, `higher`, `lower`) run in O(log n);
 * iteration is in ascending order. Under natural ordering `null`/`undefined` elements throw
 * {@link NullPointerException} and elements of mixed types throw {@link ClassCastException}. Range and descending
 * views are live; iterators are fail-fast. It shares its key-set machinery with `TreeMap.navigableKeySet()`.
 */
export class TreeSet<E> extends NavigableKeySet<E> implements NavigableSet<E> {
  /**
   * Creates an empty set, an empty set ordered by a comparator, or a copy of a collection. With no argument (or
   * `null`) elements are ordered naturally. Copying a sorted set (a {@link Set} with a `comparator()` method) keeps
   * the source's comparator and order; any other collection is ordered naturally. The type system cannot tell the two
   * source kinds apart, so the choice is made at run time.
   * @param source - a comparator, a collection to copy, or nothing for natural ordering
   * @throws {@link IllegalArgumentException} if `source` is neither a comparator nor a collection
   * @throws {@link NullPointerException} / {@link ClassCastException} if a copied element cannot be compared
   */
  constructor(source?: Comparator<E> | Collection<E> | null) {
    if (source != null && typeof source !== 'function') requireCollection(source, 'a Comparator or a Collection');
    super(new TreeMap<E, unknown>(comparatorOf(source)), PRESENT);
    if (source != null && typeof source !== 'function') this.addAll(source);
  }

  /** Returns a new naturally ordered set of the given elements; duplicates are dropped. */
  static of<E>(...elements: E[]): TreeSet<E> {
    const s = new TreeSet<E>();
    for (const e of elements) s.add(e);
    return s;
  }

  /** Shallow copy of the same runtime class (subclass fields included) with the same comparator. */
  clone(): TreeSet<E> {
    const s = this.cloneShell();
    (s as unknown as { m: TreeMap<E, unknown> }).m = (this.m as TreeMap<E, unknown>).clone();
    return s;
  }
}

function comparatorOf<E>(source: Comparator<E> | Collection<E> | null | undefined): Comparator<E> | null {
  if (typeof source === 'function') return source;
  if (isSet(source)) {
    const c = (source as { comparator?: unknown }).comparator;
    if (typeof c === 'function') return c.call(source) ?? null;
  }
  return null;
}
