import { Queue } from '../../src/interfaces/Queue';
import { expectThrows, timeIt } from '../helpers';
import { SimpleList } from '../support';

export interface QueueOptions {
  /** insertion order (LinkedList, ArrayDeque); false for priority queues */
  fifo: boolean;
}

/** Queue contract. Elements used are distinct non-null numbers. */
export function queueContract(name: string, create: () => Queue<any>, opts: QueueOptions) {
  const of = (...xs: unknown[]) => {
    const q = create();
    for (const x of xs) q.offer(x);
    return q;
  };
  const NSEE = 'NoSuchElementException';

  describe(`${name} · Queue`, () => {
    describe('insert', () => {
      it('offer returns true', () => expect(create().offer(1)).toBe(true));
      it('add returns true', () => expect(create().add(1)).toBe(true));
      it('offer increments size', () => expect(of(1, 2, 3).size()).toBe(3));
      it('addAll(SimpleList)', () => {
        const q = create();
        q.addAll(SimpleList.of(1, 2));
        expect(q.size()).toBe(2);
      });
    });

    describe('examine', () => {
      it('peek on empty is null', () => expect(create().peek()).toBeNull());
      it('element on empty throws NoSuchElementException', () => expectThrows(() => create().element(), NSEE));
      it('peek does not remove', () => {
        const q = of(1, 2);
        const h = q.peek();
        expect([q.peek(), q.size()]).toEqual([h, 2]);
      });
      it('element does not remove', () => {
        const q = of(1);
        expect(q.element()).toBe(1);
        expect(q.size()).toBe(1);
      });
      it('peek and element agree', () => {
        const q = of(3, 1, 2);
        expect(q.peek()).toBe(q.element());
      });
    });

    describe('remove', () => {
      it('poll on empty is null', () => expect(create().poll()).toBeNull());
      it('remove() on empty throws NoSuchElementException', () => expectThrows(() => create().remove(), NSEE));
      it('poll returns the head and shrinks', () => {
        const q = of(1, 2);
        const h = q.peek();
        expect(q.poll()).toBe(h);
        expect(q.size()).toBe(1);
      });
      it('remove() returns the head and shrinks', () => {
        const q = of(1, 2);
        const h = q.peek();
        expect(q.remove()).toBe(h);
        expect(q.size()).toBe(1);
      });
      it('remove(Object) removes that element, not the head', () => {
        const q = of(1, 2, 3);
        expect(q.remove(2)).toBe(true);
        expect(q.size()).toBe(2);
        expect(q.contains(2)).toBe(false);
        expect(q.contains(1)).toBe(true);
        expect(q.contains(3)).toBe(true);
      });
      it('remove(Object) of the head', () => {
        const q = of(1, 2);
        const h = q.peek();
        q.remove(h);
        expect(q.size()).toBe(1);
        expect(q.peek()).not.toBe(h);
      });
      it('remove(Object) absent returns false', () => expect(of(1).remove(9)).toBe(false));
      it('poll drains every element exactly once', () => {
        const q = of(5, 3, 1, 4, 2);
        const out: number[] = [];
        let x;
        while ((x = q.poll()) !== null) out.push(x);
        expect(out.sort()).toEqual([1, 2, 3, 4, 5]);
        expect(q.isEmpty()).toBe(true);
      });
      it('reusable after drained', () => {
        const q = of(1);
        q.poll();
        q.offer(2);
        expect([q.peek(), q.size()]).toEqual([2, 1]);
      });
      it('clear empties', () => {
        const q = of(1, 2);
        q.clear();
        expect([q.size(), q.poll(), q.peek()]).toEqual([0, null, null]);
      });
    });

    describe('removeIf is all-or-nothing', () => {
      const sorted = (q: Queue<any>) => q.toArray().sort((x: number, y: number) => x - y);
      it('predicate that polls throws ConcurrentModificationException and removes nothing else', () => {
        const q = of(1, 2, 3, 4);
        let first = true;
        expectThrows(
          () =>
            q.removeIf(() => {
              if (first) {
                first = false;
                q.poll();
              }
              return true;
            }),
          'ConcurrentModificationException'
        );
        expect(sorted(q)).toEqual([2, 3, 4]);
      });
      it('predicate that offers throws ConcurrentModificationException and removes nothing', () => {
        const q = of(1, 2, 3, 4);
        let first = true;
        expectThrows(
          () =>
            q.removeIf(() => {
              if (first) {
                first = false;
                q.offer(9);
              }
              return true;
            }),
          'ConcurrentModificationException'
        );
        expect(sorted(q)).toEqual([1, 2, 3, 4, 9]);
      });
      it('throwing predicate leaves the queue unchanged', () => {
        const q = of(1, 2, 3, 4);
        expect(() =>
          q.removeIf((x: number) => {
            if (x === 3) throw new Error('boom');
            return true;
          })
        ).toThrow('boom');
        expect(sorted(q)).toEqual([1, 2, 3, 4]);
      });
    });

    if (opts.fifo) {
      describe('FIFO order', () => {
        it('poll in insertion order', () => {
          const q = of(1, 2, 3);
          expect([q.poll(), q.poll(), q.poll(), q.poll()]).toEqual([1, 2, 3, null]);
        });
        it('remove() in insertion order', () => {
          const q = of('a', 'b');
          expect([q.remove(), q.remove()]).toEqual(['a', 'b']);
        });
        it('peek sees the oldest', () => expect(of(3, 1, 2).peek()).toBe(3));
        it('interleaved offer/poll', () => {
          const q = create();
          q.offer(1);
          q.offer(2);
          expect(q.poll()).toBe(1);
          q.offer(3);
          expect([q.poll(), q.poll(), q.poll()]).toEqual([2, 3, null]);
        });
        it('iteration is FIFO', () => expect([...of(1, 2, 3)]).toEqual([1, 2, 3]));
        it('toString is FIFO', () => expect(of(1, 2, 3).toString()).toBe('[1, 2, 3]'));
        it('remove(Object) keeps order of the rest', () => {
          const q = of(1, 2, 3, 4);
          q.remove(2);
          expect(q.toArray()).toEqual([1, 3, 4]);
        });
        it('wraps around many times (ring buffers)', () => {
          const q = create();
          const out: number[] = [];
          for (let i = 0; i < 1000; i++) {
            q.offer(i);
            q.offer(i + 0.5);
            out.push(q.poll());
          }
          expect(out).toEqual(Array.from({ length: 1000 }, (_, i) => i / 2));
          expect(q.size()).toBe(1000);
        });
      });
    }

    describe('performance', () => {
      it('100k offer + poll under 500ms (O(1) / O(log n) each)', () => {
        const q = create();
        let n = 0;
        const ms = timeIt(() => {
          for (let i = 0; i < 100_000; i++) q.offer(i);
          while (q.poll() !== null) n++;
        });
        expect(n).toBe(100_000);
        expect(ms).toBeLessThan(500);
      });
    });
  });
}
