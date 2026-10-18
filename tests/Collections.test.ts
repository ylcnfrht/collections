import { SimpleEntry } from '../src/abstract/AbstractMap';
import {
  addAll,
  binarySearch,
  Collections,
  copy,
  disjoint,
  EMPTY_LIST,
  EMPTY_SET,
  emptyList,
  emptyMap,
  emptySet,
  fill,
  frequency,
  indexOfSubList,
  lastIndexOfSubList,
  max,
  min,
  nCopies,
  replaceAll,
  reverse,
  reverseOrder,
  rotate,
  shuffle,
  singleton,
  singletonList,
  singletonMap,
  sort,
  swap,
  unmodifiableCollection,
  unmodifiableList,
  unmodifiableMap,
  unmodifiableNavigableMap,
  unmodifiableNavigableSet,
  unmodifiableSequencedCollection,
  unmodifiableSequencedMap,
  unmodifiableSet,
  unmodifiableSortedMap,
  unmodifiableSortedSet,
} from '../src/Collections';
import { List as IList, Map as IMap, Set as ISet } from '../src/immutable/ImmutableCollections';
import { List } from '../src/interfaces/List';
import { ArrayList } from '../src/list/ArrayList';
import { LinkedList } from '../src/list/LinkedList';
import { HashMap } from '../src/map/HashMap';
import { LinkedHashMap } from '../src/map/LinkedHashMap';
import { TreeMap } from '../src/map/TreeMap';
import { HashSet } from '../src/set/HashSet';
import { TreeSet } from '../src/set/TreeSet';
import { naturalCompare } from '../src/util/Comparator';
import { isRandomAccess } from '../src/util/guards';
import { expectThrows, Point, rng, timeIt } from './helpers';

const UOE = 'UnsupportedOperationException';
const NPE = 'NullPointerException';
const IAE = 'IllegalArgumentException';
const IOOBE = 'IndexOutOfBoundsException';
const NSEE = 'NoSuchElementException';

const factories: [string, <E>(...xs: E[]) => List<E>][] = [
  ['ArrayList', (...xs) => ArrayList.of(...xs)],
  ['LinkedList', (...xs) => LinkedList.of(...xs)],
];

/** Seeded random() in [0, 1). */
function seeded(seed: number): () => number {
  const r = rng(seed);
  return () => r(1 << 30) / (1 << 30);
}

const desc = (a: number, b: number) => b - a;

