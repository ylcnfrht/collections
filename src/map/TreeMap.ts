import { AbstractCollection } from '../abstract/AbstractCollection';
import { AbstractMap, SimpleImmutableEntry, entryEquals, entryHash, entryToString } from '../abstract/AbstractMap';
import { AbstractSet } from '../abstract/AbstractSet';
import {
  ClassCastException,
  ConcurrentModificationException,
  IllegalArgumentException,
  IllegalStateException,
  NoSuchElementException,
  NullPointerException,
  UnsupportedOperationException,
} from '../exceptions';
import { SequencedCollection } from '../interfaces/Collection';
import { Iterator } from '../interfaces/Iterator';
import { Map, MapEntry, NavigableMap, SortedMap } from '../interfaces/Map';
import { NavigableSet, SequencedSet, SortedSet } from '../interfaces/Set';
import { Comparator, naturalCompare } from '../util/Comparator';
import { isEntry, isMap } from '../util/guards';
import { equals, requireNonNull } from '../util/Objects';

/**
 * naturalCompare with fast paths for number/number and string/string; results are identical.
 * @internal
 */
export function natCmp(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') {
    if (a < b) return -1;
    if (a > b) return 1;
    if (a === b) return 0;
    return naturalCompare(a, b); // NaN involved
  }
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  return naturalCompare(a, b);
}

/** Red-black tree node; doubles as the live entry handed out by entrySet iterators. @internal */
export class TreeNode<K, V> implements MapEntry<K, V> {
  // field order matters: key/left/right first so a descent touches fewer cache lines
  key: K;
  left: TreeNode<K, V> | null;
  right: TreeNode<K, V> | null;
  value: V;
  parent: TreeNode<K, V> | null;
  red: boolean;
  constructor(key: K, value: V, parent: TreeNode<K, V> | null) {
    this.key = key;
    this.left = null;
    this.right = null;
    this.value = value;
    this.parent = parent;
    this.red = true;
  }
  getKey(): K {
    return this.key;
  }
  getValue(): V {
    return this.value;
  }
  setValue(value: V): V {
    const old = this.value;
    this.value = value;
    return old;
  }
  equals(o: unknown): boolean {
    return entryEquals(this, o);
  }
  hashCode(): number {
    return entryHash(this);
  }
  toString(): string {
    return entryToString(this);
  }
}

type Node<K, V> = TreeNode<K, V>;

function successor<K, V>(t: Node<K, V>): Node<K, V> | null {
  let p = t.right;
  if (p !== null) {
    while (p.left !== null) p = p.left;
    return p;
  }
  let ch = t;
  p = t.parent;
  while (p !== null && ch === p.right) {
    ch = p;
    p = p.parent;
  }
  return p;
}

function predecessor<K, V>(t: Node<K, V>): Node<K, V> | null {
  let p = t.left;
  if (p !== null) {
    while (p.right !== null) p = p.right;
    return p;
  }
  let ch = t;
  p = t.parent;
  while (p !== null && ch === p.left) {
    ch = p;
    p = p.parent;
  }
  return p;
}

// naturalCompare of a number/string key against a different type always throws ClassCastException
function mismatch(a: unknown, b: unknown): never {
  naturalCompare(a, b);
  throw new ClassCastException();
}

const isRed = (n: Node<unknown, unknown> | null): boolean => n !== null && n.red;

const snapshot = <K, V>(e: Node<K, V> | null): MapEntry<K, V> | null => (e === null ? null : new SimpleImmutableEntry(e.key, e.value));
const keyOrNull = <K>(e: Node<K, unknown> | null): K | null => (e === null ? null : e.key);
function keyOrThrow<K>(e: Node<K, unknown> | null): K {
  if (e === null) throw new NoSuchElementException();
  return e.key;
}

// what a TreeIter yields
const KEY = 0;
const VALUE = 1;
const ENTRY = 2;
const PAIR = 3;
type Kind = typeof KEY | typeof VALUE | typeof ENTRY | typeof PAIR;
// fence key meaning "no upper/lower fence"
const UNBOUNDED: unknown = Object.freeze({});

/** Fail-fast in-order cursor over [first, fence) in either direction. @internal */
export class TreeIter<T> implements Iterator<T> {
  private nxt: Node<any, any> | null;
  private last: Node<any, any> | null = null;
  private expected: number;
  constructor(
    private readonly m: TreeMap<any, any>,
    first: Node<any, any> | null,
    // the fence is tracked by key, because deleting a two-child node moves its successor's key into it
    private readonly fence: unknown,
    private readonly asc: boolean,
    private readonly kind: Kind
  ) {
    this.nxt = first;
    this.expected = m.modCount;
  }
  hasNext(): boolean {
    const n = this.nxt;
    return n !== null && (this.fence === UNBOUNDED || !Object.is(n.key, this.fence));
  }
  next(): T {
    const e = this.nxt;
    if (e === null || (this.fence !== UNBOUNDED && Object.is(e.key, this.fence))) throw new NoSuchElementException();
    if (this.m.modCount !== this.expected) throw new ConcurrentModificationException();
    this.nxt = this.asc ? successor(e) : predecessor(e);
    this.last = e;
    switch (this.kind) {
      case KEY:
        return e.key;
      case VALUE:
        return e.value;
      case ENTRY:
        return e as unknown as T;
      default:
        return [e.key, e.value] as unknown as T;
    }
  }
  remove(): void {
    const l = this.last;
    if (l === null) throw new IllegalStateException();
    if (this.m.modCount !== this.expected) throw new ConcurrentModificationException();
    // deleting a node with two children copies its successor into it, so the successor now lives in l
    if (this.asc && l.left !== null && l.right !== null) this.nxt = l;
    this.m.deleteNode(l);
    this.expected = this.m.modCount;
    this.last = null;
  }
  forEachRemaining(action: (e: T) => void): void {
    requireNonNull(action);
    while (this.hasNext()) action(this.next());
  }
}

