import { NavigableMap } from '../../src/interfaces/Map';
import { Comparator } from '../../src/util/Comparator';
import { expectThrows, rng, timeIt } from '../helpers';
import { SimpleMap } from '../support';

/** SortedMap + NavigableMap + SequencedMap contract. `create(c)` builds an empty map ordered by c. */
export function navigableMapContract(name: string, create: (c?: Comparator<any>) => NavigableMap<any, any>) {
  const of = (...keys: number[]) => {
    const m = create();
    for (const k of keys) m.put(k, `v${k}`);
    return m;
  };
  const entry = (e: { getKey(): unknown; getValue(): unknown } | null) => (e === null ? null : [e.getKey(), e.getValue()]);
  const NSEE = 'NoSuchElementException';
  const IAE = 'IllegalArgumentException';
  const desc = (a: number, b: number) => b - a;

  describe(`${name} · NavigableMap`, () => {
    describe('ordering', () => {
      it('keySet ascending', () => expect([...of(3, 1, 2).keySet()]).toEqual([1, 2, 3]));
      it('values in key order', () => expect([...of(3, 1, 2).values()]).toEqual(['v1', 'v2', 'v3']));
      it('entrySet in key order', () => expect([...of(2, 1)].map(([k]) => k)).toEqual([1, 2]));
      it('toString in key order', () => expect(of(2, 1).toString()).toBe('{1=v1, 2=v2}'));
      it('custom comparator', () => {
        const m = create(desc);
        [1, 3, 2].forEach((k) => m.put(k, k));
        expect([...m.keySet()]).toEqual([3, 2, 1]);
      });
      it('comparator defines key equality', () => {
        const m = create((a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase()));
        m.put('a', 1);
        m.put('A', 2);
        expect([m.size(), m.get('a'), [...m.keySet()]]).toEqual([1, 2, ['a']]);
      });
      it('comparator() null / given', () => {
        expect(create().comparator()).toBeNull();
        expect(create(desc).comparator()).toBe(desc);
      });
      it('string keys in UTF-16 order', () => {
        const m = create();
        ['b', 'a', 'C'].forEach((k) => m.put(k, 1));
        expect([...m.keySet()]).toEqual(['C', 'a', 'b']);
      });
    });

    describe('type safety', () => {
      it('put(null) throws NullPointerException', () => expectThrows(() => create().put(null, 1), 'NullPointerException'));
      it('get(null) throws NullPointerException', () => expectThrows(() => of(1).get(null), 'NullPointerException'));
      it('non-comparable key throws ClassCastException', () => expectThrows(() => create().put({}, 1), 'ClassCastException'));
      it('mixed key types throw ClassCastException', () => expectThrows(() => of(1).put('a', 1), 'ClassCastException'));
      it('null values are allowed', () => {
        const m = create();
        m.put(1, null);
        expect([m.containsKey(1), m.get(1)]).toEqual([true, null]);
      });
    });

    describe('first / last', () => {
      it('firstKey / lastKey', () => {
        const m = of(5, 1, 3);
        expect([m.firstKey(), m.lastKey()]).toEqual([1, 5]);
      });
      it('firstKey / lastKey on empty throw NoSuchElementException', () => {
        expectThrows(() => create().firstKey(), NSEE);
        expectThrows(() => create().lastKey(), NSEE);
      });
      it('firstEntry / lastEntry', () => {
        const m = of(5, 1, 3);
        expect([entry(m.firstEntry()), entry(m.lastEntry())]).toEqual([[1, 'v1'], [5, 'v5']]);
      });
      it('firstEntry / lastEntry on empty are null', () => expect([create().firstEntry(), create().lastEntry()]).toEqual([null, null]));
      it('pollFirstEntry / pollLastEntry remove', () => {
        const m = of(1, 2, 3);
        expect([entry(m.pollFirstEntry()), entry(m.pollLastEntry()), [...m.keySet()]]).toEqual([[1, 'v1'], [3, 'v3'], [2]]);
      });
      it('poll on empty is null', () => expect([create().pollFirstEntry(), create().pollLastEntry()]).toEqual([null, null]));
      it('navigation entries are immutable snapshots', () => {
        const m = of(1);
        expectThrows(() => m.firstEntry()!.setValue('x'), 'UnsupportedOperationException');
        const e = m.firstEntry()!;
        m.put(1, 'changed');
        expect(e.getValue()).toBe('v1');
      });
      it('putFirst / putLast throw UnsupportedOperationException', () => {
        expectThrows(() => create().putFirst(1, 1), 'UnsupportedOperationException');
        expectThrows(() => create().putLast(1, 1), 'UnsupportedOperationException');
      });
    });

    describe('lower / floor / ceiling / higher', () => {
      const m = () => of(10, 20, 30);
      it('keys', () => {
        const x = m();
        expect([x.lowerKey(20), x.floorKey(20), x.ceilingKey(20), x.higherKey(20)]).toEqual([10, 20, 20, 30]);
        expect([x.lowerKey(25), x.floorKey(25), x.ceilingKey(25), x.higherKey(25)]).toEqual([20, 20, 30, 30]);
      });
      it('beyond the ends are null', () => {
        const x = m();
        expect([x.lowerKey(10), x.floorKey(5), x.ceilingKey(35), x.higherKey(30)]).toEqual([null, null, null, null]);
      });
      it('entries', () => {
        const x = m();
        expect([entry(x.lowerEntry(20)), entry(x.floorEntry(25)), entry(x.ceilingEntry(25)), entry(x.higherEntry(20))]).toEqual([
          [10, 'v10'],
          [20, 'v20'],
          [30, 'v30'],
          [30, 'v30'],
        ]);
      });
      it('entries are immutable', () => expectThrows(() => m().floorEntry(20)!.setValue('x'), 'UnsupportedOperationException'));
      it('empty map gives null', () => {
        const e = create();
        expect([e.lowerKey(1), e.floorKey(1), e.ceilingKey(1), e.higherKey(1)]).toEqual([null, null, null, null]);
      });
    });

    describe('headMap / tailMap / subMap views', () => {
      const base = () => of(1, 2, 3, 4, 5);
      const keys = (m: { keySet(): Iterable<unknown> }) => [...m.keySet()];
      it('headMap exclusive / inclusive', () => {
        expect(keys(base().headMap(3))).toEqual([1, 2]);
        expect(keys(base().headMap(3, true))).toEqual([1, 2, 3]);
      });
      it('tailMap inclusive / exclusive', () => {
        expect(keys(base().tailMap(3))).toEqual([3, 4, 5]);
        expect(keys(base().tailMap(3, false))).toEqual([4, 5]);
      });
      it('subMap', () => {
        expect(keys(base().subMap(2, 4))).toEqual([2, 3]);
        expect(keys(base().subMap(2, false, 4, true))).toEqual([3, 4]);
      });
      it('subMap(from > to) throws IllegalArgumentException', () => expectThrows(() => base().subMap(4, 2), IAE));
      it('view get / containsKey respect the range', () => {
        const v = base().headMap(3);
        expect([v.get(2), v.get(4), v.containsKey(4), v.size()]).toEqual(['v2', null, false, 2]);
      });
      it('view is live', () => {
        const m = base();
        const v = m.tailMap(4);
        m.put(6, 'v6');
        m.remove(5);
        expect(keys(v)).toEqual([4, 6]);
      });
      it('put through the view writes to the base', () => {
        const m = base();
        m.headMap(3).put(0, 'v0');
        expect(m.get(0)).toBe('v0');
      });
      it('put outside the range throws IllegalArgumentException', () => expectThrows(() => base().headMap(3).put(9, 'x'), IAE));
      it('remove through the view', () => {
        const m = base();
        m.subMap(2, 4).remove(3);
        expect(keys(m)).toEqual([1, 2, 4, 5]);
      });
      it('clear the view clears only its range', () => {
        const m = base();
        m.subMap(2, 4).clear();
        expect(keys(m)).toEqual([1, 4, 5]);
      });
      it('view first/last/navigation inside the range', () => {
        const v = base().subMap(2, true, 4, true);
        expect([v.firstKey(), v.lastKey(), v.lowerKey(2), v.higherKey(4), v.ceilingKey(0)]).toEqual([2, 4, null, null, 2]);
      });
      it('pollFirstEntry on a view removes from the base', () => {
        const m = base();
        expect(entry(m.tailMap(3).pollFirstEntry())).toEqual([3, 'v3']);
        expect(m.containsKey(3)).toBe(false);
      });
      it('nested views', () => expect(keys(base().headMap(5).tailMap(2).subMap(3, 10))).toEqual([3, 4]));
      it('view equals a map with the same mappings', () => expect(base().headMap(2).equals(SimpleMap.of([1, 'v1']))).toBe(true));
    });

    describe('descending', () => {
      it('descendingMap order', () => expect([...of(1, 2, 3).descendingMap().keySet()]).toEqual([3, 2, 1]));
      it('descendingMap first/last swapped', () => {
        const d = of(1, 2, 3).descendingMap();
        expect([d.firstKey(), d.lastKey()]).toEqual([3, 1]);
      });
      it('descendingMap navigation mirrored', () => {
        const d = of(10, 20, 30).descendingMap();
        expect([d.lowerKey(20), d.higherKey(20), d.floorKey(25), d.ceilingKey(25)]).toEqual([30, 10, 30, 20]);
      });
      it('descendingMap is live and writable', () => {
        const m = of(1);
        const d = m.descendingMap();
        d.put(2, 'v2');
        m.put(3, 'v3');
        expect([...d.keySet()]).toEqual([3, 2, 1]);
      });
      it('descendingMap().descendingMap() is ascending', () => expect([...of(2, 1).descendingMap().descendingMap().keySet()]).toEqual([1, 2]));
      it('navigableKeySet / descendingKeySet', () => {
        const m = of(2, 1, 3);
        expect([[...m.navigableKeySet()], [...m.descendingKeySet()]]).toEqual([
          [1, 2, 3],
          [3, 2, 1],
        ]);
        expect(m.navigableKeySet().floor(2.5)).toBe(2);
      });
      it('removing from navigableKeySet removes the mapping', () => {
        const m = of(1, 2);
        m.navigableKeySet().remove(1);
        expect(m.containsKey(1)).toBe(false);
      });
      it('reversed() is the descending view', () => expect([...of(1, 2).reversed().keySet()]).toEqual([2, 1]));
      it('sequencedKeySet / sequencedValues / sequencedEntrySet are ordered', () => {
        const m = of(2, 1);
        expect([[...m.sequencedKeySet()], [...m.sequencedValues()], m.sequencedEntrySet().getFirst().getKey()]).toEqual([[1, 2], ['v1', 'v2'], 1]);
      });
      it('descending map equals the ascending map', () => {
        const m = of(1, 2);
        expect(m.descendingMap().equals(m)).toBe(true);
      });
    });

    describe('performance (O(log n))', () => {
      it('100k random puts + gets under 1s', () => {
        const r = rng(3);
        const m = create();
        const ms = timeIt(() => {
          for (let i = 0; i < 100_000; i++) m.put(r(1_000_000), i);
          for (let i = 0; i < 100_000; i++) m.get(r(1_000_000));
        });
        expect(ms).toBeLessThan(1_000);
      });
      it('100k ascending puts under 500ms', () => {
        const m = create();
        expect(timeIt(() => {
          for (let i = 0; i < 100_000; i++) m.put(i, i);
        })).toBeLessThan(500);
        expect([m.firstKey(), m.lastKey(), m.size()]).toEqual([0, 99_999, 100_000]);
      });
      it('100k pollFirstEntry under 500ms', () => {
        const m = create();
        for (let i = 0; i < 100_000; i++) m.put(i, i);
        let n = 0;
        expect(timeIt(() => {
          while (m.pollFirstEntry() !== null) n++;
        })).toBeLessThan(500);
        expect(n).toBe(100_000);
      });
    });

    describe('model-based: random ops vs sorted array', () => {
      it.each([1, 3, 5, 7, 9])('seed %p, 4000 ops', (seed) => {
        const r = rng(seed);
        const m = create();
        const ref = new globalThis.Map<number, number>();
        const sortedKeys = () => [...ref.keys()].sort((a, b) => a - b);
        for (let step = 0; step < 4000; step++) {
          const op = r(9);
          const k = r(80);
          const v = r(1000);
          const at = `step ${step} op ${op}`;
          const same = (a: unknown, b: unknown) => expect([at, a]).toEqual([at, b]);
          switch (op) {
            case 0:
            case 1: same(m.put(k, v), ref.has(k) ? ref.get(k) : null); ref.set(k, v); break;
            case 2: same(m.remove(k), ref.has(k) ? ref.get(k) : null); ref.delete(k); break;
            case 3: same(m.get(k), ref.has(k) ? ref.get(k) : null); break;
            case 4: { const ks = sortedKeys(); same([m.floorKey(k), m.ceilingKey(k)], [[...ks].reverse().find((x) => x <= k) ?? null, ks.find((x) => x >= k) ?? null]); break; }
            case 5: { const ks = sortedKeys(); same([m.lowerKey(k), m.higherKey(k)], [[...ks].reverse().find((x) => x < k) ?? null, ks.find((x) => x > k) ?? null]); break; }
            case 6: { const ks = sortedKeys(); const e = m.pollFirstEntry(); same(e && e.getKey(), ks.length ? ks[0] : null); if (ks.length) ref.delete(ks[0]); break; }
            case 7: { const ks = sortedKeys(); const e = m.pollLastEntry(); same(e && e.getKey(), ks.length ? ks[ks.length - 1] : null); if (ks.length) ref.delete(ks[ks.length - 1]); break; }
            case 8: { const hi = k + 25; same(m.subMap(k, hi).size(), sortedKeys().filter((x) => x >= k && x < hi).length); break; }
          }
          same(m.size(), ref.size);
        }
        expect([...m.keySet()]).toEqual(sortedKeys());
        expect([...m.values()]).toEqual(sortedKeys().map((x) => ref.get(x)));
      });
    });
  });
}
