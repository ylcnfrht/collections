// Workloads for the isolated benchmark, shared by the Docker runner (run-one.ts) and the docs site,
// which runs them in the reader's browser. Each workload has one dataset and one test loop, written
// once; implementations plug in through a small adapter. Adapters load their library through `load`,
// lazily, so a process or worker that runs one implementation never loads another (collections.js
// rewrites built-ins on load).
/* eslint-disable @typescript-eslint/no-explicit-any */

/** Loads a package by name; 'ours' is this library. Node passes require, the browser dynamic import. */
export type Load = (pkg: 'ours' | 'js-sdsl' | 'mnemonist/lru-map' | 'mnemonist/heap' | 'mnemonist/circular-buffer' | 'mnemonist/stack' | '@datastructures-js/priority-queue' | 'collections/fast-map' | 'collections/fast-set' | 'collections/lru-map' | 'collections/sorted-set' | 'collections/heap' | 'collections/deque' | 'collections/list' | 'collections/sorted-map') => Promise<any>;

export interface Workload {
  id: string;
  /** heading the workload is listed under */
  group: 'Lists' | 'Queues and stacks' | 'Sets' | 'Maps' | 'Streams';
  title: string;
  detail: string;
  /** implementation every other one is divided by in the report */
  baseline: string;
  /** operations one run of the test performs, to report operations per second */
  unit: { perRun: number; label: string };
  data(): any;
  impls: Record<string, (load: Load) => Promise<any>>;
  /** untimed: builds the structure a read-only test queries */
  prepare?(a: any, d: any): any;
  /** the timed test; returns a checksum that must be equal for every implementation */
  run(a: any, d: any, s: any): number;
}

/** Deterministic data: same seed, same numbers, in every container. */
function lcg(seed: number): () => number {
  let s = seed;
  return () => (s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff);
}

const N = 100_000;
const asc = (a: number, b: number) => a - b;

function lowerBound(a: number[], k: number): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (a[mid] < k) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// --- maps and sets -----------------------------------------------------------------------------

const intMap: Workload['impls'] = {
  '@nodestd/collections HashMap': async (load) => {
    const { HashMap } = await load('ours');
    return { create: () => new HashMap(), put: (m: any, k: any, v: any) => m.put(k, v), get: (m: any, k: any) => m.get(k), size: (m: any) => m.size() };
  },
  'native Map': async () => ({ create: () => new Map(), put: (m: any, k: any, v: any) => m.set(k, v), get: (m: any, k: any) => m.get(k), size: (m: any) => m.size }),
  'js-sdsl HashMap': async (load) => {
    const { HashMap } = await load('js-sdsl');
    return { create: () => new HashMap(), put: (m: any, k: any, v: any) => m.setElement(k, v), get: (m: any, k: any) => m.getElementByKey(k), size: (m: any) => m.size() };
  },
  'collections.js FastMap': async (load) => {
    const FastMap = await load('collections/fast-map');
    return { create: () => new FastMap(), put: (m: any, k: any, v: any) => m.set(k, v), get: (m: any, k: any) => m.get(k), size: (m: any) => m.length };
  },
};

const hashMapGetInt: Workload = {
  id: 'hashmap-get-int',
  group: 'Maps',
  title: 'HashMap.get',
  detail: '100k integer keys',
  baseline: 'native Map',
  unit: { perRun: 100000, label: 'get calls' },
  data: () => Array.from({ length: N }, (_, i) => i),
  impls: intMap,
  prepare(a, keys: number[]) {
    const m = a.create();
    for (let i = 0; i < keys.length; i++) a.put(m, keys[i], i);
    return m;
  },
  run(a, keys: number[], m) {
    let s = 0;
    for (let i = 0; i < keys.length; i++) s += a.get(m, keys[i]) ?? 0;
    return s;
  },
};

const hashMapPutString: Workload = {
  id: 'hashmap-put-string',
  group: 'Maps',
  title: 'HashMap.put',
  detail: '100k string keys',
  baseline: 'native Map',
  unit: { perRun: 100000, label: 'put calls' },
  data: () => Array.from({ length: N }, (_, i) => 'key' + i),
  impls: intMap,
  run(a, keys: string[]) {
    const m = a.create();
    for (let i = 0; i < keys.length; i++) a.put(m, keys[i], i);
    return a.size(m);
  },
};

