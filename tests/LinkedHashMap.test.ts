import { MapEntry, SequencedMap } from '../src/interfaces/Map';
import { HashMap } from '../src/map/HashMap';
import { LinkedHashMap } from '../src/map/LinkedHashMap';
import { mapContract } from './contracts/map';
import { Collide, expectThrows, Point, rng } from './helpers';
import { SimpleMap } from './support';

mapContract('LinkedHashMap', () => new LinkedHashMap(), { allowsNullKey: true, allowsNullValue: true });
mapContract('LinkedHashMap (access order)', () => new LinkedHashMap(16, 0.75, true), { allowsNullKey: true, allowsNullValue: true, accessOrdered: true });
mapContract('LinkedHashMap.reversed()', () => new LinkedHashMap().reversed(), { allowsNullKey: true, allowsNullValue: true });

const keys = (m: { keySet(): { toArray(): unknown[] } }) => m.keySet().toArray();
const lhm = (...ks: unknown[]) => {
  const m = new LinkedHashMap<unknown, unknown>();
  for (const k of ks) m.put(k, 'v' + String(k));
  return m;
};
const accessMap = (...ks: unknown[]) => {
  const m = new LinkedHashMap<unknown, unknown>(16, 0.75, true);
  for (const k of ks) m.put(k, 'v' + String(k));
  return m;
};

/** Evicts beyond max and records each eldest it was shown. */
class Capped<K, V> extends LinkedHashMap<K, V> {
  seen: [K, V][] = [];
  constructor(private readonly max: number, access = false) {
    super(16, 0.75, access);
  }
  protected override removeEldestEntry(eldest: MapEntry<K, V>): boolean {
    this.seen.push([eldest.getKey(), eldest.getValue()]);
    return this.size() > this.max;
  }
}

describe('LinkedHashMap · insertion order', () => {
  it('iterates in insertion order across every key kind', () => {
    const p = new Point(1, 2);
    const ks = [5, 'b', 1e9, null, p, -1, undefined, new Collide(2), 0, new Date(3), new Collide(1), 'a'];
    const m = lhm(...ks);
    expect(keys(m)).toEqual(ks);
    expect([...m].map(([k]) => k)).toEqual(ks);
  });
  it('re-putting an existing key keeps its position', () => {
    const m = lhm(1, 2, 3);
    expect(m.put(1, 'x')).toBe('v1');
    expect(keys(m)).toEqual([1, 2, 3]);
    expect(m.get(1)).toBe('x');
  });
  it('remove then put moves the key to the end', () => {
    const m = lhm(1, 2, 3);
    m.remove(1);
    m.put(1, 'again');
    expect(keys(m)).toEqual([2, 3, 1]);
  });
  it('get/containsKey/compute never reorder in insertion mode', () => {
    const m = lhm('a', 'b', 'c');
    m.get('a');
    m.containsKey('a');
    m.compute('a', () => 1);
    m.merge('a', 2, (x, y) => (x as number) + (y as number));
    m.putIfAbsent('a', 9);
    m.replace('a', 7);
    expect(keys(m)).toEqual(['a', 'b', 'c']);
  });
  it('values() and entrySet() follow the same order', () => {
    const m = lhm(3, 1, 2);
    expect(m.values().toArray()).toEqual(['v3', 'v1', 'v2']);
    expect(m.entrySet().toArray().map((e) => e.getKey())).toEqual([3, 1, 2]);
    expect([...m.values()]).toEqual(['v3', 'v1', 'v2']);
    expect([...m.entrySet()].map((e) => e.getValue())).toEqual(['v3', 'v1', 'v2']);
  });
  it('forEach, toString and view forEach walk in order', () => {
    const m = lhm(2, 1);
    const seen: unknown[] = [];
    m.forEach((k) => seen.push(k));
    m.keySet().forEach((k) => seen.push(k));
    m.values().forEach((v) => seen.push(v));
    m.entrySet().forEach((e) => seen.push(e.getKey()));
    expect(seen).toEqual([2, 1, 2, 1, 'v2', 'v1', 2, 1]);
    expect(m.toString()).toBe('{2=v2, 1=v1}');
  });
  it('null and undefined keys hold their place', () => {
    const m = lhm('a', null, 'b', undefined);
    m.put(null, 'n');
    expect(keys(m)).toEqual(['a', null, 'b', undefined]);
    m.remove(null);
    m.put(null, 'n2');
    expect(keys(m)).toEqual(['a', 'b', undefined, null]);
  });
  it('colliding keys keep insertion order through removals', () => {
    const cs = Array.from({ length: 8 }, (_, i) => new Collide(i));
    const m = lhm(...cs);
    m.remove(new Collide(3));
    m.remove(new Collide(0));
    m.put(new Collide(3), 'x');
    expect(keys(m).map(String)).toEqual(['C1', 'C2', 'C4', 'C5', 'C6', 'C7', 'C3']);
  });
  it('containsValue walks the list', () => {
    const m = lhm(1, 2);
    m.put(3, null);
    expect([m.containsValue('v2'), m.containsValue(null), m.containsValue('nope')]).toEqual([true, true, false]);
  });
  it('clear resets the list', () => {
    const m = lhm(1, 2, 'x');
    m.clear();
    expect([m.size(), m.firstEntry(), keys(m)]).toEqual([0, null, []]);
    m.put('y', 1);
    expect(keys(m)).toEqual(['y']);
  });
  it('putAll appends new keys in source order and keeps existing places', () => {
    const m = lhm(1, 2);
    m.putAll(LinkedHashMap.of<unknown, unknown>([9, 'a'], [1, 'b'], [8, 'c']));
    expect(keys(m)).toEqual([1, 2, 9, 8]);
    m.putAll(SimpleMap.of<unknown, unknown>([7, 0], [6, 0]));
    expect(keys(m)).toEqual([1, 2, 9, 8, 7, 6]);
  });
  it('replaceAll keeps order', () => {
    const m = lhm(2, 1);
    m.replaceAll((k) => k);
    expect([...m]).toEqual([[2, 2], [1, 1]]);
  });
});

