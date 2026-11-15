// TS side of the differential harness: executes scripts against our library and prints the same
// normalised lines as RefRunner. Keep the two files in lock-step (same op names, same catalogue).
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  AbstractCollection,
  AbstractList,
  AbstractMap,
  AbstractQueue,
  AbstractSequentialList,
  AbstractSet,
  ArrayDeque,
  ArrayList,
  Collections,
  Collector,
  Collectors,
  Comparator,
  DoubleStream,
  DoubleSummaryStatistics,
  Gatherer,
  Gatherers,
  HashMap,
  HashSet,
  IdentityHashMap,
  IllegalStateException,
  IntStream,
  IntSummaryStatistics,
  Integrator,
  LinkedHashMap,
  LinkedHashSet,
  LinkedList,
  List,
  LongStream,
  LongSummaryStatistics,
  Map,
  NullPointerException,
  Objects,
  Optional,
  OptionalDouble,
  OptionalInt,
  OptionalLong,
  PriorityQueue,
  Set,
  SimpleEntry,
  SimpleImmutableEntry,
  Spliterator,
  Spliterators,
  Stack,
  Stream,
  StreamSupport,
  TreeMap,
  TreeSet,
  Vector,
  isRandomAccess,
  naturalCompare,
} from '../../src/index';
import { hit, top } from './coverage';

// ---------------------------------------------------------------- normalisation

const BIG = 9007199254740991; // 2^53 - 1

function num(v: number): string {
  if (v >= BIG) return 'BIG';
  if (v <= -BIG) return '-BIG';
  return String(v === 0 ? 0 : v);
}

function numD(d: number): string {
  if (d !== d) return 'NaN';
  if (d === Infinity) return 'Inf';
  if (d === -Infinity) return '-Inf';
  if (Number.isInteger(d)) return num(d);
  // shortest round-trip digits as <integer digits>e<exponent>, trailing zeros stripped (BigDecimal.stripTrailingZeros)
  const [m, e] = d.toExponential().split('e');
  const frac = m.includes('.') ? m.length - m.indexOf('.') - 1 : 0;
  let digits = m.replace('.', '');
  let exp = Number(e) - frac;
  while (digits.endsWith('0') && digits.length > 1) {
    digits = digits.slice(0, -1);
    exp++;
  }
  return `${digits}e${exp}`;
}

const isFn = (x: any, name: string) => x !== null && typeof x === 'object' && typeof x[name] === 'function';

/** ord: undefined = decide from the runtime shape; true = iteration order; false = sorted canonical form. */
export function fmt(x: any, ord?: boolean): string {
  if (x === null) return 'null';
  if (x === undefined) return 'undefined';
  if (typeof x === 'string') return `"${x}"`;
  if (x instanceof Raw) return x.s;
  if (typeof x === 'boolean') return String(x);
  if (typeof x === 'number') return numD(x);
  if (x instanceof Optional) return x.isPresent() ? `OPT[${fmt(x.get())}]` : 'OPT_EMPTY';
  if (x instanceof OptionalInt || x instanceof OptionalLong || x instanceof OptionalDouble)
    return x.isPresent() ? `OPT[${numD(x.orElseThrow())}]` : 'OPT_EMPTY';
  if (x instanceof IntSummaryStatistics || x instanceof LongSummaryStatistics || x instanceof DoubleSummaryStatistics)
    return `STATS{${x.getCount()},${numD(x.getSum())},${numD(x.getMin())},${numD(x.getMax())},${numD(x.getAverage())}}`;
  if (isFn(x, 'getKey') && isFn(x, 'getValue')) return `${fmt(x.getKey())}=${fmt(x.getValue())}`;
  if (isFn(x, 'entrySet') && isFn(x, 'containsKey')) {
    const o = ord ?? isFn(x, 'firstEntry');
    const parts: string[] = [];
    for (const e of x.entrySet()) parts.push(fmt(e));
    return `{${join(parts, o)}}`;
  }
  if (Array.isArray(x) || ArrayBuffer.isView(x)) {
    const parts = Array.from(x as ArrayLike<unknown>, (e) => fmt(e));
    return `[${join(parts, ord ?? true)}]`;
  }
  if (isFn(x, 'iterator') && isFn(x, 'size')) {
    const o = ord ?? (isFn(x, 'listIterator') || isFn(x, 'getFirst'));
    const parts: string[] = [];
    for (const it = x.iterator(); it.hasNext(); ) parts.push(fmt(it.next()));
    return `[${join(parts, o)}]`;
  }
  return `?${x?.constructor?.name}`;
}

function join(parts: string[], ordered: boolean): string {
  // plain code-unit sort, the same order as String.compareTo
  if (!ordered) parts.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return parts.join(',');
}

// ---------------------------------------------------------------- tokens

export function el(t: string): any {
  if (t === 'null') return null;
  if (t.startsWith("'")) return t.slice(1);
  const eq = t.indexOf('=');
  if (eq > 0) return new SimpleEntry(el(t.slice(0, eq)), el(t.slice(eq + 1)));
  return Number(t);
}

export function list(t: string): any[] {
  const body = t.slice(1, -1);
  return body === '' ? [] : body.split(',').map(el);
}

function pairs(t: string): [any, any][] {
  const body = t.slice(1, -1);
  if (body === '') return [];
  return body.split(',').map((p) => {
    const i = p.indexOf('=');
    return [el(p.slice(0, i)), el(p.slice(i + 1))];
  });
}

const ni = (t: string) => Number(t);
const bool = (t: string) => t === 'true';

// ---------------------------------------------------------------- function catalogue (null input -> NPE, like unboxing)

function nn<T>(x: T): T {
  if (x === null || x === undefined) throw new NullPointerException();
  return x;
}

/** Integer catalogue; `+ 0` turns -0 into 0 as int arithmetic would. */
function fl(f: string, x: number): number {
  return flRaw(f, x) + 0;
}

function flRaw(f: string, x: number): number {
  switch (f) {
    case 'id': return x;
    case 'plus1': return x + 1;
    case 'times2': return x * 2;
    case 'neg': return -x;
    case 'mod3': return x % 3;
    case 'abs': return Math.abs(x);
    case 'sign': return Math.sign(x);
  }
  throw new Error('fl ' + f);
}

function fd(f: string, x: number): number {
  switch (f) {
    case 'id': return x;
    case 'plus1': return x + 1;
    case 'times2': return x * 2;
    case 'half': return x / 2;
    case 'third': return x / 3;
    case 'abs': return Math.abs(x);
    case 'trunc': return Math.trunc(x) + 0; // (long) cast: no -0
  }
  throw new Error('fd ' + f);
}

function un(f: string, x: any): any {
  if (f === 'id') return x;
  if (f === 'nullf') return null;
  nn(x);
  if (typeof x === 'string') {
    switch (f) {
      case 'len': return x.length;
      case 'upper': return x.toUpperCase();
      case 'rev': return x.split('').reverse().join('');
      case 'first': return x.slice(0, 1);
      case 'dup': return x + x;
    }
    throw new Error('un str ' + f);
  }
  if (isFn(x, 'listIterator')) {
    switch (f) {
      case 'size': return x.size();
      case 'sumList': {
        let s = 0;
        for (const o of x) s += nn(o);
        return s;
      }
    }
    throw new Error('un list ' + f);
  }
  switch (f) {
    case 'str': return String(x);
    case 'half': return x / 2;
    case 'third': return x / 3;
    case 'even': return x % 2 === 0;
    case 'trunc': return Math.trunc(x) + 0; // (long) cast: no -0
  }
  return Number.isInteger(x) ? fl(f, x) : fd(f, x);
}

/** Number of an element for the *ToInt/Long/Double catalogue: the value itself, or a string's length. */
const numv = (x: any): number => (typeof x === 'string' ? x.length : nn(x));

/** A mapper result the reference unboxes to a primitive: null throws there. */
const unboxed = (f: string, x: any): number => nn(un(f, x));

function pl(p: string, x: number): boolean {
  switch (p) {
    case 'even': return x % 2 === 0;
    case 'odd': return x % 2 !== 0;
    case 'pos': return x > 0;
    case 'gt3': return x > 3;
    case 'lt10': return x < 10;
    case 'isZero': return x === 0;
    case 'isInt': return x === Math.floor(x);
  }
  throw new Error('pl ' + p);
}

function po(p: string, x: any): boolean {
  nn(x);
  if (isFn(x, 'getKey')) {
    if (p === 'evenV') return nn(x.getValue()) % 2 === 0;
    if (p === 'posV') return nn(x.getValue()) > 0;
    throw new Error('po entry ' + p);
  }
  if (typeof x === 'string') {
    switch (p) {
      case 'empty': return x.length === 0;
      case 'hasA': return x.includes('a');
      case 'long': return x.length > 1;
    }
    throw new Error('po ' + p);
  }
  if (isFn(x, 'listIterator')) {
    if (p === 'small') return x.size() < 2;
    throw new Error('po list ' + p);
  }
  return pl(p, x);
}

function bin(op: string, a: any, b: any): any {
  if (op === 'nullBi') return null;
  nn(a);
  nn(b);
  if (typeof a === 'string') {
    if (op === 'concat') return a + (typeof b === 'string' ? b : fmt(b));
    throw new Error('bin str ' + op);
  }
  switch (op) {
    case 'add': return a + b;
    case 'max': return Math.max(a, b);
    case 'min': return Math.min(a, b);
  }
  throw new Error('bin ' + op);
}

const kv = (k: any): number => (typeof k === 'string' ? k.length : k);

function bif(f: string, k: any, v: any): any {
  switch (f) {
    case 'sumKV': return kv(nn(k)) + nn(v);
    case 'nullKV': return null;
    case 'kOnly': return kv(nn(k));
    case 'vPlus1': return nn(v) + 1;
  }
  throw new Error('bif ' + f);
}

function cmp(c: string): any {
  const mod3 = Comparator.comparingInt((x: any) => fl('mod3', nn(x)));
  const len = Comparator.comparingInt((x: any) => (nn(x) as string).length);
  switch (c) {
    case 'null': return null;
    case 'nat': return Comparator.naturalOrder();
    case 'rev': return Comparator.reverseOrder();
    case 'mod3': return mod3;
    case 'mod3rev': return Comparator.reversed(mod3);
    case 'mod3ThenRev': return Comparator.thenComparing(mod3, Comparator.reverseOrder());
    case 'len': return len;
    case 'lenNat': return Comparator.thenComparing(len, Comparator.naturalOrder());
    case 'nullsFirst': return Comparator.nullsFirst(Comparator.naturalOrder());
    case 'nullsLast': return Comparator.nullsLast(Comparator.naturalOrder());
    case 'byKey': return Map.Entry.comparingByKey();
    case 'byValue': return Map.Entry.comparingByValue();
    case 'byKeyRev': return Map.Entry.comparingByKey(Comparator.reverseOrder());
    case 'byValueRev': return Map.Entry.comparingByValue(Comparator.reverseOrder());
  }
  throw new Error('cmp ' + c);
}

