import { ArrayList } from '../src/list/ArrayList';
import { Stack } from '../src/list/Stack';
import { Vector } from '../src/list/Vector';
import { isRandomAccess } from '../src/util/guards';
import { collectionContract } from './contracts/collection';
import { listContract } from './contracts/list';
import { expectThrows, Point, rng } from './helpers';
import { SimpleList } from './support';

collectionContract('Vector', () => new Vector(), { allowsNull: true, allowsDuplicates: true });
listContract('Vector', () => new Vector());
collectionContract('Stack', () => new Stack(), { allowsNull: true, allowsDuplicates: true });
listContract('Stack', () => new Stack());

const NSEE = 'NoSuchElementException';
const IOOBE = 'IndexOutOfBoundsException';

describe('Vector · implementation', () => {
  describe('constructors and capacity', () => {
    it('no-arg is empty with capacity 10', () => {
      const v = new Vector();
      expect([v.size(), v.capacity()]).toEqual([0, 10]);
    });
    it('initial capacity is reported', () => expect(new Vector(50).capacity()).toBe(50));
    it('negative capacity throws IllegalArgumentException', () => expectThrows(() => new Vector(-1), 'IllegalArgumentException'));
    it('copies a collection', () => expect(new Vector(SimpleList.of(1, 2)).toArray()).toEqual([1, 2]));
    it('null collection throws NullPointerException', () => expectThrows(() => new Vector(null as any), 'NullPointerException'));
    it('capacity doubles when outgrown', () => {
      const v = new Vector<number>(2);
      for (let i = 0; i < 5; i++) v.add(i);
      expect(v.capacity()).toBe(8);
    });
    it('capacity from zero grows', () => {
      const v = new Vector<number>(0);
      v.add(1);
      expect(v.capacity()).toBeGreaterThanOrEqual(1);
    });
    it('ensureCapacity raises capacity', () => {
      const v = new Vector(10);
      v.ensureCapacity(15);
      expect(v.capacity()).toBe(20);
      v.ensureCapacity(100);
      expect(v.capacity()).toBe(100);
      v.ensureCapacity(5);
      expect(v.capacity()).toBe(100);
    });
    it('trimToSize sets capacity to size and keeps contents', () => {
      const v = Vector.of(1, 2, 3);
      v.trimToSize();
      expect([v.capacity(), v.toArray()]).toEqual([3, [1, 2, 3]]);
    });
    it('of() returns a Vector', () => expect(Vector.of(1)).toBeInstanceOf(Vector));
    it('is an ArrayList and RandomAccess', () => {
      expect(new Vector()).toBeInstanceOf(ArrayList);
      expect(isRandomAccess(new Vector())).toBe(true);
    });
  });

  describe('clone', () => {
    it('returns an independent Vector with the same capacity', () => {
      const v = new Vector<number>(40);
      v.add(1);
      const c = v.clone();
      c.add(2);
      expect(c).toBeInstanceOf(Vector);
      expect([v.toArray(), c.toArray(), c.capacity()]).toEqual([[1], [1, 2], 40]);
    });
    it('equals the original', () => {
      const v = Vector.of(new Point(1, 1));
      expect(v.clone().equals(v)).toBe(true);
    });
  });

  describe('legacy methods', () => {
    it('elementAt', () => expect(Vector.of('a', 'b').elementAt(1)).toBe('b'));
    it('elementAt out of range throws', () => expectThrows(() => Vector.of('a').elementAt(1), IOOBE));
    it('firstElement / lastElement', () => {
      const v = Vector.of(1, 2, 3);
      expect([v.firstElement(), v.lastElement()]).toEqual([1, 3]);
    });
    it('firstElement on empty throws NoSuchElementException', () => expectThrows(() => new Vector().firstElement(), NSEE));
    it('lastElement on empty throws NoSuchElementException', () => expectThrows(() => new Vector().lastElement(), NSEE));
    it('addElement appends', () => {
      const v = new Vector<number>();
      v.addElement(1);
      v.addElement(2);
      expect(v.toArray()).toEqual([1, 2]);
    });
    it('removeElement removes the first equal element', () => {
      const v = Vector.of(new Point(1, 1), new Point(2, 2), new Point(1, 1));
      expect(v.removeElement(new Point(1, 1))).toBe(true);
      expect(v.toString()).toBe('[(2,2), (1,1)]');
    });
    it('removeElement of absent returns false', () => expect(Vector.of(1).removeElement(2)).toBe(false));
    it('removeElementAt', () => {
      const v = Vector.of(1, 2, 3);
      v.removeElementAt(1);
      expect(v.toArray()).toEqual([1, 3]);
    });
    it('removeElementAt out of range throws', () => expectThrows(() => Vector.of(1).removeElementAt(1), IOOBE));
    it('insertElementAt takes (element, index)', () => {
      const v = Vector.of(1, 3);
      v.insertElementAt(2, 1);
      v.insertElementAt(4, 3);
      expect(v.toArray()).toEqual([1, 2, 3, 4]);
    });
    it('insertElementAt past the end throws', () => expectThrows(() => Vector.of(1).insertElementAt(2, 3), IOOBE));
    it('setElementAt takes (element, index)', () => {
      const v = Vector.of(1, 2);
      v.setElementAt(9, 0);
      expect(v.toArray()).toEqual([9, 2]);
    });
    it('setElementAt out of range throws and does not grow', () => {
      const v = Vector.of(1);
      expectThrows(() => v.setElementAt(9, 5), IOOBE);
      expect(v.size()).toBe(1);
    });
    it('removeAllElements empties', () => {
      const v = Vector.of(1, 2);
      v.removeAllElements();
      expect(v.isEmpty()).toBe(true);
    });
    it('legacy changes are structural (fail-fast)', () => {
      const v = Vector.of(1, 2);
      const it = v.iterator();
      v.addElement(3);
      expectThrows(() => it.next(), 'ConcurrentModificationException');
    });
    it('null elements are allowed', () => {
      const v = new Vector<null>();
      v.addElement(null);
      expect([v.firstElement(), v.indexOf(null)]).toEqual([null, 0]);
    });
  });

  describe('interop', () => {
    it('equals an ArrayList and a SimpleList with the same elements', () => {
      const v = Vector.of(1, 2);
      expect(v.equals(ArrayList.of(1, 2))).toBe(true);
      expect(ArrayList.of(1, 2).equals(v)).toBe(true);
      expect(v.equals(SimpleList.of(1, 2))).toBe(true);
      expect(v.hashCode()).toBe(SimpleList.of(1, 2).hashCode());
    });
    it('for..of', () => expect([...Vector.of(1, 2, 3)]).toEqual([1, 2, 3]));
    it('subList clear', () => {
      const v = Vector.of(0, 1, 2, 3);
      v.subList(1, 3).clear();
      expect(v.toArray()).toEqual([0, 3]);
    });
  });
});