describe.each(factories)('algorithms on %s', (_name, of) => {
  describe('sort', () => {
    it('natural', () => {
      const l = of(3, 1, 2);
      sort(l);
      expect(l.toArray()).toEqual([1, 2, 3]);
    });
    it('comparator', () => {
      const l = of(3, 1, 2);
      sort(l, desc);
      expect(l.toArray()).toEqual([3, 2, 1]);
    });
    it('stable', () => {
      const l = of(new Point(1, 1), new Point(0, 2), new Point(1, 0), new Point(0, 1));
      sort(l, (a, b) => a.x - b.x);
      expect(l.toArray().map(String)).toEqual(['(0,2)', '(0,1)', '(1,1)', '(1,0)']);
    });
  });

  describe('reverse', () => {
    it.each([[[]], [[1]], [[1, 2]], [[1, 2, 3]], [[1, 2, 3, 4, 5, 6]]])('%j', (xs: number[]) => {
      const l = of(...xs);
      reverse(l);
      expect(l.toArray()).toEqual(xs.slice().reverse());
    });
  });

  describe('shuffle', () => {
    it('is a permutation', () => {
      const xs = Array.from({ length: 50 }, (_, i) => i);
      const l = of(...xs);
      shuffle(l, seeded(7));
      expect(l.toArray().sort((a, b) => a - b)).toEqual(xs);
      expect(l.toArray()).not.toEqual(xs);
    });
    it('is reproducible with a seeded random and matches ArrayList', () => {
      const a = of(...Array.from({ length: 20 }, (_, i) => i));
      const b = ArrayList.of(...Array.from({ length: 20 }, (_, i) => i));
      shuffle(a, seeded(42));
      shuffle(b, seeded(42));
      expect(a.toArray()).toEqual(b.toArray());
    });
    it('default random still permutes', () => {
      const l = of(1, 2, 3, 4);
      shuffle(l);
      expect(l.toArray().sort()).toEqual([1, 2, 3, 4]);
    });
    it('empty and single', () => {
      const e = of<number>();
      shuffle(e, seeded(1));
      expect(e.size()).toBe(0);
      const s = of(1);
      shuffle(s, seeded(1));
      expect(s.toArray()).toEqual([1]);
    });
    it('Fisher–Yates: random()≈1 always picks j = i (identity)', () => {
      const l = of(1, 2, 3, 4);
      shuffle(l, () => 0.999999);
      expect(l.toArray()).toEqual([1, 2, 3, 4]);
    });
    it('rejects a null random', () => expectThrows(() => shuffle(of(1), null as any), NPE));
  });

  describe('swap', () => {
    it('swaps', () => {
      const l = of(1, 2, 3);
      swap(l, 0, 2);
      expect(l.toArray()).toEqual([3, 2, 1]);
      swap(l, 1, 1);
      expect(l.toArray()).toEqual([3, 2, 1]);
    });
    it('out of bounds', () => {
      expectThrows(() => swap(of(1, 2), 0, 2), IOOBE);
      expectThrows(() => swap(of(1, 2), -1, 0), IOOBE);
    });
  });

  it('fill', () => {
    const l = of(1, 2, 3);
    fill(l, 0);
    expect(l.toArray()).toEqual([0, 0, 0]);
    const e = of<number>();
    fill(e, 1);
    expect(e.size()).toBe(0);
  });

  describe('copy', () => {
    it.each(factories)('into %s', (_n, of2) => {
      const dest = of(9, 9, 9, 9);
      copy(dest, of2(1, 2));
      expect(dest.toArray()).toEqual([1, 2, 9, 9]);
    });
    it('dest too small', () => expectThrows(() => copy(of(1), of(1, 2)), IOOBE));
    it('empty source', () => {
      const d = of(1);
      copy(d, of<number>());
      expect(d.toArray()).toEqual([1]);
    });
  });

  describe('min / max', () => {
    it('natural', () => {
      expect(min(of(3, 1, 2))).toBe(1);
      expect(max(of(3, 1, 2))).toBe(3);
      expect(min(of('b', 'a'))).toBe('a');
    });
    it('comparator', () => {
      expect(min(of(3, 1, 2), desc)).toBe(3);
      expect(max(of(3, 1, 2), desc)).toBe(1);
    });
    it('first of equal elements wins', () => {
      const a = new Point(1, 0);
      const b = new Point(1, 1);
      expect(min(of(a, b), (x, y) => x.x - y.x)).toBe(a);
      expect(max(of(a, b), (x, y) => x.x - y.x)).toBe(a);
    });
    it('empty throws', () => {
      expectThrows(() => min(of()), NSEE);
      expectThrows(() => max(of()), NSEE);
    });
    it('single', () => expect(max(of(5))).toBe(5));
  });

  it('frequency', () => {
    const l = of<unknown>(1, 2, 1, null, new Point(1, 1), new Point(1, 1), NaN);
    expect(frequency(l, 1)).toBe(2);
    expect(frequency(l, null)).toBe(1);
    expect(frequency(l, undefined)).toBe(0);
    expect(frequency(l, new Point(1, 1))).toBe(2);
    expect(frequency(l, NaN)).toBe(1);
    expect(frequency(l, 7)).toBe(0);
  });

  describe('disjoint', () => {
    it.each([
      ['list/list', () => of(4, 5), true],
      ['list/list overlap', () => of(9, 3), false],
      ['list/set', () => HashSet.of(4, 5), true],
      ['list/set overlap', () => HashSet.of(3), false],
      ['list/empty', () => of<number>(), true],
    ])('%s', (_n, other, want) => {
      const l = of(1, 2, 3);
      expect(disjoint(l, other() as any)).toBe(want);
      expect(disjoint(other() as any, l)).toBe(want);
    });
    it('set/set', () => {
      expect(disjoint(HashSet.of(1), HashSet.of(2))).toBe(true);
      expect(disjoint(HashSet.of(1), TreeSet.of(1))).toBe(false);
    });
    it('same collection', () => expect(disjoint(of(1), of(1))).toBe(false));
    it('nulls rejected', () => expectThrows(() => disjoint(null as any, of(1)), NPE));
  });

  describe('binarySearch', () => {
    const xs = [1, 3, 5, 7, 9, 11, 13];
    it.each(xs.map((x, i) => [x, i]))('finds %d at %d', (x, i) => expect(binarySearch(of(...xs), x)).toBe(i));
    it.each([
      [0, -1],
      [2, -2],
      [8, -5],
      [14, -8],
    ])('absent %d -> %d', (k, want) => expect(binarySearch(of(...xs), k)).toBe(want));
    it('empty', () => expect(binarySearch(of<number>(), 5)).toBe(-1));
    it('duplicates: any index of the run', () => {
      const l = of(1, 2, 2, 2, 2, 3);
      const i = binarySearch(l, 2);
      expect(i).toBeGreaterThanOrEqual(1);
      expect(i).toBeLessThanOrEqual(4);
    });
    it('custom comparator (descending)', () => {
      const l = of(9, 7, 5, 3);
      expect(binarySearch(l, 5, desc)).toBe(2);
      expect(binarySearch(l, 10, desc)).toBe(-1);
      expect(binarySearch(l, 1, desc)).toBe(-5);
      expect(binarySearch(l, 6, desc)).toBe(-3);
    });
    it('every key and gap on a large list matches a reference', () => {
      const big = Array.from({ length: 300 }, (_, i) => i * 2);
      const l = of(...big);
      for (let k = -1; k <= 600; k++) {
        const got = binarySearch(l, k);
        const want = k % 2 === 0 && k >= 0 && k < 600 ? k / 2 : -(Math.min(Math.max(Math.ceil(k / 2), 0), 300) + 1);
        expect(got).toBe(want);
      }
    });
    it('null comparator = natural', () => expect(binarySearch(of('a', 'b', 'c'), 'c', null)).toBe(2));
  });

  describe('rotate', () => {
    it.each([
      [1, [5, 1, 2, 3, 4]],
      [2, [4, 5, 1, 2, 3]],
      [-1, [2, 3, 4, 5, 1]],
      [-7, [3, 4, 5, 1, 2]],
      [5, [1, 2, 3, 4, 5]],
      [0, [1, 2, 3, 4, 5]],
      [1_000_000_002, [4, 5, 1, 2, 3]],
      [-1_000_000_001, [2, 3, 4, 5, 1]],
    ])('distance %d', (d, want) => {
      const l = of(1, 2, 3, 4, 5);
      rotate(l, d);
      expect(l.toArray()).toEqual(want);
    });
    it('cycles when gcd(n, d) > 1', () => {
      const l = of(0, 1, 2, 3, 4, 5);
      rotate(l, 2);
      expect(l.toArray()).toEqual([4, 5, 0, 1, 2, 3]);
    });
    it('empty and single', () => {
      const e = of<number>();
      rotate(e, 3);
      expect(e.size()).toBe(0);
      const s = of(1);
      rotate(s, 3);
      expect(s.toArray()).toEqual([1]);
    });
    it('on a subList rotates only the range', () => {
      const l = of(1, 2, 3, 4, 5);
      rotate(l.subList(1, 4), 1);
      expect(l.toArray()).toEqual([1, 4, 2, 3, 5]);
    });
  });

  it('addAll varargs', () => {
    const l = of(1);
    expect(addAll(l, 2, 3)).toBe(true);
    expect(addAll(l)).toBe(false);
    expect(l.toArray()).toEqual([1, 2, 3]);
    const s = HashSet.of(1);
    expect(addAll(s, 1)).toBe(false);
    expectThrows(() => addAll(null as any, 1), NPE);
  });

  describe('indexOfSubList / lastIndexOfSubList', () => {
    it.each(factories)('target as %s', (_n, of2) => {
      const src = of(1, 2, 3, 1, 2, 3, 4);
      expect(indexOfSubList(src, of2(1, 2, 3))).toBe(0);
      expect(lastIndexOfSubList(src, of2(1, 2, 3))).toBe(3);
      expect(indexOfSubList(src, of2(3, 4))).toBe(5);
      expect(lastIndexOfSubList(src, of2(3, 4))).toBe(5);
      expect(indexOfSubList(src, of2(4, 5))).toBe(-1);
      expect(lastIndexOfSubList(src, of2(2, 1))).toBe(-1);
    });
    it('empty target matches at 0 / size', () => {
      expect(indexOfSubList(of(1, 2), of())).toBe(0);
      expect(lastIndexOfSubList(of(1, 2), of())).toBe(2);
    });
    it('target longer than source', () => {
      expect(indexOfSubList(of(1), of(1, 2))).toBe(-1);
      expect(lastIndexOfSubList(of(1), of(1, 2))).toBe(-1);
    });
    it('uses equals', () => expect(indexOfSubList(of(new Point(0, 0), new Point(1, 1)), of(new Point(1, 1)))).toBe(1));
  });

  it('replaceAll', () => {
    const l = of<unknown>(1, null, 1, 2);
    expect(replaceAll(l, 1, 9)).toBe(true);
    expect(l.toArray()).toEqual([9, null, 9, 2]);
    expect(replaceAll(l, null, 0)).toBe(true);
    expect(l.toArray()).toEqual([9, 0, 9, 2]);
    expect(replaceAll(l, 42, 0)).toBe(false);
  });
});

