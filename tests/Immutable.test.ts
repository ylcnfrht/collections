import { SimpleImmutableEntry, SimpleEntry } from '../src/abstract/AbstractMap';
import { List, Map, Set } from '../src/immutable/ImmutableCollections';
import { ArrayList } from '../src/list/ArrayList';
import { LinkedList } from '../src/list/LinkedList';
import { HashMap } from '../src/map/HashMap';
import { HashSet } from '../src/set/HashSet';
import { TreeSet } from '../src/set/TreeSet';
import { isRandomAccess } from '../src/util/guards';
import { expectThrows, Point } from './helpers';

const UOE = 'UnsupportedOperationException';
const NPE = 'NullPointerException';
const IAE = 'IllegalArgumentException';
const IOOBE = 'IndexOutOfBoundsException';
const NSEE = 'NoSuchElementException';

type Call = [string, (x: any) => unknown];

// each mutator once with a "changing" argument and once as a no-op; both must throw
const collectionMutators: Call[] = [
  ['add', (c) => c.add(9)],
  ['add existing', (c) => c.add(1)],
  ['addAll', (c) => c.addAll(ArrayList.of(9))],
  ['addAll empty', (c) => c.addAll(new ArrayList())],
  ['remove', (c) => c.remove(1)],
  ['remove absent', (c) => c.remove(42)],
  ['removeIf', (c) => c.removeIf(() => true)],
  ['removeIf none', (c) => c.removeIf(() => false)],
  ['retainAll', (c) => c.retainAll(new ArrayList())],
  ['retainAll all', (c) => c.retainAll(ArrayList.of(1, 2, 3))],
  ['removeAll', (c) => c.removeAll(ArrayList.of(1))],
  ['removeAll none', (c) => c.removeAll(new ArrayList())],
  ['clear', (c) => c.clear()],
];

const listMutators: Call[] = [
  ...collectionMutators,
  ['add(i, e)', (l) => l.add(0, 9)],
  ['addAll(i, c)', (l) => l.addAll(0, ArrayList.of(9))],
  ['addAll(i, empty)', (l) => l.addAll(0, new ArrayList())],
  ['set', (l) => l.set(0, 9)],
  ['set same', (l) => l.set(0, l.get(0))],
  ['removeAt', (l) => l.removeAt(0)],
  ['replaceAll', (l) => l.replaceAll((x: unknown) => x)],
  ['sort', (l) => l.sort()],
  ['sort comparator', (l) => l.sort((a: number, b: number) => a - b)],
  ['addFirst', (l) => l.addFirst(9)],
  ['addLast', (l) => l.addLast(9)],
  ['removeFirst', (l) => l.removeFirst()],
  ['removeLast', (l) => l.removeLast()],
  ['removeRange', (l) => l.removeRange(0, 0)],
  ['iterator.remove', (l) => {
    const it = l.iterator();
    it.next();
    it.remove();
  }],
  ['listIterator.set', (l) => {
    const it = l.listIterator();
    it.next();
    it.set(9);
  }],
  ['listIterator.add', (l) => l.listIterator().add(9)],
  ['listIterator.remove', (l) => {
    const it = l.listIterator(1);
    it.previous();
    it.remove();
  }],
];

const mapMutators: Call[] = [
  ['put', (m) => m.put('z', 9)],
  ['put same', (m) => m.put('a', 1)],
  ['remove', (m) => m.remove('a')],
  ['remove absent', (m) => m.remove('zz')],
  ['remove(k, v)', (m) => m.remove('a', 1)],
  ['putAll', (m) => m.putAll(HashMap.of(['z', 9]))],
  ['putAll empty', (m) => m.putAll(new HashMap())],
  ['clear', (m) => m.clear()],
  ['replaceAll', (m) => m.replaceAll((_k: unknown, v: unknown) => v)],
  ['putIfAbsent', (m) => m.putIfAbsent('a', 5)],
  ['replace', (m) => m.replace('a', 5)],
  ['replace(k, old, new)', (m) => m.replace('a', 1, 5)],
  ['computeIfAbsent', (m) => m.computeIfAbsent('a', () => 5)],
  ['computeIfPresent', (m) => m.computeIfPresent('zz', () => 5)],
  ['compute', (m) => m.compute('a', () => 5)],
  ['merge', (m) => m.merge('a', 5, () => 5)],
];

