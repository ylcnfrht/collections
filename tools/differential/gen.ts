// Seeded generator of differential scripts. Output format (one script):
//   @<id> <Target>
//   init [..] | init {..}        (collections/maps; stream scripts have none)
//   <op> <arg> ...               (one op per line)
//   pipe <source> | <stage> | ... | <terminal>   (stream scripts)
// Tokens: ints, null, 'str (leading quote), 2.5 (doubles), [a,b] lists, {k=v} maps, catalogue names.

export interface Script {
  id: string;
  type: string;
  lines: string[];
}

export function scriptText(s: Script): string {
  return `@${s.id} ${s.type}\n${s.lines.join('\n')}\n`;
}

/** mulberry32 */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }
  pick<T>(a: readonly T[]): T {
    return a[Math.floor(this.next() * a.length)];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}

type ET = 'int' | 'str';

interface TargetDef {
  ops: string[];
  types: ET[];
  nulls: boolean;
  map?: boolean;
  ordered: boolean;
}

// ---- op groups (name + arg spec). Arg kinds: e elem, i index, L list, p pred, f elem fn, c comparator,
// n small int, b bool, k key, v value, M map literal, kf key fn, bf bi fn, mop merge op, vp value pred, vf value fn, seed
const COLL = ['add e', 'remove e', 'contains e', 'size', 'isEmpty', 'clear', 'addAll L', 'removeAll L', 'retainAll L', 'containsAll L',
  'removeIf p', 'toArray', 'iterRemove p', 'hashCode', 'frequency e', 'min', 'max', 'minCmp c', 'maxCmp c', 'disjoint L', 'collAddAll L',
  'streamCount p', 'streamList', 'equalsCopy', 'equalsL L', 'add e', 'add e', 'remove e'];
const SEQ = ['addFirst e', 'addLast e', 'getFirst', 'getLast', 'removeFirst', 'removeLast', 'reversed'];
const LIST = ['get i', 'set i e', 'addAt i e', 'removeAt i', 'indexOf e', 'lastIndexOf e', 'subList i i', 'subListClear i i', 'subListAdd i i e',
  'addAllAt i L', 'replaceAll f', 'sort c', 'listIterAdd i e', 'listIterRev i', 'listIterSet p f', 'reverse', 'rotate n', 'swap i i',
  'shuffle seed', 'sortBsearch e', 'bsearchCmp e c', 'fill e', 'indexOfSubList L', 'lastIndexOfSubList L', 'nCopiesAddAll n e', 'iterCme e', 'subListCme i i e'];
const STACK = ['push e', 'pop', 'peek', 'empty', 'search e'];
const VECTOR = ['elementAt i', 'firstElement', 'lastElement', 'addElement e', 'removeElementAt i', 'insertElementAt e i', 'removeElement e',
  'setElementAt e i', 'setSize n'];
const QUEUE = ['offer e', 'poll', 'peek', 'element', 'removeHead'];
const DEQUE = ['offerFirst e', 'offerLast e', 'pollFirst', 'pollLast', 'peekFirst', 'peekLast', 'push e', 'pop', 'removeFirstOccurrence e',
  'removeLastOccurrence e', 'descIter'];
const NAVSET = ['first', 'last', 'lower e', 'floor e', 'ceiling e', 'higher e', 'pollFirst', 'pollLast', 'headSet e b', 'tailSet e b',
  'subSet e b e b', 'headSetPlain e', 'tailSetPlain e', 'subSetPlain e e', 'descendingSet', 'descIter', 'headSetClear e', 'subSetAdd e e e',
  'descSetPollFirst'];
const MAPOPS = ['put k v', 'put k v', 'put k v', 'get k', 'removeKey k', 'remove2 k v', 'containsKey k', 'containsValue v', 'getOrDefault k v',
  'putIfAbsent k v', 'replace k v', 'replace3 k v v', 'computeIfAbsent k kf', 'computeIfPresent k bf', 'compute k bf', 'merge k v mop',
  'mreplaceAll bf', 'size', 'isEmpty', 'clear', 'keySet', 'values', 'entrySet', 'putAll M', 'keySetRemove k', 'valuesRemove v',
  'entryRemoveIf vp', 'keySetRetainAll L', 'hashCode', 'equalsCopy', 'iterSetValue vf', 'entrySetContains k v'];