describe('algorithms stay linear on LinkedList', () => {
  it('reverse/shuffle/rotate/fill/binarySearch/replaceAll on 200k elements', () => {
    const n = 200_000;
    const l = new LinkedList<number>();
    for (let i = 0; i < n; i++) l.add(i);
    const ms = timeIt(() => {
      reverse(l);
      reverse(l);
      expect(binarySearch(l, 123_456)).toBe(123_456);
      rotate(l, 12_345);
      shuffle(l, seeded(3));
      replaceAll(l, 5, 6);
      fill(l, 0);
    });
    expect(ms).toBeLessThan(3000);
  });
});

describe('model test: ArrayList vs plain array', () => {
  it.each([1, 2, 3, 4, 5])('seed %d', (seed) => {
    const r = rng(seed);
    const n = r(40);
    const model = Array.from({ length: n }, () => r(20));
    const list = ArrayList.of(...model);
    const linked = LinkedList.of(...model);
    for (let step = 0; step < 200; step++) {
      const op = r(5);
      if (op === 0) {
        model.sort((a, b) => a - b);
        sort(list);
        sort(linked);
      } else if (op === 1) {
        model.reverse();
        reverse(list);
        reverse(linked);
      } else if (op === 2) {
        const d = r(100) - 50;
        if (n > 0) {
          const k = ((d % n) + n) % n;
          model.unshift(...model.splice(n - k, k));
        }
        rotate(list, d);
        rotate(linked, d);
      } else if (op === 3 && n > 0) {
        const i = r(n);
        const j = r(n);
        [model[i], model[j]] = [model[j], model[i]];
        swap(list, i, j);
        swap(linked, i, j);
      } else if (op === 4) {
        const s = r(1000);
        const rand = seeded(s);
        for (let i = model.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [model[i], model[j]] = [model[j], model[i]];
        }
        shuffle(list, seeded(s));
        shuffle(linked, seeded(s));
      }
      expect(list.toArray()).toEqual(model);
      expect(linked.toArray()).toEqual(model);
    }
  });
});

describe('reverseOrder', () => {
  it('natural reversed', () => {
    const l = ArrayList.of(1, 3, 2);
    sort(l, reverseOrder());
    expect(l.toArray()).toEqual([3, 2, 1]);
  });
  it('reverses a comparator', () => {
    const c = reverseOrder((a: string, b: string) => a.length - b.length);
    expect(c('aa', 'b')).toBeLessThan(0);
  });
  it('double reverse gives back the original', () => {
    const c = (a: number, b: number) => a - b;
    expect(reverseOrder(reverseOrder(c))).toBe(c);
    expect(reverseOrder(reverseOrder())).toBe(naturalCompare);
    expect(reverseOrder(null)).toBe(reverseOrder());
  });
});

describe('nCopies', () => {
  it('contents and immutability', () => {
    const l = nCopies(3, 'x');
    expect(l.toArray()).toEqual(['x', 'x', 'x']);
    expect(isRandomAccess(l)).toBe(true);
    expectThrows(() => l.add('y'), UOE);
    expectThrows(() => l.set(0, 'y'), UOE);
    expect(l.equals(ArrayList.of('x', 'x', 'x'))).toBe(true);
  });
  it('zero and negative', () => {
    expect(nCopies(0, 1).isEmpty()).toBe(true);
    expectThrows(() => nCopies(-1, 1), IAE);
    expectThrows(() => nCopies(NaN, 1), IAE);
  });
  it('allows null', () => {
    const l = nCopies(2, null);
    expect(l.contains(null)).toBe(true);
    expectThrows(() => IList.copyOf(l), NPE);
  });
  it('can seed a mutable list', () => expect(new ArrayList(nCopies(4, 0)).size()).toBe(4));
  it('streams a huge count without materializing it', () => {
    const l = nCopies(2 ** 31 - 1, 'x');
    expect(l.stream().limit(3).toList().toArray()).toEqual(['x', 'x', 'x']);
    expect(l.spliterator().estimateSize()).toBe(2 ** 31 - 1);
  });
});

