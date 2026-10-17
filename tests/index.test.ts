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

  it.each([
    'emptySortedSet', 'emptyNavigableSet', 'emptySortedMap', 'emptyNavigableMap', 'emptyIterator', 'emptyListIterator',
    'emptyEnumeration', 'unmodifiableSequencedSet', 'unmodifiableSequencedMap', 'newSetFromMap', 'newSequencedSetFromMap',
    'asLifoQueue', 'enumeration', 'list', 'checkedCollection', 'checkedList', 'checkedSet', 'checkedSortedSet',
    'checkedNavigableSet', 'checkedQueue', 'checkedMap', 'checkedSortedMap', 'checkedNavigableMap', 'synchronizedCollection',
    'synchronizedList', 'synchronizedSet', 'synchronizedSortedSet', 'synchronizedNavigableSet', 'synchronizedMap',
    'synchronizedSortedMap', 'synchronizedNavigableMap',
  ])('Collections.%s is a function', (name) => expect(typeof (Collections as Record<string, unknown>)[name]).toBe('function'));

  it('exposes the newer statics', () => {
    expect(Collections.EMPTY_LIST).toBe(Collections.emptyList());
    expect(Collections.EMPTY_SET).toBe(Collections.emptySet());
    expect(Collections.EMPTY_MAP).toBe(Collections.emptyMap());
    expect(List.ofLazy(2, (i) => i).get(1)).toBe(1);
    expect(Set.ofLazy(Set.of(1, 2), (x) => x > 1).contains(2)).toBe(true);
    expect(Map.ofLazy(Set.of('a'), (k) => k + k).get('a')).toBe('aa');
    expect(Map.Entry.copyOf(Map.entry('a', 1)).getValue()).toBe(1);
    expect(typeof Map.Entry.comparingByKey()).toBe('function');
    for (const f of ['comparingInt', 'comparingLong', 'comparingDouble', 'thenComparingBy', 'thenComparingInt', 'max', 'min']) {
      expect(typeof (Comparator as Record<string, unknown>)[f]).toBe('function');
    }
    for (const f of ['requireNonNullElse', 'requireNonNullElseGet', 'checkFromToIndex', 'checkFromIndexSize', 'compare', 'deepEquals', 'toIdentityString']) {
      expect(typeof (api.Objects as Record<string, unknown>)[f]).toBe('function');
    }
    expect((api as Record<string, unknown>).delegate).toBeUndefined();
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