describe('Stack · implementation', () => {
  it('is a Vector', () => expect(new Stack()).toBeInstanceOf(Vector));
  it('of() returns a Stack', () => expect(Stack.of(1)).toBeInstanceOf(Stack));
  it('push returns its argument', () => {
    const p = new Point(1, 1);
    expect(new Stack().push(p)).toBe(p);
  });
  it('push appends at the end (the top)', () => {
    const s = new Stack<number>();
    s.push(1);
    s.push(2);
    expect(s.toArray()).toEqual([1, 2]);
  });
  it('pop returns in LIFO order', () => {
    const s = new Stack<number>();
    s.push(1);
    s.push(2);
    s.push(3);
    expect([s.pop(), s.pop(), s.pop()]).toEqual([3, 2, 1]);
  });
  it('pop on empty throws NoSuchElementException', () => expectThrows(() => new Stack().pop(), NSEE));
  it('peek on empty throws NoSuchElementException', () => expectThrows(() => new Stack().peek(), NSEE));
  it('peek does not remove', () => {
    const s = Stack.of(1, 2);
    expect([s.peek(), s.peek(), s.size()]).toEqual([2, 2, 2]);
  });
  it('empty()', () => {
    const s = new Stack<number>();
    expect(s.empty()).toBe(true);
    s.push(1);
    expect(s.empty()).toBe(false);
    s.pop();
    expect(s.empty()).toBe(true);
  });
  it('search is 1-based from the top', () => {
    const s = Stack.of('a', 'b', 'c');
    expect([s.search('c'), s.search('b'), s.search('a')]).toEqual([1, 2, 3]);
  });
  it('search of absent is -1', () => expect(Stack.of(1).search(2)).toBe(-1));
  it('search finds the occurrence nearest the top', () => expect(Stack.of(1, 2, 1, 3).search(1)).toBe(2));
  it('search uses equals()', () => expect(Stack.of<unknown>(new Point(1, 1), 0).search(new Point(1, 1))).toBe(2));
  it('search finds NaN and null', () => {
    const s = Stack.of<unknown>(NaN, null, 1);
    expect([s.search(NaN), s.search(null)]).toEqual([3, 2]);
  });
  it('push and pop are structural (fail-fast)', () => {
    const s = Stack.of(1, 2);
    const it = s.iterator();
    s.pop();
    expectThrows(() => it.next(), 'ConcurrentModificationException');
    const it2 = s.iterator();
    s.push(5);
    expectThrows(() => it2.next(), 'ConcurrentModificationException');
  });
  it('pop of null and undefined elements', () => {
    const s = new Stack<unknown>();
    s.push(undefined);
    s.push(null);
    expect([s.pop(), s.pop(), s.empty()]).toEqual([null, undefined, true]);
  });
  it('clone is an independent Stack', () => {
    const s = Stack.of(1, 2);
    const c = s.clone();
    c.pop();
    expect(c).toBeInstanceOf(Stack);
    expect([s.size(), c.size()]).toEqual([2, 1]);
  });
  it('100k push/pop', () => {
    const s = new Stack<number>();
    for (let i = 0; i < 100_000; i++) s.push(i);
    let sum = 0;
    while (!s.empty()) sum += s.pop();
    expect(sum).toBe((99_999 * 100_000) / 2);
  });
  it('model-based random operations match a JS array', () => {
    const r = rng(77);
    const s = new Stack<number>();
    const m: number[] = [];
    for (let step = 0; step < 10_000; step++) {
      const v = r(20);
      switch (r(6)) {
        case 0:
        case 1: expect(s.push(v)).toBe(v); m.push(v); break;
        case 2: if (m.length) expect(s.pop()).toBe(m.pop()); else expectThrows(() => s.pop(), NSEE); break;
        case 3: if (m.length) expect(s.peek()).toBe(m[m.length - 1]); break;
        case 4: { const i = m.lastIndexOf(v); expect(s.search(v)).toBe(i < 0 ? -1 : m.length - i); break; }
        case 5: { const i = r(m.length + 1); s.insertElementAt(v, i); m.splice(i, 0, v); break; }
      }
      expect(s.empty()).toBe(m.length === 0);
    }
    expect(s.toArray()).toEqual(m);
  });
});
