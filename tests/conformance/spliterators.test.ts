// Conformance: Spliterator contract on collection spliterators, Spliterators utilities, StreamSupport.
import {
  ArrayDeque,
  ArrayList,
  Collection,
  Comparator,
  HashMap,
  HashSet,
  LinkedHashMap,
  LinkedHashSet,
  LinkedList,
  List,
  PriorityQueue,
  Set,
  Spliterator,
  Spliterators,
  StreamSupport,
  TreeMap,
  TreeSet,
  Vector,
} from '../../src';
import { expectThrows } from '../helpers';

const { DISTINCT, SORTED, ORDERED, SIZED, NONNULL, IMMUTABLE, CONCURRENT, SUBSIZED } = Spliterator;
type Sp<T> = ReturnType<Collection<T>['spliterator']>;

function drain<T>(sp: Sp<T>): T[] {
  const out: T[] = [];
  sp.forEachRemaining((x) => out.push(x));
  return out;
}
/** Splits recursively (bounded depth) and returns the pieces' elements in prefix-first order. */
function splitAll<T>(sp: Sp<T>, depth = 6): T[] {
  if (depth === 0) return drain(sp);
  const prefix = sp.trySplit();
  return prefix === null ? drain(sp) : [...splitAll(prefix, depth - 1), ...splitAll(sp, depth - 1)];
}

describe('characteristic bit values match the reference', () => {
  it.each([
    ['DISTINCT', DISTINCT, 0x1],
    ['SORTED', SORTED, 0x4],
    ['ORDERED', ORDERED, 0x10],
    ['SIZED', SIZED, 0x40],
    ['NONNULL', NONNULL, 0x100],
    ['IMMUTABLE', IMMUTABLE, 0x400],
    ['CONCURRENT', CONCURRENT, 0x1000],
    ['SUBSIZED', SUBSIZED, 0x4000],
  ])('%s', (_n, actual, expected) => expect(actual).toBe(expected));
});

// Collection docs: "Such characteristic values are not required to be reported if the spliterator reports SIZED and
// this collection contains no elements." — so every source below is non-empty.
const nums = [5, 3, 9, 1, 7, 2, 8, 6, 4, 10, 12, 11];
interface Source {
  name: string;
  make: () => Collection<number>;
  flags: number;
  ordered: boolean;
}
const sources: Source[] = [
  // ArrayList.spliterator: "The Spliterator reports Spliterator.SIZED, Spliterator.SUBSIZED, and Spliterator.ORDERED."
  { name: 'ArrayList', make: () => ArrayList.of(...nums), flags: SIZED | SUBSIZED | ORDERED, ordered: true },
  // LinkedList.spliterator: "The Spliterator reports Spliterator.SIZED and Spliterator.ORDERED."
  { name: 'LinkedList', make: () => LinkedList.of(...nums), flags: SIZED | ORDERED, ordered: true },
  // Vector.spliterator: "reports SIZED, SUBSIZED, and ORDERED"
  { name: 'Vector', make: () => new Vector<number>(ArrayList.of(...nums)), flags: SIZED | SUBSIZED | ORDERED, ordered: true },
  // ArrayDeque.spliterator: "reports SIZED, SUBSIZED, ORDERED, and NONNULL"
  { name: 'ArrayDeque', make: () => ArrayDeque.of(...nums), flags: SIZED | SUBSIZED | ORDERED | NONNULL, ordered: true },
  // PriorityQueue.spliterator: "reports SIZED, SUBSIZED, and NONNULL"
  { name: 'PriorityQueue', make: () => PriorityQueue.of(...nums), flags: SIZED | SUBSIZED | NONNULL, ordered: false },
  // HashSet.spliterator: "reports SIZED and DISTINCT"
  { name: 'HashSet', make: () => HashSet.of(...nums), flags: SIZED | DISTINCT, ordered: false },
  // LinkedHashSet.spliterator: "reports SIZED, DISTINCT, and ORDERED"
  { name: 'LinkedHashSet', make: () => new LinkedHashSet<number>(ArrayList.of(...nums)), flags: SIZED | DISTINCT | ORDERED, ordered: true },
  // TreeSet.spliterator: "reports SIZED, DISTINCT, SORTED, and ORDERED"
  { name: 'TreeSet', make: () => TreeSet.of(...nums), flags: SIZED | DISTINCT | SORTED | ORDERED, ordered: true },
  // List.spliterator: "reports SIZED and ORDERED"
  { name: 'List.of', make: () => List.of(...nums), flags: SIZED | ORDERED, ordered: true },
  // Set.spliterator: "reports DISTINCT"
  { name: 'Set.of', make: () => Set.of(...nums), flags: DISTINCT, ordered: false },
  // TreeMap.keySet: "additionally reports SORTED and ORDERED"; Set: DISTINCT
  { name: 'TreeMap.keySet', make: () => treeMap().keySet(), flags: DISTINCT | SORTED | ORDERED, ordered: true },
  // TreeMap.values: "additionally reports ORDERED"
  { name: 'TreeMap.values', make: () => treeMap().values(), flags: ORDERED, ordered: true },
  // HashMap keySet is a Set: DISTINCT; Collection default: SIZED
  { name: 'HashMap.keySet', make: () => hashMap().keySet(), flags: DISTINCT, ordered: false },
  { name: 'HashMap.values', make: () => hashMap().values(), flags: 0, ordered: false },
  // LinkedHashMap.keySet/values: "additionally reports ORDERED"
  { name: 'LinkedHashMap.keySet', make: () => linkedHashMap().keySet(), flags: DISTINCT | ORDERED, ordered: true },
  { name: 'LinkedHashMap.values', make: () => linkedHashMap().values(), flags: ORDERED, ordered: true },
];
function treeMap() {
  const m = new TreeMap<number, number>();
  nums.forEach((n) => m.put(n, n));
  return m;
}
function hashMap() {
  const m = new HashMap<number, number>();
  nums.forEach((n) => m.put(n, n));
  return m;
}
function linkedHashMap() {
  const m = new LinkedHashMap<number, number>();
  nums.forEach((n) => m.put(n, n));
  return m;
}
const iterOrder = (c: Collection<number>) => [...c];
const sorted = (a: number[]) => [...a].sort((x, y) => x - y);