describe('LinkedHashMap · constructors and factories', () => {
  it('copy constructor keeps the source iteration order', () => {
    const src = lhm(5, 3, 9, 1);
    expect(keys(new LinkedHashMap(src))).toEqual([5, 3, 9, 1]);
    const sm = SimpleMap.of<string, number>(['z', 1], ['a', 2]);
    expect(keys(new LinkedHashMap(sm))).toEqual(['z', 'a']);
  });
  it('copy constructor is insertion ordered', () => {
    expect(new LinkedHashMap(accessMap(1)).accessOrder).toBe(false);
  });
  it('validates capacity and load factor', () => {
    expectThrows(() => new LinkedHashMap(-1), 'IllegalArgumentException');
    expectThrows(() => new LinkedHashMap(4, 0), 'IllegalArgumentException');
    expectThrows(() => new LinkedHashMap(4, NaN, true), 'IllegalArgumentException');
    expect(new LinkedHashMap(0).isEmpty()).toBe(true);
    expectThrows(() => new LinkedHashMap(null as never), 'NullPointerException');
  });
  it('of() builds in argument order', () => {
    const m = LinkedHashMap.of<string, number>(['b', 1], ['a', 2], ['b', 3]);
    expect([...m]).toEqual([['b', 3], ['a', 2]]);
    expect(m).toBeInstanceOf(HashMap);
  });
  it('clone keeps order, mode and independence', () => {
    const m = accessMap(1, 2, 3);
    m.get(1);
    const c = m.clone();
    expect([c.accessOrder, keys(c)]).toEqual([true, [2, 3, 1]]);
    c.get(2);
    expect([keys(c), keys(m)]).toEqual([[3, 1, 2], [2, 3, 1]]);
    expect(c).toBeInstanceOf(LinkedHashMap);
  });
  it('clone of an lru map keeps evicting', () => {
    const m = LinkedHashMap.lru<number, number>(2);
    m.put(1, 1);
    m.put(2, 2);
    const c = m.clone();
    c.put(3, 3);
    expect(keys(c)).toEqual([2, 3]);
  });
});

