import {
  AbstractSet,
  ArrayDeque,
  ArrayList,
  Collections,
  ConcurrentModificationException,
  HashMap,
  HashSet,
  IdentityHashMap,
  IllegalStateException,
  LinkedHashMap,
  LinkedHashSet,
  LinkedList,
  List,
  Map,
  PriorityQueue,
  Set,
  Stack,
  TreeMap,
  TreeSet,
  Vector,
} from '../../src';
import type { Collection, MapEntry } from '../../src';
import { Spliterator } from '../../src/stream/Spliterator';

// characteristic shorthands
const D = Spliterator.DISTINCT;
const S = Spliterator.SORTED;
const O = Spliterator.ORDERED;
const Z = Spliterator.SIZED;
const N = Spliterator.NONNULL;
const I = Spliterator.IMMUTABLE;
const U = Spliterator.SUBSIZED;

const NAMES: [number, string][] = [
  [D, 'DISTINCT'],
  [S, 'SORTED'],
  [O, 'ORDERED'],
  [Z, 'SIZED'],
  [N, 'NONNULL'],
  [I, 'IMMUTABLE'],
  [Spliterator.CONCURRENT, 'CONCURRENT'],
  [U, 'SUBSIZED'],
];
const names = (c: number) =>
  NAMES.filter(([v]) => (c & v) !== 0)
    .map(([, n]) => n)
    .join('|');

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const desc = (a: number, b: number) => b - a;

type Source = Collection<unknown>;

function hm(n: number) {
  const m = new HashMap<number, number>();
  for (const i of range(n)) m.put(i, i);
  return m;
}
function lhm(n: number) {
  const m = new LinkedHashMap<number, number>();
  for (const i of range(n)) m.put(i, i);
  return m;
}
function tm(n: number, cmp: ((a: number, b: number) => number) | null = null) {
  const m = new TreeMap<number, number>(cmp);
  for (const i of range(n)) m.put(i, i);
  return m;
}
function ihm(n: number) {
  const m = new IdentityHashMap<number, number>();
  for (const i of range(n)) m.put(i, i);
  return m;
}
const ts = (n: number) => TreeSet.of(...range(n));
const pq = (n: number) => {
  const q = new PriorityQueue<number>();
  for (const i of range(n)) q.add(n - i);
  return q;
};

/**
 * Every collection type, with the characteristics the reference reports for it (captured from the
 * reference implementation) and, for SORTED ones, what getComparator() should be.
 * Range views report unknown size: estimateSize() Infinity, getExactSizeIfKnown() -1.
 */
