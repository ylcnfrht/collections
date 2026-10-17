import { IndexOutOfBoundsException } from '../src/exceptions';
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
const AIOOBE = 'ArrayIndexOutOfBoundsException';
const ESE = 'EmptyStackException';

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
    it('copying a collection sets capacity to its size', () => {
      expect(new Vector(SimpleList.of(1, 2, 3)).capacity()).toBe(3);
      expect(new Vector(new Vector()).capacity()).toBe(0);
    });
    it('(initialCapacity, capacityIncrement) grows by the increment', () => {
      const v = new Vector<number>(2, 3);
      expect([v.capacity(), v.capacityIncrement]).toEqual([2, 3]);
      for (let i = 0; i < 3; i++) v.add(i);
      expect(v.capacity()).toBe(5);
      for (let i = 0; i < 3; i++) v.add(i);
      expect(v.capacity()).toBe(8);
    });
    it('capacityIncrement <= 0 doubles; default is 0', () => {
      expect(new Vector().capacityIncrement).toBe(0);
      const v = new Vector<number>(4, 0);
      for (let i = 0; i < 5; i++) v.add(i);
      expect(v.capacity()).toBe(8);
      const w = new Vector<number>(4, -2);
      for (let i = 0; i < 5; i++) w.add(i);
      expect(w.capacity()).toBe(8);
    });
    it('ensureCapacity never grows below the required minimum', () => {
      const v = new Vector<number>(4, 2);
      v.ensureCapacity(5);
      expect(v.capacity()).toBe(6);
      v.ensureCapacity(50);
      expect(v.capacity()).toBe(50);
    });
    it('(negative, increment) throws IllegalArgumentException', () => expectThrows(() => new Vector(-1, 5), 'IllegalArgumentException'));
    it('clone keeps capacityIncrement', () => expect(new Vector(3, 7).clone().capacityIncrement).toBe(7));
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
    it('elementAt out of range throws', () => expectThrows(() => Vector.of('a').elementAt(1), AIOOBE));
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
    it('removeElementAt out of range throws', () => expectThrows(() => Vector.of(1).removeElementAt(1), AIOOBE));
    it('insertElementAt takes (element, index)', () => {
      const v = Vector.of(1, 3);
      v.insertElementAt(2, 1);
      v.insertElementAt(4, 3);
      expect(v.toArray()).toEqual([1, 2, 3, 4]);
    });
    it('insertElementAt past the end throws', () => expectThrows(() => Vector.of(1).insertElementAt(2, 3), AIOOBE));
    it('setElementAt takes (element, index)', () => {
      const v = Vector.of(1, 2);
      v.setElementAt(9, 0);
      expect(v.toArray()).toEqual([9, 2]);
    });
    it('setElementAt out of range throws and does not grow', () => {
      const v = Vector.of(1);
      expectThrows(() => v.setElementAt(9, 5), AIOOBE);
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

  describe('legacy index exceptions are ArrayIndexOutOfBoundsException (an IndexOutOfBoundsException)', () => {
    const cases: [string, (v: Vector<number>) => unknown][] = [
      ['elementAt(-1)', (v) => v.elementAt(-1)],
      ['elementAt(size)', (v) => v.elementAt(2)],
      ['insertElementAt(e, -1)', (v) => v.insertElementAt(0, -1)],
      ['insertElementAt(e, size + 1)', (v) => v.insertElementAt(0, 3)],
      ['removeElementAt(-1)', (v) => v.removeElementAt(-1)],
      ['removeElementAt(size)', (v) => v.removeElementAt(2)],
      ['setElementAt(e, -1)', (v) => v.setElementAt(0, -1)],
      ['setElementAt(e, size)', (v) => v.setElementAt(0, 2)],
      ['setSize(-1)', (v) => v.setSize(-1)],
    ];
    it.each(cases)('%s', (_name, fn) => {
      const v = Vector.of(1, 2);
      expectThrows(() => fn(v), AIOOBE);
      try {
        fn(v);
      } catch (e) {
        expect(e).toBeInstanceOf(IndexOutOfBoundsException);
      }
      expect(v.toArray()).toEqual([1, 2]);
    });
  });

  describe('indexOf(o, index) / lastIndexOf(o, index)', () => {
    const v = Vector.of<unknown>(1, 2, 1, new Point(1, 1), NaN, null, 1);
    it('indexOf searches forward from index', () => {
      expect([v.indexOf(1, 0), v.indexOf(1, 1), v.indexOf(1, 3), v.indexOf(1, 7), v.indexOf(1, 100)]).toEqual([0, 2, 6, -1, -1]);
      expect([v.indexOf(new Point(1, 1), 0), v.indexOf(NaN, 0), v.indexOf(null, 0)]).toEqual([3, 4, 5]);
    });
    it('indexOf with negative index throws IndexOutOfBoundsException', () => expectThrows(() => v.indexOf(1, -1), IOOBE));
    it('lastIndexOf searches backward from index', () => {
      expect([v.lastIndexOf(1, 6), v.lastIndexOf(1, 5), v.lastIndexOf(1, 1), v.lastIndexOf(2, 0), v.lastIndexOf(1, -1)]).toEqual([6, 2, 0, -1, -1]);
      expect([v.lastIndexOf(new Point(1, 1), 6), v.lastIndexOf(NaN, 6), v.lastIndexOf(null, 6)]).toEqual([3, 4, 5]);
    });
    it('lastIndexOf with index >= size throws IndexOutOfBoundsException', () => expectThrows(() => v.lastIndexOf(1, 7), IOOBE));
    it('one-argument forms are unchanged', () => expect([v.indexOf(1), v.lastIndexOf(1), v.indexOf(9)]).toEqual([0, 6, -1]));
  });

  describe('setSize', () => {
    it('grows with null elements', () => {
      const v = Vector.of(1);
      v.setSize(3);
      expect(v.toArray()).toEqual([1, null, null]);
      expect(v.capacity()).toBeGreaterThanOrEqual(3);
    });
    it('truncates', () => {
      const v = Vector.of(1, 2, 3);
      v.setSize(1);
      expect(v.toArray()).toEqual([1]);
      v.setSize(0);
      expect(v.isEmpty()).toBe(true);
    });
    it('is structural (fail-fast)', () => {
      const v = Vector.of(1, 2);
      const it = v.iterator();
      v.setSize(2);
      expectThrows(() => it.next(), 'ConcurrentModificationException');
    });
  });

  describe('copyInto', () => {
    it('copies into a plain array (which may grow)', () => {
      const a: number[] = [9, 9, 9, 9];
      Vector.of(1, 2).copyInto(a);
      expect(a).toEqual([1, 2, 9, 9]);
      const b: number[] = [];
      Vector.of(1, 2).copyInto(b);
      expect(b).toEqual([1, 2]);
    });
    it('copies into a large enough typed array', () => {
      const a = new Float64Array(3);
      Vector.of(1, 2).copyInto(a);
      expect([...a]).toEqual([1, 2, 0]);
    });
    it('too-short typed array throws IndexOutOfBoundsException', () => expectThrows(() => Vector.of(1, 2).copyInto(new Int8Array(1)), IOOBE));
    it('null throws NullPointerException', () => expectThrows(() => Vector.of(1).copyInto(null as any), 'NullPointerException'));
  });

  describe('elements()', () => {
    it('enumerates in index order', () => {
      const e = Vector.of(1, 2).elements();
      expect([e.hasMoreElements(), e.nextElement(), e.nextElement(), e.hasMoreElements()]).toEqual([true, 1, 2, false]);
      expectThrows(() => e.nextElement(), NSEE);
    });
    it('is not fail-fast (index based)', () => {
      const v = Vector.of(1, 2);
      const e = v.elements();
      e.nextElement();
      v.add(3);
      expect([e.nextElement(), e.nextElement()]).toEqual([2, 3]);
    });
    it('asIterator() iterates and refuses remove()', () => {
      const it = Vector.of(1, 2, 3).elements().asIterator();
      expect(it.next()).toBe(1);
      expectThrows(() => it.remove(), 'UnsupportedOperationException');
      const rest: number[] = [];
      it.forEachRemaining((x) => rest.push(x));
      expect([rest, it.hasNext()]).toEqual([[2, 3], false]);
      expectThrows(() => it.next(), NSEE);
    });
    it('is JS-iterable', () => expect([...Vector.of(1, 2).elements()]).toEqual([1, 2]));
    it('empty Vector has no elements', () => expect(new Vector().elements().hasMoreElements()).toBe(false));
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
  it('pop on empty throws EmptyStackException', () => expectThrows(() => new Stack().pop(), ESE));
  it('peek on empty throws EmptyStackException', () => expectThrows(() => new Stack().peek(), ESE));
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
        case 2: if (m.length) expect(s.pop()).toBe(m.pop()); else expectThrows(() => s.pop(), ESE); break;
        case 3: if (m.length) expect(s.peek()).toBe(m[m.length - 1]); break;
        case 4: { const i = m.lastIndexOf(v); expect(s.search(v)).toBe(i < 0 ? -1 : m.length - i); break; }
        case 5: { const i = r(m.length + 1); s.insertElementAt(v, i); m.splice(i, 0, v); break; }
      }
      expect(s.empty()).toBe(m.length === 0);
    }
    expect(s.toArray()).toEqual(m);
  });
});