describe('LinkedHashMap · access order', () => {
  it('get moves the key to the end; misses do nothing', () => {
    const m = accessMap(1, 2, 3);
    m.get(1);
    m.get(42);
    expect(keys(m)).toEqual([2, 3, 1]);
  });
  it('containsKey and containsValue do not move', () => {
    const m = accessMap(1, 2, 3);
    m.containsKey(1);
    m.containsValue('v1');
    m.keySet().contains(1);
    expect(keys(m)).toEqual([1, 2, 3]);
  });
  it('put of an existing key moves it', () => {
    const m = accessMap('a', 'b', 'c');
    m.put('a', 0);
    expect(keys(m)).toEqual(['b', 'c', 'a']);
  });
  it('getOrDefault, putIfAbsent and replace move on a hit', () => {
    const m = accessMap(1, 2, 3, 4);
    m.getOrDefault(1, 'd');
    m.putIfAbsent(2, 'x');
    m.replace(3, 'y');
    expect(keys(m)).toEqual([4, 1, 2, 3]);
    m.replace(4, 'nope', 'z');
    expect(keys(m)).toEqual([4, 1, 2, 3]);
    m.replace(4, 'v4', 'z');
    expect(keys(m)).toEqual([1, 2, 3, 4]);
  });
  it('compute family and merge move existing keys', () => {
    const m = accessMap(1, 2, 3, 4, 5);
    m.computeIfAbsent(1, () => 'n');
    m.computeIfPresent(2, (_k, v) => v);
    m.compute(3, (_k, v) => v);
    m.merge(4, 'm', (a, b) => String(a) + String(b));
    expect(keys(m)).toEqual([5, 1, 2, 3, 4]);
  });
  it('entry.setValue and replaceAll do not move', () => {
    const m = accessMap(1, 2);
    m.entrySet().iterator().next().setValue('z');
    m.replaceAll((k) => k);
    expect(keys(m)).toEqual([1, 2]);
  });
  it('a get during iteration is a concurrent modification', () => {
    const m = accessMap(1, 2, 3);
    const it = m.keySet().iterator();
    it.next();
    m.get(1);
    expectThrows(() => it.next(), 'ConcurrentModificationException');
    const js = m[Symbol.iterator]();
    js.next();
    m.get(2);
    expect(() => js.next()).toThrow(expect.objectContaining({ name: 'ConcurrentModificationException' }));
  });
  it('overwriting a key during iteration is a concurrent modification', () => {
    const m = accessMap('a', 'b');
    const it = m.keySet().iterator();
    it.next();
    m.put('a', 9);
    expectThrows(() => it.next(), 'ConcurrentModificationException');
  });
  it('accessing the tail is not a modification', () => {
    const m = accessMap(1, 2);
    const mc = m.modCount;
    m.get(2);
    expect(m.modCount).toBe(mc);
  });
  it('forEach that reads in access mode throws', () => {
    const m = accessMap(1, 2, 3);
    expectThrows(() => m.forEach((k) => m.get(k === 1 ? 2 : 1)), 'ConcurrentModificationException');
  });
  it('get during insertion-order iteration is fine', () => {
    const m = lhm(1, 2, 3);
    const seen: unknown[] = [];
    for (const [k] of m) {
      m.get(1);
      seen.push(k);
    }
    expect(seen).toEqual([1, 2, 3]);
  });
});

