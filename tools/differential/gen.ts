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
/** Element kind of a collection target: its base element type, map values, or map entries. */
type EK = ET | 'val' | 'entry';

// ---- op groups (name + arg spec). Arg kinds: e elem, i index, L list, p pred, f elem fn, c comparator,
// n small int, b bool, k key, v value, M map literal, kf key fn, bf bi fn, mop merge op, vp value pred, vf value fn, seed,
// it/lit/mit/spl/enm iteration programs
const COLL = ['add e', 'remove e', 'contains e', 'size', 'isEmpty', 'clear', 'addAll L', 'removeAll L', 'retainAll L', 'containsAll L',
  'removeIf p', 'toArray', 'iterRemove p', 'hashCode', 'frequency e', 'min', 'max', 'minCmp c', 'maxCmp c', 'disjoint L', 'collAddAll L',
  'streamCount p', 'streamList', 'equalsCopy', 'equalsL L', 'add e', 'add e', 'remove e', 'itw it', 'itw it', 'splw spl', 'forEachLog',
  'toArrayGen', 'parStream', 'clist', 'enumw enm', 'streamSorted c'];
const SEQ = ['addFirst e', 'addLast e', 'getFirst', 'getLast', 'removeFirst', 'removeLast', 'reversed'];
const LIST = ['get i', 'set i e', 'addAt i e', 'removeAt i', 'indexOf e', 'lastIndexOf e', 'subList i i', 'subListClear i i', 'subListAdd i i e',
  'addAllAt i L', 'replaceAll f', 'sort c', 'listIterAdd i e', 'listIterRev i', 'listIterSet p f', 'reverse', 'rotate n', 'swap i i',
  'shuffle seed', 'sortBsearch e', 'bsearchCmp e c', 'fill e', 'indexOfSubList L', 'lastIndexOfSubList L', 'nCopiesAddAll n e', 'iterCme e',
  'subListCme i i e', 'litw i lit', 'litw i lit', 'ccopyFrom L', 'creplaceAll e e', 'isRA'];
const STACK = ['push e', 'pop', 'peek', 'empty', 'search e'];
const VECTOR = ['elementAt i', 'firstElement', 'lastElement', 'addElement e', 'removeElementAt i', 'insertElementAt e i', 'removeElement e',
  'setElementAt e i', 'setSize n', 'capacity', 'copyInto', 'removeAllElements', 'ensureCapacity n', 'trimToSize', 'enumw enm'];
const QUEUE = ['offer e', 'poll', 'peek', 'element', 'removeHead'];
const DEQUE = ['offerFirst e', 'offerLast e', 'pollFirst', 'pollLast', 'peekFirst', 'peekLast', 'push e', 'pop', 'removeFirstOccurrence e',
  'removeLastOccurrence e', 'descIter', 'ditw it'];
const SORTEDSET = ['first', 'last', 'headSetPlain e', 'tailSetPlain e', 'subSetPlain e e', 'cmpProbe e e'];
const NAVSET = ['lower e', 'floor e', 'ceiling e', 'higher e', 'pollFirst', 'pollLast', 'headSet e b', 'tailSet e b',
  'subSet e b e b', 'descendingSet', 'descIter', 'headSetClear e', 'subSetAdd e e e', 'descSetPollFirst', 'ditw it'];
const MAPOPS = ['put k v', 'put k v', 'put k v', 'get k', 'removeKey k', 'remove2 k v', 'containsKey k', 'containsValue v', 'getOrDefault k v',
  'putIfAbsent k v', 'replace k v', 'replace3 k v v', 'computeIfAbsent k kf', 'computeIfPresent k bf', 'compute k bf', 'merge k v mop',
  'mreplaceAll bf', 'size', 'isEmpty', 'clear', 'keySet', 'values', 'entrySet', 'putAll M', 'keySetRemove k', 'valuesRemove v',
  'entryRemoveIf vp', 'keySetRetainAll L', 'hashCode', 'equalsCopy', 'iterSetValue vf', 'entrySetContains k v', 'mforEach', 'mitw mit',
  'mitw mit'];
const SEQMAP = ['firstEntry', 'lastEntry', 'pollFirstEntry', 'pollLastEntry', 'putFirst k v', 'putLast k v', 'reversed', 'mapIterCme k v',
  'sequencedKeySet', 'sequencedValues', 'sequencedEntrySet'];
const SORTEDMAP = ['firstKey', 'lastKey', 'headMapPlain k', 'tailMapPlain k', 'subMapPlain k k', 'cmpProbe k k'];
const NAVMAP = ['lowerKey k', 'floorKey k', 'ceilingKey k', 'higherKey k', 'lowerEntry k', 'floorEntry k',
  'ceilingEntry k', 'higherEntry k', 'headMap k b', 'tailMap k b', 'subMap k b k b', 'descendingMap', 'descendingKeySet', 'headMapClear k',
  'subMapPut k k k v', 'navigableKeySet'];

/** Interface kinds of targets and views, and the op groups they get. */
type Kind = 'C' | 'SC' | 'L' | 'LD' | 'Q' | 'D' | 'S' | 'SS' | 'SOS' | 'NS' | 'M' | 'SM' | 'SOM' | 'NM';
const KIND_OPS: Record<Kind, string[]> = {
  C: COLL,
  SC: [...COLL, ...SEQ],
  L: [...COLL, ...SEQ, ...LIST],
  LD: [...COLL, ...SEQ, ...LIST, ...QUEUE, ...DEQUE],
  Q: [...COLL, ...QUEUE],
  D: [...COLL, ...SEQ, ...QUEUE, ...DEQUE],
  S: COLL,
  SS: [...COLL, ...SEQ],
  SOS: [...COLL, ...SEQ, ...SORTEDSET],
  NS: [...COLL, ...SEQ, ...SORTEDSET, ...NAVSET],
  M: MAPOPS,
  SM: [...MAPOPS, ...SEQMAP],
  SOM: [...MAPOPS, ...SEQMAP, ...SORTEDMAP],
  NM: [...MAPOPS, ...SEQMAP, ...SORTEDMAP, ...NAVMAP],
};
/** Kinds whose reference equals/hashCode are identity-based (Collection/Queue/Deque views and wrappers): no hashCode. */
const IDENTITY_HASH: Kind[] = ['C', 'SC', 'Q', 'D'];
const isMapKind = (k: Kind) => k === 'M' || k === 'SM' || k === 'SOM' || k === 'NM';