function flatO(f: string, x: any): any {
  if (f === 'dup') return Stream.of(x, x);
  if (f === 'nullS') return null;
  nn(x);
  if (f === 'upto') return IntStream.range(0, Math.abs(x) % 4).boxed();
  if (f === 'chars') return Stream.of(...(x as string).split(''));
  throw new Error('flat ' + f);
}

const VOID = 'void';

/** A value to print with an explicit ordering decision for its top level. */
class Fmt {
  constructor(readonly x: unknown, readonly ord: boolean) {}
}
const fmtTop = (x: unknown) => (x instanceof Fmt ? fmt(x.x, x.ord) : fmt(x));

function excName(e: unknown): string {
  const n = (e as any)?.constructor?.name ?? typeof e;
  hit(`${n}.name`);
  return `EXC:${n}`;
}

// ---------------------------------------------------------------- scripts

/** Base targets whose iteration order is not defined (printed in sorted canonical form, views too). */
const UNORDERED = new globalThis.Set(['PriorityQueue', 'PriorityQueueRev', 'HashSet', 'HashMap', 'IdentityHashMap', 'SetOf', 'MapOf',
  'SetCopyOf', 'MapCopyOf', 'MapOfPairs', 'AbsSet', 'EmptySet', 'EmptyMap', 'EmptySetConst', 'EmptyMapConst', 'Singleton', 'SingletonMap']);

/** Marks harness subclasses of the library's abstract skeletons (coverage counts them under the skeleton). */
export const HARNESS = Symbol.for('@ylcnfrht/collections.diff.harness');

class AbsListImpl extends AbstractList<any> {
  static readonly [HARNESS] = true;
  readonly a = new ArrayList<any>();
  get(i: number): any { return this.a.get(i); }
  size(): number { return this.a.size(); }
  override set(i: number, e: any): any { return this.a.set(i, e); }
  protected override addAtIndex(i: number, e: any): void { this.a.add(i, e); this.modCount++; }
  override removeAt(i: number): any { const r = this.a.removeAt(i); this.modCount++; return r; }
}
class AbsSeqListImpl extends AbstractSequentialList<any> {
  static readonly [HARNESS] = true;
  readonly a = new LinkedList<any>();
  listIterator(i = 0): any { return this.a.listIterator(i); }
  size(): number { return this.a.size(); }
}
class AbsSetImpl extends AbstractSet<any> {
  static readonly [HARNESS] = true;
  readonly a = new HashSet<any>();
  iterator(): any { return this.a.iterator(); }
  size(): number { return this.a.size(); }
  override add(e: any): boolean { return this.a.add(e); }
}
class AbsMapImpl extends AbstractMap<any, any> {
  static readonly [HARNESS] = true;
  readonly a = new LinkedHashMap<any, any>();
  entrySet(): any { return this.a.entrySet(); }
  override put(k: any, v: any): any { return this.a.put(k, v); }
}
class AbsQueueImpl extends AbstractQueue<any> {
  static readonly [HARNESS] = true;
  readonly a = new ArrayDeque<any>();
  offer(e: any): boolean { return this.a.offer(e); }
  poll(): any { return this.a.poll(); }
  peek(): any { return this.a.peek(); }
  iterator(): any { return this.a.iterator(); }
  size(): number { return this.a.size(); }
}
class AbsCollImpl extends AbstractCollection<any> {
  static readonly [HARNESS] = true;
  readonly a = new ArrayList<any>();
  iterator(): any { return this.a.iterator(); }
  size(): number { return this.a.size(); }
  override add(e: any): boolean { return this.a.add(e); }
}

function newTarget(type: string): any {
  switch (type) {
    case 'ArrayList':
    case 'UnmodList': return new ArrayList();
    case 'LinkedList': return new LinkedList();
    case 'Vector': return new Vector();
    case 'VectorCap': return new Vector(2, 3);
    case 'Stack': return new Stack();
    case 'ArrayDeque': return new ArrayDeque();
    case 'PriorityQueue': return new PriorityQueue();
    case 'PriorityQueueRev': return new PriorityQueue(Comparator.reverseOrder());
    case 'HashSet': return new HashSet();
    case 'LinkedHashSet': return new LinkedHashSet();
    case 'TreeSet': return new TreeSet();
    case 'TreeSetRev': return new TreeSet(Comparator.reverseOrder());
    case 'TreeSetMod3': return new TreeSet(cmp('mod3'));
    case 'HashMap': return new HashMap();
    case 'LinkedHashMap': return new LinkedHashMap();
    case 'LinkedHashMapAccess': return new LinkedHashMap(16, 0.75, true);
    case 'LinkedHashMapLru': return new LruMap();
    case 'TreeMap': return new TreeMap();
    case 'TreeMapRev': return new TreeMap(Comparator.reverseOrder());
    case 'IdentityHashMap': return new IdentityHashMap();
    case 'AbsList': return new AbsListImpl();
    case 'AbsSeqList': return new AbsSeqListImpl();
    case 'AbsSet': return new AbsSetImpl();
    case 'AbsMap': return new AbsMapImpl();
    case 'AbsQueue': return new AbsQueueImpl();
    case 'AbsColl': return new AbsCollImpl();
  }
  return null; // immutable targets are built by init
}

/** removeEldestEntry hook: keeps at most 3 entries. */
class LruMap extends LinkedHashMap<any, any> {
  static readonly [HARNESS] = true;
  protected override removeEldestEntry(): boolean {
    return this.size() > 3;
  }
}

/** Immutable targets: built from the init literal. */
function buildImmutable(type: string, l: any[], ps: [any, any][]): any {
  switch (type) {
    case 'ListOf': return List.of(...l);
    case 'SetOf': return Set.of(...l);
    case 'ListCopyOf': return List.copyOf(ArrayList.of(...l));
    case 'SetCopyOf': return Set.copyOf(ArrayList.of(...l));
    case 'UnmodList': return Collections.unmodifiableList(ArrayList.of(...l));
    case 'EmptyList': return Collections.emptyList();
    case 'EmptySet': return Collections.emptySet();
    case 'EmptySortedSet': return Collections.emptySortedSet();
    case 'EmptyNavigableSet': return Collections.emptyNavigableSet();
    case 'EmptyListConst': hit('Collections.EMPTY_LIST'); return Collections.EMPTY_LIST;
    case 'EmptySetConst': hit('Collections.EMPTY_SET'); return Collections.EMPTY_SET;
    case 'SingletonList': return Collections.singletonList(l[0] ?? null);
    case 'Singleton': return Collections.singleton(l[0] ?? null);
    case 'NCopies': return Collections.nCopies(l.length, l[0] ?? null);
    case 'MapOf': return Map.ofEntries(...ps.map(([k, v]) => Map.entry(k, v)));
    case 'MapOfPairs': return (Map.of as any)(...ps.flat());
    case 'MapCopyOf': {
      const m = new LinkedHashMap();
      for (const [k, v] of ps) m.put(k, v);
      return Map.copyOf(m);
    }
    case 'EmptyMap': return Collections.emptyMap();
    case 'EmptySortedMap': return Collections.emptySortedMap();
    case 'EmptyNavigableMap': return Collections.emptyNavigableMap();
    case 'EmptyMapConst': hit('Collections.EMPTY_MAP'); return Collections.EMPTY_MAP;
    case 'SingletonMap': return Collections.singletonMap(ps[0]?.[0] ?? null, ps[0]?.[1] ?? null);
  }
  return undefined;
}

const typeCheck = (t: string) => (t === 'str' ? (x: unknown) => typeof x === 'string' : (x: unknown) => typeof x === 'number');

/** One view step: name[:arg...]. */
function applyView(o: any, seg: string): any {
  const [name, ...r] = seg.split(':');
  const C = Collections as any;
  switch (name) {
    case 'subList': return o.subList(ni(r[0]), ni(r[1]));
    case 'reversed': return o.reversed();
    case 'keySet': return o.keySet();
    case 'values': return o.values();
    case 'entrySet': return o.entrySet();
    case 'navigableKeySet': return o.navigableKeySet();
    case 'descendingKeySet': return o.descendingKeySet();
    case 'descendingMap': return o.descendingMap();
    case 'descendingSet': return o.descendingSet();
    case 'sequencedKeySet': return o.sequencedKeySet();
    case 'sequencedValues': return o.sequencedValues();
    case 'sequencedEntrySet': return o.sequencedEntrySet();
    case 'headSet': return o.headSet(el(r[0]), bool(r[1]));
    case 'tailSet': return o.tailSet(el(r[0]), bool(r[1]));
    case 'subSet': return o.subSet(el(r[0]), bool(r[1]), el(r[2]), bool(r[3]));
    case 'headSetPlain': return o.headSet(el(r[0]));
    case 'tailSetPlain': return o.tailSet(el(r[0]));
    case 'subSetPlain': return o.subSet(el(r[0]), el(r[1]));
    case 'headMap': return o.headMap(el(r[0]), bool(r[1]));
    case 'tailMap': return o.tailMap(el(r[0]), bool(r[1]));
    case 'subMap': return o.subMap(el(r[0]), bool(r[1]), el(r[2]), bool(r[3]));
    case 'headMapPlain': return o.headMap(el(r[0]));
    case 'tailMapPlain': return o.tailMap(el(r[0]));
    case 'subMapPlain': return o.subMap(el(r[0]), el(r[1]));
    case 'checkedMap':
    case 'checkedSortedMap':
    case 'checkedNavigableMap': return C[name](o, typeCheck(r[0]), typeCheck('int'));
  }
  if (name.startsWith('checked')) return C[name](o, typeCheck(r[0]));
  if (name.startsWith('unmodifiable') || name.startsWith('synchronized') || name === 'newSetFromMap' || name === 'newSequencedSetFromMap' || name === 'asLifoQueue')
    return C[name](o);
  throw new Error('view ' + seg);
}

/** Views created on the empty base before init (the reference requires an empty map). */
const PRE_INIT = new globalThis.Set(['newSetFromMap', 'newSequencedSetFromMap']);

const SET_BRAND = Symbol.for('@ylcnfrht/collections.Set');
const isSetObj = (t: any) => t?.[SET_BRAND] === true;
const isMap = (t: any) => isFn(t, 'entrySet') && isFn(t, 'containsKey');

/**
 * Ops that touch several elements: when they throw midway the partial state is unspecified (and for hashed
 * targets depends on iteration order), so the state is not compared and the script stops there.
 */
export const BULK = new globalThis.Set(['init', 'addAll', 'removeAll', 'retainAll', 'removeIf', 'iterRemove', 'collAddAll', 'addAllAt',
  'replaceAll', 'sort', 'listIterSet', 'sortBsearch', 'bsearchCmp', 'nCopiesAddAll', 'putAll', 'mreplaceAll', 'entryRemoveIf',
  'keySetRetainAll', 'iterSetValue', 'shuffle', 'reverse', 'rotate', 'fill']);

