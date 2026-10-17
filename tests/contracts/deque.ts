import { Deque } from '../../src/interfaces/Queue';
import { expectThrows, Point, rng, timeIt } from '../helpers';

export interface DequeOptions {
  allowsNull: boolean;
}

/** Deque contract (both ends, stack use, descending iteration, reversed view). */
export function dequeContract(name: string, create: () => Deque<any>, opts: DequeOptions) {
  const of = (...xs: unknown[]) => {
    const d = create();
    for (const x of xs) d.addLast(x);
    return d;
  };
  const NSEE = 'NoSuchElementException';

  describe(`${name} · Deque`, () => {
    describe('insert at both ends', () => {
      it('offerFirst / offerLast return true', () => {
        const d = create();
        expect([d.offerFirst(1), d.offerLast(2)]).toEqual([true, true]);
        expect(d.toArray()).toEqual([1, 2]);
      });
      it('addFirst / addLast', () => {
        const d = create();
        d.addLast(2);
        d.addFirst(1);
        d.addLast(3);
        d.addFirst(0);
        expect(d.toArray()).toEqual([0, 1, 2, 3]);
      });
      it('add = addLast, offer = offerLast', () => {
        const d = of(1);
        d.add(2);
        d.offer(3);
        expect(d.toArray()).toEqual([1, 2, 3]);
      });
      it('push = addFirst', () => {
        const d = of(2);
        d.push(1);
        expect(d.toArray()).toEqual([1, 2]);
      });
      if (opts.allowsNull) {
        it('accepts null at both ends', () => {
          const d = create();
          d.addFirst(null);
          d.addLast(null);
          expect(d.size()).toBe(2);
        });
      } else {
        it.each(['addFirst', 'addLast', 'offerFirst', 'offerLast', 'push', 'add', 'offer'] as const)('%s(null) throws NullPointerException', (m) =>
          expectThrows(() => (create() as any)[m](null), 'NullPointerException')
        );
      }
    });

    describe('examine', () => {
      it('peekFirst / peekLast', () => {
        const d = of(1, 2, 3);
        expect([d.peekFirst(), d.peekLast()]).toEqual([1, 3]);
      });
      it('peekFirst / peekLast on empty are null', () => expect([create().peekFirst(), create().peekLast()]).toEqual([null, null]));
      it('getFirst / getLast', () => {
        const d = of(1, 2);
        expect([d.getFirst(), d.getLast()]).toEqual([1, 2]);
      });
      it('getFirst / getLast on empty throw NoSuchElementException', () => {
        expectThrows(() => create().getFirst(), NSEE);
        expectThrows(() => create().getLast(), NSEE);
      });
      it('peek = peekFirst, element = getFirst', () => {
        const d = of(1, 2);
        expect([d.peek(), d.element()]).toEqual([1, 1]);
      });
      it('single element is both first and last', () => {
        const d = of(7);
        expect([d.peekFirst(), d.peekLast()]).toEqual([7, 7]);
      });
    });

    describe('remove', () => {
      it('pollFirst / pollLast', () => {
        const d = of(1, 2, 3);
        expect([d.pollFirst(), d.pollLast(), d.toArray()]).toEqual([1, 3, [2]]);
      });
      it('pollFirst / pollLast on empty are null', () => expect([create().pollFirst(), create().pollLast()]).toEqual([null, null]));
      it('removeFirst / removeLast', () => {
        const d = of(1, 2, 3);
        expect([d.removeFirst(), d.removeLast(), d.toArray()]).toEqual([1, 3, [2]]);
      });
      it('removeFirst / removeLast on empty throw NoSuchElementException', () => {
        expectThrows(() => create().removeFirst(), NSEE);
        expectThrows(() => create().removeLast(), NSEE);
      });
      it('poll = pollFirst, remove() = removeFirst', () => {
        const d = of(1, 2, 3);
        expect([d.poll(), d.remove()]).toEqual([1, 2]);
      });
      it('pop = removeFirst', () => expect(of(1, 2).pop()).toBe(1));
      it('pop on empty throws NoSuchElementException', () => expectThrows(() => create().pop(), NSEE));
      it('removeFirstOccurrence', () => {
        const d = of(1, 2, 1, 3);
        expect(d.removeFirstOccurrence(1)).toBe(true);
        expect(d.toArray()).toEqual([2, 1, 3]);
      });
      it('removeLastOccurrence', () => {
        const d = of(1, 2, 1, 3);
        expect(d.removeLastOccurrence(1)).toBe(true);
        expect(d.toArray()).toEqual([1, 2, 3]);
      });
      it('removeLastOccurrence of the tail keeps the tail valid', () => {
        const d = of(1, 2);
        d.removeLastOccurrence(2);
        d.addLast(3);
        expect([d.toArray(), d.peekLast()]).toEqual([[1, 3], 3]);
      });
      it('removeFirstOccurrence of the head keeps the head valid', () => {
        const d = of(1, 2);
        d.removeFirstOccurrence(1);
        d.addFirst(0);
        expect([d.toArray(), d.peekFirst()]).toEqual([[0, 2], 0]);
      });
      it('removeXOccurrence uses equals()', () => {
        const d = of(new Point(1, 1), new Point(2, 2));
        expect(d.removeLastOccurrence(new Point(1, 1))).toBe(true);
        expect(d.size()).toBe(1);
      });
      it('removeXOccurrence absent returns false', () => {
        expect(of(1).removeFirstOccurrence(9)).toBe(false);
        expect(of(1).removeLastOccurrence(9)).toBe(false);
      });
      it('remove(Object) = removeFirstOccurrence', () => {
        const d = of(1, 2, 1);
        d.remove(1);
        expect(d.toArray()).toEqual([2, 1]);
      });
      it('drain from alternating ends', () => {
        const d = of(1, 2, 3, 4, 5);
        expect([d.pollFirst(), d.pollLast(), d.pollFirst(), d.pollLast(), d.pollFirst(), d.pollLast()]).toEqual([1, 5, 2, 4, 3, null]);
      });
      it('reusable after full drain from the back', () => {
        const d = of(1, 2);
        d.pollLast();
        d.pollLast();
        d.addFirst(9);
        expect([d.peekFirst(), d.peekLast(), d.size()]).toEqual([9, 9, 1]);
      });
    });

    describe('stack (LIFO) use', () => {
      it('push / pop', () => {
        const d = create();
        d.push(1);
        d.push(2);
        d.push(3);
        expect([d.pop(), d.pop(), d.pop()]).toEqual([3, 2, 1]);
      });
      it('peek sees the top', () => {
        const d = create();
        d.push(1);
        d.push(2);
        expect(d.peek()).toBe(2);
      });
      it('iteration is top to bottom', () => {
        const d = create();
        d.push(1);
        d.push(2);
        expect([...d]).toEqual([2, 1]);
      });
    });

    describe('descendingIterator', () => {
      it('iterates tail to head', () => {
        const it = of(1, 2, 3).descendingIterator();
        const out: number[] = [];
        while (it.hasNext()) out.push(it.next());
        expect(out).toEqual([3, 2, 1]);
      });
      it('empty', () => expect(create().descendingIterator().hasNext()).toBe(false));
      it('next past end throws NoSuchElementException', () => expectThrows(() => create().descendingIterator().next(), NSEE));
      it('remove() removes the returned element', () => {
        const d = of(1, 2, 3);
        const it = d.descendingIterator();
        it.next();
        it.next();
        it.remove();
        expect(d.toArray()).toEqual([1, 3]);
      });
      it('remove() before next() throws IllegalStateException', () => expectThrows(() => of(1).descendingIterator().remove(), 'IllegalStateException'));
      it('is fail-fast', () => {
        const d = of(1, 2);
        const it = d.descendingIterator();
        it.next();
        d.addFirst(0);
        expectThrows(() => it.next(), 'ConcurrentModificationException');
      });
    });

    describe('reversed() view', () => {
      it('iterates in reverse', () => expect([...of(1, 2, 3).reversed()]).toEqual([3, 2, 1]));
      it('ends are swapped', () => {
        const r = of(1, 2, 3).reversed();
        expect([r.peekFirst(), r.peekLast(), r.getFirst(), r.getLast()]).toEqual([3, 1, 3, 1]);
      });
      it('writes go through, mirrored', () => {
        const d = of(1, 2);
        const r = d.reversed();
        r.addFirst(3);
        r.offerLast(0);
        expect(d.toArray()).toEqual([0, 1, 2, 3]);
      });
      it('poll on the view takes from the original tail', () => {
        const d = of(1, 2, 3);
        expect(d.reversed().poll()).toBe(3);
        expect(d.toArray()).toEqual([1, 2]);
      });
      it('reflects later changes', () => {
        const d = of(1);
        const r = d.reversed();
        d.addLast(2);
        expect(r.peekFirst()).toBe(2);
        expect(r.size()).toBe(2);
      });
      it('reversed().reversed() has the original order', () => expect([...of(1, 2).reversed().reversed()]).toEqual([1, 2]));
    });

    describe('performance (O(1) at both ends)', () => {
      it('100k addFirst + removeLast under 500ms', () => {
        const d = create();
        const ms = timeIt(() => {
          for (let i = 0; i < 100_000; i++) d.addFirst(i);
          while (!d.isEmpty()) d.removeLast();
        });
        expect(ms).toBeLessThan(500);
      });
      it('100k addLast + removeFirst under 500ms', () => {
        const d = create();
        const ms = timeIt(() => {
          for (let i = 0; i < 100_000; i++) d.addLast(i);
          while (!d.isEmpty()) d.removeFirst();
        });
        expect(ms).toBeLessThan(500);
      });
    });

    describe('model-based: random deque ops vs JS array', () => {
      it.each([11, 22, 33, 44, 55])('seed %p, 4000 ops', (seed) => {
        const r = rng(seed);
        const d = create();
        const m: number[] = [];
        for (let step = 0; step < 4000; step++) {
          const op = r(11);
          const v = r(10);
          const at = `step ${step} op ${op}`;
          const same = (a: unknown, b: unknown) => expect([at, a]).toEqual([at, b]);
          switch (op) {
            case 0: d.offerFirst(v); m.unshift(v); break;
            case 1: d.offerLast(v); m.push(v); break;
            case 2: same(d.pollFirst(), m.length ? m.shift() : null); break;
            case 3: same(d.pollLast(), m.length ? m.pop() : null); break;
            case 4: same(d.peekFirst(), m.length ? m[0] : null); break;
            case 5: same(d.peekLast(), m.length ? m[m.length - 1] : null); break;
            case 6: { const i = m.indexOf(v); same(d.removeFirstOccurrence(v), i !== -1); if (i !== -1) m.splice(i, 1); break; }
            case 7: { const i = m.lastIndexOf(v); same(d.removeLastOccurrence(v), i !== -1); if (i !== -1) m.splice(i, 1); break; }
            case 8: d.push(v); m.unshift(v); break;
            case 9: same(d.contains(v), m.includes(v)); break;
            case 10: if (r(50) === 0) { d.clear(); m.length = 0; } break;
          }
          same(d.size(), m.length);
        }
        expect(d.toArray()).toEqual(m);
        const back: number[] = [];
        const it = d.descendingIterator();
        while (it.hasNext()) back.push(it.next());
        expect(back).toEqual([...m].reverse());
      });
    });
  });
}