const hashSetAddHas: Workload = {
  id: 'hashset-add-has-int',
  group: 'Sets',
  title: 'HashSet add + has',
  detail: '100k integers',
  baseline: 'native Set',
  unit: { perRun: 200000, label: 'add/has calls' },
  data: () => Array.from({ length: N }, (_, i) => i),
  impls: {
    '@nodestd/collections HashSet': async (load) => {
      const { HashSet } = await load('ours');
      return { create: () => new HashSet(), add: (s: any, x: any) => s.add(x), has: (s: any, x: any) => s.contains(x) };
    },
    'native Set': async () => ({ create: () => new Set(), add: (s: any, x: any) => s.add(x), has: (s: any, x: any) => s.has(x) }),
    'js-sdsl HashSet': async (load) => {
      const { HashSet } = await load('js-sdsl');
      return { create: () => new HashSet(), add: (s: any, x: any) => s.insert(x), has: (s: any, x: any) => !s.find(x).equals(s.end()) };
    },
    'collections.js FastSet': async (load) => {
      const FastSet = await load('collections/fast-set');
      return { create: () => new FastSet(), add: (s: any, x: any) => s.add(x), has: (s: any, x: any) => s.has(x) };
    },
  },
  run(a, xs: number[]) {
    const s = a.create();
    for (let i = 0; i < xs.length; i++) a.add(s, xs[i]);
    let c = 0;
    for (let i = 0; i < xs.length; i++) if (a.has(s, xs[i])) c++;
    return c;
  },
};

// 80% of lookups hit a hot set that fits the cache, 20% go to a large cold range
const LRU_CAP = 1000;
const lru: Workload = {
  id: 'lru-cache',
  group: 'Maps',
  title: 'LRU cache',
  detail: 'capacity 1k, 100k get-or-put',
  baseline: 'native Map delete + set',
  unit: { perRun: 100000, label: 'get-or-put calls' },
  data() {
    const r = lcg(1);
    const below = (n: number) => Math.floor((r() / 0x80000000) * n);
    return Array.from({ length: N }, () => (below(10) < 8 ? below(900) : 1000 + below(1_000_000)));
  },
  impls: {
    '@nodestd/collections LinkedHashMap.lru': async (load) => {
      const { LinkedHashMap } = await load('ours');
      return { create: (cap: number) => LinkedHashMap.lru(cap), get: (c: any, k: any) => c.get(k) ?? undefined, set: (c: any, k: any, v: any) => c.put(k, v) };
    },
    'native Map delete + set': async () => ({
      create: (cap: number) => ({ m: new Map(), cap }),
      get(c: any, k: any) {
        const v = c.m.get(k);
        if (v !== undefined) {
          c.m.delete(k);
          c.m.set(k, v);
        }
        return v;
      },
      set(c: any, k: any, v: any) {
        c.m.set(k, v);
        if (c.m.size > c.cap) c.m.delete(c.m.keys().next().value);
      },
    }),
    'mnemonist LRUMap': async (load) => {
      const LRUMap = await load('mnemonist/lru-map');
      return { create: (cap: number) => new LRUMap(cap), get: (c: any, k: any) => c.get(k), set: (c: any, k: any, v: any) => c.set(k, v) };
    },
    'collections.js LruMap': async (load) => {
      const LruMap = await load('collections/lru-map');
      return { create: (cap: number) => new LruMap(null, cap), get: (c: any, k: any) => c.get(k), set: (c: any, k: any, v: any) => c.set(k, v) };
    },
  },
  run(a, keys: number[]) {
    const c = a.create(LRU_CAP);
    let hits = 0;
    for (let i = 0; i < keys.length; i++) {
      if (a.get(c, keys[i]) !== undefined) hits++;
      else a.set(c, keys[i], i);
    }
    return hits;
  },
};