describe('LinkedHashMap · eviction', () => {
  it('removeEldestEntry is shown the eldest after every insertion', () => {
    const m = new Capped<string, number>(2);
    m.put('a', 1);
    m.put('b', 2);
    m.put('a', 3); // update: no insertion hook
    m.put('c', 4);
    expect(m.seen).toEqual([['a', 1], ['a', 1], ['a', 3]]);
    expect(keys(m)).toEqual(['b', 'c']);
  });
  it('evicts on putAll, putIfAbsent, computeIfAbsent, compute and merge', () => {
    const m = new Capped<number, number>(2);
    m.putAll(LinkedHashMap.of<number, number>([1, 1], [2, 2], [3, 3]));
    expect(keys(m)).toEqual([2, 3]);
    m.putIfAbsent(4, 4);
    expect(keys(m)).toEqual([3, 4]);
    m.computeIfAbsent(5, () => 5);
    expect(keys(m)).toEqual([4, 5]);
    m.compute(6, () => 6);
    expect(keys(m)).toEqual([5, 6]);
    m.merge(7, 7, (a) => a);
    expect(keys(m)).toEqual([6, 7]);
  });
  it('an access-ordered capped map is an LRU cache', () => {
    const m = new Capped<number, string>(3, true);
    m.put(1, 'a');
    m.put(2, 'b');
    m.put(3, 'c');
    m.get(1);
    m.put(4, 'd');
    expect(keys(m)).toEqual([3, 1, 4]);
  });
  it('lru() evicts the least recently used', () => {
    const m = LinkedHashMap.lru<string, number>(2);
    m.put('a', 1);
    m.put('b', 2);
    m.get('a');
    m.put('c', 3);
    expect([...m]).toEqual([['a', 1], ['c', 3]]);
    m.computeIfAbsent('d', () => 4);
    m.merge('e', 5, (x) => x);
    expect(keys(m)).toEqual(['d', 'e']);
  });
  it('lru(1) keeps only the newest', () => {
    const m = LinkedHashMap.lru<number, number>(1);
    for (let i = 0; i < 10; i++) m.put(i, i);
    expect([...m]).toEqual([[9, 9]]);
  });
  it('lru validates maxSize', () => {
    expectThrows(() => LinkedHashMap.lru(0), 'IllegalArgumentException');
    expectThrows(() => LinkedHashMap.lru(NaN), 'IllegalArgumentException');
    expect(LinkedHashMap.lru(1).accessOrder).toBe(true);
  });
  it('removeEldestEntry may evict the entry just inserted', () => {
    class Drop extends LinkedHashMap<string, number> {
      protected override removeEldestEntry(): boolean {
        return true;
      }
    }
    const m = new Drop();
    expect(m.put('a', 1)).toBeNull();
    expect(m.isEmpty()).toBe(true);
    expect(m.putFirst('b', 2)).toBeNull();
    expect(m.putLast('c', 3)).toBeNull();
    expect(m.isEmpty()).toBe(true);
  });
  it('LRU model test against a reference cache', () => {
    const cap = 50;
    const m = LinkedHashMap.lru<number, number>(cap);
    // reference: array ordered from least to most recently used
    const ref: [number, number][] = [];
    const touch = (i: number) => ref.push(ref.splice(i, 1)[0]);
    const r = rng(7);
    for (let step = 0; step < 20_000; step++) {
      const k = r(80);
      const op = r(10);
      const i = ref.findIndex((e) => e[0] === k);
      if (op < 5) {
        const got = m.get(k);
        if (i >= 0) {
          expect(got).toBe(ref[i][1]);
          touch(i);
        } else expect(got).toBeNull();
      } else if (op < 9) {
        m.put(k, step);
        if (i >= 0) {
          ref[i][1] = step;
          touch(i);
        } else {
          ref.push([k, step]);
          if (ref.length > cap) ref.shift();
        }
      } else {
        m.remove(k);
        if (i >= 0) ref.splice(i, 1);
      }
      if (step % 97 === 0) expect([...m]).toEqual(ref);
    }
    expect([...m]).toEqual(ref);
  });
});

