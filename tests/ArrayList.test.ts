import { ArrayList } from '../src/list/ArrayList';
import { LinkedList } from '../src/list/LinkedList';
import { isRandomAccess, RANDOM_ACCESS } from '../src/util/guards';
import { equals } from '../src/util/Objects';
import { collectionContract } from './contracts/collection';
import { listContract } from './contracts/list';
import { expectThrows, Point, rng, timeIt } from './helpers';
import { SimpleList, SimpleSeqList } from './support';

collectionContract('ArrayList', () => new ArrayList(), { allowsNull: true, allowsDuplicates: true });
listContract('ArrayList', () => new ArrayList());

const IOOBE = 'IndexOutOfBoundsException';
const CME = 'ConcurrentModificationException';

describe('ArrayList · implementation', () => {
  describe('constructors', () => {
    it('no-arg is empty', () => expect(new ArrayList().size()).toBe(0));
    it('capacity is only a hint', () => {
      const l = new ArrayList<number>(100);
      expect(l.size()).toBe(0);
      l.add(1);
      expect(l.toArray()).toEqual([1]);
    });
    it('capacity 0 is fine', () => expect(new ArrayList(0).isEmpty()).toBe(true));
    it('negative capacity throws IllegalArgumentException', () => expectThrows(() => new ArrayList(-1), 'IllegalArgumentException'));
    it('NaN capacity throws IllegalArgumentException', () => expectThrows(() => new ArrayList(NaN), 'IllegalArgumentException'));
    it('copies another ArrayList', () => expect(new ArrayList(ArrayList.of(1, 2)).toArray()).toEqual([1, 2]));
    it('copies a foreign collection', () => expect(new ArrayList(SimpleList.of('a', 'b')).toArray()).toEqual(['a', 'b']));
    it('copy is independent of the source', () => {
      const src = ArrayList.of(1, 2);
      const copy = new ArrayList(src);
      src.add(3);
      copy.set(0, 9);
      expect([src.toArray(), copy.toArray()]).toEqual([[1, 2, 3], [9, 2]]);
    });
    it('null collection throws NullPointerException', () => expectThrows(() => new ArrayList(null as any), 'NullPointerException'));
    it('holes from a foreign toArray() become undefined', () => {
      const fake = new SimpleList<number>();
      fake.toArray = () => [1, , 3] as number[];
      const l = new ArrayList(fake);
      expect(l.size()).toBe(3);
      expect(1 in l.toArray()).toBe(true);
    });
    it('of() builds in order', () => expect(ArrayList.of(3, 1, 2).toArray()).toEqual([3, 1, 2]));
    it('of() with no args is empty', () => expect(ArrayList.of().size()).toBe(0));
  });

  describe('capacity', () => {
    it('ensureCapacity keeps contents', () => {
      const l = ArrayList.of(1, 2);
      l.ensureCapacity(1000);
      expect(l.toArray()).toEqual([1, 2]);
    });
    it('trimToSize keeps contents', () => {
      const l = ArrayList.of(1, 2);
      l.trimToSize();
      expect(l.toArray()).toEqual([1, 2]);
    });
  });

  describe('RANDOM_ACCESS brand', () => {
    it('is branded', () => expect(isRandomAccess(new ArrayList())).toBe(true));
    it('brand reads true', () => expect(new ArrayList()[RANDOM_ACCESS]).toBe(true));
    it('SimpleSeqList is not branded', () => expect(isRandomAccess(new SimpleSeqList())).toBe(false));
  });

  describe('clone', () => {
    it('same contents and class', () => {
      const c = ArrayList.of(1, 2).clone();
      expect(c).toBeInstanceOf(ArrayList);
      expect(c.toArray()).toEqual([1, 2]);
    });
    it('independent of the original', () => {
      const l = ArrayList.of(1, 2);
      const c = l.clone();
      c.add(3);
      l.set(0, 0);
      expect([l.toArray(), c.toArray()]).toEqual([[0, 2], [1, 2, 3]]);
    });
    it('is shallow', () => {
      const p = { v: 1 };
      expect(ArrayList.of(p).clone().get(0)).toBe(p);
    });
    it('equals the original', () => {
      const l = ArrayList.of<unknown>(1, 'a', null);
      expect(l.clone().equals(l)).toBe(true);
    });
  });

  describe('dense storage', () => {
    it('set(5, x) on a 1-element list throws and does not grow it', () => {
      const l = ArrayList.of(1);
      expectThrows(() => l.set(5, 9), IOOBE);
      expect(l.size()).toBe(1);
      expect(l.toArray()).toEqual([1]);
    });
    it('set(size) throws', () => expectThrows(() => ArrayList.of(1).set(1, 2), IOOBE));
    it('add(index > size) throws and does not grow', () => {
      const l = ArrayList.of(1);
      expectThrows(() => l.add(3, 9), IOOBE);
      expect(l.size()).toBe(1);
    });
    it.each([-1, 1.5, NaN, Infinity, 2 ** 32])('get(%p) throws', (i) => expectThrows(() => ArrayList.of(1, 2).get(i), IOOBE));
    it.each([-1, 0.5, NaN])('add(%p, e) throws', (i) => expectThrows(() => ArrayList.of(1, 2).add(i, 0), IOOBE));
    it.each([-1, 0.5, NaN, 2])('removeAt(%p) throws', (i) => expectThrows(() => ArrayList.of(1, 2).removeAt(i), IOOBE));
    it('-0 index is index 0', () => expect(ArrayList.of(7).get(-0)).toBe(7));
    it('toArray is a copy', () => {
      const l = ArrayList.of(1);
      l.toArray().push(2);
      expect(l.size()).toBe(1);
    });
    it('failed add does not bump modCount', () => {
      const l = ArrayList.of(1);
      const it = l.iterator();
      expectThrows(() => l.add(5, 0), IOOBE);
      expect(it.next()).toBe(1);
    });
  });

  describe('mutation paths', () => {
    it('removeAt front, middle and end', () => {
      const l = ArrayList.of(0, 1, 2, 3, 4);
      expect([l.removeAt(0), l.removeAt(3), l.removeAt(1)]).toEqual([0, 4, 2]);
      expect(l.toArray()).toEqual([1, 3]);
    });
    it('add at front and middle', () => {
      const l = ArrayList.of(2, 4);
      l.add(0, 1);
      l.add(2, 3);
      expect(l.toArray()).toEqual([1, 2, 3, 4]);
    });
    it('addAll at middle', () => {
      const l = ArrayList.of(1, 5);
      expect(l.addAll(1, SimpleList.of(2, 3, 4))).toBe(true);
      expect(l.toArray()).toEqual([1, 2, 3, 4, 5]);
    });
    it('addAll(this) at end doubles', () => {
      const l = ArrayList.of(1, 2);
      l.addAll(l);
      expect(l.toArray()).toEqual([1, 2, 1, 2]);
    });
    it('addAll(0, this) inserts a snapshot', () => {
      const l = ArrayList.of(1, 2, 3);
      l.addAll(1, l);
      expect(l.toArray()).toEqual([1, 1, 2, 3, 2, 3]);
    });
    it('addAll of an empty collection returns false', () => expect(ArrayList.of(1).addAll(0, new ArrayList())).toBe(false));
    it('addAll with 200k elements does not overflow the stack', () => {
      const big = new ArrayList<number>();
      for (let i = 0; i < 200_000; i++) big.add(i);
      const l = ArrayList.of(-1, -2);
      l.addAll(1, big);
      l.addAll(big);
      expect([l.size(), l.get(1), l.get(200_000), l.get(200_001), l.getLast()]).toEqual([400_002, 0, 199_999, -2, 199_999]);
    });
    it('removeRange', () => {
      const l = ArrayList.of(0, 1, 2, 3, 4);
      l.removeRange(1, 3);
      expect(l.toArray()).toEqual([0, 3, 4]);
      l.removeRange(1, 3);
      expect(l.toArray()).toEqual([0]);
      l.removeRange(0, 0);
      expect(l.toArray()).toEqual([0]);
    });
    it.each([[-1, 1], [0, 3], [2, 1]])('removeRange(%p, %p) throws', (a, b) => expectThrows(() => ArrayList.of(1, 2).removeRange(a, b), IOOBE));
    it('removeIf with a throwing predicate loses and duplicates nothing', () => {
      const l = ArrayList.of(1, 2, 3, 4, 5, 6);
      expect(() =>
        l.removeIf((x) => {
          if (x === 5) throw new Error('boom');
          return x % 2 === 0;
        })
      ).toThrow('boom');
      expect(l.toArray()).toEqual([1, 3, 5, 6]);
    });
    it('removeIf that removed elements before throwing invalidates open iterators and sublists', () => {
      const l = ArrayList.of(1, 2, 3, 4, 5, 6);
      const it = l.iterator();
      const sub = l.subList(0, 6);
      expect(() =>
        l.removeIf((x) => {
          if (x === 5) throw new Error('boom');
          return x % 2 === 0;
        })
      ).toThrow('boom');
      expectThrows(() => it.next(), CME);
      expectThrows(() => sub.size(), CME);
    });
    it('removeIf that mutates the list throws ConcurrentModificationException', () => {
      const l = ArrayList.of(1, 2, 3);
      expectThrows(() => l.removeIf((x) => (x === 3 && l.add(4), false)), CME);
    });
    it('removeIf that mutates during compaction throws and keeps the rest', () => {
      const l = ArrayList.of(1, 2, 3, 4);
      expectThrows(() => l.removeIf((x) => (x === 3 && l.add(9), x === 1)), CME);
      expect(l.toArray()).toEqual([2, 3, 4, 9]);
    });
    it('removeAll and retainAll are linear on 100k elements', () => {
      const l = new ArrayList<number>();
      for (let i = 0; i < 100_000; i++) l.add(i);
      const odd = new Set<number>();
      for (let i = 1; i < 100_000; i += 2) odd.add(i);
      const ms = timeIt(() => {
        l.removeAll({ contains: (x: number) => odd.has(x) } as any);
      });
      expect(ms).toBeLessThan(1000);
      expect([l.size(), l.get(1)]).toEqual([50_000, 2]);
      l.retainAll(ArrayList.of(0, 2));
      expect(l.toArray()).toEqual([0, 2]);
    });
    it('replaceAll that mutates throws ConcurrentModificationException', () => {
      const l = ArrayList.of(1, 2);
      expectThrows(() => l.replaceAll((x) => (l.add(0), x)), CME);
    });
    it('forEach that mutates throws ConcurrentModificationException', () => {
      const l = ArrayList.of(1, 2);
      expectThrows(() => l.forEach(() => l.add(0)), CME);
    });
    it('sort invalidates open iterators', () => {
      const l = ArrayList.of(2, 1);
      const it = l.iterator();
      l.sort();
      expectThrows(() => it.next(), CME);
    });
    it('sort with a comparator that mutates throws ConcurrentModificationException', () => {
      const l = ArrayList.of(2, 1);
      expectThrows(() => l.sort((a, b) => (l.clear(), a - b)), CME);
    });
    it('natural sort of strings uses code unit order', () => {
      const l = ArrayList.of('b', 'B', 'a', 'é', 'A');
      l.sort();
      expect(l.toArray()).toEqual(['A', 'B', 'a', 'b', 'é']);
    });
    it('natural sort of numbers puts NaN last and keeps -0/+0 stable', () => {
      const l = ArrayList.of(3, NaN, 0, -0, -Infinity, 1);
      l.sort();
      const a = l.toArray();
      expect(a.slice(0, 5)).toEqual([-Infinity, 0, -0, 1, 3]);
      expect(Object.is(a[1], 0) && Object.is(a[2], -0)).toBe(true);
      expect(a[5]).toBeNaN();
    });
    it('comparator sort passes undefined to the comparator', () => {
      const l = ArrayList.of<number | undefined>(2, undefined, 1);
      l.sort((a, b) => (a ?? -1) - (b ?? -1));
      expect(l.toArray()).toEqual([undefined, 1, 2]);
    });
  });

  describe('equality fast path', () => {
    const values: unknown[] = [0, -0, 1, NaN, '1', '', null, undefined, true, false, 1n, Symbol.for('s'), new Point(1, 2), new Date(5), { equals: () => true }];
    it('indexOf/lastIndexOf/contains agree with Objects.equals for every pair', () => {
      const l = new ArrayList<unknown>();
      for (const v of values) l.add(v);
      for (const probe of [...values, new Point(1, 2), new Date(5), 2, 'x']) {
        const idx = values.findIndex((v) => equals(probe, v));
        let last = -1;
        values.forEach((v, i) => equals(probe, v) && (last = i));
        expect([l.indexOf(probe), l.lastIndexOf(probe), l.contains(probe)]).toEqual([idx, last, idx >= 0]);
      }
    });
    it('object probe uses equals()', () => expect(ArrayList.of(new Point(1, 1), new Point(2, 2)).indexOf(new Point(2, 2))).toBe(1));
    it('primitive probe does not call element equals()', () => {
      const e = { equals: jest.fn(() => true) };
      expect(ArrayList.of<unknown>(e).indexOf(1)).toBe(-1);
      expect(e.equals).not.toHaveBeenCalled();
    });
    it('remove(o) removes the first match only', () => {
      const l = ArrayList.of(1, 2, 1);
      expect(l.remove(1)).toBe(true);
      expect(l.toArray()).toEqual([2, 1]);
      expect(l.remove(9)).toBe(false);
    });
    it('equals and hashCode match SimpleList across implementations', () => {
      const xs: unknown[] = [1, 'a', null, new Point(1, 2), NaN];
      expect(ArrayList.of(...xs).equals(SimpleList.of(...xs))).toBe(true);
      expect(SimpleList.of(...xs).equals(ArrayList.of(...xs))).toBe(true);
      expect(ArrayList.of(...xs).hashCode()).toBe(SimpleList.of(...xs).hashCode());
    });
    it('equals detects a longer and a shorter foreign list', () => {
      expect(ArrayList.of(1).equals(SimpleList.of(1, 2))).toBe(false);
      expect(ArrayList.of(1, 2).equals(SimpleList.of(1))).toBe(false);
      expect(ArrayList.of(1, 2).equals(SimpleList.of(1, 3))).toBe(false);
    });
    it('equals between ArrayLists of different length or contents', () => {
      expect(ArrayList.of(1).equals(ArrayList.of(1, 2))).toBe(false);
      expect(ArrayList.of(new Point(1, 1)).equals(ArrayList.of(new Point(1, 1)))).toBe(true);
      expect(ArrayList.of(1).equals(ArrayList.of(2))).toBe(false);
    });
    it('self-containing list hashes and prints safely', () => {
      const l = new ArrayList<unknown>();
      l.add(1);
      l.add(l);
      expect(l.toString()).toBe('[1, (this Collection)]');
      expect(l.hashCode()).toBe(Math.imul(31, 31 + 1));
    });
  });

  describe('iterators', () => {
    it('for..of over a plain-object iterator, not a generator', () => {
      const it = ArrayList.of(1)[Symbol.iterator]();
      expect(Object.prototype.toString.call(it)).not.toBe('[object Generator]');
      expect(it[Symbol.iterator]()).toBe(it);
      expect([it.next(), it.next(), it.next()]).toEqual([{ value: 1, done: false }, { value: undefined, done: true }, { value: undefined, done: true }]);
    });
    it('for..of is fail-fast on removal', () => {
      const l = ArrayList.of(1, 2, 3);
      expectThrows(() => {
        for (const x of l) if (x === 1) l.removeAt(0);
      }, CME);
    });
    it('break out of for..of leaves the list usable', () => {
      const l = ArrayList.of(1, 2, 3);
      for (const x of l) if (x === 2) break;
      l.add(4);
      expect([...l]).toEqual([1, 2, 3, 4]);
    });
    it('remove() twice throws IllegalStateException', () => {
      const it = ArrayList.of(1, 2).iterator();
      it.next();
      it.remove();
      expectThrows(() => it.remove(), 'IllegalStateException');
    });
    it('iterator remove() after external change throws ConcurrentModificationException', () => {
      const l = ArrayList.of(1, 2);
      const it = l.iterator();
      it.next();
      l.add(3);
      expectThrows(() => it.remove(), CME);
    });
    it('previous() after external change throws ConcurrentModificationException', () => {
      const l = ArrayList.of(1, 2);
      const it = l.listIterator(2);
      l.removeAt(0);
      expectThrows(() => it.previous(), CME);
    });
    it('set() and add() after external change throw ConcurrentModificationException', () => {
      const l = ArrayList.of(1, 2);
      const it = l.listIterator();
      it.next();
      l.add(3);
      expectThrows(() => it.set(0), CME);
      expectThrows(() => it.add(0), CME);
    });
    it('forEachRemaining stops on modification', () => {
      const l = ArrayList.of(1, 2, 3);
      const it = l.iterator();
      expectThrows(() => it.forEachRemaining(() => l.add(0)), CME);
    });
    it('forEachRemaining then remove() removes the last element', () => {
      const l = ArrayList.of(1, 2, 3);
      const it = l.iterator();
      it.forEachRemaining(() => {});
      it.remove();
      expect(l.toArray()).toEqual([1, 2]);
    });
    it('forEachRemaining with nothing left does not arm remove()', () => {
      const l = ArrayList.of(1, 2, 3);
      const it = l.listIterator(3);
      it.forEachRemaining(() => {});
      expectThrows(() => it.remove(), 'IllegalStateException');
      expectThrows(() => it.set(0), 'IllegalStateException');
      expect([l.size(), it.nextIndex()]).toEqual([3, 3]);
    });
    it('forEachRemaining with nothing left keeps the previous lastRet', () => {
      const l = ArrayList.of(1, 2);
      const it = l.listIterator();
      it.next();
      it.next();
      it.forEachRemaining(() => {});
      it.remove();
      expect(l.toArray()).toEqual([1]);
    });
    it('listIterator add() advances past the new element', () => {
      const l = ArrayList.of(1, 3);
      const it = l.listIterator(1);
      it.add(2);
      expect([it.nextIndex(), it.next(), l.toArray()]).toEqual([2, 3, [1, 2, 3]]);
    });
    it('replaceAll is structural for open iterators (ConcurrentModificationException)', () => {
      const l = ArrayList.of(1, 2, 3);
      const it = l.iterator();
      it.next();
      l.replaceAll((x) => x * 2);
      expect(l.toArray()).toEqual([2, 4, 6]);
      expectThrows(() => it.next(), CME);
    });
    it('set() via iterator keeps it valid', () => {
      const l = ArrayList.of(1, 2);
      const it = l.listIterator();
      it.next();
      it.set(5);
      expect(it.next()).toBe(2);
      expect(l.toArray()).toEqual([5, 2]);
    });
  });

  describe('views and ends', () => {
    it('subList write-through and fail-fast', () => {
      const l = ArrayList.of(0, 1, 2, 3);
      const s = l.subList(1, 3);
      s.add(9);
      expect(l.toArray()).toEqual([0, 1, 2, 9, 3]);
      l.add(5);
      expectThrows(() => s.get(0), CME);
    });
    it('subList addAll at its middle', () => {
      const l = ArrayList.of(0, 1, 2, 3);
      l.subList(1, 3).addAll(1, SimpleList.of(7, 8));
      expect(l.toArray()).toEqual([0, 1, 7, 8, 2, 3]);
    });
    it('subList and reversed() are RandomAccess; LinkedList views are not', () => {
      const l = ArrayList.of(0, 1, 2);
      expect([isRandomAccess(l.subList(0, 2)), isRandomAccess(l.subList(0, 2).subList(0, 1)), isRandomAccess(l.reversed())]).toEqual([true, true, true]);
      expect(isRandomAccess(LinkedList.of(0, 1, 2).subList(0, 2))).toBe(false);
    });
    it('toArray(generator) copies into the generated array', () => {
      const l = ArrayList.of(1, 2, 3);
      const out = l.toArray((n) => new Int32Array(n + 1));
      expect([...out]).toEqual([1, 2, 3, 0]);
      expect(l.toArray((n) => new Array<number>(n))).toEqual([1, 2, 3]);
    });
    it('equals walks a duck-typed list by listIterator() and never throws', () => {
      const src = ArrayList.of(1, 2);
      const duck = {
        get: (i: number) => src.get(i),
        listIterator: () => src.listIterator(),
        iterator: () => {
          throw new TypeError('not used');
        },
      };
      expect(ArrayList.of(1, 2).equals(duck)).toBe(true);
      expect(ArrayList.of(1, 3).equals(duck)).toBe(false);
      expect(ArrayList.of(1).equals({ get: () => 1, listIterator: () => src.listIterator() })).toBe(false);
    });
    it('getFirst / getLast on empty throw', () => {
      expectThrows(() => new ArrayList().getFirst(), 'NoSuchElementException');
      expectThrows(() => new ArrayList().getLast(), 'NoSuchElementException');
    });
  });

  describe('scale', () => {
    it('1M appends and indexed reads', () => {
      const l = new ArrayList<number>();
      for (let i = 0; i < 1_000_000; i++) l.add(i);
      let s = 0;
      for (let i = 0; i < l.size(); i++) s += l.get(i);
      expect(s).toBe((999_999 * 1_000_000) / 2);
    });
    it('draining 20k from the front keeps order', () => {
      const l = new ArrayList<number>();
      for (let i = 0; i < 20_000; i++) l.add(i);
      let ok = true;
      for (let i = 0; i < 20_000; i++) ok = ok && l.removeAt(0) === i;
      expect([ok, l.isEmpty()]).toEqual([true, true]);
    });
  });

  it('model-based random operations match a JS array', () => {
    const r = rng(1234);
    const l = new ArrayList<number>();
    const m: number[] = [];
    for (let step = 0; step < 20_000; step++) {
      const v = r(50);
      const n = m.length;
      switch (r(14)) {
        case 0: l.add(v); m.push(v); break;
        case 1: { const i = r(n + 1); l.add(i, v); m.splice(i, 0, v); break; }
        case 2: if (n) { const i = r(n); expect(l.removeAt(i)).toBe(m.splice(i, 1)[0]); } break;
        case 3: if (n) { const i = r(n); expect(l.set(i, v)).toBe(m[i]); m[i] = v; } break;
        case 4: expect(l.indexOf(v)).toBe(m.indexOf(v)); break;
        case 5: expect(l.lastIndexOf(v)).toBe(m.lastIndexOf(v)); break;
        case 6: { const i = m.indexOf(v); expect(l.remove(v)).toBe(i >= 0); if (i >= 0) m.splice(i, 1); break; }
        case 7: { const i = r(n + 1); const xs = [v, v + 1, v + 2]; l.addAll(i, ArrayList.of(...xs)); m.splice(i, 0, ...xs); break; }
        case 8: { const a = r(n + 1); const b = a + r(n - a + 1); l.removeRange(a, b); m.splice(a, b - a); break; }
        case 9: { l.removeIf((x) => x === v); for (let k = m.length - 1; k >= 0; k--) if (m[k] === v) m.splice(k, 1); break; }
        case 10: if (r(20) === 0) { l.sort(); m.sort((a, b) => a - b); } break;
        case 11: if (n) { const i = r(n); expect(l.get(i)).toBe(m[i]); } break;
        case 12: if (r(100) === 0) { l.clear(); m.length = 0; } break;
        case 13: if (n) { const it = l.listIterator(r(n)); const i = it.nextIndex(); it.next(); it.remove(); m.splice(i, 1); } break;
      }
      expect(l.size()).toBe(m.length);
    }
    expect(l.toArray()).toEqual(m);
    expect([...l]).toEqual(m);
    expect(l.equals(SimpleList.of(...m))).toBe(true);
    expect(l.hashCode()).toBe(SimpleList.of(...m).hashCode());
  });
});