const treeFloorCeiling: Workload = {
  id: 'treemap-floor-ceiling',
  group: 'Maps',
  title: 'TreeMap floor + ceiling',
  detail: '100k keys, 100k queries',
  baseline: 'js-sdsl OrderedMap',
  unit: { perRun: 200000, label: 'floor/ceiling calls' },
  data() {
    const r = lcg(12345);
    const keys = Array.from({ length: N }, () => r() % 1_000_000);
    const queries = Array.from({ length: N }, () => r() % 1_000_000);
    return { keys, queries };
  },
  impls: {
    '@nodestd/collections TreeMap': async (load) => {
      const { TreeMap } = await load('ours');
      return {
        create: () => new TreeMap(),
        put: (m: any, k: number) => m.put(k, k),
        floor: (m: any, q: number) => m.floorKey(q) ?? 0,
        ceiling: (m: any, q: number) => m.ceilingKey(q) ?? 0,
      };
    },
    'js-sdsl OrderedMap': async (load) => {
      const { OrderedMap } = await load('js-sdsl');
      return {
        create: () => new OrderedMap([], asc),
        put: (m: any, k: number) => m.setElement(k, k),
        floor(m: any, q: number) {
          const it = m.reverseLowerBound(q);
          return it.equals(m.rEnd()) ? 0 : it.pointer[0];
        },
        ceiling(m: any, q: number) {
          const it = m.lowerBound(q);
          return it.equals(m.end()) ? 0 : it.pointer[0];
        },
      };
    },
    'collections.js SortedSet': async (load) => {
      const SortedSet = await load('collections/sorted-set');
      return {
        create: () => new SortedSet(),
        put: (s: any, k: number) => s.add(k),
        floor: (s: any, q: number) => s.findGreatestLessThanOrEqual(q)?.value ?? 0,
        ceiling: (s: any, q: number) => s.findLeastGreaterThanOrEqual(q)?.value ?? 0,
      };
    },
  },
  prepare(a, d) {
    const m = a.create();
    for (const k of d.keys) a.put(m, k);
    return m;
  },
  run(a, d, m) {
    let s = 0;
    for (let i = 0; i < d.queries.length; i++) s += a.floor(m, d.queries[i]) + a.ceiling(m, d.queries[i]);
    return s;
  },
};

// --- queues ----------------------------------------------------------------------------------

const PQ_SIZE = 1000;
const pqChurn: Workload = {
  id: 'priorityqueue-churn',
  group: 'Queues and stacks',
  title: 'PriorityQueue churn',
  detail: 'size 1k, 100k offer + poll',
  baseline: 'sorted array',
  unit: { perRun: 200000, label: 'offer/poll calls' },
  data() {
    const r = lcg(2);
    return Array.from({ length: N + PQ_SIZE }, () => r());
  },
  impls: {
    '@nodestd/collections PriorityQueue': async (load) => {
      const { PriorityQueue } = await load('ours');
      return { create: () => new PriorityQueue(), offer: (q: any, x: number) => q.offer(x), poll: (q: any) => q.poll() };
    },
    'js-sdsl PriorityQueue': async (load) => {
      const { PriorityQueue } = await load('js-sdsl');
      return { create: () => new PriorityQueue([], asc), offer: (q: any, x: number) => q.push(x), poll: (q: any) => q.pop() };
    },
    'mnemonist Heap': async (load) => {
      const Heap = await load('mnemonist/heap');
      return { create: () => new Heap(), offer: (q: any, x: number) => q.push(x), poll: (q: any) => q.pop() };
    },
    '@datastructures-js/priority-queue': async (load) => {
      const { MinPriorityQueue } = await load('@datastructures-js/priority-queue');
      return { create: () => new MinPriorityQueue(), offer: (q: any, x: number) => q.enqueue(x), poll: (q: any) => q.dequeue() };
    },
    'collections.js Heap': async (load) => {
      const Heap = await load('collections/heap');
      // a max-heap by default; the reversed comparator makes it a min-heap like the others
      return { create: () => new Heap([], null, (a: number, b: number) => b - a), offer: (q: any, x: number) => q.push(x), poll: (q: any) => q.pop() };
    },
    'sorted array': async () => ({
      create: () => [] as number[],
      offer(a: number[], v: number) {
        let lo = 0;
        let hi = a.length;
        while (lo < hi) {
          const m = (lo + hi) >>> 1;
          if (a[m] > v) lo = m + 1;
          else hi = m;
        }
        a.splice(lo, 0, v); // descending, so the minimum pops off the end
      },
      poll: (a: number[]) => a.pop(),
    }),
  },
  run(a, xs: number[]) {
    const q = a.create();
    for (let i = 0; i < PQ_SIZE; i++) a.offer(q, xs[i]);
    let s = 0;
    for (let i = PQ_SIZE; i < xs.length; i++) {
      a.offer(q, xs[i]);
      s += a.poll(q);
    }
    return s;
  },
};

