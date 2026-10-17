import { SimpleEntry } from '../src/abstract/AbstractMap';
import { HashMap } from '../src/map/HashMap';
import { IdentityHashMap } from '../src/map/IdentityHashMap';
import { identityHashCode, hashCode } from '../src/util/Objects';
import { expectThrows, Point, rng } from './helpers';
import { SimpleMap } from './support';

// mapContract assumes value-equal keys, so the applicable parts are covered here by hand.

const of = <K, V>(...pairs: [K, V][]) => {
  const m = new IdentityHashMap<K, V>();
  for (const [k, v] of pairs) m.put(k, v);
  return m;
};

describe('IdentityHashMap', () => {
  describe('basics', () => {
    it('new map is empty', () => {
      const m = new IdentityHashMap();
      expect([m.size(), m.isEmpty(), m.get('a'), m.containsKey('a')]).toEqual([0, true, null, false]);
    });
    it('put returns null then the previous value', () => {
      const m = new IdentityHashMap<string, number>();
      expect([m.put('a', 1), m.put('a', 2), m.get('a'), m.size()]).toEqual([null, 1, 2, 1]);
    });
    it('remove returns the old value; absent is null', () => {
      const m = of(['a', 1], ['b', 2]);
      expect([m.remove('a'), m.remove('a'), m.size()]).toEqual([1, null, 1]);
    });
    it('remove(key, value) compares values by reference', () => {
      const v = new Point(1, 1);
      const m = of(['a', v]);
      expect([m.remove('a', new Point(1, 1)), m.remove('z', 1), m.size(), m.remove('a', v), m.isEmpty()]).toEqual([false, false, 1, true, true]);
    });
    it('clear', () => {
      const m = of(['a', 1]);
      m.clear();
      expect(m.isEmpty()).toBe(true);
      m.put('b', 2);
      expect(m.size()).toBe(1);
    });
    it('containsValue compares by reference', () => {
      const v = new Point(1, 1);
      const m = of(['a', v]);
      expect([m.containsValue(new Point(1, 1)), m.containsValue(v)]).toEqual([false, true]);
    });
    it('null and undefined keys and values', () => {
      const m = of<unknown, unknown>([null, 'n'], [undefined, 'u'], ['v', null]);
      expect([m.size(), m.get(null), m.get(undefined), m.get('v'), m.containsKey('v'), m.containsValue(null)]).toEqual([3, 'n', 'u', null, true, true]);
    });
    it('putAll from SimpleMap; putAll(null) throws NullPointerException', () => {
      const m = of(['a', 1]);
      m.putAll(SimpleMap.of(['a', 9], ['b', 2]));
      expect([m.get('a'), m.get('b')]).toEqual([9, 2]);
      expectThrows(() => m.putAll(null as any), 'NullPointerException');
    });
  });

  describe('identity keys', () => {
    it('equal but distinct objects are different keys', () => {
      const a = new Point(1, 1);
      const b = new Point(1, 1);
      const m = of([a, 'a'], [b, 'b']);
      expect([m.size(), m.get(a), m.get(b), m.get(new Point(1, 1)), m.containsKey(new Point(1, 1))]).toEqual([2, 'a', 'b', null, false]);
    });
    it('Dates by reference', () => {
      const d = new Date(1);
      const m = of([d, 1]);
      expect([m.get(d), m.get(new Date(1))]).toEqual([1, null]);
    });
    it('equals()/hashCode() are never called', () => {
      const k = { equals: jest.fn(() => true), hashCode: jest.fn(() => 1) };
      const m = of<unknown, number>([k, 1], [{ equals: () => true }, 2]);
      m.get({});
      m.containsKey(k);
      expect([k.equals, k.hashCode].map((f) => f.mock.calls.length)).toEqual([0, 0]);
      expect(m.size()).toBe(2);
    });
    it('primitives are their own identity', () => {
      const m = of<unknown, number>(['ab', 1], [5, 2], [5n, 3], [true, 4]);
      expect([m.get('a' + 'b'), m.get(5), m.get(5n), m.get(true), m.get('5')]).toEqual([1, 2, 3, 4, null]);
    });
    it('NaN keys equal each other; -0 equals +0', () => {
      const m = of<number, string>([NaN, 'nan'], [-0, 'zero']);
      expect([m.get(0 / 0), m.get(0), m.size()]).toEqual(['nan', 'zero', 2]);
    });
  });

  describe('views', () => {
    it('keySet contains / remove by identity', () => {
      const a = new Point(1, 1);
      const m = of([a, 1]);
      const ks = m.keySet();
      expect([ks.contains(a), ks.contains(new Point(1, 1)), ks.remove(new Point(1, 1)), ks.remove(a), m.isEmpty()]).toEqual([true, false, false, true, true]);
    });
    it('keySet iterator.remove', () => {
      const m = of(['a', 1], ['b', 2]);
      const it = m.keySet().iterator();
      const k = it.next();
      it.remove();
      expect([m.containsKey(k), m.size()]).toEqual([false, 1]);
    });
    it('values view', () => {
      const m = of(['a', 1], ['b', 1]);
      expect([...m.values()]).toEqual([1, 1]);
      expect(m.values().remove(1)).toBe(true);
      expect(m.size()).toBe(1);
    });
    it('entrySet contains/remove compare keys and values by reference', () => {
      const a = new Point(0, 0);
      const v = new Point(5, 5);
      const m = of([a, v]);
      const es = m.entrySet();
      expect([es.contains(new SimpleEntry(a, v)), es.contains(new SimpleEntry(a, new Point(5, 5))), es.contains(new SimpleEntry(new Point(0, 0), v)), es.contains('x')]).toEqual([
        true,
        false,
        false,
        false,
      ]);
      expect([es.remove(new SimpleEntry(a, new Point(5, 5))), es.remove('x'), m.size(), es.remove(new SimpleEntry(a, v)), m.isEmpty()]).toEqual([false, false, 1, true, true]);
    });
    it('entry setValue writes through; entry equals/hashCode/toString', () => {
      const m = of(['a', 1]);
      const e = m.entrySet().iterator().next();
      expect(e.setValue(2)).toBe(1);
      expect(m.get('a')).toBe(2);
      expect([e.equals(new SimpleEntry('a', 2)), e.equals(new SimpleEntry('a', 3)), e.equals(e), e.equals('a=2'), e.toString()]).toEqual([true, false, true, false, 'a=2']);
      expect(e.hashCode()).toBe(identityHashCode('a') ^ hashCode(2));
    });
    it('entry equals compares keys by reference (NaN equals NaN)', () => {
      const p = new Point(1, 1);
      const e = of([p, 1]).entrySet().iterator().next();
      expect([e.equals(new SimpleEntry(new Point(1, 1), 1)), e.equals(new SimpleEntry(p, 1))]).toEqual([false, true]);
      const n = of([NaN, 1]).entrySet().iterator().next();
      expect(n.equals(new SimpleEntry(NaN, 1))).toBe(true);
    });
    it('entrySet clear / add', () => {
      const m = of(['a', 1]);
      expectThrows(() => m.entrySet().add(new SimpleEntry('b', 2)), 'UnsupportedOperationException');
      m.entrySet().clear();
      expect(m.isEmpty()).toBe(true);
    });
    it('iterators are fail-fast; overwrite is not structural', () => {
      const m = of(['a', 1], ['b', 2]);
      const it = m.entrySet().iterator();
      it.next();
      m.put('a', 5);
      expect(() => it.next()).not.toThrow();
      const it2 = m.keySet().iterator();
      it2.next();
      m.put('c', 3);
      expectThrows(() => it2.next(), 'ConcurrentModificationException');
      expectThrows(() => it2.remove(), 'ConcurrentModificationException');
    });
    it('iterator state errors', () => {
      const m = of(['a', 1]);
      const it = m.entrySet().iterator();
      expectThrows(() => it.remove(), 'IllegalStateException');
      it.next();
      expectThrows(() => it.next(), 'NoSuchElementException');
      it.remove();
      expectThrows(() => it.remove(), 'IllegalStateException');
      expect(m.isEmpty()).toBe(true);
    });
    it('forEachRemaining', () => {
      const it = of(['a', 1], ['b', 2], ['c', 3]).entrySet().iterator();
      it.next();
      const seen: string[] = [];
      it.forEachRemaining((e) => seen.push(e.getKey()));
      expect([seen.length, it.hasNext()]).toEqual([2, false]);
      expectThrows(() => it.forEachRemaining(null as any), 'NullPointerException');
    });
  });

  describe('equals / hashCode / toString', () => {
    it('identity maps compare keys and values by reference', () => {
      const a = new Point(1, 1);
      const v = new Point(2, 2);
      expect(of([a, 1]).equals(of([a, 1]))).toBe(true);
      expect(of([a, 1]).equals(of([new Point(1, 1), 1]))).toBe(false);
      expect(of([a, new Point(2, 2)]).equals(of([a, new Point(2, 2)]))).toBe(false);
      expect(of([a, v]).equals(of([a, v]))).toBe(true);
      expect(of([a, 1]).equals(of([a, 2]))).toBe(false);
      expect(of<unknown, number>([a, 1]).equals(of<unknown, number>([a, 1], ['b', 2]))).toBe(false);
    });
    it('reflexive, and equal to other maps with primitive keys', () => {
      const m = of(['a', 1], ['b', 2]);
      expect([m.equals(m), m.equals(SimpleMap.of(['b', 2], ['a', 1])), SimpleMap.of(['b', 2], ['a', 1]).equals(m), m.equals(HashMap.of(['a', 1], ['b', 2]))]).toEqual([true, true, true, true]);
      expect([m.equals(null), m.equals(new globalThis.Map([['a', 1]]))]).toEqual([false, false]);
    });
    it('hashCode = sum of identityHashCode(key) ^ hashCode(value)', () => {
      const p = new Point(1, 1);
      const m = of<unknown, unknown>([p, 'x'], ['a', 2]);
      expect(m.hashCode()).toBe(((identityHashCode(p) ^ hashCode('x')) + (identityHashCode('a') ^ hashCode(2))) | 0);
      expect(new IdentityHashMap().hashCode()).toBe(0);
    });
    it('equal identity maps have equal hashCodes, even with equal-but-distinct values', () => {
      const k = {};
      expect(of([k, new Point(1, 1)]).hashCode()).toBe(of([k, new Point(1, 1)]).hashCode());
    });
    it('primitive-keyed identity map hashes like a HashMap', () => expect(of(['a', 1], ['b', 2]).hashCode()).toBe(HashMap.of(['a', 1], ['b', 2]).hashCode()));
    it('toString', () => {
      expect(of(['a', 1]).toString()).toBe('{a=1}');
      const m = new IdentityHashMap<string, unknown>();
      m.put('self', m);
      expect(m.toString()).toBe('{self=(this Map)}');
    });
  });

  describe('default methods', () => {
    it('getOrDefault / putIfAbsent / replace', () => {
      const m = of<string, number>(['a', 1]);
      expect([m.getOrDefault('a', 0), m.getOrDefault('z', 0), m.putIfAbsent('a', 5), m.putIfAbsent('b', 2), m.get('b')]).toEqual([1, 0, 1, null, 2]);
      expect([m.replace('a', 3), m.replace('z', 1), m.replace('a', 9, 4), m.replace('a', 3, 4), m.get('a')]).toEqual([1, null, false, true, 4]);
    });
    it('compute family by identity', () => {
      const k = new Point(1, 1);
      const m = new IdentityHashMap<Point, number>();
      expect(m.computeIfAbsent(k, () => 1)).toBe(1);
      expect(m.computeIfAbsent(new Point(1, 1), () => 2)).toBe(2);
      expect(m.size()).toBe(2);
      expect(m.computeIfPresent(k, (_k, v) => v + 10)).toBe(11);
      expect(m.compute(k, () => null)).toBeNull();
      expect(m.merge(k, 1, (a, b) => a + b)).toBe(1);
      expect(m.merge(k, 1, (a, b) => a + b)).toBe(2);
      expect(m.containsKey(k)).toBe(true);
      expectThrows(() => m.merge(k, null as any, (a) => a), 'NullPointerException');
    });
    it('forEach visits each mapping; fail-fast; null action', () => {
      const m = of(['a', 1], ['b', 2]);
      const seen: string[] = [];
      m.forEach((k, v) => seen.push(k + v));
      expect(seen.sort()).toEqual(['a1', 'b2']);
      expectThrows(() => m.forEach(() => m.put('z' + Math.random(), 0)), 'ConcurrentModificationException');
      expectThrows(() => m.forEach(null as any), 'NullPointerException');
    });
    it('replaceAll', () => {
      const m = of(['a', 1], ['b', 2]);
      m.replaceAll((k, v) => v * 10);
      expect([m.get('a'), m.get('b')]).toEqual([10, 20]);
    });
  });

  describe('construction & interop', () => {
    it('constructors', () => {
      expectThrows(() => new IdentityHashMap(-1), 'IllegalArgumentException');
      expectThrows(() => new IdentityHashMap(NaN), 'IllegalArgumentException');
      expectThrows(() => new IdentityHashMap(null as any), 'NullPointerException');
      expect(new IdentityHashMap(10).size()).toBe(0);
      const p = new Point(1, 1);
      const copy = new IdentityHashMap(HashMap.of<unknown, number>([p, 1], ['a', 2]));
      expect([copy.get(p), copy.get(new Point(1, 1)), copy.get('a')]).toEqual([1, null, 2]);
    });
    it('clone is independent', () => {
      const m = of(['a', 1]);
      const c = m.clone();
      c.put('b', 2);
      c.entrySet().iterator().next().setValue(9);
      expect([m.size(), m.get('a'), c.size(), c instanceof IdentityHashMap]).toEqual([1, 1, 2, true]);
    });
    it('spread / for..of / new Map / Object.fromEntries', () => {
      const m = of(['a', 1], ['b', 2]);
      expect([...m]).toEqual([['a', 1], ['b', 2]]);
      expect(new globalThis.Map(m).get('b')).toBe(2);
      expect(Object.fromEntries(m)).toEqual({ a: 1, b: 2 });
      const it = m[Symbol.iterator]();
      expect(Object.prototype.toString.call(it)).toBe('[object Object]');
    });
    it('for..of is fail-fast', () => {
      const m = of(['a', 1], ['b', 2]);
      expect(() => {
        for (const [k] of m) m.put(k + 'x', 0);
      }).toThrow();
    });
  });

  describe('more', () => {
    it('keySet is live', () => {
      const m = new IdentityHashMap<string, number>();
      const ks = m.keySet();
      m.put('a', 1);
      expect([ks.size(), ks.isEmpty(), ks.contains('a')]).toEqual([1, false, true]);
    });
    it('containsValue NaN and missing undefined', () => {
      const m = of(['a', NaN]);
      expect([m.containsValue(NaN), m.containsValue(undefined)]).toEqual([true, false]);
    });
    it('clear during iteration is detected', () => {
      const m = of(['a', 1], ['b', 2]);
      const it = m.keySet().iterator();
      it.next();
      m.clear();
      expectThrows(() => it.next(), 'ConcurrentModificationException');
    });
    it('remove through every entry via iterator', () => {
      const m = new IdentityHashMap<object, number>();
      for (let i = 0; i < 100; i++) m.put({}, i);
      const it = m.entrySet().iterator();
      while (it.hasNext()) {
        it.next();
        it.remove();
      }
      expect(m.isEmpty()).toBe(true);
    });
  });

  describe('model test vs native Map', () => {
    it('200k random ops with object keys', () => {
      const r = rng(5);
      const keys: unknown[] = [];
      for (let i = 0; i < 100; i++) keys.push(new Point(i % 3, 0), i, 's' + i);
      keys.push(NaN, null, undefined);
      const m = new IdentityHashMap<unknown, number>();
      const ref = new globalThis.Map<unknown, number>();
      for (let step = 0; step < 200_000; step++) {
        const k = keys[r(keys.length)];
        const v = r(100);
        switch (r(5)) {
          case 0:
          case 1:
            if (m.put(k, v) !== (ref.has(k) ? ref.get(k) : null)) throw new Error(`put ${step}`);
            ref.set(k, v);
            break;
          case 2:
            if (m.remove(k) !== (ref.has(k) ? ref.get(k) : null)) throw new Error(`remove ${step}`);
            ref.delete(k);
            break;
          case 3:
            if (m.get(k) !== (ref.has(k) ? ref.get(k) : null)) throw new Error(`get ${step}`);
            break;
          case 4:
            if (m.containsKey(k) !== ref.has(k)) throw new Error(`containsKey ${step}`);
            break;
        }
        if (m.size() !== ref.size) throw new Error(`size ${step}`);
      }
      expect([...m]).toEqual([...ref]);
    });
  });
});

