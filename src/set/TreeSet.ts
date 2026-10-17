import { NavigableKeySet, TreeMap } from '../map/TreeMap';
import { requireCollection } from '../abstract/AbstractSet';
import { Collection } from '../interfaces/Collection';
import { NavigableSet } from '../interfaces/Set';
import { Comparator } from '../util/Comparator';
import { isSet } from '../util/guards';

// value stored for every element in the backing map
const PRESENT = true;

/**
 * Sorted set backed by a TreeMap (red-black tree): O(log n) add/remove/contains/navigation.
 * Ordered by the comparator, or natural ordering (naturalCompare) when null; the comparator defines equality.
 * Inherits AbstractSet through NavigableKeySet, the key-set machinery it shares with TreeMap.
 */
export class TreeSet<E> extends NavigableKeySet<E> implements NavigableSet<E> {
  /**
   * new TreeSet(), new TreeSet(comparator), or a copy of a collection.
   * Copying a SortedSet (anything with a comparator() method) keeps the source's comparator and order,
   * like the TreeSet(SortedSet) constructor; any other collection is ordered naturally. The type system
   * cannot tell the two overloads apart, so the choice is made at run time.
   * @throws IllegalArgumentException if source is neither a comparator nor a collection
   */
  constructor(source?: Comparator<E> | Collection<E> | null) {
    if (source != null && typeof source !== 'function') requireCollection(source, 'a Comparator or a Collection');
    super(new TreeMap<E, unknown>(comparatorOf(source)), PRESENT);
    if (source != null && typeof source !== 'function') this.addAll(source);
  }

  static of<E>(...elements: E[]): TreeSet<E> {
    const s = new TreeSet<E>();
    for (const e of elements) s.add(e);
    return s;
  }

  /** Shallow copy with the same comparator. */
  clone(): TreeSet<E> {
    const s = new TreeSet<E>(this.comparator());
    for (const e of this) s.add(e);
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