class Script {
  t: any;
  base: any;
  dead = false;
  readonly ordered: boolean;
  readonly baseType: string;
  readonly views: string[];
  /** init goes into the view (PRE_INIT views) instead of the base */
  readonly initOnView: boolean;
  constructor(readonly type: string) {
    [this.baseType, ...this.views] = type.split('/');
    this.ordered = !UNORDERED.has(this.baseType);
    this.t = this.base = newTarget(this.baseType);
    this.initOnView = this.views.length > 0 && PRE_INIT.has(this.views[0].split(':')[0]);
    if (this.initOnView) this.t = this.views.reduce(applyView, this.base);
  }

  exec(line: string): string {
    if (this.dead) return 'DEAD';
    if (line.startsWith('pipe ')) return runPipe(line.slice(5));
    if (line.startsWith('x ')) {
      const log: string[] = [];
      let res: string;
      try {
        res = fmtTop(misc(line.slice(2).split(' '), log));
      } catch (e) {
        res = excName(e);
      }
      return log.length === 0 ? res : `${res} LOG[${log.join(',')}]`;
    }
    const a = line.split(' ');
    let res: string;
    try {
      res = fmtTop(this.op(a));
    } catch (e) {
      res = excName(e);
      // UnsupportedOperationException is thrown up front (unmodifiable targets), so the state stays comparable
      if (BULK.has(a[0]) && !res.endsWith('UnsupportedOperationException')) {
        this.dead = true;
        return `${res} ;; ?`;
      }
    }
    let state: string;
    try {
      state = fmt(this.t, this.ordered);
      if (this.views.length > 0) state += ' || ' + fmt(this.base, this.ordered);
    } catch (e) {
      state = excName(e);
    }
    return `${res} ;; ${state}`;
  }

  ord(x: unknown): Fmt {
    return new Fmt(x, this.ordered);
  }

  op(a: string[]): unknown {
    const t = this.t;
    const op = a[0];
    switch (op) {
      case 'init': {
        const isPairs = a[1].startsWith('{');
        const imm = buildImmutable(this.baseType, isPairs ? [] : list(a[1]), isPairs ? pairs(a[1]) : []);
        let r: unknown = VOID;
        if (imm !== undefined) this.base = imm;
        else if (isPairs) for (const [k, v] of pairs(a[1])) this.base.put(k, v);
        else r = (this.initOnView ? t : this.base).addAll(ArrayList.of(...list(a[1])));
        if (!this.initOnView) this.t = this.views.reduce(applyView, this.base);
        return r;
      }
      case 'size': return t.size();
      case 'isEmpty': return t.isEmpty();
      case 'clear': t.clear(); return VOID;
      case 'hashCode': return t.hashCode();
      case 'toStr': return this.ordered ? t.toString() : sortedItems(t.toString());
      case 'equalsCopy':
        if (isMap(t)) return t.equals(new HashMap(t));
        if (isSetObj(t)) return t.equals(new HashSet(t));
        return t.equals(new ArrayList(t));
      case 'equalsL': {
        const l = ArrayList.of(...list(a[1]));
        if (isSetObj(t)) return t.equals(new HashSet(l));
        return t.equals(l);
      }
      case 'add': return t.add(el(a[1]));
      case 'remove': return t.remove(el(a[1]));
      case 'contains': return t.contains(el(a[1]));
      case 'addAll': return t.addAll(ArrayList.of(...list(a[1])));
      case 'removeAll': return t.removeAll(ArrayList.of(...list(a[1])));
      case 'retainAll': return t.retainAll(ArrayList.of(...list(a[1])));
      case 'containsAll': return t.containsAll(ArrayList.of(...list(a[1])));
      case 'removeIf': return t.removeIf((x: any) => po(a[1], x));
      case 'toArray': return this.ord(t.toArray());
      case 'iterRemove': {
        let n = 0;
        for (const it = t.iterator(); it.hasNext(); ) if (po(a[1], it.next())) { it.remove(); n++; }
        return n;
      }
      case 'frequency': return Collections.frequency(t, el(a[1]));
      case 'min': return Collections.min(t);
      case 'max': return Collections.max(t);
      case 'minCmp': return Collections.min(t, cmp(a[1]));
      case 'maxCmp': return Collections.max(t, cmp(a[1]));
      case 'disjoint': return Collections.disjoint(t, ArrayList.of(...list(a[1])));
      case 'collAddAll': return Collections.addAll(t, ...list(a[1]));
      case 'streamCount': return t.stream().filter((x: any) => po(a[1], x)).count();
      case 'streamList': return this.ord(t.stream().toList());
      case 'addFirst': t.addFirst(el(a[1])); return VOID;
      case 'addLast': t.addLast(el(a[1])); return VOID;
      case 'getFirst': return t.getFirst();
      case 'getLast': return t.getLast();
      case 'removeFirst': return t.removeFirst();
      case 'removeLast': return t.removeLast();
      case 'reversed': return t.reversed();
      case 'get': return isMap(t) ? t.get(el(a[1])) : t.get(ni(a[1]));
      case 'set': return t.set(ni(a[1]), el(a[2]));
      case 'addAt': t.add(ni(a[1]), el(a[2])); return VOID;
      case 'removeAt': return t.removeAt(ni(a[1]));
      case 'indexOf': return t.indexOf(el(a[1]));
      case 'lastIndexOf': return t.lastIndexOf(el(a[1]));
      case 'subList': return new ArrayList(t.subList(ni(a[1]), ni(a[2])));
      case 'subListClear': t.subList(ni(a[1]), ni(a[2])).clear(); return VOID;
      case 'subListAdd': return t.subList(ni(a[1]), ni(a[2])).add(el(a[3]));
      case 'addAllAt': return t.addAll(ni(a[1]), ArrayList.of(...list(a[2])));
      case 'replaceAll': t.replaceAll((x: any) => un(a[1], x)); return VOID;
      case 'sort': t.sort(cmp(a[1])); return VOID;
      case 'listIterAdd': t.listIterator(ni(a[1])).add(el(a[2])); return VOID;
      case 'listIterRev': {
        const r: unknown[] = [];
        for (const it = t.listIterator(ni(a[1])); it.hasPrevious(); ) r.push(it.previous());
        return r;
      }
      case 'listIterSet': {
        let n = 0;
        for (const it = t.listIterator(); it.hasNext(); ) {
          const x = it.next();
          if (po(a[1], x)) { it.set(un(a[2], x)); n++; }
        }
        return n;
      }
      case 'iterCme': {
        const it = t.iterator();
        if (!it.hasNext()) return 'empty';
        it.next();
        t.add(el(a[1]));
        return it.next();
      }
      case 'subListCme': {
        const sl = t.subList(ni(a[1]), ni(a[2]));
        t.add(el(a[3]));
        return sl.size();
      }
      case 'mapIterCme': {
        const it = t.keySet().iterator();
        if (!it.hasNext()) return 'empty';
        it.next();
        t.put(el(a[1]), el(a[2]));
        return it.hasNext() ? it.next() : 'end';
      }
      case 'reverse': Collections.reverse(t); return VOID;
      case 'rotate': Collections.rotate(t, ni(a[1])); return VOID;
      case 'swap': Collections.swap(t, ni(a[1]), ni(a[2])); return VOID;
      case 'shuffle': Collections.shuffle(t, new RefRandom(BigInt(a[1]))); return VOID;
      case 'sortBsearch': Collections.sort(t); return Collections.binarySearch(t, el(a[1]));
      case 'bsearchCmp': { const c = cmp(a[2]); t.sort(c); return Collections.binarySearch(t, el(a[1]), c); }
      case 'fill': Collections.fill(t, el(a[1])); return VOID;
      case 'indexOfSubList': return Collections.indexOfSubList(t, ArrayList.of(...list(a[1])));
      case 'lastIndexOfSubList': return Collections.lastIndexOfSubList(t, ArrayList.of(...list(a[1])));
      case 'nCopiesAddAll': return t.addAll(Collections.nCopies(ni(a[1]), el(a[2])));
      case 'push': if (t instanceof Stack) return t.push(el(a[1])); t.push(el(a[1])); return VOID;
      case 'pop': return t.pop();
      case 'peek': return t.peek();
      case 'empty': return t.empty();
      case 'search': return t.search(el(a[1]));
      case 'elementAt': return t.elementAt(ni(a[1]));
      case 'firstElement': return t.firstElement();
      case 'lastElement': return t.lastElement();
      case 'addElement': t.addElement(el(a[1])); return VOID;
      case 'removeElementAt': t.removeElementAt(ni(a[1])); return VOID;
      case 'insertElementAt': t.insertElementAt(el(a[1]), ni(a[2])); return VOID;
      case 'removeElement': return t.removeElement(el(a[1]));
      case 'setElementAt': t.setElementAt(el(a[1]), ni(a[2])); return VOID;
      case 'setSize': t.setSize(ni(a[1])); return VOID;
      case 'offer': return t.offer(el(a[1]));
      case 'poll': return t.poll();
      case 'element': return t.element();
      case 'removeHead': return t.remove();
      case 'pollAll': {
        const r: unknown[] = [];
        for (let x; (x = t.poll()) !== null; ) r.push(x);
        return r;
      }
      case 'offerFirst': return t.offerFirst(el(a[1]));
      case 'offerLast': return t.offerLast(el(a[1]));
      case 'pollFirst': return t.pollFirst();
      case 'pollLast': return t.pollLast();
      case 'peekFirst': return t.peekFirst();
      case 'peekLast': return t.peekLast();
      case 'removeFirstOccurrence': return t.removeFirstOccurrence(el(a[1]));
      case 'removeLastOccurrence': return t.removeLastOccurrence(el(a[1]));
      case 'descIter': {
        const r: unknown[] = [];
        for (const it = t.descendingIterator(); it.hasNext(); ) r.push(it.next());
        return r;
      }
      case 'first': return t.first();
      case 'last': return t.last();
      case 'lower': return t.lower(el(a[1]));
      case 'floor': return t.floor(el(a[1]));
      case 'ceiling': return t.ceiling(el(a[1]));
      case 'higher': return t.higher(el(a[1]));
      case 'headSet': return t.headSet(el(a[1]), bool(a[2]));
      case 'tailSet': return t.tailSet(el(a[1]), bool(a[2]));
      case 'subSet': return t.subSet(el(a[1]), bool(a[2]), el(a[3]), bool(a[4]));
      case 'headSetPlain': return t.headSet(el(a[1]));
      case 'tailSetPlain': return t.tailSet(el(a[1]));
      case 'subSetPlain': return t.subSet(el(a[1]), el(a[2]));
      case 'descendingSet': return t.descendingSet();
      case 'headSetClear': t.headSet(el(a[1]), false).clear(); return VOID;
      case 'subSetAdd': return t.subSet(el(a[1]), true, el(a[2]), false).add(el(a[3]));
      case 'descSetPollFirst': return t.descendingSet().pollFirst();
      case 'put': return t.put(el(a[1]), el(a[2]));
      case 'removeKey': return t.remove(el(a[1]));
      case 'remove2': return t.remove(el(a[1]), el(a[2]));
      case 'containsKey': return t.containsKey(el(a[1]));
      case 'containsValue': return t.containsValue(el(a[1]));
      case 'getOrDefault': return t.getOrDefault(el(a[1]), el(a[2]));
      case 'putIfAbsent': return t.putIfAbsent(el(a[1]), el(a[2]));
      case 'replace': return t.replace(el(a[1]), el(a[2]));
      case 'replace3': return t.replace(el(a[1]), el(a[2]), el(a[3]));
      case 'computeIfAbsent': return t.computeIfAbsent(el(a[1]), (k: any) => un(a[2], k));
      case 'computeIfPresent': return t.computeIfPresent(el(a[1]), (k: any, v: any) => bif(a[2], k, v));
      case 'compute': return t.compute(el(a[1]), (k: any, v: any) => bif(a[2], k, v));
      case 'merge': return t.merge(el(a[1]), el(a[2]), (x: any, y: any) => bin(a[3], x, y));
      case 'mreplaceAll': t.replaceAll((k: any, v: any) => bif(a[1], k, v)); return VOID;
      case 'keySet': return this.ord(t.keySet());
      case 'values': return this.ord(t.values());
      case 'entrySet': return this.ord(t.entrySet());
      case 'putAll': {
        const m = new LinkedHashMap();
        for (const [k, v] of pairs(a[1])) m.put(k, v);
        t.putAll(m);
        return VOID;
      }
      case 'keySetRemove': return t.keySet().remove(el(a[1]));
      case 'valuesRemove': return t.values().remove(el(a[1]));
      case 'entryRemoveIf': return t.entrySet().removeIf((e: any) => po(a[1], e.getValue()));
      case 'keySetRetainAll': return t.keySet().retainAll(ArrayList.of(...list(a[1])));
      case 'iterSetValue': {
        for (const e of t.entrySet()) e.setValue(un(a[1], e.getValue()));
        return VOID;
      }
      case 'entrySetContains': return t.entrySet().contains(new SimpleEntry(el(a[1]), el(a[2])));
      case 'firstEntry': return t.firstEntry();
      case 'lastEntry': return t.lastEntry();
      case 'pollFirstEntry': return t.pollFirstEntry();
      case 'pollLastEntry': return t.pollLastEntry();
      case 'putFirst': return t.putFirst(el(a[1]), el(a[2]));
      case 'putLast': return t.putLast(el(a[1]), el(a[2]));
      case 'firstKey': return t.firstKey();
      case 'lastKey': return t.lastKey();
      case 'lowerKey': return t.lowerKey(el(a[1]));
      case 'floorKey': return t.floorKey(el(a[1]));
      case 'ceilingKey': return t.ceilingKey(el(a[1]));
      case 'higherKey': return t.higherKey(el(a[1]));
      case 'lowerEntry': return t.lowerEntry(el(a[1]));
      case 'floorEntry': return t.floorEntry(el(a[1]));
      case 'ceilingEntry': return t.ceilingEntry(el(a[1]));
      case 'higherEntry': return t.higherEntry(el(a[1]));
      case 'headMap': return t.headMap(el(a[1]), bool(a[2]));
      case 'tailMap': return t.tailMap(el(a[1]), bool(a[2]));
      case 'subMap': return t.subMap(el(a[1]), bool(a[2]), el(a[3]), bool(a[4]));
      case 'descendingMap': return t.descendingMap();
      case 'descendingKeySet': return t.descendingKeySet();
      case 'headMapClear': t.headMap(el(a[1]), false).clear(); return VOID;
      case 'subMapPut': return t.subMap(el(a[1]), true, el(a[2]), false).put(el(a[3]), el(a[4]));
      // ---- iteration protocols
      case 'itw': return iterProg(t.iterator(), a[1], this.ordered);
      case 'ditw': return iterProg(t.descendingIterator(), a[1], this.ordered);
      case 'litw': return iterProg(t.listIterator(ni(a[1])), a[2], this.ordered);
      case 'mitw': return iterProg((a[1] === 'k' ? t.keySet() : a[1] === 'v' ? t.values() : t.entrySet()).iterator(), a[2], this.ordered);
      case 'splw': return splProg(t.spliterator(), a[1], this.ordered);
      case 'enumw': return enumProg(t instanceof Vector ? t.elements() : Collections.enumeration(t), a[1], this.ordered);
      case 'forEachLog': { const r: unknown[] = []; t.forEach((x: any) => r.push(x)); return this.ord(r); }
      case 'mforEach': { const r: string[] = []; t.forEach((k: any, v: any) => r.push(`${fmt(k)}=${fmt(v)}`)); return this.ord(r.map((x) => new Raw(x))); }
      case 'toArrayGen': return this.ord(t.toArray((n: number) => new Array(n)));
      case 'parStream': { const ps = t.parallelStream(); return [ps.isParallel(), this.ord(ps.toList())].map(fmtTop).join('/'); }
      case 'isRA': hit('isRandomAccess.()'); return isRandomAccess(t);
      case 'cloneEq': { const c = t.clone(); return `${fmt(c, this.ordered)}/${c.equals(t)}/${c !== t}`; }
      case 'ensureCapacity': t.ensureCapacity(ni(a[1])); return VOID;
      case 'trimToSize': t.trimToSize(); return VOID;
      case 'capacity': return t.capacity();
      case 'copyInto': { const arr = new Array(t.size() + 1).fill(null); t.copyInto(arr); return arr; }
      case 'removeAllElements': t.removeAllElements(); return VOID;
      case 'clist': return this.ord(Collections.list(Collections.enumeration(t)));
      case 'ccopyFrom': Collections.copy(t, ArrayList.of(...list(a[1]))); return VOID;
      case 'creplaceAll': return Collections.replaceAll(t, el(a[1]), el(a[2]));
      case 'cmpProbe': { const c = t.comparator(); return c === null ? null : Math.sign(c(el(a[1]), el(a[2]))); }
      case 'addOther': return t.add(typeof el(a[1]) === 'string' ? 99 : 'zz');
      case 'putOther': return t.put(typeof el(a[1]) === 'string' ? 99 : 'zz', 1);
      case 'sequencedKeySet': return t.sequencedKeySet();
      case 'sequencedValues': return t.sequencedValues();
      case 'sequencedEntrySet': return t.sequencedEntrySet();
      case 'navigableKeySet': return t.navigableKeySet();
      case 'headMapPlain': return t.headMap(el(a[1]));
      case 'tailMapPlain': return t.tailMap(el(a[1]));
      case 'subMapPlain': return t.subMap(el(a[1]), el(a[2]));
      case 'streamSorted': return t.stream().sorted(cmp(a[1])).toList();
    }
    throw new Error('unknown op ' + op);
  }
}