/** JS iterator protocol over a cursor: a plain object, which is much faster than a generator. */
function jsIter<T>(it: Iterator<T>): Generator<T> {
  return {
    next(): IteratorResult<T> {
      return it.hasNext() ? { done: false, value: it.next() } : { done: true, value: undefined };
    },
    return(value?: unknown): IteratorResult<T> {
      return { done: true, value };
    },
    throw(e?: unknown): IteratorResult<T> {
      throw e;
    },
    [Symbol.iterator]() {
      return this;
    },
  } as Generator<T>;
}

/** What the key/value/entry views need from TreeMap and its range views. @internal */
export interface TreeBacked<K, V> extends NavigableMap<K, V> {
  iter<T>(kind: Kind): TreeIter<T>;
  nodeFor(key: unknown): Node<K, V> | null;
  removeKey(key: unknown): boolean;
}

/**
 * Red-black tree map ordered by a comparator, or by natural ordering (naturalCompare) when it is null.
 * The comparator defines key equality. O(log n) get/put/remove/navigation.
 */
export class TreeMap<K, V> extends AbstractMap<K, V> implements NavigableMap<K, V>, TreeBacked<K, V> {
  private root: Node<K, V> | null = null;
  // cached greatest node (null when empty): O(1) lastKey and an append fast path for ascending puts
  private maxNode: Node<K, V> | null = null;
  private count = 0;
  /** @internal structural modification counter for fail-fast iterators */
  modCount = 0;
  private readonly cmp: Comparator<K> | null;
  private esView: EntrySetView<K, V> | undefined;
  private ksView: NavigableKeySet<K> | undefined;
  private vView: ValuesView<V> | undefined;
  private descView: SubMap<K, V> | undefined;

  /** new TreeMap(), new TreeMap(comparator), or a copy of a map (inheriting a sorted map's comparator). */
  constructor(source?: Comparator<K> | Map<K, V> | null) {
    super();
    let c: Comparator<K> | null = null;
    if (typeof source === 'function') c = source;
    else if (source != null) {
      if (!isMap(source)) throw new IllegalArgumentException('expected a comparator or a Map');
      const sc = (source as { comparator?: unknown }).comparator;
      if (typeof sc === 'function') c = sc.call(source) ?? null;
    }
    this.cmp = c;
    if (source != null && typeof source !== 'function') this.putAll(source);
  }

  /** Shallow copy with the same comparator. */
  clone(): TreeMap<K, V> {
    const m = new TreeMap<K, V>(this.cmp);
    for (let e = this.firstNode(); e !== null; e = successor(e)) m.put(e.key, e.value);
    return m;
  }

  /** @internal */
  compare(a: unknown, b: unknown): number {
    const c = this.cmp;
    return c === null ? natCmp(a, b) : c(a as K, b as K);
  }

  // ---- tree primitives

  /** @internal */
  getNode(key: unknown): Node<K, V> | null {
    let p = this.root;
    const c = this.cmp;
    if (c !== null) {
      while (p !== null) {
        const r = c(key as K, p.key);
        if (r < 0) p = p.left;
        else if (r > 0) p = p.right;
        else return p;
      }
      return null;
    }
    // natural ordering, inlined for number and string keys
    if (typeof key === 'number') {
      if (key === key) {
        while (p !== null) {
          const k = p.key as unknown;
          if (typeof k !== 'number') return mismatch(key, k);
          if (key < k) p = p.left;
          else if (key > k) p = p.right;
          else if (key === k) return p;
          else p = p.left; // k is NaN, which sorts last
        }
        return null;
      }
    } else if (typeof key === 'string') {
      while (p !== null) {
        const k = p.key as unknown;
        if (key === k) return p;
        if (typeof k !== 'string') return mismatch(key, k);
        p = key < k ? p.left : p.right;
      }
      return null;
    } else if (key === null || key === undefined) throw new NullPointerException();
    while (p !== null) {
      const r = natCmp(key, p.key);
      if (r < 0) p = p.left;
      else if (r > 0) p = p.right;
      else return p;
    }
    return null;
  }

  /** @internal */
  nodeFor(key: unknown): Node<K, V> | null {
    return this.getNode(key);
  }

  /** @internal */
  firstNode(): Node<K, V> | null {
    let p = this.root;
    if (p !== null) while (p.left !== null) p = p.left;
    return p;
  }

  /** @internal */
  lastNode(): Node<K, V> | null {
    return this.maxNode;
  }

  /** @internal least node >= key */
  ceilingNode(key: unknown): Node<K, V> | null {
    let p = this.root;
    let best: Node<K, V> | null = null;
    const c = (this.cmp ?? natCmp) as (a: unknown, b: unknown) => number;
    while (p !== null) {
      const r = c(key, p.key);
      if (r < 0) {
        best = p;
        p = p.left;
      } else if (r > 0) p = p.right;
      else return p;
    }
    return best;
  }

  /** @internal least node > key */
  higherNode(key: unknown): Node<K, V> | null {
    let p = this.root;
    let best: Node<K, V> | null = null;
    const c = (this.cmp ?? natCmp) as (a: unknown, b: unknown) => number;
    while (p !== null) {
      if (c(key, p.key) < 0) {
        best = p;
        p = p.left;
      } else p = p.right;
    }
    return best;
  }

  /** @internal greatest node <= key */
  floorNode(key: unknown): Node<K, V> | null {
    let p = this.root;
    let best: Node<K, V> | null = null;
    const c = (this.cmp ?? natCmp) as (a: unknown, b: unknown) => number;
    while (p !== null) {
      const r = c(key, p.key);
      if (r > 0) {
        best = p;
        p = p.right;
      } else if (r < 0) p = p.left;
      else return p;
    }
    return best;
  }

  /** @internal greatest node < key */
  lowerNode(key: unknown): Node<K, V> | null {
    let p = this.root;
    let best: Node<K, V> | null = null;
    const c = (this.cmp ?? natCmp) as (a: unknown, b: unknown) => number;
    while (p !== null) {
      if (c(key, p.key) > 0) {
        best = p;
        p = p.right;
      } else p = p.left;
    }
    return best;
  }

