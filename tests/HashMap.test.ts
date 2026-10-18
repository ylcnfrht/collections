import { SimpleEntry, SimpleImmutableEntry } from '../src/abstract/AbstractMap';
import { MapEntry } from '../src/interfaces/Map';
import { HashMap, HashNode, NodeIterator } from '../src/map/HashMap';
import { LinkedHashMap } from '../src/map/LinkedHashMap';
import { mapContract } from './contracts/map';
import { Collide, expectThrows, Point, rng, timeIt } from './helpers';
import { SimpleMap } from './support';

mapContract('HashMap', () => new HashMap(), { allowsNullKey: true, allowsNullValue: true, detectsComodificationInCompute: true });

/** Key that claims equality with the primitive 1 (an asymmetric, contract-violating equals). */
class LikeOne {
  equals(o: unknown): boolean {
    return o === 1 || o instanceof LikeOne;
  }
  hashCode(): number {
    return 1;
  }
}

/** Records hook calls. */
class Hooked<K, V> extends HashMap<K, V> {
  log: string[] = [];
  protected override newNode(key: K, value: V): HashNode<K, V> {
    this.log.push(`new:${String(key)}`);
    return super.newNode(key, value);
  }
  protected override afterNodeInsertion(n: HashNode<K, V>): void {
    this.log.push(`ins:${String(n.key)}`);
  }
  protected override afterNodeAccess(n: HashNode<K, V>): void {
    this.log.push(`acc:${String(n.key)}`);
  }
  protected override afterNodeRemoval(n: HashNode<K, V>): void {
    this.log.push(`rem:${String(n.key)}`);
  }
  take(): string[] {
    const l = this.log;
    this.log = [];
    return l;
  }
}

const sorted = <T>(xs: T[]) => [...xs].sort((a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0));