/** A view: path segment pattern ({e} elem, {b} bool, {i} index, {T} type tag), resulting kind, element kind. */
type View = [string, Kind, ('key' | 'val' | 'entry')?];

interface BaseDef {
  kind: Kind;
  types: ET[];
  nulls: boolean;
  extra?: string[];
  views?: View[];
  /** fixed init size (singletons) */
  initMax?: number;
  noHash?: boolean;
  /** ops removed (IdentityHashMap) */
  without?: string[];
}

const LIST_VIEWS: View[] = [['subList:{i}:{i}', 'L'], ['reversed', 'L'], ['subList:{i}:{i}/reversed', 'L'], ['reversed/subList:{i}:{i}', 'L']];
const NAVSET_VIEWS: View[] = [['descendingSet', 'NS'], ['headSet:{e}:{b}', 'NS'], ['tailSet:{e}:{b}', 'NS'], ['subSet:{e}:{b}:{e}:{b}', 'NS'],
  ['headSetPlain:{e}', 'SOS'], ['tailSetPlain:{e}', 'SOS'], ['subSetPlain:{e}:{e}', 'SOS'], ['reversed', 'NS'], ['unmodifiableSortedSet', 'SOS'],
  ['unmodifiableNavigableSet', 'NS'], ['synchronizedSortedSet', 'SOS'], ['synchronizedNavigableSet', 'NS'], ['checkedSortedSet:{T}', 'SOS'],
  ['checkedNavigableSet:{T}', 'NS'], ['descendingSet/headSet:{e}:{b}', 'NS'], ['unmodifiableSet', 'S'], ['unmodifiableSequencedSet', 'SS']];
const MAP_VIEWS: View[] = [['keySet', 'S', 'key'], ['values', 'C', 'val'], ['entrySet', 'S', 'entry'], ['unmodifiableMap', 'M'],
  ['synchronizedMap', 'M'], ['checkedMap:{T}', 'M'], ['newSetFromMap', 'S', 'key']];
const SEQMAP_VIEWS: View[] = [...MAP_VIEWS, ['sequencedKeySet', 'SS', 'key'], ['sequencedValues', 'SC', 'val'], ['sequencedEntrySet', 'SS', 'entry'],
  ['reversed', 'SM'], ['unmodifiableSequencedMap', 'SM'], ['newSequencedSetFromMap', 'SS', 'key']];
const NAVMAP_VIEWS: View[] = [...SEQMAP_VIEWS.filter((v) => v[0] !== 'newSequencedSetFromMap' && v[0] !== 'reversed' && v[0] !== 'unmodifiableSequencedMap'),
  ['reversed', 'NM'], ['navigableKeySet', 'NS', 'key'], ['descendingKeySet', 'NS', 'key'], ['descendingMap', 'NM'], ['headMap:{e}:{b}', 'NM'],
  ['tailMap:{e}:{b}', 'NM'], ['subMap:{e}:{b}:{e}:{b}', 'NM'], ['headMapPlain:{e}', 'SOM'], ['tailMapPlain:{e}', 'SOM'],
  ['subMapPlain:{e}:{e}', 'SOM'], ['unmodifiableSortedMap', 'SOM'], ['unmodifiableNavigableMap', 'NM'], ['synchronizedSortedMap', 'SOM'],
  ['synchronizedNavigableMap', 'NM'], ['checkedSortedMap:{T}', 'SOM'], ['checkedNavigableMap:{T}', 'NM'], ['unmodifiableSequencedMap', 'SM'],
  ['descendingMap/navigableKeySet', 'NS', 'key'], ['descendingMap/headMap:{e}:{b}', 'NM'], ['headMap:{e}:{b}/entrySet', 'S', 'entry']];
const BOTH: ET[] = ['int', 'str'];
const CLONE = ['cloneEq', 'cloneEq'];
const IDENTITY_EXCLUDED = ['hashCode', 'mitw'];