const DQ_SIZE = 1000;
const dequeChurn: Workload = {
  id: 'deque-churn',
  group: 'Queues and stacks',
  title: 'ArrayDeque as a queue',
  detail: 'size 1k, 100k offer + poll',
  baseline: 'native Array push + shift',
  unit: { perRun: 200000, label: 'offer/poll calls' },
  data: () => Array.from({ length: N + DQ_SIZE }, (_, i) => i),
  impls: {
    '@nodestd/collections ArrayDeque': async (load) => {
      const { ArrayDeque } = await load('ours');
      return { create: () => new ArrayDeque(), offer: (d: any, x: number) => d.offer(x), poll: (d: any) => d.poll() };
    },
    'native Array push + shift': async () => ({ create: () => [] as number[], offer: (d: number[], x: number) => d.push(x), poll: (d: number[]) => d.shift() }),
    'js-sdsl Deque': async (load) => {
      const { Deque } = await load('js-sdsl');
      return { create: () => new Deque(), offer: (d: any, x: number) => d.pushBack(x), poll: (d: any) => d.popFront() };
    },
    'mnemonist CircularBuffer (fixed capacity)': async (load) => {
      const CircularBuffer = await load('mnemonist/circular-buffer');
      return { create: () => new CircularBuffer(Array, DQ_SIZE + 1), offer: (d: any, x: number) => d.push(x), poll: (d: any) => d.shift() };
    },
    'collections.js Deque': async (load) => {
      const Deque = await load('collections/deque');
      return { create: () => new Deque(), offer: (d: any, x: number) => d.push(x), poll: (d: any) => d.shift() };
    },
  },
  run(a, xs: number[]) {
    const d = a.create();
    for (let i = 0; i < DQ_SIZE; i++) a.offer(d, xs[i]);
    let s = 0;
    for (let i = DQ_SIZE; i < xs.length; i++) {
      a.offer(d, xs[i]);
      s += a.poll(d);
    }
    return s;
  },
};

// --- streams ---------------------------------------------------------------------------------

const even = (x: number) => (x & 1) === 0;
const triple = (x: number) => x * 3;
const add = (a: number, b: number) => a + b;
const streamSum: Workload = {
  id: 'stream-filter-map-sum',
  group: 'Streams',
  title: 'Stream filter → map → sum',
  detail: '100k numbers',
  baseline: 'native Array filter/map/reduce',
  unit: { perRun: 100000, label: 'elements' },
  data() {
    const r = lcg(12345);
    return Array.from({ length: N }, () => r() % 1000);
  },
  impls: {
    '@nodestd/collections Stream': async (load) => {
      const { Stream } = await load('ours');
      return { sum: (xs: number[]) => Stream.ofArray(xs).filter(even).map(triple).reduce(0, add) };
    },
    '@nodestd/collections IntStream': async (load) => {
      const { IntStream } = await load('ours');
      return { sum: (xs: number[]) => IntStream.ofArray(xs).filter(even).map(triple).sum() };
    },
    'native Array filter/map/reduce': async () => ({ sum: (xs: number[]) => xs.filter(even).map(triple).reduce(add, 0) }),
    'native Iterator helpers': async () => ({ sum: (xs: number[]) => (xs.values() as any).filter(even).map(triple).reduce(add, 0) }),
  },
  run: (a, xs: number[]) => a.sum(xs),
};


// --- added workloads: lists, stacks, ordered and sorted sets and maps, value keys ---------------

