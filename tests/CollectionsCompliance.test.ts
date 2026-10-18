// Behaviour required by the SE 27 Collections API docs for Collections, Comparator, Objects and the immutable factories.
import { SimpleEntry } from '../src/abstract/AbstractMap';
import * as C from '../src/Collections';
import { Collections } from '../src/Collections';
import { List as IList, Map as IMap, Set as ISet } from '../src/immutable/ImmutableCollections';
import { List } from '../src/interfaces/List';
import { MapEntry } from '../src/interfaces/Map';
import { ArrayList } from '../src/list/ArrayList';
import { LinkedList } from '../src/list/LinkedList';
import { HashMap } from '../src/map/HashMap';
import { LinkedHashMap } from '../src/map/LinkedHashMap';
import { TreeMap } from '../src/map/TreeMap';
import { ArrayDeque } from '../src/queue/ArrayDeque';
import { HashSet } from '../src/set/HashSet';
import { LinkedHashSet } from '../src/set/LinkedHashSet';
import { TreeSet } from '../src/set/TreeSet';
import { Comparator, naturalCompare } from '../src/util/Comparator';
import { identityHashCode, Objects } from '../src/util/Objects';
import { expectThrows, Point } from './helpers';

const UOE = 'UnsupportedOperationException';
const NPE = 'NullPointerException';
const IAE = 'IllegalArgumentException';
const ISE = 'IllegalStateException';
const NSEE = 'NoSuchElementException';
const CCE = 'ClassCastException';
const IOOBE = 'IndexOutOfBoundsException';

const N = null as any;
const U = undefined as any;

describe('C-1 algorithms reject a null collection', () => {
  const l = () => ArrayList.of(1, 2, 3);
  const calls: [string, (x: any) => unknown][] = [
    ['sort', (x) => C.sort(x)],
    ['reverse', (x) => C.reverse(x)],
    ['shuffle', (x) => C.shuffle(x)],
    ['shuffle(rnd)', (x) => C.shuffle(x, Math.random)],
    ['swap', (x) => C.swap(x, 0, 0)],
    ['fill', (x) => C.fill(x, 0)],
    ['copy dest', (x) => C.copy(x, l())],
    ['copy src', (x) => C.copy(l(), x)],
    ['min', (x) => C.min(x)],
    ['max', (x) => C.max(x, naturalCompare)],
    ['frequency', (x) => C.frequency(x, 1)],
    ['disjoint', (x) => C.disjoint(x, l())],
    ['binarySearch', (x) => C.binarySearch(x, 1)],
    ['rotate', (x) => C.rotate(x, 1)],
    ['indexOfSubList source', (x) => C.indexOfSubList(x, l())],
    ['indexOfSubList target', (x) => C.indexOfSubList(l(), x)],
    ['lastIndexOfSubList source', (x) => C.lastIndexOfSubList(x, l())],
    ['lastIndexOfSubList target', (x) => C.lastIndexOfSubList(l(), x)],
    ['replaceAll', (x) => C.replaceAll(x, 1, 2)],
    ['addAll', (x) => C.addAll(x, 1)],
    ['enumeration', (x) => C.enumeration(x)],
    ['list', (x) => C.list(x)],
    ['asLifoQueue', (x) => C.asLifoQueue(x)],
    ['newSetFromMap', (x) => C.newSetFromMap(x)],
    ['unmodifiableSequencedSet', (x) => C.unmodifiableSequencedSet(x)],
    ['unmodifiableSequencedMap', (x) => C.unmodifiableSequencedMap(x)],
    ['checkedList', (x) => C.checkedList(x, () => true)],
    ['checkedMap', (x) => C.checkedMap(x, () => true, () => true)],
    ['synchronizedList', (x) => C.synchronizedList(x)],
    ['synchronizedMap', (x) => C.synchronizedMap(x)],
  ];
  describe.each([['null', N], ['undefined', U]])('%s', (_n, x) => {
    it.each(calls)('%s', (_name, f) => expectThrows(() => f(x), NPE));
  });
  it('shuffle with an explicit null random source', () => expectThrows(() => C.shuffle(l(), N), NPE));
});

describe('C-2 / C-3 / C-11 / C-12 / C-14 Comparator', () => {
  it('nullsFirst/nullsLast(null): non-null values are all equal', () => {
    const a = [{ k: 2 }, null, { k: 1 }];
    expect([...a].sort(Comparator.nullsFirst(null))).toEqual([null, { k: 2 }, { k: 1 }]);
    expect([...a].sort(Comparator.nullsLast(U))).toEqual([{ k: 2 }, { k: 1 }, null]);
    expect(Comparator.nullsFirst(null)(1, 2)).toBe(0);
    expect(Comparator.nullsFirst<number>()(1, 2)).toBeLessThan(0);
    expect(Comparator.nullsLast<number>()(undefined, 2)).toBeGreaterThan(0);
  });
  it('comparing / thenComparing reject null eagerly', () => {
    const c = (a: number, b: number) => a - b;
    expectThrows(() => Comparator.comparing((x: number) => x, N), NPE);
    expectThrows(() => Comparator.comparing(N), NPE);
    expectThrows(() => Comparator.thenComparing(c, N), NPE);
    expectThrows(() => Comparator.thenComparing(N), NPE);
    expectThrows(() => Comparator.thenComparingBy(c, N), NPE);
    expectThrows(() => Comparator.thenComparingBy(c, (x) => x, N), NPE);
    expectThrows(() => Comparator.thenComparingInt(N, (x: number) => x), NPE);
    expectThrows(() => Comparator.reversed(N), NPE);
    expectThrows(() => Comparator.comparingInt(N), NPE);
  });
  it('max/min return the first argument on ties', () => {
    const byLen = Comparator.comparingInt((s: string) => s.length);
    expect(Comparator.max(byLen, 'ab', 'c')).toBe('ab');
    expect(Comparator.max(byLen, 'a', 'cd')).toBe('cd');
    expect(Comparator.max(byLen, 'a', 'b')).toBe('a');
    expect(Comparator.min(byLen, 'ab', 'c')).toBe('c');
    expect(Comparator.min(byLen, 'a', 'b')).toBe('a');
    expectThrows(() => Comparator.max(N, 1, 2), NPE);
  });
  it('comparingInt/Long/Double and the thenComparing key forms', () => {
    const ps = [new Point(2, 1), new Point(1, 2), new Point(1, 1)];
    expect([...ps].sort(Comparator.comparingInt((p: Point) => p.x)).map(String)).toEqual(['(1,2)', '(1,1)', '(2,1)']);
    expect([3n, 1n, 2n].sort(Comparator.comparingLong((x: bigint) => x))).toEqual([1n, 2n, 3n]);
    expect([NaN, 2.5, -1].sort(Comparator.comparingDouble((x: number) => x))).toEqual([-1, 2.5, NaN]);
    const byX = Comparator.comparingInt((p: Point) => p.x);
    expect([...ps].sort(Comparator.thenComparingInt(byX, (p) => p.y)).map(String)).toEqual(['(1,1)', '(1,2)', '(2,1)']);
    expect([...ps].sort(Comparator.thenComparingLong(byX, (p) => p.y)).map(String)).toEqual(['(1,1)', '(1,2)', '(2,1)']);
    expect([...ps].sort(Comparator.thenComparingDouble(byX, (p) => -p.y)).map(String)).toEqual(['(1,2)', '(1,1)', '(2,1)']);
    expect([...ps].sort(Comparator.thenComparingBy(byX, (p) => p.y)).map(String)).toEqual(['(1,1)', '(1,2)', '(2,1)']);
    expect([...ps].sort(Comparator.thenComparingBy(byX, (p) => p.y, (a, b) => b - a)).map(String)).toEqual(['(1,2)', '(1,1)', '(2,1)']);
    expect(Comparator.thenComparing(byX)).toBe(byX);
  });
  it('reverse orders are shared and involutive', () => {
    const c = (a: number, b: number) => a - b;
    expect(Comparator.reversed(Comparator.reversed(c))).toBe(c);
    expect(Comparator.reverseOrder()).toBe(Collections.reverseOrder());
    expect(Collections.reverseOrder(Collections.reverseOrder())).toBe(naturalCompare);
    expect(Comparator.reversed(Comparator.naturalOrder())).toBe(Collections.reverseOrder());
    expect(Comparator.reversed(Comparator.reverseOrder())).toBe(naturalCompare);
    expect(Comparator.reversed(c)(1, 2)).toBeGreaterThan(0);
  });
});