/** toString of a hash-ordered container with its items sorted (the item order is unspecified). */
function sortedItems(s: string): string {
  if (s.length < 2) return s;
  const inner = s.slice(1, -1);
  const items = inner === '' ? [] : inner.split(', ');
  items.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return s[0] + items.join(', ') + s[s.length - 1];
}

/** Printed as-is (already formatted). */
class Raw {
  constructor(readonly s: string) {}
}

/** Runs an iterator program: h hasNext, n next, r remove, f forEachRemaining, H hasPrevious, p previous, i nextIndex,
 * j previousIndex, s:<e> set, a:<e> add, v:<int> setValue on the last returned entry. Stops at the first exception. */
function iterProg(it: any, prog: string, ord = true): string {
  const el1 = (x: unknown) => (ord ? fmt(x) : '*');
  const out: string[] = [];
  let last: any = null;
  try {
    for (const tok of prog.split(',')) {
      const [c, arg] = [tok[0], tok.slice(2)];
      switch (c) {
        case 'h': out.push(fmt(it.hasNext())); break;
        case 'n': out.push(el1((last = it.next()))); break;
        case 'r': it.remove(); out.push('r'); break;
        case 'f': { const r: unknown[] = []; it.forEachRemaining((x: unknown) => r.push(x)); out.push(ord ? fmt(r) : `#${r.length}`); break; }
        case 'H': out.push(fmt(it.hasPrevious())); break;
        case 'p': out.push(el1((last = it.previous()))); break;
        case 'i': out.push(fmt(it.nextIndex())); break;
        case 'j': out.push(fmt(it.previousIndex())); break;
        case 's': it.set(el(arg)); out.push('s'); break;
        case 'a': it.add(el(arg)); out.push('a'); break;
        case 'v': out.push(fmt(nn(last).setValue(el(arg)))); break;
        default: throw new Error('iter ' + tok);
      }
    }
  } catch (e) {
    out.push(excName(e));
  }
  return `[${out.join(',')}]`;
}

const CHAR_NAMES: [string, number][] = [['ORDERED', 0x10], ['DISTINCT', 0x1], ['SORTED', 0x4], ['SIZED', 0x40], ['NONNULL', 0x100],
  ['IMMUTABLE', 0x400], ['CONCURRENT', 0x1000], ['SUBSIZED', 0x4000]];
const charNames = (c: number) => CHAR_NAMES.filter(([, v]) => (c & v) !== 0).map(([n]) => n).join('|') || 'none';
const estimate = (n: number) => (n >= BIG ? 'UNKNOWN' : num(n));

/** Spliterator program: t tryAdvance, f forEachRemaining, c characteristics, e estimateSize, x getExactSizeIfKnown,
 * k hasCharacteristics(ORDERED), g getComparator (null / cmp), s trySplit (prints the prefix's elements). */
function splProg(sp: any, prog: string, ord = true): string {
  const out: string[] = [];
  let touched = false; // estimates are only specified before traversal or splitting
  try {
    for (const c of prog.split(',')) {
      if ((c === 'e' || c === 'x') && touched) { out.push('~'); continue; }
      if (c === 't' || c === 'f' || c === 's') touched = true;
      switch (c) {
        case 't': { let got: unknown = NONE_SEEN; const ok = sp.tryAdvance((x: unknown) => (got = x)); out.push(ok ? (ord ? fmt(got) : '*') : 'false'); break; }
        case 'f': { const r: unknown[] = []; sp.forEachRemaining((x: unknown) => r.push(x)); out.push(ord ? fmt(r) : `#${r.length}`); break; }
        case 'c': out.push(charNames(sp.characteristics())); break;
        case 'e': out.push(estimate(sp.estimateSize())); break;
        case 'x': out.push(num(sp.getExactSizeIfKnown())); break;
        case 'k': out.push(fmt(sp.hasCharacteristics(0x10))); break;
        case 'g': out.push(sp.getComparator() === null ? 'null' : 'cmp'); break;
        case 's': {
          // where (and whether) to split is unspecified: print prefix ++ rest, which is the encounter order for ORDERED
          const pre = sp.trySplit();
          const r: unknown[] = [];
          if (pre !== null) pre.forEachRemaining((x: unknown) => r.push(x));
          sp.forEachRemaining((x: unknown) => r.push(x));
          out.push('S' + (ord ? fmt(r) : `#${r.length}`));
          return `[${out.join(',')}]`; // the split spliterator's later characteristics are unspecified
        }
        default: throw new Error('spl ' + c);
      }
    }
  } catch (e) {
    out.push(excName(e));
  }
  return `[${out.join(',')}]`;
}
const NONE_SEEN = Symbol('none');