describe('HashMap · implementation', () => {
  describe('hybrid storage', () => {
    it('mixes index, plain, value and colliding keys in one map', () => {
      const m = new HashMap<unknown, number>();
      const obj = {};
      const keys: unknown[] = [0, 7, 1e9, -3, 1.5, 'a', true, 10n, null, undefined, obj, new Point(1, 2), new Date(9), new Collide(1), new Collide(2)];
      keys.forEach((k, i) => m.put(k, i));
      expect(m.size()).toBe(keys.length);
      keys.forEach((k, i) => expect(m.get(k)).toBe(i));
      expect([m.get(new Point(1, 2)), m.get(new Date(9)), m.get(new Collide(2)), m.get({})]).toEqual([11, 12, 14, null]);
      expect(m.keySet().toArray().length).toBe(keys.length);
      keys.forEach((k) => m.remove(k));
      expect(m.isEmpty()).toBe(true);
    });
    it('colliding keys mixed with primitives that share the hash', () => {
      const m = new HashMap<unknown, string>();
      m.put(42, 'int');
      for (let i = 0; i < 10; i++) m.put(new Collide(i), 'c' + i);
      m.put('42', 'str');
      expect([m.get(42), m.get('42'), m.get(new Collide(3)), m.size()]).toEqual(['int', 'str', 'c3', 12]);
      m.remove(new Collide(3));
      expect([m.get(42), m.containsKey(new Collide(3)), m.get(new Collide(4)), m.size()]).toEqual(['int', false, 'c4', 11]);
    });
    it('Date keys by time; the first instance is kept', () => {
      const d = new Date(100);
      const m = HashMap.of<Date, string>([d, 'a'], [new Date(100), 'b'], [new Date(200), 'c']);
      expect([m.size(), m.get(new Date(100)), m.keySet().contains(new Date(200))]).toEqual([2, 'b', true]);
      expect(m.keySet().toArray()).toContain(d);
    });
    it('a key whose equals() claims a primitive stays a distinct key from it', () => {
      const m = new HashMap<unknown, string>();
      const k = new LikeOne();
      m.put(1, 'prim');
      m.put(k, 'obj');
      expect([m.size(), m.get(1), m.get(k), m.get(new LikeOne())]).toEqual([2, 'prim', 'obj', 'obj']);
      expect(m.remove(1)).toBe('prim');
      expect([m.get(1), m.get(k)]).toEqual([null, 'obj']);
    });
    it('NaN and -0 keys', () => {
      const m = new HashMap<number, string>();
      m.put(NaN, 'nan');
      m.put(-0, 'neg');
      m.put(0, 'zero');
      expect([m.size(), m.get(NaN), m.get(0), m.get(-0), m.containsKey(0 / 0)]).toEqual([2, 'nan', 'zero', 'zero', true]);
      expect(m.remove(-0)).toBe('zero');
      expect(m.remove(NaN)).toBe('nan');
      expect(m.isEmpty()).toBe(true);
    });
    it('null and undefined keys are distinct and both removable', () => {
      const m = HashMap.of<unknown, number>([null, 1], [undefined, 2]);
      expect([m.get(null), m.get(undefined)]).toEqual([1, 2]);
      expect(m.remove(undefined)).toBe(2);
      expect([m.containsKey(undefined), m.containsKey(null)]).toEqual([false, true]);
    });
    it('sparse int keys fall back to the native Map but stay findable', () => {
      const m = new HashMap<number, number>();
      m.put(5_000_000, 1);
      for (let i = 0; i < 3000; i++) m.put(i, i);
      m.put(2_000, -1); // overwrite in the dense table
      m.put(4_000_000, 2);
      expect([m.get(5_000_000), m.get(4_000_000), m.get(2_000), m.size()]).toEqual([1, 2, -1, 3002]);
      expect(m.remove(5_000_000)).toBe(1);
      expect(m.containsKey(5_000_000)).toBe(false);
    });
    it('an int key stored in the native Map is found after the dense table grows past it', () => {
      const m = new HashMap<number, string>();
      m.put(1500, 'early'); // beyond the dense bound while the map is empty
      for (let i = 0; i < 2000; i++) if (i !== 1500) m.put(i, 'd');
      expect([m.get(1500), m.put(1500, 'x'), m.size()]).toEqual(['early', 'early', 2000]);
      expect(m.remove(1500)).toBe('x');
      expect([m.containsKey(1500), m.size()]).toEqual([false, 1999]);
      expect(m.putIfAbsent(1500, 'y')).toBeNull();
      expect(m.get(1500)).toBe('y');
    });
    it('emptying the dense table and refilling works', () => {
      const m = new HashMap<number, number>();
      for (let i = 0; i < 100; i++) m.put(i, i);
      for (let i = 0; i < 100; i++) m.remove(i);
      expect(m.isEmpty()).toBe(true);
      m.put(3, 3);
      expect([...m]).toEqual([[3, 3]]);
    });
    it('non-index numbers (negative, fractional, huge) are plain keys', () => {
      const m = HashMap.of<number, string>([-1, 'a'], [0.5, 'b'], [2 ** 32, 'c'], [Infinity, 'd']);
      expect([m.get(-1), m.get(0.5), m.get(2 ** 32), m.get(Infinity), m.size()]).toEqual(['a', 'b', 'c', 'd', 4]);
    });
  });

  describe('fail-fast and views', () => {
    it('overwriting existing keys of every kind is not structural', () => {
      const m = HashMap.of<unknown, number>([1, 1], ['s', 2], [new Point(0, 0), 3]);
      const it = m.entrySet().iterator();
      it.next();
      m.put(1, 9);
      m.put('s', 9);
      m.put(new Point(0, 0), 9);
      m.replace(1, 8);
      m.merge('s', 1, (a, b) => a + b);
      expect(() => it.next()).not.toThrow();
    });
    it('compute* adding a key is structural', () => {
      const m = HashMap.of<string, number>(['a', 1]);
      const it = m.keySet().iterator();
      m.computeIfAbsent('b', () => 2);
      expectThrows(() => it.next(), 'ConcurrentModificationException');
    });
    it('keySet contains/remove are O(1): 50k removals through the view', () => {
      const m = new HashMap<string, number>();
      for (let i = 0; i < 50_000; i++) m.put('k' + i, i);
      const ks = m.keySet();
      const ms = timeIt(() => {
        for (let i = 0; i < 50_000; i += 2) if (!ks.contains('k' + i) || !ks.remove('k' + i)) throw new Error('missing ' + i);
      });
      expect(ms).toBeLessThan(500);
      expect([m.size(), ks.remove('k0')]).toEqual([25_000, false]);
    });
    it('entrySet contains/remove are O(1) and check the value', () => {
      const m = new HashMap<number, number>();
      for (let i = 0; i < 50_000; i++) m.put(i, i);
      const es = m.entrySet();
      for (let i = 0; i < 50_000; i += 2) es.remove(new SimpleEntry(i, i));
      expect([m.size(), es.contains(new SimpleEntry(1, 1)), es.contains(new SimpleEntry(1, 2)), es.remove(new SimpleEntry(1, 2))]).toEqual([25_000, true, false, false]);
      expect(es.remove('nope')).toBe(false);
    });
    it('entry.setValue writes through for every storage kind', () => {
      const m = HashMap.of<unknown, number>([1, 1], ['s', 2], [new Point(1, 1), 3], [new Collide(1), 4], [new Collide(2), 5]);
      m.entrySet().forEach((e) => e.setValue(e.getValue() * 10));
      expect([m.get(1), m.get('s'), m.get(new Point(1, 1)), m.get(new Collide(1)), m.get(new Collide(2))]).toEqual([10, 20, 30, 40, 50]);
    });
    it('entries are the live nodes: a later put is visible through a held entry', () => {
      const m = HashMap.of(['a', 1]);
      const e = m.entrySet().iterator().next();
      m.put('a', 2);
      expect(e.getValue()).toBe(2);
    });
    it.each(['keySet', 'values', 'entrySet'] as const)('%s iterator.remove across all storage kinds', (view) => {
      const m = new HashMap<unknown, number>();
      const keys: unknown[] = [0, 1, 2, 5_000_000, 'a', 'b', null, new Point(1, 1), new Collide(1), new Collide(2), new Collide(3), new Date(1)];
      keys.forEach((k, i) => m.put(k, i));
      const it = m[view]().iterator();
      let n = 0;
      while (it.hasNext()) {
        it.next();
        if (n++ % 2 === 0) it.remove();
      }
      expect(n).toBe(keys.length);
      expect(m.size()).toBe(keys.length / 2);
      const left = m.keySet().toArray();
      for (const k of left) expect(m.containsKey(k)).toBe(true);
      const it2 = m.keySet().iterator();
      while (it2.hasNext()) {
        it2.next();
        it2.remove();
      }
      expect(m.isEmpty()).toBe(true);
    });
    it('iterator.remove before next throws IllegalStateException', () => expectThrows(() => HashMap.of([1, 1]).values().iterator().remove(), 'IllegalStateException'));
    it('iterator.remove after an outside modification throws ConcurrentModificationException', () => {
      const m = HashMap.of([1, 1], [2, 2]);
      const it = m.keySet().iterator();
      it.next();
      m.remove(2);
      expectThrows(() => it.remove(), 'ConcurrentModificationException');
    });
    it('next past the end throws NoSuchElementException', () => {
      const it = HashMap.of([new Point(1, 1), 1]).entrySet().iterator();
      it.next();
      expectThrows(() => it.next(), 'NoSuchElementException');
    });
    it('forEach / replaceAll are fail-fast', () => {
      const m = HashMap.of<unknown, number>([1, 1], ['a', 2], [new Point(1, 1), 3]);
      expectThrows(() => m.forEach(() => m.put('z' + Math.random(), 0)), 'ConcurrentModificationException');
      const p = HashMap.of<unknown, number>([new Point(1, 1), 3], [new Collide(1), 1], [new Collide(2), 2]);
      expectThrows(() => p.forEach(() => p.put(new Point(Math.random(), 0), 0)), 'ConcurrentModificationException');
      const c = HashMap.of<unknown, number>([new Collide(1), 1], [new Collide(2), 2]);
      expectThrows(() => c.forEach(() => c.remove(new Collide(2))), 'ConcurrentModificationException');
    });
    it('view forEach / toArray / spread cover all kinds', () => {
      const m = HashMap.of<unknown, number>([1, 1], ['a', 2], [new Point(1, 1), 3], [new Collide(1), 4], [new Collide(2), 5]);
      const ks: unknown[] = [];
      m.keySet().forEach((k) => ks.push(k));
      const vs: number[] = [];
      m.values().forEach((v) => vs.push(v));
      const es: MapEntry<unknown, number>[] = [];
      m.entrySet().forEach((e) => es.push(e));
      expect([ks.length, sorted(vs), es.length]).toEqual([5, [1, 2, 3, 4, 5], 5]);
      expect(sorted(m.values().toArray())).toEqual([1, 2, 3, 4, 5]);
      expect(sorted([...m.values()])).toEqual([1, 2, 3, 4, 5]);
      expect([...m.keySet()].length).toBe(5);
      expect([...m.entrySet()].map((e) => e.getValue()).sort()).toEqual([1, 2, 3, 4, 5]);
      expect(m.entrySet().toArray().length).toBe(5);
      expect([m.keySet().isEmpty(), m.values().isEmpty(), m.entrySet().isEmpty()]).toEqual([false, false, false]);
      m.values().clear();
      expect(m.isEmpty()).toBe(true);
      m.put(1, 1);
      m.entrySet().clear();
      expect(m.entrySet().size()).toBe(0);
    });
    it('views are cached', () => {
      const m = new HashMap();
      expect([m.keySet() === m.keySet(), m.values() === m.values(), m.entrySet() === m.entrySet()]).toEqual([true, true, true]);
    });
    it('view forEach(null) throws NullPointerException', () => {
      const m = HashMap.of([1, 1]);
      expectThrows(() => m.keySet().forEach(null as any), 'NullPointerException');
      expectThrows(() => m.values().forEach(null as any), 'NullPointerException');
      expectThrows(() => m.entrySet().forEach(null as any), 'NullPointerException');
      expectThrows(() => m.keySet().iterator().forEachRemaining(null as any), 'NullPointerException');
    });
    it('[Symbol.iterator] is a plain iterator, not a generator', () => {
      const it = HashMap.of([1, 2])[Symbol.iterator]();
      expect(Object.prototype.toString.call(it)).toBe('[object Object]');
      expect(it[Symbol.iterator]()).toBe(it);
      expect([it.next(), it.next()]).toEqual([{ value: [1, 2], done: false }, { value: undefined, done: true }]);
    });
  });

  describe('values', () => {
    it('containsValue covers all kinds and uses equals()', () => {
      const m = HashMap.of<unknown, unknown>([1, 'i'], ['s', new Point(1, 1)], [new Point(0, 0), 'p'], [new Collide(1), 'c1'], [new Collide(2), 'c2']);
      expect([m.containsValue('i'), m.containsValue(new Point(1, 1)), m.containsValue('p'), m.containsValue('c2'), m.containsValue('zz')]).toEqual([true, true, true, true, false]);
    });
    it('undefined values are values, distinct from missing keys', () => {
      const m = HashMap.of<string, unknown>(['a', undefined]);
      expect([m.containsKey('a'), m.get('a'), m.getOrDefault('a', 'd'), m.containsValue(undefined)]).toEqual([true, undefined, undefined, true]);
    });
    it('computeIfAbsent on a null-mapped key computes and stores', () => {
      const m = HashMap.of<string, number | null>(['a', null]);
      expect(m.computeIfAbsent('a', () => 5)).toBe(5);
      expect(m.get('a')).toBe(5);
      expect(m.computeIfAbsent('b', () => undefined)).toBeNull();
      expect(m.containsKey('b')).toBe(false);
    });
    it('computeIfPresent skips a null-mapped key', () => {
      const m = HashMap.of<string, number | null>(['a', null]);
      expect(m.computeIfPresent('a', () => 1)).toBeNull();
      expect([m.get('a'), m.containsKey('a')]).toEqual([null, true]);
    });
    it('compute removes a null-mapped key on null result', () => {
      const m = HashMap.of<string, number | null>(['a', null]);
      expect(m.compute('a', (_k, v) => (v === null ? null : 1))).toBeNull();
      expect(m.containsKey('a')).toBe(false);
      expect(m.compute('z', () => null)).toBeNull();
      expect(m.size()).toBe(0);
    });
    it('merge treats a null mapping as absent', () => {
      const m = HashMap.of<string, number | null>(['a', null]);
      const fn = jest.fn((a: number | null, b: number | null) => (a as number) + (b as number));
      expect(m.merge('a', 3, fn)).toBe(3);
      expect(fn).not.toHaveBeenCalled();
      expect(m.merge('a', 3, fn)).toBe(6);
    });
    it('merge null fn throws NullPointerException', () => expectThrows(() => new HashMap().merge('a', 1, null as any), 'NullPointerException'));
    it('compute functions that structurally modify the map throw ConcurrentModificationException', () => {
      const m = HashMap.of<unknown, number>(['a', 1], [new Point(1, 1), 2], [3, 3]);
      const CME = 'ConcurrentModificationException';
      expectThrows(() => m.computeIfAbsent('b', (k) => (m.put('c', 3), 1)), CME);
      expectThrows(() => m.computeIfPresent('a', () => (m.remove('a'), 7)), CME);
      expectThrows(() => m.compute(new Point(1, 1), () => (m.put(new Point(9, 9), 4), null)), CME);
      expectThrows(() => m.merge(3, 1, () => (m.clear(), 1)), CME);
      expect(m.isEmpty()).toBe(true);
    });
    it('compute functions on value keys', () => {
      const m = new HashMap<Point, number>();
      expect(m.compute(new Point(1, 1), (_k, v) => (v ?? 0) + 1)).toBe(1);
      expect(m.compute(new Point(1, 1), (_k, v) => (v ?? 0) + 1)).toBe(2);
      expect(m.computeIfPresent(new Point(1, 1), () => null)).toBeNull();
      expect(m.isEmpty()).toBe(true);
      expect(m.putIfAbsent(new Point(2, 2), 1)).toBeNull();
      expect(m.putIfAbsent(new Point(2, 2), 9)).toBe(1);
      expect([m.replace(new Point(2, 2), 1, 5), m.get(new Point(2, 2)), m.replace(new Point(3, 3), 1)]).toEqual([true, 5, null]);
      expect([m.remove(new Point(2, 2), 4), m.remove(new Point(2, 2), 5), m.size()]).toEqual([false, true, 0]);
    });
    it('replaceAll and forEach cover value keys', () => {
      const m = HashMap.of<unknown, number>([1, 1], [new Point(1, 1), 2], [new Collide(1), 3], [new Collide(2), 4]);
      m.replaceAll((_k, v) => v * 2);
      let sum = 0;
      m.forEach((_k, v) => (sum += v));
      expect(sum).toBe(20);
    });
  });

  describe('construction / copy', () => {
    it('constructor validation', () => {
      expectThrows(() => new HashMap(-1), 'IllegalArgumentException');
      expectThrows(() => new HashMap(NaN), 'IllegalArgumentException');
      expectThrows(() => new HashMap(16, 0), 'IllegalArgumentException');
      expectThrows(() => new HashMap(16, -1), 'IllegalArgumentException');
      expectThrows(() => new HashMap(16, NaN), 'IllegalArgumentException');
      expectThrows(() => new HashMap(null as any), 'NullPointerException');
      expect(new HashMap(0).size()).toBe(0);
      expect(new HashMap(100, 0.5).isEmpty()).toBe(true);
    });
    it('copy constructor from a HashMap and from SimpleMap', () => {
      const src = HashMap.of<unknown, number>([1, 1], ['a', 2], [new Point(1, 1), 3], [new Collide(1), 4], [new Collide(2), 5]);
      const copy = new HashMap(src);
      expect([copy.size(), copy.equals(src), copy.get(new Collide(2))]).toEqual([5, true, 5]);
      const fromSimple = new HashMap(SimpleMap.of<unknown, number>(['x', 1], [new Point(0, 0), 2]));
      expect([fromSimple.get('x'), fromSimple.get(new Point(0, 0))]).toEqual([1, 2]);
    });
    it('putAll from SimpleMap and from itself', () => {
      const m = HashMap.of(['a', 1]);
      m.putAll(SimpleMap.of(['a', 2], ['b', 3]));
      m.putAll(m);
      expect([m.get('a'), m.get('b'), m.size()]).toEqual([2, 3, 2]);
    });
    it('clone keeps the runtime subclass, its fields and an overridden put', () => {
      class Sub<K, V> extends HashMap<K, V> {
        puts = 0;
        override put(k: K, v: V): V | null {
          this.puts++;
          return super.put(k, v);
        }
      }
      const m = new Sub<unknown, number>();
      m.put(1, 1);
      m.put('a', 2);
      m.put(new Point(1, 1), 3);
      m.keySet();
      m.values();
      m.entrySet();
      const c = m.clone() as Sub<unknown, number>;
      expect([c instanceof Sub, c.puts, c.size(), c.get(new Point(1, 1)), c.equals(m)]).toEqual([true, 3, 3, 3, true]);
      c.put('b', 4);
      expect([c.puts, m.puts, m.size(), c.keySet().size(), m.keySet().size(), c.values().size(), c.entrySet().size()]).toEqual([4, 3, 3, 4, 3, 4, 4]);
      expect(new Sub().clone()).toBeInstanceOf(Sub);
    });
    it('clone is independent and a HashMap', () => {
      const m = HashMap.of<unknown, number>([1, 1], ['a', 2], [new Point(1, 1), 3]);
      const c = m.clone();
      c.put(2, 2);
      c.remove('a');
      c.entrySet().iterator().next().setValue(99);
      expect([m.size(), m.get('a'), m.containsKey(2), c instanceof HashMap, c.size()]).toEqual([3, 2, false, true, 3]);
      expect(m.get(1)).toBe(1);
    });
    it('equals / hashCode across implementations with value keys', () => {
      const m = HashMap.of<unknown, number>([1, 1], [new Point(1, 1), 2], [new Date(3), 3]);
      const s = SimpleMap.of<unknown, number>([new Date(3), 3], [new Point(1, 1), 2], [1, 1]);
      expect([m.equals(s), s.equals(m), m.hashCode() === s.hashCode()]).toEqual([true, true, true]);
    });
    it('toString with value keys', () => expect(HashMap.of([new Point(1, 2), 'p']).toString()).toBe('{(1,2)=p}'));
  });

  describe('extension hooks', () => {
    it('put fires newNode+insertion on insert, access on overwrite', () => {
      const m = new Hooked<unknown, number>();
      m.put('a', 1);
      m.put(new Point(1, 1), 1);
      m.put(3, 1);
      expect(m.take()).toEqual(['new:a', 'ins:a', 'new:(1,1)', 'ins:(1,1)', 'new:3', 'ins:3']);
      m.put('a', 2);
      m.put(new Point(1, 1), 2);
      m.put(3, 2);
      expect(m.take()).toEqual(['acc:a', 'acc:(1,1)', 'acc:3']);
    });
    it('get/getOrDefault fire access only on a hit; containsKey never', () => {
      const m = new Hooked<string, number>();
      m.put('a', 1);
      m.take();
      m.get('a');
      m.get('z');
      m.getOrDefault('a', 0);
      m.getOrDefault('z', 0);
      m.containsKey('a');
      expect(m.take()).toEqual(['acc:a', 'acc:a']);
    });
    it('removals fire afterNodeRemoval exactly once; clear fires nothing', () => {
      const m = new Hooked<unknown, number>();
      ['a', 'b', 'c', 'd', 'e'].forEach((k) => m.put(k, 1));
      m.put(new Point(1, 1), 1);
      m.take();
      m.remove('a');
      m.remove('zz');
      m.remove('b', 1);
      m.remove('c', 2);
      m.keySet().remove('d');
      m.entrySet().remove(new SimpleEntry('e', 1));
      m.remove(new Point(1, 1));
      expect(m.take()).toEqual(['rem:a', 'rem:b', 'rem:d', 'rem:e', 'rem:(1,1)']);
      m.put('x', 1);
      m.take();
      const it = m.keySet().iterator();
      it.next();
      it.remove();
      m.put('y', 1);
      m.clear();
      const log = m.take();
      expect([log.length, log[0].startsWith('rem:'), log.slice(1)]).toEqual([3, true, ['new:y', 'ins:y']]);
    });
    it('default methods fire the expected hooks', () => {
      const m = new Hooked<string, number>();
      m.putIfAbsent('a', 1);
      m.putIfAbsent('a', 2);
      expect(m.take()).toEqual(['new:a', 'ins:a', 'acc:a']);
      m.replace('a', 3);
      m.replace('z', 3);
      m.replace('a', 3, 4);
      m.replace('a', 9, 5);
      expect(m.take()).toEqual(['acc:a', 'acc:a']);
      m.computeIfAbsent('a', () => 0);
      m.computeIfAbsent('b', () => 1);
      m.computeIfAbsent('c', () => null);
      expect(m.take()).toEqual(['acc:a', 'new:b', 'ins:b']);
      m.computeIfPresent('a', (_k, v) => v + 1);
      m.computeIfPresent('b', () => null);
      m.computeIfPresent('z', () => 1);
      expect(m.take()).toEqual(['acc:a', 'rem:b']);
      m.compute('a', (_k, v) => (v ?? 0) + 1);
      m.compute('n', () => 1);
      m.compute('n', () => null);
      expect(m.take()).toEqual(['acc:a', 'new:n', 'ins:n', 'rem:n']);
      m.merge('a', 1, (x, y) => x + y);
      m.merge('m', 1, (x, y) => x + y);
      m.merge('m', 1, () => null);
      expect(m.take()).toEqual(['acc:a', 'new:m', 'ins:m', 'rem:m']);
      m.replaceAll((_k, v) => v);
      m.entrySet().iterator().next().setValue(1);
      expect(m.take()).toEqual([]);
    });
    it('a subclass can supply its own node type and node iterator order', () => {
      class Tagged<V> extends HashNode<string, V> {
        tag = 'x';
      }
      class Ordered<V> extends HashMap<string, V> {
        protected override newNode(key: string, value: V): HashNode<string, V> {
          return new Tagged(key, value);
        }
        protected override newNodeIterator(): NodeIterator<string, V> {
          const nodes: HashNode<string, V>[] = [];
          this.forEachNode((n) => nodes.push(n));
          nodes.sort((a, b) => (a.key < b.key ? -1 : 1));
          let i = 0;
          let last: HashNode<string, V> | null = null;
          return {
            hasNext: () => i < nodes.length,
            nextNode: () => (last = nodes[i++]),
            remove: () => this.removeNode(last!),
          };
        }
      }
      const m = new Ordered<number>();
      ['c', 'a', 'b'].forEach((k, i) => m.put(k, i));
      expect([...m.keySet()]).toEqual(['a', 'b', 'c']);
      expect((m.entrySet().iterator().next() as Tagged<number>).tag).toBe('x');
      const it = m.keySet().iterator();
      it.next();
      it.remove();
      expect([...m].map(([k]) => k)).toEqual(['b', 'c']);
    });
  });

  describe('model test vs native Map', () => {
    it('1M random ops over mixed key kinds', () => {
      const r = rng(2024);
      const m = new HashMap<unknown, number>();
      const ref = new globalThis.Map<string, [unknown, number]>();
      // canonical string per key so the reference agrees with value equality
      const pool: [unknown, string][] = [];
      for (let i = 0; i < 300; i++) {
        pool.push([i, 'i' + i], ['s' + i, 's' + i], [new Point(i % 20, (i / 20) | 0), 'p' + (i % 20) + ',' + ((i / 20) | 0)], [new Collide(i), 'c' + i]);
      }
      pool.push([5_000_000, 'big'], [-1, 'neg'], [NaN, 'nan'], [null, 'null'], [undefined, 'undef'], [new Date(7), 'd7']);
      for (let step = 0; step < 1_000_000; step++) {
        const [k, id] = pool[r(pool.length)];
        const v = r(1000);
        const old = ref.get(id);
        switch (r(10)) {
          case 0:
          case 1:
          case 2: {
            const got = m.put(k, v);
            if (got !== (old ? old[1] : null)) throw new Error(`put step ${step}`);
            ref.set(id, [k, v]);
            break;
          }
          case 3:
          case 4: {
            const got = m.remove(k);
            if (got !== (old ? old[1] : null)) throw new Error(`remove step ${step}`);
            ref.delete(id);
            break;
          }
          case 5:
          case 6:
            if (m.get(k) !== (old ? old[1] : null)) throw new Error(`get step ${step}`);
            break;
          case 7:
            if (m.containsKey(k) !== (old !== undefined)) throw new Error(`containsKey step ${step}`);
            break;
          case 8: {
            const nv = (old ? old[1] : 0) + v;
            if (m.merge(k, v, (a, b) => a + b) !== nv) throw new Error(`merge step ${step}`);
            ref.set(id, [old ? old[0] : k, nv]);
            break;
          }
          case 9:
            if (r(5000) === 0) {
              m.clear();
              ref.clear();
            }
            break;
        }
        if (m.size() !== ref.size) throw new Error(`size step ${step}`);
      }
      expect(m.equals(SimpleMap.of(...[...ref.values()].map(([k, v]) => [k, v] as [unknown, number])))).toBe(true);
      let n = 0;
      for (const [k, v] of m) {
        expect(m.get(k)).toBe(v);
        n++;
      }
      expect(n).toBe(ref.size);
    });
  });
});

