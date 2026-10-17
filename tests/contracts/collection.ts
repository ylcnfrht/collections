import { Collection } from '../../src/interfaces/Collection';
import { expectThrows, Point } from '../helpers';
import { SimpleList } from '../support';

export interface CollectionOptions {
  /** null/undefined elements accepted (else NullPointerException) */
  allowsNull: boolean;
  /** duplicates kept (lists/queues) vs ignored (sets) */
  allowsDuplicates: boolean;
  /** sorted collections: elements must be mutually comparable */
  requiresComparable?: boolean;
}

/** Collection + Iterator contract (order-agnostic). */
export function collectionContract(name: string, create: () => Collection<any>, opts: CollectionOptions) {
  const of = (...xs: unknown[]) => {
    const c = create();
    for (const x of xs) c.add(x);
    return c;
  };
  const sl = (...xs: unknown[]) => SimpleList.of<unknown>(...xs);
  const sorted = (c: Collection<any>) => [...c.toArray()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const anyType = !opts.requiresComparable;

  describe(`${name} · Collection`, () => {
    describe('size / isEmpty', () => {
      it('new collection is empty', () => {
        const c = create();
        expect(c.size()).toBe(0);
        expect(c.isEmpty()).toBe(true);
      });
      it('size counts distinct adds', () => expect(of(1, 2, 3).size()).toBe(3));
      it('isEmpty false after add', () => expect(of(1).isEmpty()).toBe(false));
      it('instances do not share state', () => {
        of(1, 2);
        expect(create().size()).toBe(0);
      });
      it('size back to 0 after removing everything', () => {
        const c = of(1, 2);
        c.remove(1);
        c.remove(2);
        expect(c.size()).toBe(0);
        expect(c.isEmpty()).toBe(true);
      });
    });

    describe('add', () => {
      it('returns true when changed', () => expect(create().add(1)).toBe(true));
      it('increments size', () => {
        const c = create();
        c.add('a');
        c.add('b');
        expect(c.size()).toBe(2);
      });
      if (opts.allowsDuplicates) {
        it('keeps duplicates', () => {
          const c = create();
          expect([c.add(1), c.add(1), c.size()]).toEqual([true, true, 2]);
        });
      } else {
        it('ignores duplicates and returns false', () => {
          const c = create();
          expect([c.add(1), c.add(1), c.size()]).toEqual([true, false, 1]);
        });
      }
      it('keeps 0 and empty string', () => {
        expect(of(0, 1).size()).toBe(2);
        expect(of('', 'a').size()).toBe(2);
      });
      if (anyType) {
        it('keeps mixed falsy values', () => expect(of(0, '', false).size()).toBe(3));
        it('stores object references', () => {
          const o = {};
          expect(of(o).toArray()[0]).toBe(o);
        });
      }
      if (opts.allowsNull) {
        it('accepts null', () => {
          const c = create();
          expect(c.add(null)).toBe(true);
          expect(c.size()).toBe(1);
          expect(c.contains(null)).toBe(true);
        });
        it('accepts undefined', () => {
          const c = create();
          expect(c.add(undefined)).toBe(true);
          expect(c.size()).toBe(1);
          expect(c.contains(undefined)).toBe(true);
        });
      } else {
        it('rejects null with NullPointerException', () => expectThrows(() => create().add(null), 'NullPointerException'));
        it('rejects undefined with NullPointerException', () => expectThrows(() => create().add(undefined), 'NullPointerException'));
        it('failed null add leaves collection unchanged', () => {
          const c = of(1);
          try {
            c.add(null);
          } catch {}
          expect(c.size()).toBe(1);
        });
      }
    });

    describe('contains (Objects.equals)', () => {
      it('finds present element', () => expect(of(1, 2).contains(2)).toBe(true));
      it('absent element', () => expect(of(1, 2).contains(3)).toBe(false));
      it('empty contains nothing', () => expect(create().contains(1)).toBe(false));
      it('NaN equals NaN', () => expect(of(NaN).contains(NaN)).toBe(true));
      it('-0 equals +0', () => expect(of(0).contains(-0)).toBe(true));
      it('uses element equals()', () => expect(of(new Point(1, 2)).contains(new Point(1, 2))).toBe(true));
      it('different value objects are not contained', () => expect(of(new Point(1, 2)).contains(new Point(2, 1))).toBe(false));
      it('strings by value', () => expect(of('ab').contains('a' + 'b')).toBe(true));
      if (anyType) {
        it('does not coerce types', () => expect(of(1).contains('1')).toBe(false));
        it('plain objects compare by identity', () => expect(of({ a: 1 }).contains({ a: 1 })).toBe(false));
        it('Dates compare by time', () => expect(of(new Date(5)).contains(new Date(5))).toBe(true));
      }
      if (opts.allowsNull) {
        it('contains(null)', () => expect(of(1, null).contains(null)).toBe(true));
        it('null and undefined are different', () => expect(of(null).contains(undefined)).toBe(false));
      }
    });

    describe('remove(Object)', () => {
      it('removes and returns true', () => {
        const c = of(1, 2);
        expect(c.remove(1)).toBe(true);
        expect(c.size()).toBe(1);
        expect(c.contains(1)).toBe(false);
      });
      if (opts.allowsDuplicates) {
        it('removes a single instance of duplicates', () => {
          const c = of(1, 1);
          c.remove(1);
          expect(c.size()).toBe(1);
          expect(c.contains(1)).toBe(true);
        });
      }
      it('returns false when absent', () => {
        const c = of(1);
        expect(c.remove(9)).toBe(false);
        expect(c.size()).toBe(1);
      });
      it('uses equals()', () => {
        const c = of(new Point(1, 1));
        expect(c.remove(new Point(1, 1))).toBe(true);
        expect(c.isEmpty()).toBe(true);
      });
      it('removes NaN', () => expect(of(NaN).remove(NaN)).toBe(true));
      it('remove from empty is false', () => expect(create().remove(1)).toBe(false));
      it('re-adding after remove works', () => {
        const c = of(1);
        c.remove(1);
        c.add(1);
        expect(c.contains(1)).toBe(true);
        expect(c.size()).toBe(1);
      });
      if (opts.allowsNull) {
        it('removes null', () => {
          const c = of(1, null);
          expect(c.remove(null)).toBe(true);
          expect(c.contains(null)).toBe(false);
        });
      }
    });

    describe('containsAll', () => {
      it('true for subset', () => expect(of(1, 2, 3).containsAll(sl(1, 3))).toBe(true));
      it('false when one is missing', () => expect(of(1, 2).containsAll(sl(1, 9))).toBe(false));
      it('true for empty argument', () => expect(of(1).containsAll(sl())).toBe(true));
      it('empty collection contains empty', () => expect(create().containsAll(sl())).toBe(true));
      it('true for itself', () => {
        const c = of(1, 2);
        expect(c.containsAll(c)).toBe(true);
      });
      it('null argument throws NullPointerException', () => expectThrows(() => of(1).containsAll(null as any), 'NullPointerException'));
    });

    describe('addAll', () => {
      it('adds every element and returns true', () => {
        const c = of(1);
        expect(c.addAll(sl(2, 3))).toBe(true);
        expect(sorted(c)).toEqual([1, 2, 3]);
      });
      it('empty argument returns false', () => {
        const c = of(1);
        expect(c.addAll(sl())).toBe(false);
        expect(c.size()).toBe(1);
      });
      it('works into an empty collection', () => {
        const c = create();
        c.addAll(sl(1, 2));
        expect(sorted(c)).toEqual([1, 2]);
      });
      if (!opts.allowsDuplicates) {
        it('returns false when every element already present', () => expect(of(1, 2).addAll(sl(1, 2))).toBe(false));
      }
      it('null argument throws NullPointerException', () => expectThrows(() => of(1).addAll(null as any), 'NullPointerException'));
    });

    describe('removeAll', () => {
      it('removes every occurrence of each element', () => {
        const c = of(1, 2, 1, 3, 1);
        expect(c.removeAll(sl(1))).toBe(true);
        expect(sorted(c)).toEqual([2, 3]);
      });
      it('false when nothing removed', () => expect(of(1).removeAll(sl(2))).toBe(false));
      it('empty argument is a no-op', () => {
        const c = of(1);
        expect(c.removeAll(sl())).toBe(false);
        expect(c.size()).toBe(1);
      });
      it('removeAll(this) empties', () => {
        const c = of(1, 2);
        c.removeAll(c);
        expect(c.isEmpty()).toBe(true);
      });
      it('uses equals()', () => {
        const c = of(new Point(0, 0), new Point(1, 1));
        c.removeAll(sl(new Point(0, 0)));
        expect(c.size()).toBe(1);
        expect(c.contains(new Point(1, 1))).toBe(true);
      });
      it('null argument throws NullPointerException', () => expectThrows(() => of(1).removeAll(null as any), 'NullPointerException'));
    });

    describe('retainAll', () => {
      it('keeps only common elements', () => {
        const c = of(1, 2, 3, 2);
        expect(c.retainAll(sl(2, 3))).toBe(true);
        expect(sorted(c)).toEqual(opts.allowsDuplicates ? [2, 2, 3] : [2, 3]);
      });
      it('false when unchanged', () => expect(of(1, 2).retainAll(sl(1, 2, 3))).toBe(false));
      it('empty argument clears', () => {
        const c = of(1, 2);
        expect(c.retainAll(sl())).toBe(true);
        expect(c.isEmpty()).toBe(true);
      });
      it('retainAll(this) is a no-op', () => {
        const c = of(1, 2);
        expect(c.retainAll(c)).toBe(false);
        expect(c.size()).toBe(2);
      });
      it('uses equals()', () => {
        const c = of(new Point(0, 0), new Point(1, 1));
        c.retainAll(sl(new Point(1, 1)));
        expect(c.toArray()).toEqual([new Point(1, 1)]);
      });
      it('null argument throws NullPointerException', () => expectThrows(() => of(1).retainAll(null as any), 'NullPointerException'));
    });

    describe('removeIf', () => {
      it('removes matches and returns true', () => {
        const c = of(1, 2, 3, 4);
        expect(c.removeIf((x: number) => x % 2 === 0)).toBe(true);
        expect(sorted(c)).toEqual([1, 3]);
      });
      it('false when nothing matches', () => {
        const c = of(1);
        expect(c.removeIf(() => false)).toBe(false);
        expect(c.size()).toBe(1);
      });
      it('can remove everything', () => {
        const c = of(1, 2, 3);
        c.removeIf(() => true);
        expect(c.size()).toBe(0);
        c.add(4);
        expect(c.toArray()).toEqual([4]);
      });
      it('predicate sees each element exactly once', () => {
        const seen: number[] = [];
        of(1, 2, 3).removeIf((x: number) => (seen.push(x), x === 2));
        expect(seen.sort()).toEqual([1, 2, 3]);
      });
      it('on empty does not call predicate', () => {
        const fn = jest.fn(() => true);
        expect(create().removeIf(fn)).toBe(false);
        expect(fn).not.toHaveBeenCalled();
      });
      if (anyType) {
        it('removes exactly the matching reference', () => {
          const a = { k: 'a' };
          const b = { k: 'b' };
          const c = of(a, b);
          c.removeIf((x: unknown) => x === b);
          expect(c.toArray()).toEqual([a]);
          expect(c.toArray()[0]).toBe(a);
        });
      }
      it('null predicate throws NullPointerException', () => expectThrows(() => of(1).removeIf(null as any), 'NullPointerException'));
    });

    describe('clear', () => {
      it('empties', () => {
        const c = of(1, 2);
        c.clear();
        expect(c.size()).toBe(0);
        expect(c.isEmpty()).toBe(true);
        expect(c.contains(1)).toBe(false);
      });
      it('on empty is fine', () => {
        const c = create();
        c.clear();
        expect(c.size()).toBe(0);
      });
      it('usable after clear', () => {
        const c = of(1);
        c.clear();
        c.add(2);
        expect(c.toArray()).toEqual([2]);
      });
    });

    describe('toArray', () => {
      it('contains all elements', () => expect(sorted(of(3, 1, 2))).toEqual([1, 2, 3]));
      it('returns a fresh copy', () => {
        const c = of(1);
        c.toArray().push(9);
        expect(c.size()).toBe(1);
      });
      it('empty gives []', () => expect(create().toArray()).toEqual([]));
      it('length equals size', () => {
        const c = of(1, 2, 2, 3);
        expect(c.toArray().length).toBe(c.size());
      });
    });

    describe('iterator', () => {
      it('visits every element once', () => {
        const it = of(1, 2, 3).iterator();
        const out: number[] = [];
        while (it.hasNext()) out.push(it.next());
        expect(out.sort()).toEqual([1, 2, 3]);
      });
      it('empty has no next', () => expect(create().iterator().hasNext()).toBe(false));
      it('next() on empty throws NoSuchElementException', () => expectThrows(() => create().iterator().next(), 'NoSuchElementException'));
      it('next() past end throws NoSuchElementException', () => {
        const it = of(1).iterator();
        it.next();
        expectThrows(() => it.next(), 'NoSuchElementException');
      });
      it('hasNext() is idempotent', () => {
        const it = of(1).iterator();
        expect([it.hasNext(), it.hasNext()]).toEqual([true, true]);
        it.next();
        expect([it.hasNext(), it.hasNext()]).toEqual([false, false]);
      });
      it('independent iterators', () => {
        const c = of(1, 2);
        const a = c.iterator();
        const b = c.iterator();
        a.next();
        expect([a.hasNext(), b.hasNext()]).toEqual([true, true]);
        a.next();
        expect(a.hasNext()).toBe(false);
        expect(b.hasNext()).toBe(true);
      });
      it('remove() deletes the last returned element', () => {
        const c = of(1, 2, 3);
        const it = c.iterator();
        while (it.hasNext()) if (it.next() === 2) it.remove();
        expect(sorted(c)).toEqual([1, 3]);
        expect(c.size()).toBe(2);
      });
      it('remove() before next() throws IllegalStateException', () => expectThrows(() => of(1).iterator().remove(), 'IllegalStateException'));
      it('remove() twice throws IllegalStateException', () => {
        const it = of(1, 2).iterator();
        it.next();
        it.remove();
        expectThrows(() => it.remove(), 'IllegalStateException');
      });
      it('iteration continues correctly after remove()', () => {
        const c = of(1, 2, 3, 4);
        const it = c.iterator();
        const seen: number[] = [];
        while (it.hasNext()) {
          const x = it.next();
          seen.push(x);
          if (x % 2 === 0) it.remove();
        }
        expect(seen.sort()).toEqual([1, 2, 3, 4]);
        expect(sorted(c)).toEqual([1, 3]);
      });
      it('remove everything via iterator', () => {
        const c = of(1, 2, 3);
        const it = c.iterator();
        while (it.hasNext()) {
          it.next();
          it.remove();
        }
        expect(c.isEmpty()).toBe(true);
      });
      it('fail-fast: add during iteration -> ConcurrentModificationException', () => {
        const c = of(1, 2);
        const it = c.iterator();
        it.next();
        c.add(3);
        expectThrows(() => it.next(), 'ConcurrentModificationException');
      });
      it('fail-fast: remove during iteration -> ConcurrentModificationException', () => {
        const c = of(1, 2, 3);
        const it = c.iterator();
        it.next();
        c.remove(it.hasNext() ? 3 : 1);
        expectThrows(() => it.next(), 'ConcurrentModificationException');
      });
      it('fail-fast: clear during iteration', () => {
        const c = of(1, 2, 3);
        const it = c.iterator();
        it.next();
        c.clear();
        expect(() => {
          if (it.hasNext()) it.next();
          else throw Object.assign(new Error(), { name: 'ConcurrentModificationException' });
        }).toThrow();
      });
      it('iterator.remove keeps other iterators fail-fast', () => {
        const c = of(1, 2, 3);
        const a = c.iterator();
        const b = c.iterator();
        a.next();
        a.remove();
        expectThrows(() => b.next(), 'ConcurrentModificationException');
      });
      it('forEachRemaining consumes the rest', () => {
        const it = of(1, 2, 3).iterator();
        it.next();
        const out: number[] = [];
        it.forEachRemaining((x: number) => out.push(x));
        expect(out.length).toBe(2);
        expect(it.hasNext()).toBe(false);
      });
    });

    describe('JS interop', () => {
      it('for..of', () => {
        const out: number[] = [];
        for (const x of of(1, 2)) out.push(x);
        expect(out.sort()).toEqual([1, 2]);
      });
      it('spread', () => expect([...of(1, 2)].sort()).toEqual([1, 2]));
      it('Array.from', () => expect(Array.from(of('a'))).toEqual(['a']));
      it('new Set(collection)', () => expect(new Set(of(1, 2)).size).toBe(2));
      it('forEach visits every element', () => {
        const fn = jest.fn();
        of(1, 2).forEach(fn);
        expect(fn).toHaveBeenCalledTimes(2);
      });
      it('forEach on empty never calls', () => {
        const fn = jest.fn();
        create().forEach(fn);
        expect(fn).not.toHaveBeenCalled();
      });
      it('for..of is fail-fast too', () => {
        const c = of(1, 2);
        expect(() => {
          for (const x of c) if (x === 1 || x === 2) c.add(x + 10);
        }).toThrow();
      });
    });

    describe('toString', () => {
      it('empty is "[]"', () => expect(create().toString()).toBe('[]'));
      it('single element', () => expect(of(1).toString()).toBe('[1]'));
      it('elements separated by ", "', () => expect(of(1, 2).toString()).toMatch(/^\[(1, 2|2, 1)\]$/));
      it('uses element toString()', () => expect(of(new Point(1, 2)).toString()).toBe('[(1,2)]'));
      it('String(collection) works', () => expect(String(of(1))).toBe('[1]'));
      it('template literal works', () => expect(`${of(1)}`).toBe('[1]'));
      if (anyType) {
        it('self reference prints "(this Collection)"', () => {
          const c = create();
          c.add(c);
          expect(c.toString()).toBe('[(this Collection)]');
        });
      }
      if (opts.allowsNull) it('null prints "null"', () => expect(of(null).toString()).toBe('[null]'));
    });

    describe('scale', () => {
      it('10k elements: add, contains, remove', () => {
        const c = create();
        for (let i = 0; i < 10_000; i++) c.add(i);
        expect(c.size()).toBe(10_000);
        expect(c.contains(9_999)).toBe(true);
        for (let i = 0; i < 10_000; i += 2) c.remove(i);
        expect(c.size()).toBe(5_000);
        expect(c.contains(2)).toBe(false);
        expect(c.contains(3)).toBe(true);
      });
    });
  });
}