describe.each(sources)('$name spliterator', ({ make, flags, ordered }) => {
  it('reports the documented characteristics', () => expect(make().spliterator().hasCharacteristics(flags)).toBe(true));
  it('hasCharacteristics agrees with characteristics()', () => {
    const sp = make().spliterator();
    expect(sp.hasCharacteristics(flags)).toBe((sp.characteristics() & flags) === flags);
  });
  it('traverses every element exactly once', () => {
    const c = make();
    expect(sorted(drain(c.spliterator()))).toEqual(sorted(iterOrder(c)));
  });
  if (ordered) {
    it('ORDERED: traversal follows the encounter (iteration) order', () => {
      const c = make();
      expect(drain(c.spliterator())).toEqual(iterOrder(c));
    });
    // trySplit: "If this Spliterator is ORDERED, the returned Spliterator must cover a strict prefix of the elements."
    it('ORDERED: split pieces are prefixes, so prefix-first concatenation is the encounter order', () => {
      const c = make();
      expect(splitAll(c.spliterator())).toEqual(iterOrder(c));
    });
  }
  it('splitting neither loses nor duplicates elements', () => {
    const c = make();
    expect(sorted(splitAll(c.spliterator()))).toEqual(sorted(iterOrder(c)));
  });
  // "Unless this Spliterator covers an infinite number of elements, repeated calls to trySplit() must eventually return null."
  it('repeated trySplit eventually returns null', () => {
    const sp = make().spliterator();
    let n = 0;
    while (sp.trySplit() !== null && n < 1000) n++;
    expect(n).toBeLessThan(1000);
  });
  it('tryAdvance yields one element at a time and returns false at the end', () => {
    const c = make();
    const sp = c.spliterator();
    const out: number[] = [];
    while (sp.tryAdvance((x) => out.push(x)));
    expect(out.length).toBe(c.size());
    expect(sp.tryAdvance(() => out.push(-1))).toBe(false);
    expect(out.length).toBe(c.size());
  });
  it('forEachRemaining after tryAdvance covers the rest', () => {
    const c = make();
    const sp = c.spliterator();
    const first: number[] = [];
    sp.tryAdvance((x) => first.push(x));
    const rest = drain(sp);
    expect(first.length + rest.length).toBe(c.size());
  });
  it('estimateSize is not less than the remaining count when SIZED, and getExactSizeIfKnown matches', () => {
    const c = make();
    const sp = c.spliterator();
    if (sp.hasCharacteristics(SIZED)) {
      // SIZED: "the value returned from estimateSize() prior to traversal or splitting represents a finite size that ... represents an exact count"
      expect(sp.estimateSize()).toBe(c.size());
      expect(sp.getExactSizeIfKnown()).toBe(c.size());
    } else {
      expect(sp.getExactSizeIfKnown()).toBe(-1);
    }
  });
  it('SUBSIZED: sizes of split parts add up', () => {
    const c = make();
    const sp = c.spliterator();
    if (!sp.hasCharacteristics(SUBSIZED)) return;
    const pre = sp.trySplit();
    if (pre === null) return;
    expect(pre.estimateSize() + sp.estimateSize()).toBe(c.size());
    expect(pre.hasCharacteristics(SIZED)).toBe(true);
  });
  // getComparator: "IllegalStateException - if the spliterator does not report a characteristic of SORTED."
  it('getComparator throws IllegalStateException unless SORTED', () => {
    const sp = make().spliterator();
    if (sp.hasCharacteristics(SORTED)) expect(() => sp.getComparator()).not.toThrow();
    else expectThrows(() => sp.getComparator(), 'IllegalStateException');
  });
  it('stream() of the collection yields the same elements', () => {
    const c = make();
    expect(sorted(c.stream().toArray())).toEqual(sorted(iterOrder(c)));
  });
});