describe('empty and singleton collections', () => {
  it('empty ones are empty, shared and reject mutators', () => {
    expect(emptyList().size()).toBe(0);
    expect(emptyList()).toBe(emptyList());
    expect(emptySet().isEmpty()).toBe(true);
    expect(emptyMap().isEmpty()).toBe(true);
    // verified on the reference: clear() of an empty list changes nothing, so it does not throw
    emptyList().clear();
    expectThrows(() => emptyList().add(1), UOE);
    expectThrows(() => emptySet().add(1), UOE);
    expectThrows(() => emptyMap().put(1, 1), UOE);
    expect(emptyList().equals(new LinkedList())).toBe(true);
    expect(emptySet().equals(new HashSet())).toBe(true);
    expect(emptyMap().equals(new HashMap())).toBe(true);
    expect(emptyList().hashCode()).toBe(1);
    expect(emptyMap().get('x')).toBeNull();
  });
  it('singletonList', () => {
    const l = singletonList('a');
    expect(l.get(0)).toBe('a');
    expect(l.equals(ArrayList.of('a'))).toBe(true);
    expectThrows(() => l.set(0, 'b'), UOE);
    expectThrows(() => l.removeAt(0), UOE);
    expect(singletonList(null).contains(null)).toBe(true);
    expectThrows(() => IList.copyOf(singletonList(null)), NPE);
    expect(IList.copyOf(l).equals(l)).toBe(true);
  });
  it('singleton set', () => {
    const s = singleton(1);
    expect(s.contains(1)).toBe(true);
    expect(s.equals(HashSet.of(1))).toBe(true);
    expectThrows(() => s.remove(1), UOE);
    expect(singleton(null).contains(null)).toBe(true);
    expectThrows(() => ISet.copyOf(singleton(null)), NPE);
  });
  it('singletonMap', () => {
    const m = singletonMap('k', 'v');
    expect(m.get('k')).toBe('v');
    expect(m.equals(HashMap.of(['k', 'v']))).toBe(true);
    expectThrows(() => m.put('k', 'w'), UOE);
    expectThrows(() => m.entrySet().iterator().next().setValue('w'), UOE);
    const n = singletonMap(null, null);
    expect(n.containsKey(null)).toBe(true);
    expect(n.get(null)).toBeNull();
    expectThrows(() => IMap.copyOf(n), NPE);
  });
});