describe('C-4 null queries: factories throw, empty/singleton/nCopies stay tolerant', () => {
  it.each([
    ['emptyList', () => C.emptyList()],
    ['singletonList', () => C.singletonList(1)],
    ['unmodifiableSequencedSet', () => C.unmodifiableSequencedSet(LinkedHashSet.of(1, 2))],
    ['emptySet', () => C.emptySet()],
    ['singleton', () => C.singleton(1)],
  ])('%s', (_n, make) => {
    const c = make() as List<unknown>;
    expect(c.contains(null)).toBe(false);
    expect(c.contains(undefined)).toBe(false);
    expect(c.containsAll(ArrayList.of(null))).toBe(false);
    if (typeof c.indexOf === 'function') {
      expect(c.indexOf(null)).toBe(-1);
      expect(c.lastIndexOf(null)).toBe(-1);
      expect(c.subList(0, 0).contains(null)).toBe(false);
    }
  });
  it.each([
    ['emptyMap', () => C.emptyMap()],
    ['singletonMap', () => C.singletonMap(1, 2)],
  ])('%s', (_n, make) => {
    const m = make();
    expect([m.get(null), m.containsKey(null), m.containsValue(null), m.getOrDefault(null, 9)]).toEqual([null, false, false, 9]);
    expect(m.keySet().contains(null)).toBe(false);
  });
  it('List.copyOf copies a null-free singleton (only factory lists are returned as-is)', () => {
    const s = C.singletonList(1);
    const copy = IList.copyOf(s);
    expect(copy).not.toBe(s);
    expectThrows(() => copy.contains(null), NPE);
    expect(IList.copyOf(copy)).toBe(copy);
  });
});

describe('C-5 unmodifiableSequencedSet / unmodifiableSequencedMap', () => {
  it('set: equality by value, sequenced reads, mutators throw, idempotent', () => {
    const base = LinkedHashSet.of(1, 2, 3);
    const s = C.unmodifiableSequencedSet(base);
    expect(s.equals(HashSet.of(3, 2, 1))).toBe(true);
    expect(HashSet.of(1, 2, 3).equals(s)).toBe(true);
    expect(s.hashCode()).toBe(base.hashCode());
    expect([s.getFirst(), s.getLast()]).toEqual([1, 3]);
    expect([...s.reversed()]).toEqual([3, 2, 1]);
    for (const f of [() => s.addFirst(0), () => s.addLast(0), () => s.removeFirst(), () => s.removeLast(), () => s.add(9), () => s.reversed().addFirst(0), () => s.reversed().removeLast()]) {
      expectThrows(f, UOE);
    }
    expect(C.unmodifiableSequencedSet(s)).toBe(s);
    // verified on the reference: only its own wrapper class is returned as-is, so a sorted wrapper is wrapped again,
    // and the sequenced wrapper's removeFirst throws UnsupportedOperationException even when empty
    const sorted = C.unmodifiableSortedSet(TreeSet.of<number>());
    expect(C.unmodifiableSequencedSet(sorted)).not.toBe(sorted);
    expectThrows(() => sorted.removeFirst(), 'NoSuchElementException');
    expectThrows(() => C.unmodifiableSequencedSet(sorted).removeFirst(), UOE);
    base.add(4);
    expect(s.getLast()).toBe(4);
  });
  it('map: equality by value, sequenced reads, mutators throw, entries read-only, idempotent', () => {
    const base = new LinkedHashMap<string, number>();
    base.put('a', 1);
    base.put('b', 2);
    const m = C.unmodifiableSequencedMap(base);
    expect(m.equals(HashMap.of(['b', 2], ['a', 1]))).toBe(true);
    expect(m.hashCode()).toBe(base.hashCode());
    expect(m.firstEntry()!.getKey()).toBe('a');
    expect(m.lastEntry()!.getValue()).toBe(2);
    expectThrows(() => m.firstEntry()!.setValue(5), UOE);
    expect([...m.reversed().sequencedKeySet()]).toEqual(['b', 'a']);
    expect([...m.sequencedValues()]).toEqual([1, 2]);
    expectThrows(() => m.sequencedEntrySet().iterator().next().setValue(9), UOE);
    for (const f of [
      () => m.putFirst('z', 0), () => m.putLast('z', 0), () => m.pollFirstEntry(), () => m.pollLastEntry(), () => m.put('z', 0),
      () => m.reversed().putFirst('z', 0), () => m.sequencedKeySet().removeFirst(), () => m.sequencedValues().removeLast(),
    ]) {
      expectThrows(f, UOE);
    }
    expect(C.unmodifiableSequencedMap(m)).toBe(m);
    expect(base.size()).toBe(2);
  });
});

describe('C-6 newSetFromMap / newSequencedSetFromMap', () => {
  it('rejects a non-empty map', () => {
    expectThrows(() => C.newSetFromMap(HashMap.of([1, true])), IAE);
    expectThrows(() => C.newSequencedSetFromMap(LinkedHashMap.of([1, true])), IAE);
  });
  it('set semantics backed by the map', () => {
    const m = new HashMap<string, boolean>();
    const s = C.newSetFromMap(m);
    expect(s.add('a')).toBe(true);
    expect(s.add('a')).toBe(false);
    expect(s.addAll(ArrayList.of('b', 'a'))).toBe(true);
    expect(m.get('b')).toBe(true);
    expect([s.size(), s.contains('a'), s.contains('z')]).toEqual([2, true, false]);
    expect(s.equals(HashSet.of('a', 'b'))).toBe(true);
    expect(s.equals(s)).toBe(true);
    expect(s.hashCode()).toBe(HashSet.of('a', 'b').hashCode());
    expect(s.remove('a')).toBe(true);
    expect(m.containsKey('a')).toBe(false);
    const it = s.iterator();
    it.next();
    it.remove();
    expect(m.isEmpty()).toBe(true);
    expect(s.toString()).toBe('[]');
  });
  it('sequenced variant', () => {
    const m = new LinkedHashMap<number, boolean>();
    const s = C.newSequencedSetFromMap(m);
    s.add(2);
    s.addFirst(1);
    s.addLast(3);
    expect([...s]).toEqual([1, 2, 3]);
    expect([s.getFirst(), s.getLast()]).toEqual([1, 3]);
    expect([...s.reversed()]).toEqual([3, 2, 1]);
    s.reversed().addFirst(4);
    expect([...s]).toEqual([1, 2, 3, 4]);
    expect(s.removeFirst()).toBe(1);
    expect(s.removeLast()).toBe(4);
    expect([...m.keySet()]).toEqual([2, 3]);
  });
});

