// Smoke test of the public entry point: everything a user imports resolves and works together.
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { inspect } from 'util';
import * as api from '../src';
import { ArrayList, Collections, Comparator, HashMap, LinkedList, List, Map, Set, TreeMap, TreeSet } from '../src';

describe('util.inspect (console.log) prints toString()', () => {
  it('collections, maps, entries, optionals and statistics', () => {
    const m = api.HashMap.of(['a', 1]);
    const shown = [api.ArrayList.of<unknown>(1, 'x'), m, m.entrySet().iterator().next(), api.Optional.of(2), api.IntStream.of(1, 3).summaryStatistics(), [api.TreeSet.of(2, 1)]];
    expect(shown.map((v) => inspect(v))).toEqual(['[1, x]', '{a=1}', 'a=1', 'Optional[2]', 'IntSummaryStatistics{count=2, sum=4, min=1, average=2.000000, max=3}', '[ [1, 2] ]']);
  });
});

describe('[Symbol.iterator]() typing', () => {
  it('is declared as IterableIterator, never Generator (most are plain iterators without return/throw)', () => {
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(join(dir, d.name)) : [join(dir, d.name)]));
    const offenders = files(join(__dirname, '..', 'src')).filter((f) => /\bGenerator</.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});

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

describe('set clone() keeps the runtime subclass, as map clone() does', () => {
  class TaggedHash<E> extends api.HashSet<E> {
    tag = 'h';
  }
  class TaggedLinked<E> extends api.LinkedHashSet<E> {
    tag = 'l';
  }
  class TaggedTree<E> extends api.TreeSet<E> {
    tag = 't';
  }
  it.each([
    ['HashSet', () => new TaggedHash<unknown>()],
    ['LinkedHashSet', () => new TaggedLinked<unknown>()],
    ['TreeSet', () => new TaggedTree<unknown>(api.Comparator.reverseOrder<any>())],
  ] as [string, () => any][])('%s', (_name, make) => {
    const s = make();
    for (const e of [3, 1, 2, 70000, 'x'].filter((e) => !(s instanceof api.TreeSet) || typeof e === 'number')) s.add(e);
    const c = s.clone();
    expect([c.constructor, c.tag, c.toString(), c.equals(s)]).toEqual([s.constructor, s.tag, s.toString(), true]);
    c.add(99);
    c.remove(3);
    expect([s.contains(99), s.contains(3), c.contains(99), c.contains(3)]).toEqual([false, true, true, false]);
    if (s instanceof api.TreeSet) expect((c as any).comparator()).toBe((s as any).comparator());
  });
});

describe('null defaults are typed (compile-time checks; they run too)', () => {
  it('orElse/orElseGet/getOrDefault accept null and keep assignability to wider types', () => {
    const a: string | null = api.Optional.ofNullable<string>(null).orElse(null);
    const b: number | null = api.OptionalInt.empty().orElse(null);
    const c: string | null = api.Optional.empty<string>().orElseGet(() => null);
    const m = new api.HashMap<string, number>();
    const d: number | null = m.getOrDefault('k', null);
    const e: number = new api.TreeMap<string, number>().getOrDefault('k', 0);
    // @ts-expect-error a default of the wrong type is still rejected
    m.getOrDefault('k', 'x');
    const wide: api.Map<unknown, unknown> = new api.TreeMap<string, number>();
    const wideOpt: api.Optional<unknown> = api.Optional.of('x');
    expect([a, b, c, d, e, wide.size(), wideOpt.isPresent()]).toEqual([null, null, null, null, 0, 0, true]);
  });
});
