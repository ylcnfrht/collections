import { mapContract } from './contracts/map';
import { navigableMapContract } from './contracts/navigableMap';
import { SimpleImmutableEntry } from '../src/abstract/AbstractMap';
import { MapEntry, NavigableMap, SortedMap } from '../src/interfaces/Map';
import { TreeMap, natCmp } from '../src/map/TreeMap';
import { naturalCompare } from '../src/util/Comparator';
import { expectThrows, Point, rng } from './helpers';
import { SimpleMap } from './support';

mapContract('TreeMap', () => new TreeMap(), { allowsNullKey: false, allowsNullValue: true, requiresComparableKeys: true, detectsComodificationInCompute: true });
navigableMapContract('TreeMap', (c) => new TreeMap(c));

// a wide range view behaves like a whole map: natural ordering plus two sentinels below/above every key
const LOW = Symbol('low');
const HIGH = Symbol('high');
const bracketed = (a: unknown, b: unknown): number =>
  a === b && (a === LOW || a === HIGH) ? 0 : a === LOW || b === HIGH ? -1 : a === HIGH || b === LOW ? 1 : naturalCompare(a, b);
mapContract('TreeMap.subMap view', () => new TreeMap<any, any>(bracketed).subMap(LOW, false, HIGH, false), {
  allowsNullKey: false,
  allowsNullValue: true,
  requiresComparableKeys: true,
  skipScale: true,
  detectsComodificationInCompute: true,
});
// descending view of a map that held data and was cleared
mapContract(
  'TreeMap.descendingMap view',
  () => {
    const m = new TreeMap<any, any>();
    for (let i = 0; i < 20; i++) m.put(i, i);
    m.clear();
    return m.descendingMap();
  },
  { allowsNullKey: false, allowsNullValue: true, requiresComparableKeys: true, detectsComodificationInCompute: true }
);

const keys = (m: { keySet(): Iterable<unknown> }) => [...m.keySet()];
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const of = (...ks: number[]) => {
  const m = new TreeMap<number, string>();
  for (const k of ks) m.put(k, `v${k}`);
  return m;
};
const pair = (e: MapEntry<unknown, unknown> | null) => (e === null ? null : [e.getKey(), e.getValue()]);

describe('TreeMap · red-black invariants', () => {
  it('random inserts and deletes keep the tree valid', () => {
    const r = rng(42);
    const m = new TreeMap<number, number>();
    for (let i = 0; i < 5000; i++) {
      const k = r(2000);
      if (r(3) === 0) m.remove(k);
      else m.put(k, i);
      if (i % 250 === 0) m.__checkInvariants();
    }
    m.__checkInvariants();
  });
  it('ascending inserts then deletes', () => {
    const m = new TreeMap<number, number>();
    for (let i = 0; i < 3000; i++) m.put(i, i);
    m.__checkInvariants();
    for (let i = 0; i < 3000; i += 2) m.remove(i);
    m.__checkInvariants();
    expect(m.size()).toBe(1500);
    expect(m.firstKey()).toBe(1);
  });
  it('descending inserts then deletes from the top', () => {
    const m = new TreeMap<number, number>();
    for (let i = 3000; i > 0; i--) m.put(i, i);
    m.__checkInvariants();
    for (let i = 3000; i > 1000; i--) m.remove(i);
    m.__checkInvariants();
    expect([m.size(), m.lastKey()]).toEqual([1000, 1000]);
  });
  it('deleting the root and inner nodes with two children', () => {
    const m = of(...range(255));
    for (let round = 0; round < 200; round++) {
      // the root of a balanced tree almost always has two children
      const root = m.firstKey() + Math.floor(m.size() / 2);
      m.remove(m.ceilingKey(root)!);
      m.__checkInvariants();
    }
    expect(m.size()).toBe(55);
  });
  it('pollFirst/pollLast drain keeps the tree valid', () => {
    const m = of(...range(1000));
    let i = 0;
    while (!m.isEmpty()) {
      if (i++ % 2) m.pollFirstEntry();
      else m.pollLastEntry();
      if (i % 97 === 0) m.__checkInvariants();
    }
    m.__checkInvariants();
  });
  it('__checkInvariants detects corruption', () => {
    const m = of(1, 2, 3);
    (m as any).root.red = true;
    expect(() => m.__checkInvariants()).toThrow(/root is red/);
    (m as any).root.red = false;
    (m as any).count = 7;
    expect(() => m.__checkInvariants()).toThrow(/size/);
    (m as any).count = 3;
    (m as any).root.left.key = 9;
    expect(() => m.__checkInvariants()).toThrow(/order/);
  });
  it('__checkInvariants detects red-red, black height and parent faults', () => {
    const m = of(1, 2, 3, 4);
    const root = (m as any).root;
    root.right.red = true;
    root.right.right.red = true;
    expect(() => m.__checkInvariants()).toThrow(/red-red/);
    const m2 = of(1, 2, 3);
    (m2 as any).root.left.red = false;
    expect(() => m2.__checkInvariants()).toThrow(/black height/);
    const m3 = of(1, 2, 3);
    (m3 as any).root.left.parent = null;
    expect(() => m3.__checkInvariants()).toThrow(/parent/);
    const m4 = of(1, 2, 3);
    (m4 as any).root.parent = (m4 as any).root.left;
    expect(() => m4.__checkInvariants()).toThrow(/root has a parent/);
  });
});