/** Enumeration program: h hasMoreElements, n nextElement, a asIterator().forEachRemaining. */
function enumProg(en: any, prog: string, ord = true): string {
  const out: string[] = [];
  try {
    for (const c of prog.split(',')) {
      if (c === 'h') out.push(fmt(en.hasMoreElements()));
      else if (c === 'n') out.push(ord ? fmt(en.nextElement()) : (en.nextElement(), '*'));
      else if (c === 'a') { const r: unknown[] = []; en.asIterator().forEachRemaining((x: unknown) => r.push(x)); out.push(ord ? fmt(r) : `#${r.length}`); }
      else throw new Error('enum ' + c);
    }
  } catch (e) {
    out.push(excName(e));
  }
  return `[${out.join(',')}]`;
}

/** The reference's 48-bit LCG (seed scrambling, next(bits), nextInt(bound)), so shuffle is comparable. */
export class RefRandom {
  private seed: bigint;
  private static readonly MULT = BigInt('0x5DEECE66D');
  private static readonly MASK = (BigInt(1) << BigInt(48)) - BigInt(1);
  constructor(seed: bigint) {
    this.seed = (seed ^ RefRandom.MULT) & RefRandom.MASK;
  }
  private next(bits: number): number {
    this.seed = (this.seed * RefRandom.MULT + BigInt(0xb)) & RefRandom.MASK;
    return Number(BigInt.asIntN(32, this.seed >> BigInt(48 - bits)));
  }
  nextInt(bound: number): number {
    let r = this.next(31);
    const m = bound - 1;
    if ((bound & m) === 0) return Number((BigInt(bound) * BigInt(r)) >> BigInt(31));
    for (let u = r; u - (r = u % bound) + m > 2147483647 || u - r + m < 0; u = this.next(31));
    return r;
  }
}

// ---------------------------------------------------------------- streams

type Kind = 'O' | 'I' | 'L' | 'D';

function runPipe(line: string): string {
  const log: string[] = [];
  let res: string;
  try {
    res = fmt(execPipe(line.split(' | '), log));
  } catch (e) {
    res = excName(e);
  }
  return log.length === 0 ? res : `${res} LOG[${log.join(',')}]`;
}

function newColl(kind: string): any {
  switch (kind) {
    case 'ArrayList': return new ArrayList();
    case 'LinkedList': return new LinkedList();
    case 'ArrayDeque': return new ArrayDeque();
    case 'TreeSet': return new TreeSet();
    case 'LinkedHashSet': return new LinkedHashSet();
    case 'Vector': return new Vector();
  }
  throw new Error('coll ' + kind);
}

function execPipe(stages: string[], log: string[]): unknown {
  let [cur, kind] = source(stages[0].split(' '));
  for (let i = 1; i < stages.length - 1; i++) [cur, kind] = stage(cur, kind, stages[i].split(' '), log);
  return terminal(cur, kind, stages[stages.length - 1].split(' '), log);
}

function source(a: string[]): [any, Kind] {
  switch (a[0]) {
    case 'of': return [Stream.of(...list(a[1])), 'O'];
    case 'ofNullable': return [Stream.ofNullable(el(a[1])), 'O'];
    case 'empty': return [Stream.empty(), 'O'];
    case 'iterate2': return [Stream.iterate(el(a[1]), (x: any) => un(a[2], x)), 'O'];
    case 'iterate3': return [Stream.iterate(el(a[1]), (x: any) => po(a[2], x), (x: any) => un(a[3], x)), 'O'];
    case 'generate': { const v = el(a[1]); return [Stream.generate(() => v), 'O']; }
    case 'concat': return [Stream.concat(Stream.of(...list(a[1])), Stream.of(...list(a[2]))), 'O'];
    case 'builder': { const b = Stream.builder<any>(); for (const x of list(a[1])) b.add(x); return [b.build(), 'O']; }
    case 'coll': { const c = newColl(a[1]); for (const x of list(a[2])) c.add(x); return [c.stream(), 'O']; }
    case 'listOf': return [List.of(...list(a[1])).stream(), 'O'];
    case 'iof': return [IntStream.of(...list(a[1])), 'I'];
    case 'irange': return [IntStream.range(ni(a[1]), ni(a[2])), 'I'];
    case 'irangeClosed': return [IntStream.rangeClosed(ni(a[1]), ni(a[2])), 'I'];
    case 'iiterate2': return [IntStream.iterate(ni(a[1]), (x) => fl(a[2], x)), 'I'];
    case 'iiterate3': return [IntStream.iterate(ni(a[1]), (x) => pl(a[2], x), (x) => fl(a[3], x)), 'I'];
    case 'iconcat': return [IntStream.concat(IntStream.of(...list(a[1])), IntStream.of(...list(a[2]))), 'I'];
    case 'lof': return [LongStream.of(...list(a[1])), 'L'];
    case 'lrange': return [LongStream.range(ni(a[1]), ni(a[2])), 'L'];
    case 'lrangeClosed': return [LongStream.rangeClosed(ni(a[1]), ni(a[2])), 'L'];
    case 'dof': return [DoubleStream.of(...list(a[1])), 'D'];
    case 'sbuilderAcc': { const b = Stream.builder<any>(); for (const x of list(a[1])) b.accept(x); return [b.build(), 'O']; }
    case 'ibuilder': { const b = IntStream.builder(); for (const x of list(a[1])) b.add(x); return [b.build(), 'I']; }
    case 'lbuilder': { const b = LongStream.builder(); for (const x of list(a[1])) b.accept(x); return [b.build(), 'L']; }
    case 'dbuilder': { const b = DoubleStream.builder(); for (const x of list(a[1])) b.add(x); return [b.build(), 'D']; }
    case 'igenerate': { const v = ni(a[1]); return [IntStream.generate(() => v), 'I']; }
    case 'lgenerate': { const v = ni(a[1]); return [LongStream.generate(() => v), 'L']; }
    case 'dgenerate': { const v = Number(a[1]); return [DoubleStream.generate(() => v), 'D']; }
    case 'literate2': return [LongStream.iterate(ni(a[1]), (x) => fl(a[2], x)), 'L'];
    case 'literate3': return [LongStream.iterate(ni(a[1]), (x) => pl(a[2], x), (x) => fl(a[3], x)), 'L'];
    case 'diterate2': return [DoubleStream.iterate(Number(a[1]), (x) => fd(a[2], x)), 'D'];
    case 'diterate3': return [DoubleStream.iterate(Number(a[1]), (x) => pl(a[2], x), (x) => fd(a[3], x)), 'D'];
    case 'lconcat': return [LongStream.concat(LongStream.of(...list(a[1])), LongStream.of(...list(a[2]))), 'L'];
    case 'dconcat': return [DoubleStream.concat(DoubleStream.of(...list(a[1])), DoubleStream.of(...list(a[2]))), 'D'];
    case 'iempty': return [IntStream.empty(), 'I'];
    case 'lempty': return [LongStream.empty(), 'L'];
    case 'dempty': return [DoubleStream.empty(), 'D'];
    case 'sstream': { const c = newColl(a[1]); for (const x of list(a[2])) c.add(x); return [StreamSupport.stream(c.spliterator(), false), 'O']; }
    case 'sstreamSup': {
      const c = newColl(a[1]);
      for (const x of list(a[2])) c.add(x);
      return [StreamSupport.stream(() => c.spliterator(), 0x10 | 0x40, false), 'O'];
    }
    case 'sint': return [StreamSupport.intStream(IntStream.of(...list(a[1])).spliterator(), false), 'I'];
    case 'slong': return [StreamSupport.longStream(LongStream.of(...list(a[1])).spliterator(), false), 'L'];
    case 'sdouble': return [StreamSupport.doubleStream(DoubleStream.of(...list(a[1])).spliterator(), false), 'D'];
  }
  throw new Error('source ' + a[0]);
}

function stage(s: any, kind: Kind, a: string[], log: string[]): [any, Kind] {
  const op = a[0];
  if (kind !== 'O') {
    const p = (x: number) => pl(a[1], x);
    const f = (x: number) => (kind === 'D' ? fd(a[1], x) : fl(a[1], x));
    switch (op) {
      case 'filter': return [s.filter(p), kind];
      case 'map': return [s.map(f), kind];
      case 'mapToObj': return [s.mapToObj((x: number) => un(a[1], x)), 'O'];
      case 'boxed': return [s.boxed(), 'O'];
      case 'asLongStream': return [s.asLongStream(), 'L'];
      case 'asDoubleStream': return [s.asDoubleStream(), 'D'];
      case 'mapToInt': return [s.mapToInt(f), 'I'];
      case 'mapToLong': return [s.mapToLong(f), 'L'];
      case 'mapToDouble': return [s.mapToDouble((x: number) => un(a[1], x)), 'D'];
      case 'flatMap': {
        const S = kind === 'I' ? IntStream : kind === 'L' ? LongStream : DoubleStream;
        return [s.flatMap((x: number) => {
          switch (a[1]) {
            case 'dup': return S.of(x, x);
            case 'upto': return (S as typeof IntStream).range(0, Math.abs(x) % 4);
            case 'nullS': return null;
          }
          throw new Error('flat');
        }), kind];
      }
      case 'mapMulti': return [s.mapMulti((x: number, c: (n: number) => void) => {
        if (a[1] === 'dup' || pl('even', x)) { c(x); c(x); }
      }), kind];
      case 'distinct': return [s.distinct(), kind];
      case 'sorted': return [s.sorted(), kind];
      case 'peek': return [s.peek((x: number) => log.push(numD(x))), kind];
      case 'limit': return [s.limit(ni(a[1])), kind];
      case 'skip': return [s.skip(ni(a[1])), kind];
      case 'takeWhile': return [s.takeWhile(p), kind];
      case 'dropWhile': return [s.dropWhile(p), kind];
      case 'sequential': return [s.sequential(), kind];
      case 'parallel': return [s.parallel(), kind];
      case 'unordered': return [s.unordered(), kind];
      case 'onClose': return [s.onClose(() => log.push(a[1])), kind];
    }
    throw new Error('stage ' + op);
  }
  switch (op) {
    case 'filter': return [s.filter((x: any) => po(a[1], x)), 'O'];
    case 'map': return [s.map((x: any) => un(a[1], x)), 'O'];
    case 'mapToInt': return [s.mapToInt((x: any) => unboxed(a[1], x)), 'I'];
    case 'mapToLong': return [s.mapToLong((x: any) => unboxed(a[1], x)), 'L'];
    case 'mapToDouble': return [s.mapToDouble((x: any) => unboxed(a[1], x)), 'D'];
    case 'flatMap': return [s.flatMap((x: any) => flatO(a[1], x)), 'O'];
    case 'mapMulti': return [s.mapMulti((x: any, c: (r: any) => void) => {
      if (a[1] === 'dup' || po('even', x)) { c(x); c(x); }
    }), 'O'];
    case 'distinct': return [s.distinct(), 'O'];
    case 'sorted': return [s.sorted(), 'O'];
    case 'sortedC': return [s.sorted(cmp(a[1])), 'O'];
    case 'peek': return [s.peek((x: any) => log.push(fmt(x))), 'O'];
    case 'limit': return [s.limit(ni(a[1])), 'O'];
    case 'skip': return [s.skip(ni(a[1])), 'O'];
    case 'takeWhile': return [s.takeWhile((x: any) => po(a[1], x)), 'O'];
    case 'dropWhile': return [s.dropWhile((x: any) => po(a[1], x)), 'O'];
    case 'gather': return [s.gather(gatherer(a)), 'O'];
    case 'flatMapToInt': return [s.flatMapToInt((x: any) => (a[1] === 'nullS' ? null : IntStream.of(numv(x), numv(x)))), 'I'];
    case 'flatMapToLong': return [s.flatMapToLong((x: any) => (a[1] === 'nullS' ? null : LongStream.of(numv(x), numv(x)))), 'L'];
    case 'flatMapToDouble': return [s.flatMapToDouble((x: any) => (a[1] === 'nullS' ? null : DoubleStream.of(numv(x), numv(x)))), 'D'];
    case 'mapMultiToInt': return [s.mapMultiToInt((x: any, c: (n: number) => void) => { c(numv(x)); c(numv(x)); }), 'I'];
    case 'mapMultiToLong': return [s.mapMultiToLong((x: any, c: (n: number) => void) => { c(numv(x)); c(numv(x)); }), 'L'];
    case 'mapMultiToDouble': return [s.mapMultiToDouble((x: any, c: (n: number) => void) => { c(numv(x)); c(numv(x)); }), 'D'];
    case 'sequential': return [s.sequential(), 'O'];
    case 'parallel': return [s.parallel(), 'O'];
    case 'unordered': return [s.unordered(), 'O'];
    case 'onClose': return [s.onClose(() => log.push(a[1])), 'O'];
  }
  throw new Error('stage ' + op);
}

