import { ArrayDeque } from '../src/queue/ArrayDeque';
import { collectionContract } from './contracts/collection';
import { dequeContract } from './contracts/deque';
import { queueContract } from './contracts/queue';
import { expectThrows, Point, rng } from './helpers';
import { SimpleList } from './support';

collectionContract('ArrayDeque', () => new ArrayDeque(), { allowsNull: false, allowsDuplicates: true });
queueContract('ArrayDeque', () => new ArrayDeque(), { fifo: true });
dequeContract('ArrayDeque', () => new ArrayDeque(), { allowsNull: false });

const cap = (d: ArrayDeque<unknown>) => d.elements.length;
const holdsNoRef = (x: unknown) => typeof x !== 'object' && typeof x !== 'function';
/** Slots outside [head, tail) must hold no object reference, so removed elements can be collected. */
const vacatedClear = (d: ArrayDeque<unknown>) => {
  const a = d.elements;
  const n = d.size();
  for (let k = n; k < a.length; k++) if (!holdsNoRef(a[(d.head + k) & (a.length - 1)])) return false;
  return true;
};
/** Deque of f(0..n-1) whose storage wraps: head is placed `shift` slots before the end. */
const wrapped = <T = number>(n: number, shift: number, capHint = 7, f: (i: number) => T = (i) => i as T) => {
  const d = new ArrayDeque<T>(capHint);
  for (let i = 0; i < cap(d) - shift; i++) d.addLast(f(-1));
  for (let i = 0; i < cap(d) - shift; i++) d.pollFirst();
  for (let i = 0; i < n; i++) d.addLast(f(i));
  return d;
};
const box = (i: number) => ({ i });
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const drainIt = (it: { hasNext(): boolean; next(): unknown }) => {
  const out: unknown[] = [];
  while (it.hasNext()) out.push(it.next());
  return out;
};

