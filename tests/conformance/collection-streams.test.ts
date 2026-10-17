// Conformance: Collection.stream() / parallelStream() on the library collections.
// Collection.stream: "Returns a sequential Stream with this collection as its source."
// Collection.parallelStream: "Returns a possibly parallel Stream with this collection as its source." (only results are asserted)
import {
  ArrayDeque,
  ArrayList,
  Collection,
  Collectors,
  HashMap,
  HashSet,
  LinkedHashMap,
  LinkedHashSet,
  LinkedList,
  List,
  Map,
  PriorityQueue,
  Set,
  Stream,
  TreeMap,
  TreeSet,
  Vector,
} from '../../src';
import { Point } from '../helpers';

const ordered: [string, () => Collection<number>, number[]][] = [
  ['ArrayList', () => ArrayList.of(3, 1, 2), [3, 1, 2]],
  ['LinkedList', () => LinkedList.of(3, 1, 2), [3, 1, 2]],
  ['Vector', () => new Vector<number>(ArrayList.of(3, 1, 2)), [3, 1, 2]],
  ['ArrayDeque', () => ArrayDeque.of(3, 1, 2), [3, 1, 2]],
  ['LinkedHashSet', () => new LinkedHashSet<number>(ArrayList.of(3, 1, 2)), [3, 1, 2]],
  ['TreeSet', () => TreeSet.of(3, 1, 2), [1, 2, 3]],
  ['List.of', () => List.of(3, 1, 2), [3, 1, 2]],
  ['ArrayList.subList', () => ArrayList.of(9, 3, 1, 2, 9).subList(1, 4), [3, 1, 2]],
  ['TreeSet.descendingSet', () => TreeSet.of(1, 2, 3).descendingSet(), [3, 2, 1]],
  ['ArrayList.reversed', () => ArrayList.of(2, 1, 3).reversed(), [3, 1, 2]],
];
const unordered: [string, () => Collection<number>, number[]][] = [
  ['HashSet', () => HashSet.of(3, 1, 2), [1, 2, 3]],
  ['PriorityQueue', () => PriorityQueue.of(3, 1, 2), [1, 2, 3]],
  ['Set.of', () => Set.of(3, 1, 2), [1, 2, 3]],
];
const sortNum = (a: number[]) => [...a].sort((x, y) => x - y);

describe.each(ordered)('%s.stream() (ordered source)', (_n, make, expected) => {
  it('streams in encounter order', () => expect(make().stream().toArray()).toEqual(expected));
  it('is sequential', () => expect(make().stream().isParallel()).toBe(false));
  it('parallelStream gives the same ordered result', () => expect(make().parallelStream().toArray()).toEqual(expected));
  it('parallelStream with map and collect keeps encounter order', () =>
    expect(make().parallelStream().map((x) => x * 10).collect(Collectors.toList()).toArray()).toEqual(expected.map((x) => x * 10)));
  it('count equals size', () => {
    const c = make();
    expect(c.stream().count()).toBe(c.size());
  });
  it('findFirst is the first in encounter order', () => expect(make().stream().findFirst().get()).toBe(expected[0]));
  it('a new stream can be created for each traversal', () => {
    const c = make();
    expect(c.stream().count()).toBe(c.stream().count());
  });
});

describe.each(unordered)('%s.stream() (unordered source)', (_n, make, expected) => {
  it('streams every element', () => expect(sortNum(make().stream().toArray())).toEqual(expected));
  it('parallelStream streams every element', () => expect(sortNum(make().parallelStream().toArray())).toEqual(expected));
  it('sorted() gives ascending order', () => expect(make().stream().sorted().toArray()).toEqual(expected));
  it('count equals size', () => expect(make().stream().count()).toBe(expected.length));
});

describe('streams over empty collections', () => {
  it.each([
    ['ArrayList', new ArrayList<number>()],
    ['LinkedList', new LinkedList<number>()],
    ['HashSet', new HashSet<number>()],
    ['TreeSet', new TreeSet<number>()],
    ['ArrayDeque', new ArrayDeque<number>()],
    ['List.of()', List.of<number>()],
  ] as [string, Collection<number>][])('%s', (_n, c) => {
    expect(c.stream().count()).toBe(0);
    expect(c.stream().findFirst().isPresent()).toBe(false);
    expect(c.parallelStream().toArray()).toEqual([]);
  });
});