describe('LinkedHashMap · SequencedMap', () => {
  it('firstEntry/lastEntry are immutable snapshots, null when empty', () => {
    const m = new LinkedHashMap<string, number>();
    expect([m.firstEntry(), m.lastEntry()]).toEqual([null, null]);
    m.put('a', 1);
    m.put('b', 2);
    const f = m.firstEntry()!;
    expect([f.getKey(), f.getValue(), m.lastEntry()!.getKey()]).toEqual(['a', 1, 'b']);
    expectThrows(() => f.setValue(5), 'UnsupportedOperationException');
    m.put('a', 9);
    expect(f.getValue()).toBe(1);
    expect(f.equals(m.entrySet().iterator().next())).toBe(false);
  });
  it('firstEntry does not count as access', () => {
    const m = accessMap(1, 2);
    m.firstEntry();
    expect(keys(m)).toEqual([1, 2]);
  });
  it('pollFirstEntry/pollLastEntry remove from the ends', () => {
    const m = lhm(1, 2, 3);
    expect(m.pollFirstEntry()!.toString()).toBe('1=v1');
    expect(m.pollLastEntry()!.getKey()).toBe(3);
    expect(m.pollLastEntry()!.getKey()).toBe(2);
    expect([m.pollFirstEntry(), m.pollLastEntry(), m.size()]).toEqual([null, null, 0]);
  });
  it('pollFirstEntry drains in order', () => {
    const m = lhm(...Array.from({ length: 100 }, (_, i) => 99 - i));
    const out: unknown[] = [];
    for (let e; (e = m.pollFirstEntry()) !== null; ) out.push(e.getKey());
    expect(out).toEqual(Array.from({ length: 100 }, (_, i) => 99 - i));
  });
  it('putFirst/putLast insert or move in insertion mode', () => {
    const m = lhm(1, 2, 3);
    expect(m.putFirst(3, 'x')).toBe('v3');
    expect(keys(m)).toEqual([3, 1, 2]);
    expect(m.putLast(3, 'y')).toBe('x');
    expect(keys(m)).toEqual([1, 2, 3]);
    expect(m.putFirst(0, 'z')).toBeNull();
    expect(m.putLast(4, 'w')).toBeNull();
    expect(keys(m)).toEqual([0, 1, 2, 3, 4]);
    expect(m.get(3)).toBe('y');
  });
  it('putFirst/putLast in access mode move to that end', () => {
    const m = accessMap(1, 2, 3);
    m.putFirst(3, 'a');
    expect(keys(m)).toEqual([3, 1, 2]);
    m.putLast(1, 'b');
    expect(keys(m)).toEqual([3, 2, 1]);
    m.putFirst(9, 'c');
    expect(keys(m)).toEqual([9, 3, 2, 1]);
  });
  it('putFirst on an empty map and on a single entry', () => {
    const m = new LinkedHashMap<string, number>();
    m.putFirst('a', 1);
    m.putFirst('a', 2);
    m.putLast('a', 3);
    expect([...m]).toEqual([['a', 3]]);
  });
  it('putFirst/putLast reorder is a concurrent modification', () => {
    const m = lhm(1, 2);
    const it = m.keySet().iterator();
    it.next();
    m.putLast(1, 'x');
    expectThrows(() => it.next(), 'ConcurrentModificationException');
  });
  it('putFirst into an lru map evicts the eldest, not the new key', () => {
    const m = LinkedHashMap.lru<number, number>(2);
    m.put(1, 1);
    m.put(2, 2);
    m.putFirst(3, 3);
    expect(keys(m)).toEqual([3, 2]);
  });
  it('sequenced views are the same live views as keySet/values/entrySet', () => {
    const m = lhm(1, 2);
    expect(m.sequencedKeySet()).toBe(m.keySet());
    expect(m.sequencedValues()).toBe(m.values());
    expect(m.sequencedEntrySet()).toBe(m.entrySet());
    m.put(3, 'v3');
    expect(m.sequencedKeySet().getLast()).toBe(3);
  });
  it('sequenced views: getFirst/getLast/removeFirst/removeLast', () => {
    const m = lhm(1, 2, 3, 4, 5, 6);
    const ks = m.sequencedKeySet();
    const vs = m.sequencedValues();
    const es = m.sequencedEntrySet();
    expect([ks.getFirst(), ks.getLast(), vs.getFirst(), vs.getLast(), es.getFirst().getKey(), es.getLast().getKey()]).toEqual([1, 6, 'v1', 'v6', 1, 6]);
    expect([ks.removeFirst(), ks.removeLast(), vs.removeFirst(), vs.removeLast()]).toEqual([1, 6, 'v2', 'v5']);
    expect(es.removeFirst().getKey()).toBe(3);
    expect(es.removeLast().getKey()).toBe(4);
    expect(m.isEmpty()).toBe(true);
    for (const f of [() => ks.getFirst(), () => vs.getLast(), () => es.removeFirst(), () => ks.removeLast()]) expectThrows(f, 'NoSuchElementException');
  });
  it('sequenced views reject addFirst/addLast/add', () => {
    const m = lhm(1);
    expectThrows(() => m.sequencedKeySet().addFirst(2), 'UnsupportedOperationException');
    expectThrows(() => m.sequencedValues().addLast('x'), 'UnsupportedOperationException');
    expectThrows(() => m.sequencedEntrySet().add(m.firstEntry()!), 'UnsupportedOperationException');
  });
  it('reversed views of the views iterate backwards and write through', () => {
    const m = lhm(1, 2, 3, 4);
    const rk = m.sequencedKeySet().reversed();
    expect([rk.toArray(), [...rk], m.sequencedValues().reversed().toArray()]).toEqual([[4, 3, 2, 1], [4, 3, 2, 1], ['v4', 'v3', 'v2', 'v1']]);
    expect(m.sequencedEntrySet().reversed().getFirst().getKey()).toBe(4);
    expect(rk.reversed()).toBe(m.sequencedKeySet());
    expect([rk.getFirst(), rk.getLast()]).toEqual([4, 1]);
    expect(rk.removeFirst()).toBe(4);
    expect(m.sequencedValues().reversed().removeLast()).toBe('v1');
    expect(keys(m)).toEqual([2, 3]);
    const it = rk.iterator();
    it.next();
    it.remove();
    expect(keys(m)).toEqual([2]);
    expect(m.sequencedEntrySet().reversed().reversed()).toBe(m.sequencedEntrySet());
    expect(m.sequencedValues().reversed().reversed()).toBe(m.sequencedValues());
  });
  it('reversed key view equals a set and has the same hashCode', () => {
    const m = lhm(1, 2);
    const rk = m.keySet().reversed();
    expect(rk.equals(m.keySet())).toBe(true);
    expect(rk.hashCode()).toBe(m.keySet().hashCode());
    expect(m.entrySet().reversed().equals(m.entrySet())).toBe(true);
  });
  it('reversed values remove() removes the last occurrence', () => {
    const m = LinkedHashMap.of<string, number>(['a', 1], ['b', 1], ['c', 2]);
    m.values().reversed().remove(1);
    expect(keys(m)).toEqual(['a', 'c']);
  });
  it('reversed view forEach and toArray in reverse; CME on modification', () => {
    const m = lhm(1, 2, 3);
    const seen: unknown[] = [];
    m.keySet().reversed().forEach((k) => seen.push(k));
    expect(seen).toEqual([3, 2, 1]);
    expectThrows(() => m.keySet().reversed().forEach(() => m.put(Math.random(), 0)), 'ConcurrentModificationException');
  });
});