describe('TreeMap · iterator removal', () => {
  it('removing every other key, including two-child nodes, neither skips nor duplicates', () => {
    const m = of(...range(500));
    const it = m.keySet().iterator();
    const seen: number[] = [];
    while (it.hasNext()) {
      const k = it.next();
      seen.push(k);
      if (k % 2 === 0) it.remove();
    }
    expect(seen).toEqual(range(500));
    expect(keys(m)).toEqual(range(500).filter((k) => k % 2));
    m.__checkInvariants();
  });
  it('removing everything through the entry iterator', () => {
    const m = of(...range(300));
    const it = m.entrySet().iterator();
    const seen: number[] = [];
    while (it.hasNext()) {
      seen.push(it.next().getKey() as number);
      it.remove();
    }
    expect([seen, m.size()]).toEqual([range(300), 0]);
  });
  it('descending iterator removal of two-child nodes', () => {
    const m = of(...range(300));
    const it = m.descendingKeySet().iterator();
    const seen: number[] = [];
    while (it.hasNext()) {
      const k = it.next();
      seen.push(k);
      if (k % 3 === 0) it.remove();
    }
    expect(seen).toEqual(range(300).reverse());
    expect(keys(m)).toEqual(range(300).filter((k) => k % 3));
    m.__checkInvariants();
  });
  it('sub-view iteration with removal stops at the fence even when the fence key moves', () => {
    const m = of(...range(200));
    const v = m.subMap(50, 150);
    const it = v.keySet().iterator();
    const seen: number[] = [];
    while (it.hasNext()) {
      const k = it.next();
      seen.push(k);
      it.remove();
    }
    expect(seen).toEqual(range(100).map((i) => i + 50));
    expect(m.size()).toBe(100);
    expect([m.lowerKey(150), m.ceilingKey(50)]).toEqual([49, 150]);
    m.__checkInvariants();
  });
  it('remove() rules: IllegalStateException before next and twice', () => {
    const it = of(1, 2).values().iterator();
    expectThrows(() => it.remove(), 'IllegalStateException');
    it.next();
    it.remove();
    expectThrows(() => it.remove(), 'IllegalStateException');
  });
  it('iterator.remove after a foreign change throws ConcurrentModificationException', () => {
    const m = of(1, 2, 3);
    const it = m.keySet().iterator();
    it.next();
    m.put(9, 'x');
    expectThrows(() => it.remove(), 'ConcurrentModificationException');
  });
  it('setValue on an iterated entry is not structural', () => {
    const m = of(1, 2);
    const it = m.entrySet().iterator();
    it.next().setValue('a');
    expect(it.next().getKey()).toBe(2);
    expect(m.get(1)).toBe('a');
  });
  it('for..of over a view is fail-fast', () => {
    const m = of(1, 2, 3);
    expect(() => {
      for (const k of m.keySet()) m.put(k + 10, 'x');
    }).toThrow();
  });
  it('for..of over the map stops cleanly on break', () => {
    const m = of(1, 2, 3);
    const out: number[] = [];
    for (const [k] of m) {
      out.push(k);
      if (k === 2) break;
    }
    expect(out).toEqual([1, 2]);
  });
  it('JS iterators are plain objects, not generators', () => {
    const m = of(1);
    const its: any[] = [m[Symbol.iterator](), m.keySet()[Symbol.iterator](), m.values()[Symbol.iterator](), m.entrySet()[Symbol.iterator](), m.headMap(5)[Symbol.iterator]()];
    for (const it of its) {
      expect(Object.prototype.toString.call(it)).toBe('[object Object]');
      expect(it[Symbol.iterator]()).toBe(it);
      expect(it.return!(undefined)).toEqual({ done: true, value: undefined });
      expect(() => it.throw!(new Error('boom'))).toThrow('boom');
    }
  });
  it('forEach and replaceAll are fail-fast', () => {
    const m = of(1, 2);
    expectThrows(() => m.forEach((k) => m.put(k + 5, 'x')), 'ConcurrentModificationException');
    expectThrows(() => m.replaceAll((k) => (m.remove(k), 'y')), 'ConcurrentModificationException');
  });
  it('forEachRemaining walks in order', () => {
    const it = of(3, 1, 2).keySet().iterator();
    it.next();
    const out: number[] = [];
    it.forEachRemaining((k) => out.push(k));
    expect(out).toEqual([2, 3]);
  });
});

