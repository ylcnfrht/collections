import { SequencedSet } from '../src/interfaces/Set';
import { HashSet } from '../src/set/HashSet';
import { LinkedHashSet } from '../src/set/LinkedHashSet';
import { collectionContract } from './contracts/collection';
import { setContract } from './contracts/set';
import { Collide, expectThrows, Point, rng } from './helpers';
import { SimpleList, SimpleSet } from './support';

collectionContract('LinkedHashSet', () => new LinkedHashSet(), { allowsNull: true, allowsDuplicates: false });
setContract('LinkedHashSet', () => new LinkedHashSet());
collectionContract('LinkedHashSet.reversed()', () => new LinkedHashSet().reversed(), { allowsNull: true, allowsDuplicates: false });
setContract('LinkedHashSet.reversed()', () => new LinkedHashSet().reversed());

const lhs = (...xs: unknown[]) => LinkedHashSet.of<unknown>(...xs);

describe('LinkedHashSet · order', () => {
  it('iterates in insertion order for every element kind', () => {
    const xs = [9, 'b', null, new Point(1, 1), 1e9, -1, undefined, new Collide(2), 0, new Date(1), new Collide(1), 'a', {}];
    const s = lhs(...xs);
    expect(s.toArray()).toEqual(xs);
    expect([...s]).toEqual(xs);
  });
  it('re-adding keeps the original position', () => {
    const s = lhs(1, 2, 3);
    expect(s.add(1)).toBe(false);
    expect(s.toArray()).toEqual([1, 2, 3]);
  });
  it('remove then add appends', () => {
    const s = lhs(1, 2, 3);
    s.remove(1);
    s.add(1);
    expect(s.toArray()).toEqual([2, 3, 1]);
  });
  it('forEach, iterator and toString are ordered', () => {
    const s = lhs('c', 'a', 'b');
    const seen: unknown[] = [];
    s.forEach((e) => seen.push(e));
    const it = s.iterator();
    while (it.hasNext()) seen.push(it.next());
    expect(seen).toEqual(['c', 'a', 'b', 'c', 'a', 'b']);
    expect(s.toString()).toBe('[c, a, b]');
  });
  it('null keeps its place', () => {
    const s = lhs('a', null, 'b');
    s.add(null);
    expect(s.toArray()).toEqual(['a', null, 'b']);
  });
  it('colliding elements keep order through removals', () => {
    const s = lhs(...Array.from({ length: 6 }, (_, i) => new Collide(i)));
    s.remove(new Collide(2));
    s.add(new Collide(2));
    expect(s.toArray().map(String)).toEqual(['C0', 'C1', 'C3', 'C4', 'C5', 'C2']);
  });
  it('Point elements dedupe by value', () => {
    const s = lhs(new Point(1, 1), new Point(0, 0), new Point(1, 1));
    expect(s.toArray().map(String)).toEqual(['(1,1)', '(0,0)']);
  });
  it('addAll appends new elements in source order', () => {
    const s = lhs(1, 2);
    expect(s.addAll(SimpleList.of<unknown>(5, 1, 4))).toBe(true);
    expect(s.toArray()).toEqual([1, 2, 5, 4]);
    expect(s.addAll(SimpleList.of<unknown>(1))).toBe(false);
  });
  it('removeIf / removeAll / retainAll keep order', () => {
    const s = lhs(1, 2, 3, 4, 5, 6);
    expect(s.removeIf((e) => e === 6)).toBe(true);
    s.removeAll(SimpleList.of<unknown>(2));
    s.retainAll(SimpleList.of<unknown>(5, 1, 3));
    expect(s.toArray()).toEqual([1, 3, 5]);
    expect(s.removeIf(() => false)).toBe(false);
  });
  it('clear resets', () => {
    const s = lhs(1, 'a');
    s.clear();
    expect([s.size(), s.isEmpty(), s.toArray()]).toEqual([0, true, []]);
    s.add('z');
    expect(s.getFirst()).toBe('z');
  });
  it('contains does not reorder', () => {
    const s = lhs(1, 2);
    s.contains(1);
    expect(s.toArray()).toEqual([1, 2]);
  });
});