const listAddGet: Workload = {
  id: 'arraylist-add-get',
  group: 'Lists',
  title: 'ArrayList add + get',
  detail: '100k appends, 100k indexed reads',
  baseline: 'native Array',
  unit: { perRun: 200_000, label: 'add/get calls' },
  data: () => Array.from({ length: N }, (_, i) => i),
  impls: {
    '@nodestd/collections ArrayList': async (load) => {
      const { ArrayList } = await load('ours');
      return { create: () => new ArrayList(), add: (l: any, x: number) => l.add(x), get: (l: any, i: number) => l.get(i) };
    },
    'native Array': async () => ({ create: () => [] as number[], add: (l: number[], x: number) => l.push(x), get: (l: number[], i: number) => l[i] }),
    'js-sdsl Vector': async (load) => {
      const { Vector } = await load('js-sdsl');
      return { create: () => new Vector(), add: (l: any, x: number) => l.pushBack(x), get: (l: any, i: number) => l.getElementByPos(i) };
    },
  },
  run(a, xs: number[]) {
    const l = a.create();
    for (let i = 0; i < xs.length; i++) a.add(l, xs[i]);
    let s = 0;
    for (let i = 0; i < xs.length; i++) s += a.get(l, i);
    return s;
  },
};

const listSort: Workload = {
  id: 'arraylist-sort',
  group: 'Lists',
  title: 'ArrayList sort',
  detail: '100k random numbers, comparator',
  baseline: 'native Array',
  unit: { perRun: 100_000, label: 'elements' },
  data() {
    const r = lcg(7);
    return Array.from({ length: N }, () => r());
  },
  impls: {
    '@nodestd/collections ArrayList': async (load) => {
      const { ArrayList } = await load('ours');
      return { create: () => new ArrayList(), add: (l: any, x: number) => l.add(x), sort: (l: any) => l.sort(asc), get: (l: any, i: number) => l.get(i) };
    },
    'native Array': async () => ({ create: () => [] as number[], add: (l: number[], x: number) => l.push(x), sort: (l: number[]) => l.sort(asc), get: (l: number[], i: number) => l[i] }),
    'js-sdsl Vector': async (load) => {
      const { Vector } = await load('js-sdsl');
      return { create: () => new Vector(), add: (l: any, x: number) => l.pushBack(x), sort: (l: any) => l.sort(asc), get: (l: any, i: number) => l.getElementByPos(i) };
    },
  },
  run(a, xs: number[]) {
    const l = a.create();
    for (let i = 0; i < xs.length; i++) a.add(l, xs[i]);
    a.sort(l);
    return a.get(l, 0) + a.get(l, xs.length >> 1) + a.get(l, xs.length - 1);
  },
};

const linkedQueue: Workload = {
  id: 'linkedlist-queue',
  group: 'Queues and stacks',
  title: 'LinkedList as a queue',
  detail: 'size 1k, 100k offer + poll',
  baseline: 'native Array push + shift',
  unit: { perRun: 200_000, label: 'offer/poll calls' },
  data: () => Array.from({ length: N + DQ_SIZE }, (_, i) => i),
  impls: {
    '@nodestd/collections LinkedList': async (load) => {
      const { LinkedList } = await load('ours');
      return { create: () => new LinkedList(), offer: (d: any, x: number) => d.offer(x), poll: (d: any) => d.poll() };
    },
    'native Array push + shift': async () => ({ create: () => [] as number[], offer: (d: number[], x: number) => d.push(x), poll: (d: number[]) => d.shift() }),
    'js-sdsl LinkList': async (load) => {
      const { LinkList } = await load('js-sdsl');
      return { create: () => new LinkList(), offer: (d: any, x: number) => d.pushBack(x), poll: (d: any) => d.popFront() };
    },
    'collections.js List': async (load) => {
      const List = await load('collections/list');
      return { create: () => new List(), offer: (d: any, x: number) => d.push(x), poll: (d: any) => d.shift() };
    },
  },
  run: (a, xs: number[]) => dequeChurn.run(a, xs, undefined),
};