  private insert(key: K, value: V, onlyIfAbsent: boolean): V | null {
    let t = this.root;
    const c = this.cmp;
    if (t === null) {
      // type (and null) check even for the first key
      if (c === null) natCmp(key, key);
      else c(key, key);
      const n = new TreeNode<K, V>(key, value, null);
      n.red = false;
      this.root = this.maxNode = n;
      this.count = 1;
      this.modCount++;
      return null;
    }
    // append fast path: a key above the maximum becomes its right child without a descent
    const max = this.maxNode!;
    const rm = c === null ? natCmp(key, max.key) : c(key, max.key);
    if (rm > 0) return this.attach(key, value, max, false);
    if (rm === 0) return this.overwrite(max, value, onlyIfAbsent);
    let parent: Node<K, V>;
    let left: boolean;
    if (c !== null) {
      do {
        parent = t;
        const r = c(key, t.key);
        if (r === 0) return this.overwrite(t, value, onlyIfAbsent);
        left = r < 0;
        t = left ? t.left : t.right;
      } while (t !== null);
    } else if (typeof key === 'number' && key === key) {
      do {
        parent = t;
        const k = t.key as unknown;
        if (typeof k !== 'number') return mismatch(key, k);
        if (key === k) return this.overwrite(t, value, onlyIfAbsent);
        left = !(key > k); // NaN keys sort last
        t = left ? t.left : t.right;
      } while (t !== null);
    } else if (typeof key === 'string') {
      do {
        parent = t;
        const k = t.key as unknown;
        if (key === k) return this.overwrite(t, value, onlyIfAbsent);
        if (typeof k !== 'string') return mismatch(key, k);
        left = key < k;
        t = left ? t.left : t.right;
      } while (t !== null);
    } else {
      do {
        parent = t;
        const r = natCmp(key, t.key);
        if (r === 0) return this.overwrite(t, value, onlyIfAbsent);
        left = r < 0;
        t = left ? t.left : t.right;
      } while (t !== null);
    }
    return this.attach(key, value, parent, left);
  }

  private attach(key: K, value: V, parent: Node<K, V>, left: boolean): null {
    const n = new TreeNode<K, V>(key, value, parent);
    if (left) parent.left = n;
    else {
      parent.right = n;
      if (parent === this.maxNode) this.maxNode = n;
    }
    this.fixAfterInsertion(n);
    this.count++;
    this.modCount++;
    return null;
  }

  private overwrite(t: Node<K, V>, value: V, onlyIfAbsent: boolean): V | null {
    const old = t.value;
    if (!onlyIfAbsent || old === null) t.value = value;
    return old;
  }

  private rotateLeft(p: Node<K, V>): void {
    const r = p.right!;
    p.right = r.left;
    if (r.left !== null) r.left.parent = p;
    const pp = p.parent;
    r.parent = pp;
    if (pp === null) this.root = r;
    else if (pp.left === p) pp.left = r;
    else pp.right = r;
    r.left = p;
    p.parent = r;
  }

  private rotateRight(p: Node<K, V>): void {
    const l = p.left!;
    p.left = l.right;
    if (l.right !== null) l.right.parent = p;
    const pp = p.parent;
    l.parent = pp;
    if (pp === null) this.root = l;
    else if (pp.right === p) pp.right = l;
    else pp.left = l;
    l.right = p;
    p.parent = l;
  }

  private fixAfterInsertion(x: Node<K, V>): void {
    // x is red; a red parent is never the root, so the grandparent exists
    while (x !== this.root && x.parent!.red) {
      const p = x.parent!;
      const g = p.parent!;
      if (p === g.left) {
        const y = g.right;
        if (y !== null && y.red) {
          p.red = false;
          y.red = false;
          g.red = true;
          x = g;
        } else {
          if (x === p.right) {
            x = p;
            this.rotateLeft(x);
          }
          x.parent!.red = false;
          g.red = true;
          this.rotateRight(g);
        }
      } else {
        const y = g.left;
        if (y !== null && y.red) {
          p.red = false;
          y.red = false;
          g.red = true;
          x = g;
        } else {
          if (x === p.left) {
            x = p;
            this.rotateRight(x);
          }
          x.parent!.red = false;
          g.red = true;
          this.rotateLeft(g);
        }
      }
    }
    this.root!.red = false;
  }

  /** @internal Unlinks p. If p has two children its successor's key/value move into p and the successor node is unlinked. */
  deleteNode(p: Node<K, V>): void {
    this.modCount++;
    this.count--;
    if (p.left !== null && p.right !== null) {
      const s = successor(p)!;
      if (s === this.maxNode) this.maxNode = p;
      p.key = s.key;
      p.value = s.value;
      p = s;
    } else if (p === this.maxNode) this.maxNode = predecessor(p);
    const replacement = p.left !== null ? p.left : p.right;
    if (replacement !== null) {
      const pp = p.parent;
      replacement.parent = pp;
      if (pp === null) this.root = replacement;
      else if (p === pp.left) pp.left = replacement;
      else pp.right = replacement;
      p.left = p.right = p.parent = null;
      if (!p.red) this.fixAfterDeletion(replacement);
    } else if (p.parent === null) {
      this.root = null;
    } else {
      // no children: use p itself as the phantom for the fix-up, then unlink
      if (!p.red) this.fixAfterDeletion(p);
      const pp = p.parent;
      if (pp !== null) {
        if (p === pp.left) pp.left = null;
        else if (p === pp.right) pp.right = null;
        p.parent = null;
      }
    }
  }

  private fixAfterDeletion(x: Node<K, V>): void {
    while (x !== this.root && !x.red) {
      const xp = x.parent!;
      if (x === xp.left) {
        let sib = xp.right!;
        if (sib.red) {
          sib.red = false;
          xp.red = true;
          this.rotateLeft(xp);
          sib = xp.right!;
        }
        if (!isRed(sib.left) && !isRed(sib.right)) {
          sib.red = true;
          x = xp;
        } else {
          if (!isRed(sib.right)) {
            sib.left!.red = false;
            sib.red = true;
            this.rotateRight(sib);
            sib = xp.right!;
          }
          sib.red = xp.red;
          xp.red = false;
          sib.right!.red = false;
          this.rotateLeft(xp);
          x = this.root!;
        }
      } else {
        let sib = xp.left!;
        if (sib.red) {
          sib.red = false;
          xp.red = true;
          this.rotateRight(xp);
          sib = xp.left!;
        }
        if (!isRed(sib.right) && !isRed(sib.left)) {
          sib.red = true;
          x = xp;
        } else {
          if (!isRed(sib.left)) {
            sib.right!.red = false;
            sib.red = true;
            this.rotateLeft(sib);
            sib = xp.left!;
          }
          sib.red = xp.red;
          xp.red = false;
          sib.left!.red = false;
          this.rotateRight(xp);
          x = this.root!;
        }
      }
    }
    x.red = false;
  }