const TABLE: { name: string; make: (n: number) => Source; chars: number; comparator?: 'null' | 'nonnull' }[] = [
  { name: 'ArrayList', make: (n) => ArrayList.of(...range(n)), chars: O | Z | U },
  { name: 'ArrayList.subList', make: (n) => ArrayList.of(-1, ...range(n), -1).subList(1, n + 1), chars: O | Z | U },
  { name: 'ArrayList.reversed', make: (n) => ArrayList.of(...range(n)).reversed(), chars: O | Z | U },
  { name: 'Vector', make: (n) => Vector.of(...range(n)), chars: O | Z | U },
  { name: 'Vector.subList', make: (n) => Vector.of(-1, ...range(n)).subList(1, n + 1), chars: O | Z | U },
  { name: 'Stack', make: (n) => Stack.of(...range(n)), chars: O | Z | U },
  { name: 'LinkedList', make: (n) => LinkedList.of(...range(n)), chars: O | Z | U },
  { name: 'LinkedList.reversed', make: (n) => LinkedList.of(...range(n)).reversed(), chars: O | Z | U },
  { name: 'LinkedList.subList', make: (n) => LinkedList.of(-1, ...range(n)).subList(1, n + 1), chars: O | Z | U },
  { name: 'ArrayDeque', make: (n) => ArrayDeque.of(...range(n)), chars: O | Z | N | U },
  { name: 'ArrayDeque.reversed', make: (n) => ArrayDeque.of(...range(n)).reversed(), chars: O | Z | U },
  { name: 'PriorityQueue', make: pq, chars: Z | N | U },
  { name: 'HashSet', make: (n) => HashSet.of(...range(n)), chars: D | Z },
  { name: 'LinkedHashSet', make: (n) => new LinkedHashSet(ArrayList.of(...range(n))), chars: D | O | Z | U },
  { name: 'LinkedHashSet.reversed', make: (n) => new LinkedHashSet(ArrayList.of(...range(n))).reversed(), chars: D | Z | U },
  { name: 'TreeSet', make: ts, chars: D | S | O | Z, comparator: 'null' },
  {
    name: 'TreeSet(comparator)',
    make: (n) => {
      const s = new TreeSet<number>(desc);
      for (const i of range(n)) s.add(i);
      return s;
    },
    chars: D | S | O | Z,
    comparator: 'nonnull',
  },
  { name: 'TreeSet.descendingSet', make: (n) => ts(n).descendingSet(), chars: D | O | Z },
  { name: 'TreeSet.reversed', make: (n) => ts(n).reversed(), chars: D | O | Z },
  { name: 'TreeSet.subSet', make: (n) => TreeSet.of(-1, ...range(n), n).subSet(0, true, n, false), chars: D | S | O, comparator: 'null' },
  { name: 'TreeSet.headSet', make: (n) => TreeSet.of(...range(n), n).headSet(n), chars: D | S | O, comparator: 'null' },
  { name: 'TreeSet.subSet.descendingSet', make: (n) => TreeSet.of(-1, ...range(n), n).subSet(0, true, n, false).descendingSet(), chars: D | O },
  { name: 'HashMap.keySet', make: (n) => hm(n).keySet(), chars: D | Z },
  { name: 'HashMap.values', make: (n) => hm(n).values(), chars: Z },
  { name: 'HashMap.entrySet', make: (n) => hm(n).entrySet(), chars: D | Z },
  { name: 'LinkedHashMap.keySet', make: (n) => lhm(n).keySet(), chars: D | O | Z | U },
  { name: 'LinkedHashMap.values', make: (n) => lhm(n).values(), chars: O | Z | U },
  { name: 'LinkedHashMap.entrySet', make: (n) => lhm(n).entrySet(), chars: D | O | Z | U },
  { name: 'LinkedHashMap.reversed.keySet', make: (n) => lhm(n).reversed().keySet(), chars: D | O | Z | U },
  { name: 'LinkedHashMap.reversed.values', make: (n) => lhm(n).reversed().values(), chars: O | Z | U },
  { name: 'LinkedHashMap.reversed.entrySet', make: (n) => lhm(n).reversed().entrySet(), chars: D | O | Z | U },
  { name: 'LinkedHashMap.sequencedKeySet.reversed', make: (n) => lhm(n).sequencedKeySet().reversed(), chars: D | O | Z | U },
  { name: 'TreeMap.keySet', make: (n) => tm(n).keySet(), chars: D | S | O | Z, comparator: 'null' },
  { name: 'TreeMap.navigableKeySet', make: (n) => tm(n).navigableKeySet(), chars: D | S | O | Z, comparator: 'null' },
  { name: 'TreeMap.values', make: (n) => tm(n).values(), chars: O | Z },
  { name: 'TreeMap.entrySet', make: (n) => tm(n).entrySet(), chars: D | S | O | Z, comparator: 'nonnull' },
  { name: 'TreeMap(comparator).entrySet', make: (n) => tm(n, desc).entrySet(), chars: D | S | O | Z, comparator: 'nonnull' },
  { name: 'TreeMap(comparator).keySet', make: (n) => tm(n, desc).keySet(), chars: D | S | O | Z, comparator: 'nonnull' },
  { name: 'TreeMap.descendingKeySet', make: (n) => tm(n).descendingKeySet(), chars: D | O | Z },
  { name: 'TreeMap.descendingMap.keySet', make: (n) => tm(n).descendingMap().keySet(), chars: D | O | Z },
  { name: 'TreeMap.descendingMap.values', make: (n) => tm(n).descendingMap().values(), chars: Z | U },
  { name: 'TreeMap.descendingMap.entrySet', make: (n) => tm(n).descendingMap().entrySet(), chars: D | Z | U },
  { name: 'TreeMap.reversed.keySet', make: (n) => tm(n).reversed().keySet(), chars: D | O | Z },
  { name: 'TreeMap.subMap.keySet', make: (n) => tm(n + 1).subMap(0, true, n, false).keySet(), chars: D | S | O, comparator: 'null' },
  { name: 'TreeMap.subMap.values', make: (n) => tm(n + 1).subMap(0, true, n, false).values(), chars: Z | U },
  { name: 'TreeMap.subMap.entrySet', make: (n) => tm(n + 1).subMap(0, true, n, false).entrySet(), chars: D | Z | U },
  { name: 'TreeMap.subMap.descendingMap.keySet', make: (n) => tm(n + 1).subMap(0, true, n, false).descendingMap().keySet(), chars: D | O },
  { name: 'TreeMap.subMap.descendingMap.entrySet', make: (n) => tm(n + 1).subMap(0, true, n, false).descendingMap().entrySet(), chars: D | Z | U },
  { name: 'IdentityHashMap.keySet', make: (n) => ihm(n).keySet(), chars: D | Z },
  { name: 'IdentityHashMap.values', make: (n) => ihm(n).values(), chars: Z },
  { name: 'IdentityHashMap.entrySet', make: (n) => ihm(n).entrySet(), chars: D | Z },
  { name: 'List.of', make: (n) => List.of(...range(n)), chars: O | Z | U },
  { name: 'List.of.subList', make: (n) => List.of(-1, ...range(n)).subList(1, n + 1), chars: O | Z | U },
  { name: 'List.of.reversed', make: (n) => List.of(...range(n)).reversed(), chars: O | Z | U },
  { name: 'List.copyOf', make: (n) => List.copyOf(ArrayList.of(...range(n))), chars: O | Z | U },
  { name: 'Set.of', make: (n) => Set.of(...range(n)), chars: D | Z | U },
  { name: 'Map.of.keySet', make: (n) => Map.ofEntries(...range(n).map((i) => Map.entry(i, i))).keySet(), chars: D | Z | U },
  { name: 'Map.of.values', make: (n) => Map.ofEntries(...range(n).map((i) => Map.entry(i, i))).values(), chars: Z | U },
  { name: 'Map.of.entrySet', make: (n) => Map.ofEntries(...range(n).map((i) => Map.entry(i, i))).entrySet(), chars: D | Z | U },
  { name: 'unmodifiableCollection(ArrayList)', make: (n) => Collections.unmodifiableCollection(ArrayList.of(...range(n))), chars: O | Z | U },
  { name: 'unmodifiableCollection(ArrayDeque)', make: (n) => Collections.unmodifiableCollection(ArrayDeque.of(...range(n))), chars: O | Z | N | U },
  { name: 'unmodifiableList(ArrayList)', make: (n) => Collections.unmodifiableList(ArrayList.of(...range(n))), chars: O | Z | U },
  { name: 'unmodifiableList(LinkedList)', make: (n) => Collections.unmodifiableList(LinkedList.of(...range(n))), chars: O | Z | U },
  { name: 'unmodifiableSet(TreeSet)', make: (n) => Collections.unmodifiableSet(ts(n)), chars: D | S | O | Z, comparator: 'null' },
  { name: 'unmodifiableNavigableSet(TreeSet)', make: (n) => Collections.unmodifiableNavigableSet(ts(n)), chars: D | S | O | Z, comparator: 'null' },
  { name: 'unmodifiableMap(HashMap).keySet', make: (n) => Collections.unmodifiableMap(hm(n)).keySet(), chars: D | Z },
  { name: 'unmodifiableMap(HashMap).values', make: (n) => Collections.unmodifiableMap(hm(n)).values(), chars: Z },
  { name: 'unmodifiableMap(HashMap).entrySet', make: (n) => Collections.unmodifiableMap(hm(n)).entrySet(), chars: D | Z },
  { name: 'unmodifiableSortedMap(TreeMap).entrySet', make: (n) => Collections.unmodifiableSortedMap(tm(n)).entrySet(), chars: D | S | O | Z, comparator: 'nonnull' },
  { name: 'synchronizedList(ArrayList)', make: (n) => Collections.synchronizedList(ArrayList.of(...range(n))), chars: O | Z | U },
  { name: 'synchronizedSet(HashSet)', make: (n) => Collections.synchronizedSet(HashSet.of(...range(n))), chars: D | Z },
  { name: 'synchronizedMap(HashMap).entrySet', make: (n) => Collections.synchronizedMap(hm(n)).entrySet(), chars: D | Z },
  { name: 'checkedList(ArrayList)', make: (n) => Collections.checkedList(ArrayList.of(...range(n)), (x) => typeof x === 'number'), chars: O | Z | U },
  { name: 'checkedSet(HashSet)', make: (n) => Collections.checkedSet(HashSet.of(...range(n)), (x) => typeof x === 'number'), chars: D | Z },
  {
    name: 'checkedMap(HashMap).entrySet',
    make: (n) => Collections.checkedMap(hm(n), (x) => typeof x === 'number', (x) => typeof x === 'number').entrySet(),
    chars: D | Z | U,
  },
  { name: 'nCopies', make: (n) => Collections.nCopies(n, 7), chars: O | Z | U },
  { name: 'asLifoQueue(ArrayDeque)', make: (n) => Collections.asLifoQueue(ArrayDeque.of(...range(n))), chars: O | Z | N | U },
  {
    name: 'newSetFromMap(HashMap)',
    make: (n) => {
      const s = Collections.newSetFromMap(new HashMap<number, boolean>());
      for (const i of range(n)) s.add(i);
      return s;
    },
    chars: D | Z,
  },
];