describe('SORTED spliterators and comparators', () => {
  // "If this Spliterator's source is SORTED by a Comparator, returns that Comparator. If the source is SORTED in natural order, returns null."
  it('TreeSet with natural ordering: getComparator is null', () => expect(TreeSet.of(1, 2).spliterator().getComparator()).toBeNull());
  // TreeSet.spliterator: "the Spliterator's comparator is the same as or imposes the same total ordering as the tree set's comparator."
  it('TreeSet with a comparator: getComparator imposes the same ordering', () => {
    const cmp = Comparator.reverseOrder<number>();
    const ts = new TreeSet<number>(cmp);
    ts.addAll(ArrayList.of(1, 2, 3));
    const c = ts.spliterator().getComparator()!;
    expect(c).not.toBeNull();
    expect(Math.sign(c(1, 2))).toBe(Math.sign(cmp(1, 2)));
    expect(Math.sign(c(3, 2))).toBe(Math.sign(cmp(3, 2)));
  });
  it('TreeSet traversal is ascending under its comparator', () => {
    const ts = new TreeSet<number>(Comparator.reverseOrder<number>());
    ts.addAll(ArrayList.of(1, 3, 2));
    expect(drain(ts.spliterator())).toEqual([3, 2, 1]);
  });
  it('TreeMap.keySet natural ordering: getComparator is null', () => expect(treeMap().keySet().spliterator().getComparator()).toBeNull());
  it('TreeMap.entrySet reports SORTED and ORDERED', () => expect(treeMap().entrySet().spliterator().hasCharacteristics(SORTED | ORDERED)).toBe(true));
  it('LinkedHashMap.entrySet reports ORDERED', () => expect(linkedHashMap().entrySet().spliterator().hasCharacteristics(ORDERED)).toBe(true));
});