  /** @internal */
  iter<T>(kind: Kind): TreeIter<T> {
    return new TreeIter<T>(this, this.firstNode(), UNBOUNDED, true, kind);
  }

  /** @internal */
  removeKey(key: unknown): boolean {
    const n = this.getNode(key);
    if (n === null) return false;
    this.deleteNode(n);
    return true;
  }

  /** @internal Verifies BST order, red-black rules, parent links and size; throws on violation. */
  __checkInvariants(): void {
    const fail = (msg: string): never => {
      throw new Error(`TreeMap invariant violated: ${msg}`);
    };
    const root = this.root;
    if (root !== null) {
      if (root.parent !== null) fail('root has a parent');
      if (root.red) fail('root is red');
    }
    let nodes = 0;
    const blackHeight = (n: Node<K, V> | null): number => {
      if (n === null) return 1;
      nodes++;
      if (n.left !== null && n.left.parent !== n) fail(`bad parent link under ${String(n.key)}`);
      if (n.right !== null && n.right.parent !== n) fail(`bad parent link under ${String(n.key)}`);
      if (n.red && (isRed(n.left) || isRed(n.right))) fail(`red-red at ${String(n.key)}`);
      const l = blackHeight(n.left);
      const r = blackHeight(n.right);
      if (l !== r) fail(`unequal black height at ${String(n.key)}`);
      return l + (n.red ? 0 : 1);
    };
    blackHeight(root);
    if (nodes !== this.count) fail(`size ${this.count} but ${nodes} nodes`);
    let prev: Node<K, V> | null = null;
    let seen = 0;
    for (let e = this.firstNode(); e !== null; e = successor(e)) {
      if (prev !== null && this.compare(prev.key, e.key) >= 0) fail(`order broken at ${String(e.key)}`);
      if (prev !== null && predecessor(e) !== prev) fail(`predecessor mismatch at ${String(e.key)}`);
      prev = e;
      seen++;
    }
    if (seen !== this.count) fail('in-order walk does not visit every node');
    if (this.maxNode !== prev) fail('cached maximum is stale');
  }

  // ---- Map

  override size(): number {
    return this.count;
  }

  override isEmpty(): boolean {
    return this.count === 0;
  }

  protected override findEntry(key: unknown): MapEntry<K, V> | undefined {
    return this.getNode(key) ?? undefined;
  }

  override get(key: unknown): V | null {
    const n = this.getNode(key);
    return n === null ? null : n.value;
  }

  override containsKey(key: unknown): boolean {
    return this.getNode(key) !== null;
  }

  override containsValue(value: unknown): boolean {
    for (let e = this.firstNode(); e !== null; e = successor(e)) if (equals(value, e.value)) return true;
    return false;
  }

  override getOrDefault(key: unknown, defaultValue: V): V {
    const n = this.getNode(key);
    return n === null ? defaultValue : n.value;
  }

  override put(key: K, value: V): V | null {
    return this.insert(key, value, false);
  }

  override putIfAbsent(key: K, value: V): V | null {
    return this.insert(key, value, true);
  }

  override remove(key: unknown): V | null;
  override remove(key: unknown, value: unknown): boolean;
  override remove(key: unknown, value?: unknown): V | null | boolean {
    const n = this.getNode(key);
    if (arguments.length >= 2) {
      if (n === null || !equals(n.value, value)) return false;
      this.deleteNode(n);
      return true;
    }
    if (n === null) return null;
    const v = n.value;
    this.deleteNode(n);
    return v;
  }

  override clear(): void {
    this.modCount++;
    this.count = 0;
    this.root = this.maxNode = null;
  }

  override forEach(action: (key: K, value: V) => void): void {
    requireNonNull(action);
    const mc = this.modCount;
    for (let e = this.firstNode(); e !== null; e = successor(e)) {
      action(e.key, e.value);
      if (this.modCount !== mc) throw new ConcurrentModificationException();
    }
  }

  override replaceAll(fn: (key: K, value: V) => V): void {
    requireNonNull(fn);
    const mc = this.modCount;
    for (let e = this.firstNode(); e !== null; e = successor(e)) {
      e.value = fn(e.key, e.value);
      if (this.modCount !== mc) throw new ConcurrentModificationException();
    }
  }

  override computeIfAbsent(key: K, fn: (key: K) => V | null | undefined): V | null {
    requireNonNull(fn);
    const n = this.getNode(key);
    if (n !== null && n.value !== null) return n.value;
    const v = fn(key);
    if (v === null || v === undefined) return null;
    this.put(key, v);
    return v;
  }

  override computeIfPresent(key: K, fn: (key: K, value: V) => V | null | undefined): V | null {
    requireNonNull(fn);
    const n = this.getNode(key);
    if (n === null || n.value === null) return null;
    const mc = this.modCount;
    const v = fn(key, n.value);
    return this.settle(key, n, mc, v);
  }

  override compute(key: K, fn: (key: K, value: V | null) => V | null | undefined): V | null {
    requireNonNull(fn);
    const n = this.getNode(key);
    const mc = this.modCount;
    const v = fn(key, n === null ? null : n.value);
    if ((v === null || v === undefined) && n === null && this.modCount === mc) return null;
    return this.settle(key, n, mc, v);
  }

  override merge(key: K, value: V, fn: (oldValue: V, value: V) => V | null | undefined): V | null {
    requireNonNull(fn);
    requireNonNull(value);
    const n = this.getNode(key);
    const mc = this.modCount;
    const v = n === null || n.value === null ? value : fn(n.value, value);
    return this.settle(key, n, mc, v);
  }

  // store or remove a computed value; reuses n when the callback made no structural change
  private settle(key: K, n: Node<K, V> | null, mc: number, v: V | null | undefined): V | null {
    const fresh = n !== null && this.modCount === mc;
    if (v === null || v === undefined) {
      if (fresh) this.deleteNode(n!);
      else this.remove(key);
      return null;
    }
    if (fresh) n!.value = v;
    else this.put(key, v);
    return v;
  }