describe('List.of / List.copyOf', () => {
  const lists: [string, () => any][] = [
    ['List.of', () => List.of(1, 2, 3)],
    ['List.copyOf', () => List.copyOf(LinkedList.of(1, 2, 3))],
    ['subList', () => List.of(0, 1, 2, 3, 4).subList(1, 4).subList(0, 3)],
    ['reversed', () => List.of(3, 2, 1).reversed()],
  ];

  describe.each(lists)('%s rejects every mutator', (_n, make) => {
    it.each(listMutators)('%s', (_m, call) => {
      const l = make();
      expectThrows(() => call(l), UOE);
      expect(l.toArray()).toEqual([1, 2, 3]);
    });
  });

  it.each([['empty', () => List.of()], ['empty copy', () => List.copyOf(new ArrayList())]])('%s rejects no-op mutators', (_n, make) => {
    const l = make() as any;
    for (const f of [() => l.clear(), () => l.removeIf(() => true), () => l.sort(), () => l.addAll(new ArrayList()), () => l.retainAll(new ArrayList())]) {
      expectThrows(f, UOE);
    }
  });

  it('reads', () => {
    const l = List.of('a', 'b', 'a');
    expect(l.size()).toBe(3);
    expect(l.isEmpty()).toBe(false);
    expect(l.get(1)).toBe('b');
    expect(l.indexOf('a')).toBe(0);
    expect(l.lastIndexOf('a')).toBe(2);
    expect(l.indexOf('z')).toBe(-1);
    expect(l.lastIndexOf('z')).toBe(-1);
    expect(l.contains('b')).toBe(true);
    expect(l.containsAll(ArrayList.of('a', 'b'))).toBe(true);
    expect(l.getFirst()).toBe('a');
    expect(l.getLast()).toBe('a');
  });

  it('get out of range', () => {
    const l = List.of(1);
    expectThrows(() => l.get(1), IOOBE);
    expectThrows(() => l.get(-1), IOOBE);
    expectThrows(() => l.get(0.5), IOOBE);
  });

  it('getFirst/getLast on empty', () => {
    expectThrows(() => List.of().getFirst(), NSEE);
    expectThrows(() => List.of().getLast(), NSEE);
  });

  it('value lookups use equals, NaN, and objects', () => {
    const l = List.of<unknown>(new Point(1, 2), NaN, new Date(5));
    expect(l.indexOf(new Point(1, 2))).toBe(0);
    expect(l.lastIndexOf(new Point(1, 2))).toBe(0);
    expect(l.indexOf(NaN)).toBe(1);
    expect(l.lastIndexOf(NaN)).toBe(1);
    expect(l.indexOf(new Point(9, 9))).toBe(-1);
    expect(l.lastIndexOf(new Point(9, 9))).toBe(-1);
    expect(l.contains(new Date(5))).toBe(true);
    const o = {};
    expect(List.of(o).contains(o)).toBe(true);
    expect(List.of(o).contains({})).toBe(false);
  });

  it.each([null, undefined])('null queries (%s) throw NullPointerException, also through views', (x) => {
    const l = List.of(1, 2, 3);
    for (const q of [l, l.subList(0, 2), l.reversed(), List.copyOf(ArrayList.of(1))]) {
      expectThrows(() => q.contains(x), NPE);
      expectThrows(() => q.indexOf(x), NPE);
      expectThrows(() => q.lastIndexOf(x), NPE);
      expectThrows(() => q.containsAll(ArrayList.of(1, x)), NPE);
    }
    expect(l.equals(ArrayList.of(1, 2, x))).toBe(false);
  });

  it.each([null, undefined])('of rejects %s', (x) => {
    expectThrows(() => List.of(1, x), NPE);
  });

  it('copyOf rejects nulls and null source', () => {
    expectThrows(() => List.copyOf(ArrayList.of(1, null)), NPE);
    expectThrows(() => List.copyOf(null as any), NPE);
  });

  it('copyOf of an immutable list returns it', () => {
    const l = List.of(1, 2);
    expect(List.copyOf(l)).toBe(l);
    const sub = l.subList(0, 1);
    expect(List.copyOf(sub)).toBe(sub);
  });

  it('copyOf copies a mutable source (no aliasing)', () => {
    const src = ArrayList.of(1, 2);
    const c = List.copyOf(src);
    src.add(3);
    expect(c.toArray()).toEqual([1, 2]);
  });

  it('of does not alias a spread array', () => {
    const a = [1, 2];
    const l = List.of(...a);
    a.push(3);
    expect(l.size()).toBe(2);
  });

  it('is RandomAccess, sub/reversed too', () => {
    const l = List.of(1, 2, 3);
    expect(isRandomAccess(l)).toBe(true);
    expect(isRandomAccess(l.subList(0, 1))).toBe(true);
    expect(isRandomAccess(l.reversed())).toBe(true);
  });

  it.each([
    ['ArrayList', () => ArrayList.of(1, 2, 3)],
    ['LinkedList', () => LinkedList.of(1, 2, 3)],
    ['List.of', () => List.of(1, 2, 3)],
  ])('equals/hashCode with %s', (_n, make) => {
    const l = List.of(1, 2, 3);
    const o = make();
    expect(l.equals(o)).toBe(true);
    expect(o.equals(l)).toBe(true);
    expect(l.hashCode()).toBe(o.hashCode());
  });

  it('not equal to different lists or non-lists', () => {
    const l = List.of(1, 2, 3);
    expect(l.equals(List.of(1, 2))).toBe(false);
    expect(l.equals(List.of(1, 2, 4))).toBe(false);
    expect(l.equals(ArrayList.of(1, 2))).toBe(false);
    expect(l.equals(ArrayList.of(1, 2, 3, 4))).toBe(false);
    expect(l.equals(ArrayList.of(1, 2, 4))).toBe(false);
    expect(l.equals(HashSet.of(1, 2, 3))).toBe(false);
    expect(l.equals([1, 2, 3])).toBe(false);
    expect(l.equals(l)).toBe(true);
  });

  it('subList and reversed contents and range checks', () => {
    const l = List.of(0, 1, 2, 3);
    expect(l.subList(1, 3).toArray()).toEqual([1, 2]);
    expect(l.reversed().toArray()).toEqual([3, 2, 1, 0]);
    expect(l.reversed().reversed().equals(l)).toBe(true);
    expectThrows(() => l.subList(-1, 2), IOOBE);
    expectThrows(() => l.subList(0, 5), IOOBE);
    expectThrows(() => l.subList(3, 2), IAE);
  });

  it('iteration: for..of, spread, forEach, iterator, listIterator both ways', () => {
    const l = List.of(1, 2, 3);
    expect([...l]).toEqual([1, 2, 3]);
    expect(Array.from(l)).toEqual([1, 2, 3]);
    const seen: number[] = [];
    l.forEach((x) => seen.push(x));
    expect(seen).toEqual([1, 2, 3]);
    const it = l.iterator();
    expect([it.next(), it.next(), it.next()]).toEqual([1, 2, 3]);
    expect(it.hasNext()).toBe(false);
    expectThrows(() => it.next(), NSEE);
    const li = l.listIterator(3);
    expect(li.nextIndex()).toBe(3);
    expect(li.previousIndex()).toBe(2);
    expect([li.previous(), li.previous(), li.previous()]).toEqual([3, 2, 1]);
    expect(li.hasPrevious()).toBe(false);
    expectThrows(() => li.previous(), NSEE);
    const rest: number[] = [];
    li.next();
    li.forEachRemaining((x) => rest.push(x));
    expect(rest).toEqual([2, 3]);
    expectThrows(() => l.listIterator(4), IOOBE);
  });

  it('toArray is a mutable copy', () => {
    const l = List.of(1, 2);
    const a = l.toArray();
    a.push(3);
    expect(l.size()).toBe(2);
  });

  it('backing array is frozen', () => {
    const l = List.of(1, 2) as any;
    expect(Object.isFrozen(l.es)).toBe(true);
  });

  it('toString', () => {
    expect(List.of().toString()).toBe('[]');
    expect(List.of<unknown>(1, 'a', new Point(1, 2)).toString()).toBe('[1, a, (1,2)]');
    expect(String(List.of(1, 2))).toBe('[1, 2]');
  });
});