// Every expectation below was verified on the reference runtime (the differential harness and a direct check).
describe('empty / singleton / nCopies follow the reference classes method by method', () => {
  const ok = (f: () => unknown, v: unknown) => expect(f()).toBe(v);
  it('emptyList: inherited mutators fail only when they would change something', () => {
    const l = emptyList<number>();
    ok(() => l.remove(1), false);
    ok(() => l.removeAll(ArrayList.of(1)), false);
    ok(() => l.retainAll(new ArrayList()), false);
    ok(() => l.removeIf(() => true), false);
    ok(() => l.addAll(new ArrayList()), false);
    l.sort(null);
    l.replaceAll((x) => x);
    expectThrows(() => l.replaceAll(null as any), NPE);
    expectThrows(() => l.removeIf(null as any), NPE);
    expectThrows(() => l.removeFirst(), NSEE);
    expectThrows(() => l.addAll(1, new ArrayList()), IOOBE);
    expectThrows(() => l.add(5, 1), UOE);
    expectThrows(() => l.iterator().remove(), 'IllegalStateException');
    l.reversed().clear();
    ok(() => l.reversed().remove(1), false);
    ok(() => EMPTY_LIST.remove(1), false);
  });
  it('emptySet / emptyMap', () => {
    const s = emptySet<number>();
    ok(() => s.remove(1), false);
    ok(() => s.removeIf(() => true), false);
    ok(() => s.retainAll(new ArrayList()), false);
    s.clear();
    expectThrows(() => s.add(1), UOE);
    const m = emptyMap<number, number>();
    ok(() => m.remove(1), null);
    m.clear();
    m.replaceAll((_k, v) => v);
    m.putAll(new HashMap());
    expectThrows(() => m.remove(1, 2), UOE);
    expectThrows(() => m.putIfAbsent(1, 2), UOE);
    expectThrows(() => m.computeIfAbsent(1, () => null), UOE);
    expectThrows(() => m.merge(1, 1, (a) => a), UOE);
    expect(m.keySet()).toBe(EMPTY_SET);
  });
  it('singletonList: removeIf/replaceAll always throw, sort does nothing, the rest is lenient', () => {
    const l = singletonList(1);
    ok(() => l.remove(2), false);
    ok(() => l.removeAll(ArrayList.of(2)), false);
    ok(() => l.retainAll(ArrayList.of(1)), false);
    expectThrows(() => l.removeAll(ArrayList.of(1)), UOE);
    expectThrows(() => l.removeIf(() => false), UOE);
    expectThrows(() => l.replaceAll((x) => x), UOE);
    l.sort(null);
    l.reversed().sort(null);
    ok(() => l.reversed().remove(2), false);
    expectThrows(() => l.clear(), UOE);
    expectThrows(() => l.get(1), IOOBE);
    const it = l.listIterator();
    expectThrows(() => it.remove(), 'IllegalStateException');
    expectThrows(() => it.set(2), 'IllegalStateException');
  });
  it('singleton set: removeIf always throws, removeAll/retainAll go through the iterator', () => {
    const s = singleton(1);
    ok(() => s.remove(2), false);
    ok(() => s.removeAll(ArrayList.of(2)), false);
    ok(() => s.removeAll(new ArrayList()), false);
    ok(() => s.retainAll(ArrayList.of(1)), false);
    expectThrows(() => s.removeAll(ArrayList.of(1)), UOE);
    expectThrows(() => s.removeIf(() => false), UOE);
  });
  it('singletonMap: remove(key) is lenient, compute*/merge/replace*/remove(k, v) and entrySet().removeIf throw', () => {
    const m = singletonMap(1, 2);
    ok(() => m.remove(9), null);
    expectThrows(() => m.remove(1), UOE);
    expectThrows(() => m.remove(9, 9), UOE);
    expectThrows(() => m.replaceAll((_k, v) => v), UOE);
    expectThrows(() => m.compute(9, () => null), UOE);
    expectThrows(() => m.clear(), UOE);
    m.putAll(new HashMap());
    // the predicate is never called
    expectThrows(() => m.entrySet().removeIf(() => { throw new Error('called'); }), UOE);
  });
  it('nCopies: AbstractList defaults (validation first), reversed and subList views', () => {
    const l = nCopies(2, 'x');
    ok(() => l.remove('y'), false);
    ok(() => l.removeIf(() => false), false);
    ok(() => l.reversed().removeIf(() => false), false);
    expectThrows(() => l.replaceAll(null as any), NPE);
    expectThrows(() => l.addAll(5, new ArrayList()), IOOBE);
    expectThrows(() => l.reversed().set(5, 'y'), IOOBE);
    expectThrows(() => l.reversed().set(0, 'y'), UOE);
    expectThrows(() => l.subList(1, 1).removeFirst(), NSEE);
    expectThrows(() => l.subList(2, 1), IAE);
    const it = l.iterator();
    expectThrows(() => it.remove(), 'IllegalStateException');
    expect(l.subList(0, 1).toArray()).toEqual(['x']);
  });
  it('shuffle of a 0-1 element unmodifiable non-RandomAccess list writes nothing', () => {
    shuffle(unmodifiableList(LinkedList.of(1)), seeded(1));
    shuffle(unmodifiableList(new LinkedList<number>()), seeded(1));
    expectThrows(() => shuffle(unmodifiableList(LinkedList.of(1, 2, 3)), seeded(1)), UOE);
  });
  it('unmodifiable sequenced map views reject addAll even of nothing', () => {
    const m = unmodifiableSequencedMap(new LinkedHashMap<number, number>());
    expectThrows(() => m.sequencedKeySet().addAll(new ArrayList()), UOE);
    expectThrows(() => m.sequencedValues().addAll(new ArrayList()), UOE);
    expectThrows(() => m.sequencedEntrySet().addAll(new ArrayList()), UOE);
    expectThrows(() => m.sequencedKeySet().removeFirst(), NSEE);
  });
});

// ---- unmodifiable views

type Call = [string, (x: any) => unknown];
const collectionMutators: Call[] = [
  ['add', (c) => c.add(9)],
  ['addAll', (c) => c.addAll(ArrayList.of(9))],
  ['addAll empty', (c) => c.addAll(new ArrayList())],
  ['remove', (c) => c.remove(1)],
  ['remove absent', (c) => c.remove(42)],
  ['removeIf', (c) => c.removeIf(() => true)],
  ['removeIf none', (c) => c.removeIf(() => false)],
  ['retainAll', (c) => c.retainAll(new ArrayList())],
  ['removeAll', (c) => c.removeAll(ArrayList.of(1))],
  ['clear', (c) => c.clear()],
  ['iterator.remove', (c) => {
    const it = c.iterator();
    it.next();
    it.remove();
  }],
];
const listMutators: Call[] = [
  ...collectionMutators,
  ['add(i, e)', (l) => l.add(0, 9)],
  ['addAll(i, c)', (l) => l.addAll(0, ArrayList.of(9))],
  ['set', (l) => l.set(0, 9)],
  ['removeAt', (l) => l.removeAt(0)],
  ['replaceAll', (l) => l.replaceAll((x: unknown) => x)],
  ['sort', (l) => l.sort()],
  ['addFirst', (l) => l.addFirst(9)],
  ['addLast', (l) => l.addLast(9)],
  ['removeFirst', (l) => l.removeFirst()],
  ['removeLast', (l) => l.removeLast()],
  ['listIterator.set', (l) => {
    const it = l.listIterator();
    it.next();
    it.set(9);
  }],
  ['listIterator.add', (l) => l.listIterator().add(9)],
];
const mapMutators: Call[] = [
  ['put', (m) => m.put(9, 'z')],
  ['remove', (m) => m.remove(1)],
  ['remove(k, v)', (m) => m.remove(1, 'a')],
  ['putAll', (m) => m.putAll(HashMap.of([9, 'z']))],
  ['clear', (m) => m.clear()],
  ['replaceAll', (m) => m.replaceAll((_k: unknown, v: unknown) => v)],
  ['putIfAbsent', (m) => m.putIfAbsent(1, 'q')],
  ['replace', (m) => m.replace(1, 'q')],
  ['replace(k, o, n)', (m) => m.replace(1, 'a', 'q')],
  ['computeIfAbsent', (m) => m.computeIfAbsent(1, () => 'q')],
  ['computeIfPresent', (m) => m.computeIfPresent(1, () => 'q')],
  ['compute', (m) => m.compute(1, () => 'q')],
  ['merge', (m) => m.merge(1, 'q', () => 'q')],
  ['keySet.remove', (m) => m.keySet().remove(1)],
  ['keySet.clear', (m) => m.keySet().clear()],
  ['values.clear', (m) => m.values().clear()],
  ['values.iterator.remove', (m) => {
    const it = m.values().iterator();
    it.next();
    it.remove();
  }],
  ['entrySet.removeIf', (m) => m.entrySet().removeIf(() => true)],
  ['entry.setValue (iterator)', (m) => m.entrySet().iterator().next().setValue('q')],
  ['entry.setValue (for..of)', (m) => {
    for (const e of m.entrySet()) e.setValue('q');
  }],
  ['entry.setValue (toArray)', (m) => m.entrySet().toArray()[0].setValue('q')],
  ['entry.setValue (forEach)', (m) => m.entrySet().forEach((e: any) => e.setValue('q'))],
];