describe('LinkedHashSet · constructors', () => {
  it('collection constructor keeps the source order', () => {
    expect(new LinkedHashSet(lhs(3, 1, 2)).toArray()).toEqual([3, 1, 2]);
    expect(new LinkedHashSet(SimpleList.of(5, 5, 4)).toArray()).toEqual([5, 4]);
  });
  it('capacity constructors validate', () => {
    expect(new LinkedHashSet(10).isEmpty()).toBe(true);
    expect(new LinkedHashSet(10, 0.5).isEmpty()).toBe(true);
    expectThrows(() => new LinkedHashSet(-1), 'IllegalArgumentException');
    expectThrows(() => new LinkedHashSet(1, 0), 'IllegalArgumentException');
    expectThrows(() => new LinkedHashSet(null as never), 'NullPointerException');
  });
  it('of() dedupes in argument order', () => expect(LinkedHashSet.of(2, 1, 2).toArray()).toEqual([2, 1]));
  it('is a HashSet', () => {
    expect(new LinkedHashSet()).toBeInstanceOf(HashSet);
    expect(new LinkedHashSet()).toBeInstanceOf(LinkedHashSet);
  });
  it('overrides every HashSet method (none touches the unused inherited storage)', () => {
    const own = Object.getOwnPropertyNames(LinkedHashSet.prototype);
    // unlink/removeIndex are private helpers reached only through overridden methods
    const missing = Object.getOwnPropertyNames(HashSet.prototype).filter((n) => !['constructor', 'unlink', 'removeIndex'].includes(n) && !own.includes(n));
    expect(missing).toEqual([]);
    expect(Object.getOwnPropertySymbols(LinkedHashSet.prototype)).toContain(Symbol.iterator);
  });
  it('clone keeps order and is independent', () => {
    const s = lhs(3, 1, 2);
    const c = s.clone();
    expect(c).toBeInstanceOf(LinkedHashSet);
    c.add(0);
    s.remove(3);
    expect([c.toArray(), s.toArray()]).toEqual([[3, 1, 2, 0], [1, 2]]);
  });
});

describe('LinkedHashSet · SequencedSet', () => {
  it('getFirst/getLast', () => {
    const s = lhs(1, 2, 3);
    expect([s.getFirst(), s.getLast()]).toEqual([1, 3]);
  });
  it('removeFirst/removeLast', () => {
    const s = lhs(1, 2, 3);
    expect([s.removeFirst(), s.removeLast(), s.toArray()]).toEqual([1, 3, [2]]);
  });
  it('empty ends throw NoSuchElementException', () => {
    const s = new LinkedHashSet<number>();
    for (const f of [() => s.getFirst(), () => s.getLast(), () => s.removeFirst(), () => s.removeLast()]) expectThrows(f, 'NoSuchElementException');
    const r = s.reversed();
    for (const f of [() => r.getFirst(), () => r.getLast(), () => r.removeFirst(), () => r.removeLast()]) expectThrows(f, 'NoSuchElementException');
  });
  it('addFirst/addLast insert at the ends', () => {
    const s = lhs(2);
    s.addFirst(1);
    s.addLast(3);
    expect(s.toArray()).toEqual([1, 2, 3]);
  });
  it('addFirst/addLast move existing elements', () => {
    const s = lhs(1, 2, 3);
    s.addFirst(3);
    expect(s.toArray()).toEqual([3, 1, 2]);
    s.addLast(3);
    expect(s.toArray()).toEqual([1, 2, 3]);
    s.addFirst(1);
    expect([s.size(), s.toArray()]).toEqual([3, [1, 2, 3]]);
  });
  it('addFirst during iteration is a concurrent modification', () => {
    const s = lhs(1, 2);
    const it = s.iterator();
    it.next();
    s.addFirst(2);
    expectThrows(() => it.next(), 'ConcurrentModificationException');
  });
  it('drains with removeFirst in order', () => {
    const s = lhs(...Array.from({ length: 50 }, (_, i) => 49 - i));
    const out: unknown[] = [];
    while (!s.isEmpty()) out.push(s.removeFirst());
    expect(out).toEqual(Array.from({ length: 50 }, (_, i) => 49 - i));
  });
  it('is a SequencedSet', () => {
    const s: SequencedSet<number> = new LinkedHashSet();
    s.addLast(1);
    expect(s.reversed().getFirst()).toBe(1);
  });
});