describe('C-7 empty sorted / navigable collections', () => {
  it('shared, empty, unmodifiable', () => {
    expect(C.emptySortedSet()).toBe(C.emptyNavigableSet());
    expect(C.emptySortedMap()).toBe(C.emptyNavigableMap());
    const s = C.emptyNavigableSet<number>();
    expect([s.size(), s.comparator(), s.lower(1), s.headSet(5).isEmpty()]).toEqual([0, null, null, true]);
    expectThrows(() => s.first(), NSEE);
    expectThrows(() => s.add(1), UOE);
    expectThrows(() => s.pollFirst(), UOE);
    expect(s.equals(new HashSet())).toBe(true);
    const m = C.emptyNavigableMap<number, number>();
    expect([m.size(), m.get(1), m.firstEntry(), m.tailMap(0).size()]).toEqual([0, null, null, 0]);
    expectThrows(() => m.firstKey(), NSEE);
    expectThrows(() => m.put(1, 1), UOE);
    expect(m.equals(new HashMap())).toBe(true);
  });
});

describe('C-8 / C-16 empty iterators and emptyList', () => {
  it.each([
    ['emptyIterator', () => C.emptyListIterator()],
    ['emptyListIterator', () => C.emptyListIterator()],
    ['emptyList().listIterator()', () => C.emptyList().listIterator()],
  ])('%s', (_n, make) => {
    const it = make();
    expect([it.hasNext(), it.hasPrevious(), it.nextIndex(), it.previousIndex()]).toEqual([false, false, 0, -1]);
    expectThrows(() => it.next(), NSEE);
    expectThrows(() => it.previous(), NSEE);
    expectThrows(() => it.remove(), ISE);
    expectThrows(() => it.set(1 as never), ISE);
    expectThrows(() => it.add(1 as never), UOE);
    expectThrows(() => it.forEachRemaining(N), NPE);
    it.forEachRemaining(() => {
      throw new Error('never');
    });
  });
  it('emptyIterator', () => {
    const it = C.emptyIterator();
    expect(it.hasNext()).toBe(false);
    expectThrows(() => it.next(), NSEE);
    expectThrows(() => it.remove(), ISE);
  });
  it('emptyList iterator is the empty iterator; sort is a no-op', () => {
    expect(C.emptyList().iterator()).toBe(C.emptyIterator());
    expectThrows(() => C.emptyList().iterator().remove(), ISE);
    C.emptyList<number>().sort((a, b) => a - b);
    C.sort(C.emptyList());
    expectThrows(() => C.emptyList().listIterator(1), IOOBE);
    expectThrows(() => C.emptyList().add(1), UOE);
  });
});

describe('C-9 asLifoQueue', () => {
  it('maps the queue onto the front of the deque', () => {
    const d = new ArrayDeque<number>();
    const q = C.asLifoQueue(d);
    expect(q.add(1)).toBe(true);
    expect(q.offer(2)).toBe(true);
    q.addAll(ArrayList.of(3, 4));
    expect([...d]).toEqual([4, 3, 2, 1]);
    expect([q.peek(), q.element(), q.size()]).toEqual([4, 4, 4]);
    expect(q.poll()).toBe(4);
    expect(q.remove()).toBe(3);
    expect(q.remove(1)).toBe(true);
    expect([...q]).toEqual([2]);
    expect(q.toString()).toBe('[2]');
    expect(q.equals(q)).toBe(true);
    expect(q.equals(d)).toBe(false);
    expect(q.hashCode()).toBe(identityHashCode(q));
    q.clear();
    expect([q.poll(), q.peek()]).toEqual([null, null]);
    expectThrows(() => q.remove(), NSEE);
    expectThrows(() => q.element(), NSEE);
  });
});

describe('C-10 EMPTY_* fields', () => {
  it('are the shared empty instances', () => {
    expect(Collections.EMPTY_LIST).toBe(C.emptyList());
    expect(Collections.EMPTY_SET).toBe(C.emptySet());
    expect(Collections.EMPTY_MAP).toBe(C.emptyMap());
    expect(C.EMPTY_LIST.size()).toBe(0);
  });
});

describe('C-13 Objects', () => {
  it('requireNonNull with message or supplier', () => {
    let calls = 0;
    const sup = () => (calls++, 'lazy');
    expect(Objects.requireNonNull(1, sup)).toBe(1);
    expect(calls).toBe(0);
    let err: any;
    try {
      Objects.requireNonNull(null, sup);
    } catch (e) {
      err = e;
    }
    expect([err.name, err.message, calls]).toEqual([NPE, 'lazy', 1]);
  });
  it('requireNonNullElse / ElseGet', () => {
    expect(Objects.requireNonNullElse(0, 5)).toBe(0);
    expect(Objects.requireNonNullElse(null, 5)).toBe(5);
    expect(Objects.requireNonNullElse(undefined, 'x')).toBe('x');
    expectThrows(() => Objects.requireNonNullElse(null, N), NPE);
    expect(Objects.requireNonNullElseGet(null, () => 7)).toBe(7);
    expect(Objects.requireNonNullElseGet(1, N)).toBe(1);
    expectThrows(() => Objects.requireNonNullElseGet(null, N), NPE);
    expectThrows(() => Objects.requireNonNullElseGet(null, () => null), NPE);
  });
  it('checkFromToIndex / checkFromIndexSize', () => {
    expect(Objects.checkFromToIndex(1, 3, 3)).toBe(1);
    expect(Objects.checkFromToIndex(3, 3, 3)).toBe(3);
    for (const [a, b, n] of [[-1, 2, 3], [2, 1, 3], [0, 4, 3], [0.5, 1, 3], [NaN, 1, 3], [0, 0, -1]]) {
      expectThrows(() => Objects.checkFromToIndex(a, b, n), IOOBE);
    }
    expect(Objects.checkFromIndexSize(1, 2, 3)).toBe(1);
    expect(Objects.checkFromIndexSize(3, 0, 3)).toBe(3);
    for (const [a, b, n] of [[-1, 1, 3], [2, 2, 3], [0, -1, 3], [0, 1, -1], [1.5, 1, 3]]) {
      expectThrows(() => Objects.checkFromIndexSize(a, b, n), IOOBE);
    }
  });
  it('toString with a null default', () => {
    expect([Objects.toString(null, 'd'), Objects.toString(undefined, 'd'), Objects.toString(1, 'd'), Objects.toString(undefined)]).toEqual([
      'd', 'd', '1', 'undefined',
    ]);
  });
  it('compare', () => {
    let called = false;
    const c = (a: unknown, b: unknown) => ((called = true), 1);
    const o = {};
    expect(Objects.compare(o, o, c)).toBe(0);
    expect(called).toBe(false);
    expect(Objects.compare(null, null, N)).toBe(0);
    expect(Objects.compare(1, 2, (a, b) => a - b)).toBe(-1);
  });
  it('deepEquals', () => {
    expect(Objects.deepEquals([1, [2, [new Point(1, 1)]]], [1, [2, [new Point(1, 1)]]])).toBe(true);
    expect(Objects.deepEquals([1, [2]], [1, [3]])).toBe(false);
    expect(Objects.deepEquals([1], [1, 2])).toBe(false);
    expect(Objects.deepEquals(new Int32Array([1, 2]), new Int32Array([1, 2]))).toBe(true);
    expect(Objects.deepEquals(new Int32Array([1]), new Float64Array([1]))).toBe(false);
    expect(Objects.deepEquals([1], new Int32Array([1]))).toBe(false);
    expect(Objects.deepEquals(null, null)).toBe(true);
    expect(Objects.deepEquals(null, [])).toBe(false);
    expect(Objects.deepEquals(NaN, NaN)).toBe(true);
    expect(Objects.deepEquals(new Point(1, 2), new Point(1, 2))).toBe(true);
  });
  it('toIdentityString ignores toString/hashCode', () => {
    const p = new Point(1, 2);
    expect(Objects.toIdentityString(p)).toBe(`Point@${(identityHashCode(p) >>> 0).toString(16)}`);
    expect(Objects.toIdentityString({})).toMatch(/^Object@[0-9a-f]+$/);
    expect(Objects.toIdentityString(Object.create(null))).toMatch(/^Object@/);
    expect(Objects.toIdentityString('s')).toMatch(/^string@/);
    expectThrows(() => Objects.toIdentityString(null), NPE);
  });
});