const stackPushPop: Workload = {
  id: 'stack-push-pop',
  group: 'Queues and stacks',
  title: 'Stack push + pop',
  detail: '100k pushes, then 100k pops',
  baseline: 'native Array push + pop',
  unit: { perRun: 200_000, label: 'push/pop calls' },
  data: () => Array.from({ length: N }, (_, i) => i),
  impls: {
    '@nodestd/collections Stack': async (load) => {
      const { Stack } = await load('ours');
      return { create: () => new Stack(), push: (s: any, x: number) => s.push(x), pop: (s: any) => s.pop() };
    },
    '@nodestd/collections ArrayDeque': async (load) => {
      const { ArrayDeque } = await load('ours');
      return { create: () => new ArrayDeque(), push: (s: any, x: number) => s.push(x), pop: (s: any) => s.pop() };
    },
    'native Array push + pop': async () => ({ create: () => [] as number[], push: (s: number[], x: number) => s.push(x), pop: (s: number[]) => s.pop() }),
    'js-sdsl Stack': async (load) => {
      const { Stack } = await load('js-sdsl');
      return { create: () => new Stack(), push: (s: any, x: number) => s.push(x), pop: (s: any) => s.pop() };
    },
    'mnemonist Stack': async (load) => {
      const Stack = await load('mnemonist/stack');
      return { create: () => new Stack(), push: (s: any, x: number) => s.push(x), pop: (s: any) => s.pop() };
    },
  },
  run(a, xs: number[]) {
    const st = a.create();
    for (let i = 0; i < xs.length; i++) a.push(st, xs[i]);
    let s = 0;
    for (let i = 0; i < xs.length; i++) s += a.pop(st);
    return s;
  },
};

const linkedSet: Workload = {
  id: 'linkedhashset-add-has',
  group: 'Sets',
  title: 'LinkedHashSet add + has',
  detail: '100k integers, insertion order',
  baseline: 'native Set',
  unit: { perRun: 200_000, label: 'add/has calls' },
  data: () => Array.from({ length: N }, (_, i) => i),
  impls: {
    '@nodestd/collections LinkedHashSet': async (load) => {
      const { LinkedHashSet } = await load('ours');
      return { create: () => new LinkedHashSet(), add: (s: any, x: any) => s.add(x), has: (s: any, x: any) => s.contains(x) };
    },
    'native Set': async () => ({ create: () => new Set(), add: (s: any, x: any) => s.add(x), has: (s: any, x: any) => s.has(x) }),
  },
  run: (a, xs: number[]) => hashSetAddHas.run(a, xs, undefined),
};

const treeSetAddContains: Workload = {
  id: 'treeset-add-contains',
  group: 'Sets',
  title: 'TreeSet add + contains',
  detail: '100k random keys, 100k queries',
  baseline: 'js-sdsl OrderedSet',
  unit: { perRun: 200_000, label: 'add/contains calls' },
  data: () => treeFloorCeiling.data(),
  impls: {
    '@nodestd/collections TreeSet': async (load) => {
      const { TreeSet } = await load('ours');
      return { create: () => new TreeSet(), add: (s: any, k: number) => s.add(k), has: (s: any, k: number) => s.contains(k) };
    },
    'js-sdsl OrderedSet': async (load) => {
      const { OrderedSet } = await load('js-sdsl');
      return { create: () => new OrderedSet([], asc), add: (s: any, k: number) => s.insert(k), has: (s: any, k: number) => !s.find(k).equals(s.end()) };
    },
    'collections.js SortedSet': async (load) => {
      const SortedSet = await load('collections/sorted-set');
      return { create: () => new SortedSet(), add: (s: any, k: number) => s.add(k), has: (s: any, k: number) => s.has(k) };
    },
  },
  run(a, d) {
    const s = a.create();
    for (const k of d.keys) a.add(s, k);
    let c = 0;
    for (let i = 0; i < d.queries.length; i++) if (a.has(s, d.queries[i])) c++;
    return c;
  },
};

const treeMapPut: Workload = {
  id: 'treemap-put',
  group: 'Maps',
  title: 'TreeMap put',
  detail: '100k random integer keys',
  baseline: 'js-sdsl OrderedMap',
  unit: { perRun: 100_000, label: 'put calls' },
  data: () => treeFloorCeiling.data().keys,
  impls: {
    '@nodestd/collections TreeMap': async (load) => {
      const { TreeMap } = await load('ours');
      return { create: () => new TreeMap(), put: (m: any, k: number) => m.put(k, k), size: (m: any) => m.size() };
    },
    'js-sdsl OrderedMap': async (load) => {
      const { OrderedMap } = await load('js-sdsl');
      return { create: () => new OrderedMap([], asc), put: (m: any, k: number) => m.setElement(k, k), size: (m: any) => m.size() };
    },
    'collections.js SortedMap': async (load) => {
      const SortedMap = await load('collections/sorted-map');
      return { create: () => new SortedMap(), put: (m: any, k: number) => m.set(k, k), size: (m: any) => m.length };
    },
  },
  run(a, keys: number[]) {
    const m = a.create();
    for (let i = 0; i < keys.length; i++) a.put(m, keys[i]);
    return a.size(m);
  },
};

