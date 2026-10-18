import { LinkedList } from '../src/list/LinkedList';
import { collectionContract } from './contracts/collection';
import { dequeContract } from './contracts/deque';
import { listContract } from './contracts/list';
import { queueContract } from './contracts/queue';
import { expectThrows, Point, rng, timeIt } from './helpers';
import { SimpleList, SimpleSeqList } from './support';

collectionContract('LinkedList', () => new LinkedList(), { allowsNull: true, allowsDuplicates: true });
listContract('LinkedList', () => new LinkedList());
queueContract('LinkedList', () => new LinkedList(), { fifo: true });
dequeContract('LinkedList', () => new LinkedList(), { allowsNull: true });

// the reverse view is itself a full LinkedList
collectionContract('LinkedList.reversed()', () => new LinkedList().reversed(), { allowsNull: true, allowsDuplicates: true });
listContract('LinkedList.reversed()', () => new LinkedList().reversed());
queueContract('LinkedList.reversed()', () => new LinkedList().reversed(), { fifo: true });
dequeContract('LinkedList.reversed()', () => new LinkedList().reversed(), { allowsNull: true });

const NSEE = 'NoSuchElementException';
const ISE = 'IllegalStateException';
const CME = 'ConcurrentModificationException';
const IOOBE = 'IndexOutOfBoundsException';

/** Walks the links both ways and checks they agree with size(). */
function checkLinks<E>(l: LinkedList<E>): E[] {
  const fwd: E[] = [];
  let prev = null;
  for (let x = l.first; x !== null; prev = x, x = x.next) {
    expect(x.prev).toBe(prev);
    fwd.push(x.item);
  }
  expect(l.last).toBe(prev);
  const back: E[] = [];
  for (let x = l.last; x !== null; x = x.prev) back.push(x.item);
  expect(back.reverse()).toEqual(fwd);
  expect(fwd.length).toBe(l.size());
  return fwd;
}