const SEQMAP = ['firstEntry', 'lastEntry', 'pollFirstEntry', 'pollLastEntry', 'putFirst k v', 'putLast k v', 'reversed', 'mapIterCme k v'];
const NAVMAP = ['firstKey', 'lastKey', 'lowerKey k', 'floorKey k', 'ceilingKey k', 'higherKey k', 'lowerEntry k', 'floorEntry k',
  'ceilingEntry k', 'higherEntry k', 'headMap k b', 'tailMap k b', 'subMap k b k b', 'descendingMap', 'descendingKeySet', 'headMapClear k',
  'subMapPut k k k v'];
// IdentityHashMap: identityHashCode-based hashCode, and values must stay inside the boxed-int cache (-128..127)
const IDENTITY_EXCLUDED = new Set(['hashCode', 'merge', 'compute', 'computeIfPresent', 'mreplaceAll', 'iterSetValue']);

// PriorityQueue/ArrayDeque inherit identity hashCode on the reference side
const NO_HASH = COLL.filter((o) => o !== 'hashCode');
// values().remove(v) removes the first of several equal values: iteration-order dependent on hashed maps
const UNORDERED_MAPOPS = MAPOPS.filter((o) => !o.startsWith('valuesRemove'));
const ord = (ops: string[]) => [...ops, 'toStr'];

export const TARGETS: Record<string, TargetDef> = {
  ArrayList: { ops: ord([...COLL, ...SEQ, ...LIST]), types: ['int', 'str'], nulls: true, ordered: true },
  LinkedList: { ops: ord([...COLL, ...SEQ, ...LIST, ...QUEUE, ...DEQUE]), types: ['int', 'str'], nulls: true, ordered: true },
  Vector: { ops: ord([...COLL, ...SEQ, ...LIST, ...VECTOR]), types: ['int', 'str'], nulls: true, ordered: true },
  Stack: { ops: ord([...COLL, ...SEQ, ...LIST, ...VECTOR, ...STACK]), types: ['int', 'str'], nulls: true, ordered: true },
  UnmodList: { ops: ord([...COLL, ...SEQ, ...LIST]), types: ['int', 'str'], nulls: true, ordered: true },
  ListOf: { ops: ord([...COLL, ...SEQ, ...LIST]), types: ['int', 'str'], nulls: false, ordered: true },
  ArrayDeque: { ops: ord([...NO_HASH, ...SEQ, ...QUEUE, ...DEQUE]), types: ['int', 'str'], nulls: false, ordered: true },
  PriorityQueue: { ops: [...NO_HASH, ...QUEUE, 'pollAll'], types: ['int', 'str'], nulls: false, ordered: false },
  PriorityQueueRev: { ops: [...NO_HASH, ...QUEUE, 'pollAll'], types: ['int', 'str'], nulls: false, ordered: false },
  HashSet: { ops: COLL, types: ['int', 'str'], nulls: true, ordered: false },
  LinkedHashSet: { ops: ord([...COLL, ...SEQ]), types: ['int', 'str'], nulls: true, ordered: true },
  TreeSet: { ops: ord([...COLL, ...SEQ, ...NAVSET]), types: ['int', 'str'], nulls: false, ordered: true },
  TreeSetRev: { ops: ord([...COLL, ...SEQ, ...NAVSET]), types: ['int', 'str'], nulls: false, ordered: true },
  TreeSetMod3: { ops: ord([...COLL, ...SEQ, ...NAVSET]), types: ['int'], nulls: false, ordered: true },
  SetOf: { ops: COLL, types: ['int', 'str'], nulls: false, ordered: false },
  HashMap: { ops: UNORDERED_MAPOPS, types: ['int', 'str'], nulls: true, map: true, ordered: false },
  LinkedHashMap: { ops: ord([...MAPOPS, ...SEQMAP]), types: ['int', 'str'], nulls: true, map: true, ordered: true },
  LinkedHashMapAccess: { ops: ord([...MAPOPS, ...SEQMAP]), types: ['int', 'str'], nulls: true, map: true, ordered: true },
  TreeMap: { ops: ord([...MAPOPS, ...SEQMAP, ...NAVMAP]), types: ['int', 'str'], nulls: false, map: true, ordered: true },
  TreeMapRev: { ops: ord([...MAPOPS, ...SEQMAP, ...NAVMAP]), types: ['int', 'str'], nulls: false, map: true, ordered: true },
  IdentityHashMap: { ops: UNORDERED_MAPOPS.filter((o) => !IDENTITY_EXCLUDED.has(o.split(' ')[0])), types: ['int'], nulls: true, map: true, ordered: false },
  MapOf: { ops: UNORDERED_MAPOPS, types: ['int', 'str'], nulls: false, map: true, ordered: false },
};