const linkedMapIterate: Workload = {
  id: 'linkedhashmap-put-iterate',
  group: 'Maps',
  title: 'LinkedHashMap put + iterate',
  detail: '100k entries, insertion order',
  baseline: 'native Map',
  unit: { perRun: 200_000, label: 'puts and visited entries' },
  data: () => Array.from({ length: N }, (_, i) => i),
  impls: {
    '@nodestd/collections LinkedHashMap': async (load) => {
      const { LinkedHashMap } = await load('ours');
      return { create: () => new LinkedHashMap(), put: (m: any, k: number, v: number) => m.put(k, v), each: (m: any, f: (k: number, v: number) => void) => m.forEach(f) };
    },
    'native Map': async () => ({
      create: () => new Map<number, number>(),
      put: (m: Map<number, number>, k: number, v: number) => m.set(k, v),
      each: (m: Map<number, number>, f: (k: number, v: number) => void) => m.forEach((v, k) => f(k, v)),
    }),
  },
  run(a, keys: number[]) {
    const m = a.create();
    for (let i = 0; i < keys.length; i++) a.put(m, keys[i], i);
    let s = 0;
    let prev = -1;
    a.each(m, (k: number, v: number) => {
      s += v + (k > prev ? 1 : 0); // insertion order is part of the answer
      prev = k;
    });
    return s;
  },
};

/** A key with value equality, as application code writes one. */
class Point {
  constructor(readonly x: number, readonly y: number) {}
  equals(o: unknown): boolean {
    return o instanceof Point && o.x === this.x && o.y === this.y;
  }
  hashCode(): number {
    return (Math.imul(this.x, 31) + this.y) | 0;
  }
}

const valueKeys: Workload = {
  id: 'hashmap-value-keys',
  group: 'Maps',
  title: 'HashMap with value keys',
  detail: '10k points with equals()/hashCode()',
  baseline: 'native Map with string keys',
  unit: { perRun: 20_000, label: 'put/get calls' },
  data() {
    const r = lcg(11);
    const coords = Array.from({ length: 10_000 }, () => [r() % 1000, r() % 1000]);
    // lookups use new objects, so only value equality can find them
    return { puts: coords.map(([x, y]) => new Point(x, y)), gets: coords.map(([x, y]) => new Point(x, y)) };
  },
  impls: {
    '@nodestd/collections HashMap': async (load) => {
      const { HashMap } = await load('ours');
      return { create: () => new HashMap(), put: (m: any, p: Point, v: number) => m.put(p, v), get: (m: any, p: Point) => m.get(p) ?? undefined };
    },
    'native Map with string keys': async () => ({
      create: () => new Map<string, number>(),
      put: (m: Map<string, number>, p: Point, v: number) => m.set(`${p.x},${p.y}`, v),
      get: (m: Map<string, number>, p: Point) => m.get(`${p.x},${p.y}`),
    }),
    'collections.js FastMap': async (load) => {
      const FastMap = await load('collections/fast-map');
      return {
        create: () => new FastMap(null, (a: Point, b: Point) => a.x === b.x && a.y === b.y, (p: Point) => `${p.x},${p.y}`),
        put: (m: any, p: Point, v: number) => m.set(p, v),
        get: (m: any, p: Point) => m.get(p),
      };
    },
  },
  run(a, d) {
    const m = a.create();
    for (let i = 0; i < d.puts.length; i++) a.put(m, d.puts[i], i);
    let s = 0;
    for (let i = 0; i < d.gets.length; i++) s += a.get(m, d.gets[i]) ?? 0;
    return s;
  },
};

/** in the order they are listed: by group, then from simple to involved */
export const workloads: Workload[] = [
  listAddGet,
  listSort,
  dequeChurn,
  linkedQueue,
  stackPushPop,
  pqChurn,
  hashSetAddHas,
  linkedSet,
  treeSetAddContains,
  hashMapGetInt,
  hashMapPutString,
  valueKeys,
  linkedMapIterate,
  lru,
  treeMapPut,
  treeFloorCeiling,
  streamSum,
];