  override [Symbol.iterator](): Generator<[K, V]> {
    const m = this;
    const expected = this.modCount;
    let x = this.firstNode();
    return {
      next(): IteratorResult<[K, V]> {
        if (m.modCount !== expected) throw new ConcurrentModificationException();
        if (x === null) return { done: true, value: undefined };
        const value: [K, V] = [x.key, x.value];
        x = successor(x);
        return { done: false, value };
      },
      return(value?: unknown): IteratorResult<[K, V]> {
        x = null;
        return { done: true, value };
      },
      throw(e?: unknown): IteratorResult<[K, V]> {
        throw e;
      },
      [Symbol.iterator]() {
        return this;
      },
    } as Generator<[K, V]>;
  }

  // ---- views

  entrySet(): SequencedSet<MapEntry<K, V>> {
    return (this.esView ??= new EntrySetView(this));
  }

  override keySet(): NavigableSet<K> {
    return this.navigableKeySet();
  }

  override values(): SequencedCollection<V> {
    return (this.vView ??= new ValuesView(this));
  }

  navigableKeySet(): NavigableSet<K> {
    return (this.ksView ??= new NavigableKeySet<K>(this, NO_ADD));
  }

  descendingKeySet(): NavigableSet<K> {
    return this.descendingMap().navigableKeySet();
  }

  descendingMap(): NavigableMap<K, V> {
    return (this.descView ??= new SubMap<K, V>(this, true, undefined, true, true, undefined, true, true));
  }

  reversed(): NavigableMap<K, V> {
    return this.descendingMap();
  }

  sequencedKeySet(): NavigableSet<K> {
    return this.navigableKeySet();
  }

  sequencedValues(): SequencedCollection<V> {
    return this.values();
  }

  sequencedEntrySet(): SequencedSet<MapEntry<K, V>> {
    return this.entrySet();
  }

  headMap(toKey: K): SortedMap<K, V>;
  headMap(toKey: K, inclusive: boolean): NavigableMap<K, V>;
  headMap(toKey: K, inclusive = false): NavigableMap<K, V> {
    return new SubMap(this, true, undefined, true, false, toKey, inclusive, false);
  }

  tailMap(fromKey: K): SortedMap<K, V>;
  tailMap(fromKey: K, inclusive: boolean): NavigableMap<K, V>;
  tailMap(fromKey: K, inclusive = true): NavigableMap<K, V> {
    return new SubMap(this, false, fromKey, inclusive, true, undefined, true, false);
  }

  subMap(fromKey: K, toKey: K): SortedMap<K, V>;
  subMap(fromKey: K, fromInclusive: boolean, toKey: K, toInclusive: boolean): NavigableMap<K, V>;
  subMap(fromKey: K, a: K | boolean, b?: K, c?: boolean): NavigableMap<K, V> {
    return arguments.length >= 4
      ? new SubMap(this, false, fromKey, a as boolean, false, b as K, c as boolean, false)
      : new SubMap(this, false, fromKey, true, false, a as K, false, false);
  }

  // ---- SortedMap / NavigableMap

  comparator(): Comparator<K> | null {
    return this.cmp;
  }

  firstKey(): K {
    return keyOrThrow(this.firstNode());
  }

  lastKey(): K {
    return keyOrThrow(this.lastNode());
  }

  firstEntry(): MapEntry<K, V> | null {
    return snapshot(this.firstNode());
  }

  lastEntry(): MapEntry<K, V> | null {
    return snapshot(this.lastNode());
  }

  pollFirstEntry(): MapEntry<K, V> | null {
    const n = this.firstNode();
    if (n === null) return null;
    const e = new SimpleImmutableEntry(n.key, n.value);
    this.deleteNode(n);
    return e;
  }

  pollLastEntry(): MapEntry<K, V> | null {
    const n = this.lastNode();
    if (n === null) return null;
    const e = new SimpleImmutableEntry(n.key, n.value);
    this.deleteNode(n);
    return e;
  }

  putFirst(_key: K, _value: V): V | null {
    throw new UnsupportedOperationException();
  }

  putLast(_key: K, _value: V): V | null {
    throw new UnsupportedOperationException();
  }

  lowerEntry(key: K): MapEntry<K, V> | null {
    return snapshot(this.lowerNode(key));
  }
  lowerKey(key: K): K | null {
    return keyOrNull(this.lowerNode(key));
  }
  floorEntry(key: K): MapEntry<K, V> | null {
    return snapshot(this.floorNode(key));
  }
  floorKey(key: K): K | null {
    return keyOrNull(this.floorNode(key));
  }
  ceilingEntry(key: K): MapEntry<K, V> | null {
    return snapshot(this.ceilingNode(key));
  }
  ceilingKey(key: K): K | null {
    return keyOrNull(this.ceilingNode(key));
  }
  higherEntry(key: K): MapEntry<K, V> | null {
    return snapshot(this.higherNode(key));
  }
  higherKey(key: K): K | null {
    return keyOrNull(this.higherNode(key));
  }
}

/** Live range view (optionally descending) over a TreeMap. */
class SubMap<K, V> extends AbstractMap<K, V> implements NavigableMap<K, V>, TreeBacked<K, V> {
  private esView: EntrySetView<K, V> | undefined;
  private ksView: NavigableKeySet<K> | undefined;
  private vView: ValuesView<V> | undefined;
  private descView: SubMap<K, V> | undefined;
  private rcmp: Comparator<K> | undefined;

  constructor(
    private readonly m: TreeMap<K, V>,
    private readonly fromStart: boolean,
    private readonly lo: K | undefined,
    private readonly loInc: boolean,
    private readonly toEnd: boolean,
    private readonly hi: K | undefined,
    private readonly hiInc: boolean,
    private readonly desc: boolean
  ) {
    super();
    if (!fromStart && !toEnd) {
      if (m.compare(lo, hi) > 0) throw new IllegalArgumentException('fromKey > toKey');
    } else {
      // type checks
      if (!fromStart) m.compare(lo, lo);
      if (!toEnd) m.compare(hi, hi);
    }
  }