describe('LinkedHashMap · reversed()', () => {
  it('iterates backwards and its reversed() is the original', () => {
    const m = lhm(1, 2, 3);
    const r = m.reversed();
    expect([...r].map(([k]) => k)).toEqual([3, 2, 1]);
    expect(r.reversed()).toBe(m);
    expect(m.reversed()).toBe(r);
    expect(r.toString()).toBe('{3=v3, 2=v2, 1=v1}');
  });
  it('reads and writes go through', () => {
    const m = lhm(1, 2);
    const r = m.reversed();
    expect([r.get(1), r.size(), r.isEmpty(), r.containsKey(2), r.containsValue('v2')]).toEqual(['v1', 2, false, true, true]);
    expect(r.put(3, 'v3')).toBeNull();
    expect(keys(m)).toEqual([1, 2, 3]);
    expect(keys(r)).toEqual([3, 2, 1]);
    expect(r.remove(2)).toBe('v2');
    expect(r.remove(1, 'nope')).toBe(false);
    expect(r.remove(1, 'v1')).toBe(true);
    r.putAll(SimpleMap.of([4, 'v4']));
    expect(keys(m)).toEqual([3, 4]);
    r.clear();
    expect(m.isEmpty()).toBe(true);
  });
  it('firstEntry/lastEntry/poll are mirrored', () => {
    const m = lhm(1, 2, 3);
    const r = m.reversed();
    expect([r.firstEntry()!.getKey(), r.lastEntry()!.getKey()]).toEqual([3, 1]);
    expect(r.pollFirstEntry()!.getKey()).toBe(3);
    expect(r.pollLastEntry()!.getKey()).toBe(1);
    expect(keys(m)).toEqual([2]);
  });
  it('putFirst/putLast are mirrored', () => {
    const m = lhm(1, 2);
    const r = m.reversed();
    r.putFirst(0, 'a');
    r.putLast(9, 'b');
    expect(keys(m)).toEqual([9, 1, 2, 0]);
    expect(keys(r)).toEqual([0, 2, 1, 9]);
  });
  it('sequenced views of the reversed map', () => {
    const m = lhm(1, 2);
    const r = m.reversed();
    expect(r.sequencedKeySet().toArray()).toEqual([2, 1]);
    expect(r.sequencedValues().toArray()).toEqual(['v2', 'v1']);
    expect(r.sequencedEntrySet().getFirst().getKey()).toBe(2);
    expect(r.sequencedKeySet().reversed()).toBe(m.keySet());
  });
  it('default methods delegate and keep access semantics', () => {
    const m = accessMap(1, 2, 3);
    const r = m.reversed();
    expect(r.getOrDefault(1, 'd')).toBe('v1');
    expect(r.getOrDefault(7, 'd')).toBe('d');
    expect(keys(m)).toEqual([2, 3, 1]);
    expect(r.putIfAbsent(2, 'x')).toBe('v2');
    expect(r.replace(3, 'r')).toBe('v3');
    expect(r.replace(3, 'r', 's')).toBe(true);
    expect(r.computeIfAbsent(4, () => 'n')).toBe('n');
    expect(r.computeIfPresent(4, () => 'p')).toBe('p');
    expect(r.compute(5, () => 'c')).toBe('c');
    expect(r.merge(5, 'm', (a, b) => String(a) + String(b))).toBe('cm');
    expect([...m]).toEqual([[1, 'v1'], [2, 'v2'], [3, 's'], [4, 'p'], [5, 'cm']]);
  });
  it('forEach and replaceAll walk in reverse', () => {
    const m = lhm(1, 2, 3);
    const r = m.reversed();
    const seen: unknown[] = [];
    r.forEach((k) => seen.push(k));
    r.replaceAll((k) => (seen.push(k), k));
    expect(seen).toEqual([3, 2, 1, 3, 2, 1]);
    expect(m.get(2)).toBe(2);
  });
  it('equals/hashCode match the base map', () => {
    const m = lhm(1, 2);
    expect(m.reversed().equals(m)).toBe(true);
    expect(m.equals(m.reversed())).toBe(true);
    expect(m.reversed().hashCode()).toBe(m.hashCode());
  });
});

