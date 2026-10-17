import { List } from '../../src/interfaces/List';
import { expectThrows, refStringHash, Point, rng, timeIt } from '../helpers';
import { SimpleList, SimpleSeqList } from '../support';

const IOOBE = 'IndexOutOfBoundsException';

/** List + SequencedCollection contract. Removal by position is removeAt(index). */
export function listContract(name: string, create: () => List<any>) {
  const of = (...xs: unknown[]): List<any> => {
    const l = create();
    for (const x of xs) l.add(x);
    return l;
  };
  const sl = (...xs: unknown[]) => SimpleList.of<unknown>(...xs);
  const sq = (...xs: unknown[]) => SimpleSeqList.of<unknown>(...xs);
  const num = (a: number, b: number) => a - b;

  describe(`${name} · List`, () => {
    describe('ordering', () => {
      it('keeps insertion order', () => expect(of(3, 1, 2).toArray()).toEqual([3, 1, 2]));
      it('iterator follows index order', () => {
        const it = of('a', 'b', 'c').iterator();
        expect([it.next(), it.next(), it.next()]).toEqual(['a', 'b', 'c']);
      });
      it('for..of follows index order', () => expect([...of(3, 1, 2)]).toEqual([3, 1, 2]));
      it('forEach follows index order', () => {
        const out: number[] = [];
        of(3, 1, 2).forEach((x: number) => out.push(x));
        expect(out).toEqual([3, 1, 2]);
      });
      it('toString follows index order', () => expect(of(1, 2, 3).toString()).toBe('[1, 2, 3]'));
      it('a numeric element is never treated as an index', () => {
        const l = create();
        l.add(5);
        l.add(0);
        expect(l.toArray()).toEqual([5, 0]);
      });
      it('add(undefined) appends undefined (not an overload mix-up)', () => {
        const l = of(1);
        l.add(undefined);
        expect(l.toArray()).toEqual([1, undefined]);
      });
    });

    describe('add(index, e)', () => {
      it('at 0', () => {
        const l = of(2, 3);
        l.add(0, 1);
        expect(l.toArray()).toEqual([1, 2, 3]);
      });
      it('in middle shifts right', () => {
        const l = of(1, 3);
        l.add(1, 2);
        expect(l.toArray()).toEqual([1, 2, 3]);
      });
      it('at size appends', () => {
        const l = of(1);
        l.add(1, 2);
        expect(l.toArray()).toEqual([1, 2]);
      });
      it('into empty at 0', () => {
        const l = create();
        l.add(0, 'x');
        expect(l.toArray()).toEqual(['x']);
      });
      it('into empty at 0, then append keeps tail', () => {
        const l = create();
        l.add(0, 1);
        l.add(2);
        expect(l.toArray()).toEqual([1, 2]);
        expect(l.getLast()).toBe(2);
      });
      it('inserting at end updates getLast', () => {
        const l = of(1);
        l.add(1, 2);
        expect(l.getLast()).toBe(2);
      });
      it('accepts null', () => {
        const l = of(1);
        l.add(0, null);
        expect(l.get(0)).toBeNull();
        expect(l.size()).toBe(2);
      });
      it('accepts undefined', () => {
        const l = of(1);
        l.add(1, undefined);
        expect(l.size()).toBe(2);
        expect(l.get(1)).toBeUndefined();
      });
      it('many inserts at front reverse order', () => {
        const l = create();
        for (let i = 0; i < 5; i++) l.add(0, i);
        expect(l.toArray()).toEqual([4, 3, 2, 1, 0]);
      });
      it.each([-1, 2, 100])('index %p throws IndexOutOfBoundsException', (i) => expectThrows(() => of(1).add(i, 9), IOOBE));
      it('non-integer index throws IndexOutOfBoundsException', () => expectThrows(() => of(1).add(0.5, 9), IOOBE));
      it('failed add leaves list unchanged', () => {
        const l = of(1, 2);
        try {
          l.add(9, 0);
        } catch {}
        expect(l.toArray()).toEqual([1, 2]);
      });
    });

    describe('get', () => {
      it('by index', () => {
        const l = of('a', 'b', 'c');
        expect([l.get(0), l.get(1), l.get(2)]).toEqual(['a', 'b', 'c']);
      });
      it('after addFirst', () => {
        const l = of(2);
        l.addFirst(1);
        expect([l.get(0), l.get(1)]).toEqual([1, 2]);
      });
      it('after add(index)', () => {
        const l = of(1, 3);
        l.add(1, 2);
        expect(l.get(1)).toBe(2);
      });
      it('after removeAt', () => {
        const l = of(1, 2, 3);
        l.removeAt(0);
        expect(l.get(0)).toBe(2);
      });
      it.each([-1, 3, 999])('index %p throws IndexOutOfBoundsException', (i) => expectThrows(() => of(1, 2, 3).get(i), IOOBE));
      it('non-integer index throws', () => expectThrows(() => of(1, 2).get(0.5), IOOBE));
      it('NaN index throws', () => expectThrows(() => of(1).get(NaN), IOOBE));
      it('on empty throws', () => expectThrows(() => create().get(0), IOOBE));
      it('exception message mentions the index', () => expect(() => of(1).get(5)).toThrow(/5/));
    });

    describe('set', () => {
      it('replaces and returns previous', () => {
        const l = of(1, 2, 3);
        expect(l.set(1, 20)).toBe(2);
        expect(l.toArray()).toEqual([1, 20, 3]);
      });
      it('size unchanged', () => {
        const l = of(1, 2);
        l.set(0, 9);
        expect(l.size()).toBe(2);
      });
      it('visible via getFirst/getLast', () => {
        const l = of(1, 2);
        l.set(0, 8);
        l.set(1, 9);
        expect([l.getFirst(), l.getLast()]).toEqual([8, 9]);
      });
      it('to null', () => {
        const l = of(1);
        expect(l.set(0, null)).toBe(1);
        expect(l.get(0)).toBeNull();
      });
      it('is not a structural modification (iterator keeps going)', () => {
        const l = of(1, 2);
        const it = l.iterator();
        it.next();
        l.set(1, 9);
        expect(it.next()).toBe(9);
      });
      it.each([-1, 2, 50])('index %p throws IndexOutOfBoundsException', (i) => expectThrows(() => of(1, 2).set(i, 0), IOOBE));
      it('on empty throws', () => expectThrows(() => create().set(0, 1), IOOBE));
      it('failed set does not grow list', () => {
        const l = of(1);
        try {
          l.set(5, 9);
        } catch {}
        expect(l.toArray()).toEqual([1]);
      });
    });

    describe('removeAt (remove by position)', () => {
      it('removes and returns', () => {
        const l = of('a', 'b', 'c');
        expect(l.removeAt(1)).toBe('b');
        expect(l.toArray()).toEqual(['a', 'c']);
      });
      it('first', () => {
        const l = of(1, 2);
        expect(l.removeAt(0)).toBe(1);
        expect(l.getFirst()).toBe(2);
      });
      it('last keeps tail consistent', () => {
        const l = of(1, 2, 3);
        expect(l.removeAt(2)).toBe(3);
        l.add(4);
        expect(l.toArray()).toEqual([1, 2, 4]);
        expect(l.getLast()).toBe(4);
      });
      it('only element, then reuse', () => {
        const l = of(1);
        l.removeAt(0);
        expect(l.isEmpty()).toBe(true);
        l.add(2);
        expect([l.getFirst(), l.getLast()]).toEqual([2, 2]);
      });
      it('removes null element', () => {
        const l = of(null, 1);
        expect(l.removeAt(0)).toBeNull();
        expect(l.toArray()).toEqual([1]);
      });
      it.each([-1, 3])('index %p throws IndexOutOfBoundsException', (i) => expectThrows(() => of(1, 2, 3).removeAt(i), IOOBE));
      it('on empty throws', () => expectThrows(() => create().removeAt(0), IOOBE));
    });

    describe('remove(Object) in list order', () => {
      it('removes the FIRST occurrence', () => {
        const l = of(1, 2, 1);
        l.remove(1);
        expect(l.toArray()).toEqual([2, 1]);
      });
      it('remove(number) removes the value, not an index', () => {
        const l = of(10, 0, 20);
        expect(l.remove(0)).toBe(true);
        expect(l.toArray()).toEqual([10, 20]);
      });
      it('removing the tail keeps append working', () => {
        const l = of(1, 2);
        l.remove(2);
        l.add(3);
        expect(l.toArray()).toEqual([1, 3]);
        expect(l.getLast()).toBe(3);
      });
      it('removes null', () => {
        const l = of(1, null, 2);
        expect(l.remove(null)).toBe(true);
        expect(l.toArray()).toEqual([1, 2]);
      });
      it('removes undefined', () => {
        const l = of(1, undefined, 2);
        expect(l.remove(undefined)).toBe(true);
        expect(l.toArray()).toEqual([1, 2]);
      });
    });

    describe('indexOf / lastIndexOf', () => {
      it('indexOf first occurrence', () => expect(of(1, 2, 1).indexOf(1)).toBe(0));
      it('lastIndexOf last occurrence', () => expect(of(1, 2, 1).lastIndexOf(1)).toBe(2));
      it('absent is -1', () => {
        expect(of(1).indexOf(2)).toBe(-1);
        expect(of(1).lastIndexOf(2)).toBe(-1);
      });
      it('empty is -1', () => {
        expect(create().indexOf(1)).toBe(-1);
        expect(create().lastIndexOf(1)).toBe(-1);
      });
      it('null', () => expect(of(1, null, null).indexOf(null)).toBe(1));
      it('lastIndexOf null', () => expect(of(null, 1, null).lastIndexOf(null)).toBe(2));
      it('NaN', () => expect(of(1, NaN).indexOf(NaN)).toBe(1));
      it('uses equals()', () => {
        const l = of(new Point(0, 0), new Point(1, 1), new Point(0, 0));
        expect(l.indexOf(new Point(0, 0))).toBe(0);
        expect(l.lastIndexOf(new Point(0, 0))).toBe(2);
      });
      it('after addFirst', () => {
        const l = of(2);
        l.addFirst(1);
        expect(l.indexOf(2)).toBe(1);
      });
      it('single occurrence: indexOf == lastIndexOf', () => {
        const l = of('a', 'b', 'c');
        expect(l.indexOf('b')).toBe(l.lastIndexOf('b'));
      });
    });

    describe('addAll', () => {
      it('addAll(c) appends in iteration order', () => {
        const l = of(1);
        l.addAll(sq(2, 3));
        expect(l.toArray()).toEqual([1, 2, 3]);
      });
      it('addAll(this) doubles the list', () => {
        const l = of(1, 2);
        expect(l.addAll(l)).toBe(true);
        expect(l.toArray()).toEqual([1, 2, 1, 2]);
      });
      it('addAll(index, c) inserts in order', () => {
        const l = of(1, 4);
        expect(l.addAll(1, sl(2, 3))).toBe(true);
        expect(l.toArray()).toEqual([1, 2, 3, 4]);
      });
      it('addAll(0, c)', () => {
        const l = of(3);
        l.addAll(0, sq(1, 2));
        expect(l.toArray()).toEqual([1, 2, 3]);
      });
      it('addAll(size, c) updates getLast', () => {
        const l = of(1);
        l.addAll(1, sl(2, 3));
        expect(l.getLast()).toBe(3);
      });
      it('addAll(0, c) into empty', () => {
        const l = create();
        l.addAll(0, sl(1, 2));
        expect(l.toArray()).toEqual([1, 2]);
        expect([l.getFirst(), l.getLast()]).toEqual([1, 2]);
      });
      it('addAll(index, this)', () => {
        const l = of(1, 2);
        l.addAll(1, l);
        expect(l.toArray()).toEqual([1, 1, 2, 2]);
      });
      it('addAll(index, empty) returns false', () => {
        const l = of(1);
        expect(l.addAll(0, sl())).toBe(false);
        expect(l.toArray()).toEqual([1]);
      });
      it.each([-1, 2])('addAll(%p, c) throws IndexOutOfBoundsException', (i) => expectThrows(() => of(1).addAll(i, sl(2)), IOOBE));
      it('addAll(index, null) throws NullPointerException', () => expectThrows(() => of(1).addAll(0, null as any), 'NullPointerException'));
    });

    describe('bulk ops keep order', () => {
      it('removeAll', () => {
        const l = of(1, 2, 3, 2, 4);
        l.removeAll(sl(2));
        expect(l.toArray()).toEqual([1, 3, 4]);
      });
      it('retainAll', () => {
        const l = of(1, 2, 3, 2, 4);
        l.retainAll(sl(2, 4));
        expect(l.toArray()).toEqual([2, 2, 4]);
      });
      it('removeIf', () => {
        const l = of(5, 1, 4, 2);
        l.removeIf((x: number) => x > 3);
        expect(l.toArray()).toEqual([1, 2]);
      });
      it('removeIf keeps ends valid', () => {
        const l = of(1, 2, 3);
        l.removeIf((x: number) => x !== 2);
        expect([l.getFirst(), l.getLast()]).toEqual([2, 2]);
        l.add(9);
        expect(l.toArray()).toEqual([2, 9]);
      });
      it('removeIf removes adjacent matches', () => {
        const l = of(1, 2, 2, 2, 3);
        l.removeIf((x: number) => x === 2);
        expect(l.toArray()).toEqual([1, 3]);
      });
      it('clear then reuse', () => {
        const l = of(1, 2);
        l.clear();
        l.add(3);
        expect([l.toArray(), l.getFirst(), l.getLast()]).toEqual([[3], 3, 3]);
      });
    });

    describe('replaceAll', () => {
      it('maps each element in place', () => {
        const l = of(1, 2, 3);
        l.replaceAll((x: number) => x * 2);
        expect(l.toArray()).toEqual([2, 4, 6]);
      });
      it('strings', () => {
        const l = of('a', 'b');
        l.replaceAll((s: string) => s.toUpperCase());
        expect(l.toArray()).toEqual(['A', 'B']);
      });
      it('empty is a no-op', () => {
        const fn = jest.fn((x) => x);
        const l = create();
        l.replaceAll(fn);
        expect(fn).not.toHaveBeenCalled();
      });
      it('size unchanged', () => {
        const l = of(1, 2);
        l.replaceAll(() => 0);
        expect(l.toArray()).toEqual([0, 0]);
      });
      it('null operator throws NullPointerException', () => expectThrows(() => of(1).replaceAll(null as any), 'NullPointerException'));
    });

    describe('sort', () => {
      it('with comparator', () => {
        const l = of(3, 1, 2);
        l.sort(num);
        expect(l.toArray()).toEqual([1, 2, 3]);
      });
      it('reverse comparator', () => {
        const l = of(1, 3, 2);
        l.sort((a: number, b: number) => b - a);
        expect(l.toArray()).toEqual([3, 2, 1]);
      });
      it('null comparator = natural ordering', () => {
        const l = of('b', 'c', 'a');
        l.sort(null);
        expect(l.toArray()).toEqual(['a', 'b', 'c']);
      });
      it('no argument = natural ordering', () => {
        const l = of(3, 1, 2);
        l.sort();
        expect(l.toArray()).toEqual([1, 2, 3]);
      });
      it('natural ordering is numeric, not lexicographic', () => {
        const l = of(10, 9, 100, -1);
        l.sort();
        expect(l.toArray()).toEqual([-1, 9, 10, 100]);
      });
      it('natural ordering uses compareTo()', () => {
        const l = of(new Point(2, 0), new Point(1, 5), new Point(1, 2));
        l.sort();
        expect(l.toString()).toBe('[(1,2), (1,5), (2,0)]');
      });
      it('natural ordering with null throws NullPointerException', () => expectThrows(() => of(1, null).sort(), 'NullPointerException'));
      it('natural ordering with undefined throws NullPointerException', () => expectThrows(() => of(1, undefined).sort(), 'NullPointerException'));
      it('natural ordering of non-comparables throws ClassCastException', () => expectThrows(() => of({}, {}).sort(), 'ClassCastException'));
      it('mixed types throw ClassCastException', () => expectThrows(() => of(1, 'a').sort(), 'ClassCastException'));
      it('is stable', () => {
        const l = of({ k: 1, id: 'a' }, { k: 0, id: 'b' }, { k: 1, id: 'c' }, { k: 0, id: 'd' });
        l.sort((a: any, b: any) => a.k - b.k);
        expect(l.toArray().map((x: any) => x.id)).toEqual(['b', 'd', 'a', 'c']);
      });
      it('updates first/last and get', () => {
        const l = of(3, 1, 2);
        l.sort(num);
        expect([l.getFirst(), l.get(1), l.getLast()]).toEqual([1, 2, 3]);
      });
      it('empty and single element', () => {
        const e = create();
        e.sort(num);
        const s = of(1);
        s.sort(num);
        expect([e.size(), s.toArray()]).toEqual([0, [1]]);
      });
      it('already sorted stays the same', () => {
        const l = of(1, 2, 3);
        l.sort(num);
        expect(l.toArray()).toEqual([1, 2, 3]);
      });
      it('1000 random numbers', () => {
        const r = rng(9);
        const xs = Array.from({ length: 1000 }, () => r(500));
        const l = of(...xs);
        l.sort(num);
        expect(l.toArray()).toEqual([...xs].sort(num));
      });
    });

    describe('subList (live view)', () => {
      it('contents', () => expect(of(0, 1, 2, 3).subList(1, 3).toArray()).toEqual([1, 2]));
      it('is a List', () => {
        const s = of(0, 1, 2).subList(1, 3);
        expect([s.size(), s.get(0), s.get(1), s.indexOf(2)]).toEqual([2, 1, 2, 1]);
      });
      it('empty range', () => expect(of(0, 1).subList(1, 1).size()).toBe(0));
      it('full range', () => expect(of(0, 1).subList(0, 2).toArray()).toEqual([0, 1]));
      it('get outside the view throws', () => expectThrows(() => of(0, 1, 2).subList(0, 1).get(1), IOOBE));
      it('set writes through', () => {
        const l = of(0, 1, 2);
        l.subList(1, 3).set(0, 9);
        expect(l.toArray()).toEqual([0, 9, 2]);
      });
      it('clear removes the range (range-delete idiom)', () => {
        const l = of(0, 1, 2, 3, 4);
        l.subList(1, 4).clear();
        expect(l.toArray()).toEqual([0, 4]);
      });
      it('add inserts into the backing list', () => {
        const l = of(0, 3);
        const s = l.subList(0, 1);
        s.add(1);
        expect(l.toArray()).toEqual([0, 1, 3]);
        expect(s.size()).toBe(2);
      });
      it('removeAt removes from the backing list', () => {
        const l = of(0, 1, 2);
        expect(l.subList(1, 3).removeAt(0)).toBe(1);
        expect(l.toArray()).toEqual([0, 2]);
      });
      it('sort sorts only the range', () => {
        const l = of(9, 3, 2, 1, 0);
        l.subList(1, 4).sort(num);
        expect(l.toArray()).toEqual([9, 1, 2, 3, 0]);
      });
      it('nested subList', () => {
        const l = of(0, 1, 2, 3, 4, 5);
        const s = l.subList(1, 5).subList(1, 3);
        expect(s.toArray()).toEqual([2, 3]);
        s.clear();
        expect(l.toArray()).toEqual([0, 1, 4, 5]);
      });
      it('backing write is visible in view', () => {
        const l = of(0, 1, 2);
        const s = l.subList(0, 2);
        l.set(1, 7);
        expect(s.get(1)).toBe(7);
      });
      it('structural change to backing list invalidates view', () => {
        const l = of(0, 1, 2);
        const s = l.subList(0, 2);
        l.add(3);
        expectThrows(() => s.size(), 'ConcurrentModificationException');
      });
      it('fromIndex < 0 throws IndexOutOfBoundsException', () => expectThrows(() => of(1, 2).subList(-1, 1), IOOBE));
      it('toIndex > size throws IndexOutOfBoundsException', () => expectThrows(() => of(1, 2).subList(0, 3), IOOBE));
      it('from > to throws IllegalArgumentException', () => expectThrows(() => of(1, 2).subList(2, 1), 'IllegalArgumentException'));
      it('equals a list with the same elements', () => expect(of(0, 1, 2).subList(1, 3).equals(sl(1, 2))).toBe(true));
      it('toString', () => expect(of(0, 1, 2).subList(0, 2).toString()).toBe('[0, 1]'));
    });

    describe('ListIterator', () => {
      it('forward', () => {
        const it = of(1, 2).listIterator();
        expect([it.next(), it.next(), it.hasNext()]).toEqual([1, 2, false]);
      });
      it('backward from end', () => {
        const it = of(1, 2).listIterator(2);
        expect([it.previous(), it.previous(), it.hasPrevious()]).toEqual([2, 1, false]);
      });
      it('starting in the middle', () => {
        const it = of('a', 'b', 'c').listIterator(1);
        expect([it.next(), it.previousIndex()]).toEqual(['b', 1]);
      });
      it('nextIndex / previousIndex', () => {
        const it = of('a', 'b').listIterator();
        expect([it.nextIndex(), it.previousIndex()]).toEqual([0, -1]);
        it.next();
        expect([it.nextIndex(), it.previousIndex()]).toEqual([1, 0]);
        it.next();
        expect([it.nextIndex(), it.previousIndex()]).toEqual([2, 1]);
      });
      it('previous() at start throws NoSuchElementException', () => expectThrows(() => of(1).listIterator().previous(), 'NoSuchElementException'));
      it('next() at end throws NoSuchElementException', () => expectThrows(() => of(1).listIterator(1).next(), 'NoSuchElementException'));
      it('next then previous return the same element', () => {
        const it = of(1, 2, 3).listIterator();
        it.next();
        expect(it.next()).toBe(2);
        expect(it.previous()).toBe(2);
        expect(it.next()).toBe(2);
      });
      it('set replaces last returned (after next)', () => {
        const l = of(1, 2);
        const it = l.listIterator();
        it.next();
        it.set(9);
        expect(l.toArray()).toEqual([9, 2]);
      });
      it('set replaces last returned (after previous)', () => {
        const l = of(1, 2);
        const it = l.listIterator(2);
        it.previous();
        it.set(9);
        expect(l.toArray()).toEqual([1, 9]);
      });
      it('set before next throws IllegalStateException', () => expectThrows(() => of(1).listIterator().set(2), 'IllegalStateException'));
      it('set after remove throws IllegalStateException', () => {
        const it = of(1, 2).listIterator();
        it.next();
        it.remove();
        expectThrows(() => it.set(3), 'IllegalStateException');
      });
      it('add inserts before the cursor', () => {
        const l = of(1, 3);
        const it = l.listIterator();
        it.next();
        it.add(2);
        expect(l.toArray()).toEqual([1, 2, 3]);
        expect(it.next()).toBe(3);
        expect(it.previousIndex()).toBe(2);
      });
      it('add into empty list', () => {
        const l = create();
        const it = l.listIterator();
        it.add('a');
        it.add('b');
        expect(l.toArray()).toEqual(['a', 'b']);
        expect(it.hasNext()).toBe(false);
      });
      it('add then previous returns the added element', () => {
        const it = of(1).listIterator(1);
        it.add(2);
        expect(it.previous()).toBe(2);
      });
      it('add then set throws IllegalStateException', () => {
        const it = of(1).listIterator();
        it.next();
        it.add(2);
        expectThrows(() => it.set(3), 'IllegalStateException');
      });
      it('add then remove throws IllegalStateException', () => {
        const it = of(1).listIterator();
        it.add(0);
        expectThrows(() => it.remove(), 'IllegalStateException');
      });
      it('remove after previous', () => {
        const l = of(1, 2, 3);
        const it = l.listIterator(3);
        it.previous();
        it.remove();
        expect(l.toArray()).toEqual([1, 2]);
        expect(it.nextIndex()).toBe(2);
      });
      it('remove every other element while iterating', () => {
        const l = of(0, 1, 2, 3, 4, 5);
        const it = l.listIterator();
        while (it.hasNext()) if (it.next() % 2) it.remove();
        expect(l.toArray()).toEqual([0, 2, 4]);
      });
      it('fail-fast after external add', () => {
        const l = of(1, 2);
        const it = l.listIterator();
        it.next();
        l.add(3);
        expectThrows(() => it.next(), 'ConcurrentModificationException');
      });
      it.each([2, -1])('listIterator(%p) out of range throws IndexOutOfBoundsException', (i) => expectThrows(() => of(1).listIterator(i), IOOBE));
    });

    describe('SequencedCollection', () => {
      it('getFirst / getLast', () => {
        const l = of(1, 2, 3);
        expect([l.getFirst(), l.getLast()]).toEqual([1, 3]);
      });
      it.each(['getFirst', 'getLast', 'removeFirst', 'removeLast'] as const)('%s on empty throws NoSuchElementException', (m) =>
        expectThrows(() => create()[m](), 'NoSuchElementException')
      );
      it('addFirst', () => {
        const l = of(2);
        l.addFirst(1);
        expect(l.toArray()).toEqual([1, 2]);
      });
      it('addLast', () => {
        const l = of(1);
        l.addLast(2);
        expect(l.toArray()).toEqual([1, 2]);
      });
      it('addFirst on empty sets both ends', () => {
        const l = create();
        l.addFirst(1);
        expect([l.getFirst(), l.getLast(), l.size()]).toEqual([1, 1, 1]);
      });
      it('mixed addFirst/addLast', () => {
        const l = create();
        l.addLast(2);
        l.addFirst(1);
        l.addLast(3);
        l.addFirst(0);
        expect(l.toArray()).toEqual([0, 1, 2, 3]);
      });
      it('List.addFirst/addLast accept null', () => {
        const l = create();
        l.addFirst(null);
        l.addLast(null);
        expect(l.toArray()).toEqual([null, null]);
      });
      it('removeFirst / removeLast return removed', () => {
        const l = of(1, 2, 3);
        expect([l.removeFirst(), l.removeLast(), l.toArray()]).toEqual([1, 3, [2]]);
      });
      it('drain alternating ends', () => {
        const l = of(1, 2, 3, 4);
        expect([l.removeFirst(), l.removeLast(), l.removeFirst(), l.removeLast()]).toEqual([1, 4, 2, 3]);
        expect(l.isEmpty()).toBe(true);
      });
      it('reusable after drain', () => {
        const l = of(1);
        l.removeLast();
        l.addLast(2);
        expect([l.getFirst(), l.getLast()]).toEqual([2, 2]);
      });
      it('reversed() is a reverse-ordered List', () => {
        const r = of(1, 2, 3).reversed();
        expect(r.toArray()).toEqual([3, 2, 1]);
        expect([r.get(0), r.getFirst(), r.getLast(), r.size()]).toEqual([3, 3, 1, 3]);
      });
      it('reversed() does not mutate', () => {
        const l = of(1, 2);
        l.reversed();
        expect(l.toArray()).toEqual([1, 2]);
      });
      it('reversed() reflects later changes', () => {
        const l = of(1, 2);
        const r = l.reversed();
        l.add(3);
        expect(r.getFirst()).toBe(3);
        expect(r.size()).toBe(3);
      });
      it('writes through reversed() hit the original', () => {
        const l = of(1, 2);
        const r = l.reversed();
        r.addFirst(3);
        r.set(r.size() - 1, 0);
        expect(l.toArray()).toEqual([0, 2, 3]);
      });
      it('removeFirst on reversed() removes the original last', () => {
        const l = of(1, 2, 3);
        expect(l.reversed().removeFirst()).toBe(3);
        expect(l.toArray()).toEqual([1, 2]);
      });
      it('reversed() iterator goes backwards', () => expect([...of(1, 2, 3).reversed()]).toEqual([3, 2, 1]));
      it('reversed() iterator is fail-fast', () => {
        const l = of(1, 2);
        const it = l.reversed().iterator();
        it.next();
        l.add(3);
        expectThrows(() => it.next(), 'ConcurrentModificationException');
      });
      it('reversed().reversed() equals the original', () => expect(of(1, 2).reversed().reversed().equals(sl(1, 2))).toBe(true));
      it('reversed() equals a reversed list', () => expect(of(1, 2).reversed().equals(sl(2, 1))).toBe(true));
    });

    describe('equals / hashCode', () => {
      it('reflexive', () => {
        const l = of(1);
        expect(l.equals(l)).toBe(true);
      });
      it('symmetric with other List implementations', () => {
        expect(of(1, 2).equals(sl(1, 2))).toBe(true);
        expect(sl(1, 2).equals(of(1, 2))).toBe(true);
        expect(of(1, 2).equals(sq(1, 2))).toBe(true);
        expect(sq(1, 2).equals(of(1, 2))).toBe(true);
      });
      it('equals another instance of the same class', () => expect(of(1, 2).equals(of(1, 2))).toBe(true));
      it('empty equals empty', () => expect(create().equals(sl())).toBe(true));
      it('order matters', () => expect(of(1, 2).equals(sl(2, 1))).toBe(false));
      it('size matters', () => expect(of(1).equals(sl(1, 1))).toBe(false));
      it('prefix is not equal', () => expect(of(1, 2).equals(sl(1))).toBe(false));
      it('not equal to a JS array', () => expect(of(1).equals([1])).toBe(false));
      it('not equal to null / undefined / primitives', () => {
        expect(of(1).equals(null)).toBe(false);
        expect(of(1).equals(undefined)).toBe(false);
        expect(of(1).equals(1)).toBe(false);
      });
      it('uses element equals()', () => expect(of(new Point(1, 1)).equals(sl(new Point(1, 1)))).toBe(true));
      it('nested lists compare by value', () => {
        expect(of(sl(1)).equals(sl(sl(1)))).toBe(true);
        expect(of(sl(1)).equals(sl(sl(2)))).toBe(false);
      });
      it('nulls compare equal', () => expect(of(null, 1).equals(sl(null, 1))).toBe(true));
      it('NaN elements compare equal', () => expect(of(NaN).equals(sl(NaN))).toBe(true));
      it('empty hashCode is 1', () => expect(create().hashCode()).toBe(1));
      it('31-multiplier formula with integers', () => expect(of(1, 2).hashCode()).toBe(31 * (31 + 1) + 2));
      it('31-multiplier formula with strings', () => {
        const exp = (Math.imul(31, 31 + refStringHash('a')) + refStringHash('b')) | 0;
        expect(of('a', 'b').hashCode()).toBe(exp);
      });
      it('null contributes 0', () => expect(of(null).hashCode()).toBe(31));
      it('booleans hash as 1231/1237', () => expect(of(true).hashCode()).toBe(31 + 1231));
      it('uses element hashCode()', () => expect(of(new Point(1, 2)).hashCode()).toBe((31 + new Point(1, 2).hashCode()) | 0));
      it('equal lists have equal hashCodes across implementations', () => {
        expect(of(1, 2, 3).hashCode()).toBe(sl(1, 2, 3).hashCode());
        expect(of('a', 'b').hashCode()).toBe(sq('a', 'b').hashCode());
      });
      it('different strings hash differently', () => expect(of('a').hashCode()).not.toBe(of('b').hashCode()));
      it('order changes the hash', () => expect(of(1, 2).hashCode()).not.toBe(of(2, 1).hashCode()));
      it('stays a 32-bit int for large lists', () => {
        const h = of(...Array.from({ length: 5000 }, (_, i) => i * 7919)).hashCode();
        expect(Number.isInteger(h)).toBe(true);
        expect(h | 0).toBe(h);
      });
      it('stable across calls', () => {
        const l = of('x', 'y');
        expect(l.hashCode()).toBe(l.hashCode());
      });
    });

    describe('scale', () => {
      it('10k adds then indexed reads', () => {
        const l = create();
        for (let i = 0; i < 10_000; i++) l.add(i);
        expect([l.size(), l.get(0), l.get(9_999), l.indexOf(5_000), l.lastIndexOf(5_000)]).toEqual([10_000, 0, 9_999, 5_000, 5_000]);
      });
      it('100k appends under 1s', () => {
        const l = create();
        expect(timeIt(() => {
          for (let i = 0; i < 100_000; i++) l.add(i);
        })).toBeLessThan(1_000);
        expect(l.size()).toBe(100_000);
      });
    });

    describe('model-based: random ops vs JS array', () => {
      it.each([1, 2, 3, 4, 5, 6, 7, 8])('seed %p, 3000 ops', (seed) => {
        const r = rng(seed);
        const l = create();
        const m: number[] = [];
        for (let step = 0; step < 3000; step++) {
          const op = r(13);
          const v = r(20);
          const at = `step ${step} op ${op}`;
          const same = (a: unknown, b: unknown) => expect([at, a]).toEqual([at, b]);
          switch (op) {
            case 0: l.add(v); m.push(v); break;
            case 1: { const i = r(m.length + 1); l.add(i, v); m.splice(i, 0, v); break; }
            case 2: if (m.length) { const i = r(m.length); same(l.removeAt(i), m.splice(i, 1)[0]); } break;
            case 3: { const i = m.indexOf(v); same(l.remove(v), i !== -1); if (i !== -1) m.splice(i, 1); break; }
            case 4: if (m.length) { const i = r(m.length); same(l.set(i, v), m[i]); m[i] = v; } break;
            case 5: l.addFirst(v); m.unshift(v); break;
            case 6: if (m.length) same(l.removeLast(), m.pop()); break;
            case 7: if (m.length) same(l.removeFirst(), m.shift()); break;
            case 8: same([l.indexOf(v), l.lastIndexOf(v), l.contains(v)], [m.indexOf(v), m.lastIndexOf(v), m.includes(v)]); break;
            case 9: if (m.length) { const i = r(m.length); same(l.get(i), m[i]); } break;
            case 10: { same(l.removeIf((e: number) => e === v), m.includes(v)); for (let k = m.length - 1; k >= 0; k--) if (m[k] === v) m.splice(k, 1); break; }
            case 11: { const i = r(m.length + 1); const xs = [v, v + 1]; l.addAll(i, sl(...xs)); m.splice(i, 0, ...xs); break; }
            case 12: if (r(40) === 0) { l.clear(); m.length = 0; } break;
          }
          same(l.size(), m.length);
          if (m.length) same([l.getFirst(), l.getLast()], [m[0], m[m.length - 1]]);
        }
        expect(l.toArray()).toEqual(m);
        expect(l.equals(sl(...m))).toBe(true);
        expect(l.hashCode()).toBe(sl(...m).hashCode());
      });
    });
  });
}
