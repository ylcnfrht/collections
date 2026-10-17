import { PriorityQueue } from '../src/queue/PriorityQueue';
import { Comparator, naturalCompare } from '../src/util/Comparator';
import { collectionContract } from './contracts/collection';
import { queueContract } from './contracts/queue';
import { expectThrows, Point, rng } from './helpers';
import { SimpleList, SimpleSet } from './support';

collectionContract('PriorityQueue', () => new PriorityQueue(), { allowsNull: false, allowsDuplicates: true, requiresComparable: true });
queueContract('PriorityQueue', () => new PriorityQueue(), { fifo: false });

const rev = (a: number, b: number) => b - a;

function drain<E>(pq: PriorityQueue<E>): E[] {
  const out: E[] = [];
  let x;
  while ((x = pq.poll()) !== null) out.push(x);
  return out;
}

function fill<E>(pq: PriorityQueue<E>, xs: E[]): PriorityQueue<E> {
  for (const x of xs) pq.offer(x);
  return pq;
}

/** Test-only heap invariant check on the internal array. */
function assertHeap<E>(pq: PriorityQueue<E>): void {
  const q = (pq as any).queue as E[];
  const cmp = pq.comparator() ?? naturalCompare;
  for (let i = 1; i < q.length; i++) {
    if (cmp(q[(i - 1) >> 1], q[i]) > 0) throw new Error(`heap violated at ${i}`);
  }
}

const randInts = (seed: number, n: number, range: number) => {
  const r = rng(seed);
  return Array.from({ length: n }, () => r(range));
};
const numAsc = (a: number, b: number) => a - b;

