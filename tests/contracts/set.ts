import { Set as SetType } from '../../src/interfaces/Set';
import { Collide, expectThrows, refStringHash, Point, rng, timeIt } from '../helpers';
import { SimpleList, SimpleSet } from '../support';

/** Set contract: uniqueness by equals/hashCode, value equality with any Set. */
export function setContract(name: string, create: () => SetType<any>, opts: { skipScale?: boolean } = {}) {
  const of = (...xs: unknown[]) => {
    const s = create();
    for (const x of xs) s.add(x);
    return s;
  };
  const ss = (...xs: unknown[]) => SimpleSet.of<unknown>(...xs);
  const sorted = (s: SetType<any>) => [...s.toArray()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  describe(`${name} · Set`, () => {
    describe('uniqueness', () => {
      it('add duplicate returns false and keeps size', () => {
        const s = of(1);
        expect(s.add(1)).toBe(false);
        expect(s.size()).toBe(1);
      });
      it('dedupes by equals()', () => {
        const s = of(new Point(1, 1), new Point(1, 1), new Point(1, 2));
        expect(s.size()).toBe(2);
      });
      it('dedupes NaN', () => expect(of(NaN, NaN).size()).toBe(1));
      it('dedupes -0 and +0', () => expect(of(0, -0).size()).toBe(1));
      it('dedupes equal strings', () => expect(of('ab', 'a' + 'b').size()).toBe(1));
      it('toArray has no duplicates', () => expect(sorted(of(3, 1, 3, 2, 1))).toEqual([1, 2, 3]));
      it('re-add after remove returns true', () => {
        const s = of(1);
        s.remove(1);
        expect(s.add(1)).toBe(true);
      });
      it('addAll counts only new elements', () => {
        const s = of(1);
        expect(s.addAll(SimpleList.of(1, 2, 2))).toBe(true);
        expect(s.size()).toBe(2);
      });
      it('keeps the first instance when adding an equal one', () => {
        const a = new Point(1, 1);
        const s = of(a);
        s.add(new Point(1, 1));
        expect(s.toArray()[0]).toBe(a);
      });
    });

    describe('hash collisions', () => {
      it('distinct elements with the same hashCode are all kept', () => {
        const s = of(new Collide(1), new Collide(2), new Collide(3));
        expect(s.size()).toBe(3);
        expect([s.contains(new Collide(1)), s.contains(new Collide(2)), s.contains(new Collide(3))]).toEqual([true, true, true]);
      });
      it('contains is false for a colliding but unequal element', () => expect(of(new Collide(1)).contains(new Collide(9))).toBe(false));
      it('removing one colliding element keeps the others', () => {
        const s = of(new Collide(1), new Collide(2), new Collide(3));
        expect(s.remove(new Collide(2))).toBe(true);
        expect(s.size()).toBe(2);
        expect([s.contains(new Collide(1)), s.contains(new Collide(2)), s.contains(new Collide(3))]).toEqual([true, false, true]);
      });
      it('many collisions (100) still work', () => {
        const s = create();
        for (let i = 0; i < 100; i++) s.add(new Collide(i));
        for (let i = 0; i < 100; i += 2) s.remove(new Collide(i));
        expect(s.size()).toBe(50);
        expect(s.contains(new Collide(51))).toBe(true);
        expect(s.contains(new Collide(50))).toBe(false);
      });
    });

    describe('equals / hashCode', () => {
      it('reflexive', () => {
        const s = of(1);
        expect(s.equals(s)).toBe(true);
      });
      it('equal to another Set implementation regardless of order', () => {
        expect(of(1, 2, 3).equals(ss(3, 1, 2))).toBe(true);
        expect(ss(3, 1, 2).equals(of(1, 2, 3))).toBe(true);
      });
      it('equal to another instance of the same class', () => expect(of(1, 2).equals(of(2, 1))).toBe(true));
      it('empty equals empty', () => expect(create().equals(ss())).toBe(true));
      it('different element', () => expect(of(1, 2).equals(ss(1, 3))).toBe(false));
      it('different size', () => expect(of(1, 2).equals(ss(1))).toBe(false));
      it('not equal to a List with the same elements', () => expect(of(1, 2).equals(SimpleList.of(1, 2))).toBe(false));
      it('not equal to a JS Set', () => expect(of(1).equals(new Set([1]))).toBe(false));
      it('not equal to null', () => expect(of(1).equals(null)).toBe(false));
      it('uses element equals()', () => expect(of(new Point(1, 1)).equals(ss(new Point(1, 1)))).toBe(true));
      it('empty hashCode is 0', () => expect(create().hashCode()).toBe(0));
      it('hashCode is the sum of element hashes', () => {
        expect(of(1, 2, 3).hashCode()).toBe(6);
        expect(of('a', 'b').hashCode()).toBe((refStringHash('a') + refStringHash('b')) | 0);
      });
      it('equal sets have equal hashCodes', () => expect(of(3, 1, 2).hashCode()).toBe(ss(1, 2, 3).hashCode()));
      it('hashCode is order independent', () => expect(of(1, 2).hashCode()).toBe(of(2, 1).hashCode()));
      it('hashCode stays 32-bit', () => {
        const s = create();
        for (let i = 0; i < 2000; i++) s.add(i * 1_000_003);
        const h = s.hashCode();
        expect(h | 0).toBe(h);
      });
    });

    describe('bulk ops', () => {
      it('removeAll', () => {
        const s = of(1, 2, 3, 4);
        expect(s.removeAll(ss(2, 4, 6))).toBe(true);
        expect(sorted(s)).toEqual([1, 3]);
      });
      it('retainAll', () => {
        const s = of(1, 2, 3, 4);
        expect(s.retainAll(ss(2, 4, 6))).toBe(true);
        expect(sorted(s)).toEqual([2, 4]);
      });
      it('containsAll with a List argument containing duplicates', () => expect(of(1, 2).containsAll(SimpleList.of(1, 1, 2))).toBe(true));
      it('union via addAll', () => {
        const s = of(1, 2);
        s.addAll(ss(2, 3));
        expect(sorted(s)).toEqual([1, 2, 3]);
      });
    });

    describe('iteration', () => {
      it('each element exactly once', () => {
        const s = of(5, 1, 4, 1, 5);
        expect(sorted(s)).toEqual([1, 4, 5]);
        expect([...s].length).toBe(3);
      });
      it('iterator.remove keeps contains consistent', () => {
        const s = of(1, 2, 3);
        const it = s.iterator();
        while (it.hasNext()) if (it.next() === 2) it.remove();
        expect([s.contains(1), s.contains(2), s.contains(3), s.size()]).toEqual([true, false, true, 2]);
      });
    });

    (opts.skipScale ? describe.skip : describe)('scale & performance', () => {
      it('100k adds + 100k contains under 1s (O(1)/O(log n))', () => {
        const s = create();
        const ms = timeIt(() => {
          for (let i = 0; i < 100_000; i++) s.add(i);
          for (let i = 0; i < 100_000; i++) if (!s.contains(i)) throw new Error('missing ' + i);
        });
        expect(s.size()).toBe(100_000);
        expect(ms).toBeLessThan(1_000);
      });
      it('100k string elements', () => {
        const s = create();
        for (let i = 0; i < 100_000; i++) s.add('k' + i);
        expect(s.size()).toBe(100_000);
        expect(s.contains('k99999')).toBe(true);
        expect(s.contains('k100000')).toBe(false);
      });
      it('remove half of 50k', () => {
        const s = create();
        for (let i = 0; i < 50_000; i++) s.add(i);
        const ms = timeIt(() => {
          for (let i = 0; i < 50_000; i += 2) s.remove(i);
        });
        expect(s.size()).toBe(25_000);
        expect(ms).toBeLessThan(500);
      });
    });

    describe('model-based: random ops vs JS Set', () => {
      it.each([3, 6, 9, 12, 15])('seed %p, 5000 ops', (seed) => {
        const r = rng(seed);
        const s = create();
        const m = new Set<number>();
        for (let step = 0; step < 5000; step++) {
          const op = r(5);
          const v = r(60);
          const at = `step ${step} op ${op}`;
          const same = (a: unknown, b: unknown) => expect([at, a]).toEqual([at, b]);
          switch (op) {
            case 0:
            case 1: same(s.add(v), !m.has(v)); m.add(v); break;
            case 2: same(s.remove(v), m.delete(v)); break;
            case 3: same(s.contains(v), m.has(v)); break;
            case 4: if (r(60) === 0) { s.clear(); m.clear(); } break;
          }
          same(s.size(), m.size);
        }
        expect(sorted(s)).toEqual([...m].sort((a, b) => a - b));
        expect(s.equals(ss(...m))).toBe(true);
      });
    });

    it('add(null) behaviour is consistent with contains(null)', () => {
      const s = create();
      let accepted = true;
      try {
        s.add(null);
      } catch (e) {
        expect((e as Error).name).toBe('NullPointerException');
        accepted = false;
      }
      if (accepted) expect(s.contains(null)).toBe(true);
      else expectThrows(() => s.add(null), 'NullPointerException');
    });
  });
}