/** Stream scripts are weighted like this many collection targets. */
const STREAM_WEIGHT = 10;
export const ALL_TARGETS = [...Object.keys(TARGETS), 'Stream'];

const STRS = ['', 'a', 'b', 'c', 'ab', 'ba', 'abc', 'bb', 'ca'];

// ---- catalogue by element type
const PRED: Record<string, string[]> = {
  int: ['even', 'odd', 'pos', 'gt3', 'lt10', 'isZero'],
  str: ['empty', 'hasA', 'long'],
  dbl: ['even', 'pos', 'gt3', 'lt10', 'isInt'],
  listI: ['small'],
  listS: ['small'],
};
const INT_FN = ['id', 'plus1', 'times2', 'neg', 'mod3', 'abs', 'sign'];
const STR_FN = ['id', 'upper', 'rev', 'first', 'dup'];
const DBL_FN = ['id', 'plus1', 'times2', 'half', 'third', 'abs'];
const CMP: Record<string, string[]> = {
  int: ['nat', 'rev', 'mod3', 'mod3rev', 'mod3ThenRev', 'nullsFirst', 'nullsLast'],
  str: ['nat', 'rev', 'len', 'lenNat', 'nullsFirst', 'nullsLast'],
  dbl: ['nat', 'rev'],
};
const BINOP: Record<string, string[]> = { int: ['add', 'max', 'min'], str: ['concat'], dbl: ['add', 'max', 'min'] };

export class Gen {
  constructor(private r: Rng) {}

  // ---------------- elements
  intv(): number {
    return this.r.chance(0.75) ? this.r.int(-2, 9) : this.r.int(-5, 20);
  }
  elem(t: ET, nulls: boolean): string {
    if (this.r.chance(nulls ? 0.05 : 0.015)) return 'null';
    return t === 'int' ? String(this.intv()) : "'" + this.r.pick(STRS);
  }
  list(t: ET, nulls: boolean, max = 5): string {
    const n = this.r.int(0, max);
    return '[' + Array.from({ length: n }, () => this.elem(t, nulls)).join(',') + ']';
  }
  value(nulls: boolean): string {
    return this.r.chance(nulls ? 0.06 : 0.015) ? 'null' : String(this.r.int(-3, 9));
  }
  mapLit(t: ET, nulls: boolean, max = 5): string {
    const n = this.r.int(0, max);
    return '{' + Array.from({ length: n }, () => `${this.elem(t, nulls)}=${this.value(nulls)}`).join(',') + '}';
  }
  index(): string {
    return String(this.r.chance(0.85) ? this.r.int(0, 5) : this.r.int(-1, 10));
  }

  // ---------------- collection / map scripts
  script(id: string, type: string): Script {
    if (type === 'Stream') return this.streamScript(id);
    const d = TARGETS[type];
    const t = this.r.pick(d.types);
    const lines = [d.map ? `init ${this.mapLit(t, d.nulls, 6)}` : `init ${this.list(t, d.nulls, 8)}`];
    const n = this.r.int(4, 18);
    for (let i = 0; i < n; i++) lines.push(this.op(this.r.pick(d.ops), t, d));
    return { id, type, lines };
  }

  op(spec: string, t: ET, d: TargetDef): string {
    const [name, ...args] = spec.split(' ');
    const out = [name];
    for (const a of args) out.push(this.arg(a, t, d));
    // subList ranges: mostly valid (from <= to), sometimes reversed to provoke the exception
    if (name.startsWith('subList') && Number(out[1]) > Number(out[2]) && this.r.chance(0.8)) [out[1], out[2]] = [out[2], out[1]];
    return out.join(' ');
  }