describe('C-15 rotate / nCopies reject non-integers on every list type', () => {
  const lists: [string, () => List<number>][] = [
    ['ArrayList', () => ArrayList.of(1, 2, 3)],
    ['LinkedList', () => LinkedList.of(1, 2, 3)],
    ['empty ArrayList', () => new ArrayList<number>()],
    ['empty LinkedList', () => new LinkedList<number>()],
  ];
  describe.each(lists)('%s', (_n, make) => {
    it.each([NaN, 1.5, Infinity, -Infinity])('rotate(%p)', (d) => expectThrows(() => C.rotate(make(), d), IAE));
    it('integer distances still work', () => {
      const l = make();
      C.rotate(l, -4);
      expect(l.size() === 0 || l.get(0) === 2).toBe(true);
    });
  });
  it.each([NaN, 1.5, -1, Infinity])('nCopies(%p)', (n) => expectThrows(() => C.nCopies(n, 'x'), IAE));
});

describe('C-17 Map.Entry statics', () => {
  const es = () => [IMap.entry('b', 1), IMap.entry('a', 3), IMap.entry('c', 2)];
  it('comparingByKey / comparingByValue', () => {
    expect(es().sort(IMap.Entry.comparingByKey()).map((e) => e.getKey())).toEqual(['a', 'b', 'c']);
    expect(es().sort(IMap.Entry.comparingByValue()).map((e) => e.getValue())).toEqual([1, 2, 3]);
    expect(es().sort(IMap.Entry.comparingByKey(Comparator.reverseOrder())).map((e) => e.getKey())).toEqual(['c', 'b', 'a']);
    expect(es().sort(IMap.Entry.comparingByValue((a: number, b: number) => b - a)).map((e) => e.getValue())).toEqual([3, 2, 1]);
    expectThrows(() => IMap.Entry.comparingByKey()(new SimpleEntry(null, 1), new SimpleEntry('a', 1)), NPE);
    expectThrows(() => IMap.Entry.comparingByValue()(new SimpleEntry('a', 1), new SimpleEntry('b', null)), NPE);
    expectThrows(() => IMap.Entry.comparingByKey(N), NPE);
    expectThrows(() => IMap.Entry.comparingByValue(N), NPE);
  });
  it('copyOf', () => {
    const src = new SimpleEntry('k', 1);
    const copy = IMap.Entry.copyOf(src);
    expect(copy.equals(src)).toBe(true);
    expect(copy).not.toBe(src);
    expectThrows(() => copy.setValue(2), UOE);
    src.setValue(5);
    expect(copy.getValue()).toBe(1);
    expect(IMap.Entry.copyOf(copy)).toBe(copy);
    const e = IMap.entry('x', 1);
    expect(IMap.Entry.copyOf(e)).toBe(e);
    expectThrows(() => IMap.Entry.copyOf(N), NPE);
    expectThrows(() => IMap.Entry.copyOf(new SimpleEntry(null, 1)), NPE);
    expectThrows(() => IMap.Entry.copyOf(new SimpleEntry('k', undefined)), NPE);
  });
});

function causeOf(f: () => unknown): { name: string; message: string; cause?: any } {
  try {
    f();
  } catch (e) {
    return e as any;
  }
  throw new Error('nothing thrown');
}

