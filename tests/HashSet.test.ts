import { HashMap } from '../src/map/HashMap';
import { HashSet } from '../src/set/HashSet';
import { TreeSet } from '../src/set/TreeSet';
import { collectionContract } from './contracts/collection';
import { setContract } from './contracts/set';
import { Collide, expectThrows, Point, rng, timeIt } from './helpers';
import { SimpleList, SimpleSet } from './support';

collectionContract('HashSet', () => new HashSet(), { allowsNull: true, allowsDuplicates: false });
setContract('HashSet', () => new HashSet());

class LikeOne {
  equals(o: unknown): boolean {
    return o === 1 || o instanceof LikeOne;
  }
  hashCode(): number {
    return 1;
  }
}

const sorted = <T>(xs: T[]) => [...xs].sort((a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0));
const mixed = (): unknown[] => [0, 3, 1e9, -2, 0.5, 's', false, 5n, null, undefined, {}, new Point(1, 1), new Date(4), new Collide(1), new Collide(2), new Collide(3)];

describe('HashSet · implementation', () => {
  describe('hybrid storage', () => {
    it('holds every kind of element at once', () => {
      const xs = mixed();
      const s = new HashSet<unknown>();
      for (const x of xs) expect(s.add(x)).toBe(true);
      for (const x of xs) expect(s.add(x)).toBe(false);
      expect(s.size()).toBe(xs.length);
      for (const x of xs) expect(s.contains(x)).toBe(true);
      expect([s.contains(new Point(1, 1)), s.contains(new Date(4)), s.contains(new Collide(3)), s.contains(new Collide(4)), s.contains({})]).toEqual([true, true, true, false, false]);
      for (const x of xs) expect(s.remove(x)).toBe(true);
      for (const x of xs) expect(s.remove(x)).toBe(false);
      expect(s.isEmpty()).toBe(true);
    });
    it('colliding elements mixed with the primitive of the same hash', () => {
      const s = HashSet.of<unknown>(42, new Collide(1), new Collide(2), '42');
      expect([s.size(), s.contains(42), s.contains(new Collide(2)), s.contains('42')]).toEqual([4, true, true, true]);
      s.remove(new Collide(1));
      expect([s.contains(new Collide(1)), s.contains(new Collide(2)), s.size()]).toEqual([false, true, 3]);
    });
    it('Date elements by time; first instance kept', () => {
      const d = new Date(1);
      const s = HashSet.of(d, new Date(1), new Date(2));
      expect([s.size(), s.toArray().includes(d)]).toEqual([2, true]);
    });
    it('an element whose equals() claims a primitive stays distinct from it', () => {
      const s = HashSet.of<unknown>(1, new LikeOne());
      expect([s.size(), s.contains(1), s.contains(new LikeOne())]).toEqual([2, true, true]);
      expect(s.remove(1)).toBe(true);
      expect([s.contains(1), s.contains(new LikeOne())]).toEqual([false, true]);
    });
    it('NaN, -0 and +0', () => {
      const s = HashSet.of(NaN, -0, 0, 0 / 0);
      expect([s.size(), s.contains(NaN), s.contains(0), s.contains(-0)]).toEqual([2, true, true, true]);
      expect([s.remove(-0), s.contains(0), s.remove(NaN), s.size()]).toEqual([true, false, true, 0]);
    });
    it('null and undefined are distinct', () => {
      const s = HashSet.of<unknown>(null, undefined);
      expect([s.size(), s.remove(undefined), s.contains(null), s.contains(undefined)]).toEqual([2, true, true, false]);
    });
    it('sparse integers fall back to the native Set', () => {
      const s = new HashSet<number>();
      s.add(1500); // beyond the dense bound while empty
      for (let i = 0; i < 2000; i++) s.add(i);
      s.add(9_000_000);
      expect([s.size(), s.contains(1500), s.contains(9_000_000), s.add(1500)]).toEqual([2001, true, true, false]);
      expect([s.remove(1500), s.contains(1500), s.remove(9_000_000), s.size()]).toEqual([true, false, true, 1999]);
    });
    it('emptying the dense table and refilling works', () => {
      const s = new HashSet<number>();
      for (let i = 0; i < 50; i++) s.add(i);
      for (let i = 0; i < 50; i++) s.remove(i);
      s.add(7);
      expect([...s]).toEqual([7]);
    });
    it('negative, fractional and huge numbers', () => {
      const s = HashSet.of(-1, 0.25, 2 ** 40, -Infinity);
      expect([s.contains(-1), s.contains(0.25), s.contains(2 ** 40), s.contains(-Infinity), s.contains(1)]).toEqual([true, true, true, true, false]);
    });
  });

  describe('iteration', () => {
    it('iterator.remove across every storage kind', () => {
      const xs = mixed();
      const s = new HashSet<unknown>();
      xs.forEach((x) => s.add(x));
      const it = s.iterator();
      let n = 0;
      while (it.hasNext()) {
        it.next();
        if (n++ % 2 === 0) it.remove();
      }
      expect([n, s.size()]).toEqual([xs.length, xs.length / 2]);
      for (const x of s.toArray()) expect(s.contains(x)).toBe(true);
      const it2 = s.iterator();
      while (it2.hasNext()) {
        it2.next();
        it2.remove();
      }
      expect(s.isEmpty()).toBe(true);
    });
    it('iterator.remove after outside modification throws ConcurrentModificationException', () => {
      const s = HashSet.of(1, 2);
      const it = s.iterator();
      it.next();
      s.add(3);
      expectThrows(() => it.remove(), 'ConcurrentModificationException');
    });
    it('adding an existing element is not structural', () => {
      const s = HashSet.of<unknown>(1, 'a', new Point(1, 1));
      const it = s.iterator();
      it.next();
      s.add(1);
      s.add('a');
      s.add(new Point(1, 1));
      s.remove('missing');
      s.remove(new Point(9, 9));
      expect(() => it.next()).not.toThrow();
    });
    it('forEach covers all kinds and is fail-fast', () => {
      const xs = mixed();
      const s = new HashSet<unknown>();
      xs.forEach((x) => s.add(x));
      let n = 0;
      s.forEach(() => n++);
      expect(n).toBe(xs.length);
      expectThrows(() => s.forEach(() => s.add({})), 'ConcurrentModificationException');
      const ints = HashSet.of(1, 2);
      expectThrows(() => ints.forEach(() => ints.add(Math.random())), 'ConcurrentModificationException');
      const vals = HashSet.of(new Point(1, 1), new Point(2, 2));
      expectThrows(() => vals.forEach(() => vals.add(new Point(Math.random(), 0))), 'ConcurrentModificationException');
      expectThrows(() => s.forEach(null as any), 'NullPointerException');
    });
    it('toArray / spread / Array.from agree', () => {
      const xs = mixed();
      const s = new HashSet<unknown>();
      xs.forEach((x) => s.add(x));
      expect([s.toArray().length, [...s].length, Array.from(s).length]).toEqual([xs.length, xs.length, xs.length]);
      expect(sorted(HashSet.of<unknown>(3, 1, 2, 'b', 'a').toArray())).toEqual([1, 2, 3, 'a', 'b']);
    });
    it('[Symbol.iterator] is a plain iterator', () => {
      const it = HashSet.of(1)[Symbol.iterator]();
      expect(Object.prototype.toString.call(it)).toBe('[object Object]');
      expect([it.next(), it.next()]).toEqual([{ value: 1, done: false }, { value: undefined, done: true }]);
    });
    it('forEachRemaining(null) throws NullPointerException', () => expectThrows(() => HashSet.of(1).iterator().forEachRemaining(null as any), 'NullPointerException'));
  });

  describe('removeIf', () => {
    it('removes matches from every storage kind', () => {
      const s = new HashSet<unknown>();
      mixed().forEach((x) => s.add(x));
      expect(s.removeIf((x) => x instanceof Collide || typeof x === 'number')).toBe(true);
      expect(s.toArray().some((x) => x instanceof Collide || typeof x === 'number')).toBe(false);
      expect(s.size()).toBe(mixed().length - 8);
      expect(s.removeIf(() => false)).toBe(false);
    });
    it('is fail-fast if the predicate modifies the set', () => {
      for (const seed of [[1, 2], ['a', 'b'], [new Point(1, 1), new Point(2, 2)]]) {
        const s = HashSet.of<unknown>(...seed);
        expectThrows(() => s.removeIf(() => (s.add({}), false)), 'ConcurrentModificationException');
        const t = HashSet.of<unknown>(...seed);
        expectThrows(() => t.removeIf(() => (t.add({}), true)), 'ConcurrentModificationException');
      }
    });
    it('null predicate throws NullPointerException', () => expectThrows(() => new HashSet().removeIf(null as any), 'NullPointerException'));
  });

  describe('set algebra', () => {
    it('union, intersection, difference with a mix of element kinds', () => {
      const a = HashSet.of<unknown>(1, 2, 3, 'x', new Point(1, 1), new Collide(1));
      const b = SimpleSet.of<unknown>(3, 4, 'x', new Point(1, 1), new Collide(2));
      const union = a.clone();
      expect(union.addAll(b)).toBe(true);
      expect(union.size()).toBe(8);
      const inter = a.clone();
      expect(inter.retainAll(b)).toBe(true);
      expect(inter.equals(SimpleSet.of<unknown>(3, 'x', new Point(1, 1)))).toBe(true);
      const diff = a.clone();
      expect(diff.removeAll(b)).toBe(true);
      expect(diff.equals(SimpleSet.of<unknown>(1, 2, new Collide(1)))).toBe(true);
      expect(a.containsAll(inter)).toBe(true);
      expect(a.containsAll(b)).toBe(false);
    });
    it('addAll from a List dedupes', () => {
      const s = new HashSet<number>(SimpleList.of(1, 1, 2, 2, 3));
      expect(s.size()).toBe(3);
    });
    it('hashCode / equals with SimpleSet across kinds', () => {
      const s = HashSet.of<unknown>(1, 'a', new Point(2, 3), new Date(5));
      const t = SimpleSet.of<unknown>(new Date(5), new Point(2, 3), 'a', 1);
      expect([s.equals(t), t.equals(s), s.hashCode() === t.hashCode()]).toEqual([true, true, true]);
    });
  });

  describe('construction', () => {
    it('constructor validation', () => {
      expectThrows(() => new HashSet(-1), 'IllegalArgumentException');
      expectThrows(() => new HashSet(NaN), 'IllegalArgumentException');
      expectThrows(() => new HashSet(8, 0), 'IllegalArgumentException');
      expectThrows(() => new HashSet(8, NaN), 'IllegalArgumentException');
      expectThrows(() => new HashSet(null as any), 'NullPointerException');
      expect([new HashSet(0).size(), new HashSet(10, 0.75).size()]).toEqual([0, 0]);
    });
    it('clone is independent', () => {
      const s = HashSet.of<unknown>(1, 'a', new Point(1, 1), new Collide(1), new Collide(2));
      const c = s.clone();
      c.add(2);
      c.remove(new Collide(1));
      c.remove(1);
      expect([s.size(), s.contains(new Collide(1)), s.contains(1), s.contains(2), c.size()]).toEqual([5, true, true, false, 4]);
      expect(c instanceof HashSet).toBe(true);
    });
    it('copy from another HashSet', () => {
      const s = new HashSet<unknown>(HashSet.of<unknown>(1, new Point(0, 0)));
      expect([s.size(), s.contains(new Point(0, 0))]).toEqual([2, true]);
    });
  });

  describe('edge cases', () => {
    it('value-element lookups on a set without value elements', () => {
      const s = HashSet.of<unknown>(1, 'a');
      expect([s.contains(new Point(1, 1)), s.remove(new Point(1, 1)), s.contains(new Date(1))]).toEqual([false, false, false]);
    });
    it('colliding but unequal element is neither contained nor removed', () => {
      const s = HashSet.of(new Collide(1));
      expect([s.contains(new Collide(2)), s.remove(new Collide(2)), s.size()]).toEqual([false, false, 1]);
    });
    it('Dates with different times are different', () => expect(HashSet.of(new Date(1)).contains(new Date(2))).toBe(false));
    it('clear empties every kind and the set is reusable', () => {
      const s = new HashSet<unknown>();
      mixed().forEach((x) => s.add(x));
      s.clear();
      expect([s.size(), s.contains(0), s.contains('s'), s.contains(new Point(1, 1)), s.iterator().hasNext()]).toEqual([0, false, false, false, false]);
      mixed().forEach((x) => s.add(x));
      expect(s.size()).toBe(mixed().length);
    });
    it('clear during iteration is detected', () => {
      const s = HashSet.of(1, 2, 3);
      const it = s.iterator();
      it.next();
      s.clear();
      expectThrows(() => it.next(), 'ConcurrentModificationException');
    });
    it('toString with mixed kinds', () => expect(HashSet.of<unknown>(1, new Point(1, 2)).toString()).toMatch(/^\[(1, \(1,2\)|\(1,2\), 1)\]$/));
    it('equals its clone; hashCode of ints is their sum', () => {
      const s = HashSet.of(1, 2, 3, 1000);
      expect([s.equals(s.clone()), s.hashCode()]).toEqual([true, 1006]);
    });
    it('of() with no arguments is empty', () => expect(HashSet.of().isEmpty()).toBe(true));
    it('retainAll(empty) clears every kind', () => {
      const s = new HashSet<unknown>();
      mixed().forEach((x) => s.add(x));
      expect(s.retainAll(SimpleSet.of())).toBe(true);
      expect(s.isEmpty()).toBe(true);
    });
    it('removeAll(this) empties; addAll(this) changes nothing', () => {
      const s = HashSet.of<unknown>(1, 'a', new Point(0, 0));
      expect(s.addAll(s)).toBe(false);
      expect(s.size()).toBe(3);
      expect(s.removeAll(s)).toBe(true);
      expect(s.isEmpty()).toBe(true);
    });
    it('dense integers iterate in ascending order', () => expect([...HashSet.of(5, 3, 9, 0, 1)]).toEqual([0, 1, 3, 5, 9]));
    it('iteration after removing most of a large dense range', () => {
      const s = new HashSet<number>();
      for (let i = 0; i < 10_000; i++) s.add(i);
      s.removeIf((x) => x % 1000 !== 0);
      expect([...s]).toEqual([0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000]);
    });
    it('add of a value element does not disturb ints', () => {
      const s = HashSet.of<unknown>(1, 2);
      s.add(new Point(1, 2));
      expect([s.contains(1), s.contains(2), s.size()]).toEqual([true, true, 3]);
    });
    it('hasNext is idempotent across storage kinds', () => {
      const it = HashSet.of<unknown>(1, 'a', new Point(1, 1)).iterator();
      let n = 0;
      while (it.hasNext() && it.hasNext()) {
        it.next();
        n++;
      }
      expect([n, it.hasNext()]).toEqual([3, false]);
    });
    it('100k-element removeIf is linear', () => {
      const s = new HashSet<string>();
      for (let i = 0; i < 100_000; i++) s.add('k' + i);
      const ms = timeIt(() => {
        s.removeIf((x) => x.endsWith('7'));
      });
      expect(ms).toBeLessThan(500);
      expect(s.size()).toBe(90_000);
    });
  });

  describe('model test vs native Set', () => {
    it('1M random ops over mixed element kinds', () => {
      const r = rng(77);
      const s = new HashSet<unknown>();
      const ref = new globalThis.Set<string>();
      const pool: [unknown, string][] = [];
      for (let i = 0; i < 300; i++) pool.push([i, 'i' + i], ['s' + i, 's' + i], [new Point(i % 10, (i / 10) | 0), `p${i % 10},${(i / 10) | 0}`], [new Collide(i), 'c' + i]);
      pool.push([7_000_000, 'big'], [-5, 'neg'], [NaN, 'nan'], [null, 'null'], [undefined, 'u'], [new Date(3), 'd']);
      for (let step = 0; step < 1_000_000; step++) {
        const [x, id] = pool[r(pool.length)];
        switch (r(7)) {
          case 0:
          case 1:
          case 2:
            if (s.add(x) !== !ref.has(id)) throw new Error(`add step ${step}`);
            ref.add(id);
            break;
          case 3:
          case 4:
            if (s.remove(x) !== ref.delete(id)) throw new Error(`remove step ${step}`);
            break;
          case 5:
            if (s.contains(x) !== ref.has(id)) throw new Error(`contains step ${step}`);
            break;
          case 6:
            if (r(5000) === 0) {
              s.clear();
              ref.clear();
            }
            break;
        }
        if (s.size() !== ref.size) throw new Error(`size step ${step}`);
      }
      expect(s.toArray().length).toBe(ref.size);
      expect(new HashSet(s).equals(s)).toBe(true);
    });
  });
});