describe('PriorityQueue', () => {
  describe('ordering', () => {
    it('random numbers poll in sorted order', () => {
      const xs = randInts(1, 1000, 1e6);
      expect(drain(fill(new PriorityQueue<number>(), xs))).toEqual([...xs].sort(numAsc));
    });
    it('many ties poll in sorted order', () => {
      const xs = randInts(2, 1000, 5);
      expect(drain(fill(new PriorityQueue<number>(), xs))).toEqual([...xs].sort(numAsc));
    });
    it('strings poll in code unit order', () => {
      const r = rng(3);
      const xs = Array.from({ length: 500 }, () => String.fromCharCode(65 + r(50), 65 + r(50), 0xd800 + r(3)));
      expect(drain(fill(new PriorityQueue<string>(), xs))).toEqual([...xs].sort());
    });
    it('Points poll by compareTo', () => {
      const r = rng(4);
      const xs = Array.from({ length: 300 }, () => new Point(r(10), r(10)));
      const out = drain(fill(new PriorityQueue<Point>(), xs));
      expect(out).toEqual([...xs].sort((a, b) => a.compareTo(b)));
    });
    it('custom comparator', () => {
      const xs = ['ccc', 'a', 'bb', 'dddd', ''];
      expect(drain(fill(new PriorityQueue<string>((a, b) => a.length - b.length), xs))).toEqual(['', 'a', 'bb', 'ccc', 'dddd']);
    });
    it('reverse comparator makes a max-heap', () => {
      const xs = randInts(5, 500, 1000);
      expect(drain(fill(new PriorityQueue<number>(rev), xs))).toEqual([...xs].sort(rev));
    });
    it('Comparator.reverseOrder', () => {
      expect(drain(fill(new PriorityQueue<number>(Comparator.reverseOrder()), [1, 3, 2]))).toEqual([3, 2, 1]);
    });
    it('duplicates are all kept', () => {
      const pq = fill(new PriorityQueue<number>(), [2, 1, 2, 1, 2]);
      expect(pq.size()).toBe(5);
      expect(drain(pq)).toEqual([1, 1, 2, 2, 2]);
    });
    it('NaN sorts last, -0 and 0 tie', () => {
      const out = drain(fill(new PriorityQueue<number>(), [NaN, 3, -Infinity, NaN, Infinity, 0, -0, -1]));
      expect(out.slice(0, 2)).toEqual([-Infinity, -1]);
      expect([out[2], out[3]].every((x) => x === 0)).toBe(true);
      expect(out.slice(4, 6)).toEqual([3, Infinity]);
      expect(out.slice(6).every((x) => x !== x)).toBe(true);
    });
    it('NaN ordering matches naturalCompare exactly', () => {
      const r = rng(6);
      const xs = Array.from({ length: 400 }, () => (r(5) === 0 ? NaN : r(20) - 10));
      const out = drain(fill(new PriorityQueue<number>(), xs));
      expect(out).toEqual([...xs].sort(naturalCompare));
    });
    it('bigints, booleans and Dates use natural ordering', () => {
      expect(drain(fill(new PriorityQueue<bigint>(), [3n, 1n, 2n]))).toEqual([1n, 2n, 3n]);
      expect(drain(fill(new PriorityQueue<boolean>(), [true, false, true]))).toEqual([false, true, true]);
      expect(drain(fill(new PriorityQueue<Date>(), [new Date(3), new Date(1)])).map((d) => d.getTime())).toEqual([1, 3]);
    });
    it('100k random offer/poll matches a sorted array', () => {
      const xs = randInts(7, 100_000, 1e9).map((x) => x / 7);
      expect(drain(fill(new PriorityQueue<number>(), xs))).toEqual(xs.sort(numAsc));
    });
    it('peek is the minimum after every offer', () => {
      const pq = new PriorityQueue<number>();
      let min = Infinity;
      for (const x of randInts(8, 200, 1000)) {
        pq.offer(x);
        min = Math.min(min, x);
        expect(pq.peek()).toBe(min);
      }
    });
    it('top-k idiom with a bounded heap', () => {
      const xs = randInts(9, 10_000, 1e6);
      const k = 10;
      const pq = new PriorityQueue<number>();
      for (const x of xs) {
        if (pq.size() < k) pq.offer(x);
        else if (x > (pq.peek() as number)) {
          pq.poll();
          pq.offer(x);
        }
      }
      expect(drain(pq)).toEqual([...xs].sort(numAsc).slice(-k));
    });
  });

  describe('constructors', () => {
    it('default uses natural ordering', () => expect(new PriorityQueue().comparator()).toBeNull());
    it('comparator getter returns the comparator', () => expect(new PriorityQueue(rev).comparator()).toBe(rev));
    it('null comparator means natural ordering', () => {
      const pq = new PriorityQueue<number>(null);
      expect(pq.comparator()).toBeNull();
      expect(drain(fill(pq, [2, 1]))).toEqual([1, 2]);
    });
    it('initialCapacity', () => {
      const pq = new PriorityQueue<number>(100);
      expect([pq.size(), pq.comparator()]).toEqual([0, null]);
      expect(drain(fill(pq, [3, 1, 2]))).toEqual([1, 2, 3]);
    });
    it('initialCapacity + comparator', () => {
      const pq = new PriorityQueue<number>(1, rev);
      expect(pq.comparator()).toBe(rev);
      expect(drain(fill(pq, [1, 3, 2]))).toEqual([3, 2, 1]);
    });
    it('initialCapacity < 1 throws IllegalArgumentException', () => {
      expectThrows(() => new PriorityQueue(0), 'IllegalArgumentException');
      expectThrows(() => new PriorityQueue(-5), 'IllegalArgumentException');
      expectThrows(() => new PriorityQueue(NaN), 'IllegalArgumentException');
    });
    it('heapify from a plain collection', () => {
      const xs = randInts(10, 1000, 500);
      const pq = new PriorityQueue<number>(SimpleList.of(...xs));
      expect(pq.size()).toBe(1000);
      expect(pq.comparator()).toBeNull();
      assertHeap(pq);
      expect(drain(pq)).toEqual([...xs].sort(numAsc));
    });
    it('copy of another PriorityQueue inherits its comparator and is independent', () => {
      const src = fill(new PriorityQueue<number>(rev), [1, 5, 3]);
      const cp = new PriorityQueue<number>(src);
      expect(cp.comparator()).toBe(rev);
      cp.offer(9);
      expect(src.size()).toBe(3);
      expect(drain(cp)).toEqual([9, 5, 3, 1]);
    });
    it('inherits comparator() of a sorted collection', () => {
      const sortedLike = SimpleList.of(3, 2, 1) as any;
      sortedLike.comparator = () => rev;
      const pq = new PriorityQueue<number>(sortedLike);
      expect(pq.comparator()).toBe(rev);
      expect(drain(pq)).toEqual([3, 2, 1]);
    });
    it('sorted collection with natural comparator() null', () => {
      const s = SimpleList.of(1, 2) as any;
      s.comparator = () => null;
      expect(new PriorityQueue<number>(s).comparator()).toBeNull();
    });
    it('collection with null element throws NullPointerException', () => {
      expectThrows(() => new PriorityQueue<number | null>(SimpleList.of<number | null>(1, null)), 'NullPointerException');
    });
    it('collection of one non-comparable throws ClassCastException', () => {
      expectThrows(() => new PriorityQueue(SimpleList.of({})), 'ClassCastException');
    });
    it('collection of mixed types throws ClassCastException', () => {
      expectThrows(() => new PriorityQueue<unknown>(SimpleSet.of<unknown>(1, 'a')), 'ClassCastException');
    });
    it('static of heapifies', () => {
      const pq = PriorityQueue.of(5, 2, 8, 1);
      assertHeap(pq);
      expect(drain(pq)).toEqual([1, 2, 5, 8]);
      expect(PriorityQueue.of().size()).toBe(0);
    });
    it('static of rejects null', () => expectThrows(() => PriorityQueue.of<unknown>(1, undefined), 'NullPointerException'));
  });

  describe('errors', () => {
    it('offer(null) throws NullPointerException', () => expectThrows(() => new PriorityQueue().offer(null), 'NullPointerException'));
    it('first non-comparable offer throws ClassCastException', () => {
      const pq = new PriorityQueue<unknown>();
      expectThrows(() => pq.offer({}), 'ClassCastException');
      expect(pq.size()).toBe(0);
    });
    it('mixed types throw ClassCastException and leave the queue unchanged', () => {
      const pq = fill(new PriorityQueue<unknown>(), [5, 3, 8, 1, 9, 2]);
      const before = pq.toArray();
      expectThrows(() => pq.offer('x'), 'ClassCastException');
      expect(pq.toArray()).toEqual(before);
      assertHeap(pq);
    });
    it('throwing comparator in offer leaves the queue unchanged', () => {
      let armed = false;
      const pq = new PriorityQueue<number>((a, b) => {
        if (armed) throw new Error('boom');
        return a - b;
      });
      fill(pq, [4, 2, 6, 1]);
      const before = pq.toArray();
      armed = true;
      expect(() => pq.offer(0)).toThrow('boom');
      armed = false;
      expect(pq.toArray()).toEqual(before);
    });
    it('comparator queue accepts objects without natural ordering', () => {
      const pq = new PriorityQueue<{ p: number }>((a, b) => a.p - b.p);
      fill(pq, [{ p: 2 }, { p: 1 }]);
      expect(pq.poll()).toEqual({ p: 1 });
    });
    it('element/remove() on empty throw NoSuchElementException', () => {
      expectThrows(() => new PriorityQueue().element(), 'NoSuchElementException');
      expectThrows(() => new PriorityQueue().remove(), 'NoSuchElementException');
    });
    it('add(null) via addAll throws NullPointerException', () => {
      expectThrows(() => new PriorityQueue<unknown>().addAll(SimpleList.of<unknown>(1, null)), 'NullPointerException');
    });
    it('addAll(this) throws IllegalArgumentException', () => {
      const pq = PriorityQueue.of(1);
      expectThrows(() => pq.addAll(pq), 'IllegalArgumentException');
    });
  });

  describe('removal', () => {
    it('remove(o) of arbitrary elements keeps the heap invariant', () => {
      const r = rng(11);
      const xs = randInts(12, 500, 100);
      const pq = fill(new PriorityQueue<number>(), xs);
      const model = [...xs];
      for (let i = 0; i < 300; i++) {
        const v = model[r(model.length)];
        expect(pq.remove(v)).toBe(true);
        model.splice(model.indexOf(v), 1);
        assertHeap(pq);
      }
      expect(drain(pq)).toEqual(model.sort(numAsc));
    });
    it('remove(o) with a comparator keeps the heap invariant', () => {
      const pq = fill(new PriorityQueue<number>(rev), randInts(13, 200, 1000));
      const arr = pq.toArray();
      for (let i = 0; i < 150; i += 3) {
        pq.remove(arr[i]);
        assertHeap(pq);
      }
    });
    it('remove(o) where the last element must sift up', () => {
      // removing 7 moves 3 (last) into a subtree under 6, where it must rise
      const pq = PriorityQueue.of(1, 6, 2, 7, 8, 3);
      expect((pq as any).queue).toEqual([1, 6, 2, 7, 8, 3]);
      pq.remove(7);
      assertHeap(pq);
      expect(drain(pq)).toEqual([1, 2, 3, 6, 8]);
    });
    it('remove(o) uses equals() and NaN', () => {
      const pq = fill(new PriorityQueue<Point>(), [new Point(1, 1), new Point(2, 2)]);
      expect(pq.remove(new Point(2, 2))).toBe(true);
      expect(pq.size()).toBe(1);
      const n = PriorityQueue.of(1, NaN, 2);
      expect(n.remove(NaN)).toBe(true);
      expect(n.contains(NaN)).toBe(false);
    });
    it('remove(o)/contains with null or another type is false', () => {
      const pq = PriorityQueue.of(1, 2);
      expect([pq.remove(null), pq.remove(undefined), pq.contains('1'), pq.contains(null)]).toEqual([false, false, false, false]);
      expect(pq.size()).toBe(2);
    });
    it('contains on objects uses equals', () => {
      const pq = PriorityQueue.of(new Point(1, 2));
      expect(pq.contains(new Point(1, 2))).toBe(true);
      expect(pq.contains(new Point(2, 1))).toBe(false);
    });
    it('removeIf compacts and re-heapifies', () => {
      const xs = randInts(14, 1000, 1000);
      const pq = fill(new PriorityQueue<number>(), xs);
      expect(pq.removeIf((x) => x % 3 === 0)).toBe(true);
      assertHeap(pq);
      expect(drain(pq)).toEqual(xs.filter((x) => x % 3 !== 0).sort(numAsc));
    });
    it('removeIf with throwing predicate leaves the queue unchanged', () => {
      const pq = PriorityQueue.of(1, 2, 3);
      expect(() =>
        pq.removeIf((x) => {
          if (x === 3) throw new Error('stop');
          return true;
        })
      ).toThrow('stop');
      expect(pq.size()).toBe(3);
    });
    it('removeIf predicate that mutates throws ConcurrentModificationException', () => {
      const pq = PriorityQueue.of(1, 2, 3);
      expectThrows(() => pq.removeIf((x) => (pq.offer(x + 10), false)), 'ConcurrentModificationException');
    });
    it('removeAll and retainAll', () => {
      const a = PriorityQueue.of(1, 2, 3, 4, 5, 2);
      expect(a.removeAll(SimpleList.of(2, 4))).toBe(true);
      expect(drain(a)).toEqual([1, 3, 5]);
      const b = PriorityQueue.of(1, 2, 3, 4, 5, 2);
      expect(b.retainAll(SimpleList.of(2, 4))).toBe(true);
      expect(drain(b)).toEqual([2, 2, 4]);
    });
    it('clear releases references and bumps modCount', () => {
      const pq = PriorityQueue.of(1, 2, 3);
      const it = pq.iterator();
      pq.clear();
      expect((pq as any).queue.length).toBe(0);
      expectThrows(() => it.next(), 'ConcurrentModificationException');
    });
    it('poll clears the vacated slot', () => {
      const pq = PriorityQueue.of(1, 2, 3);
      pq.poll();
      expect((pq as any).queue.length).toBe(2);
    });
  });

  describe('iteration', () => {
    it('toArray is in heap order and is a copy', () => {
      const pq = PriorityQueue.of(3, 1, 2);
      const a = pq.toArray();
      expect(a[0]).toBe(1);
      a.length = 0;
      expect(pq.size()).toBe(3);
    });
    it('for..of matches toArray', () => {
      const pq = fill(new PriorityQueue<number>(), randInts(15, 50, 100));
      expect([...pq]).toEqual(pq.toArray());
      const it = pq[Symbol.iterator]();
      expect(it[Symbol.iterator]()).toBe(it);
    });
    it('Symbol.iterator is not a generator', () => {
      const it = PriorityQueue.of(1)[Symbol.iterator]();
      expect(Object.prototype.toString.call(it)).toBe('[object Object]');
    });
    it('iterator.remove visits every element exactly once (forgetMeNot)', () => {
      // removing 7 pulls 3 above the cursor; it must still be visited
      const pq = PriorityQueue.of(1, 6, 2, 7, 8, 3);
      const seen: number[] = [];
      const it = pq.iterator();
      while (it.hasNext()) {
        const x = it.next();
        seen.push(x);
        if (x === 7) it.remove();
      }
      expect(seen.sort(numAsc)).toEqual([1, 2, 3, 6, 7, 8]);
      expect(drain(pq)).toEqual([1, 2, 3, 6, 8]);
    });
    it('iterator.remove of forgetMeNot elements', () => {
      const pq = PriorityQueue.of(1, 6, 2, 7, 8, 3);
      const it = pq.iterator();
      while (it.hasNext()) {
        const x = it.next();
        if (x === 7 || x === 3) it.remove();
      }
      expectThrows(() => it.next(), 'NoSuchElementException');
      expect(drain(pq)).toEqual([1, 2, 6, 8]);
    });
    it('random iterator removal visits each exactly once and keeps the heap', () => {
      for (let seed = 0; seed < 30; seed++) {
        const r = rng(seed);
        const xs = Array.from({ length: 200 }, (_, i) => i).sort(() => r(3) - 1);
        const pq = fill(new PriorityQueue<number>(), xs);
        const seen: number[] = [];
        const removed = new Set<number>();
        const it = pq.iterator();
        while (it.hasNext()) {
          const x = it.next();
          seen.push(x);
          if (r(2) === 0) {
            it.remove();
            removed.add(x);
            expectThrows(() => it.remove(), 'IllegalStateException');
          }
        }
        expect(seen.sort(numAsc)).toEqual(xs.slice().sort(numAsc));
        assertHeap(pq);
        expect(drain(pq)).toEqual(xs.filter((x) => !removed.has(x)).sort(numAsc));
      }
    });
    it('iterator remove() before next throws IllegalStateException', () => {
      expectThrows(() => PriorityQueue.of(1).iterator().remove(), 'IllegalStateException');
    });
    it('iterator is fail-fast on offer and poll', () => {
      const pq = PriorityQueue.of(1, 2, 3);
      const a = pq.iterator();
      a.next();
      pq.poll();
      expectThrows(() => a.next(), 'ConcurrentModificationException');
      expectThrows(() => a.remove(), 'ConcurrentModificationException');
      const b = pq[Symbol.iterator]();
      b.next();
      pq.offer(0);
      expect(() => b.next()).toThrow();
    });
    it('forEachRemaining and forEach', () => {
      const pq = PriorityQueue.of(3, 1, 2);
      const out: number[] = [];
      pq.forEach((x) => out.push(x));
      expect(out).toEqual(pq.toArray());
      expectThrows(() => pq.forEach(() => pq.offer(9)), 'ConcurrentModificationException');
      expectThrows(() => pq.forEach(null as any), 'NullPointerException');
      expectThrows(() => pq.iterator().forEachRemaining(null as any), 'NullPointerException');
    });
    it('toString in heap order', () => expect(PriorityQueue.of(2, 1).toString()).toBe('[1, 2]'));
  });

  it('model-based random test vs a sorted array', () => {
    const r = rng(42);
    const pq = new PriorityQueue<number>();
    const model: number[] = [];
    for (let step = 0; step < 20_000; step++) {
      const op = r(10);
      const v = r(200);
      if (op < 4) {
        pq.offer(v);
        model.splice(sortedIndex(model, v), 0, v);
      } else if (op < 6) {
        expect(pq.poll()).toBe(model.length ? model.shift() : null);
      } else if (op < 7) {
        expect(pq.peek()).toBe(model.length ? model[0] : null);
      } else if (op < 9) {
        const i = model.indexOf(v);
        expect(pq.remove(v)).toBe(i >= 0);
        if (i >= 0) model.splice(i, 1);
      } else {
        expect(pq.contains(v)).toBe(model.includes(v));
      }
      expect(pq.size()).toBe(model.length);
    }
    assertHeap(pq);
    expect(drain(pq)).toEqual(model);
  });
});

function sortedIndex(a: number[], v: number): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const m = (lo + hi) >>> 1;
    if (a[m] <= v) lo = m + 1;
    else hi = m;
  }
  return lo;
}