describe('unmodifiableList', () => {
  describe.each(factories)('over %s', (_n, of) => {
    it.each(listMutators)('rejects %s', (_m, call) => {
      const base = of(1, 2, 3);
      const v = unmodifiableList(base);
      expectThrows(() => call(v), UOE);
      expect(base.toArray()).toEqual([1, 2, 3]);
    });
    it.each(listMutators)('subList and reversed reject %s', (m, call) => {
      const v = unmodifiableList(of(0, 1, 2, 3, 4));
      expectThrows(() => call(v.subList(1, 4)), UOE);
      // verified on the reference: reversed() is List's default modifiable reverse view over the wrapper, so calls
      // that change nothing (and never reach the wrapper's mutators) return false
      if (m === 'addAll empty' || m === 'remove absent') expect(call(v.reversed())).toBe(false);
      else expectThrows(() => call(v.reversed()), UOE);
    });
    it('is a live read-through view', () => {
      const base = of(1, 2);
      const v = unmodifiableList(base);
      base.add(3);
      expect(v.size()).toBe(3);
      expect(v.get(2)).toBe(3);
      expect(v.toArray()).toEqual([1, 2, 3]);
      expect([...v]).toEqual([1, 2, 3]);
      expect(v.indexOf(2)).toBe(1);
      expect(v.lastIndexOf(2)).toBe(1);
      expect(v.contains(3)).toBe(true);
      expect(v.containsAll(ArrayList.of(1, 3))).toBe(true);
      expect(v.isEmpty()).toBe(false);
      expect(v.getFirst()).toBe(1);
      expect(v.getLast()).toBe(3);
      expect(v.subList(1, 3).toArray()).toEqual([2, 3]);
      expect(v.reversed().toArray()).toEqual([3, 2, 1]);
      const seen: number[] = [];
      v.forEach((x) => seen.push(x));
      expect(seen).toEqual([1, 2, 3]);
      const li = v.listIterator(3);
      expect(li.hasPrevious()).toBe(true);
      expect(li.previous()).toBe(3);
      expect(li.nextIndex()).toBe(2);
      expect(li.previousIndex()).toBe(1);
      const rest: number[] = [];
      v.iterator().forEachRemaining((x) => rest.push(x));
      expect(rest).toEqual([1, 2, 3]);
    });
    it('equals/hashCode/toString delegate', () => {
      const base = of(1, 2);
      const v = unmodifiableList(base);
      expect(v.equals(ArrayList.of(1, 2))).toBe(true);
      expect(v.equals(v)).toBe(true);
      expect(ArrayList.of(1, 2).equals(v)).toBe(true);
      expect(v.hashCode()).toBe(base.hashCode());
      expect(v.toString()).toBe('[1, 2]');
    });
    it('keeps RandomAccess of the backing list', () => expect(isRandomAccess(unmodifiableList(of(1)))).toBe(isRandomAccess(of(1))));
  });

  it('wrapping an unmodifiable list returns it', () => {
    const v = unmodifiableList(ArrayList.of(1));
    expect(unmodifiableList(v)).toBe(v);
    // verified on the reference: only its own wrapper class is returned as-is; List.of is wrapped
    const im = IList.of(1);
    expect(unmodifiableList(im)).not.toBe(im);
    expectThrows(() => IList.of().removeFirst(), UOE);
    expectThrows(() => unmodifiableList(IList.of()).removeFirst(), NSEE);
    expectThrows(() => unmodifiableList(null as any), NPE);
  });

  it('algorithms read through but cannot write', () => {
    const v = unmodifiableList(ArrayList.of(3, 1, 2));
    expect(max(v)).toBe(3);
    expect(binarySearch(unmodifiableList(LinkedList.of(1, 2, 3)), 2)).toBe(1);
    expectThrows(() => sort(v), UOE);
    expectThrows(() => reverse(v), UOE);
    expectThrows(() => reverse(unmodifiableList(LinkedList.of(1, 2))), UOE);
  });
});