describe('TreeMap · range views', () => {
  it('nested sub-views', () => {
    const m = of(...range(20));
    const v = m.subMap(2, true, 18, false).tailMap(5, false).headMap(15, true).descendingMap().subMap(12, true, 8, true);
    expect(keys(v)).toEqual([12, 11, 10, 9, 8]);
    expect(v.firstKey()).toBe(12);
    expect(v.pollLastEntry()!.getKey()).toBe(8);
    expect(m.containsKey(8)).toBe(false);
  });
  it('views reflect base modifications', () => {
    const m = of(1, 5, 9);
    const v = m.subMap(2, true, 9, false);
    const d = v.descendingMap();
    m.put(3, 'v3');
    m.put(9, 'x');
    m.remove(5);
    expect([keys(v), keys(d), v.size(), d.size()]).toEqual([[3], [3], 1, 1]);
    m.clear();
    expect([v.isEmpty(), d.isEmpty(), v.firstEntry()]).toEqual([true, true, null]);
  });
  it('descending view of a sub-view mirrors navigation', () => {
    const d = of(...range(10)).subMap(2, true, 7, true).descendingMap();
    expect([d.firstKey(), d.lastKey(), d.lowerKey(5), d.higherKey(5), d.floorKey(100), d.ceilingKey(-5)]).toEqual([7, 2, 6, 4, null, null]);
    expect([d.higherKey(2), d.lowerKey(7), d.floorKey(1), d.ceilingKey(8)]).toEqual([null, null, 2, 7]);
    expect([pair(d.floorEntry(5)), pair(d.ceilingEntry(5)), pair(d.lowerEntry(3)), pair(d.higherEntry(3))]).toEqual([
      [5, 'v5'],
      [5, 'v5'],
      [4, 'v4'],
      [2, 'v2'],
    ]);
    expect([pair(d.firstEntry()), pair(d.lastEntry())]).toEqual([[7, 'v7'], [2, 'v2']]);
    expect(keys(d.headMap(5))).toEqual([7, 6]);
    expect(keys(d.tailMap(5))).toEqual([5, 4, 3, 2]);
    expect(keys(d.subMap(6, 3))).toEqual([6, 5, 4]);
    expect(keys(d.descendingMap())).toEqual([2, 3, 4, 5, 6, 7]);
    expect([...d.descendingKeySet()]).toEqual([2, 3, 4, 5, 6, 7]);
  });
  it('view navigation clamps to the range', () => {
    const v = of(...range(10)).subMap(3, false, 7, false);
    expect([v.ceilingKey(-1), v.higherKey(-1), v.floorKey(99), v.lowerKey(99), v.ceilingKey(99), v.floorKey(-1)]).toEqual([4, 4, 6, 6, null, null]);
    expect([v.firstKey(), v.lastKey(), v.size()]).toEqual([4, 6, 3]);
    expectThrows(() => of().headMap(3).firstKey(), 'NoSuchElementException');
    expectThrows(() => of(5).headMap(3).lastKey(), 'NoSuchElementException');
  });
  it('bounds that are not present in the map', () => {
    const m = of(10, 20, 30, 40);
    expect(keys(m.subMap(15, 35))).toEqual([20, 30]);
    expect(keys(m.headMap(25, true))).toEqual([10, 20]);
    expect(keys(m.tailMap(25, false))).toEqual([30, 40]);
  });
  it('view put/remove/clear and IllegalArgumentException outside the range', () => {
    const m = of(1, 2, 3, 4, 5);
    const v = m.subMap(2, true, 4, true);
    expect(v.put(3, 'x')).toBe('v3');
    expectThrows(() => v.put(5, 'y'), 'IllegalArgumentException');
    expectThrows(() => v.descendingMap().put(1, 'y'), 'IllegalArgumentException');
    expect([v.remove(5), v.remove(2, 'nope'), v.remove(2, 'v2'), v.remove(9, 'v9')]).toEqual([null, false, true, false]);
    expect(keys(m)).toEqual([1, 3, 4, 5]);
    v.clear();
    expect(keys(m)).toEqual([1, 5]);
  });
  it('view getOrDefault / replace / compute go through the range', () => {
    const m = of(1, 2, 3);
    const v = m.headMap(3);
    expect([v.getOrDefault(2, 'd'), v.getOrDefault(3, 'd'), v.replace(2, 'r'), v.replace(3, 'r')]).toEqual(['v2', 'd', 'v2', null]);
    expect(v.compute(0, () => 'c')).toBe('c');
    expect(m.get(0)).toBe('c');
  });
  it('fromKey > toKey and nested inverted ranges throw IllegalArgumentException', () => {
    const m = of(1, 2, 3);
    expectThrows(() => m.subMap(3, true, 1, true), 'IllegalArgumentException');
    expectThrows(() => m.headMap(2).tailMap(3), 'IllegalArgumentException');
    expectThrows(() => m.descendingMap().subMap(1, 3), 'IllegalArgumentException');
  });
  it('nested bounds: exclusive may sit on the parent edge, inclusive or outside throws', () => {
    const m = of(1, 2, 3, 4, 5);
    expect(m.headMap(2, false).tailMap(2, false).size()).toBe(0);
    expect(keys(m.headMap(4).subMap(2, 4))).toEqual([2, 3]);
    expect(keys(m.headMap(2, true).tailMap(2, true))).toEqual([2]);
    expectThrows(() => m.headMap(2).tailMap(2), 'IllegalArgumentException');
    expectThrows(() => m.headMap(4, false).headMap(4, true), 'IllegalArgumentException');
    expectThrows(() => m.headMap(5).tailMap(2).subMap(3, 10), 'IllegalArgumentException');
    expectThrows(() => m.tailMap(2, false).subMap(2, true, 3, true), 'IllegalArgumentException');
    expectThrows(() => m.subMap(2, true, 4, true).descendingMap().headMap(5), 'IllegalArgumentException');
    expect(keys(m.subMap(2, true, 4, true).descendingMap().tailMap(3, false))).toEqual([2]);
  });

  it('null bounds with natural ordering throw NullPointerException', () => {
    expectThrows(() => of(1).headMap(null as any), 'NullPointerException');
    expectThrows(() => of(1).subMap(1, null as any), 'NullPointerException');
    expectThrows(() => of(1).descendingMap().get(null), 'NullPointerException');
  });
  it('view entrySet / values / keySet sequenced operations', () => {
    const m = of(1, 2, 3, 4);
    const v = m.tailMap(2, true);
    expect([v.sequencedEntrySet().getFirst().getKey(), v.sequencedEntrySet().getLast().getKey()]).toEqual([2, 4]);
    expect([v.sequencedValues().getFirst(), v.sequencedValues().getLast()]).toEqual(['v2', 'v4']);
    expect([...v.sequencedValues().reversed()]).toEqual(['v4', 'v3', 'v2']);
    expect([...v.sequencedEntrySet().reversed()].map((e) => e.getKey())).toEqual([4, 3, 2]);
    expect([...v.sequencedKeySet().reversed()]).toEqual([4, 3, 2]);
    expect(v.sequencedValues().removeFirst()).toBe('v2');
    expect(v.sequencedValues().removeLast()).toBe('v4');
    expect(v.sequencedEntrySet().removeFirst().getKey()).toBe(3);
    expectThrows(() => v.sequencedEntrySet().removeLast(), 'NoSuchElementException');
    expectThrows(() => v.sequencedValues().getFirst(), 'NoSuchElementException');
    expect(keys(m)).toEqual([1]);
    expectThrows(() => v.sequencedValues().addFirst('x'), 'UnsupportedOperationException');
    expectThrows(() => v.sequencedValues().addLast('x'), 'UnsupportedOperationException');
    expectThrows(() => v.sequencedEntrySet().addFirst(new SimpleImmutableEntry(9, 'x')), 'UnsupportedOperationException');
    expectThrows(() => v.sequencedEntrySet().addLast(new SimpleImmutableEntry(9, 'x')), 'UnsupportedOperationException');
    expectThrows(() => v.putFirst(5, 'x'), 'UnsupportedOperationException');
    expectThrows(() => v.putLast(5, 'x'), 'UnsupportedOperationException');
    expect(v.reversed().comparator()!(1, 2)).toBeGreaterThan(0);
  });
  it('view entrySet contains/remove respect the range', () => {
    const m = of(1, 2, 3);
    const es = m.headMap(2).entrySet();
    expect([es.contains(new SimpleImmutableEntry(1, 'v1')), es.contains(new SimpleImmutableEntry(3, 'v3')), es.contains('x')]).toEqual([true, false, false]);
    expect([es.remove(new SimpleImmutableEntry(3, 'v3')), es.remove(new SimpleImmutableEntry(1, 'v1'))]).toEqual([false, true]);
    expect([...es]).toEqual([]);
    expect([es.isEmpty(), m.size()]).toEqual([true, 2]);
  });
  it('view values contains / clear', () => {
    const m = of(1, 2, 3);
    const vs = m.tailMap(2).values();
    expect([vs.contains('v1'), vs.contains('v3'), vs.isEmpty()]).toEqual([false, true, false]);
    vs.clear();
    expect(keys(m)).toEqual([1]);
  });
  it('descendingMap comparator is reversed natural / reversed custom', () => {
    expect(of().descendingMap().comparator()!(1, 2)).toBeGreaterThan(0);
    const c = (a: number, b: number) => b - a;
    expect(new TreeMap<number, number>(c).descendingMap().comparator()!(1, 2)).toBeLessThan(0);
    expect(of().headMap(1).comparator()).toBeNull();
  });
  it('views are cached', () => {
    const m = of(1);
    expect([m.keySet() === m.keySet(), m.values() === m.values(), m.entrySet() === m.entrySet(), m.descendingMap() === m.descendingMap()]).toEqual([true, true, true, true]);
    const v = m.headMap(5, false);
    expect([v.keySet() === v.navigableKeySet(), v.values() === v.values(), v.entrySet() === v.entrySet(), v.descendingMap() === v.descendingMap()]).toEqual([true, true, true, true]);
  });
});