describe('Set.of / Set.copyOf', () => {
  const sets: [string, () => any][] = [
    ['Set.of', () => Set.of(1, 2, 3)],
    ['Set.copyOf', () => Set.copyOf(ArrayList.of(1, 2, 3, 3))],
  ];

  describe.each(sets)('%s rejects every mutator', (_n, make) => {
    it.each(collectionMutators)('%s', (_m, call) => {
      const s = make();
      expectThrows(() => call(s), UOE);
      expect(s.size()).toBe(3);
    });
    it('iterator.remove', () => {
      const it = make().iterator();
      it.next();
      expectThrows(() => it.remove(), UOE);
    });
  });

  it('empty set rejects no-op mutators', () => {
    const s = Set.of<number>();
    expectThrows(() => s.clear(), UOE);
    expectThrows(() => s.removeIf(() => true), UOE);
  });

  it('duplicates: of throws, copyOf drops', () => {
    expectThrows(() => Set.of(1, 2, 1), IAE);
    expectThrows(() => Set.of(new Point(1, 1), new Point(1, 1)), IAE);
    expect(Set.copyOf(ArrayList.of(1, 1, 2)).size()).toBe(2);
  });

  it.each([null, undefined])('rejects %s', (x) => {
    expectThrows(() => Set.of(1, x), NPE);
    expectThrows(() => Set.copyOf(ArrayList.of(1, x)), NPE);
  });

  it('copyOf of an immutable set returns it', () => {
    const s = Set.of(1);
    expect(Set.copyOf(s)).toBe(s);
  });

  it('reads and contains(null)', () => {
    const s = Set.of<unknown>('a', new Point(1, 2), NaN);
    expect(s.size()).toBe(3);
    expect(s.isEmpty()).toBe(false);
    expect(Set.of().isEmpty()).toBe(true);
    expect(s.contains('a')).toBe(true);
    expect(s.contains(new Point(1, 2))).toBe(true);
    expect(s.contains(NaN)).toBe(true);
    expect(s.contains('b')).toBe(false);
    expectThrows(() => s.contains(null), NPE);
    expectThrows(() => s.contains(undefined), NPE);
    expectThrows(() => s.containsAll(ArrayList.of('a', null)), NPE);
    expectThrows(() => Set.copyOf(ArrayList.of(1)).contains(null), NPE);
    expect(s.equals(HashSet.of<unknown>('a', null, NaN))).toBe(false);
  });

  it.each([
    ['HashSet', () => HashSet.of(3, 1, 2)],
    ['TreeSet', () => TreeSet.of(3, 1, 2)],
    ['Set.of', () => Set.of(2, 3, 1)],
  ])('equals/hashCode with %s', (_n, make) => {
    const s = Set.of(1, 2, 3);
    const o = make();
    expect(s.equals(o)).toBe(true);
    expect(o.equals(s)).toBe(true);
    expect(s.hashCode()).toBe(o.hashCode());
  });

  it('not equal to lists or different sets', () => {
    expect(Set.of(1, 2).equals(ArrayList.of(1, 2))).toBe(false);
    expect(Set.of(1, 2).equals(Set.of(1, 3))).toBe(false);
    expect(Set.of(1, 2).equals(Set.of(1))).toBe(false);
  });

  it('iteration in insertion order (unspecified, but stable)', () => {
    const s = Set.of(3, 1, 2);
    expect([...s]).toEqual([3, 1, 2]);
    expect(s.toArray()).toEqual([3, 1, 2]);
    const seen: number[] = [];
    s.forEach((x) => seen.push(x));
    expect(seen).toEqual([3, 1, 2]);
    expect(new globalThis.Set(s).size).toBe(3);
  });

  it('toString', () => {
    expect(Set.of().toString()).toBe('[]');
    expect(Set.of(1, 2).toString()).toBe('[1, 2]');
  });
});