describe('LinkedHashSet · reversed()', () => {
  it('iterates backwards, live', () => {
    const s = lhs(1, 2, 3);
    const r = s.reversed();
    expect([...r]).toEqual([3, 2, 1]);
    s.add(4);
    expect(r.toArray()).toEqual([4, 3, 2, 1]);
    expect(r.toString()).toBe('[4, 3, 2, 1]');
  });
  it('reversed().reversed() is the original', () => {
    const s = lhs(1);
    expect(s.reversed().reversed()).toBe(s);
    expect(s.reversed()).toBe(s.reversed());
  });
  it('ends are mirrored', () => {
    const s = lhs(1, 2, 3, 4);
    const r = s.reversed();
    expect([r.getFirst(), r.getLast()]).toEqual([4, 1]);
    expect(r.removeFirst()).toBe(4);
    expect(r.removeLast()).toBe(1);
    expect(s.toArray()).toEqual([2, 3]);
  });
  it('addFirst/addLast are mirrored', () => {
    const s = lhs(2);
    const r = s.reversed();
    r.addFirst(3);
    r.addLast(1);
    expect(s.toArray()).toEqual([1, 2, 3]);
    expect(r.toArray()).toEqual([3, 2, 1]);
  });
  it('add appends to the base (first in the view); remove/contains/clear write through', () => {
    const s = lhs(1, 2);
    const r = s.reversed();
    expect(r.add(3)).toBe(true);
    expect(r.add(1)).toBe(false);
    expect([s.toArray(), r.getFirst()]).toEqual([[1, 2, 3], 3]);
    expect([r.contains(2), r.remove(2), r.remove(9), r.size(), r.isEmpty()]).toEqual([true, true, false, 2, false]);
    r.clear();
    expect(s.isEmpty()).toBe(true);
  });
  it('iterator.remove and forEach on the view', () => {
    const s = lhs(1, 2, 3);
    const r = s.reversed();
    const it = r.iterator();
    it.next();
    it.remove();
    const seen: unknown[] = [];
    r.forEach((e) => seen.push(e));
    expect([seen, s.toArray()]).toEqual([[2, 1], [1, 2]]);
  });
  it('equals the base set and shares its hashCode', () => {
    const s = lhs(1, 2, 3);
    expect(s.reversed().equals(s)).toBe(true);
    expect(s.equals(s.reversed())).toBe(true);
    expect(s.reversed().hashCode()).toBe(s.hashCode());
  });
});

describe('LinkedHashSet · iterators', () => {
  it('iterator.remove keeps order and checks state', () => {
    const s = lhs(1, 2, 3, 4);
    const it = s.iterator();
    while (it.hasNext()) if ((it.next() as number) % 2 === 0) it.remove();
    expect(s.toArray()).toEqual([1, 3]);
    expectThrows(() => it.remove(), 'IllegalStateException');
    expectThrows(() => it.next(), 'NoSuchElementException');
  });
  it('fail-fast on add, remove and clear during iteration', () => {
    for (const mutate of [(s: LinkedHashSet<unknown>) => s.add(9), (s: LinkedHashSet<unknown>) => s.remove(2), (s: LinkedHashSet<unknown>) => s.clear()]) {
      const s = lhs(1, 2, 3);
      const it = s.iterator();
      it.next();
      mutate(s);
      expectThrows(() => it.next(), 'ConcurrentModificationException');
    }
  });
  it('for..of and forEach are fail-fast', () => {
    const s = lhs(1, 2, 3);
    expectThrows(() => {
      for (const e of s) if (e === 1) s.add(4);
    }, 'ConcurrentModificationException');
    expectThrows(() => s.forEach(() => s.remove(3)), 'ConcurrentModificationException');
  });
  it('a duplicate add during iteration is not structural', () => {
    const s = lhs(1, 2);
    const out: unknown[] = [];
    for (const e of s) {
      s.add(1);
      out.push(e);
    }
    expect(out).toEqual([1, 2]);
  });
  it('JS iterator is a plain object', () => {
    const it = lhs(1)[Symbol.iterator]();
    expect(Object.prototype.toString.call(it)).toBe('[object Object]');
    expect(it.next()).toEqual({ value: 1, done: false });
    expect(it.next().done).toBe(true);
  });
  it('forEachRemaining continues in order', () => {
    const it = lhs(1, 2, 3).iterator();
    it.next();
    const rest: unknown[] = [];
    it.forEachRemaining((e) => rest.push(e));
    expect(rest).toEqual([2, 3]);
  });
});

