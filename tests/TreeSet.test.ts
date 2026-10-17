import { collectionContract } from './contracts/collection';
import { navigableSetContract } from './contracts/navigableSet';
import { setContract } from './contracts/set';
import { AbstractSet } from '../src/abstract/AbstractSet';
import { TreeMap } from '../src/map/TreeMap';
import { TreeSet } from '../src/set/TreeSet';
import { Comparator } from '../src/util/Comparator';
import { expectThrows, Point, rng } from './helpers';
import { SimpleList, SimpleSet } from './support';

collectionContract('TreeSet', () => new TreeSet(), { allowsNull: false, allowsDuplicates: false, requiresComparable: true });
setContract('TreeSet', () => new TreeSet());
navigableSetContract('TreeSet', (c) => new TreeSet(c));

// views run the same contracts: the descending view of a TreeSet is itself a full NavigableSet
collectionContract('TreeSet.descendingSet', () => new TreeSet().descendingSet(), { allowsNull: false, allowsDuplicates: false, requiresComparable: true });
setContract('TreeSet.descendingSet', () => new TreeSet().descendingSet());

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const of = (...xs: number[]) => TreeSet.of(...xs);
const check = (s: TreeSet<any>) => ((s as any).m as TreeMap<unknown, unknown>).__checkInvariants();

describe('TreeSet · construction', () => {
  it('extends AbstractSet', () => expect(new TreeSet()).toBeInstanceOf(AbstractSet));
  it('of() sorts and dedupes', () => expect(TreeSet.of(3, 1, 3, 2).toArray()).toEqual([1, 2, 3]));
  it('(comparator)', () => {
    const s = new TreeSet<number>((a, b) => b - a);
    s.addAll(SimpleList.of(1, 3, 2));
    expect(s.toArray()).toEqual([3, 2, 1]);
  });
  it('(null) is natural ordering', () => expect(new TreeSet<number>(null).comparator()).toBeNull());
  it('(collection) copies a plain collection with natural ordering', () => {
    const s = new TreeSet<number>(SimpleList.of(5, 1, 5, 3));
    expect([s.toArray(), s.comparator()]).toEqual([[1, 3, 5], null]);
  });
  it('(sorted set) inherits the comparator', () => {
    const c = (a: number, b: number) => b - a;
    const src = new TreeSet<number>(c);
    src.add(1);
    src.add(2);
    const copy = new TreeSet<number>(src);
    expect([copy.comparator(), copy.toArray()]).toEqual([c, [2, 1]]);
  });
  it('(descending view) inherits the reversed comparator', () => {
    const copy = new TreeSet<number>(of(1, 2, 3).descendingSet());
    expect(copy.toArray()).toEqual([3, 2, 1]);
    copy.add(4);
    expect(copy.first()).toBe(4);
  });
  it('(map key set) inherits the map comparator', () => {
    const m = new TreeMap<number, number>(Comparator.reverseOrder());
    m.put(1, 1);
    m.put(2, 2);
    expect(new TreeSet<number>(m.keySet()).toArray()).toEqual([2, 1]);
  });
  it('(collection) with a null element throws NullPointerException', () => expectThrows(() => new TreeSet<unknown>(SimpleList.of(1, null)), 'NullPointerException'));
  it('clone is independent and keeps the comparator', () => {
    const c = (a: number, b: number) => b - a;
    const s = new TreeSet<number>(c);
    [1, 2, 3].forEach((x) => s.add(x));
    const k = s.clone();
    k.add(4);
    s.remove(1);
    expect([s.toArray(), k.toArray(), k.comparator()]).toEqual([[3, 2], [4, 3, 2, 1], c]);
    check(k);
  });
});

describe('TreeSet · invariants', () => {
  it('thousands of random adds and removes', () => {
    const r = rng(77);
    const s = new TreeSet<number>();
    for (let i = 0; i < 8000; i++) {
      const v = r(3000);
      if (r(2)) s.add(v);
      else s.remove(v);
      if (i % 500 === 0) check(s);
    }
    check(s);
  });
  it('ascending and descending sequences', () => {
    const s = new TreeSet<number>();
    for (let i = 0; i < 2000; i++) s.add(i);
    for (let i = 4000; i >= 2000; i--) s.add(i);
    check(s);
    for (let i = 0; i < 4000; i += 2) s.remove(i);
    check(s);
    expect([s.size(), s.first(), s.last()]).toEqual([2001, 1, 4000]);
  });
  it('removing middle elements (two children) keeps order', () => {
    const s = of(...range(127));
    for (const x of [63, 31, 95, 15, 47, 79, 111]) {
      expect(s.remove(x)).toBe(true);
      check(s);
    }
    expect(s.size()).toBe(120);
    expect(s.toArray()).toEqual(range(127).filter((x) => ![63, 31, 95, 15, 47, 79, 111].includes(x)));
  });
});