function gatherer(a: string[]): any {
  switch (a[1]) {
    case 'fold': { const id = el(a[2]); return Gatherers.fold(() => id, (x: any, y: any) => bin(a[3], x, y)); }
    case 'scan': { const id = el(a[2]); return Gatherers.scan(() => id, (x: any, y: any) => bin(a[3], x, y)); }
    case 'windowFixed': return Gatherers.windowFixed(ni(a[2]));
    case 'windowSliding': return Gatherers.windowSliding(ni(a[2]));
    case 'custom': return customGatherer(a[2]);
  }
  throw new Error('gatherer ' + a[1]);
}

const NONE_STATE = Symbol('none');

/** User-defined gatherers built with Gatherer.of / ofSequential / Integrator.of / ofGreedy / andThen (same in RefRunner). */
function customGatherer(name: string): any {
  const G = Gatherer as any;
  const I = Integrator as any;
  switch (name) {
    case 'dedupe':
      return G.ofSequential(() => [NONE_STATE], I.ofGreedy(top((st: any[], e: any, d: any) => {
        if (st[0] !== NONE_STATE && Objects.equals(st[0], e)) return true;
        st[0] = e;
        return d.push(e);
      })));
    case 'takeN2':
      return G.ofSequential(() => [0], I.of(top((st: number[], e: any, d: any) => {
        if (st[0] >= 2) return false;
        st[0]++;
        return d.push(e) && st[0] < 2;
      })));
    case 'sumAll':
      return G.of(() => [0], I.ofGreedy(top((st: number[], e: any) => {
        st[0] += nn(e);
        return true;
      })), (x: number[], y: number[]) => {
        x[0] += y[0];
        return x;
      }, top((st: number[], d: any) => {
        d.push(st[0]);
      }));
    case 'pairs':
      return G.ofSequential(() => [] as any[], I.ofGreedy(top((st: any[], e: any, d: any) => {
        st.push(e);
        if (st.length === 2) {
          const p = ArrayList.of(...st);
          st.length = 0;
          return d.push(p);
        }
        return true;
      })), top((st: any[], d: any) => {
        if (st.length > 0) d.push(ArrayList.of(...st));
      }));
    case 'rejecting':
      return G.ofSequential(I.of(top((_st: unknown, e: any, d: any) => {
        d.push(e);
        return !d.isRejecting();
      })));
    case 'doubler': return G.of(I.ofGreedy(top((_st: unknown, e: any, d: any) => d.push(un('times2', e)))));
    case 'defaults':
      return G.of(G.defaultInitializer(), I.ofGreedy(top((_st: unknown, e: any, d: any) => d.push(e))), G.defaultCombiner(), G.defaultFinisher());
    case 'indexed': return G.ofSequential(() => [0], I.ofGreedy(top((st: number[], _e: any, d: any) => d.push(st[0]++))));
    case 'andThen': return Gatherers.scan(() => 0, (x: any, y: any) => bin('add', x, y)).andThen(Gatherers.windowFixed(2));
    case 'mapConc': return Gatherers.mapConcurrent(2, (x: any) => un('plus1', x));
  }
  throw new Error('custom gatherer ' + name);
}

function terminal(s: any, kind: Kind, a: string[], log: string[]): unknown {
  const op = a[0];
  if (kind !== 'O') {
    const p = (x: number) => pl(a[1], x);
    const b = (i: number) => (x: number, y: number) => bin(a[i], x, y);
    const fmtN = (x: number) => (kind === 'D' ? numD(x) : num(x));
    switch (op) {
      case 'toArray': return s.toArray();
      case 'count': return s.count();
      case 'sum': return s.sum();
      case 'average': return s.average();
      case 'min': return s.min();
      case 'max': return s.max();
      case 'summaryStatistics': return s.summaryStatistics();
      case 'reduce1': return s.reduce(b(1));
      case 'reduce2': return s.reduce(Number(a[1]), b(2));
      case 'findFirst': return s.findFirst();
      case 'findAny': return s.findAny();
      case 'anyMatch': return s.anyMatch(p);
      case 'allMatch': return s.allMatch(p);
      case 'noneMatch': return s.noneMatch(p);
      case 'forEach': s.forEach((x: number) => log.push(fmtN(x))); return VOID;
      case 'boxedList': return s.boxed().toList();
      case 'collect3': return s.collect(() => new ArrayList(), (l: any, x: number) => l.add(x), (l: any, r: any) => l.addAll(r));
      case 'forEachOrdered': s.forEachOrdered((x: number) => log.push(fmtN(x))); return VOID;
      case 'isParallelT': return s.isParallel();
      case 'closeNow': s.close(); return VOID;
      case 'splwT': return new Raw(splProg(s.spliterator(), a[1]));
      case 'primIter': {
        const it = s.iterator();
        const nx = kind === 'I' ? () => it.nextInt() : kind === 'L' ? () => it.nextLong() : () => it.nextDouble();
        const out: string[] = [];
        try {
          for (const c of a[1].split(',')) {
            if (c === 'h') out.push(fmt(it.hasNext()));
            else if (c === 'n') out.push(fmtN(nx()));
            else if (c === 'N') out.push(fmtN(it.next()));
            else if (c === 'r') { it.remove(); out.push('r'); }
            else { const r: string[] = []; it.forEachRemaining((x: number) => r.push(fmtN(x))); out.push(`[${r.join(',')}]`); }
          }
        } catch (e) {
          out.push(excName(e));
        }
        return new Raw(`[${out.join(',')}]`);
      }
      case 'statsStr': return s.summaryStatistics().toString().replace(/9007199254740991/g, 'BIG'); // empty LongSummaryStatistics limits
      case 'findFirstStr': return s.findFirst().toString();
      case 'averageStr': return s.average().toString();
    }
    throw new Error('terminal ' + op);
  }
  switch (op) {
    case 'toList': return s.toList();
    case 'toListStr': return s.toList().toString();
    case 'findFirstStr': return s.findFirst().toString();
    case 'toArray': return s.toArray();
    case 'count': return s.count();
    case 'findFirst': return s.findFirst();
    case 'findAny': return s.findAny();
    case 'anyMatch': return s.anyMatch((x: any) => po(a[1], x));
    case 'allMatch': return s.allMatch((x: any) => po(a[1], x));
    case 'noneMatch': return s.noneMatch((x: any) => po(a[1], x));
    case 'min': return s.min(cmp(a[1]));
    case 'max': return s.max(cmp(a[1]));
    case 'reduce1': return s.reduce((x: any, y: any) => bin(a[1], x, y));
    case 'reduce2': return s.reduce(el(a[1]), (x: any, y: any) => bin(a[2], x, y));
    case 'reduce3': return s.reduce(el(a[1]), (x: any, y: any) => bin(a[2], x, y), (x: any, y: any) => bin(a[2], x, y));
    case 'collect': return s.collect(new Coll(a, 1).parse());
    case 'forEach': s.forEach((x: any) => log.push(fmt(x))); return VOID;
    case 'forEachOrdered': s.forEachOrdered((x: any) => log.push(fmt(x))); return VOID;
    case 'toArrayGen': return s.toArray((n: number) => new Array(n));
    case 'collect3': return s.collect(() => new ArrayList(), (l: any, x: any) => l.add(x), (l: any, r: any) => l.addAll(r));
    case 'isParallelT': return s.isParallel();
    case 'closeNow': s.close(); return VOID;
    case 'splwT': return new Raw(splProg(s.spliterator(), a[1]));
    case 'iterT': return new Raw(iterProg(s.iterator(), a[1]));
    case 'iterator': {
      const r: unknown[] = [];
      for (const it = s.iterator(); it.hasNext(); ) r.push(it.next());
      return r;
    }
  }
  throw new Error('terminal ' + op);
}