describe('LinkedHashSet · equality', () => {
  it('equals/hashCode ignore order and match HashSet and SimpleSet', () => {
    const a = lhs(1, 2, 3);
    const b = lhs(3, 2, 1);
    const h = HashSet.of<unknown>(2, 3, 1);
    const ss = SimpleSet.of<unknown>(1, 3, 2);
    expect([a.equals(b), a.equals(h), h.equals(a), a.equals(ss), ss.equals(a)]).toEqual([true, true, true, true, true]);
    expect(new Set([a.hashCode(), b.hashCode(), h.hashCode(), ss.hashCode()]).size).toBe(1);
    expect(a.equals(SimpleList.of(1, 2, 3))).toBe(false);
  });
  it('containsAll uses value equality', () => expect(lhs(new Point(1, 1), 2).containsAll(SimpleList.of<unknown>(2, new Point(1, 1)))).toBe(true));
});

describe('LinkedHashSet · model test vs JS Set', () => {
  it('random ops keep the same contents and order as a native Set', () => {
    const s = new LinkedHashSet<number | string>();
    const ref = new Set<number | string>();
    const r = rng(11);
    for (let step = 0; step < 30_000; step++) {
      const k = r(3) === 0 ? 's' + r(40) : r(2) === 0 ? r(150) : 5e6 + r(80);
      const op = r(10);
      if (op < 4) {
        expect(s.add(k)).toBe(!ref.has(k));
        ref.add(k);
      } else if (op < 6) {
        expect(s.remove(k)).toBe(ref.delete(k));
      } else if (op < 7) {
        s.addLast(k);
        ref.delete(k);
        ref.add(k);
      } else if (op < 8 && ref.size > 0) {
        const first = ref.values().next().value!;
        expect(s.removeFirst()).toBe(first);
        ref.delete(first);
      } else expect(s.contains(k)).toBe(ref.has(k));
      expect(s.size()).toBe(ref.size);
      if (step % 50 === 0) expect([...s]).toEqual([...ref]);
    }
    expect(s.toArray()).toEqual([...ref]);
    expect(s.reversed().toArray()).toEqual([...ref].reverse());
  });
  it('scales to 100k elements', () => {
    const s = new LinkedHashSet<number>();
    for (let i = 100_000; i > 0; i--) s.add(i);
    expect(s.size()).toBe(100_000);
    expect([s.getFirst(), s.getLast()]).toEqual([100_000, 1]);
    let n = 0;
    for (const e of s) if (e === 100_000 - n++) continue;
    expect(n).toBe(100_000);
  });
});

describe('LinkedHashSet SE 27 additions', () => {
  it('newLinkedHashSet(n) returns an empty LinkedHashSet keeping insertion order', () => {
    const s = LinkedHashSet.newLinkedHashSet<number>(4);
    [3, 1, 2].forEach((x) => s.add(x));
    expect([s instanceof LinkedHashSet, s.toArray()]).toEqual([true, [3, 1, 2]]);
  });
  it('newLinkedHashSet rejects negative and NaN', () => {
    expectThrows(() => LinkedHashSet.newLinkedHashSet(-1), 'IllegalArgumentException');
    expectThrows(() => LinkedHashSet.newLinkedHashSet(NaN), 'IllegalArgumentException');
  });
  it('constructor rejects a non-collection argument with IllegalArgumentException', () => {
    expectThrows(() => new LinkedHashSet({} as never), 'IllegalArgumentException');
    expectThrows(() => new LinkedHashSet(null as never), 'NullPointerException');
  });
  it('toArray(generator) keeps insertion order, also on reversed()', () => {
    const s = LinkedHashSet.of(3, 1, 2);
    expect(Array.from(s.toArray((n) => new Int32Array(n)))).toEqual([3, 1, 2]);
    expect(s.reversed().toArray((n) => new Array<number>(n))).toEqual([2, 1, 3]);
    expectThrows(() => s.reversed().toArray(() => new Int32Array(0)), 'IndexOutOfBoundsException');
  });
});