export const BASES: Record<string, BaseDef> = {
  ArrayList: { kind: 'L', types: BOTH, nulls: true, extra: [...CLONE, 'ensureCapacity n', 'trimToSize'],
    views: [...LIST_VIEWS, ['unmodifiableList', 'L'], ['unmodifiableCollection', 'C'], ['unmodifiableSequencedCollection', 'SC'],
      ['synchronizedList', 'L'], ['synchronizedCollection', 'C'], ['checkedList:{T}', 'L'], ['checkedCollection:{T}', 'C']] },
  LinkedList: { kind: 'LD', types: BOTH, nulls: true, extra: CLONE,
    views: [['subList:{i}:{i}', 'L'], ['reversed', 'LD'], ['asLifoQueue', 'Q'], ['checkedQueue:{T}', 'Q'], ['unmodifiableList', 'L'], ['synchronizedList', 'L']] },
  Vector: { kind: 'L', types: BOTH, nulls: true, extra: [...CLONE, ...VECTOR], views: [...LIST_VIEWS, ['synchronizedList', 'L']] },
  VectorCap: { kind: 'L', types: BOTH, nulls: true, extra: [...VECTOR, ...VECTOR] },
  Stack: { kind: 'L', types: BOTH, nulls: true, extra: [...CLONE, ...VECTOR, ...STACK, ...STACK], views: LIST_VIEWS },
  UnmodList: { kind: 'L', types: BOTH, nulls: true, views: LIST_VIEWS },
  ListOf: { kind: 'L', types: BOTH, nulls: false, views: LIST_VIEWS },
  ListCopyOf: { kind: 'L', types: BOTH, nulls: false, views: LIST_VIEWS },
  EmptyList: { kind: 'L', types: BOTH, nulls: false, initMax: 0 },
  EmptyListConst: { kind: 'L', types: BOTH, nulls: false, initMax: 0 },
  SingletonList: { kind: 'L', types: BOTH, nulls: true, initMax: 1 },
  NCopies: { kind: 'L', types: BOTH, nulls: true, views: LIST_VIEWS },
  AbsList: { kind: 'L', types: BOTH, nulls: true, views: LIST_VIEWS },
  AbsSeqList: { kind: 'L', types: BOTH, nulls: true, views: LIST_VIEWS },
  ArrayDeque: { kind: 'D', types: BOTH, nulls: false, extra: CLONE,
    views: [['reversed', 'D'], ['asLifoQueue', 'Q'], ['checkedQueue:{T}', 'Q'], ['unmodifiableSequencedCollection', 'SC'], ['synchronizedCollection', 'C']] },
  PriorityQueue: { kind: 'Q', types: BOTH, nulls: false, extra: ['pollAll', 'cmpProbe e e'],
    views: [['checkedQueue:{T}', 'Q'], ['unmodifiableCollection', 'C'], ['synchronizedCollection', 'C']] },
  PriorityQueueRev: { kind: 'Q', types: BOTH, nulls: false, extra: ['pollAll', 'cmpProbe e e'] },
  AbsQueue: { kind: 'Q', types: BOTH, nulls: false },
  AbsColl: { kind: 'C', types: BOTH, nulls: true },
  HashSet: { kind: 'S', types: BOTH, nulls: true, extra: CLONE, views: [['unmodifiableSet', 'S'], ['synchronizedSet', 'S'], ['checkedSet:{T}', 'S']] },
  LinkedHashSet: { kind: 'SS', types: BOTH, nulls: true, extra: CLONE,
    views: [['reversed', 'SS'], ['unmodifiableSequencedSet', 'SS'], ['unmodifiableSet', 'S'], ['checkedSet:{T}', 'S']] },
  TreeSet: { kind: 'NS', types: BOTH, nulls: false, extra: CLONE, views: NAVSET_VIEWS },
  TreeSetRev: { kind: 'NS', types: BOTH, nulls: false, extra: CLONE, views: NAVSET_VIEWS },
  TreeSetMod3: { kind: 'NS', types: ['int'], nulls: false, views: NAVSET_VIEWS },
  SetOf: { kind: 'S', types: BOTH, nulls: false },
  SetCopyOf: { kind: 'S', types: BOTH, nulls: false },
  EmptySet: { kind: 'S', types: BOTH, nulls: false, initMax: 0 },
  EmptySetConst: { kind: 'S', types: BOTH, nulls: false, initMax: 0 },
  EmptySortedSet: { kind: 'SOS', types: BOTH, nulls: false, initMax: 0 },
  EmptyNavigableSet: { kind: 'NS', types: BOTH, nulls: false, initMax: 0, views: [['descendingSet', 'NS'], ['headSet:{e}:{b}', 'NS']] },
  Singleton: { kind: 'S', types: BOTH, nulls: true, initMax: 1 },
  AbsSet: { kind: 'S', types: BOTH, nulls: true },
  HashMap: { kind: 'M', types: BOTH, nulls: true, extra: CLONE, views: MAP_VIEWS },
  LinkedHashMap: { kind: 'SM', types: BOTH, nulls: true, extra: CLONE, views: SEQMAP_VIEWS },
  LinkedHashMapAccess: { kind: 'SM', types: BOTH, nulls: true, extra: CLONE, views: SEQMAP_VIEWS },
  LinkedHashMapLru: { kind: 'SM', types: BOTH, nulls: true },
  TreeMap: { kind: 'NM', types: BOTH, nulls: false, extra: CLONE, views: NAVMAP_VIEWS },
  TreeMapRev: { kind: 'NM', types: BOTH, nulls: false, extra: CLONE, views: NAVMAP_VIEWS },
  IdentityHashMap: { kind: 'M', types: ['int'], nulls: true, extra: CLONE, without: IDENTITY_EXCLUDED, noHash: true,
    views: [['keySet', 'S', 'key'], ['values', 'C', 'val'], ['entrySet', 'S', 'entry']] },
  MapOf: { kind: 'M', types: BOTH, nulls: false, views: [['keySet', 'S', 'key'], ['values', 'C', 'val'], ['entrySet', 'S', 'entry']] },
  MapOfPairs: { kind: 'M', types: BOTH, nulls: false },
  MapCopyOf: { kind: 'M', types: BOTH, nulls: false },
  EmptyMap: { kind: 'M', types: BOTH, nulls: false, initMax: 0 },
  EmptyMapConst: { kind: 'M', types: BOTH, nulls: false, initMax: 0 },
  EmptySortedMap: { kind: 'SOM', types: BOTH, nulls: false, initMax: 0 },
  EmptyNavigableMap: { kind: 'NM', types: BOTH, nulls: false, initMax: 0, views: [['descendingMap', 'NM'], ['navigableKeySet', 'NS', 'key']] },
  SingletonMap: { kind: 'M', types: BOTH, nulls: true, initMax: 1 },
  AbsMap: { kind: 'M', types: BOTH, nulls: true },
};
/** Same as the runners' UNORDERED: printed sorted, and only total-order comparators are used. */
const UNORDERED = new Set(['PriorityQueue', 'PriorityQueueRev', 'HashSet', 'HashMap', 'IdentityHashMap', 'SetOf', 'MapOf', 'SetCopyOf',
  'MapCopyOf', 'MapOfPairs', 'AbsSet', 'EmptySet', 'EmptyMap', 'EmptySetConst', 'EmptyMapConst', 'Singleton', 'SingletonMap']);
// values().remove(v) removes the first of several equal values; iterRemove/iterSetValue interleave a function and a
// mutation, so whether the function's NullPointerException or the mutation's exception comes first depends on the order
const UNORDERED_EXCLUDED = ['valuesRemove', 'iterRemove', 'iterSetValue'];

/** Context of a collection script: everything arg generation needs. */
interface Ctx {
  identity?: boolean;
  t: ET;
  ek: EK;
  nulls: boolean;
  ordered: boolean;
}