describe('Map.of / ofEntries / entry / copyOf', () => {
  const maps: [string, () => any][] = [
    ['Map.of', () => Map.of('a', 1, 'b', 2)],
    ['Map.ofEntries', () => Map.ofEntries(Map.entry('a', 1), new SimpleEntry('b', 2))],
    ['Map.copyOf', () => Map.copyOf(HashMap.of(['a', 1], ['b', 2]))],
  ];

  describe.each(maps)('%s rejects every mutator', (_n, make) => {
    it.each(mapMutators)('%s', (_m, call) => {
      const m = make();
      expectThrows(() => call(m), UOE);
      expect(m.size()).toBe(2);
      expect(m.get('a')).toBe(1);
    });
  });

  const views: [string, (m: any) => any][] = [
    ['keySet', (m) => m.keySet()],
    ['values', (m) => m.values()],
    ['entrySet', (m) => m.entrySet()],
  ];
  describe.each(views)('%s view is read-only', (_n, view) => {
    // as in the reference, view removals throw only when something would be removed; adds always throw
    const removes = (c: { size(): number }) => c.size() > 0;
    const changing: Call[] = [
      ['add', (c) => c.add(9)],
      ['addAll empty', (c) => c.addAll(new ArrayList())],
      ['remove present', (c) => c.remove([...c][0])],
      ['removeIf all', (c) => c.removeIf(() => true)],
      ['retainAll none', (c) => c.retainAll(new ArrayList())],
      ['removeAll present', (c) => c.removeAll(ArrayList.of([...c][0]))],
      ['clear', (c) => c.clear()],
    ];
    const noOps: Call[] = [
      ['remove absent', (c) => c.remove(42)],
      ['removeIf none', (c) => c.removeIf(() => false)],
      ['retainAll all', (c) => c.retainAll(ArrayList.of(...c))],
      ['removeAll none', (c) => c.removeAll(new ArrayList())],
    ];
    it.each(changing)('%s throws UnsupportedOperationException', (_m, call) => {
      const m = Map.of('a', 1, 'b', 2);
      expect(removes(view(m))).toBe(true);
      expectThrows(() => call(view(m)), UOE);
      expect(m.size()).toBe(2);
    });
    it.each(noOps)('%s returns false', (_m, call) => {
      const m = Map.of('a', 1, 'b', 2);
      expect(call(view(m))).toBe(false);
      expect(m.size()).toBe(2);
    });
    it('clear on an empty view is a no-op', () => expect(() => view(Map.of()).clear()).not.toThrow());
    it('iterator.remove', () => {
      const it = view(Map.of('a', 1)).iterator();
      it.next();
      expectThrows(() => it.remove(), UOE);
    });
  });

  it('entries reject setValue', () => {
    const m = Map.of('a', 1);
    const e = m.entrySet().iterator().next();
    expectThrows(() => e.setValue(2), UOE);
    expectThrows(() => Map.entry('a', 1).setValue(2), UOE);
    for (const x of m.entrySet()) expectThrows(() => x.setValue(3), UOE);
    expect(m.get('a')).toBe(1);
  });

  it('ofEntries copies mutable entries', () => {
    const src = new SimpleEntry('a', 1);
    const m = Map.ofEntries(src);
    src.setValue(9);
    expect(m.get('a')).toBe(1);
  });

  it('odd argument count', () => {
    expectThrows(() => (Map.of as any)('a', 1, 'b'), IAE);
  });

  it('duplicate keys', () => {
    expectThrows(() => Map.of('a', 1, 'a', 2), IAE);
    expectThrows(() => Map.ofEntries(Map.entry(new Point(1, 1), 1), Map.entry(new Point(1, 1), 2)), IAE);
  });

  it.each([null, undefined])('rejects %s keys and values', (x) => {
    expectThrows(() => Map.of(x, 1), NPE);
    expectThrows(() => Map.of('a', x), NPE);
    expectThrows(() => Map.entry(x, 1), NPE);
    expectThrows(() => Map.entry('a', x), NPE);
    expectThrows(() => Map.ofEntries(new SimpleEntry<unknown, unknown>('a', x)), NPE);
    expectThrows(() => Map.ofEntries(null as any), NPE);
    expectThrows(() => Map.copyOf(HashMap.of<unknown, unknown>(['a', x])), NPE);
    expectThrows(() => Map.copyOf(HashMap.of<unknown, unknown>([x, 1])), NPE);
  });

  it('copyOf of an immutable map returns it', () => {
    const m = Map.of('a', 1);
    expect(Map.copyOf(m)).toBe(m);
    expectThrows(() => Map.copyOf(null as any), NPE);
  });

  it('lookups by equals/hashCode', () => {
    const m = Map.of<unknown, string>(new Point(1, 2), 'p', 7, 'seven', NaN, 'nan');
    expect(m.get(new Point(1, 2))).toBe('p');
    expect(m.get(7)).toBe('seven');
    expect(m.get(NaN)).toBe('nan');
    expect(m.get('x')).toBeNull();
    expectThrows(() => m.get(null), NPE);
    expectThrows(() => m.get(undefined), NPE);
    expect(m.containsKey(new Point(1, 2))).toBe(true);
    expectThrows(() => m.containsKey(null), NPE);
    expectThrows(() => m.containsValue(null), NPE);
    expectThrows(() => m.getOrDefault(null, 'd'), NPE);
    expectThrows(() => m.keySet().contains(null), NPE);
    expectThrows(() => m.values().contains(undefined), NPE);
    expectThrows(() => m.entrySet().contains(null), NPE);
    expect(m.entrySet().contains(new SimpleEntry(null, 'p'))).toBe(false);
    for (const q of [Map.ofEntries(Map.entry(1, 2)), Map.copyOf(HashMap.of([1, 2]))]) expectThrows(() => q.get(null), NPE);
    expect(m.containsValue('seven')).toBe(true);
    expect(m.containsValue('x')).toBe(false);
    expect(m.getOrDefault(7, 'd')).toBe('seven');
    expect(m.getOrDefault(8, 'd')).toBe('d');
    expect(m.isEmpty()).toBe(false);
    expect(Map.of().isEmpty()).toBe(true);
  });

  it('views contents and contains', () => {
    const m = Map.of('a', 1, 'b', 2);
    expect(m.keySet().contains('a')).toBe(true);
    expect(m.keySet().contains('z')).toBe(false);
    expect(m.values().contains(2)).toBe(true);
    expect(m.values().contains(3)).toBe(false);
    expect(m.entrySet().contains(Map.entry('a', 1))).toBe(true);
    expect(m.entrySet().contains(new SimpleImmutableEntry('a', 2))).toBe(false);
    expect(m.entrySet().contains(new SimpleImmutableEntry('z', 2))).toBe(false);
    expect(m.entrySet().contains('a')).toBe(false);
    expect([...m.keySet()]).toEqual(['a', 'b']);
    expect([...m.values()]).toEqual([1, 2]);
    expect(m.entrySet().toArray().map(String)).toEqual(['a=1', 'b=2']);
    expect([...m.entrySet()].map(String)).toEqual(['a=1', 'b=2']);
    expect(m.keySet().size()).toBe(2);
    expect(m.values().size()).toBe(2);
    expect(m.entrySet().size()).toBe(2);
    expect(m.keySet()).toBe(m.keySet());
    expect(m.keySet().equals(HashSet.of('a', 'b'))).toBe(true);
    expect(m.entrySet().equals(HashMap.of(['a', 1], ['b', 2]).entrySet())).toBe(true);
  });

  it('JS interop: for..of pairs, new Map, forEach', () => {
    const m = Map.of('a', 1, 'b', 2);
    expect([...m]).toEqual([['a', 1], ['b', 2]]);
    expect(new globalThis.Map(m).get('b')).toBe(2);
    const seen: string[] = [];
    m.forEach((k, v) => seen.push(`${k}${v}`));
    expect(seen).toEqual(['a1', 'b2']);
  });

  it.each([
    ['HashMap', () => HashMap.of(['b', 2], ['a', 1])],
    ['Map.of', () => Map.of('b', 2, 'a', 1)],
  ])('equals/hashCode with %s', (_n, make) => {
    const m = Map.of('a', 1, 'b', 2);
    const o = make();
    expect(m.equals(o)).toBe(true);
    expect(o.equals(m)).toBe(true);
    expect(m.hashCode()).toBe(o.hashCode());
  });

  it('not equal to different maps', () => {
    expect(Map.of('a', 1).equals(Map.of('a', 2))).toBe(false);
    expect(Map.of('a', 1).equals(Map.of('a', 1, 'b', 2))).toBe(false);
    expect(Map.of('a', 1).equals(HashSet.of('a'))).toBe(false);
  });

  it('entry equality and toString', () => {
    expect(Map.entry('a', 1).equals(new SimpleEntry('a', 1))).toBe(true);
    expect(Map.entry('a', 1).hashCode()).toBe(new SimpleEntry('a', 1).hashCode());
    expect(Map.entry('a', 1).toString()).toBe('a=1');
  });

  it('toString', () => {
    expect(Map.of().toString()).toBe('{}');
    expect(Map.of('a', 1, 'b', 2).toString()).toBe('{a=1, b=2}');
  });

  it('typed overloads up to five pairs and variadic beyond', () => {
    expect(Map.of(1, 1, 2, 2, 3, 3, 4, 4, 5, 5).size()).toBe(5);
    expect(Map.of(1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6).size()).toBe(6);
  });
});