describe('unmodifiableCollection / Set / SequencedCollection', () => {
  const views: [string, () => any][] = [
    ['collection', () => unmodifiableCollection(ArrayList.of(1, 2, 3))],
    ['set', () => unmodifiableSet(HashSet.of(1, 2, 3))],
    ['sequenced', () => unmodifiableSequencedCollection(LinkedList.of(1, 2, 3))],
    ['sortedSet', () => unmodifiableSortedSet(TreeSet.of(1, 2, 3))],
    ['navigableSet', () => unmodifiableNavigableSet(TreeSet.of(1, 2, 3))],
  ];
  describe.each(views)('%s', (_n, make) => {
    it.each(collectionMutators)('rejects %s', (_m, call) => {
      const v = make();
      expectThrows(() => call(v), UOE);
      expect(v.size()).toBe(3);
    });
    it('reads through', () => {
      const v = make();
      expect(v.contains(2)).toBe(true);
      expect(v.containsAll(ArrayList.of(1, 2))).toBe(true);
      expect(v.isEmpty()).toBe(false);
      expect(v.toArray().sort()).toEqual([1, 2, 3]);
      expect([...v].sort()).toEqual([1, 2, 3]);
      const seen: number[] = [];
      v.forEach((x: number) => seen.push(x));
      expect(seen.sort()).toEqual([1, 2, 3]);
      expect(v.toString()).toMatch(/^\[\d, \d, \d\]$/);
    });
  });

  it('collection is live and uses identity equality', () => {
    const base = ArrayList.of(1);
    const v = unmodifiableCollection(base);
    base.add(2);
    expect(v.size()).toBe(2);
    expect(v.equals(ArrayList.of(1, 2))).toBe(false);
    expect(v.equals(v)).toBe(true);
    expect(unmodifiableCollection(v)).toBe(v);
    expectThrows(() => unmodifiableCollection(null as any), NPE);
  });

  it('set uses value equality and is live', () => {
    const base = HashSet.of(1);
    const v = unmodifiableSet(base);
    base.add(2);
    expect(v.equals(HashSet.of(1, 2))).toBe(true);
    expect(HashSet.of(1, 2).equals(v)).toBe(true);
    expect(v.hashCode()).toBe(HashSet.of(1, 2).hashCode());
    expect(unmodifiableSet(v)).toBe(v);
    // verified on the reference: Set.of and emptySet() are wrapped, and the wrapper rejects every mutator
    const im = ISet.of(1);
    expect(unmodifiableSet(im)).not.toBe(im);
    expect(emptySet().remove(1)).toBe(false);
    expectThrows(() => unmodifiableSet(emptySet()).remove(1), UOE);
  });

  it('sequenced collection', () => {
    const v = unmodifiableSequencedCollection(LinkedList.of(1, 2, 3));
    expect(v.getFirst()).toBe(1);
    expect(v.getLast()).toBe(3);
    expect(v.reversed().toArray()).toEqual([3, 2, 1]);
    for (const f of [() => v.addFirst(0), () => v.addLast(0), () => v.removeFirst(), () => v.removeLast(), () => v.reversed().clear()]) expectThrows(f, UOE);
    expect(unmodifiableSequencedCollection(v)).toBe(v);
  });

  it('navigable set navigation and sub-views', () => {
    const base = TreeSet.of(1, 3, 5, 7);
    const v = unmodifiableNavigableSet(base);
    expect(v.comparator()).toBeNull();
    expect([v.first(), v.last(), v.getFirst(), v.getLast()]).toEqual([1, 7, 1, 7]);
    expect([v.lower(3), v.floor(3), v.ceiling(4), v.higher(5)]).toEqual([1, 3, 5, 7]);
    expect(v.headSet(5).toArray()).toEqual([1, 3]);
    expect(v.headSet(5, true).toArray()).toEqual([1, 3, 5]);
    expect(v.tailSet(5).toArray()).toEqual([5, 7]);
    expect(v.tailSet(5, false).toArray()).toEqual([7]);
    expect(v.subSet(1, 5).toArray()).toEqual([1, 3]);
    expect(v.subSet(1, false, 5, true).toArray()).toEqual([3, 5]);
    expect(v.descendingSet().toArray()).toEqual([7, 5, 3, 1]);
    expect(v.reversed().toArray()).toEqual([7, 5, 3, 1]);
    const d = v.descendingIterator();
    expect(d.next()).toBe(7);
    expectThrows(() => d.remove(), UOE);
    for (const f of [
      () => v.pollFirst(),
      () => v.pollLast(),
      () => v.addFirst(0),
      () => v.addLast(0),
      () => v.removeFirst(),
      () => v.removeLast(),
      () => v.headSet(5).clear(),
      () => v.tailSet(5, true).add(6),
      () => v.subSet(1, 5).remove(1),
      () => v.descendingSet().clear(),
      () => v.reversed().pollFirst(),
    ]) {
      expectThrows(f, UOE);
    }
    base.add(4);
    expect(v.headSet(5).toArray()).toEqual([1, 3, 4]);
    expect(unmodifiableNavigableSet(v)).toBe(v);
    expect(unmodifiableSortedSet(v)).toBe(v);
  });
});