describe('C-18 ofLazy (preview)', () => {
  it('List.ofLazy computes each element once, on first access', () => {
    const calls: number[] = [];
    const l = IList.ofLazy(4, (i) => (calls.push(i), i * 10));
    expect(calls).toEqual([]);
    expect(l.size()).toBe(4);
    expect(l.get(2)).toBe(20);
    expect(l.get(2)).toBe(20);
    expect(calls).toEqual([2]);
    expect(l.subList(1, 3).get(0)).toBe(10);
    expect(l.reversed().get(0)).toBe(30);
    expect(calls).toEqual([2, 1, 3]);
    expect(l.equals(ArrayList.of(0, 10, 20, 30))).toBe(true);
    expect(l.toString()).toBe('[0, 10, 20, 30]');
    expect(calls.sort()).toEqual([0, 1, 2, 3]);
    expect(l.indexOf(30)).toBe(3);
    expect(l.contains(5)).toBe(false);
    expectThrows(() => l.contains(null), NPE);
    expectThrows(() => l.get(4), IOOBE);
    expectThrows(() => l.set(0, 1), UOE);
    expectThrows(() => l.add(1), UOE);
    expectThrows(() => l.subList(0, 1).set(0, 1), UOE);
    expect(C.unmodifiableList(l)).not.toBe(l); // only the wrapper's own class is returned as-is
  });
  it('List.ofLazy argument checks', () => {
    expectThrows(() => IList.ofLazy(-1, (i) => i), IAE);
    expectThrows(() => IList.ofLazy(1.5, (i) => i), IAE);
    expectThrows(() => IList.ofLazy(1, N), NPE);
    expect(IList.ofLazy(0, N === 1 ? N : (i) => i).isEmpty()).toBe(true);
  });
  it('failures: NoSuchElementException with cause, then error state without re-invoking', () => {
    let calls = 0;
    const boom = new RangeError('boom');
    const l = IList.ofLazy(2, (i) => {
      calls++;
      if (i === 0) throw boom;
      return null as unknown as number;
    });
    const first = causeOf(() => l.get(0));
    expect([first.name, first.cause]).toEqual([NSEE, boom]);
    const again = causeOf(() => l.get(0));
    expect(again.name).toBe(NSEE);
    expect(again.cause).toBeUndefined();
    expect(again.message).toContain('RangeError');
    const nul = causeOf(() => l.get(1));
    expect([nul.name, nul.cause?.name]).toEqual([NSEE, NPE]);
    expectThrows(() => l.get(1), NSEE);
    expect(calls).toBe(2);
    expectThrows(() => l.hashCode(), NSEE);
    expectThrows(() => l.toString(), NSEE);
  });
  it('recursive access for the same index', () => {
    const l: List<number> = IList.ofLazy(1, () => l.get(0) + 1);
    const e = causeOf(() => l.get(0));
    expect(e.name).toBe(NSEE);
    expect(e.cause?.name).toBe(NSEE);
    expect(e.cause?.cause?.name).toBe(ISE);
  });
  it('Set.ofLazy computes membership once per candidate', () => {
    const calls: number[] = [];
    const cands = HashSet.of(1, 2, 3, 4);
    const s = ISet.ofLazy(cands, (x) => (calls.push(x), x % 2 === 0));
    cands.add(6);
    expect(calls).toEqual([]);
    expect(s.contains(2)).toBe(true);
    expect(s.contains(3)).toBe(false);
    expect(s.contains(2)).toBe(true);
    expect(s.contains(6)).toBe(false);
    expect(calls).toEqual([2, 3]);
    expect(s.size()).toBe(2);
    expect(s.equals(HashSet.of(2, 4))).toBe(true);
    expect([...s].sort()).toEqual([2, 4]);
    expect(calls.sort()).toEqual([1, 2, 3, 4]);
    const it = s.iterator();
    it.next();
    it.next();
    expect(it.hasNext()).toBe(false);
    expectThrows(() => it.next(), NSEE);
    expectThrows(() => it.remove(), UOE);
    expectThrows(() => s.contains(null), NPE);
    expectThrows(() => s.add(8), UOE);
    expectThrows(() => ISet.ofLazy(N, () => true), NPE);
    expectThrows(() => ISet.ofLazy(HashSet.of<number | null>(1, null), () => true), NPE);
    expectThrows(() => ISet.ofLazy(HashSet.of(1), N), NPE);
  });
  it('Set.ofLazy failures', () => {
    let calls = 0;
    const s = ISet.ofLazy(HashSet.of('a'), () => {
      calls++;
      throw new TypeError('t');
    });
    expect(causeOf(() => s.contains('a')).cause?.name).toBe('TypeError');
    expect(causeOf(() => s.contains('a')).message).toContain('TypeError');
    expectThrows(() => s.size(), NSEE);
    expect(calls).toBe(1);
  });
  it('Map.ofLazy computes each value once, on first access', () => {
    const calls: string[] = [];
    const keys = HashSet.of('a', 'bb', 'ccc');
    const m = IMap.ofLazy(keys, (k) => (calls.push(k), k.length));
    keys.add('dddd');
    expect([m.size(), m.containsKey('a'), m.containsKey('dddd'), m.get('zz'), m.getOrDefault('zz', 0)]).toEqual([3, true, false, null, 0]);
    expect(calls).toEqual([]);
    expect(m.get('bb')).toBe(2);
    expect(m.getOrDefault('bb', 0)).toBe(2);
    expect(calls).toEqual(['bb']);
    expect(m.keySet().equals(HashSet.of('a', 'bb', 'ccc'))).toBe(true);
    expect(calls).toEqual(['bb']);
    expect(m.containsValue(3)).toBe(true);
    expect(m.equals(HashMap.of(['a', 1], ['bb', 2], ['ccc', 3]))).toBe(true);
    expect([...m.values()].sort()).toEqual([1, 2, 3]);
    expect(calls.sort()).toEqual(['a', 'bb', 'ccc']);
    expect(m.entrySet().contains(IMap.entry('a', 1))).toBe(true);
    expect(m.entrySet().contains(new SimpleEntry(null, 1))).toBe(false);
    expectThrows(() => m.entrySet().iterator().next().setValue(1), UOE);
    expectThrows(() => m.get(null), NPE);
    expectThrows(() => m.containsKey(null), NPE);
    expectThrows(() => m.containsValue(null), NPE);
    expectThrows(() => m.put('a', 1), UOE);
    expect(C.unmodifiableMap(m)).not.toBe(m); // only the wrapper's own class is returned as-is
    expectThrows(() => IMap.ofLazy(N, (k) => k), NPE);
    expectThrows(() => IMap.ofLazy(HashSet.of(1), N), NPE);
    expectThrows(() => IMap.ofLazy(HashSet.of<number | null>(null), (k) => k), NPE);
  });
  it('Map.ofLazy failures and null results', () => {
    let calls = 0;
    const m = IMap.ofLazy(HashSet.of(1, 2), (k) => {
      calls++;
      if (k === 1) throw new RangeError('r');
      return undefined as unknown as number;
    });
    expect(causeOf(() => m.get(1)).cause?.name).toBe('RangeError');
    expect(causeOf(() => m.get(1)).message).toContain('RangeError');
    expect(causeOf(() => m.get(2)).cause?.name).toBe(NPE);
    expectThrows(() => m.toString(), NSEE);
    expectThrows(() => m.hashCode(), NSEE);
    expect(calls).toBe(2);
  });
});

describe('C-19 shuffle random sources', () => {
  it('accepts a nextInt(bound) generator', () => {
    const bounds: number[] = [];
    const l = ArrayList.of(1, 2, 3, 4);
    C.shuffle(l, { nextInt: (b) => (bounds.push(b), 0) });
    expect(bounds).toEqual([4, 3, 2]);
    expect(l.toArray()).toEqual([2, 3, 4, 1]);
    const ll = LinkedList.of(1, 2, 3, 4);
    C.shuffle(ll, { nextInt: () => 0 });
    expect(ll.toArray()).toEqual([2, 3, 4, 1]);
  });
  it('accepts a () => number in [0, 1)', () => {
    const l = ArrayList.of(1, 2, 3, 4);
    C.shuffle(l, () => 0.999);
    expect(l.toArray()).toEqual([1, 2, 3, 4]);
  });
});

describe('legacy enumerations', () => {
  it('enumeration / list / emptyEnumeration', () => {
    const e = C.enumeration(ArrayList.of(1, 2, 3));
    expect(e.hasMoreElements()).toBe(true);
    expect(e.nextElement()).toBe(1);
    const it = e.asIterator();
    expect(it.next()).toBe(2);
    expectThrows(() => it.remove(), UOE);
    const rest: number[] = [];
    it.forEachRemaining((x) => rest.push(x));
    expect(rest).toEqual([3]);
    expectThrows(() => e.nextElement(), NSEE);
    const l = C.list(C.enumeration(TreeSet.of(3, 1, 2)));
    expect(l).toBeInstanceOf(ArrayList);
    expect(l.toArray()).toEqual([1, 2, 3]);
    const empty = C.emptyEnumeration();
    expect(empty.hasMoreElements()).toBe(false);
    expectThrows(() => empty.nextElement(), NSEE);
    expect(empty.asIterator()).toBe(C.emptyIterator());
    expect(C.list(empty).isEmpty()).toBe(true);
  });
});