describe('TreeSet · iterators', () => {
  it('iterator.remove of two-child nodes during iteration', () => {
    const s = of(...range(400));
    const it = s.iterator();
    const seen: number[] = [];
    while (it.hasNext()) {
      const x = it.next();
      seen.push(x);
      if (x % 4 !== 1) it.remove();
    }
    expect(seen).toEqual(range(400));
    expect(s.toArray()).toEqual(range(400).filter((x) => x % 4 === 1));
    check(s);
  });
  it('descendingIterator.remove of two-child nodes', () => {
    const s = of(...range(400));
    const it = s.descendingIterator();
    const seen: number[] = [];
    while (it.hasNext()) {
      const x = it.next();
      seen.push(x);
      if (x % 2) it.remove();
    }
    expect(seen).toEqual(range(400).reverse());
    expect(s.toArray()).toEqual(range(400).filter((x) => x % 2 === 0));
    check(s);
  });
  it('sub-view iterator removal, ascending and descending', () => {
    const s = of(...range(100));
    const it = s.subSet(10, 90).iterator();
    while (it.hasNext()) if (it.next() % 2) it.remove();
    const d = s.subSet(10, true, 90, true).descendingIterator();
    while (d.hasNext()) if (d.next() % 3 === 0) d.remove();
    expect(s.subSet(10, 20).toArray()).toEqual([10, 14, 16]);
    expect([s.contains(9), s.contains(90), s.contains(91)]).toEqual([true, false, true]);
    check(s);
  });
  it('fail-fast via the view and the base', () => {
    const s = of(1, 2, 3, 4);
    const it = s.headSet(4).iterator();
    it.next();
    s.add(0);
    expectThrows(() => it.next(), 'ConcurrentModificationException');
    const it2 = s.iterator();
    it2.next();
    s.tailSet(2).remove(3);
    expectThrows(() => it2.next(), 'ConcurrentModificationException');
  });
  it('re-adding an existing element is not structural', () => {
    const s = of(1, 2);
    const it = s.iterator();
    it.next();
    s.add(1);
    expect(it.next()).toBe(2);
  });
  it('JS iterators are plain objects', () => {
    const it: any = of(1)[Symbol.iterator]();
    expect([Object.prototype.toString.call(it), it[Symbol.iterator]() === it]).toEqual(['[object Object]', true]);
    expect([...of(3, 1, 2).descendingSet()]).toEqual([3, 2, 1]);
  });
  it('iterators of views terminate at the range end', () => {
    const s = of(...range(10));
    expect([...s.subSet(3, false, 6, true)]).toEqual([4, 5, 6]);
    expect([...s.subSet(3, false, 6, true).descendingSet()]).toEqual([6, 5, 4]);
    const it = s.headSet(1).iterator();
    it.next();
    expectThrows(() => it.next(), 'NoSuchElementException');
  });
});