describe('late-binding and fail-fast collection spliterators', () => {
  // ArrayList.spliterator: "Creates a late-binding and fail-fast Spliterator"; a late-binding Spliterator "binds to the
  // source of elements at the point of first traversal, first split, or first query for estimated size"
  it('ArrayList: changes made before the first traversal are seen', () => {
    const l = ArrayList.of(1, 2);
    const sp = l.spliterator();
    l.add(3);
    expect(drain(sp)).toEqual([1, 2, 3]);
  });
  it('LinkedList: changes made before the first traversal are seen', () => {
    const l = LinkedList.of(1);
    const sp = l.spliterator();
    l.add(2);
    expect(drain(sp)).toEqual([1, 2]);
  });
  it('HashSet: changes made before the first traversal are seen', () => {
    const s = HashSet.of(1);
    const sp = s.spliterator();
    s.add(2);
    expect(sorted(drain(sp))).toEqual([1, 2]);
  });
  it('TreeSet: changes made before the first traversal are seen', () => {
    const s = TreeSet.of(2);
    const sp = s.spliterator();
    s.add(1);
    expect(drain(sp)).toEqual([1, 2]);
  });
  // fail-fast (best-effort): structural modification during traversal throws ConcurrentModificationException
  it('ArrayList: structural modification during forEachRemaining throws ConcurrentModificationException', () => {
    const l = ArrayList.of(1, 2, 3);
    let added = false;
    const once = () => {
      if (!added) {
        added = true;
        l.add(0);
      }
    };
    expectThrows(() => l.spliterator().forEachRemaining(once), 'ConcurrentModificationException');
  });
  it('ArrayList: structural modification between tryAdvance calls throws ConcurrentModificationException', () => {
    const l = ArrayList.of(1, 2, 3);
    const sp = l.spliterator();
    sp.tryAdvance(() => {});
    l.add(4);
    expectThrows(() => sp.tryAdvance(() => {}), 'ConcurrentModificationException');
  });
});

describe('Spliterators utilities', () => {
  // emptySpliterator: "The empty spliterator reports Spliterator.SIZED and Spliterator.SUBSIZED. Calls to Spliterator.trySplit() always return null."
  it('emptySpliterator', () => {
    const sp = Spliterators.emptySpliterator<number>();
    expect(sp.estimateSize()).toBe(0);
    expect(sp.getExactSizeIfKnown()).toBe(0);
    expect(sp.hasCharacteristics(SIZED | SUBSIZED)).toBe(true);
    expect(sp.trySplit()).toBeNull();
    expect(sp.tryAdvance(() => {})).toBe(false);
    expect(drain(sp)).toEqual([]);
  });
  // spliterator(array, characteristics): "The returned spliterator always reports the characteristics SIZED and SUBSIZED."
  it('array spliterator reports SIZED and SUBSIZED plus the given characteristics', () => {
    const sp = Spliterators.spliterator([1, 2, 3], ORDERED | IMMUTABLE);
    expect(sp.hasCharacteristics(SIZED | SUBSIZED | ORDERED | IMMUTABLE)).toBe(true);
    expect(sp.estimateSize()).toBe(3);
  });
  it('array spliterator traverses in index order', () => expect(drain(Spliterators.spliterator(['a', 'b', 'c'], ORDERED))).toEqual(['a', 'b', 'c']));
  it('array spliterator splits into prefix and suffix', () => expect(splitAll(Spliterators.spliterator([1, 2, 3, 4, 5, 6, 7], ORDERED))).toEqual([1, 2, 3, 4, 5, 6, 7]));
  it('array range spliterator covers [from, to)', () => {
    const sp = Spliterators.spliterator([0, 1, 2, 3, 4], 1, 4, ORDERED);
    expect(sp.estimateSize()).toBe(3);
    expect(drain(sp)).toEqual([1, 2, 3]);
  });
  it('array range spliterator with from == to is empty', () => expect(drain(Spliterators.spliterator([1, 2], 1, 1, 0))).toEqual([]));
  // "ArrayIndexOutOfBoundsException - if fromIndex is negative, toIndex is less than fromIndex, or toIndex is greater than the array size"
  it.each([
    [-1, 2],
    [2, 1],
    [0, 4],
  ])('array range spliterator(%i, %i) throws ArrayIndexOutOfBoundsException', (from, to) =>
    expectThrows(() => Spliterators.spliterator([1, 2, 3], from, to, 0), 'ArrayIndexOutOfBoundsException'));
  it('array spliterator over a null array throws NullPointerException', () => expectThrows(() => Spliterators.spliterator(null as any, 0), 'NullPointerException'));
  // spliterator(iterator, size, characteristics): reports the given size and SIZED/SUBSIZED
  it('iterator spliterator with a known size', () => {
    const sp = Spliterators.spliterator(ArrayList.of(1, 2, 3).iterator(), 3, ORDERED);
    expect(sp.estimateSize()).toBe(3);
    expect(sp.hasCharacteristics(SIZED | SUBSIZED | ORDERED)).toBe(true);
    expect(drain(sp)).toEqual([1, 2, 3]);
  });
  // spliterator(Collection, characteristics): "reporting its Collection.size() as its initial size"
  it('collection spliterator reports the collection size', () => {
    const c = ArrayList.of('x', 'y');
    const sp = Spliterators.spliterator(c, ORDERED);
    expect(sp.estimateSize()).toBe(2);
    expect(sp.hasCharacteristics(SIZED | ORDERED)).toBe(true);
    expect(drain(sp)).toEqual(['x', 'y']);
  });
  // spliteratorUnknownSize: unknown size is reported as Infinity (library convention for Long.MAX_VALUE)
  it('spliteratorUnknownSize has no known size', () => {
    const sp = Spliterators.spliteratorUnknownSize(ArrayList.of(1, 2).iterator(), ORDERED);
    expect(sp.estimateSize()).toBe(Infinity);
    expect(sp.getExactSizeIfKnown()).toBe(-1);
    expect(sp.hasCharacteristics(SIZED)).toBe(false);
    expect(sp.hasCharacteristics(ORDERED)).toBe(true);
    expect(drain(sp)).toEqual([1, 2]);
  });
  it('spliteratorUnknownSize splits without losing elements', () => {
    const items = Array.from({ length: 3000 }, (_, i) => i);
    const sp = Spliterators.spliteratorUnknownSize(ArrayList.of(...items).iterator(), ORDERED);
    expect(splitAll(sp)).toEqual(items);
  });
  // iterator(spliterator): "Creates an Iterator from a Spliterator."
  it('iterator(spliterator) adapts to hasNext/next', () => {
    const it = Spliterators.iterator(Spliterators.spliterator([1, 2], ORDERED));
    const out: number[] = [];
    while (it.hasNext()) out.push(it.next());
    expect(out).toEqual([1, 2]);
  });
  it('iterator(spliterator).next() past the end throws NoSuchElementException', () => {
    const it = Spliterators.iterator(Spliterators.emptySpliterator<number>());
    expect(it.hasNext()).toBe(false);
    expectThrows(() => it.next(), 'NoSuchElementException');
  });
  it('iterator(spliterator) hasNext is idempotent', () => {
    const it = Spliterators.iterator(Spliterators.spliterator([7], 0));
    expect([it.hasNext(), it.hasNext(), it.next(), it.hasNext()]).toEqual([true, true, 7, false]);
  });
});