/** Splits recursively (prefix first), then traverses the leaves alternating tryAdvance and forEachRemaining. */
function drain<T>(s: Spliterator<T>, out: T[], depth = 0): void {
  const before = s.estimateSize();
  const prefix = depth < 12 ? s.trySplit() : null;
  if (prefix !== null) {
    // estimates never grow by splitting; SUBSIZED pieces add up exactly (plain checks: matchers per node are slow)
    if (s.estimateSize() > before || prefix.estimateSize() > before) throw new Error(`estimate grew past ${before}`);
    if (s.hasCharacteristics(U) && before !== Infinity && prefix.getExactSizeIfKnown() + s.getExactSizeIfKnown() !== before) {
      throw new Error(`SUBSIZED pieces do not add up to ${before}`);
    }
    drain(prefix, out, depth + 1);
    drain(s, out, depth + 1);
    return;
  }
  if (depth % 2 === 0) {
    // plain comparison per step (a jest matcher per element is far too slow), asserted once
    let last = s.estimateSize();
    let monotonic = true;
    while (s.tryAdvance((t) => out.push(t))) {
      const e = s.estimateSize();
      if (e > last) monotonic = false;
      last = e;
    }
    if (!monotonic) throw new Error('estimateSize grew during traversal');
  } else {
    s.forEachRemaining((t) => out.push(t));
  }
  if (s.tryAdvance(() => out.push(undefined as T))) throw new Error('tryAdvance after the end');
}