const isNum = (x: unknown): x is number => typeof x === 'number';
const isStr = (x: unknown): x is string => typeof x === 'string';

describe('checked wrappers', () => {
  it('checkedList checks every insertion path', () => {
    const base = ArrayList.of(1, 2);
    const l = C.checkedList(base as List<any>, isNum);
    l.add(3);
    l.add(0, 0);
    l.set(0, 9);
    l.addAll(ArrayList.of(4));
    l.addAll(0, ArrayList.of(5));
    l.addFirst(6);
    l.addLast(7);
    l.add(null);
    expect(base.toArray()).toEqual([6, 5, 9, 1, 2, 3, 4, 7, null]);
    const bad: [string, () => unknown][] = [
      ['add', () => l.add('x')],
      ['add(i, e)', () => l.add(0, 'x')],
      ['set', () => l.set(0, 'x')],
      ['addAll', () => l.addAll(ArrayList.of<any>(1, 'x'))],
      ['addAll(i, c)', () => l.addAll(0, ArrayList.of('x'))],
      ['addFirst', () => l.addFirst('x')],
      ['addLast', () => l.addLast('x')],
      ['replaceAll', () => l.replaceAll(() => 'x')],
      ['listIterator.add', () => l.listIterator().add('x')],
      ['listIterator.set', () => {
        const it = l.listIterator();
        it.next();
        it.set('x');
      }],
      ['subList.add', () => l.subList(0, 1).add('x')],
      ['subList.subList.set', () => l.subList(0, 3).subList(0, 1).set(0, 'x')],
      ['reversed.add', () => l.reversed().add('x')],
    ];
    for (const [, f] of bad) expectThrows(f, CCE);
    expect(base.size()).toBe(9);
    expect(l.equals(base)).toBe(true);
    expect(l.hashCode()).toBe(base.hashCode());
    expect(l.get(0)).toBe(6);
    l.removeAt(0);
    expect(base.size()).toBe(8);
  });
  it('checkedCollection uses identity equality; checkedSet/Queue/sorted sets', () => {
    const base = ArrayList.of(1);
    const c = C.checkedCollection(base as any, isNum);
    expect(c.equals(base)).toBe(false);
    expect(c.equals(c)).toBe(true);
    expect(c.hashCode()).toBe(identityHashCode(c));
    expectThrows(() => c.add('x'), CCE);
    const s = C.checkedSet(new HashSet<any>(), isStr);
    s.add('a');
    expectThrows(() => s.add(1), CCE);
    expect(s.equals(HashSet.of('a'))).toBe(true);
    const q = C.checkedQueue(new ArrayDeque<any>(), isNum);
    q.offer(1);
    expectThrows(() => q.offer('x'), CCE);
    expectThrows(() => q.add('x'), CCE);
    expect(q.poll()).toBe(1);
    const ns = C.checkedNavigableSet(TreeSet.of<any>(1, 5, 9), isNum);
    expectThrows(() => ns.headSet(5).add('a'), CCE);
    expectThrows(() => ns.tailSet(5, true).add('a'), CCE);
    expectThrows(() => ns.subSet(1, true, 9, true).add('a'), CCE);
    expectThrows(() => ns.descendingSet().add('a'), CCE);
    ns.headSet(5).add(2);
    expect(ns.contains(2)).toBe(true);
    const ss = C.checkedSortedSet(TreeSet.of<any>(1), isNum);
    expectThrows(() => ss.addAll(ArrayList.of<any>(2, 'x')), CCE);
    expect(ss.size()).toBe(1);
    expectThrows(() => C.checkedList(new ArrayList(), N), NPE);
  });
  it('checkedMap checks keys and values on every path', () => {
    const base = new HashMap<any, any>();
    const m = C.checkedMap(base, isStr, isNum);
    m.put('a', 1);
    m.putIfAbsent('b', 2);
    m.merge('a', 1, (x: number, y: number) => x + y);
    m.compute('c', () => 3);
    m.computeIfAbsent('d', () => 4);
    m.computeIfPresent('d', (_k: string, v: number) => v + 1);
    m.replace('d', 6);
    m.replace('d', 6, 7);
    m.putAll(HashMap.of(['e', 8]));
    m.replaceAll((_k: string, v: number) => v * 1);
    expect(base.equals(HashMap.of(['a', 2], ['b', 2], ['c', 3], ['d', 7], ['e', 8]))).toBe(true);
    const bad: (() => unknown)[] = [
      () => m.put(1, 1),
      () => m.put('k', 'x'),
      () => m.putIfAbsent('k', 'x'),
      () => m.replace('a', 'x'),
      () => m.replace('a', 2, 'x'),
      () => m.putAll(HashMap.of<any, any>(['z', 1], [2, 2])),
      () => m.replaceAll(() => 'x'),
      () => m.compute('a', () => 'x'),
      () => m.computeIfAbsent('zz', () => 'x'),
      () => m.computeIfPresent('a', () => 'x'),
      () => m.merge('a', 'x', () => 1),
      () => m.merge('a', 1, () => 'x'),
      () => m.entrySet().iterator().next().setValue('x'),
      () => m.entrySet().toArray()[0].setValue('x'),
      () => m.entrySet().toArray((n) => new Array<MapEntry<any, any>>(n))[0].setValue('x'),
      () => [...m.entrySet()][0].setValue('x'),
      () => m.entrySet().forEach((e) => e.setValue('x')),
    ];
    for (const f of bad) expectThrows(f, CCE);
    expect(base.containsKey('z')).toBe(false);
    expect(base.size()).toBe(5);
    m.entrySet().iterator().next().setValue(100);
    expect(base.containsValue(100)).toBe(true);
    m.put('n', null);
    expect(m.equals(base)).toBe(true);
    expect(m.entrySet().contains(m.entrySet().iterator().next())).toBe(true);
  });
  it('checked sorted / navigable maps check sub-map views', () => {
    const base = new TreeMap<any, any>();
    const m = C.checkedNavigableMap(base, isNum, isStr);
    m.put(1, 'a');
    m.put(5, 'e');
    for (const v of [m.headMap(5), m.tailMap(1, true), m.subMap(0, true, 9, true), m.descendingMap(), m.reversed()]) {
      expectThrows(() => v.put(2, 2), CCE);
    }
    m.headMap(5).put(2, 'b');
    expect(base.get(2)).toBe('b');
    expectThrows(() => m.firstEntry()!.setValue(1 as any), UOE);
    const sm = C.checkedSortedMap(new TreeMap<any, any>(), isNum, isStr);
    expectThrows(() => sm.put('k', 'v'), CCE);
    expectThrows(() => C.checkedMap(new HashMap(), isStr, N), NPE);
  });
});