/** Prefix-notation collector parser. */
class Coll {
  constructor(readonly a: string[], private i: number) {}
  next(): string {
    return this.a[this.i++];
  }
  parse(): any {
    const C = Collectors as any;
    const n = this.next();
    switch (n) {
      case 'toList': return C.toList();
      case 'toSet': return C.toSet();
      case 'toUnmodifiableList': return C.toUnmodifiableList();
      case 'toUnmodifiableSet': return C.toUnmodifiableSet();
      case 'toTreeSet': return C.toCollection(() => new TreeSet());
      case 'counting': return C.counting();
      case 'joining': return C.joining();
      case 'joining3': { const d = el(this.next()), p = el(this.next()), s = el(this.next()); return C.joining(d, p, s); }
      case 'summingInt': { const f = this.next(); return C.summingInt((x: any) => unboxed(f, x)); }
      case 'summingLong': { const f = this.next(); return C.summingLong((x: any) => unboxed(f, x)); }
      case 'summingDouble': { const f = this.next(); return C.summingDouble((x: any) => unboxed(f, x)); }
      case 'averagingInt': { const f = this.next(); return C.averagingInt((x: any) => unboxed(f, x)); }
      case 'averagingDouble': { const f = this.next(); return C.averagingDouble((x: any) => unboxed(f, x)); }
      case 'summarizingInt': { const f = this.next(); return C.summarizingInt((x: any) => unboxed(f, x)); }
      case 'summarizingDouble': { const f = this.next(); return C.summarizingDouble((x: any) => unboxed(f, x)); }
      case 'minBy': return C.minBy(cmp(this.next()));
      case 'maxBy': return C.maxBy(cmp(this.next()));
      case 'reducing1': { const op = this.next(); return C.reducing((x: any, y: any) => bin(op, x, y)); }
      case 'reducing2': { const id = el(this.next()); const op = this.next(); return C.reducing(id, (x: any, y: any) => bin(op, x, y)); }
      case 'reducing3': {
        const id = el(this.next()); const f = this.next(); const op = this.next();
        return C.reducing(id, (x: any) => un(f, x), (x: any, y: any) => bin(op, x, y));
      }
      case 'mapping': { const f = this.next(); return C.mapping((x: any) => un(f, x), this.parse()); }
      case 'filtering': { const p = this.next(); return C.filtering((x: any) => po(p, x), this.parse()); }
      case 'flatMapping': { const f = this.next(); return C.flatMapping((x: any) => flatO(f, x), this.parse()); }
      case 'andThenSize': return C.collectingAndThen(this.parse(), (r: any) => r.size());
      case 'groupingBy1': { const f = this.next(); return C.groupingBy((x: any) => un(f, x)); }
      case 'groupingBy2': { const f = this.next(); return C.groupingBy((x: any) => un(f, x), this.parse()); }
      case 'groupingByTree': { const f = this.next(); return C.groupingBy((x: any) => un(f, x), () => new TreeMap(), this.parse()); }
      case 'partitioningBy1': { const p = this.next(); return C.partitioningBy((x: any) => po(p, x)); }
      case 'partitioningBy2': { const p = this.next(); return C.partitioningBy((x: any) => po(p, x), this.parse()); }
      case 'toMap2': { const k = this.next(), v = this.next(); return C.toMap((x: any) => un(k, x), (x: any) => un(v, x)); }
      case 'toMap3': {
        const k = this.next(), v = this.next(), op = this.next();
        return C.toMap((x: any) => un(k, x), (x: any) => un(v, x), (x: any, y: any) => bin(op, x, y));
      }
      case 'toMapTree': {
        const k = this.next(), v = this.next(), op = this.next();
        return C.toMap((x: any) => un(k, x), (x: any) => un(v, x), (x: any, y: any) => bin(op, x, y), () => new TreeMap());
      }
      case 'toUnmodifiableMap2': { const k = this.next(), v = this.next(); return C.toUnmodifiableMap((x: any) => un(k, x), (x: any) => un(v, x)); }
      case 'teeing': { const c1 = this.parse(), c2 = this.parse(); return C.teeing(c1, c2, (x: any, y: any) => [x, y]); }
      case 'joining1': return C.joining(el(this.next()));
      case 'toDeque': return C.toCollection(() => new ArrayDeque());
      case 'averagingLong': { const f = this.next(); return C.averagingLong((x: any) => unboxed(f, x)); }
      case 'summarizingLong': { const f = this.next(); return C.summarizingLong((x: any) => unboxed(f, x)); }
      case 'groupingByConc1': { const f = this.next(); return C.groupingByConcurrent((x: any) => un(f, x)); }
      case 'groupingByConc2': { const f = this.next(); return C.groupingByConcurrent((x: any) => un(f, x), this.parse()); }
      case 'groupingByConcTree': { const f = this.next(); return C.groupingByConcurrent((x: any) => un(f, x), () => new TreeMap(), this.parse()); }
      case 'toConcMap2': { const k = this.next(), v = this.next(); return C.toConcurrentMap((x: any) => un(k, x), (x: any) => un(v, x)); }
      case 'toConcMap3': {
        const k = this.next(), v = this.next(), op = this.next();
        return C.toConcurrentMap((x: any) => un(k, x), (x: any) => un(v, x), (x: any, y: any) => bin(op, x, y));
      }
      case 'toConcMapTree': {
        const k = this.next(), v = this.next(), op = this.next();
        return C.toConcurrentMap((x: any) => un(k, x), (x: any) => un(v, x), (x: any, y: any) => bin(op, x, y), () => new TreeMap());
      }
      case 'toUnmodifiableMap3': {
        const k = this.next(), v = this.next(), op = this.next();
        return C.toUnmodifiableMap((x: any) => un(k, x), (x: any) => un(v, x), (x: any, y: any) => bin(op, x, y));
      }
      case 'collectorOf':
        return (Collector as any).of(() => new ArrayList(), (l: any, x: any) => l.add(x), (l: any, r: any) => {
          l.addAll(r);
          return l;
        });
      case 'collectorOfF':
        return (Collector as any).of(() => new ArrayList(), (l: any, x: any) => l.add(x), (l: any, r: any) => {
          l.addAll(r);
          return l;
        }, (l: any) => l.size(), Collector.Characteristics.UNORDERED);
    }
    throw new Error('collector ' + n);
  }
}

// ---------------------------------------------------------------- misc (statics, Optional, comparators, entries, ...)

/** Comparator expression (prefix): see README. */
class CmpExpr {
  constructor(readonly a: string[], private i: number) {}
  next(): string {
    return this.a[this.i++];
  }
  key(f: string): (x: any) => any {
    return (x: any) => un(f, x);
  }
  parse(): any {
    const n = this.next();
    const C = Comparator as any;
    switch (n) {
      case 'nat': return Comparator.naturalOrder();
      case 'rev': return Comparator.reverseOrder();
      case 'natCmp': hit('naturalCompare.()'); return naturalCompare;
      case 'named': return cmp(this.next());
      case 'revOf': return C.reversed(this.parse());
      case 'crev0': return Collections.reverseOrder();
      case 'crev': return Collections.reverseOrder(this.parse());
      case 'comparing': return C.comparing(this.key(this.next()));
      case 'comparingC': { const k = this.key(this.next()); return C.comparing(k, this.parse()); }
      case 'comparingInt': { const f = this.next(); return C.comparingInt((x: any) => unboxed(f, x)); }
      case 'comparingLong': { const f = this.next(); return C.comparingLong((x: any) => unboxed(f, x)); }
      case 'comparingDouble': { const f = this.next(); return C.comparingDouble((x: any) => unboxed(f, x)); }
      case 'then': { const x = this.parse(); return C.thenComparing(x, this.parse()); }
      case 'thenBy': { const x = this.parse(); return C.thenComparingBy(x, this.key(this.next())); }
      case 'thenByC': { const x = this.parse(); const k = this.key(this.next()); return C.thenComparingBy(x, k, this.parse()); }
      case 'thenInt': { const x = this.parse(); const f = this.next(); return C.thenComparingInt(x, (y: any) => unboxed(f, y)); }
      case 'thenLong': { const x = this.parse(); const f = this.next(); return C.thenComparingLong(x, (y: any) => unboxed(f, y)); }
      case 'thenDouble': { const x = this.parse(); const f = this.next(); return C.thenComparingDouble(x, (y: any) => unboxed(f, y)); }
      case 'nullsFirst': return C.nullsFirst(this.parse());
      case 'nullsLast': return C.nullsLast(this.parse());
    }
    throw new Error('cmpexpr ' + n);
  }
}

const CH = (t: string): number => (t === '0' ? 0 : t.split('+').reduce((a, n) => a | (Spliterator as any)[n], 0));

/** Spliterator over a list via AbstractSpliterator (tryAdvance only). */
class ListSpliterator extends (Spliterators.AbstractSpliterator as any) {
  static readonly [HARNESS] = true;
  private i = 0;
  constructor(private readonly l: any[]) {
    super(l.length, 0x10);
  }
  tryAdvance(action: (x: any) => void): boolean {
    nn(action);
    if (this.i >= this.l.length) return false;
    action(this.l[this.i++]);
    return true;
  }
}
class IntListSpliterator extends (Spliterators.AbstractIntSpliterator as any) {
  static readonly [HARNESS] = true;
  private i = 0;
  constructor(private readonly l: any[]) {
    super(l.length, 0x10 | 0x100);
  }
  tryAdvance(action: (x: any) => void): boolean {
    nn(action);
    if (this.i >= this.l.length) return false;
    action(this.l[this.i++]);
    return true;
  }
}

class LongListSpliterator extends (Spliterators.AbstractLongSpliterator as any) {
  static readonly [HARNESS] = true;
  private i = 0;
  constructor(private readonly l: any[]) {
    super(l.length, 0x10 | 0x100);
  }
  tryAdvance(action: (x: any) => void): boolean {
    nn(action);
    if (this.i >= this.l.length) return false;
    action(this.l[this.i++]);
    return true;
  }
}
class DoubleListSpliterator extends (Spliterators.AbstractDoubleSpliterator as any) {
  static readonly [HARNESS] = true;
  private i = 0;
  constructor(private readonly l: any[]) {
    super(Infinity, 0x10);
  }
  tryAdvance(action: (x: any) => void): boolean {
    nn(action);
    if (this.i >= this.l.length) return false;
    action(this.l[this.i++]);
    return true;
  }
}

function splSource(a: string[]): any {
  const S = Spliterators as any;
  switch (a[0]) {
    case 'array': return S.spliterator(list(a[1]), CH(a[2]));
    case 'arrayRange': return S.spliterator(list(a[1]), ni(a[2]), ni(a[3]), CH(a[4]));
    case 'coll': return S.spliterator(ArrayList.of(...list(a[1])), CH(a[2]));
    case 'iterSized': return S.spliterator(ArrayList.of(...list(a[1])).iterator(), ni(a[2]), CH(a[3]));
    case 'unknown': return S.spliteratorUnknownSize(ArrayList.of(...list(a[1])).iterator(), CH(a[2]));
    case 'empty': return S.emptySpliterator();
    case 'emptyInt': return S.emptyIntSpliterator();
    case 'emptyLong': return S.emptyLongSpliterator();
    case 'emptyDouble': return S.emptyDoubleSpliterator();
    case 'abs': hit('Spliterators.AbstractSpliterator'); return new ListSpliterator(list(a[1]));
    case 'absInt': hit('Spliterators.AbstractIntSpliterator'); return new IntListSpliterator(list(a[1]));
    case 'absLong': hit('Spliterators.AbstractLongSpliterator'); return new LongListSpliterator(list(a[1]));
    case 'absDouble': hit('Spliterators.AbstractDoubleSpliterator'); return new DoubleListSpliterator(list(a[1]));
  }
  throw new Error('spl source ' + a[0]);
}