describe('LinkedHashMap · iterators', () => {
  it('iterator.remove keeps the rest of the order', () => {
    const m = lhm(1, 2, 3, 4);
    const it = m.keySet().iterator();
    while (it.hasNext()) if ((it.next() as number) % 2 === 0) it.remove();
    expect(keys(m)).toEqual([1, 3]);
    expectThrows(() => it.remove(), 'IllegalStateException');
    expectThrows(() => it.next(), 'NoSuchElementException');
  });
  it('entry and value iterators remove, and removeIf works on views', () => {
    const m = lhm(1, 2, 3, 4, 5);
    const it = m.entrySet().iterator();
    it.next();
    it.remove();
    m.values().removeIf((v) => v === 'v3');
    m.entrySet().removeIf((e) => e.getKey() === 5);
    expect(keys(m)).toEqual([2, 4]);
  });
  it('remove twice and remove after a foreign modification fail', () => {
    const m = lhm(1, 2);
    const it = m.values().iterator();
    it.next();
    m.put(3, 'x');
    expectThrows(() => it.remove(), 'ConcurrentModificationException');
  });
  it('structural changes during iteration throw', () => {
    const m = lhm(1, 2, 3);
    expectThrows(() => {
      for (const [k] of m) if (k === 1) m.remove(3);
    }, 'ConcurrentModificationException');
    expectThrows(() => m.forEach(() => m.put('new' + m.size(), 0)), 'ConcurrentModificationException');
    expectThrows(() => m.keySet().forEach(() => m.remove(1)), 'ConcurrentModificationException');
  });
  it('forEachRemaining continues in order', () => {
    const m = lhm(1, 2, 3);
    const it = m.values().iterator();
    it.next();
    const rest: unknown[] = [];
    it.forEachRemaining((v) => rest.push(v));
    expect(rest).toEqual(['v2', 'v3']);
  });
  it('JS iterators are plain objects, not generators', () => {
    const m = lhm(1);
    for (const it of [m[Symbol.iterator](), m.keySet()[Symbol.iterator](), m.reversed()[Symbol.iterator]()] as IterableIterator<unknown>[]) {
      expect(Object.prototype.toString.call(it)).toBe('[object Object]');
      expect(it[Symbol.iterator]()).toBe(it);
    }
  });
  it('view mutators keep order', () => {
    const m = lhm(1, 2, 3, 4);
    m.keySet().remove(2);
    m.entrySet().remove(m.lastEntry());
    m.entrySet().remove('not an entry');
    expect(m.entrySet().contains(m.firstEntry())).toBe(true);
    expect(m.values().contains('v3')).toBe(true);
    m.values().remove('v3');
    expect(keys(m)).toEqual([1]);
    m.keySet().clear();
    expect(m.isEmpty()).toBe(true);
  });
});

