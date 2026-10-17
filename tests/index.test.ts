// Smoke test of the public entry point: everything a user imports resolves and works together.
import * as api from '../src';
import { ArrayList, Collections, Comparator, HashMap, LinkedList, List, Map, Set, TreeMap, TreeSet } from '../src';

describe('public API', () => {
  it.each([
    'ArrayList', 'LinkedList', 'Vector', 'Stack', 'ArrayDeque', 'PriorityQueue', 'HashMap', 'LinkedHashMap', 'TreeMap',
    'IdentityHashMap', 'HashSet', 'LinkedHashSet', 'TreeSet', 'Collections', 'Comparator', 'Objects', 'List', 'Set', 'Map',
    'AbstractCollection', 'AbstractList', 'AbstractSequentialList', 'AbstractQueue', 'AbstractSet', 'AbstractMap',
    'SimpleEntry', 'SimpleImmutableEntry', 'RuntimeException', 'NoSuchElementException', 'IndexOutOfBoundsException',
    'ConcurrentModificationException', 'UnsupportedOperationException', 'IllegalArgumentException', 'IllegalStateException',
    'NullPointerException', 'ClassCastException', 'naturalCompare', 'RANDOM_ACCESS', 'isRandomAccess',
  ])('exports %s', (name) => expect((api as Record<string, unknown>)[name]).toBeDefined());

  it('does not leak internals', () => {
    for (const name of ['stableSort', 'SET_BRAND', 'HashNode', 'TreeNode', 'natCmp', 'uoe', 'ImmutableList']) {
      expect((api as Record<string, unknown>)[name]).toBeUndefined();
    }
  });

  it('collections interoperate', () => {
    const list = List.of(3, 1, 2);
    const sorted = new ArrayList(list);
    Collections.sort(sorted);
    expect(sorted.equals(new LinkedList(List.of(1, 2, 3)))).toBe(true);
    expect(new TreeSet(sorted).equals(Set.of(2, 3, 1))).toBe(true);
    const m = new HashMap<string, number>();
    m.put('a', 1);
    expect(new TreeMap(m).equals(Map.of('a', 1))).toBe(true);
    expect([...new TreeSet<string>(Comparator.reverseOrder())].length).toBe(0);
  });
});