describe('HashMap · newHashMap', () => {
  it('returns an empty HashMap', () => {
    const m = HashMap.newHashMap<string, number>(10);
    expect([m instanceof HashMap, m.size()]).toEqual([true, 0]);
    expect(HashMap.newHashMap(0).isEmpty()).toBe(true);
  });
  it('negative or NaN throws IllegalArgumentException', () => {
    expectThrows(() => HashMap.newHashMap(-1), 'IllegalArgumentException');
    expectThrows(() => HashMap.newHashMap(NaN), 'IllegalArgumentException');
  });
});

describe('HashMap · view toArray(generator)', () => {
  const m = () => HashMap.of<unknown, number>([1, 10], ['a', 20], [new Point(1, 1), 30]);
  it('keySet / values / entrySet fill the generated array', () => {
    const lens: number[] = [];
    const ks = m().keySet().toArray((n) => (lens.push(n), new Array<unknown>(n)));
    const vs = m().values().toArray((n) => new Float64Array(n));
    const es = m().entrySet().toArray((n) => new Array<MapEntry<unknown, number>>(n));
    expect([lens, ks.length, [...vs].sort(), es.map((e) => e.getValue()).sort()]).toEqual([[3], 3, [10, 20, 30], [10, 20, 30]]);
    expect(vs).toBeInstanceOf(Float64Array);
  });
  it('a too-short typed array throws IndexOutOfBoundsException; null generator throws NullPointerException', () => {
    expectThrows(() => m().values().toArray(() => new Float64Array(1)), 'IndexOutOfBoundsException');
    expectThrows(() => m().keySet().toArray(null as any), 'NullPointerException');
  });
});