  // ---- range checks (absolute, i.e. in the base map's order)

  private tooLow(key: unknown): boolean {
    if (!this.fromStart) {
      const c = this.m.compare(key, this.lo);
      if (c < 0 || (c === 0 && !this.loInc)) return true;
    }
    return false;
  }

  private tooHigh(key: unknown): boolean {
    if (!this.toEnd) {
      const c = this.m.compare(key, this.hi);
      if (c > 0 || (c === 0 && !this.hiInc)) return true;
    }
    return false;
  }

  private inRange(key: unknown): boolean {
    return !this.tooLow(key) && !this.tooHigh(key);
  }

  // nested view: the new bounds are intersected with this view's; an inverted result throws IllegalArgumentException
  private sub(fromStart: boolean, lo: K | undefined, loInc: boolean, toEnd: boolean, hi: K | undefined, hiInc: boolean, desc: boolean): SubMap<K, V> {
    const m = this.m;
    if (fromStart || (!this.fromStart && m.compare(lo, this.lo) <= 0)) {
      if (!fromStart && m.compare(lo, this.lo) === 0) loInc = loInc && this.loInc;
      else {
        fromStart = this.fromStart;
        lo = this.lo;
        loInc = this.loInc;
      }
    }
    if (toEnd || (!this.toEnd && m.compare(hi, this.hi) >= 0)) {
      if (!toEnd && m.compare(hi, this.hi) === 0) hiInc = hiInc && this.hiInc;
      else {
        toEnd = this.toEnd;
        hi = this.hi;
        hiInc = this.hiInc;
      }
    }
    return new SubMap(m, fromStart, lo, loInc, toEnd, hi, hiInc, desc);
  }

  private absLowest(): Node<K, V> | null {
    const m = this.m;
    const e = this.fromStart ? m.firstNode() : this.loInc ? m.ceilingNode(this.lo) : m.higherNode(this.lo);
    return e === null || this.tooHigh(e.key) ? null : e;
  }

  private absHighest(): Node<K, V> | null {
    const m = this.m;
    const e = this.toEnd ? m.lastNode() : this.hiInc ? m.floorNode(this.hi) : m.lowerNode(this.hi);
    return e === null || this.tooLow(e.key) ? null : e;
  }

  private absCeiling(key: unknown): Node<K, V> | null {
    if (this.tooLow(key)) return this.absLowest();
    const e = this.m.ceilingNode(key);
    return e === null || this.tooHigh(e.key) ? null : e;
  }

  private absHigher(key: unknown): Node<K, V> | null {
    if (this.tooLow(key)) return this.absLowest();
    const e = this.m.higherNode(key);
    return e === null || this.tooHigh(e.key) ? null : e;
  }

  private absFloor(key: unknown): Node<K, V> | null {
    if (this.tooHigh(key)) return this.absHighest();
    const e = this.m.floorNode(key);
    return e === null || this.tooLow(e.key) ? null : e;
  }

  private absLower(key: unknown): Node<K, V> | null {
    if (this.tooHigh(key)) return this.absHighest();
    const e = this.m.lowerNode(key);
    return e === null || this.tooLow(e.key) ? null : e;
  }

  // first node past the high end (null = none)
  private absHighFence(): Node<K, V> | null {
    return this.toEnd ? null : this.hiInc ? this.m.higherNode(this.hi) : this.m.ceilingNode(this.hi);
  }

  private absLowFence(): Node<K, V> | null {
    return this.fromStart ? null : this.loInc ? this.m.lowerNode(this.lo) : this.m.floorNode(this.lo);
  }

  // ---- relative (view-order) navigation

  private lowest(): Node<K, V> | null {
    return this.desc ? this.absHighest() : this.absLowest();
  }
  private highest(): Node<K, V> | null {
    return this.desc ? this.absLowest() : this.absHighest();
  }
  private relCeiling(key: unknown): Node<K, V> | null {
    return this.desc ? this.absFloor(key) : this.absCeiling(key);
  }
  private relHigher(key: unknown): Node<K, V> | null {
    return this.desc ? this.absLower(key) : this.absHigher(key);
  }
  private relFloor(key: unknown): Node<K, V> | null {
    return this.desc ? this.absCeiling(key) : this.absFloor(key);
  }
  private relLower(key: unknown): Node<K, V> | null {
    return this.desc ? this.absHigher(key) : this.absLower(key);
  }

  private full(): boolean {
    return this.fromStart && this.toEnd;
  }

  /** @internal */
  iter<T>(kind: Kind): TreeIter<T> {
    if (this.desc) {
      const f = this.absLowFence();
      return new TreeIter<T>(this.m, this.absHighest(), f === null ? UNBOUNDED : f.key, false, kind);
    }
    const f = this.absHighFence();
    return new TreeIter<T>(this.m, this.absLowest(), f === null ? UNBOUNDED : f.key, true, kind);
  }

  /** @internal */
  nodeFor(key: unknown): Node<K, V> | null {
    return this.inRange(key) ? this.m.getNode(key) : null;
  }

  /** @internal */
  removeKey(key: unknown): boolean {
    return this.inRange(key) && this.m.removeKey(key);
  }

  // ---- Map

  override size(): number {
    if (this.full()) return this.m.size();
    // shortcut: O(range) count, no caching; fine for typical view sizes
    let n = 0;
    const fence = this.absHighFence();
    for (let e = this.absLowest(); e !== null && e !== fence; e = successor(e)) n++;
    return n;
  }

  override isEmpty(): boolean {
    return this.full() ? this.m.isEmpty() : this.absLowest() === null;
  }

  protected override findEntry(key: unknown): MapEntry<K, V> | undefined {
    return this.nodeFor(key) ?? undefined;
  }

  override get(key: unknown): V | null {
    const n = this.nodeFor(key);
    return n === null ? null : n.value;
  }

  override containsKey(key: unknown): boolean {
    return this.nodeFor(key) !== null;
  }

  override put(key: K, value: V): V | null {
    if (!this.inRange(key)) throw new IllegalArgumentException('key out of range');
    return this.m.put(key, value);
  }