describe('IdentityHashMap · reference equality for values', () => {
  const v = new Point(7, 7);
  const twin = () => new Point(7, 7);
  it('replace(key, old, new) matches old by reference', () => {
    const m = of(['a', v]);
    expect([m.replace('a', twin(), new Point(0, 0)), m.get('a'), m.replace('a', v, new Point(0, 0)), m.get('a')]).toEqual([false, v, true, new Point(0, 0)]);
  });
  it('entry equals compares values by reference', () => {
    const e = of(['a', v]).entrySet().iterator().next();
    expect([e.equals(new SimpleEntry('a', twin())), e.equals(new SimpleEntry('a', v))]).toEqual([false, true]);
  });
  it('equals another Map kind only for the same value instances', () => {
    expect([of(['a', v]).equals(HashMap.of(['a', twin()])), of(['a', v]).equals(HashMap.of(['a', v])), of(['a', v]).equals(SimpleMap.of(['a', twin()]))]).toEqual([
      false,
      true,
      false,
    ]);
  });
  it('values() contains / remove / containsAll by reference', () => {
    const m = of<string, Point>(['a', v], ['b', new Point(1, 1)]);
    const vs = m.values();
    expect([vs.contains(twin()), vs.contains(v), vs.containsAll(HashMap.of(['x', twin()]).values()), vs.containsAll(HashMap.of(['x', v]).values())]).toEqual([
      false,
      true,
      false,
      true,
    ]);
    expect([vs.remove(twin()), m.size(), vs.remove(v), m.size(), m.containsKey('a')]).toEqual([false, 2, true, 1, false]);
  });
  it('values() view is live, iterates and clears', () => {
    const m = of(['a', 1], ['b', 2]);
    const vs = m.values();
    expect([vs.size(), [...vs]]).toEqual([2, [1, 2]]);
    const it = vs.iterator();
    it.next();
    it.remove();
    expect(m.size()).toBe(1);
    vs.clear();
    expect(m.isEmpty()).toBe(true);
    expect(m.values()).toBe(vs);
  });
  it('NaN values match NaN', () => {
    const m = of(['a', NaN]);
    expect([m.containsValue(NaN), m.values().contains(NaN), m.remove('a', NaN)]).toEqual([true, true, true]);
  });
});