describe('TreeSet · views', () => {
  it('nested sub-views', () => {
    const s = of(...range(30));
    const v = s.tailSet(5, true).headSet(25, true).subSet(10, false, 20, false).descendingSet().headSet(15);
    expect(v.toArray()).toEqual([19, 18, 17, 16]);
    expect([v.first(), v.last(), v.size()]).toEqual([19, 16, 4]);
  });
  it('views after base modifications', () => {
    const s = of(1, 5, 9);
    const v = s.subSet(2, true, 9, false);
    const d = v.descendingSet();
    s.add(3);
    s.add(8);
    s.remove(5);
    expect([v.toArray(), d.toArray(), v.size()]).toEqual([[3, 8], [8, 3], 2]);
    s.clear();
    expect([v.isEmpty(), d.pollFirst(), v.pollLast()]).toEqual([true, null, null]);
  });
  it('descending view of a sub-view: navigation and bounds', () => {
    const d = of(...range(10)).subSet(2, true, 7, true).descendingSet();
    expect([d.first(), d.last(), d.lower(5), d.higher(5), d.floor(1), d.ceiling(8)]).toEqual([7, 2, 6, 4, 2, 7]);
    expect([d.headSet(4).toArray(), d.tailSet(4, false).toArray(), d.subSet(6, 3).toArray()]).toEqual([[7, 6, 5], [3, 2], [6, 5, 4]]);
    expect(d.descendingSet().toArray()).toEqual([2, 3, 4, 5, 6, 7]);
    expect(d.descendingIterator().next()).toBe(2);
  });
  it('first/last/getFirst/getLast/removeFirst/removeLast on views', () => {
    const s = of(1, 2, 3, 4, 5);
    const v = s.subSet(2, true, 4, true);
    expect([v.getFirst(), v.getLast(), v.removeFirst(), v.removeLast(), v.toArray()]).toEqual([2, 4, 2, 4, [3]]);
    expect(s.toArray()).toEqual([1, 3, 5]);
    v.clear();
    expectThrows(() => v.first(), 'NoSuchElementException');
    expectThrows(() => v.removeLast(), 'NoSuchElementException');
    expectThrows(() => v.addFirst(3), 'UnsupportedOperationException');
    expectThrows(() => v.addLast(3), 'UnsupportedOperationException');
  });
  it('add through views checks the range of nested views', () => {
    const s = of(1, 10);
    const v = s.subSet(2, true, 8, false).descendingSet();
    expect(v.add(5)).toBe(true);
    expect(v.add(5)).toBe(false);
    expectThrows(() => v.add(8), 'IllegalArgumentException');
    expectThrows(() => v.add(1), 'IllegalArgumentException');
    expect(s.toArray()).toEqual([1, 5, 10]);
  });
  it('keySet views of a TreeMap do not support add', () => {
    const m = new TreeMap<number, number>();
    m.put(1, 1);
    expectThrows(() => m.navigableKeySet().headSet(5).add(2), 'UnsupportedOperationException');
    expectThrows(() => m.descendingKeySet().add(2), 'UnsupportedOperationException');
  });
  it('view comparator: natural, reversed and custom', () => {
    const s = of(1);
    expect([s.headSet(1).comparator(), s.descendingSet().comparator()!(1, 2) > 0]).toEqual([null, true]);
    const c = (a: number, b: number) => a - b;
    expect(new TreeSet<number>(c).subSet(0, 5).comparator()).toBe(c);
  });
  it('view removeIf / retainAll / contains write through only inside the range', () => {
    const s = of(...range(10));
    const v = s.subSet(3, 7);
    v.removeIf((x) => x % 2 === 0);
    expect(s.toArray()).toEqual([0, 1, 2, 3, 5, 7, 8, 9]);
    v.retainAll(SimpleSet.of(5));
    expect(s.toArray()).toEqual([0, 1, 2, 5, 7, 8, 9]);
    expect([v.contains(7), v.contains(5), v.contains(2)]).toEqual([false, true, false]);
  });
  it('view equals / hashCode / toString', () => {
    const v = of(1, 2, 3, 4).subSet(2, true, 3, true);
    expect([v.equals(SimpleSet.of(3, 2)), v.hashCode(), v.toString(), v.descendingSet().toString()]).toEqual([true, 5, '[2, 3]', '[3, 2]']);
  });
  it('reversed() is live and reversed twice is ascending', () => {
    const s = of(2, 1);
    const r = s.reversed();
    s.add(3);
    expect([r.toArray(), r.reversed().toArray()]).toEqual([[3, 2, 1], [1, 2, 3]]);
  });
});