describe('AbstractMap.SimpleEntry / SimpleImmutableEntry copy constructors', () => {
  it('new SimpleEntry(entry) copies key and value', () => {
    const src = new SimpleEntry('k', 1);
    const e = new SimpleEntry(src);
    src.setValue(2);
    expect([e.getKey(), e.getValue(), e.setValue(5), e.getValue(), src.getValue()]).toEqual(['k', 1, 1, 5, 2]);
  });
  it('new SimpleImmutableEntry(entry) copies key and value', () => {
    const e = new SimpleImmutableEntry(HashMap.of(['k', 1]).entrySet().iterator().next());
    expect([e.getKey(), e.getValue(), e.equals(new SimpleEntry('k', 1))]).toEqual(['k', 1, true]);
    expectThrows(() => e.setValue(2), 'UnsupportedOperationException');
  });
  it('two arguments still mean (key, value), even when the key is an entry', () => {
    const k = new SimpleEntry('x', 0);
    const e = new SimpleEntry(k, 1);
    expect([e.getKey(), e.getValue()]).toEqual([k, 1]);
    expect(new SimpleImmutableEntry<string, undefined>('a', undefined).getKey()).toBe('a');
  });
});

describe('a key whose hash changed after insertion', () => {
  class MutKey {
    constructor(public id: number, public h: number) {}
    equals(o: unknown): boolean {
      return o instanceof MutKey && o.id === this.id;
    }
    hashCode(): number {
      return this.h;
    }
  }
  it('iterator.remove removes exactly that entry, not a neighbour in the new bucket', () => {
    const m = new HashMap<MutKey, string>();
    const k = new MutKey(1, 7);
    m.put(k, 'mutable');
    m.put(new MutKey(2, 99), 'two');
    m.put(new MutKey(3, 99), 'three');
    k.h = 99;
    const it = m.entrySet().iterator();
    while (it.hasNext()) if (it.next().getValue() === 'mutable') it.remove();
    expect([m.size(), m.values().toArray().sort()]).toEqual([2, ['three', 'two']]);
  });
  it('removing and re-adding it leaves unrelated keys reachable', () => {
    const m = new LinkedHashMap<MutKey, string>();
    const k = new MutKey(1, 1);
    const other = new MutKey(2, 50);
    m.put(k, 'old');
    m.put(other, 'other');
    k.h = 2;
    const it = m.keySet().iterator();
    it.next();
    it.remove();
    k.h = 1;
    m.put(k, 'new');
    m.remove(k);
    expect([m.size(), m.get(other), m.get(k)]).toEqual([1, 'other', null]);
  });
});

describe('HashMap dense integer table', () => {
  it('shrinks when removing the top integers leaves it mostly empty', () => {
    const m = new HashMap<number, number>();
    for (let i = 0; i < 10_000; i++) m.put(i, i);
    for (let i = 9_999; i > 0; i--) m.remove(i);
    expect(m.size()).toBe(1);
    expect(m.ints.length).toBeLessThanOrEqual(1024 + 4);
    m.put(5, 5);
    expect([m.size(), m.containsKey(5)]).toEqual([2, true]);
  });
});