describe('IdentityHashMap · keySet', () => {
  it('hashCode is the sum of the keys identity hash codes', () => {
    const p = new Point(1, 1);
    const m = of<unknown, number>([p, 1], ['a', 2]);
    expect(m.keySet().hashCode()).toBe((identityHashCode(p) + identityHashCode('a')) | 0);
    expect(new IdentityHashMap().keySet().hashCode()).toBe(0);
  });
  it('contains / remove by reference; live; clear', () => {
    const p = new Point(1, 1);
    const m = of<unknown, number>([p, 1], ['a', 2]);
    const ks = m.keySet();
    expect([ks.contains(new Point(1, 1)), ks.contains(p), ks.remove(new Point(1, 1)), ks.remove(p), m.size(), [...ks]]).toEqual([false, true, false, true, 1, ['a']]);
    ks.clear();
    expect(m.isEmpty()).toBe(true);
    expect(m.keySet()).toBe(ks);
  });
});

describe('IdentityHashMap · clone and compute', () => {
  it('clone keeps the runtime subclass and its fields', () => {
    class Sub<K, V> extends IdentityHashMap<K, V> {
      tag = 'sub';
    }
    const m = new Sub<string, number>();
    m.put('a', 1);
    m.keySet();
    const c = m.clone();
    c.put('b', 2);
    expect([c instanceof Sub, (c as Sub<string, number>).tag, c.size(), m.size(), [...c.keySet()]]).toEqual([true, 'sub', 2, 1, ['a', 'b']]);
  });
  it('compute callbacks that modify the map are not detected (Map defaults)', () => {
    const m = of(['a', 1]);
    expect(m.computeIfAbsent('b', () => (m.put('c', 3), 2))).toBe(2);
    expect(m.size()).toBe(3);
  });
});