describe('synchronized wrappers', () => {
  it('delegate everything; equality follows the reference', () => {
    const base = ArrayList.of(1, 2);
    const c = C.synchronizedCollection(base);
    c.add(3);
    expect(base.toArray()).toEqual([1, 2, 3]);
    expect(c.equals(base)).toBe(false);
    expect(c.equals(c)).toBe(true);
    expect(c.hashCode()).toBe(identityHashCode(c));
    const l = C.synchronizedList(base);
    expect(l).not.toBe(base);
    expect(l.equals(base)).toBe(true);
    expect(l.hashCode()).toBe(base.hashCode());
    l.subList(0, 1).clear();
    expect(base.toArray()).toEqual([2, 3]);
    expect([...l]).toEqual([2, 3]);
    expect(l.toString()).toBe('[2, 3]');
    const s = C.synchronizedSet(HashSet.of(1));
    expect(s.equals(HashSet.of(1))).toBe(true);
    const ss = C.synchronizedSortedSet(TreeSet.of(3, 1));
    expect(ss.first()).toBe(1);
    const ns = C.synchronizedNavigableSet(TreeSet.of(3, 1));
    expect(ns.pollFirst()).toBe(1);
    const m = C.synchronizedMap(HashMap.of(['a', 1]));
    m.put('b', 2);
    expect(m.equals(HashMap.of(['a', 1], ['b', 2]))).toBe(true);
    const sm = C.synchronizedSortedMap(new TreeMap(HashMap.of([2, 'b'], [1, 'a'])));
    expect(sm.firstKey()).toBe(1);
    const nm = C.synchronizedNavigableMap(new TreeMap(HashMap.of([2, 'b'], [1, 'a'])));
    expect(nm.ceilingKey(2)).toBe(2);
    expect(nm).toBeInstanceOf(TreeMap);
  });
});

describe('toArray(generator) on wrappers and immutable collections', () => {
  const gen = (n: number) => new Float64Array(n);
  it.each([
    ['List.of', () => IList.of(1, 2)],
    ['List.of subList', () => IList.of(0, 1, 2).subList(1, 3)],
    ['Set.of', () => ISet.of(1, 2)],
    ['unmodifiableSequencedSet', () => C.unmodifiableSequencedSet(LinkedHashSet.of(1, 2))],
    ['unmodifiableCollection', () => C.unmodifiableCollection(ArrayList.of(1, 2))],
    ['unmodifiableList', () => C.unmodifiableList(LinkedList.of(1, 2))],
    ['unmodifiableSet', () => C.unmodifiableSet(TreeSet.of(1, 2))],
    ['Map.of keySet', () => IMap.of(1, 'a', 2, 'b').keySet()],
    ['Map.of values', () => IMap.of('a', 1, 'b', 2).values()],
    ['List.ofLazy', () => IList.ofLazy(2, (i) => i + 1)],
  ])('%s', (_n, make) => {
    const a = make().toArray(gen);
    expect(a).toBeInstanceOf(Float64Array);
    expect([...a].sort()).toEqual([1, 2]);
    expectThrows(() => make().toArray(() => new Float64Array(1)), IOOBE);
    expectThrows(() => make().toArray(N), NPE);
  });
  it('entry sets', () => {
    const es = IMap.of('a', 1).entrySet().toArray((n) => new Array<MapEntry<string, number>>(n));
    expect(es[0].getKey()).toBe('a');
    const ue = C.unmodifiableMap(HashMap.of(['a', 1])).entrySet().toArray((n) => new Array<MapEntry<string, number>>(n));
    expectThrows(() => ue[0].setValue(2), UOE);
    expect(ue.length).toBe(1);
  });
});

