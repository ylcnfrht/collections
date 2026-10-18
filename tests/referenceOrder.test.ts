// Which exception wins, and what fails open iterators/views, in cases a randomized comparison with the reference
// turned up. Every expected value below is the reference's output for the same steps.
import * as C from '../src/Collections';
import { ArrayList } from '../src/list/ArrayList';
import { LinkedList } from '../src/list/LinkedList';
import { Vector } from '../src/list/Vector';
import { TreeMap } from '../src/map/TreeMap';
import { ArrayDeque } from '../src/queue/ArrayDeque';
import { TreeSet } from '../src/set/TreeSet';

const t = (f: () => unknown): string => {
  try {
    const r = f();
    return r === undefined ? 'ok' : String(r);
  } catch (e) {
    return (e as Error).name;
  }
};
const isNum = (x: unknown) => typeof x === 'number';

describe('outcomes that follow the reference', () => {
  it.each([
    ['remove(o) of a missing element', (v: Vector<number>) => v.remove(9), 'false', 'ConcurrentModificationException'],
    ['removeAt(-1)', (v: Vector<number>) => v.removeAt(-1), 'ArrayIndexOutOfBoundsException', 'ConcurrentModificationException'],
    ['add(index past the end)', (v: Vector<number>) => v.add(5, 0), 'ArrayIndexOutOfBoundsException', '1'],
    ['add(-1)', (v: Vector<number>) => v.add(-1, 0), 'ArrayIndexOutOfBoundsException', 'ConcurrentModificationException'],
  ] as const)('Vector %s, then an open iterator', (_name, op, result, next) => {
    const v = Vector.of(1, 2);
    const it = v.iterator();
    expect([t(() => op(v)), t(() => it.next())]).toEqual([result, next]);
  });
  it('clearing an empty sublist fails other open views', () => {
    const a = ArrayList.of(1, 2, 3);
    const other = a.subList(0, 2);
    a.subList(1, 1).clear();
    expect(t(() => other.size())).toBe('ConcurrentModificationException');
  });
  it('reversed().addAll(-1, c) is an index error', () => {
    expect(t(() => ArrayList.of(1).reversed().addAll(-1, ArrayList.of(2)))).toBe('IndexOutOfBoundsException');
  });
  it.each([
    ['ArrayList', () => ArrayList.of(1, 2, 3, 4), 'ConcurrentModificationException'],
    ['Vector', () => Vector.of(1, 2, 3, 4), '[2, 3]'],
    ['LinkedList', () => LinkedList.of(1, 2, 3, 4), '[2, 3]'],
  ] as const)('%s: a sublist of a stale sublist', (_name, make, nested) => {
    const l = make();
    const s = l.subList(0, 4);
    l.add(5);
    expect([t(() => s.subList(1, 3).toString()), t(() => s.size())]).toEqual([nested, 'ConcurrentModificationException']);
  });
  it('reversed list iterator: a base change after add() is reported before the add() state', () => {
    const b = ArrayList.of(1, 2, 3);
    const li = b.reversed().listIterator();
    li.next();
    li.add(9);
    b.add(7);
    expect(t(() => li.set(0))).toBe('ConcurrentModificationException');
  });
  it('checked sorted collections: putFirst/addFirst are unsupported before any type check; navigable key sets are checked', () => {
    const m = C.checkedSortedMap(new TreeMap<any, any>(), isNum, isNum) as any;
    const s = C.checkedSortedSet(new TreeSet<any>(), isNum) as any;
    const ks = C.checkedNavigableMap(new TreeMap<any, any>(), isNum, isNum).navigableKeySet() as any;
    expect([t(() => m.putFirst('x', 1)), t(() => s.addFirst('x')), t(() => ks.add('x')), t(() => ks.add(1))]).toEqual([
      'UnsupportedOperationException',
      'UnsupportedOperationException',
      'ClassCastException',
      'UnsupportedOperationException',
    ]);
  });
  it('ArrayDeque iterator: next() past the end is NoSuchElementException even after a change', () => {
    const d = new ArrayDeque<number>();
    const it = d.descendingIterator();
    d.clear();
    expect(t(() => it.next())).toBe('NoSuchElementException');
  });
});
