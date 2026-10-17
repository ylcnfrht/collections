// TS side of the differential harness: executes scripts against our library and prints the same
// normalised lines as RefRunner. Keep the two files in lock-step (same op names, same catalogue).
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ArrayDeque,
  ArrayList,
  Collections,
  Collectors,
  Comparator,
  DoubleStream,
  DoubleSummaryStatistics,
  Gatherers,
  HashMap,
  HashSet,
  IdentityHashMap,
  IntStream,
  IntSummaryStatistics,
  LinkedHashMap,
  LinkedHashSet,
  LinkedList,
  List,
  LongStream,
  LongSummaryStatistics,
  Map,
  NullPointerException,
  Optional,
  OptionalDouble,
  OptionalInt,
  OptionalLong,
  PriorityQueue,
  Set,
  SimpleEntry,
  Stack,
  Stream,
  TreeMap,
  TreeSet,
  Vector,
} from '../../src/index';

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
  return `EXC:${(e as any)?.constructor?.name ?? typeof e}`;
}

// ---------------------------------------------------------------- scripts

const UNORDERED = new globalThis.Set(['PriorityQueue', 'PriorityQueueRev', 'HashSet', 'HashMap', 'IdentityHashMap', 'SetOf', 'MapOf']);

function newTarget(type: string): any {
  switch (type) {
    case 'ArrayList':
    case 'UnmodList': return new ArrayList();
    case 'LinkedList': return new LinkedList();
    case 'Vector': return new Vector();
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
    case 'TreeMap': return new TreeMap();
    case 'TreeMapRev': return new TreeMap(Comparator.reverseOrder());
    case 'IdentityHashMap': return new IdentityHashMap();
  }
  return null;
}

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
  dead = false;
  readonly ordered: boolean;
  constructor(readonly type: string) {
    this.ordered = !UNORDERED.has(type);
    this.t = newTarget(type);
  }

  exec(line: string): string {
    if (this.dead) return 'DEAD';
    if (line.startsWith('pipe ')) return runPipe(line.slice(5));
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
        if (a[1].startsWith('{')) {
          const ps = pairs(a[1]);
          if (this.type === 'MapOf') this.t = Map.ofEntries(...ps.map(([k, v]) => Map.entry(k, v)));
          else for (const [k, v] of ps) t.put(k, v);
          return VOID;
        }
        const l = list(a[1]);
        switch (this.type) {
          case 'ListOf': this.t = List.of(...l); return VOID;
          case 'SetOf': this.t = Set.of(...l); return VOID;
          case 'UnmodList': this.t = Collections.unmodifiableList(ArrayList.of(...l)); return VOID;
        }
        return t.addAll(ArrayList.of(...l));
      }
      case 'size': return t.size();
      case 'isEmpty': return t.isEmpty();
      case 'clear': t.clear(); return VOID;
      case 'hashCode': return t.hashCode();
      case 'toStr': return t.toString();
      case 'equalsCopy':
        if (isMap(t)) return t.equals(new HashMap(t));
        if (t instanceof HashSet || t instanceof TreeSet || this.type === 'SetOf') return t.equals(new HashSet(t));
        return t.equals(new ArrayList(t));
      case 'equalsL': {
        const l = ArrayList.of(...list(a[1]));
        if (t instanceof HashSet || t instanceof TreeSet || this.type === 'SetOf') return t.equals(new HashSet(l));
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
    }
    throw new Error('unknown op ' + op);
  }
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
  }
  throw new Error('stage ' + op);
}

function gatherer(a: string[]): any {
  switch (a[1]) {
    case 'fold': { const id = el(a[2]); return Gatherers.fold(() => id, (x: any, y: any) => bin(a[3], x, y)); }
    case 'scan': { const id = el(a[2]); return Gatherers.scan(() => id, (x: any, y: any) => bin(a[3], x, y)); }
    case 'windowFixed': return Gatherers.windowFixed(ni(a[2]));
    case 'windowSliding': return Gatherers.windowSliding(ni(a[2]));
  }
  throw new Error('gatherer ' + a[1]);
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
    }
    throw new Error('collector ' + n);
  }
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