describe('TreeSet · comparators and element types', () => {
  it('reverse comparator', () => {
    const s = new TreeSet<number>(Comparator.reverseOrder());
    [1, 5, 3].forEach((x) => s.add(x));
    expect([s.toArray(), s.first(), s.ceiling(4), s.floor(4), s.headSet(3).toArray()]).toEqual([[5, 3, 1], 5, 3, 5, [5]]);
  });
  it('case-insensitive comparator keeps the first instance', () => {
    const s = new TreeSet<string>((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    s.add('Apple');
    expect([s.add('APPLE'), s.toArray(), s.contains('apple'), s.remove('aPpLe'), s.size()]).toEqual([false, ['Apple'], true, true, 0]);
  });
  it('comparator accepting null', () => {
    const s = new TreeSet<number | null>(Comparator.nullsFirst<number>());
    [3, null, 1].forEach((x) => s.add(x));
    expect([s.toArray(), s.contains(null), s.pollFirst(), s.first()]).toEqual([[null, 1, 3], true, null, 1]);
  });
  it('mixed-type ClassCastException leaves the set unchanged', () => {
    const s = of(1, 2, 3);
    expectThrows(() => (s as TreeSet<any>).add('x'), 'ClassCastException');
    expectThrows(() => (s as TreeSet<any>).add({}), 'ClassCastException');
    expect([s.toArray(), s.size()]).toEqual([[1, 2, 3], 3]);
    check(s);
  });
  it('contains / remove of a foreign type throws ClassCastException, equals treats it as unequal', () => {
    const s = of(1);
    expectThrows(() => (s as TreeSet<any>).contains('1'), 'ClassCastException');
    expectThrows(() => (s as TreeSet<any>).remove('1'), 'ClassCastException');
    expect(s.equals(SimpleSet.of('1'))).toBe(false);
  });
  it('NaN sorts last, -0 equals 0', () => {
    const s = new TreeSet<number>();
    [NaN, 1, -0, -Infinity, 0, NaN].forEach((x) => s.add(x));
    expect(s.toArray()).toEqual([-Infinity, -0, 1, NaN]);
    expect([s.contains(0), s.contains(NaN), s.last(), s.higher(1), s.lower(NaN)]).toEqual([true, true, NaN, NaN, 1]);
    expect(s.headSet(NaN).toArray()).toEqual([-Infinity, -0, 1]);
  });
  it('Date elements', () => {
    const s = new TreeSet<Date>();
    s.add(new Date(5));
    s.add(new Date(1));
    expect([s.add(new Date(5)), s.size(), s.first().getTime(), s.ceiling(new Date(2))!.getTime()]).toEqual([false, 2, 1, 5]);
  });
  it('bigint elements', () => {
    const s = new TreeSet<bigint>();
    [5n, -3n, 2n ** 70n].forEach((x) => s.add(x));
    expect([s.toArray(), s.floor(4n), s.higher(5n)]).toEqual([[-3n, 5n, 2n ** 70n], -3n, 2n ** 70n]);
  });
  it('string elements in UTF-16 order', () => expect(TreeSet.of('b', 'é', 'B', 'a', '').toArray()).toEqual(['', 'B', 'a', 'b', 'é']));
  it('Comparable elements', () => {
    const s = TreeSet.of(new Point(2, 1), new Point(1, 9), new Point(2, 0));
    expect(s.toString()).toBe('[(1,9), (2,0), (2,1)]');
    expect(s.contains(new Point(2, 0))).toBe(true);
  });
  it('navigation with a null argument under natural ordering throws NullPointerException', () => {
    const s = of(1);
    for (const f of ['lower', 'floor', 'ceiling', 'higher', 'headSet', 'tailSet'] as const) expectThrows(() => (s as any)[f](null), 'NullPointerException');
  });
});

describe('TreeSet · model-based', () => {
  it('random ops vs a sorted array, including views', () => {
    const r = rng(99);
    const s = new TreeSet<number>();
    let m: number[] = [];
    for (let step = 0; step < 15000; step++) {
      const v = r(400);
      const at = `step ${step}`;
      const same = (a: unknown, b: unknown) => expect([at, a]).toEqual([at, b]);
      switch (r(9)) {
        case 0:
        case 1:
          same(s.add(v), !m.includes(v));
          if (!m.includes(v)) m = [...m, v].sort((a, b) => a - b);
          break;
        case 2:
          same(s.remove(v), m.includes(v));
          m = m.filter((x) => x !== v);
          break;
        case 3:
          same([s.lower(v), s.floor(v)], [[...m].reverse().find((x) => x < v) ?? null, [...m].reverse().find((x) => x <= v) ?? null]);
          break;
        case 4:
          same([s.ceiling(v), s.higher(v)], [m.find((x) => x >= v) ?? null, m.find((x) => x > v) ?? null]);
          break;
        case 5:
          if (r(2)) same(s.pollFirst(), m.length ? m.shift() : null);
          else same(s.pollLast(), m.length ? m.pop() : null);
          break;
        case 6: {
          const hi = v + r(60);
          same(s.subSet(v, true, hi, true).toArray(), m.filter((x) => x >= v && x <= hi));
          same(s.headSet(v, false).descendingSet().toArray(), m.filter((x) => x < v).reverse());
          break;
        }
        case 7: {
          const hi = v + r(30);
          const view = s.subSet(v, hi);
          const x = v + r(Math.max(1, hi - v));
          if (x < hi) {
            same(view.add(x), !m.includes(x));
            if (!m.includes(x)) m = [...m, x].sort((a, b) => a - b);
          }
          break;
        }
        case 8:
          same(s.size(), m.length);
          break;
      }
    }
    expect(s.toArray()).toEqual(m);
    check(s);
  });
});
