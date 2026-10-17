// Minimal array-backed implementations used only by tests: they validate the abstract
// classes against the contracts and serve as "another implementation" in equality checks.
import { AbstractList } from '../src/abstract/AbstractList';
import { AbstractMap, SimpleEntry } from '../src/abstract/AbstractMap';
import { AbstractSequentialList } from '../src/abstract/AbstractSequentialList';
import { AbstractSet } from '../src/abstract/AbstractSet';
import { ConcurrentModificationException, IllegalStateException, NoSuchElementException } from '../src/exceptions';
import { Iterator, ListIterator } from '../src/interfaces/Iterator';
import { MapEntry } from '../src/interfaces/Map';
import { Set } from '../src/interfaces/Set';
import { checkIndex, checkPositionIndex, equals } from '../src/util/Objects';

export class SimpleList<E> extends AbstractList<E> {
  private a: E[] = [];
  static of<E>(...xs: E[]): SimpleList<E> {
    const l = new SimpleList<E>();
    for (const x of xs) l.add(x);
    return l;
  }
  size(): number {
    return this.a.length;
  }
  get(i: number): E {
    checkIndex(i, this.a.length);
    return this.a[i];
  }
  override set(i: number, e: E): E {
    checkIndex(i, this.a.length);
    const old = this.a[i];
    this.a[i] = e;
    return old;
  }
  protected override addAtIndex(i: number, e: E): void {
    checkPositionIndex(i, this.a.length);
    this.a.splice(i, 0, e);
    this.modCount++;
  }
  override removeAt(i: number): E {
    checkIndex(i, this.a.length);
    this.modCount++;
    return this.a.splice(i, 1)[0];
  }
}

/** AbstractSequentialList over an array, with a hand-written fail-fast ListIterator. */
export class SimpleSeqList<E> extends AbstractSequentialList<E> {
  private a: E[] = [];
  static of<E>(...xs: E[]): SimpleSeqList<E> {
    const l = new SimpleSeqList<E>();
    for (const x of xs) l.add(x);
    return l;
  }
  size(): number {
    return this.a.length;
  }
  listIterator(index = 0): ListIterator<E> {
    checkPositionIndex(index, this.a.length);
    const self = this;
    let cursor = index;
    let lastRet = -1;
    let expected = this.modCount;
    const check = () => {
      if (self.modCount !== expected) throw new ConcurrentModificationException();
    };
    return {
      hasNext: () => cursor < self.a.length,
      next() {
        check();
        if (cursor >= self.a.length) throw new NoSuchElementException();
        lastRet = cursor;
        return self.a[cursor++];
      },
      hasPrevious: () => cursor > 0,
      previous() {
        check();
        if (cursor <= 0) throw new NoSuchElementException();
        lastRet = --cursor;
        return self.a[cursor];
      },
      nextIndex: () => cursor,
      previousIndex: () => cursor - 1,
      remove() {
        if (lastRet < 0) throw new IllegalStateException();
        check();
        self.a.splice(lastRet, 1);
        if (lastRet < cursor) cursor--;
        lastRet = -1;
        expected = ++self.modCount;
      },
      set(e: E) {
        if (lastRet < 0) throw new IllegalStateException();
        check();
        self.a[lastRet] = e;
      },
      add(e: E) {
        check();
        self.a.splice(cursor++, 0, e);
        lastRet = -1;
        expected = ++self.modCount;
      },
      forEachRemaining(action: (e: E) => void) {
        while (cursor < self.a.length) action(this.next());
      },
    };
  }
}

/** Fail-fast iterator over a backing array that supports remove(). */
function arrayIterator<E>(a: E[], owner: { modCount: number }): Iterator<E> {
  let cursor = 0;
  let lastRet = -1;
  let expected = owner.modCount;
  const check = () => {
    if (owner.modCount !== expected) throw new ConcurrentModificationException();
  };
  return {
    hasNext: () => cursor < a.length,
    next() {
      check();
      if (cursor >= a.length) throw new NoSuchElementException();
      lastRet = cursor;
      return a[cursor++];
    },
    remove() {
      if (lastRet < 0) throw new IllegalStateException();
      check();
      a.splice(lastRet, 1);
      cursor = lastRet;
      lastRet = -1;
      expected = ++owner.modCount;
    },
    forEachRemaining(action: (e: E) => void) {
      while (cursor < a.length) action(this.next());
    },
  };
}

export class SimpleSet<E> extends AbstractSet<E> {
  modCount = 0;
  private a: E[] = [];
  static of<E>(...xs: E[]): SimpleSet<E> {
    const s = new SimpleSet<E>();
    for (const x of xs) s.add(x);
    return s;
  }
  iterator(): Iterator<E> {
    return arrayIterator(this.a, this);
  }
  size(): number {
    return this.a.length;
  }
  override add(e: E): boolean {
    if (this.contains(e)) return false;
    this.a.push(e);
    this.modCount++;
    return true;
  }
}

class EntrySet<K, V> extends AbstractSet<MapEntry<K, V>> {
  constructor(private readonly m: SimpleMap<K, V>) {
    super();
  }
  iterator(): Iterator<MapEntry<K, V>> {
    return arrayIterator(this.m.entries, this.m);
  }
  size(): number {
    return this.m.entries.length;
  }
  override contains(o: unknown): boolean {
    return this.m.entries.some((e) => e.equals(o));
  }
}

export class SimpleMap<K, V> extends AbstractMap<K, V> {
  modCount = 0;
  entries: SimpleEntry<K, V>[] = [];
  private es = new EntrySet(this);
  static of<K, V>(...pairs: [K, V][]): SimpleMap<K, V> {
    const m = new SimpleMap<K, V>();
    for (const [k, v] of pairs) m.put(k, v);
    return m;
  }
  entrySet(): Set<MapEntry<K, V>> {
    return this.es;
  }
  override put(k: K, v: V): V | null {
    const e = this.entries.find((x) => equals(k, x.getKey()));
    if (e) return e.setValue(v);
    this.entries.push(new SimpleEntry(k, v));
    this.modCount++;
    return null;
  }
}