describe('TreeMap · comparators', () => {
  it('reverse comparator', () => {
    const m = new TreeMap<number, number>((a, b) => b - a);
    [5, 1, 3].forEach((k) => m.put(k, k));
    expect([keys(m), m.firstKey(), m.floorKey(4), m.ceilingKey(4)]).toEqual([[5, 3, 1], 5, 5, 3]);
  });
  it('case-insensitive comparator keeps the first key instance and replaces the value', () => {
    const m = new TreeMap<string, number>((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    m.put('Hello', 1);
    expect(m.put('HELLO', 2)).toBe(1);
    expect([m.size(), m.get('hello'), keys(m), m.containsKey('hElLo')]).toEqual([1, 2, ['Hello'], true]);
    expect(m.remove('HELLO')).toBe(2);
  });
  it('a comparator accepting null keys', () => {
    const m = new TreeMap<number | null, string>((a, b) => (a === null ? (b === null ? 0 : -1) : b === null ? 1 : a - b));
    m.put(2, 'b');
    m.put(null, 'n');
    expect([m.firstKey(), m.get(null), m.containsKey(null), keys(m)]).toEqual([null, 'n', true, [null, 2]]);
    m.__checkInvariants();
  });
  it('a comparator that rejects a key leaves the map unchanged', () => {
    const m = new TreeMap<any, number>((a: number, b: number) => {
      if (typeof a !== 'number' || typeof b !== 'number') throw new TypeError('numbers only');
      return a - b;
    });
    expect(() => m.put('x', 1)).toThrow(TypeError);
    m.put(1, 1);
    expect(() => m.put('x', 1)).toThrow(TypeError);
    expect(m.size()).toBe(1);
  });
});

describe('TreeMap · key types', () => {
  it('mixed-type ClassCastException leaves the tree unchanged', () => {
    const m = of(1, 2, 3);
    const before = m.toString();
    expectThrows(() => (m as any).put('a', 'x'), 'ClassCastException');
    expectThrows(() => (m as any).get('a'), 'ClassCastException');
    expectThrows(() => (m as any).put({}, 'x'), 'ClassCastException');
    expect([m.toString(), m.size()]).toEqual([before, 3]);
    m.__checkInvariants();
  });
  it('first key is type-checked against itself', () => {
    expectThrows(() => new TreeMap().put({}, 1), 'ClassCastException');
    expectThrows(() => new TreeMap().put(undefined, 1), 'NullPointerException');
    expectThrows(() => new TreeMap().get(undefined), 'NullPointerException');
    expectThrows(() => new TreeMap().put(Symbol('s'), 1), 'ClassCastException');
  });
  it('NaN sorts last and -0 equals 0', () => {
    const m = new TreeMap<number, string>();
    [NaN, 3, -Infinity, -0, Infinity, 1.5].forEach((k) => m.put(k, String(k)));
    expect(keys(m)).toEqual([-Infinity, -0, 1.5, 3, Infinity, NaN]);
    expect(m.put(0, 'zero')).toBe('0');
    expect(Object.is(m.firstEntry() && m.higherKey(-Infinity), -0)).toBe(true);
    expect([m.get(NaN), m.lastKey(), m.lowerKey(NaN), m.higherKey(Infinity), m.floorKey(NaN), m.ceilingKey(1e300)]).toEqual(['NaN', NaN, Infinity, NaN, NaN, Infinity]);
    expect([m.get(2), m.get(1e308), m.containsKey(-1)]).toEqual([null, null, false]);
    expect(m.size()).toBe(6);
    m.values().clear();
    expect(m.isEmpty()).toBe(true);
  });
  it('Date keys by time', () => {
    const m = new TreeMap<Date, number>();
    m.put(new Date(30), 3);
    m.put(new Date(10), 1);
    expect([m.get(new Date(30)), m.firstKey().getTime(), m.put(new Date(10), 9)]).toEqual([3, 10, 1]);
  });
  it('bigint keys', () => {
    const m = new TreeMap<bigint, number>();
    [3n, 10n ** 20n, -1n].forEach((k, i) => m.put(k, i));
    expect([keys(m), m.floorKey(5n)]).toEqual([[-1n, 3n, 10n ** 20n], 3n]);
  });
  it('boolean keys', () => {
    const m = new TreeMap<boolean, number>(SimpleMap.of([true, 1], [false, 0]));
    expect([keys(m), keys(m.subMap(false, false, true, true)), keys(m.subMap(false, true))]).toEqual([[false, true], [true], [false]]);
  });
  it('Comparable objects', () => {
    const m = new TreeMap<Point, number>();
    m.put(new Point(2, 0), 1);
    m.put(new Point(1, 5), 2);
    expect(m.firstKey().toString()).toBe('(1,5)');
  });
  it('the natural fast path agrees with naturalCompare', () => {
    const vals: unknown[] = [0, -0, 1, -1, NaN, Infinity, -Infinity, 1e-300, '', 'a', 'B', 'ab', '￿', '😀'];
    for (const a of vals)
      for (const b of vals) {
        if (typeof a !== typeof b) continue;
        expect([a, b, Math.sign(natCmp(a, b))]).toEqual([a, b, Math.sign(naturalCompare(a, b))]);
      }
  });
});

describe('TreeMap · navigation and default methods', () => {
  it('navigation entries are immutable snapshots', () => {
    const m = of(1, 2, 3);
    for (const e of [m.firstEntry(), m.lastEntry(), m.floorEntry(2), m.ceilingEntry(2), m.lowerEntry(3), m.higherEntry(1), m.headMap(3).firstEntry()]) {
      expect(e).toBeInstanceOf(SimpleImmutableEntry);
      expectThrows(() => e!.setValue('z'), 'UnsupportedOperationException');
    }
    const e = m.pollFirstEntry()!;
    expectThrows(() => e.setValue('z'), 'UnsupportedOperationException');
    expect(pair(e)).toEqual([1, 'v1']);
  });
  it('entry objects from iteration write through and compare like entries', () => {
    const m = of(1);
    const e = m.entrySet().iterator().next();
    expect([e.equals(new SimpleImmutableEntry(1, 'v1')), e.hashCode(), e.toString()]).toEqual([true, new SimpleImmutableEntry(1, 'v1').hashCode(), '1=v1']);
  });
  it('putIfAbsent replaces a null value', () => {
    const m = new TreeMap<number, string | null>();
    m.put(1, null);
    expect([m.putIfAbsent(1, 'a'), m.get(1), m.putIfAbsent(1, 'b'), m.get(1)]).toEqual([null, 'a', 'a', 'a']);
  });
  it('compute family with null values', () => {
    const m = new TreeMap<number, string | null>();
    m.put(1, null);
    expect([m.computeIfPresent(1, () => 'x'), m.containsKey(1)]).toEqual([null, true]);
    expect(m.computeIfAbsent(1, () => 'a')).toBe('a');
    expect(m.compute(2, (_k, v) => v ?? 'n')).toBe('n');
    expect(m.compute(9, () => null)).toBeNull();
    expect(m.merge(1, 'b', (a, b) => a! + b!)).toBe('ab');
    expect(m.merge(1, 'c', () => null)).toBeNull();
    expect(m.computeIfPresent(2, () => undefined)).toBeNull();
    expect(m.isEmpty()).toBe(true);
    m.__checkInvariants();
  });
  it('compute family: structural changes inside the callback throw ConcurrentModificationException', () => {
    const m = of(1, 2);
    const CME = 'ConcurrentModificationException';
    expectThrows(() => m.computeIfAbsent(3, () => (m.put(4, 'z'), 'a')), CME);
    expectThrows(() => m.computeIfPresent(1, () => (m.remove(2), 'a')), CME);
    expectThrows(() => m.compute(5, () => (m.put(5, 'w'), null)), CME);
    expectThrows(() => m.merge(1, 'b', () => (m.pollLastEntry(), 'c')), CME);
    expect(keys(m)).toEqual([1, 4]);
    expect(m.compute(1, (_k, v) => (m.put(4, 'value only'), v + '!'))).toBe('v1!');
    m.__checkInvariants();
  });
  it('getOrDefault / containsValue / replace / remove(k, v)', () => {
    const m = of(1, 2);
    expect([m.getOrDefault(1, 'd'), m.getOrDefault(5, 'd'), m.containsValue('v2'), m.containsValue('v9')]).toEqual(['v1', 'd', true, false]);
    expect([m.replace(1, 'a'), m.replace(1, 'a', 'b'), m.get(1), m.remove(2, 'x'), m.remove(2, 'v2'), m.remove(2, 'v2')]).toEqual(['v1', true, 'b', false, true, false]);
  });
  it('forEach / replaceAll in key order', () => {
    const m = of(3, 1, 2);
    const seen: number[] = [];
    m.forEach((k) => seen.push(k));
    m.replaceAll((k, v) => v + k);
    expect([seen, [...m.values()]]).toEqual([[1, 2, 3], ['v11', 'v22', 'v33']]);
  });
  it('model-based: put/remove/floor/ceiling/higher/lower/poll/subMap vs a sorted array', () => {
    const r = rng(2024);
    const m = new TreeMap<number, number>();
    let ref: number[] = [];
    const vals = new globalThis.Map<number, number>();
    const lb = (k: number) => {
      let lo = 0;
      let hi = ref.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (ref[mid] < k) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    };
    for (let step = 0; step < 20000; step++) {
      const k = r(500);
      const i = lb(k);
      const has = ref[i] === k;
      switch (r(8)) {
        case 0:
        case 1:
          expect(m.put(k, step)).toBe(has ? vals.get(k) : null);
          if (!has) ref.splice(i, 0, k);
          vals.set(k, step);
          break;
        case 2:
          expect(m.remove(k)).toBe(has ? vals.get(k) : null);
          if (has) ref.splice(i, 1);
          break;
        case 3:
          expect([m.floorKey(k), m.ceilingKey(k)]).toEqual([has ? k : (ref[i - 1] ?? null), ref[i] ?? null]);
          break;
        case 4:
          expect([m.lowerKey(k), m.higherKey(k)]).toEqual([ref[i - 1] ?? null, ref[has ? i + 1 : i] ?? null]);
          break;
        case 5: {
          const e = r(2) ? m.pollFirstEntry() : m.pollLastEntry();
          if (e !== null) ref = ref.filter((x) => x !== e.getKey());
          break;
        }
        case 6: {
          const hi = k + r(100);
          expect(m.subMap(k, hi).size()).toBe(lb(hi) - i);
          expect(m.subMap(k, true, hi, false).descendingMap().size()).toBe(lb(hi) - i);
          break;
        }
        case 7:
          expect(m.size()).toBe(ref.length);
          break;
      }
      if (step % 2000 === 0) m.__checkInvariants();
    }
    expect(keys(m)).toEqual(ref);
    m.__checkInvariants();
  });
});

describe('TreeMap · construction, clone, equality', () => {
  it('copy constructor inherits a sorted map comparator', () => {
    const c = (a: number, b: number) => b - a;
    const src = new TreeMap<number, string>(c);
    src.put(1, 'a');
    src.put(2, 'b');
    const copy = new TreeMap<number, string>(src);
    expect([copy.comparator(), keys(copy)]).toEqual([c, [2, 1]]);
    const fromPlain = new TreeMap<number, number>(SimpleMap.of([3, 3], [1, 1]));
    expect([fromPlain.comparator(), keys(fromPlain)]).toEqual([null, [1, 3]]);
    expect(new TreeMap<number, number>(null).comparator()).toBeNull();
    expectThrows(() => new TreeMap(5 as any), 'IllegalArgumentException');
  });
  it('clone keeps the runtime subclass, its fields and the comparator', () => {
    class Sub<K, V> extends TreeMap<K, V> {
      tag = 'sub';
    }
    const desc = (a: number, b: number) => b - a;
    const m = new Sub<number, string>(desc);
    [1, 3, 2].forEach((k) => m.put(k, `v${k}`));
    m.keySet();
    m.descendingMap();
    const c = m.clone() as Sub<number, string>;
    c.put(0, 'v0');
    expect([c instanceof Sub, c.tag, c.comparator(), keys(c), keys(m), keys(c.descendingMap())]).toEqual([true, 'sub', desc, [3, 2, 1, 0], [3, 2, 1], [0, 1, 2, 3]]);
    expect(new Sub().clone()).toBeInstanceOf(Sub);
    c.__checkInvariants();
  });
  it('clone is independent', () => {
    const m = of(1, 2);
    const c = m.clone();
    c.put(3, 'v3');
    m.remove(1);
    expect([keys(m), keys(c), c.comparator()]).toEqual([[2], [1, 2, 3], null]);
    c.__checkInvariants();
  });
  it('equals / hashCode with other maps and views', () => {
    const m = of(1, 2);
    expect([m.equals(SimpleMap.of([2, 'v2'], [1, 'v1'])), m.hashCode() === SimpleMap.of([1, 'v1'], [2, 'v2']).hashCode()]).toEqual([true, true]);
    expect(m.equals(SimpleMap.of(['a', 1], ['b', 2]))).toBe(false);
    expect(m.headMap(5).equals(m)).toBe(true);
  });
  it('reversed / sequenced views of the whole map', () => {
    const m = of(1, 2, 3);
    expect([keys(m.reversed()), [...m.sequencedValues()], [...m.sequencedEntrySet()].length, [...m.sequencedKeySet()]]).toEqual([[3, 2, 1], ['v1', 'v2', 'v3'], 3, [1, 2, 3]]);
    expect([...m.values().reversed()]).toEqual(['v3', 'v2', 'v1']);
  });
  it('100k sequential puts then removals stay balanced and fast', () => {
    const m = new TreeMap<number, number>();
    for (let i = 0; i < 100_000; i++) m.put(i, i);
    m.__checkInvariants();
    for (let i = 0; i < 100_000; i += 3) m.remove(i);
    m.__checkInvariants();
    expect(m.size()).toBe(66_666);
  });
  it('a full-range descending view is O(1) sized and clears the base', () => {
    const m = of(1, 2, 3);
    const d: NavigableMap<number, string> = m.descendingMap();
    expect([d.size(), d.isEmpty()]).toEqual([3, false]);
    d.clear();
    expect(m.isEmpty()).toBe(true);
  });
});

describe('TreeMap · interfaces and views', () => {
  it('SortedMap.reversed() is typed as a SortedMap', () => {
    const m: SortedMap<number, string> = new TreeMap<number, string>();
    m.put(1, 'a');
    m.put(2, 'b');
    const r: SortedMap<number, string> = m.reversed();
    expect([r.firstKey(), r.comparator()!(1, 2) > 0]).toEqual([2, true]);
  });
  it('view toArray(generator)', () => {
    const m = of(1, 2, 3);
    expect(m.keySet().toArray((n) => new Float64Array(n))).toEqual(new Float64Array([1, 2, 3]));
    expect(m.headMap(3).values().toArray((n) => new Array<string>(n))).toEqual(['v1', 'v2']);
    expect(m.descendingMap().entrySet().toArray((n) => new Array<MapEntry<number, string>>(n)).map((e) => e.getKey())).toEqual([3, 2, 1]);
  });
});

// every result below was verified on the reference
describe('TreeMap · check order (as the reference)', () => {
  const t = (f: () => unknown): unknown => {
    try {
      return f();
    } catch (e) {
      return (e as Error).name;
    }
  };
  it('an empty map never compares the key in compute/computeIfAbsent', () => {
    const m = new TreeMap<number, number>();
    expect(t(() => m.compute(null as unknown as number, () => null))).toBeNull();
    expect(t(() => m.computeIfAbsent(null as unknown as number, () => null))).toBeNull();
    expect(t(() => m.compute(null as unknown as number, () => 1))).toBe('NullPointerException');
    expect(t(() => m.merge(null as unknown as number, 1, (x) => x))).toBe('NullPointerException');
  });
  it('range views report the range before a null argument', () => {
    const h = new TreeMap<number, number>().headMap(6, true);
    const nul = null as unknown as never;
    expect(t(() => h.merge(7, nul, (x) => x))).toBe('IllegalArgumentException');
    expect(t(() => h.merge(7, 1, nul))).toBe('IllegalArgumentException');
    expect(t(() => h.merge(5, nul, (x) => x))).toBe('NullPointerException');
    expect(t(() => h.computeIfPresent(7, nul))).toBeNull();
    expect(t(() => h.compute(7, nul))).toBe('NullPointerException');
    expect(t(() => h.computeIfAbsent(7, nul))).toBe('NullPointerException');
    expect(t(() => h.compute(5, nul))).toBe('NullPointerException');
  });
  it('a descending view checks its fromKey first', () => {
    const s = new TreeMap<string, number>().descendingMap().headMap('a', false).navigableKeySet();
    expect(t(() => s.subSet('a', true, null as unknown as string, false))).toBe('IllegalArgumentException');
    expect(t(() => s.subSet('b', true, null as unknown as string, true))).toBe('NullPointerException');
    expect(t(() => s.subSet(null as unknown as string, true, 'a', true))).toBe('NullPointerException');
    const d = new TreeMap<string, number>().descendingMap().headMap('m', true);
    expect(t(() => d.subMap('n', true, 'a', true))).toBe('IllegalArgumentException');
    expect(t(() => d.subMap('z', true, 'q', true).size())).toBe(0);
  });
});

describe('TreeMap · sequenced views (as the reference)', () => {
  // verified on the reference: SequencedMap's default views refuse add/addAll even when nothing would change
  it('sequencedKeySet/Values/EntrySet().addAll(empty) throw; the plain views do not', () => {
    const m = new TreeMap<number, number>();
    m.put(1, 1);
    m.put(2, 2);
    expectThrows(() => m.sequencedKeySet().addAll(new TreeMap<number, number>().keySet()), 'UnsupportedOperationException');
    expectThrows(() => m.sequencedValues().addAll(new TreeMap<number, number>().values()), 'UnsupportedOperationException');
    expectThrows(() => m.sequencedEntrySet().addAll(new TreeMap<number, number>().entrySet()), 'UnsupportedOperationException');
    expectThrows(() => m.sequencedKeySet().reversed().addAll(new TreeMap<number, number>().keySet()), 'UnsupportedOperationException');
    expectThrows(() => m.descendingMap().sequencedValues().addAll(new TreeMap<number, number>().values()), 'UnsupportedOperationException');
    expect(m.keySet().addAll(new TreeMap<number, number>().keySet())).toBe(false);
    expect(m.sequencedKeySet().reversed().toString()).toBe('[2, 1]');
    expect(m.sequencedKeySet().removeFirst()).toBe(1);
    expect(m.toString()).toBe('{2=2}');
  });
});