describe('unmodifiableMap / SortedMap / NavigableMap', () => {
  const maps: [string, () => any][] = [
    ['map', () => unmodifiableMap(HashMap.of([1, 'a'], [2, 'b']))],
    ['sortedMap', () => unmodifiableSortedMap(new TreeMap(HashMap.of([1, 'a'], [2, 'b'])))],
    ['navigableMap', () => unmodifiableNavigableMap(new TreeMap(HashMap.of([1, 'a'], [2, 'b'])))],
  ];
  describe.each(maps)('%s', (_n, make) => {
    it.each(mapMutators)('rejects %s', (_m, call) => {
      const m = make();
      expectThrows(() => call(m), UOE);
      expect(m.size()).toBe(2);
      expect(m.get(1)).toBe('a');
    });
    it('reads through', () => {
      const m = make();
      expect(m.isEmpty()).toBe(false);
      expect(m.containsKey(1)).toBe(true);
      expect(m.containsValue('b')).toBe(true);
      expect(m.getOrDefault(3, 'd')).toBe('d');
      expect(m.keySet().toArray().sort()).toEqual([1, 2]);
      expect(m.values().toArray().sort()).toEqual(['a', 'b']);
      expect(m.entrySet().size()).toBe(2);
      expect(m.entrySet().contains(new SimpleEntry(1, 'a'))).toBe(true);
      expect(m.entrySet().toArray().map(String).sort()).toEqual(['1=a', '2=b']);
      expect([...m.entrySet()].map((e: any) => e.getKey()).sort()).toEqual([1, 2]);
      expect([...m].sort()).toEqual([[1, 'a'], [2, 'b']]);
      const seen: string[] = [];
      m.forEach((k: number, v: string) => seen.push(`${k}${v}`));
      expect(seen.sort()).toEqual(['1a', '2b']);
      expect(m.equals(HashMap.of([1, 'a'], [2, 'b']))).toBe(true);
      expect(m.equals(m)).toBe(true);
      expect(m.hashCode()).toBe(HashMap.of([1, 'a'], [2, 'b']).hashCode());
      expect(m.toString()).toBe('{1=a, 2=b}');
      expect(m.entrySet().toString()).toBe('[1=a, 2=b]');
      const e = m.entrySet().iterator().next();
      expect(e.equals(new SimpleEntry(e.getKey(), e.getValue()))).toBe(true);
      expect(e.hashCode()).toBe(new SimpleEntry(e.getKey(), e.getValue()).hashCode());
      expect(e.toString()).toMatch(/^\d=[ab]$/);
    });
  });

  it('map is live and wrapping is idempotent', () => {
    const base = HashMap.of([1, 'a']);
    const m = unmodifiableMap(base);
    base.put(2, 'b');
    expect(m.size()).toBe(2);
    expect(m.keySet().contains(2)).toBe(true);
    base.put(1, 'z');
    expect(m.entrySet().iterator().next().getValue()).toBe(base.get(m.entrySet().iterator().next().getKey()));
    expect(unmodifiableMap(m)).toBe(m);
    expect(m.keySet()).toBe(m.keySet());
    // verified on the reference: Map.of and emptyMap() are wrapped, and the wrapper rejects every mutator
    const im = IMap.of(1, 'a');
    expect(unmodifiableMap(im)).not.toBe(im);
    emptyMap().clear();
    expectThrows(() => unmodifiableMap(emptyMap()).clear(), UOE);
    expectThrows(() => unmodifiableMap(null as any), NPE);
  });

  it('navigable map navigation and sub-views', () => {
    const base = new TreeMap<number, string>();
    for (const k of [1, 3, 5, 7]) base.put(k, String(k));
    const m = unmodifiableNavigableMap(base);
    expect(m.comparator()).toBeNull();
    expect([m.firstKey(), m.lastKey()]).toEqual([1, 7]);
    expect(String(m.firstEntry())).toBe('1=1');
    expect(String(m.lastEntry())).toBe('7=7');
    expect(String(m.lowerEntry(3))).toBe('1=1');
    expect(String(m.floorEntry(4))).toBe('3=3');
    expect(String(m.ceilingEntry(4))).toBe('5=5');
    expect(String(m.higherEntry(5))).toBe('7=7');
    expect(m.higherEntry(7)).toBeNull();
    expect([m.lowerKey(3), m.floorKey(3), m.ceilingKey(4), m.higherKey(5)]).toEqual([1, 3, 5, 7]);
    expect(m.headMap(5).toString()).toBe('{1=1, 3=3}');
    expect(m.headMap(5, true).toString()).toBe('{1=1, 3=3, 5=5}');
    expect(m.tailMap(5).toString()).toBe('{5=5, 7=7}');
    expect(m.tailMap(5, false).toString()).toBe('{7=7}');
    expect(m.subMap(1, 5).toString()).toBe('{1=1, 3=3}');
    expect(m.subMap(1, false, 5, true).toString()).toBe('{3=3, 5=5}');
    expect(m.descendingMap().toString()).toBe('{7=7, 5=5, 3=3, 1=1}');
    expect(m.reversed().firstKey()).toBe(7);
    expect(m.navigableKeySet().toArray()).toEqual([1, 3, 5, 7]);
    expect(m.descendingKeySet().toArray()).toEqual([7, 5, 3, 1]);
    expect(m.sequencedKeySet().getFirst()).toBe(1);
    expect(m.sequencedValues().getLast()).toBe('7');
    const es = m.sequencedEntrySet();
    expect(String(es.getFirst())).toBe('1=1');
    expect(String(es.getLast())).toBe('7=7');
    expect(String(es.reversed().getFirst())).toBe('7=7');
    for (const f of [
      () => m.pollFirstEntry(),
      () => m.pollLastEntry(),
      () => m.putFirst(0, '0'),
      () => m.putLast(9, '9'),
      () => m.firstEntry()!.setValue('x'),
      () => m.headMap(5).put(2, '2'),
      () => m.tailMap(5, true).clear(),
      () => m.subMap(1, 5).remove(1),
      () => m.descendingMap().put(4, '4'),
      () => m.navigableKeySet().pollFirst(),
      () => m.descendingKeySet().remove(1),
      () => m.sequencedKeySet().removeFirst(),
      () => m.sequencedValues().removeLast(),
      () => es.removeFirst(),
      () => es.addLast(es.getFirst()),
      () => es.getFirst().setValue('x'),
    ]) {
      expectThrows(f, UOE);
    }
    base.put(4, '4');
    expect(m.headMap(5).size()).toBe(3);
    expect(unmodifiableNavigableMap(m)).toBe(m);
    // like the reference, a navigable-map wrapper is wrapped again as a sorted map (pollFirstEntry differs)
    expect(unmodifiableSortedMap(m)).not.toBe(m);
    expect(base.size()).toBe(5);
  });
});

describe('Collections object', () => {
  it('exposes every function', () => {
    for (const [k, f] of Object.entries(Collections)) if (!k.startsWith('EMPTY_')) expect(typeof f).toBe('function');
    expect(Collections.sort).toBe(sort);
    expect(Object.keys(Collections).length).toBeGreaterThanOrEqual(33);
  });
});