  arg(a: string, t: ET, d: TargetDef): string {
    const r = this.r;
    switch (a) {
      case 'e':
      case 'k': return this.elem(t, d.nulls);
      case 'i': return this.index();
      case 'L': return this.list(t, d.nulls);
      case 'p': return r.pick(PRED[t]);
      case 'f': return d.nulls && r.chance(0.05) ? 'nullf' : r.pick(t === 'int' ? INT_FN : STR_FN);
      // unordered targets: only total orders, otherwise min/max among ties depends on iteration order
      case 'c': return r.chance(0.1) ? 'null' : r.pick(d.ordered ? CMP[t] : ['nat', 'rev', 'nullsFirst', 'nullsLast']);
      case 'n': return String(r.int(-2, 6));
      case 'b': return String(r.chance(0.5));
      case 'v': return this.value(d.nulls);
      case 'M': return this.mapLit(t, d.nulls);
      case 'kf': return r.chance(0.2) ? 'nullf' : t === 'int' ? r.pick(['plus1', 'times2']) : 'len';
      case 'bf': return r.pick(['sumKV', 'nullKV', 'kOnly', 'vPlus1']);
      case 'mop': return r.pick(['add', 'max', 'min', 'nullBi']);
      case 'vp': return r.pick(['even', 'pos', 'gt3']);
      case 'vf': return r.pick(['plus1', 'times2', 'neg', 'mod3']);
      case 'seed': return String(r.int(0, 1000));
    }
    throw new Error('arg ' + a);
  }

  // ---------------- stream scripts
  streamScript(id: string): Script {
    const n = this.r.int(2, 8);
    return { id, type: 'Stream', lines: Array.from({ length: n }, () => this.pipe()) };
  }

  dbls(): string {
    const n = this.r.int(0, 6);
    return '[' + Array.from({ length: n }, () => (this.r.chance(0.5) ? String(this.r.int(0, 10)) : `${this.r.int(0, 9)}.5`)).join(',') + ']';
  }
  ints(max = 6): string {
    const n = this.r.int(0, max);
    return '[' + Array.from({ length: n }, () => String(this.intv())).join(',') + ']';
  }

  /** Element type of the current stream: object streams int/str/dbl/listI/listS, or primitive I/L/D. */
  pipe(): string {
    const r = this.r;
    const parts: string[] = [];
    let ty: string;
    let needLimit = false;
    const t: ET = r.chance(0.65) ? 'int' : 'str';
    const src = r.pick(['of', 'of', 'of', 'ofNullable', 'empty', 'iterate2', 'iterate3', 'generate', 'concat', 'builder', 'coll', 'coll', 'listOf',
      'iof', 'iof', 'irange', 'irangeClosed', 'iiterate2', 'iiterate3', 'iconcat', 'lof', 'lrange', 'lrangeClosed', 'dof', 'dof']);
    switch (src) {
      case 'of': case 'builder': case 'listOf': parts.push(`${src} ${this.list(t, true, 7)}`); ty = t; break;
      case 'ofNullable': parts.push(`ofNullable ${this.elem(t, true)}`); ty = t; break;
      case 'empty': parts.push('empty'); ty = t; break;
      case 'iterate2':
        parts.push(t === 'int' ? `iterate2 ${r.int(-3, 5)} ${r.pick(['plus1', 'times2', 'neg', 'mod3'])}` : `iterate2 '${r.pick(['a', 'ab', 'b'])} ${r.pick(['dup', 'rev', 'upper'])}`);
        ty = t; needLimit = true; break;
      case 'iterate3':
        parts.push(r.chance(0.5) ? `iterate3 ${r.int(-5, 9)} lt10 plus1` : `iterate3 ${r.int(1, 5)} lt10 times2`); ty = 'int'; break;
      case 'generate': parts.push(`generate ${this.elem(t, false)}`); ty = t; needLimit = true; break;
      case 'concat': parts.push(`concat ${this.list(t, true)} ${this.list(t, true)}`); ty = t; break;
      case 'coll': {
        const k = r.pick(['ArrayList', 'LinkedList', 'ArrayDeque', 'TreeSet', 'LinkedHashSet', 'Vector']);
        parts.push(`coll ${k} ${this.list(t, k !== 'ArrayDeque' && k !== 'TreeSet', 7)}`); ty = t; break;
      }
      case 'iof': parts.push(`iof ${this.ints(8)}`); ty = 'I'; break;
      case 'irange': case 'irangeClosed': parts.push(`${src} ${r.int(-3, 4)} ${r.int(-1, 9)}`); ty = 'I'; break;
      case 'iiterate2': parts.push(`iiterate2 ${r.int(-3, 5)} ${r.pick(['plus1', 'times2', 'neg', 'mod3'])}`); ty = 'I'; needLimit = true; break;
      case 'iiterate3': parts.push(r.chance(0.5) ? `iiterate3 ${r.int(-5, 9)} lt10 plus1` : `iiterate3 ${r.int(1, 5)} lt10 times2`); ty = 'I'; break;
      case 'iconcat': parts.push(`iconcat ${this.ints()} ${this.ints()}`); ty = 'I'; break;
      case 'lof': parts.push(`lof ${this.ints(8)}`); ty = 'L'; break;
      case 'lrange': case 'lrangeClosed': parts.push(`${src} ${r.int(-3, 4)} ${r.int(-1, 9)}`); ty = 'L'; break;
      default: parts.push(`dof ${this.dbls()}`); ty = 'D'; break;
    }
    if (needLimit) parts.push(`limit ${r.int(0, 7)}`);
    const nStages = r.int(0, 4);
    for (let i = 0; i < nStages; i++) {
      const [s, nt] = this.stage(ty);
      parts.push(s);
      ty = nt;
    }
    // the reference elides sorted() on an already-SORTED stream (ranges, TreeSet sources, sorted twice), which changes
    // how many elements an upstream peek observes; that is unspecified, so no peek before a natural sorted()
    const lastSorted = parts.lastIndexOf('sorted');
    const kept = parts.filter((p, i) => !(p === 'peek' && i < lastSorted));
    parts.length = 0;
    parts.push(...kept);
    parts.push(this.terminal(ty));
    return 'pipe ' + parts.join(' | ');
  }