function iterated<T>(c: Collection<T>): T[] {
  const out: T[] = [];
  const it = c.iterator();
  while (it.hasNext()) out.push(it.next());
  return out;
}

const key = (x: unknown) => (x !== null && typeof (x as MapEntry<unknown, unknown>).getKey === 'function' ? `${(x as MapEntry<unknown, unknown>).getKey()}=${(x as MapEntry<unknown, unknown>).getValue()}` : String(x));

describe.each(TABLE)('$name spliterator', ({ make, chars, comparator }) => {
  it(`reports ${names(chars)}`, () => {
    const s = make(10).spliterator();
    expect(names(s.characteristics())).toBe(names(chars));
    expect(s.hasCharacteristics(chars)).toBe(true);
    if (chars & Z) {
      expect(s.estimateSize()).toBe(10);
      expect(s.getExactSizeIfKnown()).toBe(10);
    } else {
      expect(s.getExactSizeIfKnown()).toBe(-1);
      expect(s.estimateSize()).toBeGreaterThanOrEqual(10);
    }
  });

  it('getComparator(): the source comparator if SORTED, else IllegalStateException', () => {
    const s = make(3).spliterator();
    if (comparator === undefined) {
      expect(() => s.getComparator()).toThrow(IllegalStateException);
    } else if (comparator === 'null') {
      expect(s.getComparator()).toBeNull();
    } else {
      const cmp = s.getComparator()!;
      expect(typeof cmp).toBe('function');
      // the reported order is the traversal order
      const xs: unknown[] = [];
      s.forEachRemaining((x) => xs.push(x));
      expect(cmp(xs[0], xs[1])).toBeLessThan(0);
      expect(cmp(xs[1], xs[0])).toBeGreaterThan(0);
      expect(cmp(xs[1], xs[1])).toBe(0);
    }
  });

  it.each([0, 1, 2, 10, 3000])('covers %i elements exactly once across all split pieces, in order', (n) => {
    const c = make(n);
    const out: unknown[] = [];
    drain(c.spliterator(), out);
    const expected = iterated(c);
    expect(out.length).toBe(n);
    const got = out.map(key);
    const want = expected.map(key);
    if (!(chars & O)) {
      got.sort();
      want.sort();
    }
    expect(got.join()).toBe(want.join());
  });

  it('tryAdvance and forEachRemaining mix and stop at the end', () => {
    const c = make(5);
    const s = c.spliterator();
    const out: unknown[] = [];
    expect(s.tryAdvance((x) => out.push(x))).toBe(true);
    s.forEachRemaining((x) => out.push(x));
    expect(s.tryAdvance(() => out.push('extra'))).toBe(false);
    s.forEachRemaining(() => out.push('extra'));
    expect(out.map(key).sort()).toEqual(iterated(c).map(key).sort());
    // indexed spliterators count down to 0; iterator- and hash-backed ones keep their estimate, as in the reference
    if (chars & Z) expect([0, 5]).toContain(s.estimateSize());
  });

  it('rejects a null action', () => {
    const s = make(2).spliterator();
    expect(() => s.tryAdvance(null as never)).toThrow();
    expect(() => s.forEachRemaining(null as never)).toThrow();
  });
});

describe('late binding', () => {
  const lateBound: [string, () => Collection<number>, (c: Collection<number>) => void][] = [
    ['ArrayList', () => new ArrayList<number>(), (c) => c.add(1)],
    ['ArrayList.subList', () => ArrayList.of(0, 1, 2).subList(0, 3), (c) => c.add(3)],
    ['Vector', () => new Vector<number>(), (c) => c.add(1)],
    ['LinkedList', () => new LinkedList<number>(), (c) => c.add(1)],
    ['LinkedList.reversed', () => new LinkedList<number>().reversed(), (c) => c.add(1)],
    ['ArrayDeque', () => new ArrayDeque<number>(), (c) => c.add(1)],
    ['ArrayDeque.reversed', () => new ArrayDeque<number>().reversed(), (c) => c.add(1)],
    ['PriorityQueue', () => new PriorityQueue<number>(), (c) => c.add(1)],
    ['HashSet', () => new HashSet<number>(), (c) => c.add(1)],
    ['LinkedHashSet', () => new LinkedHashSet<number>(), (c) => c.add(1)],
    ['TreeSet', () => new TreeSet<number>(), (c) => c.add(1)],
    ['TreeSet.headSet', () => new TreeSet<number>().headSet(10), (c) => c.add(1)],
  ];
  it.each(lateBound)('%s sees elements added after spliterator() but before first use', (_, make, add) => {
    const c = make();
    const s = c.spliterator();
    add(c);
    add(c);
    const out: number[] = [];
    s.forEachRemaining((x) => out.push(x));
    expect(out.length).toBe(c.size());
    expect(out.length).toBeGreaterThan(0);
  });

  it('map views bind late too', () => {
    const m = new HashMap<number, number>();
    const tmap = new TreeMap<number, number>();
    const l = new LinkedHashMap<number, number>();
    const ih = new IdentityHashMap<number, number>();
    const ss = [m.keySet(), m.values(), m.entrySet(), tmap.keySet(), tmap.values(), tmap.entrySet(), l.keySet(), ih.entrySet()].map((v) =>
      (v as Collection<unknown>).spliterator()
    );
    for (const x of [m, tmap, l, ih]) x.put(1, 1);
    for (const s of ss) {
      expect(s.estimateSize()).toBe(1);
      let n = 0;
      s.forEachRemaining(() => n++);
      expect(n).toBe(1);
    }
  });
});

