// TreeMap vs a sorted array with binary search (plain JS).
// Random-key inserts, removes and drains are left out: on a sorted array they are O(n) per
// operation (splice / shift), about 1s per 100k run, which would push this file far past a minute.
import { TreeMap } from '../src/map/TreeMap';
import { compare } from './harness';

const N = 100_000;
const num = (a: number, b: number) => a - b;

function rand(seed: number) {
  let s = seed;
  return () => (s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff);
}

/** index of the first element >= k */
function lowerBound<T>(a: T[], k: T): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (a[mid] < k) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function arrPut<T>(ks: T[], vs: unknown[], k: T, v: unknown): void {
  const i = lowerBound(ks, k);
  if (ks[i] === k) vs[i] = v;
  else {
    ks.splice(i, 0, k);
    vs.splice(i, 0, v);
  }
}

export default async function () {
  const r = rand(12345);
  const randomKeys = Array.from({ length: N }, () => r() % 1_000_000);
  const ascKeys = Array.from({ length: N }, (_, i) => i);
  const queries = Array.from({ length: N }, () => r() % 1_000_000);

  const ours = new TreeMap<number, number>();
  for (const k of randomKeys) ours.put(k, k);
  const sortedKs = [...new Set(randomKeys)].sort(num);
  const sortedVs = sortedKs.slice();

  await compare('TreeMap put 100k ascending keys', {
    'ours TreeMap.put': () => {
      const m = new TreeMap<number, number>();
      for (let i = 0; i < N; i++) m.put(ascKeys[i], i);
      return m;
    },
    'sorted array: binary search + splice': () => {
      const ks: number[] = [];
      const vs: number[] = [];
      for (let i = 0; i < N; i++) arrPut(ks, vs, ascKeys[i], i);
      return ks;
    },
  });

  await compare('TreeMap get 100k', {
    'ours TreeMap.get': () => {
      let s = 0;
      for (let i = 0; i < N; i++) s += ours.get(randomKeys[i])!;
      return s;
    },
    'sorted array binary search': () => {
      let s = 0;
      for (let i = 0; i < N; i++) s += sortedVs[lowerBound(sortedKs, randomKeys[i])];
      return s;
    },
  });

  await compare('TreeMap floor + ceiling 100k queries', {
    'ours floorKey/ceilingKey': () => {
      let s = 0;
      for (let i = 0; i < N; i++) s += (ours.floorKey(queries[i]) ?? 0) + (ours.ceilingKey(queries[i]) ?? 0);
      return s;
    },
    'sorted array binary search': () => {
      let s = 0;
      for (let i = 0; i < N; i++) {
        const q = queries[i];
        const j = lowerBound(sortedKs, q);
        s += (sortedKs[j] === q ? q : (sortedKs[j - 1] ?? 0)) + (sortedKs[j] ?? 0);
      }
      return s;
    },
  });

  await compare('TreeMap iterate 100k in order (forEach)', {
    'ours TreeMap.forEach': () => {
      let s = 0;
      ours.forEach((k, v) => (s += k + v));
      return s;
    },
    'sorted array loop': () => {
      let s = 0;
      for (let i = 0; i < sortedKs.length; i++) s += sortedKs[i] + sortedVs[i];
      return s;
    },
  });

  await compare('TreeMap iterate 100k in order (for..of)', {
    'ours for..of TreeMap': () => {
      let s = 0;
      for (const [k, v] of ours) s += k + v;
      return s;
    },
    'ours for..of keySet': () => {
      let s = 0;
      for (const k of ours.keySet()) s += k;
      return s;
    },
    'sorted array for..of': () => {
      let s = 0;
      for (const k of sortedKs) s += k;
      return s;
    },
  });
}