describe('unmodifiable wrappers: removeFirst/removeLast/pollFirstEntry on empty sources (reference parity)', () => {
  type Case = [string, (empty: boolean) => unknown];
  const al = (e: boolean) => (e ? new ArrayList<number>() : ArrayList.of(1));
  const lhs = (e: boolean) => (e ? new LinkedHashSet<number>() : LinkedHashSet.of(1));
  const ts = (e: boolean) => (e ? new TreeSet<number>() : TreeSet.of(1));
  const lhm = (e: boolean) => {
    const m = new LinkedHashMap<number, number>();
    if (!e) m.put(1, 1);
    return m;
  };
  const tm = (e: boolean) => {
    const m = new TreeMap<number, number>();
    if (!e) m.put(1, 1);
    return m;
  };
  // empty: NoSuchElementException; non-empty: UnsupportedOperationException
  const nsee: Case[] = [
    ['unmodifiableList.removeFirst', (e) => C.unmodifiableList(al(e)).removeFirst()],
    ['unmodifiableList.removeLast', (e) => C.unmodifiableList(al(e)).removeLast()],
    ['unmodifiableList(LinkedList).removeFirst', (e) => C.unmodifiableList(e ? new LinkedList<number>() : LinkedList.of(1)).removeFirst()],
    ['unmodifiableList.reversed.removeLast', (e) => C.unmodifiableList(al(e)).reversed().removeLast()],
    ['unmodifiableList.subList.removeFirst', (e) => C.unmodifiableList(al(e)).subList(0, e ? 0 : 1).removeFirst()],
    ['unmodifiableSortedSet.removeFirst', (e) => C.unmodifiableSortedSet(ts(e)).removeFirst()],
    ['unmodifiableSortedSet.removeLast', (e) => C.unmodifiableSortedSet(ts(e)).removeLast()],
    ['unmodifiableNavigableSet.removeFirst', (e) => C.unmodifiableNavigableSet(ts(e)).removeFirst()],
    ['unmodifiableNavigableSet.reversed.removeFirst', (e) => C.unmodifiableNavigableSet(ts(e)).reversed().removeFirst()],
    ['unmodifiableSequencedMap.sequencedKeySet.removeFirst', (e) => C.unmodifiableSequencedMap(lhm(e)).sequencedKeySet().removeFirst()],
    ['unmodifiableSequencedMap.sequencedValues.removeFirst', (e) => C.unmodifiableSequencedMap(lhm(e)).sequencedValues().removeFirst()],
    ['unmodifiableSequencedMap.sequencedEntrySet.removeLast', (e) => C.unmodifiableSequencedMap(lhm(e)).sequencedEntrySet().removeLast()],
    ['unmodifiableSequencedMap.sequencedKeySet.reversed.removeFirst', (e) => C.unmodifiableSequencedMap(lhm(e)).sequencedKeySet().reversed().removeFirst()],
    ['unmodifiableSequencedMap.sequencedValues.reversed.removeFirst', (e) => C.unmodifiableSequencedMap(lhm(e)).sequencedValues().reversed().removeFirst()],
    ['unmodifiableSequencedMap.sequencedEntrySet.reversed.removeFirst', (e) => C.unmodifiableSequencedMap(lhm(e)).sequencedEntrySet().reversed().removeFirst()],
    ['unmodifiableSequencedMap.reversed.sequencedKeySet.removeFirst', (e) => C.unmodifiableSequencedMap(lhm(e)).reversed().sequencedKeySet().removeFirst()],
    ['unmodifiableNavigableMap.sequencedKeySet.removeFirst', (e) => C.unmodifiableNavigableMap(tm(e)).sequencedKeySet().removeFirst()],
    ['unmodifiableNavigableMap.sequencedValues.removeFirst', (e) => C.unmodifiableNavigableMap(tm(e)).sequencedValues().removeFirst()],
    ['unmodifiableNavigableMap.navigableKeySet.removeFirst', (e) => C.unmodifiableNavigableMap(tm(e)).navigableKeySet().removeFirst()],
  ];
  // always UnsupportedOperationException
  const always: Case[] = [
    ['unmodifiableSequencedCollection(ArrayDeque).removeFirst', (e) => C.unmodifiableSequencedCollection(e ? new ArrayDeque<number>() : ArrayDeque.of(1)).removeFirst()],
    ['unmodifiableSequencedCollection(ArrayList).removeLast', (e) => C.unmodifiableSequencedCollection(al(e)).removeLast()],
    ['unmodifiableSequencedCollection.reversed.removeFirst', (e) => C.unmodifiableSequencedCollection(al(e)).reversed().removeFirst()],
    ['unmodifiableSequencedSet.removeFirst', (e) => C.unmodifiableSequencedSet(lhs(e)).removeFirst()],
    ['unmodifiableSequencedSet.reversed.removeLast', (e) => C.unmodifiableSequencedSet(lhs(e)).reversed().removeLast()],
    ['unmodifiableNavigableSet.pollFirst', (e) => C.unmodifiableNavigableSet(ts(e)).pollFirst()],
    ['unmodifiableNavigableSet.descendingSet.pollFirst', (e) => C.unmodifiableNavigableSet(ts(e)).descendingSet().pollFirst()],
    ['unmodifiableSequencedMap.pollFirstEntry', (e) => C.unmodifiableSequencedMap(lhm(e)).pollFirstEntry()],
    ['unmodifiableSequencedMap.reversed.pollLastEntry', (e) => C.unmodifiableSequencedMap(lhm(e)).reversed().pollLastEntry()],
    ['unmodifiableNavigableMap.pollFirstEntry', (e) => C.unmodifiableNavigableMap(tm(e)).pollFirstEntry()],
    ['unmodifiableNavigableMap.pollLastEntry', (e) => C.unmodifiableNavigableMap(tm(e)).pollLastEntry()],
  ];
  // empty: null; non-empty: UnsupportedOperationException
  const nullWhenEmpty: Case[] = [
    ['unmodifiableSortedMap.pollFirstEntry', (e) => C.unmodifiableSortedMap(tm(e)).pollFirstEntry()],
    ['unmodifiableSortedMap.pollLastEntry', (e) => C.unmodifiableSortedMap(tm(e)).pollLastEntry()],
    ['unmodifiableSortedMap.headMap.pollFirstEntry', (e) => (C.unmodifiableSortedMap(tm(e)).headMap(5) as TreeMap<number, number>).pollFirstEntry()],
    ['unmodifiableSortedMap.reversed.pollFirstEntry', (e) => C.unmodifiableSortedMap(tm(e)).reversed().pollFirstEntry()],
    ['unmodifiableSortedMap(unmodifiableNavigableMap).pollFirstEntry', (e) => C.unmodifiableSortedMap(C.unmodifiableNavigableMap(tm(e))).pollFirstEntry()],
  ];

  it.each(nsee)('%s: NoSuchElementException when empty, UnsupportedOperationException otherwise', (_n, f) => {
    expectThrows(() => f(true), NSEE);
    expectThrows(() => f(false), UOE);
  });
  it.each(always)('%s: UnsupportedOperationException, empty or not', (_n, f) => {
    expectThrows(() => f(true), UOE);
    expectThrows(() => f(false), UOE);
  });
  it.each(nullWhenEmpty)('%s: null when empty, UnsupportedOperationException otherwise', (_n, f) => {
    expect(f(true)).toBeNull();
    expectThrows(() => f(false), UOE);
  });
  it('the source is left unchanged', () => {
    const l = ArrayList.of(1);
    expectThrows(() => C.unmodifiableList(l).removeFirst(), UOE);
    expect(l.size()).toBe(1);
  });
  it('re-wrapping: unmodifiableSortedMap keeps its own wrapper, unmodifiableNavigableMap wraps a sorted-map wrapper', () => {
    const s = C.unmodifiableSortedMap(tm(true));
    expect(C.unmodifiableSortedMap(s)).toBe(s);
    const n = C.unmodifiableNavigableMap(tm(true));
    expect(C.unmodifiableNavigableMap(n)).toBe(n);
    expect(C.unmodifiableSortedMap(n)).not.toBe(n);
  });
});

describe('disjoint follows the reference algorithm', () => {
  it('an empty Set still sees contains(e) of the other side: TreeSet rejects null', () => {
    expectThrows(() => C.disjoint(new TreeSet<number>(), ArrayList.of<number | null>(null)), NPE);
    expectThrows(() => C.disjoint(ArrayList.of<number | null>(null), new TreeSet<number>()), NPE);
    expectThrows(() => C.disjoint(ISet.of<number>(), ArrayList.of<number | null>(null)), NPE);
  });
  it('the empty shortcut applies when neither side is a Set', () => {
    expect(C.disjoint(new ArrayList<number>(), IList.of(1))).toBe(true);
    // IList.of rejects contains(null) but is never asked: the other side is empty
    expect(C.disjoint(IList.of(1), ArrayList.of<number | null>())).toBe(true);
  });
  it('which side is asked contains()', () => {
    const asked: string[] = [];
    const spy = <E>(name: string, c: { contains(o: unknown): boolean }) => {
      const orig = c.contains.bind(c);
      c.contains = (o: unknown) => (asked.push(name), orig(o));
      return c as unknown as E;
    };
    // c1 a Set: c1 is asked
    C.disjoint(spy('set1', HashSet.of(1)), spy('set2', HashSet.of(2, 3, 4)));
    expect([...new globalThis.Set(asked)]).toEqual(['set1']);
    asked.length = 0;
    // only c2 a Set: c2 is asked
    C.disjoint(spy('list', ArrayList.of(1, 2, 3)), spy('set', HashSet.of(9)));
    expect([...new globalThis.Set(asked)]).toEqual(['set']);
    asked.length = 0;
    // no Set: the larger side is asked; equal sizes ask c2
    C.disjoint(spy('big', ArrayList.of(1, 2, 3)), spy('small', ArrayList.of(9)));
    expect([...new globalThis.Set(asked)]).toEqual(['big']);
    asked.length = 0;
    C.disjoint(spy('a', ArrayList.of(1)), spy('b', ArrayList.of(9)));
    expect(asked).toEqual(['b']);
  });
  it('results', () => {
    expect(C.disjoint(HashSet.of(1), ArrayList.of(1))).toBe(false);
    expect(C.disjoint(ArrayList.of(2), HashSet.of(1))).toBe(true);
    expect(C.disjoint(new HashSet<number>(), new ArrayList<number>())).toBe(true);
  });
});