describe('fail-fast', () => {
  const failFast: [string, () => Collection<number>, (c: Collection<number>) => void][] = [
    ['ArrayList', () => ArrayList.of(1, 2, 3), (c) => c.add(9)],
    ['ArrayList (shrinking)', () => ArrayList.of(1, 2, 3), (c) => c.clear()],
    ['ArrayList.subList', () => ArrayList.of(1, 2, 3, 4).subList(0, 3), (c) => c.add(9)],
    ['Vector', () => Vector.of(1, 2, 3), (c) => c.add(9)],
    ['LinkedList', () => LinkedList.of(1, 2, 3), (c) => c.add(9)],
    ['PriorityQueue', () => pq(3), (c) => c.add(9)],
    ['HashSet', () => HashSet.of(1, 2, 3), (c) => c.add(9)],
    ['TreeSet', () => TreeSet.of(1, 2, 3), (c) => c.add(9)],
  ];

  it.each(failFast)('%s: forEachRemaining throws ConcurrentModificationException after a structural change', (_, make, mutate) => {
    const c = make();
    const s = c.spliterator();
    let first = true;
    expect(() =>
      s.forEachRemaining(() => {
        if (first) mutate(c);
        first = false;
      })
    ).toThrow(ConcurrentModificationException);
  });

  it.each(failFast)('%s: tryAdvance throws ConcurrentModificationException when its action modifies the source', (_, make, mutate) => {
    const c = make();
    const s = c.spliterator();
    expect(() => s.tryAdvance(() => mutate(c))).toThrow(ConcurrentModificationException);
  });

  it('a change on the last element is still detected (checked after the loop)', () => {
    for (const make of [() => ArrayList.of(1), () => LinkedList.of(1), () => pq(1), () => HashSet.of(1), () => TreeSet.of(1)]) {
      const c: Collection<number> = make();
      expect(() => c.spliterator().forEachRemaining(() => c.add(5))).toThrow(ConcurrentModificationException);
    }
    const m = hm(1);
    expect(() => m.keySet().spliterator().forEachRemaining(() => m.put(5, 5))).toThrow(ConcurrentModificationException);
    const t = tm(1);
    expect(() => t.entrySet().spliterator().forEachRemaining(() => t.put(5, 5))).toThrow(ConcurrentModificationException);
    const ih = ihm(1);
    expect(() => ih.values().spliterator().forEachRemaining(() => ih.put(5, 5))).toThrow(ConcurrentModificationException);
  });

  it('tryAdvance after the source shrank between calls throws instead of reading past the end', () => {
    const l = ArrayList.of(1, 2, 3);
    const s = l.spliterator();
    expect(s.tryAdvance(() => undefined)).toBe(true);
    l.clear();
    expect(() => s.tryAdvance(() => undefined)).toThrow(ConcurrentModificationException);
  });

  it('a split-off piece of a list is fail-fast against the source too', () => {
    const l = ArrayList.of(...range(10));
    const s = l.spliterator();
    const p = s.trySplit()!;
    l.add(99);
    expect(() => p.forEachRemaining(() => undefined)).toThrow(ConcurrentModificationException);
    const r = ArrayList.of(...range(10)).reversed();
    const rs = r.spliterator();
    r.add(5);
    expect(rs.estimateSize()).toBe(11);
  });

  it('ArrayDeque: a growing buffer is never read stale', () => {
    const d = ArrayDeque.of(...range(7));
    const seen: number[] = [];
    expect(() =>
      d.spliterator().forEachRemaining((x) => {
        seen.push(x);
        for (let i = 0; i < 20; i++) d.addFirst(-i);
      })
    ).toThrow(ConcurrentModificationException);
    expect(seen).toEqual([0]);
  });
});