describe('map views', () => {
  const tm = () => {
    const m = new TreeMap<string, number>();
    m.put('b', 2);
    m.put('a', 1);
    m.put('c', 3);
    return m;
  };
  it('TreeMap.keySet().stream() is ascending', () => expect(tm().keySet().stream().toArray()).toEqual(['a', 'b', 'c']));
  it('TreeMap.values().stream() follows key order', () => expect(tm().values().stream().toArray()).toEqual([1, 2, 3]));
  it('TreeMap.entrySet().stream() maps entries', () =>
    expect(tm().entrySet().stream().map((e) => e.getKey() + '=' + e.getValue()).toArray()).toEqual(['a=1', 'b=2', 'c=3']));
  it('LinkedHashMap views stream in insertion order', () => {
    const m = new LinkedHashMap<string, number>();
    m.put('z', 1);
    m.put('a', 2);
    expect(m.keySet().stream().toArray()).toEqual(['z', 'a']);
    expect(m.values().stream().toArray()).toEqual([1, 2]);
  });
  it('HashMap.entrySet().stream() covers every entry', () => {
    const m = HashMap.of<string, number>(['x', 1], ['y', 2]);
    expect(m.entrySet().stream().mapToInt((e) => e.getValue()).sum()).toBe(3);
  });
  it('re-collect a map with toMap', () => {
    const m = tm();
    const copy = m.entrySet().stream().collect(Collectors.toMap((e) => e.getKey(), (e) => e.getValue() * 2));
    expect([copy.get('a'), copy.get('c')]).toEqual([2, 6]);
  });
  it('Map.of entrySet stream', () => expect(Map.of('k', 5).entrySet().stream().findFirst().get().getValue()).toBe(5));
});

describe('streams over collections of value objects', () => {
  it('distinct on a list of equal Points', () =>
    expect(ArrayList.of(new Point(1, 1), new Point(1, 1), new Point(0, 0)).stream().distinct().count()).toBe(2));
  it('sorted uses compareTo', () =>
    expect(LinkedList.of(new Point(2, 0), new Point(1, 0)).stream().sorted().map(String).toArray()).toEqual(['(1,0)', '(2,0)']));
  it('toSet of points removes equal ones', () =>
    expect(ArrayList.of(new Point(1, 2), new Point(1, 2)).stream().collect(Collectors.toSet()).size()).toBe(1));
  it('streams allow null elements from the collection', () =>
    expect(ArrayList.of<string | null>('a', null).stream().filter((x) => x === null).count()).toBe(1));
});

describe('stream source interplay', () => {
  // package summary: "For well-behaved stream sources, the source can be modified before the terminal operation commences
  // and those modifications will be reflected in the covered elements."
  it('ArrayList modified before the terminal op', () => {
    const l = ArrayList.of(1);
    const s = l.stream().map((x) => x * 2);
    l.add(2);
    expect(s.toArray()).toEqual([2, 4]);
  });
  it('HashSet modified before the terminal op', () => {
    const set = HashSet.of('a');
    const s = set.stream();
    set.add('b');
    expect(s.count()).toBe(2);
  });
  it('TreeMap keySet modified before the terminal op', () => {
    const m = new TreeMap<number, string>();
    m.put(2, 'b');
    const s = m.keySet().stream();
    m.put(1, 'a');
    expect(s.toArray()).toEqual([1, 2]);
  });
  it('the source is not modified by stream operations', () => {
    const l = ArrayList.of(3, 1, 2);
    l.stream().sorted().map((x) => x * 2).toArray();
    expect(l.toArray()).toEqual([3, 1, 2]);
  });
  it('collecting into a new collection is independent of the source', () => {
    const l = ArrayList.of(1, 2);
    const copy = l.stream().collect(Collectors.toList());
    copy.add(3);
    expect(l.size()).toBe(2);
  });
  it('concat of two collection streams', () => expect(Stream.concat(ArrayList.of(1).stream(), TreeSet.of(3, 2).stream()).toArray()).toEqual([1, 2, 3]));
});