describe('ArrayDeque · implementation', () => {
  describe('construction', () => {
    it('default capacity is a power of two', () => expect(cap(new ArrayDeque())).toBe(16));
    it.each([
      [0, 8],
      [-5, 8],
      [7, 8],
      [8, 16],
      [100, 128],
      [1000, 1024],
    ])('capacity hint %p -> %p slots', (n, c) => expect(cap(new ArrayDeque(n))).toBe(c));
    it('hint NaN falls back to minimum', () => expect(cap(new ArrayDeque(NaN))).toBe(8));
    it.each([2 ** 30, 2 ** 31, Infinity])('huge hint %p is clamped, not rejected', (n) => {
      const d = new ArrayDeque<number>(n);
      expect(cap(d)).toBe(2 ** 30);
      d.addLast(1);
      d.addFirst(0);
      expect([d.toArray(), d.pollLast(), d.pollFirst(), d.isEmpty()]).toEqual([[0, 1], 1, 0, true]);
    });
    it('hinted deque holds n elements without growing', () => {
      const d = new ArrayDeque<number>(100);
      const a = d.elements;
      for (let i = 0; i < 100; i++) d.addLast(i);
      expect(d.elements).toBe(a);
    });
    it('from a collection keeps its order', () => expect(new ArrayDeque(SimpleList.of(3, 1, 2)).toArray()).toEqual([3, 1, 2]));
    it('from another ArrayDeque', () => expect(new ArrayDeque(ArrayDeque.of(1, 2)).toArray()).toEqual([1, 2]));
    it('from null throws NullPointerException', () => expectThrows(() => new ArrayDeque(null as any), 'NullPointerException'));
    it('from a collection with null throws NullPointerException', () =>
      expectThrows(() => new ArrayDeque(SimpleList.of<unknown>(1, null)), 'NullPointerException'));
    it('of(...)', () => {
      const d = ArrayDeque.of('a', 'b', 'c');
      expect([d.toArray(), d.size()]).toEqual([['a', 'b', 'c'], 3]);
    });
    it('of() is empty', () => expect(ArrayDeque.of().isEmpty()).toBe(true));
    it('of(null) throws NullPointerException', () => expectThrows(() => ArrayDeque.of<unknown>(null), 'NullPointerException'));
  });

  describe('null rejection', () => {
    const methods = ['add', 'addFirst', 'addLast', 'offer', 'offerFirst', 'offerLast', 'push'] as const;
    it.each(methods)('%s(undefined) throws and leaves the deque unchanged', (m) => {
      const d = ArrayDeque.of(1);
      expectThrows(() => (d as any)[m](undefined), 'NullPointerException');
      expect(d.toArray()).toEqual([1]);
    });
    it.each(methods)('reversed().%s(null) throws', (m) => expectThrows(() => (ArrayDeque.of(1).reversed() as any)[m](null), 'NullPointerException'));
    it('addAll with a null element throws and adds nothing', () => {
      const d = ArrayDeque.of(1);
      expectThrows(() => d.addAll(SimpleList.of<any>(2, null, 3)), 'NullPointerException');
      expect(d.toArray()).toEqual([1]);
    });
    it('reversed().addAll with undefined throws and adds nothing', () => {
      const d = ArrayDeque.of(1);
      expectThrows(() => d.reversed().addAll(SimpleList.of<any>(2, undefined)), 'NullPointerException');
      expect(d.toArray()).toEqual([1]);
    });
    it('contains/remove of null and undefined are false', () => {
      const d = ArrayDeque.of(1);
      expect([d.contains(null), d.contains(undefined), d.remove(null), d.removeLastOccurrence(undefined)]).toEqual([false, false, false, false]);
    });
  });

  describe('wrap-around', () => {
    it.each([1, 2, 3, 4, 5, 6, 7])('FIFO with head %p slots before the end', (shift) => {
      const d = wrapped(6, shift);
      expect(d.head + 6 > cap(d) || shift >= 6).toBe(true);
      expect(d.toArray()).toEqual(range(6));
      expect([...d]).toEqual(range(6));
      expect(drainIt(d.descendingIterator())).toEqual(range(6).reverse());
      expect(d.toString()).toBe(`[${range(6).join(', ')}]`);
    });
    it.each([8, 16, 32, 64])('addFirst wraps below index 0 at capacity %p', (c) => {
      const d = new ArrayDeque<number>(c - 1);
      for (let i = 0; i < c - 1; i++) d.addFirst(i);
      expect(cap(d)).toBe(c);
      expect(d.toArray()).toEqual(range(c - 1).reverse());
    });
    it.each([8, 16, 32, 64, 128])('growth exactly at capacity %p keeps order', (c) => {
      const d = new ArrayDeque<number>(c - 1);
      for (let i = 0; i < c; i++) d.addLast(i);
      expect(cap(d)).toBe(2 * c);
      expect(d.toArray()).toEqual(range(c));
    });
    it.each([1, 3, 4, 5, 7])('growth while wrapped (head %p before the end)', (shift) => {
      const d = wrapped(7, shift);
      d.addLast(7); // fills slot 8 of 8 -> grows
      expect(cap(d)).toBe(16);
      expect(d.toArray()).toEqual(range(8));
      d.addFirst(-1);
      d.addLast(8);
      expect(d.toArray()).toEqual([-1, ...range(9)]);
    });
    it('growth via addFirst while wrapped', () => {
      const d = wrapped(7, 2);
      d.addFirst(-1);
      expect(cap(d)).toBe(16);
      expect(d.toArray()).toEqual([-1, ...range(7)]);
    });
    it('peekLast/getLast when tail is at index 0', () => {
      const d = wrapped(3, 3);
      expect(d.tail).toBe(0);
      expect([d.peekLast(), d.getLast(), d.pollLast(), d.peekLast()]).toEqual([2, 2, 2, 1]);
    });
    it('toArray of a wrapped deque is a fresh array', () => {
      const d = wrapped(6, 2);
      const a = d.toArray();
      a[0] = 99;
      expect(d.peekFirst()).toBe(0);
    });
  });

  describe('removeFirstOccurrence / removeLastOccurrence in the middle', () => {
    it.each([1, 2, 3, 4, 5, 6, 7])('every position of a wrapped buffer (shift %p)', (shift) => {
      for (let k = 0; k < 7; k++) {
        const d = wrapped(7, shift);
        expect(d.removeFirstOccurrence(k)).toBe(true);
        expect(d.toArray()).toEqual(range(7).filter((x) => x !== k));
          d.addFirst(-1);
        d.addLast(-2);
        expect(d.toArray()).toEqual([-1, ...range(7).filter((x) => x !== k), -2]);
      }
    });
    it('near the head shifts the head side', () => {
      const d = wrapped(7, 3);
      const t = d.tail;
      d.removeFirstOccurrence(1);
      expect(d.tail).toBe(t);
    });
    it('near the tail shifts the tail side', () => {
      const d = wrapped(7, 3);
      const h = d.head;
      d.removeLastOccurrence(5);
      expect(d.head).toBe(h);
    });
    it('removeLastOccurrence picks the last duplicate', () => {
      const d = ArrayDeque.of(1, 2, 1, 2, 1);
      d.removeLastOccurrence(2);
      expect(d.toArray()).toEqual([1, 2, 1, 1]);
    });
    it('NaN and -0 match Objects.equals', () => {
      const d = ArrayDeque.of(1, NaN, 0, NaN);
      expect(d.removeLastOccurrence(NaN)).toBe(true);
      expect(d.removeFirstOccurrence(-0)).toBe(true);
      expect(d.toArray()).toEqual([1, NaN]);
      expect(d.contains(NaN)).toBe(true);
    });
    it('identity-only objects are found across the wrap (native scan path)', () => {
      const xs = range(7).map((k) => ({ k }));
      const d = new ArrayDeque<object>(7);
      for (let i = 0; i < 5; i++) d.addLast({});
      for (let i = 0; i < 5; i++) d.pollFirst();
      for (const x of xs) d.addLast(x);
      expect(d.head > d.tail).toBe(true);
      expect(xs.every((x) => d.contains(x))).toBe(true);
      expect(d.contains({ k: 0 })).toBe(false);
      expect(d.removeLastOccurrence(xs[0])).toBe(true);
      expect(d.removeFirstOccurrence(xs[6])).toBe(true);
      expect(d.toArray()).toEqual(xs.slice(1, 6));
    });
    it('contains / removeXOccurrence agree with a model for every head position and size', () => {
      // values start at 1 so 0 (what free slots are filled with) is never live
      for (let shift = 1; shift <= 16; shift++) {
        for (let n = 0; n < 16; n++) {
          const m = range(n).map((i) => (i % 5) + 1);
          const mk = () => {
            const d = wrapped(0, shift, 15);
            for (const x of m) d.addLast(x);
            return d;
          };
          const d = mk();
          for (let v = -1; v <= 7; v++) {
            const at = `shift ${shift} n ${n} v ${v}`;
            expect([at, d.contains(v)]).toEqual([at, m.includes(v)]);
            const f = mk();
            const fm = [...m];
            if (fm.includes(v)) fm.splice(fm.indexOf(v), 1);
            expect([at, f.removeFirstOccurrence(v), f.toArray()]).toEqual([at, m.includes(v), fm]);
            const l = mk();
            const lm = [...m];
            if (lm.includes(v)) lm.splice(lm.lastIndexOf(v), 1);
            expect([at, l.removeLastOccurrence(v), l.toArray()]).toEqual([at, m.includes(v), lm]);
          }
        }
      }
    });
    it('number targets outside the small-int range, -0, strings and bigints', () => {
      const d = wrapped(0, 3);
      for (const x of [2 ** 31, 1.5, -(2 ** 40), 7, 0]) d.addLast(x);
      expect([d.contains(2 ** 31), d.contains(1.5), d.contains(-(2 ** 40)), d.contains(-0), d.contains(2 ** 32), d.contains('7'), d.contains(7n)]).toEqual([
        true, true, true, true, false, false, false,
      ]);
      expect(d.elements[d.tail]).toBe(0);
      expect(d.removeFirstOccurrence(1.5)).toBe(true);
      expect(d.toArray()).toEqual([2 ** 31, -(2 ** 40), 7, 0]);
    });
    it('sparse buffer (after many polls) still finds elements', () => {
      const d = new ArrayDeque<number>();
      for (let i = 0; i < 1000; i++) d.addLast(i);
      for (let i = 0; i < 995; i++) d.pollFirst();
      expect([d.contains(997), d.contains(5), d.removeLastOccurrence(999), d.removeFirstOccurrence(995)]).toEqual([true, false, true, true]);
      expect(d.toArray()).toEqual([996, 997, 998]);
    });
    it('object targets use equals(); Dates by time; primitives never coerce', () => {
      const d = ArrayDeque.of<unknown>(new Point(1, 1), new Date(3), '1', 1n);
      expect([d.contains(new Point(1, 1)), d.contains(new Date(3)), d.contains(1), d.contains(BigInt(1))]).toEqual([true, true, false, true]);
      expect(d.removeLastOccurrence(new Date(3))).toBe(true);
      expect(d.removeLastOccurrence(new Point(9, 9))).toBe(false);
    });
  });

  describe('iterators while wrapped', () => {
    it.each([1, 3, 6])('iterator.remove of every element (shift %p)', (shift) => {
      for (let k = 0; k < 7; k++) {
        const d = wrapped(7, shift);
        const it = d.iterator();
        const seen: unknown[] = [];
        while (it.hasNext()) {
          const x = it.next();
          seen.push(x);
          if (x === k) it.remove();
        }
        expect(seen).toEqual(range(7));
        expect(d.toArray()).toEqual(range(7).filter((x) => x !== k));
      }
    });
    it.each([1, 3, 6])('descendingIterator.remove of every element (shift %p)', (shift) => {
      for (let k = 0; k < 7; k++) {
        const d = wrapped(7, shift);
        const it = d.descendingIterator();
        const seen: unknown[] = [];
        while (it.hasNext()) {
          const x = it.next();
          seen.push(x);
          if (x === k) it.remove();
        }
        expect(seen).toEqual(range(7).reverse());
        expect(d.toArray()).toEqual(range(7).filter((x) => x !== k));
      }
    });
    it('iterator removes every other element', () => {
      const d = wrapped(7, 4);
      const it = d.iterator();
      while (it.hasNext()) if ((it.next() as number) % 2 === 0) it.remove();
      expect(d.toArray()).toEqual([1, 3, 5]);
    });
    it('descendingIterator removes everything', () => {
      const d = wrapped(7, 2);
      const it = d.descendingIterator();
      while (it.hasNext()) {
        it.next();
        it.remove();
      }
      expect(d.isEmpty()).toBe(true);
    });
    it('descendingIterator.remove twice throws IllegalStateException', () => {
      const it = ArrayDeque.of(1, 2).descendingIterator();
      it.next();
      it.remove();
      expectThrows(() => it.remove(), 'IllegalStateException');
    });
    it('iterator.remove after outside change throws ConcurrentModificationException', () => {
      const d = ArrayDeque.of(1, 2);
      const it = d.iterator();
      it.next();
      d.addLast(3);
      expectThrows(() => it.remove(), 'ConcurrentModificationException');
    });
    it('descendingIterator forEachRemaining', () => {
      const it = ArrayDeque.of(1, 2, 3).descendingIterator();
      it.next();
      const out: number[] = [];
      it.forEachRemaining((x) => out.push(x));
      expect(out).toEqual([2, 1]);
    });
    it('Symbol.iterator is a plain iterator object, not a generator', () => {
      const it = ArrayDeque.of(1)[Symbol.iterator]();
      expect(Object.prototype.toString.call(it)).not.toBe('[object Generator]');
      expect(it[Symbol.iterator]()).toBe(it);
      expect([it.next(), it.next()]).toEqual([
        { value: 1, done: false },
        { value: undefined, done: true },
      ]);
    });
    it('for..of throws ConcurrentModificationException on poll during iteration', () => {
      const d = ArrayDeque.of(1, 2, 3);
      expectThrows(() => {
        for (const _ of d) d.pollFirst();
      }, 'ConcurrentModificationException');
    });
  });

  describe('bulk operations', () => {
    it('removeIf compacts a wrapped buffer in one pass', () => {
      const d = wrapped(7, 3);
      expect(d.removeIf((x) => x % 3 === 0)).toBe(true);
      expect(d.toArray()).toEqual([1, 2, 4, 5]);
      d.addLast(9);
      d.addFirst(8);
      expect(d.toArray()).toEqual([8, 1, 2, 4, 5, 9]);
    });
    it('removeIf with no match does not bump modCount', () => {
      const d = ArrayDeque.of(1, 2);
      const it = d.iterator();
      expect(d.removeIf(() => false)).toBe(false);
      expect(it.next()).toBe(1);
    });
    it('removeIf whose predicate throws leaves the deque unchanged', () => {
      const d = wrapped(7, 3);
      const it = d.iterator();
      expect(() =>
        d.removeIf((x) => {
          if (x === 4) throw new Error('boom');
          return x % 2 === 0;
        })
      ).toThrow('boom');
      expect(d.toArray()).toEqual(range(7));
      expect(it.next()).toBe(0); // no modCount bump either
    });
    it('removeIf whose predicate calls pollLast(): ConcurrentModificationException, no free slot leaks in', () => {
      const d = wrapped(4, 2, 7, (i) => i + 1);
      expectThrows(() => d.removeIf((x) => (x === 1 && d.pollLast(), x === 1)), 'ConcurrentModificationException');
      expect(d.toArray()).toEqual([1, 2, 3]);
      expect(vacatedClear(d)).toBe(true);
    });
    it('removeIf whose predicate calls addLast(9): ConcurrentModificationException, nothing lost', () => {
      const d = wrapped(4, 2, 7, (i) => i + 1);
      expectThrows(() => d.removeIf((x) => (x === 2 && d.addLast(9), x <= 2)), 'ConcurrentModificationException');
      expect(d.toArray()).toEqual([1, 2, 3, 4, 9]);
    });
    it('removeIf on the reversed view whose predicate modifies the deque', () => {
      const d = ArrayDeque.of(1, 2, 3, 4);
      expectThrows(() => d.reversed().removeIf((x) => (x === 4 && d.pollLast(), true)), 'ConcurrentModificationException');
      expect(d.toArray()).toEqual([1, 2, 3]);
    });
    it('removeIf that removes clears vacated slots of a wrapped buffer', () => {
      const d = wrapped(7, 3, 7, box);
      expect(d.removeIf((b) => b.i % 2 === 1)).toBe(true);
      expect(d.toArray().map((b) => b.i)).toEqual([0, 2, 4, 6]);
      expect(vacatedClear(d)).toBe(true);
    });
    it('removeAll / retainAll on a wrapped buffer', () => {
      const a = wrapped(7, 2);
      a.removeAll(SimpleList.of(0, 6, 3));
      expect(a.toArray()).toEqual([1, 2, 4, 5]);
      const b = wrapped(7, 2);
      b.retainAll(SimpleList.of(0, 6, 3));
      expect(b.toArray()).toEqual([0, 3, 6]);
    });
    it('addAll(this) doubles the contents', () => {
      const d = ArrayDeque.of(1, 2);
      d.addAll(d);
      expect(d.toArray()).toEqual([1, 2, 1, 2]);
    });
    it('clear empties a wrapped buffer and clears every slot', () => {
      const d = wrapped(7, 3);
      d.clear();
      expect([d.size(), d.elements.every(holdsNoRef)]).toEqual([0, true]);
      d.addLast(1);
      expect(d.toArray()).toEqual([1]);
    });
    it('forEach visits in order across the wrap', () => {
      const out: number[] = [];
      wrapped(6, 2).forEach((x) => out.push(x));
      expect(out).toEqual(range(6));
    });
    it('forEach is fail-fast', () => {
      const d = ArrayDeque.of(1, 2);
      expectThrows(() => d.forEach((x) => d.addLast(x)), 'ConcurrentModificationException');
    });
    it('toString with a self reference', () => {
      const d = new ArrayDeque<unknown>();
      d.addLast(1);
      d.addLast(d);
      expect(d.toString()).toBe('[1, (this Collection)]');
    });
    it('equals is identity, hashCode stable', () => {
      const d = ArrayDeque.of(1);
      expect([d.equals(d), d.equals(ArrayDeque.of(1)), d.hashCode() === d.hashCode()]).toEqual([true, false, true]);
    });
  });

  describe('GC slot clearing (no references left in free slots)', () => {
    it.each(['pollFirst', 'pollLast', 'removeFirst', 'removeLast', 'pop', 'poll', 'remove'] as const)('%s', (m) => {
      const d = wrapped(5, 2, 7, box);
      (d as any)[m]();
      expect(vacatedClear(d)).toBe(true);
    });
    it.each([0, 1, 2, 3, 4, 5, 6])('removeFirstOccurrence at position %p of a wrapped buffer', (k) => {
      const d = wrapped(7, 3, 7, box);
      expect(d.removeFirstOccurrence(d.toArray()[k])).toBe(true);
      expect(vacatedClear(d)).toBe(true);
    });
    it('iterator.remove and descendingIterator.remove', () => {
      const d = wrapped(6, 2, 7, box);
      const it = d.iterator();
      it.next();
      it.next();
      it.remove();
      const di = d.descendingIterator();
      di.next();
      di.remove();
      expect([d.size(), vacatedClear(d)]).toEqual([4, true]);
    });
    it('removeIf / clear', () => {
      const d = wrapped(7, 3, 7, box);
      d.removeIf((x) => x.i % 2 === 0);
      expect([d.size(), vacatedClear(d)]).toEqual([3, true]);
      d.clear();
      expect(d.elements.every(holdsNoRef)).toBe(true);
    });
    it.each([1, 3, 5])('growth while wrapped (shift %p)', (shift) => {
      const d = wrapped(7, shift, 7, box);
      d.addLast(box(7));
      expect([cap(d), vacatedClear(d)]).toEqual([16, true]);
    });
    it('a polled object is no longer referenced', () => {
      const o = {};
      const d = ArrayDeque.of<object>(o, {});
      d.pollFirst();
      expect(d.elements.includes(o)).toBe(false);
    });
    it('model run with objects leaves no stale references', () => {
      const r = rng(5);
      const d = new ArrayDeque<{ i: number }>(1);
      for (let step = 0; step < 3000; step++) {
        const op = r(6);
        if (op < 2) d.addLast(box(r(9)));
        else if (op === 2) d.addFirst(box(r(9)));
        else if (op === 3) d.pollFirst();
        else if (op === 4) d.pollLast();
        else {
          const k = r(d.size() + 1);
          if (k < d.size()) d.removeLastOccurrence(d.toArray()[k]);
        }
        if (!vacatedClear(d)) throw new Error(`stale reference at step ${step}`);
      }
    });
  });

  describe('reversed() view', () => {
    it('reversed().reversed() is the original', () => {
      const d = ArrayDeque.of(1);
      expect(d.reversed().reversed()).toBe(d);
    });
    it('full mirrored API', () => {
      const d = ArrayDeque.of(1, 2, 3);
      const r = d.reversed();
      expect([r.size(), r.isEmpty(), r.contains(2), r.toArray(), r.toString()]).toEqual([3, false, true, [3, 2, 1], '[3, 2, 1]']);
      expect([r.peek(), r.element(), r.getFirst(), r.getLast(), r.peekLast()]).toEqual([3, 3, 3, 1, 1]);
      r.push(4); // original tail
      r.offer(0); // original head
      r.add(-1);
      r.addLast(-2);
      expect(d.toArray()).toEqual([-2, -1, 0, 1, 2, 3, 4]);
      expect([r.pop(), r.removeFirst(), r.removeLast(), r.pollLast(), r.pollFirst(), r.poll()]).toEqual([4, 3, -2, -1, 2, 1]);
      expect(d.toArray()).toEqual([0]);
      expect(r.remove()).toBe(0);
      expect(r.isEmpty()).toBe(true);
    });
    it('remove(o) and removeXOccurrence are mirrored', () => {
      const d = ArrayDeque.of(1, 2, 1, 2, 1);
      const r = d.reversed();
      r.remove(2); // last 2 of the original
      expect(d.toArray()).toEqual([1, 2, 1, 1]);
      r.removeLastOccurrence(1); // first 1 of the original
      expect(d.toArray()).toEqual([2, 1, 1]);
      r.removeFirstOccurrence(1);
      expect(d.toArray()).toEqual([2, 1]);
    });
    it('descendingIterator of the view is forward order', () => expect(drainIt(ArrayDeque.of(1, 2, 3).reversed().descendingIterator())).toEqual([1, 2, 3]));
    it('iterator of the view removes from the original', () => {
      const d = ArrayDeque.of(1, 2, 3);
      const it = d.reversed().iterator();
      it.next();
      it.remove();
      expect(d.toArray()).toEqual([1, 2]);
    });
    it('addAll on the view prepends in view order', () => {
      const d = ArrayDeque.of(1);
      expect(d.reversed().addAll(SimpleList.of(2, 3))).toBe(true);
      expect(d.toArray()).toEqual([3, 2, 1]);
      expect(d.reversed().addAll(SimpleList.of())).toBe(false);
    });
    it('clear / removeIf / forEach through the view', () => {
      const d = ArrayDeque.of(1, 2, 3, 4);
      const r = d.reversed();
      r.removeIf((x) => x % 2 === 0);
      const seen: number[] = [];
      r.forEach((x) => seen.push(x));
      expect(seen).toEqual([3, 1]);
      r.clear();
      expect(d.isEmpty()).toBe(true);
    });
    it('for..of over the view is fail-fast', () => {
      const d = ArrayDeque.of(1, 2);
      expectThrows(() => {
        for (const x of d.reversed()) d.addLast(x);
      }, 'ConcurrentModificationException');
    });
  });

  describe('toArray(generator)', () => {
    it('wrapped buffer into a generated typed array of exactly size()', () => {
      const d = wrapped(6, 2);
      const lens: number[] = [];
      const out = d.toArray((n) => (lens.push(n), new Int16Array(n)));
      expect(out).toBeInstanceOf(Int16Array);
      expect(Array.from(out)).toEqual(range(6));
      expect(lens).toEqual([6]);
    });
    it('reversed view of a wrapped buffer', () => {
      expect(wrapped(6, 2).reversed().toArray((n) => new Array<number>(n))).toEqual(range(6).reverse());
    });
    it('a too-short fixed-size result throws IndexOutOfBoundsException', () =>
      expectThrows(() => ArrayDeque.of(1, 2).toArray(() => new Int8Array(1)), 'IndexOutOfBoundsException'));
  });

  describe('clone', () => {
    it('copies contents and order', () => expect(wrapped(6, 2).clone().toArray()).toEqual(range(6)));
    it('is independent of the original', () => {
      const d = wrapped(6, 2);
      const c = d.clone();
      c.addLast(100);
      c.pollFirst();
      d.addFirst(-1);
      expect(d.toArray()).toEqual([-1, ...range(6)]);
      expect(c.toArray()).toEqual([...range(6).slice(1), 100]);
      expect(c.elements).not.toBe(d.elements);
    });
    it('keeps the runtime subclass', () => {
      class Sub<E> extends ArrayDeque<E> {
        tag = 'sub';
      }
      const s = new Sub<number>();
      s.addLast(1);
      s.addLast(2);
      const c = s.clone();
      expect(c).toBeInstanceOf(Sub);
      expect((c as Sub<number>).tag).toBe('sub');
      expect(c.toArray()).toEqual([1, 2]);
    });
    it('clone of empty is empty and usable', () => {
      const c = new ArrayDeque<number>().clone();
      c.push(1);
      expect(c.toArray()).toEqual([1]);
    });
  });

  describe('scale', () => {
    it('1M push / pop', () => {
      const d = new ArrayDeque<number>();
      for (let i = 0; i < 1_000_000; i++) d.push(i);
      expect(d.size()).toBe(1_000_000);
      let ok = true;
      for (let i = 999_999; i >= 0; i--) if (d.pop() !== i) ok = false;
      expect([ok, d.isEmpty()]).toEqual([true, true]);
    });
    it('1M addLast / pollFirst', () => {
      const d = new ArrayDeque<number>();
      for (let i = 0; i < 1_000_000; i++) d.addLast(i);
      let sum = 0;
      let x;
      while ((x = d.pollFirst()) !== null) sum += x;
      expect(sum).toBe(499_999_500_000);
    });
  });

  describe('model-based vs JS array, tiny capacity (forces wrapping)', () => {
    it.each([1, 7, 42, 99, 2024])('seed %p, 6000 ops', (seed) => {
      const r = rng(seed);
      const d = new ArrayDeque<number>(1);
      const m: number[] = [];
      for (let step = 0; step < 6000; step++) {
        const op = r(16);
        const v = r(12);
        const at = `step ${step} op ${op}`;
        const same = (a: unknown, b: unknown) => expect([at, a]).toEqual([at, b]);
        switch (op) {
          case 0: case 1: d.addFirst(v); m.unshift(v); break;
          case 2: case 3: d.addLast(v); m.push(v); break;
          case 4: same(d.pollFirst(), m.length ? m.shift() : null); break;
          case 5: same(d.pollLast(), m.length ? m.pop() : null); break;
          case 6: { const i = m.indexOf(v); same(d.removeFirstOccurrence(v), i !== -1); if (i !== -1) m.splice(i, 1); break; }
          case 7: { const i = m.lastIndexOf(v); same(d.removeLastOccurrence(v), i !== -1); if (i !== -1) m.splice(i, 1); break; }
          case 8: { // iterator.remove at a random position
            const k = r(m.length + 1);
            const it = d.iterator();
            for (let i = 0; i < k && it.hasNext(); i++) it.next();
            if (k > 0 && k <= m.length) { it.remove(); m.splice(k - 1, 1); }
            break;
          }
          case 9: { // descendingIterator.remove at a random position
            const k = r(m.length + 1);
            const it = d.descendingIterator();
            for (let i = 0; i < k && it.hasNext(); i++) it.next();
            if (k > 0 && k <= m.length) { it.remove(); m.splice(m.length - k, 1); }
            break;
          }
          case 10: if (r(8) === 0) { d.removeIf((x) => x === v); for (let i = m.length - 1; i >= 0; i--) if (m[i] === v) m.splice(i, 1); } break;
          case 11: same(d.contains(v), m.includes(v)); break;
          case 12: same(d.peekFirst(), m.length ? m[0] : null); same(d.peekLast(), m.length ? m[m.length - 1] : null); break;
          case 13: same(d.toArray(), m); break;
          case 14: if (r(60) === 0) { d.clear(); m.length = 0; } break;
          case 15: same([...d.reversed()], [...m].reverse()); break;
        }
        same(d.size(), m.length);
      }
      expect(d.toArray()).toEqual(m);
    });
  });
});
