// Workloads for the isolated benchmark. Each workload has one dataset and one test loop, written once;
// implementations plug in through a small adapter. Adapters load their library lazily, so a process
// that runs one implementation never loads another (collections.js rewrites built-ins on load).
/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */

const OURS = '../../dist/index.js'; // the published build, not the sources

export interface Workload {
  id: string;
  title: string;
  detail: string;
  /** implementation every other one is divided by in the report */
  baseline: string;
  /** operations one run of the test performs, to report operations per second */
  unit: { perRun: number; label: string };
  data(): any;
  impls: Record<string, () => any>;
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

const intMap = {
  '@nodestd/collections HashMap': () => {
    const { HashMap } = require(OURS);
    return { create: () => new HashMap(), put: (m: any, k: any, v: any) => m.put(k, v), get: (m: any, k: any) => m.get(k), size: (m: any) => m.size() };
  },
  'native Map': () => ({ create: () => new Map(), put: (m: any, k: any, v: any) => m.set(k, v), get: (m: any, k: any) => m.get(k), size: (m: any) => m.size }),
  'js-sdsl HashMap': () => {
    const { HashMap } = require('js-sdsl');
    return { create: () => new HashMap(), put: (m: any, k: any, v: any) => m.setElement(k, v), get: (m: any, k: any) => m.getElementByKey(k), size: (m: any) => m.size() };
  },
  'collections.js FastMap': () => {
    const FastMap = require('collections/fast-map');
    return { create: () => new FastMap(), put: (m: any, k: any, v: any) => m.set(k, v), get: (m: any, k: any) => m.get(k), size: (m: any) => m.length };
  },
};

const hashMapGetInt: Workload = {
  id: 'hashmap-get-int',
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
  title: 'HashSet add + has',
  detail: '100k integers',
  baseline: 'native Set',
  unit: { perRun: 200000, label: 'add/has calls' },
  data: () => Array.from({ length: N }, (_, i) => i),
  impls: {
    '@nodestd/collections HashSet': () => {
      const { HashSet } = require(OURS);
      return { create: () => new HashSet(), add: (s: any, x: any) => s.add(x), has: (s: any, x: any) => s.contains(x) };
    },
    'native Set': () => ({ create: () => new Set(), add: (s: any, x: any) => s.add(x), has: (s: any, x: any) => s.has(x) }),
    'js-sdsl HashSet': () => {
      const { HashSet } = require('js-sdsl');
      return { create: () => new HashSet(), add: (s: any, x: any) => s.insert(x), has: (s: any, x: any) => !s.find(x).equals(s.end()) };
    },
    'collections.js FastSet': () => {
      const FastSet = require('collections/fast-set');
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
    '@nodestd/collections LinkedHashMap.lru': () => {
      const { LinkedHashMap } = require(OURS);
      return { create: (cap: number) => LinkedHashMap.lru(cap), get: (c: any, k: any) => c.get(k) ?? undefined, set: (c: any, k: any, v: any) => c.put(k, v) };
    },
    'native Map delete + set': () => ({
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
    'mnemonist LRUMap': () => {
      const LRUMap = require('mnemonist/lru-map');
      return { create: (cap: number) => new LRUMap(cap), get: (c: any, k: any) => c.get(k), set: (c: any, k: any, v: any) => c.set(k, v) };
    },
    'collections.js LruMap': () => {
      const LruMap = require('collections/lru-map');
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
    '@nodestd/collections TreeMap': () => {
      const { TreeMap } = require(OURS);
      return {
        create: () => new TreeMap(),
        put: (m: any, k: number) => m.put(k, k),
        floor: (m: any, q: number) => m.floorKey(q) ?? 0,
        ceiling: (m: any, q: number) => m.ceilingKey(q) ?? 0,
      };
    },
    'js-sdsl OrderedMap': () => {
      const { OrderedMap } = require('js-sdsl');
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
    'collections.js SortedSet': () => {
      const SortedSet = require('collections/sorted-set');
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
  title: 'PriorityQueue churn',
  detail: 'size 1k, 100k offer + poll',
  baseline: 'sorted array',
  unit: { perRun: 200000, label: 'offer/poll calls' },
  data() {
    const r = lcg(2);
    return Array.from({ length: N + PQ_SIZE }, () => r());
  },
  impls: {
    '@nodestd/collections PriorityQueue': () => {
      const { PriorityQueue } = require(OURS);
      return { create: () => new PriorityQueue(), offer: (q: any, x: number) => q.offer(x), poll: (q: any) => q.poll() };
    },
    'js-sdsl PriorityQueue': () => {
      const { PriorityQueue } = require('js-sdsl');
      return { create: () => new PriorityQueue([], asc), offer: (q: any, x: number) => q.push(x), poll: (q: any) => q.pop() };
    },
    'mnemonist Heap': () => {
      const Heap = require('mnemonist/heap');
      return { create: () => new Heap(), offer: (q: any, x: number) => q.push(x), poll: (q: any) => q.pop() };
    },
    '@datastructures-js/priority-queue': () => {
      const { MinPriorityQueue } = require('@datastructures-js/priority-queue');
      return { create: () => new MinPriorityQueue(), offer: (q: any, x: number) => q.enqueue(x), poll: (q: any) => q.dequeue() };
    },
    'collections.js Heap': () => {
      const Heap = require('collections/heap');
      // a max-heap by default; the reversed comparator makes it a min-heap like the others
      return { create: () => new Heap([], null, (a: number, b: number) => b - a), offer: (q: any, x: number) => q.push(x), poll: (q: any) => q.pop() };
    },
    'sorted array': () => ({
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
  title: 'ArrayDeque as a queue',
  detail: 'size 1k, 100k offer + poll',
  baseline: 'native Array push + shift',
  unit: { perRun: 200000, label: 'offer/poll calls' },
  data: () => Array.from({ length: N + DQ_SIZE }, (_, i) => i),
  impls: {
    '@nodestd/collections ArrayDeque': () => {
      const { ArrayDeque } = require(OURS);
      return { create: () => new ArrayDeque(), offer: (d: any, x: number) => d.offer(x), poll: (d: any) => d.poll() };
    },
    'native Array push + shift': () => ({ create: () => [] as number[], offer: (d: number[], x: number) => d.push(x), poll: (d: number[]) => d.shift() }),
    'js-sdsl Deque': () => {
      const { Deque } = require('js-sdsl');
      return { create: () => new Deque(), offer: (d: any, x: number) => d.pushBack(x), poll: (d: any) => d.popFront() };
    },
    'mnemonist CircularBuffer (fixed capacity)': () => {
      const CircularBuffer = require('mnemonist/circular-buffer');
      return { create: () => new CircularBuffer(Array, DQ_SIZE + 1), offer: (d: any, x: number) => d.push(x), poll: (d: any) => d.shift() };
    },
    'collections.js Deque': () => {
      const Deque = require('collections/deque');
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
  title: 'Stream filter → map → sum',
  detail: '100k numbers',
  baseline: 'native Array filter/map/reduce',
  unit: { perRun: 100000, label: 'elements' },
  data() {
    const r = lcg(12345);
    return Array.from({ length: N }, () => r() % 1000);
  },
  impls: {
    '@nodestd/collections Stream': () => {
      const { Stream } = require(OURS);
      return { sum: (xs: number[]) => Stream.ofArray(xs).filter(even).map(triple).reduce(0, add) };
    },
    '@nodestd/collections IntStream': () => {
      const { IntStream } = require(OURS);
      return { sum: (xs: number[]) => IntStream.ofArray(xs).filter(even).map(triple).sum() };
    },
    'native Array filter/map/reduce': () => ({ sum: (xs: number[]) => xs.filter(even).map(triple).reduce(add, 0) }),
    'native Iterator helpers': () => ({ sum: (xs: number[]) => (xs.values() as any).filter(even).map(triple).reduce(add, 0) }),
  },
  run: (a, xs: number[]) => a.sum(xs),
};

export const workloads: Workload[] = [hashMapGetInt, hashSetAddHas, lru, streamSum, treeFloorCeiling, pqChurn, dequeChurn, hashMapPutString];