describe('StreamSupport', () => {
  it('stream(spliterator, false) is sequential', () => {
    const s = StreamSupport.stream(ArrayList.of(1, 2).spliterator(), false);
    expect(s.isParallel()).toBe(false);
    expect(s.toArray()).toEqual([1, 2]);
  });
  it('stream(spliterator, true) is parallel with the same result', () => {
    const s = StreamSupport.stream(ArrayList.of(3, 4).spliterator(), true);
    expect(s.isParallel()).toBe(true);
    expect(s.toArray()).toEqual([3, 4]);
  });
  it('stream over a hand-written spliterator', () => {
    let i = 0;
    const sp: Sp<number> = {
      tryAdvance(action) {
        if (i >= 3) return false;
        action(i++);
        return true;
      },
      forEachRemaining(action) {
        while (this.tryAdvance(action));
      },
      trySplit: () => null,
      estimateSize: () => Infinity,
      getExactSizeIfKnown: () => -1,
      characteristics: () => ORDERED,
      hasCharacteristics: (c) => (ORDERED & c) === c,
      getComparator: () => {
        throw new Error('not sorted');
      },
    };
    expect(StreamSupport.stream(sp, false).map((x) => x * 2).toArray()).toEqual([0, 2, 4]);
  });
  it('intStream / longStream / doubleStream', () => {
    expect(StreamSupport.intStream(Spliterators.spliterator([1, 2, 3], ORDERED), false).sum()).toBe(6);
    expect(StreamSupport.longStream(Spliterators.spliterator([4294967296], ORDERED), false).max().getAsLong()).toBe(4294967296);
    expect(StreamSupport.doubleStream(Spliterators.spliterator([0.5, 0.25], ORDERED), false).sum()).toBe(0.75);
  });
  it('stream(null, false) throws NullPointerException', () => expectThrows(() => StreamSupport.stream(null as any, false), 'NullPointerException'));
});