/** A collecting Downstream for driving a gatherer by hand. */
class ListDownstream {
  static readonly [HARNESS] = true;
  readonly out: unknown[] = [];
  push(x: unknown): boolean {
    this.out.push(x);
    return true;
  }
  isRejecting(): boolean {
    return false;
  }
}

const OPT_KINDS: Record<string, any> = { O: Optional, I: OptionalInt, L: OptionalLong, D: OptionalDouble };
const STATS: Record<string, any> = { I: IntSummaryStatistics, L: LongSummaryStatistics, D: DoubleSummaryStatistics };

/** Collector driven by hand: supplier, accumulator over each half, combiner, finisher; plus its characteristics. */
function driveCollector(c: any, l: any[]): string {
  const sup = c.supplier(), acc = c.accumulator(), comb = c.combiner(), fin = c.finisher();
  const h = l.length >> 1;
  const a1 = sup(), a2 = sup();
  for (const x of l.slice(0, h)) acc(a1, x);
  for (const x of l.slice(h)) acc(a2, x);
  const r = fin(comb(a1, a2));
  const chars = [...c.characteristics()].map(String).sort().join('|');
  return `${fmt(r)} ${chars}`;
}

function misc(a: string[], log: string[]): unknown {
  const O = Objects as any;
  switch (a[0]) {
    case 'oeq': return O.equals(el(a[1]), el(a[2]));
    case 'ohash': return O.hashCode(el(a[1]));
    case 'ohashv': return O.hash(...list(a[1]));
    case 'oreq': return O.requireNonNull(el(a[1]));
    case 'oreqm': return O.requireNonNull(el(a[1]), 'm');
    case 'oreqs': return O.requireNonNull(el(a[1]), () => 'm');
    case 'oisnull': return O.isNull(el(a[1]));
    case 'ononnull': return O.nonNull(el(a[1]));
    case 'ostr': return O.toString(el(a[1]));
    case 'ostr2': return O.toString(el(a[1]), el(a[2]));
    case 'ochk': return O.checkIndex(ni(a[1]), ni(a[2]));
    case 'ochkft': return O.checkFromToIndex(ni(a[1]), ni(a[2]), ni(a[3]));
    case 'ochkfs': return O.checkFromIndexSize(ni(a[1]), ni(a[2]), ni(a[3]));
    case 'oelse': return O.requireNonNullElse(el(a[1]), el(a[2]));
    case 'oelseget': { const d = el(a[2]); return O.requireNonNullElseGet(el(a[1]), () => d); }
    case 'ocmp': return Math.sign(O.compare(el(a[1]), el(a[2]), new CmpExpr(a, 3).parse()));
    case 'odeq': return O.deepEquals(list(a[1]), list(a[2]));
    case 'csort': { const l = ArrayList.of(...list(a[1])); l.sort(new CmpExpr(a, 2).parse()); return l; }
    case 'capply': return Math.sign(new CmpExpr(a, 3).parse()(el(a[1]), el(a[2])));
    case 'splconst':
      for (const n of ['DISTINCT', 'SORTED', 'ORDERED', 'SIZED', 'NONNULL', 'IMMUTABLE', 'CONCURRENT', 'SUBSIZED']) hit(`Spliterator.${n}`);
      return ['DISTINCT', 'SORTED', 'ORDERED', 'SIZED', 'NONNULL', 'IMMUTABLE', 'CONCURRENT', 'SUBSIZED'].map((n) => (Spliterator as any)[n]);
    case 'collchars': hit('Collector.Characteristics'); return Object.values(Collector.Characteristics).map(String).sort();
    case 'cemptyIter': return iterProg(Collections.emptyIterator(), a[1]);
    case 'cemptyListIter': return iterProg(Collections.emptyListIterator(), a[1]);
    case 'cemptyEnum': return enumProg(Collections.emptyEnumeration(), a[1]);
    case 'cenum': return enumProg(Collections.enumeration(ArrayList.of(...list(a[1]))), a[2]);
    case 'cconst': hit('Collections.EMPTY_LIST'); hit('Collections.EMPTY_SET'); hit('Collections.EMPTY_MAP'); return `${fmt(Collections.EMPTY_LIST)}/${fmt(Collections.EMPTY_SET)}/${fmt(Collections.EMPTY_MAP)}/${Collections.EMPTY_LIST.equals(Collections.emptyList())}`;
    case 'newHash': {
      const n = ni(a[2]);
      const m: any = a[1] === 'HashMap' ? HashMap.newHashMap(n) : a[1] === 'LinkedHashMap' ? LinkedHashMap.newLinkedHashMap(n)
        : a[1] === 'LinkedHashMapH' ? (LinkedHashMap as any).newHashMap(n) : a[1] === 'HashSet' ? HashSet.newHashSet(n)
        : a[1] === 'LinkedHashSet' ? LinkedHashSet.newLinkedHashSet(n) : (LinkedHashSet as any).newHashSet(n);
      if (isMap(m)) { m.put(2, 1); m.put(1, 2); } else { m.add(2); m.add(1); }
      return `${m.constructor.name}/${fmt(m, true)}`;
    }
    case 'spl': { const i = a.indexOf('|'); return splProg(splSource(a.slice(1, i)), a[i + 1]); }
    case 'spit': { const i = a.indexOf('|'); return iterProg(Spliterators.iterator(splSource(a.slice(1, i))), a[i + 1]); }
    case 'coll': return driveCollector(new Coll(a, 1).parse(), list(a[a.length - 1]));
    case 'gath': {
      const g = gatherer(['gather', ...a.slice(1, -1)]);
      const d = new ListDownstream();
      const st = g.initializer()();
      const integ = g.integrator();
      for (const x of list(a[a.length - 1])) if (!integ(st, x, d)) break;
      g.finisher()(st, d);
      return `${fmt(d.out)}/${g.combiner() === (Gatherer as any).defaultCombiner() ? 'seq' : 'par'}`;
    }
    case 'opt': {
      const segs = a.slice(1).join(' ').split(' | ').map((x) => x.split(' '));
      const [kind, src, arg] = segs[0];
      const K = OPT_KINDS[kind];
      const out: string[] = [];
      try {
        // primitive optionals: the reference unboxes the argument (null throws)
        let o: any = src === 'empty' ? K.empty() : src === 'of' ? K.of(kind === 'O' ? el(arg) : nn(el(arg))) : K.ofNullable(el(arg));
        for (const [op, x] of segs.slice(1)) {
          switch (op) {
            case 'get': out.push(fmt(kind === 'O' ? o.get() : kind === 'I' ? o.getAsInt() : kind === 'L' ? o.getAsLong() : o.getAsDouble())); break;
            case 'isPresent': out.push(fmt(o.isPresent())); break;
            case 'isEmpty': out.push(fmt(o.isEmpty())); break;
            case 'ifPresent': o.ifPresent((v: unknown) => log.push(fmt(v))); out.push('v'); break;
            case 'ifPresentOrElse': o.ifPresentOrElse((v: unknown) => log.push(fmt(v)), () => log.push('else')); out.push('v'); break;
            case 'filter': o = o.filter((v: unknown) => po(x, v)); break;
            case 'map': o = o.map((v: unknown) => un(x, v)); break;
            case 'flatMap': o = o.flatMap((v: unknown) => (x === 'some' ? Optional.of(un('plus1', v)) : x === 'none' ? Optional.empty() : null)); break;
            case 'or': o = o.or(() => (x === 'null' ? null : Optional.of(el(x)))); break;
            case 'orElse': out.push(fmt(o.orElse(el(x)))); break;
            case 'orElseGet': out.push(fmt(o.orElseGet(() => el(x)))); break;
            case 'orElseThrow': out.push(fmt(o.orElseThrow())); break;
            case 'orElseThrowS': out.push(fmt(o.orElseThrow(() => new IllegalStateException()))); break;
            case 'stream': out.push(fmt(o.stream().toArray())); break;
            case 'equals': out.push(fmt(o.equals(x === 'empty' ? K.empty() : K.of(el(x))))); break;
            case 'hashCode': out.push(fmt(o.hashCode())); break;
            case 'toString': out.push(fmt(o.toString())); break;
            default: throw new Error('opt ' + op);
          }
        }
        out.push(fmt(o));
      } catch (e) {
        out.push(excName(e));
      }
      return new Raw(`[${out.join(',')}]`);
    }
    case 'stats': {
      const segs = a.slice(1).join(' ').split(' | ').map((x) => x.split(' '));
      const [kind, ctor, ...cargs] = segs[0];
      const S = STATS[kind];
      const out: string[] = [];
      try {
        const st = ctor === 'new' ? new S() : new S(...cargs.map(Number));
        for (const [op, x] of segs.slice(1)) {
          switch (op) {
            case 'accept': st.accept(Number(x)); break;
            case 'combine': { const o = new S(); for (const v of list(x)) o.accept(v); st.combine(o); break; }
            case 'toString': out.push(fmt(st.toString().replace(/9007199254740991/g, 'BIG'))); break;
            default: out.push(fmt(st[op]()));
          }
        }
      } catch (e) {
        out.push(excName(e));
      }
      return new Raw(`[${out.join(',')}]`);
    }
    case 'entry': {
      const segs = a.slice(1).join(' ').split(' | ').map((x) => x.split(' '));
      const [kind, k, v] = segs[0];
      const out: string[] = [];
      try {
        const e: any = kind === 'simple' ? new SimpleEntry(el(k), el(v)) : kind === 'immutable' ? new SimpleImmutableEntry(el(k), el(v))
          : kind === 'mapEntry' ? Map.entry(el(k), el(v)) : (Map.Entry as any).copyOf(new SimpleEntry(el(k), el(v)));
        for (const [op, x, y] of segs.slice(1)) {
          switch (op) {
            case 'getKey': out.push(fmt(e.getKey())); break;
            case 'getValue': out.push(fmt(e.getValue())); break;
            case 'setValue': out.push(fmt(e.setValue(el(x)))); break;
            case 'equals': out.push(fmt(e.equals(new SimpleEntry(el(x), el(y))))); break;
            case 'hashCode': out.push(fmt(e.hashCode())); break;
            case 'toString': out.push(fmt(e.toString())); break;
            default: throw new Error('entry ' + op);
          }
        }
      } catch (e) {
        out.push(excName(e));
      }
      return new Raw(`[${out.join(',')}]`);
    }
  }
  throw new Error('misc ' + a[0]);
}

/** Runs a whole script file's text; returns the output text (same layout as RefRunner). */
export function runScripts(text: string): string {
  const out: string[] = [];
  let s: Script | null = null;
  for (const line of text.split('\n')) {
    if (line === '') continue;
    if (line.startsWith('@')) {
      const [id, type] = line.split(' ');
      s = new Script(type);
      out.push(id);
      continue;
    }
    out.push(s!.exec(line));
  }
  return out.join('\n') + '\n';
}
