import { SimpleEntry } from '../../src/abstract/AbstractMap';
import { Map as MapType } from '../../src/interfaces/Map';
import { Collide, expectThrows, Point, rng, timeIt, refStringHash } from '../helpers';
import { SimpleMap } from '../support';

export interface MapOptions {
  allowsNullKey: boolean;
  allowsNullValue: boolean;
  /** sorted maps: keys must be mutually comparable */
  requiresComparableKeys?: boolean;
  /** skip 100k-element perf tests (for O(n) test-only implementations) */
  skipScale?: boolean;
  /** access-ordered maps: overwriting a key moves it, so it is a structural change */
  accessOrdered?: boolean;
  /** computeIfAbsent, computeIfPresent, compute and merge throw ConcurrentModificationException when the callback structurally modifies the map */
  detectsComodificationInCompute?: boolean;
}

/** Map contract: lookup by equals/hashCode, live views, default methods, value equality. */
export function mapContract(name: string, create: () => MapType<any, any>, opts: MapOptions) {
  const of = (...pairs: [unknown, unknown][]) => {
    const m = create();
    for (const [k, v] of pairs) m.put(k, v);
    return m;
  };
  const sm = (...pairs: [unknown, unknown][]) => SimpleMap.of<unknown, unknown>(...pairs);
  const keysSorted = (m: MapType<any, any>) => [...m.keySet()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const anyType = !opts.requiresComparableKeys;

  describe(`${name} · Map`, () => {
    describe('basics', () => {
      it('new map is empty', () => {
        const m = create();
        expect([m.size(), m.isEmpty(), m.get('a'), m.containsKey('a')]).toEqual([0, true, null, false]);
      });
      it('put returns null for a new key', () => expect(create().put('a', 1)).toBeNull());
      it('put returns the previous value', () => {
        const m = of(['a', 1]);
        expect(m.put('a', 2)).toBe(1);
        expect(m.get('a')).toBe(2);
      });
      it('overwrite keeps size', () => {
        const m = of(['a', 1], ['a', 2]);
        expect(m.size()).toBe(1);
      });
      it('size counts distinct keys', () => expect(of(['a', 1], ['b', 2], ['a', 3]).size()).toBe(2));
      it('get absent is null', () => expect(of(['a', 1]).get('b')).toBeNull());
      it('containsKey / containsValue', () => {
        const m = of(['a', 1], ['b', 2]);
        expect([m.containsKey('a'), m.containsKey('z'), m.containsValue(2), m.containsValue(9)]).toEqual([true, false, true, false]);
      });
      it('remove returns the old value and shrinks', () => {
        const m = of(['a', 1], ['b', 2]);
        expect(m.remove('a')).toBe(1);
        expect([m.size(), m.containsKey('a'), m.get('a')]).toEqual([1, false, null]);
      });
      it('remove absent returns null', () => expect(of(['a', 1]).remove('z')).toBeNull());
      it('remove(key, value) only when mapped to value', () => {
        const m = of(['a', 1]);
        expect(m.remove('a', 2)).toBe(false);
        expect(m.remove('a', 1)).toBe(true);
        expect(m.isEmpty()).toBe(true);
      });
      it('remove(key, value) absent key is false', () => expect(create().remove('a', 1)).toBe(false));
      it('re-put after remove', () => {
        const m = of(['a', 1]);
        m.remove('a');
        expect(m.put('a', 2)).toBeNull();
        expect(m.get('a')).toBe(2);
      });
      it('clear', () => {
        const m = of(['a', 1], ['b', 2]);
        m.clear();
        expect([m.size(), m.get('a')]).toEqual([0, null]);
        m.put('c', 3);
        expect(m.size()).toBe(1);
      });
      it('putAll copies every mapping and overwrites', () => {
        const m = of(['a', 1]);
        m.putAll(sm(['a', 9], ['b', 2]));
        expect([m.get('a'), m.get('b'), m.size()]).toEqual([9, 2, 2]);
      });
      it('putAll(null) throws NullPointerException', () => expectThrows(() => create().putAll(null as any), 'NullPointerException'));
      it('numeric keys: 0, -0, NaN', () => {
        const m = of([0, 'zero'], [NaN, 'nan']);
        expect([m.get(-0), m.get(NaN), m.size()]).toEqual(['zero', 'nan', 2]);
      });
      it('number 1 and string "1" are different keys', () => {
        if (!anyType) return;
        const m = of([1, 'n'], ['1', 's']);
        expect([m.size(), m.get(1), m.get('1')]).toEqual([2, 'n', 's']);
      });
    });

    describe('key equality', () => {
      it('keys by equals()/hashCode()', () => {
        const m = of([new Point(1, 2), 'p']);
        expect([m.get(new Point(1, 2)), m.containsKey(new Point(1, 2)), m.get(new Point(2, 1))]).toEqual(['p', true, null]);
      });
      it('equal key overwrites', () => {
        const m = of([new Point(1, 1), 'a'], [new Point(1, 1), 'b']);
        expect([m.size(), m.get(new Point(1, 1))]).toEqual([1, 'b']);
      });
      it('the original key instance is kept on overwrite', () => {
        const k = new Point(1, 1);
        const m = of([k, 'a'], [new Point(1, 1), 'b']);
        expect(m.keySet().toArray()[0]).toBe(k);
      });
      it('colliding keys stay separate', () => {
        const m = create();
        for (let i = 0; i < 50; i++) m.put(new Collide(i), i);
        expect(m.size()).toBe(50);
        expect(m.get(new Collide(7))).toBe(7);
        m.remove(new Collide(7));
        expect([m.get(new Collide(7)), m.get(new Collide(8)), m.size()]).toEqual([null, 8, 49]);
      });
      it('Date keys by time', () => expect(of([new Date(5), 'd']).get(new Date(5))).toBe('d'));
      if (anyType) {
        it('plain object keys by identity', () => {
          const k = {};
          const m = of([k, 1]);
          expect([m.get(k), m.get({})]).toEqual([1, null]);
        });
        it('boolean and bigint keys', () => {
          const m = of([true, 't'], [10n, 'b']);
          expect([m.get(true), m.get(false), m.get(10n)]).toEqual(['t', null, 'b']);
        });
      }
    });

    describe('null keys and values', () => {
      if (opts.allowsNullKey) {
        it('null key', () => {
          const m = of([null, 'n']);
          expect([m.get(null), m.containsKey(null), m.size()]).toEqual(['n', true, 1]);
          expect(m.remove(null)).toBe('n');
          expect(m.containsKey(null)).toBe(false);
        });
        it('undefined key is distinct from null', () => {
          const m = of([null, 'n'], [undefined, 'u']);
          expect([m.size(), m.get(undefined), m.get(null)]).toEqual([2, 'u', 'n']);
        });
      } else {
        it('put(null key) throws NullPointerException', () => expectThrows(() => create().put(null, 1), 'NullPointerException'));
        it('get(null) throws NullPointerException', () => expectThrows(() => of([1, 1]).get(null), 'NullPointerException'));
      }
      if (opts.allowsNullValue) {
        it('null value: get is null but containsKey is true', () => {
          const m = of(['a', null]);
          expect([m.get('a'), m.containsKey('a'), m.containsValue(null), m.size()]).toEqual([null, true, true, 1]);
        });
        it('getOrDefault returns the stored null, not the default', () => expect(of(['a', null]).getOrDefault('a', 'd')).toBeNull());
        it('put over a null value returns null', () => expect(of(['a', null]).put('a', 1)).toBeNull());
      } else {
        it('put(null value) throws NullPointerException', () => expectThrows(() => create().put('a', null), 'NullPointerException'));
      }
    });

    describe('keySet view', () => {
      it('contains every key', () => expect(keysSorted(of(['b', 1], ['a', 2]))).toEqual(['a', 'b']));
      it('size and contains', () => {
        const ks = of(['a', 1], ['b', 2]).keySet();
        expect([ks.size(), ks.contains('a'), ks.contains('z')]).toEqual([2, true, false]);
      });
      it('is live', () => {
        const m = of(['a', 1]);
        const ks = m.keySet();
        m.put('b', 2);
        expect(ks.size()).toBe(2);
      });
      it('remove through keySet removes the mapping', () => {
        const m = of(['a', 1], ['b', 2]);
        expect(m.keySet().remove('a')).toBe(true);
        expect([m.containsKey('a'), m.size()]).toEqual([false, 1]);
      });
      it('iterator.remove removes the mapping', () => {
        const m = of(['a', 1], ['b', 2]);
        const it = m.keySet().iterator();
        const k = it.next();
        it.remove();
        expect([m.containsKey(k), m.size()]).toEqual([false, 1]);
      });
      it('removeIf / retainAll write through', () => {
        const m = of(['a', 1], ['b', 2], ['c', 3]);
        m.keySet().removeIf((k: string) => k === 'b');
        m.keySet().retainAll(SimpleMap.of(['a', 0]).keySet());
        expect(keysSorted(m)).toEqual(['a']);
      });
      it('add throws UnsupportedOperationException', () => expectThrows(() => of(['a', 1]).keySet().add('b'), 'UnsupportedOperationException'));
      it('clear empties the map', () => {
        const m = of(['a', 1]);
        m.keySet().clear();
        expect(m.isEmpty()).toBe(true);
      });
      it('is fail-fast', () => {
        const m = of(['a', 1], ['b', 2]);
        const it = m.keySet().iterator();
        it.next();
        m.put('c', 3);
        expectThrows(() => it.next(), 'ConcurrentModificationException');
      });
      (opts.accessOrdered ? it.skip : it)('overwriting an existing key is not a structural change', () => {
        const m = of(['a', 1], ['b', 2]);
        const it = m.keySet().iterator();
        it.next();
        m.put('a', 9);
        expect(() => it.next()).not.toThrow();
      });
      it('equals a Set of the same keys', () => expect(of(['a', 1]).keySet().equals(SimpleMap.of(['a', 2]).keySet())).toBe(true));
    });

    describe('values view', () => {
      it('contains every value, duplicates included', () => expect([...of(['a', 1], ['b', 1], ['c', 2]).values()].sort()).toEqual([1, 1, 2]));
      it('is live', () => {
        const m = of(['a', 1]);
        const vs = m.values();
        m.put('b', 2);
        expect(vs.size()).toBe(2);
        expect(vs.contains(2)).toBe(true);
      });
      it('remove removes one mapping with that value', () => {
        const m = of(['a', 1], ['b', 1]);
        expect(m.values().remove(1)).toBe(true);
        expect(m.size()).toBe(1);
      });
      it('removeIf by value writes through', () => {
        const m = of(['a', 1], ['b', 2], ['c', 3]);
        m.values().removeIf((v: number) => v > 1);
        expect(keysSorted(m)).toEqual(['a']);
      });
      it('add throws UnsupportedOperationException', () => expectThrows(() => of(['a', 1]).values().add(2), 'UnsupportedOperationException'));
    });

    describe('entrySet view', () => {
      it('size matches', () => expect(of(['a', 1], ['b', 2]).entrySet().size()).toBe(2));
      it('entries expose key and value', () => {
        const e = of(['a', 1]).entrySet().iterator().next();
        expect([e.getKey(), e.getValue()]).toEqual(['a', 1]);
      });
      it('contains(SimpleEntry) checks key and value', () => {
        const es = of(['a', 1]).entrySet();
        expect([es.contains(new SimpleEntry('a', 1)), es.contains(new SimpleEntry('a', 2)), es.contains(new SimpleEntry('b', 1))]).toEqual([true, false, false]);
      });
      it('contains(non-entry) is false', () => expect(of(['a', 1]).entrySet().contains('a')).toBe(false));
      it('setValue writes through and returns the old value', () => {
        const m = of(['a', 1]);
        const e = m.entrySet().iterator().next();
        expect(e.setValue(5)).toBe(1);
        expect(m.get('a')).toBe(5);
      });
      it('remove(entry) removes the mapping', () => {
        const m = of(['a', 1], ['b', 2]);
        expect(m.entrySet().remove(new SimpleEntry('a', 1))).toBe(true);
        expect(m.containsKey('a')).toBe(false);
      });
      it('remove(entry) with a different value is a no-op', () => {
        const m = of(['a', 1]);
        expect(m.entrySet().remove(new SimpleEntry('a', 2))).toBe(false);
        expect(m.size()).toBe(1);
      });
      it('iterator.remove', () => {
        const m = of(['a', 1], ['b', 2]);
        const it = m.entrySet().iterator();
        it.next();
        it.remove();
        expect(m.size()).toBe(1);
      });
      it('entry equals / hashCode / toString', () => {
        const e = of(['a', 1]).entrySet().iterator().next();
        expect(e.equals(new SimpleEntry('a', 1))).toBe(true);
        expect(new SimpleEntry('a', 1).equals(e)).toBe(true);
        expect(e.hashCode()).toBe(refStringHash('a') ^ 1);
        expect(e.toString()).toBe('a=1');
      });
      it('add throws UnsupportedOperationException', () => expectThrows(() => of(['a', 1]).entrySet().add(new SimpleEntry('b', 2)), 'UnsupportedOperationException'));
      it('is fail-fast', () => {
        const m = of(['a', 1], ['b', 2]);
        const it = m.entrySet().iterator();
        it.next();
        m.remove('b');
        m.remove('a');
        expectThrows(() => it.next(), 'ConcurrentModificationException');
      });
    });

    describe('equals / hashCode / toString', () => {
      it('reflexive', () => {
        const m = of(['a', 1]);
        expect(m.equals(m)).toBe(true);
      });
      it('equal to another Map implementation regardless of order', () => {
        expect(of(['a', 1], ['b', 2]).equals(sm(['b', 2], ['a', 1]))).toBe(true);
        expect(sm(['b', 2], ['a', 1]).equals(of(['a', 1], ['b', 2]))).toBe(true);
      });
      it('empty equals empty', () => expect(create().equals(sm())).toBe(true));
      it('different value', () => expect(of(['a', 1]).equals(sm(['a', 2]))).toBe(false));
      it('different key', () => expect(of(['a', 1]).equals(sm(['b', 1]))).toBe(false));
      it('different size', () => expect(of(['a', 1]).equals(sm(['a', 1], ['b', 2]))).toBe(false));
      it('not equal to a JS Map', () => expect(of(['a', 1]).equals(new globalThis.Map([['a', 1]]))).toBe(false));
      it('not equal to null', () => expect(of(['a', 1]).equals(null)).toBe(false));
      it('values compared with equals()', () => expect(of(['a', new Point(1, 1)]).equals(sm(['a', new Point(1, 1)]))).toBe(true));
      if (opts.allowsNullValue) {
        it('null value vs missing key are not equal', () => expect(of(['a', null]).equals(sm(['b', null]))).toBe(false));
      }
      it('empty hashCode is 0', () => expect(create().hashCode()).toBe(0));
      it('hashCode = sum of key^value hashes', () => expect(of(['a', 1], ['b', 2]).hashCode()).toBe(((refStringHash('a') ^ 1) + (refStringHash('b') ^ 2)) | 0));
      it('equal maps have equal hashCodes', () => expect(of(['a', 1], ['b', 2]).hashCode()).toBe(sm(['b', 2], ['a', 1]).hashCode()));
      it('toString empty', () => expect(create().toString()).toBe('{}'));
      it('toString single', () => expect(of(['a', 1]).toString()).toBe('{a=1}'));
      it('toString many uses ", "', () => expect(of(['a', 1], ['b', 2]).toString()).toMatch(/^\{(a=1, b=2|b=2, a=1)\}$/));
      it('toString self-reference', () => {
        const m = create();
        m.put('a', m);
        expect(m.toString()).toBe('{a=(this Map)}');
      });
    });

    describe('default methods', () => {
      it('getOrDefault', () => {
        const m = of(['a', 1]);
        expect([m.getOrDefault('a', 0), m.getOrDefault('z', 0)]).toEqual([1, 0]);
      });
      it('putIfAbsent on absent inserts and returns null', () => {
        const m = create();
        expect(m.putIfAbsent('a', 1)).toBeNull();
        expect(m.get('a')).toBe(1);
      });
      it('putIfAbsent on present keeps and returns current', () => {
        const m = of(['a', 1]);
        expect(m.putIfAbsent('a', 2)).toBe(1);
        expect(m.get('a')).toBe(1);
      });
      it('replace(k, v) only when present', () => {
        const m = of(['a', 1]);
        expect([m.replace('a', 2), m.replace('z', 9), m.get('a'), m.containsKey('z')]).toEqual([1, null, 2, false]);
      });
      it('replace(k, old, new) only when matching', () => {
        const m = of(['a', 1]);
        expect([m.replace('a', 9, 2), m.get('a'), m.replace('a', 1, 2), m.get('a')]).toEqual([false, 1, true, 2]);
      });
      it('computeIfAbsent computes once', () => {
        const m = create();
        const fn = jest.fn((k: string) => k.length);
        expect(m.computeIfAbsent('abc', fn)).toBe(3);
        expect(m.computeIfAbsent('abc', fn)).toBe(3);
        expect(fn).toHaveBeenCalledTimes(1);
      });
      it('computeIfAbsent with null result inserts nothing', () => {
        const m = create();
        expect(m.computeIfAbsent('a', () => null)).toBeNull();
        expect(m.containsKey('a')).toBe(false);
      });
      it('computeIfAbsent grouping idiom', () => {
        const m = create();
        for (const w of ['apple', 'avocado', 'banana']) (m.computeIfAbsent(w[0], () => [] as string[]) as string[]).push(w);
        expect(m.get('a')).toEqual(['apple', 'avocado']);
      });
      it('computeIfPresent updates, or removes on null', () => {
        const m = of(['a', 1], ['b', 2]);
        expect(m.computeIfPresent('a', (_k, v: number) => v + 1)).toBe(2);
        expect(m.computeIfPresent('b', () => null)).toBeNull();
        expect(m.computeIfPresent('z', () => 1)).toBeNull();
        expect([m.get('a'), m.containsKey('b'), m.containsKey('z')]).toEqual([2, false, false]);
      });
      it('compute inserts, updates and removes', () => {
        const m = create();
        expect(m.compute('a', (_k, v) => (v ?? 0) + 1)).toBe(1);
        expect(m.compute('a', (_k, v) => (v ?? 0) + 1)).toBe(2);
        expect(m.compute('a', () => null)).toBeNull();
        expect(m.containsKey('a')).toBe(false);
      });
      it('merge: counting idiom', () => {
        const m = create();
        for (const w of ['a', 'b', 'a', 'a']) m.merge(w, 1, (x: number, y: number) => x + y);
        expect([m.get('a'), m.get('b')]).toEqual([3, 1]);
      });
      it('merge with null result removes', () => {
        const m = of(['a', 1]);
        expect(m.merge('a', 1, () => null)).toBeNull();
        expect(m.containsKey('a')).toBe(false);
      });
      it('merge(null value) throws NullPointerException', () => expectThrows(() => create().merge('a', null, (x) => x), 'NullPointerException'));
      it('forEach visits every mapping', () => {
        const seen: string[] = [];
        of(['a', 1], ['b', 2]).forEach((k, v) => seen.push(`${k}${v}`));
        expect(seen.sort()).toEqual(['a1', 'b2']);
      });
      (opts.detectsComodificationInCompute ? describe : describe.skip)('callbacks that modify the map', () => {
        const cme = 'ConcurrentModificationException';
        it('computeIfAbsent throws ConcurrentModificationException', () => {
          const m = of(['a', 1]);
          expectThrows(() => m.computeIfAbsent('b', () => (m.put('c', 3), 2)), cme);
          expect(m.containsKey('b')).toBe(false);
        });
        it('computeIfAbsent with a null result still throws', () => {
          const m = of(['a', 1]);
          expectThrows(() => m.computeIfAbsent('b', () => (m.remove('a'), null)), cme);
        });
        it('computeIfPresent throws ConcurrentModificationException', () => {
          const m = of(['a', 1]);
          expectThrows(() => m.computeIfPresent('a', () => (m.put('c', 3), 2)), cme);
          expect(m.get('a')).toBe(1);
        });
        it('compute throws ConcurrentModificationException', () => {
          const m = of(['a', 1]);
          expectThrows(() => m.compute('b', () => (m.put('c', 3), 2)), cme);
          expect(m.containsKey('b')).toBe(false);
        });
        it('compute returning null after a modification throws', () => {
          const m = of(['a', 1]);
          expectThrows(() => m.compute('a', () => (m.put('c', 3), null)), cme);
          expect(m.get('a')).toBe(1);
        });
        it('merge throws ConcurrentModificationException', () => {
          const m = of(['a', 1]);
          expectThrows(() => m.merge('a', 1, (x: number, y: number) => (m.remove('a'), x + y)), cme);
        });
        it('merge returning null after a modification throws', () => {
          const m = of(['a', 1]);
          expectThrows(() => m.merge('a', 1, () => (m.put('c', 3), null)), cme);
        });
        it('a value-only change inside the callback is allowed', () => {
          const m = of(['a', 1], ['b', 2]);
          if (!opts.accessOrdered) expect(m.compute('a', (_k, v: number) => (m.put('b', 9), v + 1))).toBe(2);
          expect(m.computeIfAbsent('z', () => 0)).toBe(0);
        });
      });
      it('replaceAll', () => {
        const m = of(['a', 1], ['b', 2]);
        m.replaceAll((k: string, v: number) => k + v);
        expect([m.get('a'), m.get('b')]).toEqual(['a1', 'b2']);
      });
    });

    describe('JS interop', () => {
      it('spread gives [key, value] pairs', () => expect([...of(['a', 1])]).toEqual([['a', 1]]));
      it('new Map(map) copies', () => {
        const native = new globalThis.Map(of(['a', 1], ['b', 2]));
        expect([native.size, native.get('a'), native.get('b')]).toEqual([2, 1, 2]);
      });
      it('for..of with destructuring', () => {
        const out: string[] = [];
        for (const [k, v] of of(['a', 1])) out.push(`${k}=${v}`);
        expect(out).toEqual(['a=1']);
      });
      it('Object.fromEntries', () => expect(Object.fromEntries(of(['a', 1]))).toEqual({ a: 1 }));
    });

    (opts.skipScale ? describe.skip : describe)('scale & performance', () => {
      it('100k put + get under 1s', () => {
        const m = create();
        const ms = timeIt(() => {
          for (let i = 0; i < 100_000; i++) m.put(i, i * 2);
          for (let i = 0; i < 100_000; i++) if (m.get(i) !== i * 2) throw new Error('bad ' + i);
        });
        expect(m.size()).toBe(100_000);
        expect(ms).toBeLessThan(1_000);
      });
      it('100k string keys under 1s', () => {
        const m = create();
        const ms = timeIt(() => {
          for (let i = 0; i < 100_000; i++) m.put('key' + i, i);
          for (let i = 0; i < 100_000; i++) if (m.get('key' + i) !== i) throw new Error('bad ' + i);
        });
        expect(ms).toBeLessThan(1_000);
      });
      it('50k Point keys', () => {
        const m = create();
        for (let i = 0; i < 50_000; i++) m.put(new Point(i, -i), i);
        expect(m.get(new Point(49_999, -49_999))).toBe(49_999);
        expect(m.size()).toBe(50_000);
      });
    });

    describe('model-based: random ops vs JS Map', () => {
      it.each([7, 14, 21, 28, 35])('seed %p, 5000 ops', (seed) => {
        const r = rng(seed);
        const m = create();
        const ref = new globalThis.Map<number, number>();
        for (let step = 0; step < 5000; step++) {
          const op = r(8);
          const k = r(50);
          const v = r(1000);
          const at = `step ${step} op ${op}`;
          const same = (a: unknown, b: unknown) => expect([at, a]).toEqual([at, b]);
          switch (op) {
            case 0:
            case 1: { same(m.put(k, v), ref.has(k) ? ref.get(k) : null); ref.set(k, v); break; }
            case 2: { same(m.remove(k), ref.has(k) ? ref.get(k) : null); ref.delete(k); break; }
            case 3: same(m.get(k), ref.has(k) ? ref.get(k) : null); break;
            case 4: same(m.containsKey(k), ref.has(k)); break;
            case 5: { const had = ref.has(k); same(m.putIfAbsent(k, v), had ? ref.get(k) : null); if (!had) ref.set(k, v); break; }
            case 6: { const nv = (ref.get(k) ?? 0) + v; same(m.merge(k, v, (a: number, b: number) => a + b), nv); ref.set(k, nv); break; }
            case 7: if (r(80) === 0) { m.clear(); ref.clear(); } break;
          }
          same(m.size(), ref.size);
        }
        expect(m.equals(SimpleMap.of(...ref))).toBe(true);
      });
    });
  });
}