  override remove(key: unknown): V | null;
  override remove(key: unknown, value: unknown): boolean;
  override remove(key: unknown, value?: unknown): V | null | boolean {
    if (arguments.length >= 2) return this.inRange(key) && this.m.remove(key, value);
    return this.inRange(key) ? this.m.remove(key) : null;
  }

  override clear(): void {
    if (this.full()) {
      this.m.clear();
      return;
    }
    const it = this.iter(KEY);
    while (it.hasNext()) {
      it.next();
      it.remove();
    }
  }

  override [Symbol.iterator](): Generator<[K, V]> {
    return jsIter(this.iter<[K, V]>(PAIR));
  }

  entrySet(): SequencedSet<MapEntry<K, V>> {
    return (this.esView ??= new EntrySetView(this));
  }

  override keySet(): NavigableSet<K> {
    return this.navigableKeySet();
  }

  override values(): SequencedCollection<V> {
    return (this.vView ??= new ValuesView(this));
  }

  navigableKeySet(): NavigableSet<K> {
    return (this.ksView ??= new NavigableKeySet<K>(this, NO_ADD));
  }

  descendingKeySet(): NavigableSet<K> {
    return this.descendingMap().navigableKeySet();
  }

  descendingMap(): NavigableMap<K, V> {
    return (this.descView ??= new SubMap(this.m, this.fromStart, this.lo, this.loInc, this.toEnd, this.hi, this.hiInc, !this.desc));
  }

  reversed(): NavigableMap<K, V> {
    return this.descendingMap();
  }

  sequencedKeySet(): NavigableSet<K> {
    return this.navigableKeySet();
  }

  sequencedValues(): SequencedCollection<V> {
    return this.values();
  }

  sequencedEntrySet(): SequencedSet<MapEntry<K, V>> {
    return this.entrySet();
  }

  headMap(toKey: K): SortedMap<K, V>;
  headMap(toKey: K, inclusive: boolean): NavigableMap<K, V>;
  headMap(toKey: K, inclusive = false): NavigableMap<K, V> {
    return this.desc ? this.sub(false, toKey, inclusive, true, undefined, true, true) : this.sub(true, undefined, true, false, toKey, inclusive, false);
  }

  tailMap(fromKey: K): SortedMap<K, V>;
  tailMap(fromKey: K, inclusive: boolean): NavigableMap<K, V>;
  tailMap(fromKey: K, inclusive = true): NavigableMap<K, V> {
    return this.desc ? this.sub(true, undefined, true, false, fromKey, inclusive, true) : this.sub(false, fromKey, inclusive, true, undefined, true, false);
  }

  subMap(fromKey: K, toKey: K): SortedMap<K, V>;
  subMap(fromKey: K, fromInclusive: boolean, toKey: K, toInclusive: boolean): NavigableMap<K, V>;
  subMap(fromKey: K, a: K | boolean, b?: K, c?: boolean): NavigableMap<K, V> {
    let fromInc = true;
    let toKey = a as K;
    let toInc = false;
    if (arguments.length >= 4) {
      fromInc = a as boolean;
      toKey = b as K;
      toInc = c as boolean;
    }
    return this.desc ? this.sub(false, toKey, toInc, false, fromKey, fromInc, true) : this.sub(false, fromKey, fromInc, false, toKey, toInc, false);
  }

  comparator(): Comparator<K> | null {
    if (!this.desc) return this.m.comparator();
    const c = this.m.comparator();
    return (this.rcmp ??= c === null ? Comparator.reverseOrder<K>() : Comparator.reversed(c));
  }

  firstKey(): K {
    return keyOrThrow(this.lowest());
  }
  lastKey(): K {
    return keyOrThrow(this.highest());
  }
  firstEntry(): MapEntry<K, V> | null {
    return snapshot(this.lowest());
  }
  lastEntry(): MapEntry<K, V> | null {
    return snapshot(this.highest());
  }

  pollFirstEntry(): MapEntry<K, V> | null {
    return this.poll(this.lowest());
  }

  pollLastEntry(): MapEntry<K, V> | null {
    return this.poll(this.highest());
  }

  private poll(n: Node<K, V> | null): MapEntry<K, V> | null {
    if (n === null) return null;
    const e = new SimpleImmutableEntry(n.key, n.value);
    this.m.deleteNode(n);
    return e;
  }

  putFirst(_key: K, _value: V): V | null {
    throw new UnsupportedOperationException();
  }
  putLast(_key: K, _value: V): V | null {
    throw new UnsupportedOperationException();
  }

  lowerEntry(key: K): MapEntry<K, V> | null {
    return snapshot(this.relLower(key));
  }
  lowerKey(key: K): K | null {
    return keyOrNull(this.relLower(key));
  }
  floorEntry(key: K): MapEntry<K, V> | null {
    return snapshot(this.relFloor(key));
  }
  floorKey(key: K): K | null {
    return keyOrNull(this.relFloor(key));
  }
  ceilingEntry(key: K): MapEntry<K, V> | null {
    return snapshot(this.relCeiling(key));
  }
  ceilingKey(key: K): K | null {
    return keyOrNull(this.relCeiling(key));
  }
  higherEntry(key: K): MapEntry<K, V> | null {
    return snapshot(this.relHigher(key));
  }
  higherKey(key: K): K | null {
    return keyOrNull(this.relHigher(key));
  }
}

class EntrySetView<K, V> extends AbstractSet<MapEntry<K, V>> implements SequencedSet<MapEntry<K, V>> {
  constructor(private readonly m: TreeBacked<K, V>) {
    super();
  }
  iterator(): Iterator<MapEntry<K, V>> {
    return this.m.iter(ENTRY);
  }
  override [Symbol.iterator](): Generator<MapEntry<K, V>> {
    return jsIter(this.iterator());
  }
  size(): number {
    return this.m.size();
  }
  override isEmpty(): boolean {
    return this.m.isEmpty();
  }
  override contains(o: unknown): boolean {
    if (!isEntry(o)) return false;
    const n = this.m.nodeFor(o.getKey());
    return n !== null && equals(n.value, o.getValue());
  }
  override remove(o: unknown): boolean {
    if (!this.contains(o)) return false;
    return this.m.removeKey((o as MapEntry<unknown, unknown>).getKey());
  }
  override clear(): void {
    this.m.clear();
  }
  reversed(): SequencedSet<MapEntry<K, V>> {
    return this.m.descendingMap().sequencedEntrySet();
  }
  addFirst(_e: MapEntry<K, V>): void {
    throw new UnsupportedOperationException();
  }
  addLast(_e: MapEntry<K, V>): void {
    throw new UnsupportedOperationException();
  }
  getFirst(): MapEntry<K, V> {
    return orThrow(this.m.firstEntry());
  }
  getLast(): MapEntry<K, V> {
    return orThrow(this.m.lastEntry());
  }
  removeFirst(): MapEntry<K, V> {
    return orThrow(this.m.pollFirstEntry());
  }
  removeLast(): MapEntry<K, V> {
    return orThrow(this.m.pollLastEntry());
  }
}