describe('HashSet SE 27 additions', () => {
  const ci = (a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase());
  it('newHashSet(n) returns an empty, usable HashSet', () => {
    const s = HashSet.newHashSet<number>(10);
    expect([s instanceof HashSet, s.size(), s.add(1), s.contains(1)]).toEqual([true, 0, true, true]);
    expect(HashSet.newHashSet(0).isEmpty()).toBe(true);
  });
  it('newHashSet rejects negative and NaN', () => {
    expectThrows(() => HashSet.newHashSet(-1), 'IllegalArgumentException');
    expectThrows(() => HashSet.newHashSet(NaN), 'IllegalArgumentException');
  });
  it('constructor rejects a non-collection argument with IllegalArgumentException', () => {
    expectThrows(() => new HashSet({} as never), 'IllegalArgumentException');
    expectThrows(() => new HashSet('abc' as never), 'IllegalArgumentException');
    expectThrows(() => new HashSet(null as never), 'NullPointerException');
  });
  it('removeAll(smaller case-insensitive TreeSet) uses HashSet equality', () => {
    const s = HashSet.of('A', 'b', 'x');
    const c = new TreeSet<string>(ci);
    c.add('a');
    c.add('B');
    expect(s.removeAll(c)).toBe(false);
    expect(s.size()).toBe(3);
  });
  it('removeAll(larger case-insensitive TreeSet) uses its contains', () => {
    const s = HashSet.of('A', 'b');
    const c = new TreeSet<string>(ci);
    ['a', 'B', 'z'].forEach((x) => c.add(x));
    expect(s.removeAll(c)).toBe(true);
    expect(s.isEmpty()).toBe(true);
  });
  it('toArray(generator) covers index, native and bucket storage', () => {
    const s = HashSet.of<unknown>(1, 'a', new Point(1, 2));
    const out = s.toArray((n) => new Array<unknown>(n));
    expect(out.length).toBe(3);
    expect(s.containsAll(SimpleList.of(...out))).toBe(true);
  });
});