describe('implementation details', () => {
  it('array-backed spliterators split in halves', () => {
    for (const c of [ArrayList.of(...range(10)), ArrayDeque.of(...range(10)), pq(10), List.of(...range(10))] as Collection<number>[]) {
      const s = c.spliterator();
      const p = s.trySplit()!;
      expect(p.estimateSize()).toBe(5);
      expect(s.estimateSize()).toBe(5);
      expect(names(p.characteristics())).toBe(names(s.characteristics()));
    }
  });

  it('ArrayDeque splits across the wrap-around point', () => {
    const d = new ArrayDeque<number>(8);
    for (const i of range(6)) d.addLast(i);
    for (const i of range(6)) d.addFirst(-1 - i);
    const out: number[] = [];
    drain(d.spliterator(), out);
    expect(out).toEqual(iterated(d));
  });

  it('iterator-backed spliterators split off batches of 1024, 2048, ...', () => {
    const l = LinkedList.of(...range(5000));
    const s = l.spliterator();
    expect(s.trySplit()!.estimateSize()).toBe(1024);
    expect(s.trySplit()!.estimateSize()).toBe(2048);
    expect(s.estimateSize()).toBe(5000 - 3072);
    const rest = s.trySplit()!;
    expect(rest.estimateSize()).toBe(1928);
    expect(s.trySplit()).toBeNull();
    expect(s.estimateSize()).toBe(0);
  });

  it('hash and tree spliterators stop reporting SIZED once split; pieces keep the comparator', () => {
    const h = HashSet.of(...range(3000)).spliterator();
    expect(h.hasCharacteristics(Z)).toBe(true);
    const hp = h.trySplit()!;
    expect(names(h.characteristics())).toBe('DISTINCT');
    expect(names(hp.characteristics())).toBe('DISTINCT');
    expect(hp.getExactSizeIfKnown()).toBe(-1);

    const t = tm(3000, desc).keySet().spliterator();
    const tp = t.trySplit()!;
    expect(names(t.characteristics())).toBe('DISTINCT|SORTED|ORDERED');
    expect(names(tp.characteristics())).toBe('DISTINCT|SORTED|ORDERED');
    expect(tp.getComparator()).toBe(desc);
    expect(t.getComparator()).toBe(desc);

    const v = hm(3000).values().spliterator();
    v.trySplit();
    expect(v.characteristics()).toBe(0);
  });

  it('TreeMap entry comparator orders entries by key', () => {
    const cmp = tm(3).entrySet().spliterator().getComparator()!;
    expect(cmp(Map.entry(1, 9), Map.entry(2, 0))).toBeLessThan(0);
    const rcmp = tm(3, desc).entrySet().spliterator().getComparator()!;
    expect(rcmp(Map.entry(1, 9), Map.entry(2, 0))).toBeGreaterThan(0);
  });

  it('unmodifiable entry set spliterators hand out read-only entries, also after a split', () => {
    const es = Collections.unmodifiableMap(hm(3000)).entrySet();
    const s = es.spliterator();
    const p = s.trySplit()!;
    p.tryAdvance((e) => expect(() => e.setValue(1)).toThrow());
    const est = s.estimateSize();
    s.forEachRemaining((e) => expect(() => e.setValue(1)).toThrow());
    expect(s.estimateSize()).toBe(est);
    expect(s.getExactSizeIfKnown()).toBe(-1);
    expect(s.hasCharacteristics(D)).toBe(true);
    expect(() => s.getComparator()).toThrow(IllegalStateException);
    const t = Collections.unmodifiableSortedMap(tm(3)).entrySet().spliterator();
    expect(t.getComparator()).not.toBeNull();
    expect(Collections.unmodifiableMap(hm(1)).entrySet().spliterator().trySplit()).toBeNull();
  });

  it('checked map entry spliterators check setValue', () => {
    const m = Collections.checkedMap(hm(3), (x) => typeof x === 'number', (x) => typeof x === 'number');
    m.entrySet()
      .spliterator()
      .forEachRemaining((e) => expect(() => (e as MapEntry<number, unknown>).setValue('x')).toThrow());
  });

  it('empty and singleton collections', () => {
    const empty = [Collections.emptyList(), Collections.emptySet()];
    for (const c of empty) {
      const s = c.spliterator();
      expect(names(s.characteristics())).toBe('SIZED|SUBSIZED');
      expect(s.estimateSize()).toBe(0);
      expect(s.trySplit()).toBeNull();
      expect(s.tryAdvance(() => undefined)).toBe(false);
    }
    expect(names(Collections.emptySortedSet().spliterator().characteristics())).toBe('DISTINCT|SORTED|ORDERED|SIZED');
    expect(names(Collections.emptyNavigableSet().spliterator().characteristics())).toBe('DISTINCT|SORTED|ORDERED|SIZED');
    for (const c of [Collections.singletonList(1), Collections.singleton(1)]) {
      const s = c.spliterator();
      expect(names(s.characteristics())).toBe('DISTINCT|ORDERED|SIZED|NONNULL|IMMUTABLE|SUBSIZED');
      expect(s.trySplit()).toBeNull();
      const out: number[] = [];
      s.forEachRemaining((x) => out.push(x));
      expect(out).toEqual([1]);
      expect(s.estimateSize()).toBe(0);
    }
    expect(names(Collections.singletonList(null).spliterator().characteristics())).toBe('DISTINCT|ORDERED|SIZED|IMMUTABLE|SUBSIZED');
  });
});