  lim(): string {
    return String(this.r.chance(0.05) ? -1 : this.r.int(0, 6));
  }

  stage(ty: string): [string, string] {
    const r = this.r;
    const common: [string, string][] = [['distinct', ty], ['limit ' + this.lim(), ty], ['skip ' + this.lim(), ty], ['peek', ty]];
    if (ty === 'I' || ty === 'L' || ty === 'D') {
      const P = ty === 'D' ? PRED.dbl : PRED.int;
      const F = ty === 'D' ? DBL_FN : INT_FN.filter((f) => f !== 'sign' || ty === 'I');
      const opts: [string, string][] = [...common, ['sorted', ty], [`filter ${r.pick(P)}`, ty], [`map ${r.pick(F)}`, ty],
        [`takeWhile ${r.pick(P)}`, ty], [`dropWhile ${r.pick(P)}`, ty], ['boxed', ty === 'D' ? 'dbl' : 'int'],
        [`flatMap ${r.pick(ty === 'D' ? ['dup', 'nullS'] : ['dup', 'upto', 'nullS'])}`, ty], [`mapMulti ${r.pick(['dup', 'evenTwice'])}`, ty]];
      if (ty === 'I') opts.push(['asLongStream', 'L'], ['asDoubleStream', 'D'], [`mapToLong ${r.pick(['id', 'plus1'])}`, 'L'],
        [`mapToDouble ${r.pick(['id', 'half'])}`, 'D'], [`mapToObj ${r.pick(['id', 'str'])}`, '?']);
      if (ty === 'L') opts.push(['asDoubleStream', 'D'], [`mapToInt ${r.pick(['id', 'mod3'])}`, 'I'], [`mapToDouble ${r.pick(['id', 'half'])}`, 'D'],
        [`mapToObj ${r.pick(['id', 'str'])}`, '?']);
      if (ty === 'D') opts.push(['mapToInt trunc', 'I'], ['mapToLong trunc', 'L'], ['mapToObj id', 'dbl']);
      const [s, nt] = r.pick(opts);
      return [s, nt === '?' ? (s.endsWith('str') ? 'str' : 'int') : nt];
    }
    if (ty === 'listI' || ty === 'listS') {
      return r.pick<[string, string]>([...common.filter((c) => c[0] !== 'distinct'), ['filter small', ty], ['map size', 'int'],
        ...(ty === 'listI' ? [['map sumList', 'int'] as [string, string]] : [])]);
    }
    const P = PRED[ty];
    const opts: [string, string][] = [...common, ['sorted', ty], [`sortedC ${r.pick(CMP[ty])}`, ty], [`filter ${r.pick(P)}`, ty],
      [`takeWhile ${r.pick(P)}`, ty], [`dropWhile ${r.pick(P)}`, ty]];
    if (ty === 'int') {
      opts.push([`map ${r.pick(INT_FN)}`, 'int'], [`map ${r.pick(INT_FN)}`, 'int'], ['map str', 'str'], ['map half', 'dbl'],
        [`mapToInt ${r.pick(['id', 'plus1', 'mod3'])}`, 'I'], ['mapToLong id', 'L'], [`mapToDouble ${r.pick(['id', 'half'])}`, 'D'],
        [`flatMap ${r.pick(['dup', 'upto', 'nullS'])}`, 'int'], [`mapMulti ${r.pick(['dup', 'evenTwice'])}`, 'int'],
        [`gather ${r.pick(['fold', 'scan'])} ${this.intv()} ${r.pick(BINOP.int)}`, 'int'],
        [`gather windowFixed ${r.int(0, 4)}`, 'listI'], [`gather windowSliding ${r.int(0, 4)}`, 'listI']);
    } else if (ty === 'str') {
      opts.push([`map ${r.pick(STR_FN)}`, 'str'], ['map len', 'int'], ['mapToInt len', 'I'], [`flatMap ${r.pick(['dup', 'chars', 'nullS'])}`, 'str'],
        ['mapMulti dup', 'str'], [`gather ${r.pick(['fold', 'scan'])} '${r.pick(STRS)} concat`, 'str'],
        [`gather windowFixed ${r.int(0, 4)}`, 'listS'], [`gather windowSliding ${r.int(0, 4)}`, 'listS']);
    } else {
      opts.push([`map ${r.pick(DBL_FN)}`, 'dbl'], ['mapToDouble id', 'D'], ['mapToInt trunc', 'I'], [`mapMulti ${r.pick(['dup', 'evenTwice'])}`, 'dbl'],
        [`gather ${r.pick(['fold', 'scan'])} 0.0 ${r.pick(BINOP.dbl)}`, 'dbl']);
    }
    return r.pick(opts);
  }