describe('LinkedHashMap · equality', () => {
  it('equals/hashCode ignore order and match HashMap and SimpleMap', () => {
    const a = LinkedHashMap.of<string, number>(['x', 1], ['y', 2]);
    const b = LinkedHashMap.of<string, number>(['y', 2], ['x', 1]);
    const h = HashMap.of<string, number>(['x', 1], ['y', 2]);
    const s = SimpleMap.of<string, number>(['y', 2], ['x', 1]);
    expect([a.equals(b), a.equals(h), h.equals(a), a.equals(s), s.equals(a)]).toEqual([true, true, true, true, true]);
    expect(new Set([a.hashCode(), b.hashCode(), h.hashCode(), s.hashCode()]).size).toBe(1);
    expect(a.keySet().equals(h.keySet())).toBe(true);
  });
  it('Point keys are found by value', () => {
    const m = new LinkedHashMap<Point, number>();
    m.put(new Point(1, 1), 1);
    m.put(new Point(0, 0), 2);
    m.put(new Point(1, 1), 3);
    expect([m.size(), m.get(new Point(1, 1)), keys(m).map(String)]).toEqual([2, 3, ['(1,1)', '(0,0)']]);
  });
});

describe('LinkedHashMap · model test vs JS Map', () => {
  it('random ops keep the same contents and order as a native Map', () => {
    const m = new LinkedHashMap<number | string, number>();
    const ref = new Map<number | string, number>();
    const r = rng(42);
    for (let step = 0; step < 30_000; step++) {
      const op = r(10);
      // mixes dense ints, sparse ints and strings
      const k = r(3) === 0 ? 'k' + r(50) : r(2) === 0 ? r(200) : 1e6 + r(100);
      if (op < 4) {
        expect(m.put(k, step)).toBe(ref.has(k) ? ref.get(k) : null);
        ref.set(k, step);
      } else if (op < 6) {
        expect(m.remove(k)).toBe(ref.has(k) ? ref.get(k) : null);
        ref.delete(k);
      } else if (op < 7) {
        const e = m.pollFirstEntry();
        const first = ref.keys().next();
        expect(e === null ? undefined : e.getKey()).toBe(first.value);
        if (!first.done) ref.delete(first.value);
      } else if (op < 8) {
        m.putLast(k, step);
        ref.delete(k);
        ref.set(k, step);
      } else {
        expect(m.get(k)).toBe(ref.has(k) ? ref.get(k) : null);
      }
      expect(m.size()).toBe(ref.size);
      if (step % 50 === 0) expect([...m]).toEqual([...ref]);
    }
    expect([...m]).toEqual([...ref]);
    expect(m.reversed().keySet().toArray()).toEqual([...ref.keys()].reverse());
  });
  it('scales: 100k puts, ordered iteration and drain', () => {
    const m = new LinkedHashMap<number, number>();
    const N = 100_000;
    for (let i = N; i > 0; i--) m.put(i, i);
    let prev = N + 1;
    for (const [k] of m) {
      expect(k).toBe(prev - 1);
      prev = k;
    }
    while (m.pollFirstEntry() !== null);
    expect(m.isEmpty()).toBe(true);
  });
});

describe('LinkedHashMap · typing', () => {
  it('is a SequencedMap', () => {
    const m: SequencedMap<string, number> = new LinkedHashMap();
    m.putLast('a', 1);
    expect(m.reversed().firstEntry()!.getKey()).toBe('a');
  });
});