describe('ArrayDeque spliterator under concurrent change (reference parity: slot-based, not modCount-based)', () => {
  type Deq = ArrayDeque<number>;
  const deq = (): Deq => {
    const d = new ArrayDeque<number>(16);
    d.addAll(ArrayList.of(1, 2, 3, 4, 5));
    return d;
  };
  // [name, mutation, tryAdvance result after advancing once and mutating, forEachRemaining result when the first action mutates]
  const cases: [string, (d: Deq) => void, (number | null | 'CME')[], (number | null | 'CME')[]][] = [
    ['addLast', (d) => d.addLast(9), [1, 2, 3, 4, 5], [1, 2, 3, 4, 5]],
    ['addFirst', (d) => d.addFirst(9), [1, 2, 3, 4, 5], [1, 2, 3, 4, 5]],
    ['removeFirst', (d) => void d.removeFirst(), [1, 2, 3, 4, 5], [1, 2, 3, 4, 5]],
    ['pollFirst + addLast', (d) => (d.pollFirst(), d.addLast(9)), [1, 2, 3, 4, 5], [1, 2, 3, 4, 5]],
    ['removeLast', (d) => void d.removeLast(), [1, 2, 3, 4, 'CME'], [1, 2, 3, 4, null]],
    ['clear', (d) => d.clear(), [1, 'CME'], [1, null, null, null, null]],
    ['clear + add', (d) => (d.clear(), d.add(7)), [1, 'CME'], [1, null, null, null, null]],
    ['remove(4) (tail side shifts)', (d) => void d.remove(4), [1, 2, 3, 5, 'CME'], [1, 2, 3, 5, null]],
  ];

  it.each(cases)('%s between tryAdvance calls', (_, mutate, expected) => {
    const d = deq();
    const s = d.spliterator();
    const out: (number | null | 'CME')[] = [];
    s.tryAdvance((x) => out.push(x));
    mutate(d);
    expect(s.estimateSize()).toBe(4);
    try {
      while (s.tryAdvance((x) => out.push(x)));
    } catch (e) {
      expect(e).toBeInstanceOf(ConcurrentModificationException);
      out.push('CME');
    }
    expect(out).toEqual(expected);
  });

  it.each(cases)('%s inside the first forEachRemaining action', (_, mutate, _ta, expected) => {
    const d = deq();
    const out: (number | null)[] = [];
    let first = true;
    d.spliterator().forEachRemaining((x) => {
      out.push(x);
      if (first) mutate(d);
      first = false;
    });
    expect(out).toEqual(expected);
  });

  it('an element added after traversal started is not seen, and no ConcurrentModificationException', () => {
    const d = ArrayDeque.of(1, 2, 3);
    const s = d.spliterator();
    const out: number[] = [];
    s.tryAdvance((x) => out.push(x));
    d.add(4);
    s.forEachRemaining((x) => out.push(x));
    expect(out).toEqual([1, 2, 3]);
  });

  it('forEachRemaining throws when an end of its range was vacated before it started', () => {
    const d = deq();
    const s = d.spliterator();
    s.tryAdvance(() => undefined);
    d.removeLast();
    expect(() => s.forEachRemaining(() => undefined)).toThrow(ConcurrentModificationException);
    const d2 = deq();
    const s2 = d2.spliterator();
    s2.tryAdvance(() => undefined);
    d2.clear();
    expect(() => s2.forEachRemaining(() => undefined)).toThrow(ConcurrentModificationException);
  });

  it('a resize during traversal throws ConcurrentModificationException', () => {
    const d = ArrayDeque.of(1, 2, 3);
    const s = d.spliterator();
    s.tryAdvance(() => undefined);
    for (let i = 0; i < 20; i++) d.addLast(100 + i);
    expect(() => s.tryAdvance(() => undefined)).toThrow(ConcurrentModificationException);
    const d2 = ArrayDeque.of(1, 2, 3);
    expect(() =>
      d2.spliterator().forEachRemaining(() => {
        for (let i = 0; i < 20; i++) d2.addLast(100 + i);
      })
    ).toThrow(ConcurrentModificationException);
  });

  it('a split-off piece reads the same slots', () => {
    const d = deq();
    const s = d.spliterator();
    const p = s.trySplit()!;
    d.addLast(9);
    const out: number[] = [];
    p.forEachRemaining((x) => out.push(x));
    s.forEachRemaining((x) => out.push(x));
    expect(out).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('AbstractSet.spliterator()', () => {
  class Sorted extends AbstractSet<number> {
    constructor(private readonly t: TreeSet<number>, private readonly cmp: ((a: number, b: number) => number) | null) {
      super();
    }
    iterator() {
      return this.t.iterator();
    }
    size() {
      return this.t.size();
    }
    comparator() {
      return this.cmp;
    }
    first() {
      return this.t.first();
    }
    last() {
      return this.t.last();
    }
    headSet(x: number) {
      return this.t.headSet(x);
    }
  }
  class Plain extends AbstractSet<number> {
    iterator() {
      return ArrayList.of(1, 2).iterator();
    }
    size() {
      return 2;
    }
  }
  const rev = (a: number, b: number) => b - a;

  it('a sorted set reports DISTINCT|SORTED|ORDERED|SIZED|SUBSIZED with its comparator', () => {
    const t = new TreeSet<number>(rev);
    t.addAll(ArrayList.of(1, 2, 3));
    const s = new Sorted(t, rev).spliterator();
    expect(names(s.characteristics())).toBe('DISTINCT|SORTED|ORDERED|SIZED|SUBSIZED');
    expect(s.getComparator()).toBe(rev);
    const out: number[] = [];
    s.tryAdvance((x) => out.push(x));
    expect(s.estimateSize()).toBe(3);
    s.forEachRemaining((x) => out.push(x));
    expect(out).toEqual([3, 2, 1]);
  });
  it('natural ordering reports a null comparator', () => {
    const s = new Sorted(TreeSet.of(1, 2), null).spliterator();
    expect(s.hasCharacteristics(S)).toBe(true);
    expect(s.getComparator()).toBeNull();
  });
  it('a plain set reports DISTINCT|SIZED|SUBSIZED and keeps its estimate', () => {
    const s = new Plain().spliterator();
    expect(names(s.characteristics())).toBe('DISTINCT|SIZED|SUBSIZED');
    expect(() => s.getComparator()).toThrow(IllegalStateException);
    s.tryAdvance(() => undefined);
    expect(s.estimateSize()).toBe(2);
  });
});

describe('hash spliterators keep their estimate during traversal (reference parity)', () => {
  it.each([
    ['HashSet', () => HashSet.of(0, 1, 2, 3, 4)],
    ['HashMap.entrySet', () => hm(5).entrySet()],
    ['IdentityHashMap.keySet', () => ihm(5).keySet()],
    ['unmodifiableMap(HashMap).keySet', () => Collections.unmodifiableMap(hm(5)).keySet()],
  ] as [string, () => Collection<unknown>][])('%s', (_n, make) => {
    const s = make().spliterator();
    s.tryAdvance(() => undefined);
    expect(s.estimateSize()).toBe(5);
    s.forEachRemaining(() => undefined);
    expect(s.estimateSize()).toBe(5);
  });
});

describe('Collections empty / singleton / nCopies spliterators', () => {
  const nn = Collections.singletonMap('k', 1);
  const nulls = Collections.singletonMap<string | null, number | null>(null, null);
  it.each([
    ['singletonMap.keySet', () => nn.keySet().spliterator(), 'DISTINCT|ORDERED|SIZED|NONNULL|IMMUTABLE|SUBSIZED'],
    ['singletonMap.values', () => nn.values().spliterator(), 'DISTINCT|ORDERED|SIZED|NONNULL|IMMUTABLE|SUBSIZED'],
    ['singletonMap.entrySet', () => nn.entrySet().spliterator(), 'DISTINCT|ORDERED|SIZED|NONNULL|IMMUTABLE|SUBSIZED'],
    ['singletonMap(null, null).keySet', () => nulls.keySet().spliterator(), 'DISTINCT|ORDERED|SIZED|IMMUTABLE|SUBSIZED'],
    ['singletonMap(null, null).values', () => nulls.values().spliterator(), 'DISTINCT|ORDERED|SIZED|IMMUTABLE|SUBSIZED'],
    ['singletonMap(null, null).entrySet', () => nulls.entrySet().spliterator(), 'DISTINCT|ORDERED|SIZED|NONNULL|IMMUTABLE|SUBSIZED'],
    ['emptyMap.keySet', () => Collections.emptyMap().keySet().spliterator(), 'SIZED|SUBSIZED'],
    ['emptyMap.values', () => Collections.emptyMap().values().spliterator(), 'SIZED|SUBSIZED'],
    ['emptyMap.entrySet', () => Collections.emptyMap().entrySet().spliterator(), 'SIZED|SUBSIZED'],
    ['nCopies(0)', () => Collections.nCopies(0, 'x').spliterator(), 'SIZED|SUBSIZED'],
  ] as [string, () => Spliterator<unknown>, string][])('%s reports %s', (_n, make, expected) => {
    expect(names(make().characteristics())).toBe(expected);
  });
  it('singletonMap view spliterators yield the single key, value and entry once', () => {
    const one = <T>(s: Spliterator<T>): T[] => {
      const out: T[] = [];
      expect(s.estimateSize()).toBe(1);
      s.forEachRemaining((x) => out.push(x));
      expect(s.estimateSize()).toBe(0);
      expect(s.tryAdvance(() => undefined)).toBe(false);
      return out;
    };
    expect(one(nn.keySet().spliterator())).toEqual(['k']);
    expect(one(nn.values().spliterator())).toEqual([1]);
    const [e] = one(nn.entrySet().spliterator());
    expect(e.getKey()).toBe('k');
    expect(e.getValue()).toBe(1);
    expect(e).toBe(nn.entrySet().iterator().next());
    expect(nn.keySet().stream().toArray()).toEqual(['k']);
  });
  it('empty views stay empty and keep their identity; nCopies(0) is the shared empty list', () => {
    const m = Collections.emptyMap();
    expect(m.keySet()).toBe(m.keySet());
    expect(m.keySet().size()).toBe(0);
    expect(Collections.nCopies(0, 1)).toBe(Collections.emptyList());
    expect(Collections.nCopies(0, 1).size()).toBe(0);
    expect(names(Collections.nCopies(2, 'x').spliterator().characteristics())).toContain('SIZED');
  });
});