  terminal(ty: string): string {
    const r = this.r;
    if (ty === 'I' || ty === 'L' || ty === 'D') {
      const P = ty === 'D' ? PRED.dbl : PRED.int;
      const op = r.pick(BINOP.int);
      return r.pick(['toArray', 'count', 'sum', 'average', 'min', 'max', 'summaryStatistics', `reduce1 ${op}`, `reduce2 ${r.int(-2, 3)} ${op}`,
        'findFirst', 'findAny', `anyMatch ${r.pick(P)}`, `allMatch ${r.pick(P)}`, `noneMatch ${r.pick(P)}`, 'forEach', 'boxedList',
        'statsStr', 'findFirstStr', 'averageStr']);
    }
    const base = ['toList', 'toArray', 'count', 'findFirst', 'findAny', 'forEach', 'forEachOrdered', 'iterator',
      `anyMatch ${r.pick(PRED[ty])}`, `allMatch ${r.pick(PRED[ty])}`, `noneMatch ${r.pick(PRED[ty])}`];
    if (ty === 'listI' || ty === 'listS') return r.pick([...base, `collect ${this.collector(ty, 2)}`]);
    // toString formats: not for doubles (a JS number cannot tell 1.0 from 1)
    if (ty === 'int' || ty === 'str') base.push('toListStr', 'findFirstStr');
    const op = r.pick(BINOP[ty]);
    const id = ty === 'str' ? "'" + r.pick(STRS) : String(r.int(-2, 3));
    return r.pick([...base, `min ${r.pick(CMP[ty])}`, `max ${r.pick(CMP[ty])}`, `reduce1 ${op}`, `reduce2 ${id} ${op}`, `reduce3 ${id} ${op}`,
      `collect ${this.collector(ty, 2)}`, `collect ${this.collector(ty, 2)}`, `collect ${this.collector(ty, 2)}`]);
  }