/** Stream scripts are weighted like this many collection targets. */
const STREAM_WEIGHT = 25;
/** Misc scripts (statics, Optional, comparators, ...) */
const MISC_WEIGHT = 12;
export const ALL_TARGETS = [...Object.keys(BASES), 'Stream', 'Misc'];

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
  list(t: ET, nulls: boolean, max = 5, exact = false): string {
    const n = exact ? max : this.r.int(0, max);
    return '[' + Array.from({ length: n }, () => this.elem(t, nulls)).join(',') + ']';
  }
  value(nulls: boolean): string {
    return this.r.chance(nulls ? 0.06 : 0.015) ? 'null' : String(this.r.int(-3, 9));
  }
  mapLit(t: ET, nulls: boolean, max = 5, exact = false): string {
    const n = exact ? max : this.r.int(0, max);
    return '{' + Array.from({ length: n }, () => `${this.elem(t, nulls)}=${this.value(nulls)}`).join(',') + '}';
  }
  index(): string {
    return String(this.r.chance(0.85) ? this.r.int(0, 5) : this.r.int(-1, 10));
  }

  // ---------------- collection / map scripts
  script(id: string, type: string): Script {
    if (type === 'Stream') return this.streamScript(id);
    if (type === 'Misc') return this.miscScript(id);
    const r = this.r;
    const d = BASES[type];
    const t = r.pick(d.types);
    let kind = d.kind;
    let ek: EK = t;
    let path = type;
    const ordered = !UNORDERED.has(type);
    const ctx0: Ctx = { t, ek: t, nulls: d.nulls, ordered, identity: type === 'IdentityHashMap' };
    if (d.views && r.chance(0.55)) {
      const [pat, vk, vek] = r.pick(d.views);
      const seg = pat.replace(/\{(\w)\}/g, (_, x: string) => (x === 'e' ? this.elem(t, false) : x === 'b' ? String(r.chance(0.5)) : x === 'i' ? String(r.int(0, 4)) : t));
      path += '/' + seg;
      kind = vk;
      ek = vek === 'val' ? 'val' : vek === 'entry' ? 'entry' : t;
    }
    const ctx: Ctx = { t, ek, nulls: d.nulls, ordered, identity: type === 'IdentityHashMap' };
    const pre = /^\w+\/(newSetFromMap|newSequencedSetFromMap)$/.test(path);
    const max = d.initMax ?? (isMapKind(d.kind) ? 6 : 8);
    const lines = [isMapKind(d.kind) && !pre ? `init ${this.mapLit(t, d.nulls, max, max === 1)}` : `init ${this.list(t, d.nulls, max, max === 1)}`];
    let ops = [...KIND_OPS[kind]];
    if (path === type) ops.push(...(d.extra ?? []));
    ops.push('toStr');
    if (!ordered) ops = ops.filter((o) => !UNORDERED_EXCLUDED.includes(o.split(' ')[0]));
    // values view of a hashed map: remove(v) removes the first of several equal values (iteration-order dependent)
    if (!ordered && ek === 'val') ops = ops.filter((o) => o !== 'remove e');
    if (d.noHash || IDENTITY_HASH.includes(kind)) ops = ops.filter((o) => o !== 'hashCode');
    if (d.without) ops = ops.filter((o) => !d.without!.includes(o.split(' ')[0]));
    if (/checked/.test(path)) ops.push(isMapKind(kind) ? 'putOther k' : 'addOther e', isMapKind(kind) ? 'putOther k' : 'addOther e');
    const n = r.int(4, 18);
    for (let i = 0; i < n; i++) lines.push(this.op(r.pick(ops), ctx, ctx0));
    return { id, type: path, lines };
  }

  op(spec: string, c: Ctx, base: Ctx): string {
    const [name, ...args] = spec.split(' ');
    const out = [name];
    for (const a of args) out.push(this.arg(a, c, base));
    // subList ranges: mostly valid (from <= to), sometimes reversed to provoke the exception
    if (name.startsWith('subList') && Number(out[1]) > Number(out[2]) && this.r.chance(0.8)) [out[1], out[2]] = [out[2], out[1]];
    return out.join(' ');
  }

  /** An element of kind ek: base type, a map value, or an entry k=v. */
  elemOf(c: Ctx, nulls = c.nulls): string {
    if (c.ek === 'val') return this.value(nulls);
    if (c.ek === 'entry') return `${this.elem(c.t, false)}=${this.value(false)}`;
    return this.elem(c.ek, nulls);
  }
  listOf(c: Ctx): string {
    const n = this.r.int(0, 5);
    return '[' + Array.from({ length: n }, () => this.elemOf(c)).join(',') + ']';
  }

  prog(alphabet: string[], max = 6): string {
    const n = this.r.int(1, max);
    return Array.from({ length: n }, () => this.r.pick(alphabet)).join(',');
  }

  arg(a: string, c: Ctx, base: Ctx): string {
    const r = this.r;
    const ek = c.ek;
    switch (a) {
      case 'e': return this.elemOf(c);
      case 'k': return this.elem(base.t, base.nulls);
      case 'i': return this.index();
      case 'L': return this.listOf(c);
      case 'p': return r.pick(ek === 'entry' ? ['evenV', 'posV'] : PRED[ek === 'val' ? 'int' : ek]);
      case 'f': return c.nulls && r.chance(0.05) ? 'nullf' : r.pick(ek === 'str' ? STR_FN : INT_FN);
      // unordered targets: only total orders, otherwise min/max among ties depends on iteration order
      case 'c':
        if (r.chance(0.1)) return 'null';
        if (ek === 'entry') return r.pick(c.ordered ? ['byKey', 'byValue', 'byKeyRev', 'byValueRev'] : ['byKey', 'byKeyRev']);
        return r.pick(c.ordered ? CMP[ek === 'val' ? 'int' : ek] : ['nat', 'rev', 'nullsFirst', 'nullsLast']);
      case 'n': return String(r.int(-2, 6));
      case 'b': return String(r.chance(0.5));
      case 'v': return this.value(base.nulls);
      case 'M': return this.mapLit(base.t, base.nulls);
      case 'kf': return r.chance(0.2) ? 'nullf' : base.t === 'int' ? r.pick(['plus1', 'times2']) : 'len';
      // IdentityHashMap (int keys, identity = cached small ints): only value-bounded functions
      case 'bf': return r.pick(c.identity ? ['nullKV', 'kOnly'] : ['sumKV', 'nullKV', 'kOnly', 'vPlus1']);
      case 'mop': return r.pick(c.identity ? ['max', 'min', 'nullBi'] : ['add', 'max', 'min', 'nullBi']);
      case 'vp': return r.pick(['even', 'pos', 'gt3']);
      case 'vf': return r.pick(c.identity ? ['neg', 'mod3'] : ['plus1', 'times2', 'neg', 'mod3']);
      case 'seed': return String(r.int(0, 1000));
      // unordered targets: which element comes next is unspecified, so no remove after next (elements print as *)
      case 'it': return this.prog(c.ordered ? ['h', 'n', 'n', 'n', 'r', 'f'] : ['h', 'n', 'f']);
      case 'lit': return this.prog(['h', 'n', 'n', 'r', 'f', 'H', 'p', 'p', 'i', 'j', `s:${this.elemOf(c)}`, `a:${this.elemOf(c)}`], 8);
      case 'mit': {
        const which = r.pick(['k', 'v', 'e']);
        if (!c.ordered) return `${which} ${this.prog(['h', 'n', 'f'])}`;
        return `${which} ${this.prog(which === 'e' ? ['h', 'n', 'n', 'r', 'f', `v:${this.value(base.nulls)}`] : ['h', 'n', 'n', 'r', 'f'])}`;
      }
      // unordered: which elements a split hands off depends on the hash layout
      case 'spl': return this.prog(['t', 't', 'f', 'c', 'e', 'x', 'k', 'g', 's'], 7);
      case 'enm': return this.prog(['h', 'n', 'n', 'a']);
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
      'iof', 'iof', 'irange', 'irangeClosed', 'iiterate2', 'iiterate3', 'iconcat', 'lof', 'lrange', 'lrangeClosed', 'dof', 'dof',
      'sbuilderAcc', 'ibuilder', 'lbuilder', 'dbuilder', 'igenerate', 'lgenerate', 'dgenerate', 'literate2', 'literate3', 'diterate2',
      'diterate3', 'lconcat', 'dconcat', 'iempty', 'lempty', 'dempty', 'sstream', 'sstreamSup', 'sint', 'slong', 'sdouble']);
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
      case 'sbuilderAcc': parts.push(`sbuilderAcc ${this.list(t, true, 6)}`); ty = t; break;
      case 'ibuilder': case 'sint': parts.push(`${src} ${this.ints()}`); ty = 'I'; break;
      case 'lbuilder': case 'slong': parts.push(`${src} ${this.ints()}`); ty = 'L'; break;
      case 'dbuilder': case 'sdouble': parts.push(`${src} ${this.dbls()}`); ty = 'D'; break;
      case 'igenerate': parts.push(`igenerate ${this.intv()}`); ty = 'I'; needLimit = true; break;
      case 'lgenerate': parts.push(`lgenerate ${this.intv()}`); ty = 'L'; needLimit = true; break;
      case 'dgenerate': parts.push(`dgenerate ${r.int(0, 9)}.5`); ty = 'D'; needLimit = true; break;
      case 'literate2': parts.push(`literate2 ${r.int(-3, 5)} ${r.pick(['plus1', 'times2', 'neg', 'mod3'])}`); ty = 'L'; needLimit = true; break;
      case 'literate3': parts.push(r.chance(0.5) ? `literate3 ${r.int(-5, 9)} lt10 plus1` : `literate3 ${r.int(1, 5)} lt10 times2`); ty = 'L'; break;
      case 'diterate2': parts.push(`diterate2 ${r.int(0, 5)}.5 ${r.pick(['plus1', 'times2', 'half', 'third'])}`); ty = 'D'; needLimit = true; break;
      case 'diterate3': parts.push(`diterate3 ${r.int(0, 5)}.5 lt10 ${r.pick(['plus1', 'times2'])}`); ty = 'D'; break;
      case 'lconcat': parts.push(`lconcat ${this.ints()} ${this.ints()}`); ty = 'L'; break;
      case 'dconcat': parts.push(`dconcat ${this.dbls()} ${this.dbls()}`); ty = 'D'; break;
      case 'iempty': parts.push('iempty'); ty = 'I'; break;
      case 'lempty': parts.push('lempty'); ty = 'L'; break;
      case 'dempty': parts.push('dempty'); ty = 'D'; break;
      case 'sstream': case 'sstreamSup': {
        const k = r.pick(['ArrayList', 'LinkedList', 'ArrayDeque', 'TreeSet', 'LinkedHashSet', 'Vector']);
        parts.push(`${src} ${k} ${this.list(t, k !== 'ArrayDeque' && k !== 'TreeSet', 7)}`); ty = t; break;
      }
      default: parts.push(`dof ${this.dbls()}`); ty = 'D'; break;
    }
    if (needLimit) parts.push(`limit ${r.int(0, 7)}`);
    const nStages = r.int(0, 4);
    const types = new Set<string>([ty]);
    for (let i = 0; i < nStages; i++) {
      const [s, nt] = this.stage(ty);
      parts.push(s);
      ty = nt;
      types.add(ty);
    }
    if (r.chance(0.06)) parts.push(`onClose h${r.int(1, 3)}`, ...(r.chance(0.5) ? [`onClose h${r.int(4, 6)}`] : []));
    if (r.chance(0.05)) parts.splice(r.int(1, parts.length), 0, 'sequential');
    // parallel: only integer/string element types (double sums are order-sensitive), no peek, deterministic terminals
    // (not on infinite sources: a parallel limit buffers ahead; not with nulls: which element throws first differs)
    if (r.chance(0.07) && !types.has('dbl') && !parts.includes('peek') && !needLimit && !parts.join(' ').includes('null')) {
      parts.splice(r.int(1, parts.length), 0, 'parallel');
      parts.push(types.has('D') ? this.parallelTerminalD(ty) : this.parallelTerminal(ty));
      return 'pipe ' + parts.join(' | ');
    }
    // unordered: only right before order-insensitive terminals
    if (r.chance(0.05) && (ty === 'I' || ty === 'L' || ty === 'D' || ty === 'int')) {
      parts.push('unordered', r.pick(['count', `anyMatch ${r.pick(ty === 'D' ? PRED.dbl : PRED.int)}`, ...(ty === 'int' ? ['collect toSet', 'collect counting'] : ty === 'D' ? ['min', 'max'] : ['sum', 'min', 'max'])]));
      return 'pipe ' + parts.join(' | ');
    }
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
        [`gather windowFixed ${r.int(0, 4)}`, 'listI'], [`gather windowSliding ${r.int(0, 4)}`, 'listI'],
        [`gather custom ${r.pick(['dedupe', 'takeN2', 'sumAll', 'rejecting', 'doubler', 'defaults', 'indexed', 'mapConc'])}`, 'int'],
        [`gather custom ${r.pick(['pairs', 'andThen'])}`, 'listI'],
        [`flatMapToInt ${r.pick(['dup', 'nullS'])}`, 'I'], [`flatMapToLong ${r.pick(['dup', 'nullS'])}`, 'L'], [`flatMapToDouble ${r.pick(['dup', 'nullS'])}`, 'D'],
        ['mapMultiToInt dup', 'I'], ['mapMultiToLong dup', 'L'], ['mapMultiToDouble dup', 'D']);
    } else if (ty === 'str') {
      opts.push([`map ${r.pick(STR_FN)}`, 'str'], ['map len', 'int'], ['mapToInt len', 'I'], [`flatMap ${r.pick(['dup', 'chars', 'nullS'])}`, 'str'],
        ['mapMulti dup', 'str'], [`gather ${r.pick(['fold', 'scan'])} '${r.pick(STRS)} concat`, 'str'],
        [`gather windowFixed ${r.int(0, 4)}`, 'listS'], [`gather windowSliding ${r.int(0, 4)}`, 'listS'],
        [`gather custom ${r.pick(['dedupe', 'takeN2', 'rejecting', 'defaults'])}`, 'str'], ['gather custom pairs', 'listS'],
        [`flatMapToInt ${r.pick(['dup', 'nullS'])}`, 'I'], ['flatMapToLong dup', 'L'], ['flatMapToDouble dup', 'D'], ['mapMultiToInt dup', 'I'],
        ['mapMultiToLong dup', 'L'], ['mapMultiToDouble dup', 'D']);
    } else {
      opts.push([`map ${r.pick(DBL_FN)}`, 'dbl'], ['mapToDouble id', 'D'], ['mapToInt trunc', 'I'], [`mapMulti ${r.pick(['dup', 'evenTwice'])}`, 'dbl'],
        [`gather ${r.pick(['fold', 'scan'])} 0.0 ${r.pick(BINOP.dbl)}`, 'dbl'], ['flatMapToDouble dup', 'D'], ['mapMultiToDouble dup', 'D']);
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
        'statsStr', 'findFirstStr', 'averageStr', 'collect3', 'isParallelT', 'closeNow', `splwT ${this.prog(['t', 'f', 'c', 'e', 'x', 'k', 's'], 5)}`,
        `primIter ${this.prog(['h', 'n', 'n', 'N', 'f', 'r'], 5)}`, 'forEachOrdered']);
    }
    const base = ['toList', 'toArray', 'count', 'findFirst', 'findAny', 'forEach', 'forEachOrdered', 'iterator', 'toArrayGen', 'collect3',
      'isParallelT', 'closeNow', `splwT ${this.prog(['t', 'f', 'c', 'e', 'x', 'k', 's'], 5)}`, `iterT ${this.prog(['h', 'n', 'n', 'f'], 5)}`,
      `anyMatch ${r.pick(PRED[ty])}`, `allMatch ${r.pick(PRED[ty])}`, `noneMatch ${r.pick(PRED[ty])}`];
    if (ty === 'listI' || ty === 'listS') return r.pick([...base, `collect ${this.collector(ty, 2)}`]);
    // toString formats: not for doubles (a JS number cannot tell 1.0 from 1)
    if (ty === 'int' || ty === 'str') base.push('toListStr', 'findFirstStr');
    const op = r.pick(BINOP[ty]);
    const id = ty === 'str' ? "'" + r.pick(STRS) : String(r.int(-2, 3));
    return r.pick([...base, `min ${r.pick(CMP[ty])}`, `max ${r.pick(CMP[ty])}`, `reduce1 ${op}`, `reduce2 ${id} ${op}`, `reduce3 ${id} ${op}`,
      `collect ${this.collector(ty, 2)}`, `collect ${this.collector(ty, 2)}`, `collect ${this.collector(ty, 2)}`]);
  }

  /** Parallel terminals for pipelines that went through doubles: no sums/averages (summation order). */
  parallelTerminalD(ty: string): string {
    const r = this.r;
    if (ty === 'D') return r.pick(['count', 'min', 'max', 'toArray', 'boxedList', `anyMatch ${r.pick(PRED.dbl)}`, 'findFirst', 'isParallelT']);
    if (ty === 'I' || ty === 'L') return r.pick(['count', 'min', 'max', 'toArray', 'findFirst', 'isParallelT']);
    return r.pick(['toList', 'count', 'findFirst', 'isParallelT']);
  }

  /** Terminals whose result is deterministic under parallel execution (associative ops, encounter order kept). */
  parallelTerminal(ty: string): string {
    const r = this.r;
    if (ty === 'I' || ty === 'L')
      return r.pick(['sum', 'count', 'min', 'max', 'toArray', 'boxedList', `anyMatch ${r.pick(PRED.int)}`, `reduce1 ${r.pick(BINOP.int)}`, 'collect3',
        'isParallelT', 'summaryStatistics', 'findFirst']);
    if (ty === 'listI' || ty === 'listS') return r.pick(['toList', 'count', 'findFirst', 'isParallelT']);
    const P = PRED[ty];
    const colls = ty === 'int' ? ['toList', 'toSet', 'counting', 'toTreeSet', 'groupingBy1 mod3', `partitioningBy1 ${r.pick(P)}`, 'summingInt id']
      : ['toList', 'toSet', 'counting', 'toTreeSet', 'joining', 'groupingBy1 len'];
    return r.pick(['toList', 'toArray', 'count', 'findFirst', `anyMatch ${r.pick(P)}`, `allMatch ${r.pick(P)}`, `noneMatch ${r.pick(P)}`,
      `min ${r.pick(CMP[ty])}`, `max ${r.pick(CMP[ty])}`, `reduce1 ${r.pick(BINOP[ty])}`, `collect ${r.pick(colls)}`, 'isParallelT', 'toArrayGen', 'collect3']);
  }

  // ---------------- misc scripts: statics, Optional, comparators, entries, spliterators, collectors/gatherers by hand
  miscScript(id: string): Script {
    const n = this.r.int(3, 10);
    return { id, type: 'Misc', lines: Array.from({ length: n }, () => 'x ' + this.misc()) };
  }

  cexpr(t: ET, depth: number): string {
    const r = this.r;
    const keys = t === 'int' ? ['mod3', 'abs', 'neg', 'id', 'sign'] : ['len', 'first', 'rev', 'upper', 'id'];
    const num = t === 'int' ? ['mod3', 'abs', 'neg', 'id'] : ['len'];
    const leaf = () => r.pick(['nat', 'rev', 'natCmp', 'crev0', `named ${r.pick(CMP[t])}`, `comparing ${r.pick(keys)}`, `comparingInt ${r.pick(num)}`,
      `comparingLong ${r.pick(num)}`, `comparingDouble ${t === 'int' ? 'half' : 'len'}`]);
    if (depth <= 0 || r.chance(0.35)) return leaf();
    const sub = () => this.cexpr(t, depth - 1);
    // comparingC / thenByC compare the extracted keys: the sub-comparator works on the key type
    const keyed = () => { const k = r.pick(keys); return `${k} ${this.cexpr(k === 'len' ? 'int' : t, depth - 1)}`; };
    return r.pick([`revOf ${sub()}`, `crev ${sub()}`, `comparingC ${keyed()}`, `then ${sub()} ${sub()}`, `thenBy ${sub()} ${r.pick(keys)}`,
      `thenByC ${sub()} ${keyed()}`, `thenInt ${sub()} ${r.pick(num)}`, `thenLong ${sub()} ${r.pick(num)}`,
      `thenDouble ${sub()} ${t === 'int' ? 'half' : 'len'}`, `nullsFirst ${sub()}`, `nullsLast ${sub()}`]);
  }

  chars(): string {
    const names = ['ORDERED', 'DISTINCT', 'SORTED', 'SIZED', 'NONNULL', 'IMMUTABLE', 'CONCURRENT', 'SUBSIZED'];
    const pick = names.filter(() => this.r.chance(0.25));
    return pick.length === 0 ? '0' : pick.join('+');
  }

  splSrc(): string {
    const r = this.r;
    const l = this.ints(6);
    return r.pick([`array ${l} ${this.chars()}`, `arrayRange ${l} ${r.int(-1, 3)} ${r.int(0, 7)} ${this.chars()}`, `coll ${l} ${this.chars()}`,
      `iterSized ${l} ${r.int(0, 7)} ${this.chars()}`, `unknown ${l} ${this.chars()}`, 'empty', 'emptyInt', 'emptyLong', 'emptyDouble', `abs ${l}`, `absInt ${l}`, `absLong ${l}`, `absDouble ${l}`]);
  }

  misc(): string {
    const r = this.r;
    const t: ET = r.chance(0.65) ? 'int' : 'str';
    const e = () => this.elem(t, true);
    const L = () => this.list(t, true);
    const lst = L();
    switch (r.int(0, 21)) {
      case 0: return r.pick([`oeq ${e()} ${e()}`, `ohash ${e()}`, `ohashv ${L()}`, `oreq ${e()}`, `oreqm ${e()}`, `oreqs ${e()}`, `oisnull ${e()}`,
        `ononnull ${e()}`, `ostr ${e()}`, `ostr2 ${e()} 'dflt`, `oelse ${e()} ${e()}`, `oelseget ${e()} ${e()}`]);
      case 1: return r.pick([`ochk ${r.int(-1, 5)} ${r.int(0, 5)}`, `ochkft ${r.int(-1, 4)} ${r.int(-1, 6)} ${r.int(0, 5)}`,
        `ochkfs ${r.int(-1, 4)} ${r.int(-1, 4)} ${r.int(0, 5)}`, `ocmp ${e()} ${e()} ${this.cexpr(t, 2)}`, `odeq ${lst} ${r.chance(0.5) ? lst : L()}`]);
      case 2: case 3: case 4: return `csort ${this.list(t, r.chance(0.2), 7)} ${this.cexpr(t, 3)}`;
      case 5: return `capply ${e()} ${e()} ${this.cexpr(t, 3)}`;
      case 6: return r.pick(['splconst', 'collchars', 'cconst', `newHash ${r.pick(['HashMap', 'LinkedHashMap', 'LinkedHashMapH', 'HashSet', 'LinkedHashSet', 'LinkedHashSetH'])} ${r.int(-1, 5)}`]);
      case 7: return r.pick([`cemptyIter ${this.prog(['h', 'n', 'r', 'f'], 3)}`, `cemptyListIter ${this.prog(['h', 'n', 'H', 'p', 'i', 'j', 'r', 'f', 's:1', 'a:1'], 3)}`,
        `cemptyEnum ${this.prog(['h', 'n', 'a'], 3)}`, `cenum ${lst} ${this.prog(['h', 'n', 'n', 'a'], 4)}`]);
      case 8: case 9: return `spl ${this.splSrc()} | ${this.prog(['t', 't', 'f', 'c', 'e', 'x', 'k', 'g', 's'], 7)}`;
      case 10: return `spit ${this.splSrc()} | ${this.prog(['h', 'n', 'n', 'f', 'r'], 5)}`;
      case 11: case 12: return `coll ${r.chance(0.2) ? r.pick(['collectorOf', 'collectorOfF']) : this.collector('int', 1)} ${this.list('int', r.chance(0.1), 6)}`;
      case 13: return `gath ${r.pick([`fold ${this.intv()} add`, `scan ${this.intv()} max`, `windowFixed ${r.int(0, 3)}`, `windowSliding ${r.int(0, 3)}`,
        `custom ${r.pick(['dedupe', 'takeN2', 'sumAll', 'pairs', 'rejecting', 'doubler', 'defaults', 'indexed', 'andThen', 'mapConc'])}`])} ${this.ints(6)}`;
      case 14: case 15: case 16: {
        const kind = r.pick(['O', 'O', 'I', 'L', 'D']);
        const val = () => (kind === 'D' ? `${r.int(0, 9)}.5` : kind === 'O' && t === 'str' ? this.elem('str', false) : String(this.intv()));
        const src = r.chance(0.25) ? 'empty' : kind === 'O' && r.chance(0.5) ? `ofNullable ${r.chance(0.3) ? 'null' : val()}` : `of ${r.chance(0.04) ? 'null' : val()}`;
        const ops = ['get', 'isPresent', 'isEmpty', 'ifPresent', 'ifPresentOrElse', `orElse ${val()}`, `orElseGet ${val()}`, 'orElseThrow', 'orElseThrowS',
          'stream', `equals ${r.chance(0.3) ? 'empty' : val()}`, 'hashCode', 'toString'];
        if (kind === 'O') {
          const isInt = !(t === 'str');
          ops.push(`filter ${r.pick(PRED[isInt ? 'int' : 'str'])}`, `map ${r.pick(isInt ? INT_FN : STR_FN)}`, `or ${r.chance(0.2) ? 'null' : val()}`);
          if (isInt) ops.push(`flatMap ${r.pick(['some', 'none', 'nullO'])}`);
        }
        return `opt ${kind} ${src} | ${Array.from({ length: r.int(1, 5) }, () => r.pick(ops)).join(' | ')}`;
      }
      case 17: case 18: {
        const kind = r.pick(['I', 'L', 'D']);
        const v = () => (kind === 'D' ? `${r.int(-3, 9)}.5` : String(this.intv()));
        const ctor = r.chance(0.7) ? 'new' : `new4 ${r.int(-1, 3)} ${v()} ${v()} ${v()}`;
        const ops = [`accept ${v()}`, `accept ${v()}`, `combine [${Array.from({ length: r.int(0, 3) }, v).join(',')}]`, 'getCount', 'getSum', 'getMin',
          'getMax', 'getAverage', 'toString'];
        return `stats ${kind} ${ctor} | ${Array.from({ length: r.int(1, 7) }, () => r.pick(ops)).join(' | ')}`;
      }
      default: {
        const kind = r.pick(['simple', 'immutable', 'mapEntry', 'copyOf']);
        const ops = ['getKey', 'getValue', `setValue ${e()}`, `equals ${e()} ${e()}`, 'hashCode', 'toString'];
        return `entry ${kind} ${e()} ${e()} | ${Array.from({ length: r.int(1, 5) }, () => r.pick(ops)).join(' | ')}`;
      }
    }
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
        `toUnmodifiableMap2 ${r.pick(['id', 'mod3'])} id`, 'toDeque', 'averagingLong id', 'summarizingLong id', `groupingByConc1 ${r.pick(['mod3', 'even'])}`,
        `toConcMap2 ${r.pick(['id', 'mod3', 'abs'])} id`, `toConcMap3 ${r.pick(['mod3', 'even'])} id ${r.pick(BINOP.int)}`,
        `toConcMapTree ${r.pick(['mod3', 'even'])} id ${r.pick(BINOP.int)}`, `toUnmodifiableMap3 ${r.pick(['mod3', 'even'])} id ${r.pick(BINOP.int)}`,
        'collectorOf', 'collectorOfF');
    } else if (ty === 'str') {
      opts.push('toTreeSet', 'joining', 'joining', `joining3 ${r.pick(["'-", "';", "'"])} ${r.pick(["'<", "'"])} ${r.pick(["'>", "'"])}`,
        'summingInt len', 'averagingInt len', 'summarizingInt len', `minBy ${r.pick(CMP.str)}`, `maxBy ${r.pick(CMP.str)}`,
        'reducing1 concat', `reducing2 '${r.pick(STRS)} concat`, 'reducing3 0 len add', `joining1 ${r.pick(["'-", "';", "'"])}`, 'toDeque',
        'averagingLong len', 'summarizingLong len', 'groupingByConc1 len', 'toConcMap3 len id concat', 'toUnmodifiableMap3 first id concat', `toMap2 ${r.pick(['id', 'len', 'first'])} ${r.pick(['id', 'len'])}`,
        `toMap3 ${r.pick(['len', 'first'])} id concat`, `toMapTree ${r.pick(['len', 'first'])} id concat`, `toUnmodifiableMap2 ${r.pick(['id', 'len'])} len`);
    } else {
      opts.push('toTreeSet', 'summingDouble id', 'averagingDouble id', 'summarizingDouble id', `minBy ${r.pick(CMP.dbl)}`, `maxBy ${r.pick(CMP.dbl)}`,
        `reducing1 ${r.pick(BINOP.dbl)}`);
    }
    if (depth > 0) {
      const key = ty === 'int' ? r.pick(['mod3', 'even', 'sign', 'id', 'abs']) : ty === 'str' ? r.pick(['len', 'first', 'id']) : 'trunc';
      const [mf, mt] = ty === 'int' ? r.pick([['plus1', 'int'], ['mod3', 'int'], ['str', 'str'], ['half', 'dbl']])
        : ty === 'str' ? r.pick([['len', 'int'], ['upper', 'str']]) : r.pick([['half', 'dbl'], ['plus1', 'dbl']]);
      opts.push(`groupingByConc2 ${key} ${sub(ty)}`, `groupingByConcTree ${key} ${sub(ty)}`);
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
  const pool = targets ?? [...Object.keys(BASES), ...Array(STREAM_WEIGHT).fill('Stream'), ...Array(MISC_WEIGHT).fill('Misc')];
  return Array.from({ length: count }, (_, i) => g.script(`${seed}-${i}`, r.pick(pool)));
}