describe('an element whose hash changed after insertion', () => {
  it('iterator.remove of a mutated Date removes it without throwing', () => {
    const s = new HashSet<Date>();
    const d = new Date(1);
    s.add(d);
    s.add(new Date(5));
    d.setTime(2);
    const it = s.iterator();
    while (it.hasNext()) if (it.next() === d) it.remove();
    expect(s.toArray().map((x) => x.getTime())).toEqual([5]);
  });
  it('iterator.remove removes exactly that element, not a neighbour in the new bucket', () => {
    class K {
      constructor(public id: number, public h: number) {}
      equals(o: unknown): boolean {
        return o instanceof K && o.id === this.id;
      }
      hashCode(): number {
        return this.h;
      }
    }
    const s = new HashSet<K>();
    const k = new K(1, 5);
    s.add(k);
    s.add(new K(2, 9));
    s.add(new K(3, 9));
    k.h = 9;
    const it = s.iterator();
    while (it.hasNext()) if (it.next() === k) it.remove();
    expect(s.toArray().map((x) => x.id).sort()).toEqual([2, 3]);
  });
});

describe('HashSet dense integer table', () => {
  it('shrinks when removing the top integers leaves it mostly empty', () => {
    const m = new HashSet<number>();
    for (let i = 0; i < 10_000; i++) m.add(i);
    for (let i = 9_999; i > 0; i--) m.remove(i);
    expect(m.size()).toBe(1);
    expect(m.ints.length).toBeLessThanOrEqual(1024 + 4);
    m.add(5);
    expect([m.size(), m.contains(5)]).toEqual([2, true]);
  });
});

describe('integer keys around the dense-table limit (2^30) and beyond 32 bits', () => {
  const keys = [0, 1, 2 ** 30 - 1, 2 ** 30, 2 ** 31 - 1, 2 ** 31, 2 ** 32 - 1, 2 ** 32, 2 ** 53 - 1, -1, -(2 ** 31)];
  it('HashSet and HashMap store, find, iterate and remove them', () => {
    const s = new HashSet<number>();
    const m = new HashMap<number, number>();
    for (const k of keys) {
      s.add(k);
      m.put(k, k + 1);
    }
    expect([s.size(), m.size(), keys.every((k) => s.contains(k) && m.get(k) === k + 1)]).toEqual([keys.length, keys.length, true]);
    expect([...s].sort((a, b) => a - b)).toEqual([...keys].sort((a, b) => a - b));
    for (const k of keys.slice(0, 6)) {
      s.remove(k);
      m.remove(k);
    }
    expect([s.size(), m.size(), s.contains(2 ** 30), m.containsKey(2 ** 32)]).toEqual([5, 5, false, true]);
  });
});