describe('LinkedList · implementation', () => {
  describe('construction', () => {
    it('empty', () => expect([new LinkedList().size(), new LinkedList().toArray()]).toEqual([0, []]));
    it('from a collection', () => expect(new LinkedList(SimpleList.of(1, 2, 3)).toArray()).toEqual([1, 2, 3]));
    it('from an empty collection', () => expect(checkLinks(new LinkedList(SimpleList.of()))).toEqual([]));
    it('of()', () => expect(checkLinks(LinkedList.of('a', null, undefined))).toEqual(['a', null, undefined]));
    it('from another LinkedList', () => expect(checkLinks(new LinkedList(LinkedList.of(1, 2)))).toEqual([1, 2]));
    it('from a reversed view', () => expect(checkLinks(new LinkedList(LinkedList.of(1, 2).reversed()))).toEqual([2, 1]));
    it('explicit undefined collection throws NullPointerException', () => expectThrows(() => new LinkedList(undefined as any), 'NullPointerException'));
    it('null collection throws NullPointerException', () => expectThrows(() => new LinkedList(null as any), 'NullPointerException'));
  });

  describe('node relinking', () => {
    it('remove the only node then reuse both ends', () => {
      const l = LinkedList.of(1);
      l.removeAt(0);
      expect([l.first, l.last, l.size()]).toEqual([null, null, 0]);
      l.addLast(2);
      l.addFirst(1);
      expect(checkLinks(l)).toEqual([1, 2]);
    });
    it('remove head then reuse both ends', () => {
      const l = LinkedList.of(1, 2, 3);
      l.removeAt(0);
      l.addFirst(0);
      l.addLast(4);
      expect(checkLinks(l)).toEqual([0, 2, 3, 4]);
    });
    it('remove tail then reuse both ends', () => {
      const l = LinkedList.of(1, 2, 3);
      l.removeAt(2);
      l.addLast(4);
      l.addFirst(0);
      expect(checkLinks(l)).toEqual([0, 1, 2, 4]);
    });
    it('remove middle', () => {
      const l = LinkedList.of(1, 2, 3);
      expect(l.removeAt(1)).toBe(2);
      expect(checkLinks(l)).toEqual([1, 3]);
    });
    it('add(0, x) on empty then addLast (regression)', () => {
      const l = new LinkedList<number>();
      l.add(0, 1);
      l.addLast(2);
      expect(checkLinks(l)).toEqual([1, 2]);
      expect([l.getFirst(), l.getLast()]).toEqual([1, 2]);
    });
    it('add(0, x) on empty then addFirst', () => {
      const l = new LinkedList<number>();
      l.add(0, 2);
      l.addFirst(1);
      expect(checkLinks(l)).toEqual([1, 2]);
    });
    it('add(size, x) appends', () => {
      const l = LinkedList.of(1);
      l.add(1, 2);
      expect(checkLinks(l)).toEqual([1, 2]);
    });
    it('add(i, x) in the middle', () => {
      const l = LinkedList.of(1, 3);
      l.add(1, 2);
      expect(checkLinks(l)).toEqual([1, 2, 3]);
    });
    it('addAll at head, middle, tail and into empty', () => {
      const l = new LinkedList<number>();
      l.addAll(0, SimpleList.of(3, 4));
      l.addAll(0, SimpleList.of(1, 2));
      l.addAll(4, SimpleList.of(7, 8));
      l.addAll(4, SimpleList.of(5, 6));
      expect(checkLinks(l)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });
    it('addAll of empty returns false and does not bump modCount', () => {
      const l = LinkedList.of(1);
      const mc = l.modCount;
      expect(l.addAll(SimpleList.of())).toBe(false);
      expect(l.modCount).toBe(mc);
    });
    it('addAll(this) doubles the list', () => {
      const l = LinkedList.of(1, 2);
      l.addAll(l);
      expect(checkLinks(l)).toEqual([1, 2, 1, 2]);
    });
    it('removeFirstOccurrence / removeLastOccurrence of the only node', () => {
      const l = LinkedList.of(1);
      l.removeFirstOccurrence(1);
      l.addLast(2);
      expect(checkLinks(l)).toEqual([2]);
      l.removeLastOccurrence(2);
      l.addFirst(3);
      expect(checkLinks(l)).toEqual([3]);
    });
    it('removed nodes drop their references', () => {
      const l = LinkedList.of({ a: 1 }, { b: 2 });
      const n = l.first!;
      l.removeFirst();
      expect([n.item, n.prev, n.next]).toEqual([undefined, null, null]);
    });
    it('clear then reuse', () => {
      const l = LinkedList.of(1, 2, 3);
      l.clear();
      expect([l.first, l.last, l.size()]).toEqual([null, null, 0]);
      l.add(1);
      expect(checkLinks(l)).toEqual([1]);
    });
    it('clear on empty does not bump modCount', () => {
      const l = new LinkedList();
      l.clear();
      expect(l.modCount).toBe(0);
    });
  });

  describe('positional access', () => {
    const l = LinkedList.of(...Array.from({ length: 101 }, (_, i) => i));
    it('get(i) from the front half', () => expect([l.get(0), l.get(1), l.get(49)]).toEqual([0, 1, 49]));
    it('get(i) from the back half', () => expect([l.get(50), l.get(99), l.get(100)]).toEqual([50, 99, 100]));
    it('every index', () => {
      for (let i = 0; i < 101; i++) expect(l.get(i)).toBe(i);
    });
    it('set from both halves returns old', () => {
      const m = LinkedList.of(1, 2, 3, 4);
      expect([m.set(0, 9), m.set(3, 8)]).toEqual([1, 4]);
      expect(m.toArray()).toEqual([9, 2, 3, 8]);
    });
    it.each([-1, 4, 1.5, NaN])('get(%p) throws IndexOutOfBoundsException', (i) => expectThrows(() => LinkedList.of(1, 2, 3, 4).get(i), IOOBE));
    it('removeAt from the back half', () => {
      const m = LinkedList.of(0, 1, 2, 3, 4);
      expect(m.removeAt(3)).toBe(3);
      expect(checkLinks(m)).toEqual([0, 1, 2, 4]);
    });
    it('set does not bump modCount', () => {
      const m = LinkedList.of(1);
      const it = m.iterator();
      m.set(0, 2);
      expect(it.next()).toBe(2);
    });
  });

  describe('ListIterator', () => {
    it('add at the head', () => {
      const l = LinkedList.of(2, 3);
      const it = l.listIterator();
      it.add(1);
      expect([it.nextIndex(), it.next()]).toEqual([1, 2]);
      expect(checkLinks(l)).toEqual([1, 2, 3]);
    });
    it('add at the tail', () => {
      const l = LinkedList.of(1, 2);
      const it = l.listIterator(2);
      it.add(3);
      expect([it.hasNext(), it.previous()]).toEqual([false, 3]);
      expect(checkLinks(l)).toEqual([1, 2, 3]);
    });
    it('remove the head via next()', () => {
      const l = LinkedList.of(1, 2);
      const it = l.listIterator();
      it.next();
      it.remove();
      expect([it.nextIndex(), it.next()]).toEqual([0, 2]);
      expect(checkLinks(l)).toEqual([2]);
    });
    it('remove the tail via previous()', () => {
      const l = LinkedList.of(1, 2);
      const it = l.listIterator(2);
      it.previous();
      it.remove();
      expect([it.hasNext(), it.nextIndex(), it.previous()]).toEqual([false, 1, 1]);
      expect(checkLinks(l)).toEqual([1]);
    });
    it('remove the head via previous()', () => {
      const l = LinkedList.of(1, 2);
      const it = l.listIterator(1);
      it.previous();
      it.remove();
      expect([it.hasPrevious(), it.next()]).toEqual([false, 2]);
      expect(checkLinks(l)).toEqual([2]);
    });
    it('remove the tail via next()', () => {
      const l = LinkedList.of(1, 2);
      const it = l.listIterator(1);
      it.next();
      it.remove();
      expect([it.hasNext(), it.previous()]).toEqual([false, 1]);
      expect(checkLinks(l)).toEqual([1]);
    });
    it('remove twice throws IllegalStateException', () => {
      const it = LinkedList.of(1, 2).listIterator();
      it.next();
      it.remove();
      expectThrows(() => it.remove(), ISE);
    });
    it('remove everything going backwards', () => {
      const l = LinkedList.of(1, 2, 3);
      const it = l.listIterator(3);
      while (it.hasPrevious()) {
        it.previous();
        it.remove();
      }
      expect(checkLinks(l)).toEqual([]);
      l.addLast(9);
      expect(checkLinks(l)).toEqual([9]);
    });
    it('insert between every element', () => {
      const l = LinkedList.of(1, 3, 5);
      const it = l.listIterator();
      while (it.hasNext()) {
        const v = it.next();
        if (it.hasNext()) it.add(v + 1);
      }
      expect(checkLinks(l)).toEqual([1, 2, 3, 4, 5]);
    });
    it('set after previous then next', () => {
      const l = LinkedList.of(1, 2, 3);
      const it = l.listIterator(1);
      it.previous();
      it.next();
      it.set(9);
      expect(l.toArray()).toEqual([9, 2, 3]);
    });
    it('own modifications keep it valid, outside ones fail fast', () => {
      const l = LinkedList.of(1, 2, 3);
      const it = l.listIterator();
      it.next();
      it.remove();
      it.add(0);
      expect(it.next()).toBe(2);
      l.removeLast();
      expectThrows(() => it.previous(), CME);
      expectThrows(() => it.remove(), CME);
      expectThrows(() => it.add(1), CME);
    });
    it('forEachRemaining', () => {
      const it = LinkedList.of(1, 2, 3).listIterator(1);
      const out: number[] = [];
      it.forEachRemaining((x) => out.push(x));
      expect(out).toEqual([2, 3]);
    });
    it('listIterator from the back half starts at the right node', () => {
      const l = LinkedList.of(0, 1, 2, 3, 4, 5);
      expect(l.listIterator(4).next()).toBe(4);
      expect(l.listIterator(4).previous()).toBe(3);
    });
  });

  describe('descendingIterator', () => {
    it('remove() of each element empties the list', () => {
      const l = LinkedList.of(1, 2, 3);
      const it = l.descendingIterator();
      while (it.hasNext()) {
        it.next();
        it.remove();
      }
      expect(checkLinks(l)).toEqual([]);
    });
    it('remove() of the tail keeps going', () => {
      const l = LinkedList.of(1, 2, 3);
      const it = l.descendingIterator();
      it.next();
      it.remove();
      expect([it.next(), it.next(), it.hasNext()]).toEqual([2, 1, false]);
      expect(checkLinks(l)).toEqual([1, 2]);
    });
    it('remove() without next() after an outside change throws ConcurrentModificationException first', () => {
      const l = LinkedList.of(1, 2);
      const it = l.descendingIterator();
      l.add(3);
      expectThrows(() => it.remove(), CME);
      const li = l.listIterator();
      l.add(4);
      expectThrows(() => li.remove(), CME);
    });
    it('remove() twice throws IllegalStateException', () => {
      const it = LinkedList.of(1).descendingIterator();
      it.next();
      it.remove();
      expectThrows(() => it.remove(), ISE);
    });
    it('forEachRemaining', () => {
      const out: number[] = [];
      LinkedList.of(1, 2, 3).descendingIterator().forEachRemaining((x) => out.push(x));
      expect(out).toEqual([3, 2, 1]);
    });
    it('remove() after outside change fails fast', () => {
      const l = LinkedList.of(1, 2);
      const it = l.descendingIterator();
      it.next();
      l.add(3);
      expectThrows(() => it.remove(), CME);
    });
  });

  describe('reversed() as a List', () => {
    it('get / set / add(index) / removeAt are mirrored', () => {
      const l = LinkedList.of(1, 2, 3);
      const r = l.reversed();
      expect(r.get(0)).toBe(3);
      r.set(0, 30);
      r.add(1, 25);
      r.add(r.size(), 0);
      expect(l.toArray()).toEqual([0, 1, 2, 25, 30]);
      expect(r.removeAt(1)).toBe(25);
      expect(checkLinks(l)).toEqual([0, 1, 2, 30]);
    });
    it('add(e) appends to the view = prepends to the list', () => {
      const l = LinkedList.of(1);
      const r = l.reversed();
      expect(r.add(0)).toBe(true);
      expect(l.toArray()).toEqual([0, 1]);
    });
    it('subList of the view', () => expect(LinkedList.of(1, 2, 3, 4).reversed().subList(1, 3).toArray()).toEqual([3, 2]));
    it('listIterator add / remove write through', () => {
      const l = LinkedList.of(1, 2, 3);
      const it = l.reversed().listIterator();
      it.next();
      it.remove();
      it.add(9);
      expect(l.toArray()).toEqual([1, 2, 9]);
    });
    it('indexOf / lastIndexOf / contains / toArray / clear', () => {
      const l = LinkedList.of(1, 2, 1);
      const r = l.reversed();
      expect([r.indexOf(2), r.indexOf(1), r.lastIndexOf(1), r.contains(2), r.contains(9), r.isEmpty()]).toEqual([1, 0, 2, true, false, false]);
      expect(r.toArray()).toEqual([1, 2, 1]);
      r.clear();
      expect([l.size(), r.isEmpty()]).toEqual([0, true]);
    });
    it('reversed().reversed() is the original instance', () => {
      const l = LinkedList.of(1);
      expect(l.reversed().reversed()).toBe(l);
    });
    it('equals and hashCode match a reversed list', () => {
      const r = LinkedList.of(1, 2, 3).reversed();
      expect(r.equals(SimpleList.of(3, 2, 1))).toBe(true);
      expect(r.hashCode()).toBe(SimpleList.of(3, 2, 1).hashCode());
    });
  });

  describe('reversed() as a Deque', () => {
    it('every Deque method is mirrored', () => {
      const l = LinkedList.of(2, 3);
      const r = l.reversed();
      r.offerFirst(4);
      r.offerLast(1);
      r.offer(0);
      r.push(5);
      r.addLast(-1);
      expect(l.toArray()).toEqual([-1, 0, 1, 2, 3, 4, 5]);
      expect([r.peek(), r.peekFirst(), r.peekLast(), r.element(), r.getFirst(), r.getLast()]).toEqual([5, 5, -1, 5, 5, -1]);
      expect([r.pop(), r.poll(), r.pollFirst(), r.pollLast(), r.removeFirst(), r.removeLast(), r.remove()]).toEqual([5, 4, 3, -1, 2, 0, 1]);
      expect([r.isEmpty(), r.poll(), r.pollLast(), r.peek(), r.peekFirst(), r.peekLast()]).toEqual([true, null, null, null, null, null]);
      expectThrows(() => r.remove(), NSEE);
      expectThrows(() => r.pop(), NSEE);
      expectThrows(() => r.element(), NSEE);
    });
    it('remove(o) / removeFirstOccurrence / removeLastOccurrence are mirrored', () => {
      const l = LinkedList.of(1, 2, 1, 2, 1);
      const r = l.reversed();
      l.set(0, 1);
      expect(r.remove(2)).toBe(true);
      expect(l.toArray()).toEqual([1, 2, 1, 1]);
      expect(r.removeFirstOccurrence(1)).toBe(true);
      expect(l.toArray()).toEqual([1, 2, 1]);
      expect(r.removeLastOccurrence(1)).toBe(true);
      expect(l.toArray()).toEqual([2, 1]);
      expect(r.remove(9)).toBe(false);
    });
    it('remove(undefined) removes an element, not the head', () => {
      const l = LinkedList.of<unknown>(1, undefined, 2);
      expect(l.reversed().remove(undefined)).toBe(true);
      expect(l.toArray()).toEqual([1, 2]);
    });
    it('descendingIterator walks the original forwards', () => {
      const it = LinkedList.of(1, 2, 3).reversed().descendingIterator();
      const out: number[] = [];
      while (it.hasNext()) out.push(it.next());
      expect(out).toEqual([1, 2, 3]);
    });
  });

  describe('reversed() is a LinkedList', () => {
    it('instanceof LinkedList, typed as LinkedList', () => {
      const r: LinkedList<number> = LinkedList.of(1, 2).reversed();
      expect(r).toBeInstanceOf(LinkedList);
      const rr: LinkedList<number> = r.reversed();
      expect(rr.toArray()).toEqual([1, 2]);
    });
    it('reversed().reversed() is the original instance', () => {
      const l = LinkedList.of(1, 2);
      expect(l.reversed().reversed()).toBe(l);
    });
    it('the view keeps no nodes of its own', () => {
      const l = LinkedList.of(1, 2);
      const r = l.reversed();
      r.add(0);
      r.addFirst(3);
      r.add(1, 9);
      expect([r.first, r.last, r._size]).toEqual([null, null, 0]);
      expect(checkLinks(l)).toEqual([0, 1, 2, 9, 3]);
      expect(r.toArray()).toEqual([3, 9, 2, 1, 0]);
    });
    it('clone() is an independent LinkedList in reversed order', () => {
      const l = LinkedList.of(1, 2, 3);
      const c = l.reversed().clone();
      expect(c).toBeInstanceOf(LinkedList);
      expect(checkLinks(c)).toEqual([3, 2, 1]);
      c.addLast(0);
      l.addLast(4);
      expect([l.toArray(), c.toArray()]).toEqual([[1, 2, 3, 4], [3, 2, 1, 0]]);
      expect(c.reversed().reversed()).toBe(c);
    });
    it('push / pop / get / set / add(index) / addAll(index) write through mirrored', () => {
      const l = LinkedList.of(1, 2, 3);
      const r = l.reversed();
      r.push(4);
      expect(l.toArray()).toEqual([1, 2, 3, 4]);
      expect(r.pop()).toBe(4);
      expect(r.set(0, 30)).toBe(3);
      expect(r.get(2)).toBe(1);
      r.add(3, 0);
      expect(r.addAll(1, SimpleList.of(20, 21))).toBe(true);
      expect(r.addAll(SimpleList.of(-1, -2))).toBe(true);
      expect(r.addAll(SimpleList.of())).toBe(false);
      expect(r.toArray()).toEqual([30, 20, 21, 2, 1, 0, -1, -2]);
      expect(checkLinks(l)).toEqual([-2, -1, 0, 1, 2, 21, 20, 30]);
      expectThrows(() => r.get(8), 'IndexOutOfBoundsException');
      expectThrows(() => r.add(9, 1), 'IndexOutOfBoundsException');
      expectThrows(() => r.addAll(9, SimpleList.of(1)), 'IndexOutOfBoundsException');
      expectThrows(() => r.addAll(null as any), 'NullPointerException');
    });
    it('addAll(itself) doubles the view', () => {
      const l = LinkedList.of(1, 2);
      const r = l.reversed();
      r.addAll(r);
      expect([r.toArray(), l.toArray()]).toEqual([[2, 1, 2, 1], [1, 2, 1, 2]]);
    });
    it('sort / replaceAll / removeIf / forEach in view order', () => {
      const l = LinkedList.of({ k: 1, i: 0 }, { k: 2, i: 1 }, { k: 1, i: 2 }, { k: 2, i: 3 });
      const r = l.reversed();
      r.sort((a, b) => a.k - b.k);
      expect(r.toArray().map((x) => x.i)).toEqual([2, 0, 3, 1]);
      expect(checkLinks(l).map((x) => x.i)).toEqual([1, 3, 0, 2]);
      const n = LinkedList.of(1, 2, 3);
      const rn = n.reversed();
      const seen: number[] = [];
      rn.replaceAll((x) => (seen.push(x), x * 10));
      rn.forEach((x) => seen.push(x));
      expect(seen).toEqual([3, 2, 1, 30, 20, 10]);
      expect(rn.removeIf((x) => x === 20)).toBe(true);
      expect(n.toArray()).toEqual([10, 30]);
      expectThrows(() => rn.forEach(() => n.add(1)), CME);
      expectThrows(() => rn.replaceAll((x) => (n.add(1), x)), CME);
    });
    it('equals / hashCode / toString agree with the base list in reverse', () => {
      const l = LinkedList.of(1, 2, 3);
      const r = l.reversed();
      const plain = LinkedList.of(3, 2, 1);
      expect([r.equals(plain), plain.equals(r), r.equals(l), l.equals(r)]).toEqual([true, true, false, false]);
      expect([r.equals(LinkedList.of(3, 2)), LinkedList.of(3, 2).equals(r), r.equals(r)]).toEqual([false, false, true]);
      expect(l.reversed().equals(r)).toBe(true);
      expect(r.hashCode()).toBe(plain.hashCode());
      expect(r.toString()).toBe('[3, 2, 1]');
      const self = new LinkedList<unknown>();
      const rs = self.reversed();
      self.add(1);
      self.add(rs);
      expect(rs.toString()).toBe('[(this Collection), 1]');
      expect(rs.hashCode()).toBe(31 * 31 + 1 + 31 * 0);
    });
    it('iterators and for..of are fail-fast', () => {
      const l = LinkedList.of(1, 2, 3);
      const r = l.reversed();
      const it = r.iterator();
      const li = r.listIterator();
      const sub = r.subList(0, 2);
      it.next();
      li.next();
      l.add(4);
      expectThrows(() => it.next(), CME);
      expectThrows(() => li.next(), CME);
      expectThrows(() => sub.size(), CME);
      expectThrows(() => {
        for (const _ of r) l.removeFirst();
      }, CME);
    });
    it('subList of the view writes through', () => {
      const l = LinkedList.of(0, 1, 2, 3, 4);
      const sub = l.reversed().subList(1, 4);
      expect(sub.toArray()).toEqual([3, 2, 1]);
      sub.removeAt(0);
      sub.add(7);
      expect(checkLinks(l)).toEqual([0, 7, 1, 2, 4]);
      sub.clear();
      expect(checkLinks(l)).toEqual([0, 4]);
    });
    it('toArray(generator) is in view order', () => {
      const lens: number[] = [];
      const out = LinkedList.of(1, 2, 3).reversed().toArray((n) => (lens.push(n), new Uint8Array(n)));
      expect(out).toBeInstanceOf(Uint8Array);
      expect([Array.from(out), lens]).toEqual([[3, 2, 1], [3]]);
      expectThrows(() => LinkedList.of(1).reversed().toArray(null as any), 'NullPointerException');
    });
  });

  describe('clone', () => {
    it('keeps the runtime subclass', () => {
      class Sub<E> extends LinkedList<E> {
        tag = 'sub';
      }
      const s = new Sub<number>();
      s.add(1);
      s.add(2);
      const c = s.clone();
      expect(c).toBeInstanceOf(Sub);
      expect((c as Sub<number>).tag).toBe('sub');
      expect(checkLinks(c)).toEqual([1, 2]);
      const rc = s.reversed().clone();
      expect(rc).toBeInstanceOf(Sub);
      expect(rc.toArray()).toEqual([2, 1]);
    });
    it('copies contents', () => expect(LinkedList.of(1, null, 3).clone().toArray()).toEqual([1, null, 3]));
    it('is independent both ways', () => {
      const a = LinkedList.of(1, 2);
      const b = a.clone();
      a.addLast(3);
      b.removeFirst();
      b.set(0, 9);
      expect([checkLinks(a), checkLinks(b)]).toEqual([[1, 2, 3], [9]]);
    });
    it('is shallow', () => {
      const p = { v: 1 };
      expect(LinkedList.of(p).clone().getFirst()).toBe(p);
    });
    it('of empty', () => expect(checkLinks(new LinkedList().clone())).toEqual([]));
  });

  describe('null and undefined elements', () => {
    it('in every slot and at both ends', () => {
      const l = new LinkedList<unknown>();
      l.addFirst(null);
      l.addLast(undefined);
      l.add(1, null);
      l.push(undefined);
      l.offer(null);
      expect(l.toArray()).toEqual([undefined, null, null, undefined, null]);
      expect([l.indexOf(null), l.lastIndexOf(null), l.indexOf(undefined), l.lastIndexOf(undefined)]).toEqual([1, 4, 0, 3]);
      expect([l.peekFirst(), l.peekLast(), l.getFirst()]).toEqual([undefined, null, undefined]);
    });
    it('poll of a null element is indistinguishable from empty, but size tells', () => {
      const l = LinkedList.of<unknown>(null);
      expect([l.poll(), l.size(), l.poll()]).toEqual([null, 0, null]);
    });
    it('remove(null) removes the first null, remove() removes the head', () => {
      const l = LinkedList.of<unknown>(1, null, 2, null);
      expect(l.remove(null)).toBe(true);
      expect(l.remove()).toBe(1);
      expect(l.toArray()).toEqual([2, null]);
    });
    it('remove(undefined) is remove-object, not remove-head', () => {
      const l = LinkedList.of<unknown>(1, 2);
      expect(l.remove(undefined)).toBe(false);
      expect(l.toArray()).toEqual([1, 2]);
    });
    it('contains / removeLastOccurrence', () => {
      const l = LinkedList.of<unknown>(null, 1, null);
      expect([l.contains(null), l.contains(undefined)]).toEqual([true, false]);
      l.removeLastOccurrence(null);
      expect(checkLinks(l)).toEqual([null, 1]);
    });
    it('toString / hashCode / equals', () => {
      const l = LinkedList.of<unknown>(null, undefined);
      expect(l.toString()).toBe('[null, undefined]');
      expect(l.hashCode()).toBe(31 * 31);
      expect(l.equals(SimpleList.of(null, undefined))).toBe(true);
      expect(l.equals(SimpleList.of(undefined, null))).toBe(false);
    });
  });

  describe('equality fast path agrees with Objects.equals', () => {
    it('NaN is found', () => {
      const l = LinkedList.of(1, NaN, 2, NaN);
      expect([l.indexOf(NaN), l.lastIndexOf(NaN), l.contains(NaN)]).toEqual([1, 3, true]);
      expect(l.removeLastOccurrence(NaN)).toBe(true);
      expect(l.toArray()).toEqual([1, NaN, 2]);
    });
    it('+0 and -0 are equal', () => expect(LinkedList.of(-0).indexOf(0)).toBe(0));
    it('numbers do not equal numeric strings', () => expect(LinkedList.of('1').contains(1)).toBe(false));
    it('bigint, symbol and boolean targets', () => {
      const s = Symbol('s');
      const l = LinkedList.of<unknown>(1n, s, true);
      expect([l.indexOf(1n), l.indexOf(s), l.indexOf(true), l.indexOf(Symbol('s'))]).toEqual([0, 1, 2, -1]);
    });
    it('object targets use equals()', () => {
      const l = LinkedList.of<unknown>(new Point(1, 2), new Date(5), new Point(1, 2));
      expect([l.indexOf(new Point(1, 2)), l.lastIndexOf(new Point(1, 2)), l.indexOf(new Date(5)), l.indexOf({})]).toEqual([0, 2, 1, -1]);
    });
    it('function targets compare by identity', () => {
      const f = () => 1;
      expect([LinkedList.of<unknown>(f).contains(f), LinkedList.of<unknown>(f).contains(() => 1)]).toEqual([true, false]);
    });
    it('a primitive target never matches an object element', () => expect(LinkedList.of<unknown>(new Point(1, 1), new Date(1)).indexOf(1)).toBe(-1));
  });

  describe('equals / hashCode / toString', () => {
    it('cross-equality with SimpleList and SimpleSeqList', () => {
      const l = LinkedList.of<unknown>(1, 'a', new Point(1, 1));
      for (const o of [SimpleList.of<unknown>(1, 'a', new Point(1, 1)), SimpleSeqList.of<unknown>(1, 'a', new Point(1, 1))]) {
        expect([l.equals(o), o.equals(l), l.hashCode() === o.hashCode()]).toEqual([true, true, true]);
      }
      expect(l.equals(SimpleSeqList.of<unknown>(1, 'a'))).toBe(false);
      expect(l.equals(SimpleSeqList.of<unknown>(1, 'a', new Point(2, 2)))).toBe(false);
    });
    it('LinkedList vs LinkedList', () => {
      expect(LinkedList.of(1, 2).equals(LinkedList.of(1, 2))).toBe(true);
      expect(LinkedList.of(1, 2).equals(LinkedList.of(1, 3))).toBe(false);
      expect(LinkedList.of(1, 2).equals(LinkedList.of(1))).toBe(false);
    });
    it('a list that contains itself', () => {
      const l = new LinkedList<unknown>();
      l.add(1);
      l.add(l);
      expect(l.toString()).toBe('[1, (this Collection)]');
      expect(l.hashCode()).toBe(31 * 32);
    });
  });

  describe('bulk operations', () => {
    it('removeIf in one pass keeps links valid', () => {
      const l = LinkedList.of(0, 1, 2, 3, 4, 5);
      expect(l.removeIf((x) => x % 2 === 0)).toBe(true);
      expect(checkLinks(l)).toEqual([1, 3, 5]);
      expect(l.removeIf(() => false)).toBe(false);
      expect(l.removeIf(() => true)).toBe(true);
      expect(checkLinks(l)).toEqual([]);
    });
    it('removeIf whose filter modifies the list fails fast', () => {
      const l = LinkedList.of(1, 2, 3);
      expectThrows(() => l.removeIf(() => (l.add(9), false)), CME);
    });
    it('removeIf whose filter modifies the list removes nothing', () => {
      const l = LinkedList.of(1, 2, 3, 4);
      expectThrows(() => l.removeIf((x) => (x === 3 && l.pollLast(), true)), CME);
      expect(checkLinks(l)).toEqual([1, 2, 3]);
    });
    it('removeIf whose filter throws leaves the list unchanged', () => {
      const l = LinkedList.of(1, 2, 3, 4);
      expect(() =>
        l.removeIf((x) => {
          if (x === 3) throw new Error('boom');
          return true;
        })
      ).toThrow('boom');
      expect(checkLinks(l)).toEqual([1, 2, 3, 4]);
    });
    it('toArray(generator) gets size() and fills a typed array', () => {
      const lens: number[] = [];
      const out = LinkedList.of(1, 2, 3).toArray((n) => (lens.push(n), new Float32Array(n)));
      expect(out).toBeInstanceOf(Float32Array);
      expect([Array.from(out), lens]).toEqual([[1, 2, 3], [3]]);
      expectThrows(() => LinkedList.of(1).toArray(null as any), 'NullPointerException');
    });
    it('forEach whose action modifies the list fails fast', () => {
      const l = LinkedList.of(1, 2);
      expectThrows(() => l.forEach(() => l.add(3)), CME);
    });
    it('for..of whose body modifies the list fails fast', () => {
      const l = LinkedList.of(1, 2);
      expectThrows(() => {
        for (const _ of l) l.removeLast();
      }, CME);
    });
    it('for..of with break, and a reused iterator', () => {
      const l = LinkedList.of(1, 2, 3);
      for (const x of l) if (x === 2) break;
      const it = l[Symbol.iterator]();
      expect([...it]).toEqual([1, 2, 3]);
      expect(it.next().done).toBe(true);
      const it2 = l[Symbol.iterator]();
      expect(it2.return!(undefined).done).toBe(true);
      expect(it2.next().done).toBe(true);
      expect(() => l[Symbol.iterator]().throw!(new Error('x'))).toThrow('x');
    });
    it('replaceAll', () => {
      const l = LinkedList.of(1, 2);
      l.replaceAll((x) => x * 10);
      expect(l.toArray()).toEqual([10, 20]);
      expectThrows(() => l.replaceAll((x) => (l.add(1), x)), CME);
    });
    it('sort is stable and keeps links', () => {
      const l = LinkedList.of({ k: 2, i: 0 }, { k: 1, i: 1 }, { k: 2, i: 2 }, { k: 1, i: 3 });
      l.sort((a, b) => a.k - b.k);
      expect(checkLinks(l).map((x) => x.i)).toEqual([1, 3, 0, 2]);
      const n = LinkedList.of(3, 1, 2);
      n.sort();
      expect(n.toArray()).toEqual([1, 2, 3]);
    });
    it('sort with a comparator that adds to the list loses nothing (sorted prefix, then the addition)', () => {
      const l = LinkedList.of(3, 1, 2);
      let added = false;
      l.sort((a, b) => {
        if (!added) l.add(99), (added = true);
        return a - b;
      });
      expect(checkLinks(l)).toEqual([1, 2, 3, 99]);
      const r = LinkedList.of(3, 1, 2);
      let radded = false;
      r.reversed().sort((a, b) => {
        if (!radded) r.addFirst(99), (radded = true);
        return a - b;
      });
      expect(r.toArray()).toEqual([99, 3, 2, 1]);
    });
    it('removeAll / retainAll', () => {
      const l = LinkedList.of(1, 2, 3, 2);
      l.removeAll(SimpleList.of(2));
      expect(l.toArray()).toEqual([1, 3]);
      l.retainAll(SimpleList.of(3));
      expect(checkLinks(l)).toEqual([3]);
    });
    it('subList clear on a LinkedList', () => {
      const l = LinkedList.of(0, 1, 2, 3, 4);
      l.subList(1, 4).clear();
      expect(checkLinks(l)).toEqual([0, 4]);
    });
  });

  describe('performance', () => {
    it('100k removeLast is O(1) each', () => {
      const l = new LinkedList<number>();
      for (let i = 0; i < 100_000; i++) l.add(i);
      expect(timeIt(() => {
        while (!l.isEmpty()) l.removeLast();
      })).toBeLessThan(200);
    });
    it('100k listIterator inserts in the middle stay linear', () => {
      const l = LinkedList.of(0, 1);
      expect(timeIt(() => {
        const it = l.listIterator(1);
        for (let i = 0; i < 100_000; i++) it.add(i);
      })).toBeLessThan(300);
      expect(l.size()).toBe(100_002);
    });
  });

  describe('model-based: mixed List and Deque ops vs JS array', () => {
    it.each([101, 202, 303, 404])('seed %p, 5000 ops', (seed) => {
      const r = rng(seed);
      const l = new LinkedList<number | null>();
      const m: (number | null)[] = [];
      let li = l.listIterator();
      let liPos = 0;
      let liLast = -1; // model index of the element last returned by li, -1 if none
      const resetIt = () => {
        liPos = r(m.length + 1);
        li = l.listIterator(liPos);
        liLast = -1;
      };
      for (let step = 0; step < 5000; step++) {
        const op = r(18);
        const v = r(8) === 0 ? null : r(15);
        const at = `step ${step} op ${op}`;
        const same = (a: unknown, b: unknown) => expect([at, a]).toEqual([at, b]);
        let structural = true;
        switch (op) {
          case 0: l.add(v); m.push(v); break;
          case 1: { const i = r(m.length + 1); l.add(i, v); m.splice(i, 0, v); break; }
          case 2: if (m.length) { const i = r(m.length); same(l.removeAt(i), m.splice(i, 1)[0]); } break;
          case 3: l.offerFirst(v); m.unshift(v); break;
          case 4: same(l.pollLast(), m.length ? m.pop() : null); break;
          case 5: same(l.poll(), m.length ? m.shift() : null); break;
          case 6: { const i = m.lastIndexOf(v); same(l.removeLastOccurrence(v), i !== -1); if (i !== -1) m.splice(i, 1); break; }
          case 7: { const i = m.indexOf(v); same(l.remove(v), i !== -1); if (i !== -1) m.splice(i, 1); break; }
          case 8: structural = false; if (m.length) { const i = r(m.length); same(l.set(i, v), m[i]); m[i] = v; } break;
          case 9: structural = false; same([l.indexOf(v), l.lastIndexOf(v), l.contains(v)], [m.indexOf(v), m.lastIndexOf(v), m.includes(v)]); break;
          case 10: { const i = r(m.length + 1); const xs = [v, 7]; l.addAll(i, SimpleList.of(...xs)); m.splice(i, 0, ...xs); break; }
          case 11: if (m.length) same(l.pop(), m.shift()); break;
          case 12: l.reversed().offerFirst(v); m.push(v); break;
          case 13: same(l.reversed().pollFirst(), m.length ? m.pop() : null); break;
          case 14: { same(l.removeIf((e) => e === v), m.includes(v)); for (let k = m.length - 1; k >= 0; k--) if (m[k] === v) m.splice(k, 1); break; }
          // listIterator steps, kept in sync with the model
          case 15: structural = false; if (liPos < m.length && r(2)) { same(li.next(), m[liPos]); liLast = liPos++; } else if (liPos > 0) { same(li.previous(), m[--liPos]); liLast = liPos; } break;
          case 16: structural = false; if (liLast >= 0) {
            if (r(2)) { li.set(v); m[liLast] = v; }
            else { li.remove(); m.splice(liLast, 1); if (liLast < liPos) liPos--; liLast = -1; }
          } break;
          case 17: structural = false; li.add(v); m.splice(liPos++, 0, v); liLast = -1; break;
        }
        if (structural) resetIt();
        same([l.size(), li.nextIndex()], [m.length, liPos]);
        if (m.length) same([l.getFirst(), l.peekLast()], [m[0], m[m.length - 1]]);
      }
      expect(checkLinks(l)).toEqual(m);
      expect(l.reversed().toArray()).toEqual([...m].reverse());
      expect(l.equals(SimpleSeqList.of(...m))).toBe(true);
      expect(l.hashCode()).toBe(SimpleList.of(...m).hashCode());
    });
  });
});
