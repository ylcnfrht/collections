import { NavigableSet, SortedSet } from '../../src/interfaces/Set';
import { Comparator } from '../../src/util/Comparator';
import { expectThrows, Point, rng, timeIt } from '../helpers';
import { SimpleList, SimpleSet } from '../support';

/** SortedSet + NavigableSet contract. `create(c)` builds an empty set ordered by c (natural if omitted). */
export function navigableSetContract(name: string, create: (c?: Comparator<any>) => NavigableSet<any>) {
  const of = (...xs: unknown[]) => {
    const s = create();
    for (const x of xs) s.add(x);
    return s;
  };
  const NSEE = 'NoSuchElementException';
  const IAE = 'IllegalArgumentException';
  const desc = (a: number, b: number) => b - a;

  describe(`${name} · NavigableSet`, () => {
    describe('removeAll null handling', () => {
      it('throws NullPointerException when c (smaller) contains null', () =>
        expectThrows(() => of(1, 2, 3).removeAll(SimpleList.of(null)), 'NullPointerException'));
      it('iterates this when not larger, so a null in c is just not found', () => {
        const s = of(1, 2);
        expect(s.removeAll(SimpleList.of(null, 2, 7))).toBe(true);
        expect(s.toArray()).toEqual([1]);
      });
      it('uses this set\'s comparator when c is smaller', () => {
        const s = create((a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase()));
        ['A', 'b', 'x'].forEach((x) => s.add(x));
        expect(s.removeAll(SimpleList.of('a', 'B'))).toBe(true);
        expect(s.toArray()).toEqual(['x']);
      });
    });
    it('reversed() is typed as a SortedSet on sorted views', () => {
      const r: SortedSet<number> = of(1, 2, 3).headSet(3).reversed();
      expect(r.toArray()).toEqual([2, 1]);
    });
    describe('ordering', () => {
      it('iterates in ascending natural order', () => expect([...of(5, 1, 4, 2, 3)]).toEqual([1, 2, 3, 4, 5]));
      it('numbers are numeric, not lexicographic', () => expect(of(10, 9, 100, -5).toArray()).toEqual([-5, 9, 10, 100]));
      it('strings in UTF-16 order', () => expect(of('b', 'B', 'a', 'A').toArray()).toEqual(['A', 'B', 'a', 'b']));
      it('uses compareTo()', () => expect(of(new Point(2, 0), new Point(1, 1)).toString()).toBe('[(1,1), (2,0)]'));
      it('custom comparator orders', () => {
        const s = create(desc);
        [1, 3, 2].forEach((x) => s.add(x));
        expect(s.toArray()).toEqual([3, 2, 1]);
      });
      it('comparator defines equality (case-insensitive)', () => {
        const s = create((a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase()));
        expect([s.add('a'), s.add('A'), s.size(), s.contains('A')]).toEqual([true, false, 1, true]);
      });
      it('toString in order', () => expect(of(3, 1, 2).toString()).toBe('[1, 2, 3]'));
      it('forEach in order', () => {
        const out: number[] = [];
        of(3, 1, 2).forEach((x) => out.push(x));
        expect(out).toEqual([1, 2, 3]);
      });
      it('dates in time order', () => expect(of(new Date(3), new Date(1)).first()).toEqual(new Date(1)));
      it('bigints', () => expect(of(3n, 1n, 2n).toArray()).toEqual([1n, 2n, 3n]));
    });

    describe('comparator()', () => {
      it('null for natural ordering', () => expect(create().comparator()).toBeNull());
      it('returns the given comparator', () => expect(create(desc).comparator()).toBe(desc));
    });

    describe('type safety', () => {
      it('add(null) throws NullPointerException', () => expectThrows(() => create().add(null), 'NullPointerException'));
      it('add(undefined) throws NullPointerException', () => expectThrows(() => create().add(undefined), 'NullPointerException'));
      it('contains(null) throws NullPointerException', () => expectThrows(() => of(1).contains(null), 'NullPointerException'));
      it('non-comparable element throws ClassCastException', () => expectThrows(() => of({}, {}), 'ClassCastException'));
      it('first non-comparable element is rejected too', () => expectThrows(() => create().add({}), 'ClassCastException'));
      it('mixed types throw ClassCastException', () => expectThrows(() => of(1, 'a'), 'ClassCastException'));
      it('a comparator may accept null', () => {
        const s = create((a: any, b: any) => (a === null ? (b === null ? 0 : -1) : b === null ? 1 : a - b));
        s.add(1);
        s.add(null);
        expect(s.first()).toBeNull();
      });
    });

    describe('first / last / pollFirst / pollLast', () => {
      it('first and last', () => {
        const s = of(3, 1, 2);
        expect([s.first(), s.last()]).toEqual([1, 3]);
      });
      it('getFirst / getLast match first / last', () => {
        const s = of(3, 1, 2);
        expect([s.getFirst(), s.getLast()]).toEqual([1, 3]);
      });
      it.each(['first', 'last', 'getFirst', 'getLast', 'removeFirst', 'removeLast'] as const)('%s on empty throws NoSuchElementException', (m) =>
        expectThrows(() => (create() as any)[m](), NSEE)
      );
      it('pollFirst / pollLast remove the ends', () => {
        const s = of(1, 2, 3);
        expect([s.pollFirst(), s.pollLast(), s.toArray()]).toEqual([1, 3, [2]]);
      });
      it('pollFirst / pollLast on empty are null', () => expect([create().pollFirst(), create().pollLast()]).toEqual([null, null]));
      it('removeFirst / removeLast', () => {
        const s = of(1, 2, 3);
        expect([s.removeFirst(), s.removeLast(), s.size()]).toEqual([1, 3, 1]);
      });
      it('drain with pollFirst is sorted', () => {
        const s = of(5, 3, 9, 1);
        const out: number[] = [];
        let x;
        while ((x = s.pollFirst()) !== null) out.push(x);
        expect(out).toEqual([1, 3, 5, 9]);
      });
      it('addFirst / addLast throw UnsupportedOperationException', () => {
        expectThrows(() => create().addFirst(1), 'UnsupportedOperationException');
        expectThrows(() => create().addLast(1), 'UnsupportedOperationException');
      });
    });

    describe('lower / floor / ceiling / higher', () => {
      const s = () => of(10, 20, 30);
      it('lower: strictly less', () => expect([s().lower(20), s().lower(25), s().lower(10), s().lower(5)]).toEqual([10, 20, null, null]));
      it('floor: less or equal', () => expect([s().floor(20), s().floor(25), s().floor(10), s().floor(5)]).toEqual([20, 20, 10, null]));
      it('ceiling: greater or equal', () => expect([s().ceiling(20), s().ceiling(15), s().ceiling(30), s().ceiling(35)]).toEqual([20, 20, 30, null]));
      it('higher: strictly greater', () => expect([s().higher(20), s().higher(15), s().higher(30), s().higher(35)]).toEqual([30, 20, null, null]));
      it('all null on empty', () => {
        const e = create();
        expect([e.lower(1), e.floor(1), e.ceiling(1), e.higher(1)]).toEqual([null, null, null, null]);
      });
      it('respect a custom comparator', () => {
        const d = create(desc);
        [10, 20, 30].forEach((x) => d.add(x));
        expect([d.lower(20), d.higher(20)]).toEqual([30, 10]);
      });
      it('null argument throws NullPointerException', () => expectThrows(() => s().floor(null), 'NullPointerException'));
    });

    describe('headSet / tailSet / subSet views', () => {
      const base = () => of(1, 2, 3, 4, 5);
      it('headSet(to) is exclusive', () => expect(base().headSet(3).toArray()).toEqual([1, 2]));
      it('headSet(to, true) is inclusive', () => expect(base().headSet(3, true).toArray()).toEqual([1, 2, 3]));
      it('tailSet(from) is inclusive', () => expect(base().tailSet(3).toArray()).toEqual([3, 4, 5]));
      it('tailSet(from, false) is exclusive', () => expect(base().tailSet(3, false).toArray()).toEqual([4, 5]));
      it('subSet(from, to) is [from, to)', () => expect(base().subSet(2, 4).toArray()).toEqual([2, 3]));
      it('subSet with flags', () => {
        expect(base().subSet(2, false, 4, true).toArray()).toEqual([3, 4]);
        expect(base().subSet(2, true, 4, true).toArray()).toEqual([2, 3, 4]);
        expect(base().subSet(2, false, 4, false).toArray()).toEqual([3]);
      });
      it('bounds need not be present', () => expect(base().subSet(1.5, 3.5).toArray()).toEqual([2, 3]));
      it('empty range', () => expect(base().subSet(3, 3).size()).toBe(0));
      it('subSet(from > to) throws IllegalArgumentException', () => expectThrows(() => base().subSet(4, 2), IAE));
      it('view size / contains / first / last', () => {
        const v = base().subSet(2, 5);
        expect([v.size(), v.contains(1), v.contains(4), v.first(), v.last()]).toEqual([3, false, true, 2, 4]);
      });
      it('view navigation stays inside the range', () => {
        const v = base().subSet(2, true, 4, true);
        expect([v.lower(2), v.floor(1), v.ceiling(5), v.higher(4), v.higher(3)]).toEqual([null, null, null, null, 4]);
      });
      it('changes to the base show in the view', () => {
        const s = base();
        const v = s.headSet(10);
        s.add(6);
        s.remove(1);
        expect(v.toArray()).toEqual([2, 3, 4, 5, 6]);
      });
      it('adding through the view writes to the base', () => {
        const s = base();
        s.tailSet(3).add(10);
        expect(s.contains(10)).toBe(true);
      });
      it('adding outside the view range throws IllegalArgumentException', () => expectThrows(() => base().headSet(3).add(4), IAE));
      it('removing through the view writes to the base', () => {
        const s = base();
        s.subSet(2, 4).remove(3);
        expect(s.toArray()).toEqual([1, 2, 4, 5]);
      });
      it('removing out of range via the view is a no-op', () => {
        const s = base();
        expect(s.headSet(3).remove(5)).toBe(false);
        expect(s.size()).toBe(5);
      });
      it('clearing the view removes only its range', () => {
        const s = base();
        s.subSet(2, 4).clear();
        expect(s.toArray()).toEqual([1, 4, 5]);
      });
      it('pollFirst on a view removes from the base', () => {
        const s = base();
        expect(s.tailSet(3, true).pollFirst()).toBe(3);
        expect(s.toArray()).toEqual([1, 2, 4, 5]);
      });
      it('nested views', () => expect(base().headSet(5).tailSet(2).subSet(3, 5).toArray()).toEqual([3, 4]));
      it('nested view bound outside the parent range throws IllegalArgumentException', () => expectThrows(() => base().headSet(5).tailSet(2).subSet(3, 10), IAE));
      it('nested view may end exactly at an exclusive parent bound', () => expect(base().headSet(4).subSet(2, 4).toArray()).toEqual([2, 3]));
      it('nested view starting outside its parent range throws IllegalArgumentException', () => expectThrows(() => base().headSet(3).tailSet(4), IAE));
      it('view iterator.remove writes through', () => {
        const s = base();
        const it = s.tailSet(4).iterator();
        it.next();
        it.remove();
        expect(s.toArray()).toEqual([1, 2, 3, 5]);
      });
      it('view equals a set with the same elements', () => expect(base().subSet(2, 4).equals(SimpleSet.of(3, 2))).toBe(true));
    });

    describe('descending', () => {
      it('descendingSet iterates in reverse', () => expect(of(1, 2, 3).descendingSet().toArray()).toEqual([3, 2, 1]));
      it('descendingSet first/last are swapped', () => {
        const d = of(1, 2, 3).descendingSet();
        expect([d.first(), d.last()]).toEqual([3, 1]);
      });
      it('descendingSet navigation is mirrored', () => {
        const d = of(10, 20, 30).descendingSet();
        expect([d.lower(20), d.higher(20), d.floor(25), d.ceiling(25)]).toEqual([30, 10, 30, 20]);
      });
      it('descendingSet is live', () => {
        const s = of(1);
        const d = s.descendingSet();
        s.add(2);
        expect(d.first()).toBe(2);
      });
      it('descendingSet().descendingSet() is ascending', () => expect(of(2, 1).descendingSet().descendingSet().toArray()).toEqual([1, 2]));
      it('descendingSet headSet uses reversed bounds', () => expect(of(1, 2, 3, 4).descendingSet().headSet(2).toArray()).toEqual([4, 3]));
      it('descendingIterator', () => {
        const it = of(1, 2, 3).descendingIterator();
        const out: number[] = [];
        while (it.hasNext()) out.push(it.next());
        expect(out).toEqual([3, 2, 1]);
      });
      it('descendingIterator.remove', () => {
        const s = of(1, 2, 3);
        const it = s.descendingIterator();
        it.next();
        it.remove();
        expect(s.toArray()).toEqual([1, 2]);
      });
      it('reversed() is the descending view', () => {
        const s = of(1, 2, 3);
        expect(s.reversed().toArray()).toEqual([3, 2, 1]);
        s.add(0);
        expect(s.reversed().getLast()).toBe(0);
      });
      it('descending view equals the ascending set (sets ignore order)', () => {
        const s = of(1, 2, 3);
        expect(s.descendingSet().equals(s)).toBe(true);
      });
    });

    describe('cross-implementation', () => {
      it('equals a hash-style set with the same elements', () => expect(of(3, 1, 2).equals(SimpleSet.of(1, 2, 3))).toBe(true));
      it('addAll from a List keeps order and dedupes', () => {
        const s = create();
        s.addAll(SimpleList.of(3, 1, 3, 2));
        expect(s.toArray()).toEqual([1, 2, 3]);
      });
    });

    describe('performance (O(log n))', () => {
      it('100k random adds + floor queries under 1s', () => {
        const r = rng(5);
        const s = create();
        const ms = timeIt(() => {
          for (let i = 0; i < 100_000; i++) s.add(r(1_000_000));
          for (let i = 0; i < 100_000; i++) s.floor(r(1_000_000));
        });
        expect(ms).toBeLessThan(1_000);
      });
      it('100k ascending adds (worst case for unbalanced trees) under 500ms', () => {
        const s = create();
        expect(timeIt(() => {
          for (let i = 0; i < 100_000; i++) s.add(i);
        })).toBeLessThan(500);
        expect([s.first(), s.last(), s.size()]).toEqual([0, 99_999, 100_000]);
      });
    });

    describe('model-based: random ops vs sorted array', () => {
      const lower = (m: number[], v: number) => [...m].reverse().find((x) => x < v) ?? null;
      const floor = (m: number[], v: number) => [...m].reverse().find((x) => x <= v) ?? null;
      const ceiling = (m: number[], v: number) => m.find((x) => x >= v) ?? null;
      const higher = (m: number[], v: number) => m.find((x) => x > v) ?? null;

      it.each([2, 4, 8, 16, 32])('seed %p, 4000 ops', (seed) => {
        const r = rng(seed);
        const s = create();
        let m: number[] = [];
        for (let step = 0; step < 4000; step++) {
          const op = r(10);
          const v = r(100);
          const at = `step ${step} op ${op}`;
          const same = (a: unknown, b: unknown) => expect([at, a]).toEqual([at, b]);
          switch (op) {
            case 0:
            case 1: same(s.add(v), !m.includes(v)); if (!m.includes(v)) m = [...m, v].sort((a, b) => a - b); break;
            case 2: same(s.remove(v), m.includes(v)); m = m.filter((x) => x !== v); break;
            case 3: same(s.contains(v), m.includes(v)); break;
            case 4: same([s.lower(v), s.floor(v)], [lower(m, v), floor(m, v)]); break;
            case 5: same([s.ceiling(v), s.higher(v)], [ceiling(m, v), higher(m, v)]); break;
            case 6: same(s.pollFirst(), m.length ? m.shift() : null); break;
            case 7: same(s.pollLast(), m.length ? m.pop() : null); break;
            case 8: { const hi = v + 20; same(s.subSet(v, hi).size(), m.filter((x) => x >= v && x < hi).length); break; }
            case 9: if (m.length) same([s.first(), s.last()], [m[0], m[m.length - 1]]); break;
          }
          same(s.size(), m.length);
        }
        expect(s.toArray()).toEqual(m);
      });
    });
  });
}