function orThrow<T>(e: T | null): T {
  if (e === null) throw new NoSuchElementException();
  return e;
}

class ValuesView<V> extends AbstractCollection<V> implements SequencedCollection<V> {
  constructor(private readonly m: TreeBacked<any, V>) {
    super();
  }
  iterator(): Iterator<V> {
    return this.m.iter(VALUE);
  }
  override [Symbol.iterator](): Generator<V> {
    return jsIter(this.iterator());
  }
  size(): number {
    return this.m.size();
  }
  override isEmpty(): boolean {
    return this.m.isEmpty();
  }
  override contains(o: unknown): boolean {
    return this.m.containsValue(o);
  }
  override clear(): void {
    this.m.clear();
  }
  reversed(): SequencedCollection<V> {
    return this.m.descendingMap().sequencedValues();
  }
  addFirst(_e: V): void {
    throw new UnsupportedOperationException();
  }
  addLast(_e: V): void {
    throw new UnsupportedOperationException();
  }
  getFirst(): V {
    return orThrow(this.m.firstEntry()).getValue();
  }
  getLast(): V {
    return orThrow(this.m.lastEntry()).getValue();
  }
  removeFirst(): V {
    return orThrow(this.m.pollFirstEntry()).getValue();
  }
  removeLast(): V {
    return orThrow(this.m.pollLastEntry()).getValue();
  }
}

/** @internal marks a key set whose add() is unsupported (map key views) */
export const NO_ADD: unknown = Object.freeze({});

/**
 * NavigableSet over the keys of a TreeMap or one of its range views.
 * With addValue !== NO_ADD, add(e) puts (e, addValue): this is how TreeSet is built.
 * @internal
 */
export class NavigableKeySet<E> extends AbstractSet<E> implements NavigableSet<E> {
  constructor(protected readonly m: TreeBacked<E, unknown>, protected readonly addValue: unknown) {
    super();
  }

  iterator(): Iterator<E> {
    return this.m.iter(KEY);
  }
  override [Symbol.iterator](): Generator<E> {
    return jsIter(this.m.iter<E>(KEY));
  }
  descendingIterator(): Iterator<E> {
    return (this.m.descendingMap() as TreeBacked<E, unknown>).iter(KEY);
  }
  size(): number {
    return this.m.size();
  }
  override isEmpty(): boolean {
    return this.m.isEmpty();
  }
  override contains(o: unknown): boolean {
    return this.m.containsKey(o);
  }
  override add(e: E): boolean {
    if (this.addValue === NO_ADD) throw new UnsupportedOperationException();
    return this.m.put(e, this.addValue) === null;
  }
  override remove(o: unknown): boolean {
    return this.m.removeKey(o);
  }
  override clear(): void {
    this.m.clear();
  }
  comparator(): Comparator<E> | null {
    return this.m.comparator();
  }
  first(): E {
    return this.m.firstKey();
  }
  last(): E {
    return this.m.lastKey();
  }
  getFirst(): E {
    return this.m.firstKey();
  }
  getLast(): E {
    return this.m.lastKey();
  }
  removeFirst(): E {
    return orThrow(this.m.pollFirstEntry()).getKey();
  }
  removeLast(): E {
    return orThrow(this.m.pollLastEntry()).getKey();
  }
  addFirst(_e: E): void {
    throw new UnsupportedOperationException();
  }
  addLast(_e: E): void {
    throw new UnsupportedOperationException();
  }
  lower(e: E): E | null {
    return this.m.lowerKey(e);
  }
  floor(e: E): E | null {
    return this.m.floorKey(e);
  }
  ceiling(e: E): E | null {
    return this.m.ceilingKey(e);
  }
  higher(e: E): E | null {
    return this.m.higherKey(e);
  }
  pollFirst(): E | null {
    const e = this.m.pollFirstEntry();
    return e === null ? null : e.getKey();
  }
  pollLast(): E | null {
    const e = this.m.pollLastEntry();
    return e === null ? null : e.getKey();
  }
  private view(m: NavigableMap<E, unknown>): NavigableSet<E> {
    return new NavigableKeySet<E>(m as TreeBacked<E, unknown>, this.addValue);
  }
  descendingSet(): NavigableSet<E> {
    return this.view(this.m.descendingMap());
  }
  reversed(): NavigableSet<E> {
    return this.descendingSet();
  }
  headSet(toElement: E): SortedSet<E>;
  headSet(toElement: E, inclusive: boolean): NavigableSet<E>;
  headSet(toElement: E, inclusive = false): NavigableSet<E> {
    return this.view(this.m.headMap(toElement, inclusive));
  }
  tailSet(fromElement: E): SortedSet<E>;
  tailSet(fromElement: E, inclusive: boolean): NavigableSet<E>;
  tailSet(fromElement: E, inclusive = true): NavigableSet<E> {
    return this.view(this.m.tailMap(fromElement, inclusive));
  }
  subSet(fromElement: E, toElement: E): SortedSet<E>;
  subSet(fromElement: E, fromInclusive: boolean, toElement: E, toInclusive: boolean): NavigableSet<E>;
  subSet(fromElement: E, a: E | boolean, b?: E, c?: boolean): NavigableSet<E> {
    return arguments.length >= 4
      ? this.view(this.m.subMap(fromElement, a as boolean, b as E, c as boolean))
      : this.view(this.m.subMap(fromElement, true, a as E, false));
  }
}