  /** Prefix collector expression for elements of type ty. */
  collector(ty: string, depth: number): string {
    const r = this.r;
    const sub = (t: string) => this.collector(t, depth - 1);
    const leafs = ['toList', 'toSet', 'toUnmodifiableList', 'toUnmodifiableSet', 'counting'];
    if (ty === 'listI' || ty === 'listS') {
      return depth > 0 && r.chance(0.5) ? `mapping size ${sub('int')}` : r.pick(['toList', 'counting']);
    }
    const opts: string[] = [...leafs];
    const P = PRED[ty];
    if (ty === 'int') {
      opts.push('toTreeSet', `summingInt ${r.pick(['id', 'plus1', 'mod3'])}`, 'summingLong id', `summingDouble ${r.pick(['id', 'half'])}`,
        'averagingInt id', `averagingDouble ${r.pick(['id', 'half'])}`, 'summarizingInt id', 'summarizingDouble half',
        `minBy ${r.pick(CMP.int)}`, `maxBy ${r.pick(CMP.int)}`, `reducing1 ${r.pick(BINOP.int)}`, `reducing2 ${r.int(-1, 2)} ${r.pick(BINOP.int)}`,
        `reducing3 0 ${r.pick(INT_FN)} ${r.pick(BINOP.int)}`, `toMap2 ${r.pick(['id', 'mod3', 'abs'])} ${r.pick(['id', 'times2', 'str'])}`,
        `toMap3 ${r.pick(['id', 'mod3', 'even'])} id ${r.pick([...BINOP.int, 'nullBi'])}`, `toMapTree ${r.pick(['id', 'mod3', 'even'])} id ${r.pick(BINOP.int)}`,
        `toUnmodifiableMap2 ${r.pick(['id', 'mod3'])} id`);
    } else if (ty === 'str') {
      opts.push('toTreeSet', 'joining', 'joining', `joining3 ${r.pick(["'-", "';", "'"])} ${r.pick(["'<", "'"])} ${r.pick(["'>", "'"])}`,
        'summingInt len', 'averagingInt len', 'summarizingInt len', `minBy ${r.pick(CMP.str)}`, `maxBy ${r.pick(CMP.str)}`,
        'reducing1 concat', `reducing2 '${r.pick(STRS)} concat`, 'reducing3 0 len add', `toMap2 ${r.pick(['id', 'len', 'first'])} ${r.pick(['id', 'len'])}`,
        `toMap3 ${r.pick(['len', 'first'])} id concat`, `toMapTree ${r.pick(['len', 'first'])} id concat`, `toUnmodifiableMap2 ${r.pick(['id', 'len'])} len`);
    } else {
      opts.push('toTreeSet', 'summingDouble id', 'averagingDouble id', 'summarizingDouble id', `minBy ${r.pick(CMP.dbl)}`, `maxBy ${r.pick(CMP.dbl)}`,
        `reducing1 ${r.pick(BINOP.dbl)}`);
    }
    if (depth > 0) {
      const key = ty === 'int' ? r.pick(['mod3', 'even', 'sign', 'id', 'abs']) : ty === 'str' ? r.pick(['len', 'first', 'id']) : 'trunc';
      const [mf, mt] = ty === 'int' ? r.pick([['plus1', 'int'], ['mod3', 'int'], ['str', 'str'], ['half', 'dbl']])
        : ty === 'str' ? r.pick([['len', 'int'], ['upper', 'str']]) : r.pick([['half', 'dbl'], ['plus1', 'dbl']]);
      opts.push(`groupingBy1 ${key}`, `groupingBy2 ${key} ${sub(ty)}`, `groupingByTree ${key} ${sub(ty)}`, `partitioningBy1 ${r.pick(P)}`,
        `partitioningBy2 ${r.pick(P)} ${sub(ty)}`, `mapping ${mf} ${sub(mt)}`, `filtering ${r.pick(P)} ${sub(ty)}`, `teeing ${sub(ty)} ${sub(ty)}`,
        `andThenSize ${r.pick(['toList', 'toSet', 'toTreeSet', `groupingBy1 ${key}`, `partitioningBy1 ${r.pick(P)}`])}`);
      if (ty === 'int') opts.push(`flatMapping ${r.pick(['dup', 'upto', 'nullS'])} ${sub('int')}`);
      if (ty === 'str') opts.push(`flatMapping ${r.pick(['dup', 'chars'])} ${sub('str')}`);
    }
    return r.pick(opts);
  }
}

/** count scripts from seed; targets (optional) restricts the mix. Script ids are `<seed>-<n>`. */
export function generate(seed: number, count: number, targets?: string[]): Script[] {
  const r = new Rng(seed);
  const g = new Gen(r);
  const pool = targets ?? [...Object.keys(TARGETS), ...Array(STREAM_WEIGHT).fill('Stream')];
  return Array.from({ length: count }, (_, i) => g.script(`${seed}-${i}`, r.pick(pool)));
}
