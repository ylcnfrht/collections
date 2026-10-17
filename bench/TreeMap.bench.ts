// TreeMap / TreeSet vs js-sdsl OrderedMap/OrderedSet and a sorted array with binary search.
// The sorted array only appears where it is not O(n) per operation: incremental random inserts
// (splice) and shift-draining 100k elements take ~1s per run, and tinybench's minimum iteration
// count would push this file far past a minute (measured: 0.03x and 0.01x of ours).
import { OrderedMap, OrderedSet } from 'js-sdsl';
import { TreeMap } from '../src/map/TreeMap';
import { TreeSet } from '../src/set/TreeSet';
import { compare } from './harness';

const N = 100_000;
const num = (a: number, b: number) => a - b;
const str = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

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
  const strKeys = Array.from({ length: 50_000 }, () => 'key' + (r() % 10_000_000));

  const ours = new TreeMap<number, number>();
  const sdsl = new OrderedMap<number, number>([], num);
  for (const k of randomKeys) {
    ours.put(k, k);
    sdsl.setElement(k, k);
  }
  const sortedKs = [...new Set(randomKeys)].sort(num);
  const sortedVs = sortedKs.slice();

  await compare('TreeMap put 100k random int keys', {
    'ours TreeMap.put': () => {
      const m = new TreeMap<number, number>();
      for (let i = 0; i < N; i++) m.put(randomKeys[i], i);
      return m;
    },
    'js-sdsl OrderedMap.setElement': () => {
      const m = new OrderedMap<number, number>([], num);
      for (let i = 0; i < N; i++) m.setElement(randomKeys[i], i);
      return m;
    },
  });

  await compare('TreeMap put 100k ascending keys', {
    'ours TreeMap.put': () => {
      const m = new TreeMap<number, number>();
      for (let i = 0; i < N; i++) m.put(ascKeys[i], i);
      return m;
    },
    'js-sdsl OrderedMap.setElement': () => {
      const m = new OrderedMap<number, number>([], num);
      for (let i = 0; i < N; i++) m.setElement(ascKeys[i], i);
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
    'js-sdsl OrderedMap.getElementByKey': () => {
      let s = 0;
      for (let i = 0; i < N; i++) s += sdsl.getElementByKey(randomKeys[i])!;
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
    'js-sdsl reverseLowerBound/lowerBound': () => {
      let s = 0;
      const end = sdsl.end();
      for (let i = 0; i < N; i++) {
        const f = sdsl.reverseLowerBound(queries[i]);
        const c = sdsl.lowerBound(queries[i]);
        s += (f.equals(sdsl.rEnd()) ? 0 : f.pointer[0]) + (c.equals(end) ? 0 : c.pointer[0]);
      }
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
    'js-sdsl OrderedMap.forEach': () => {
      let s = 0;
      sdsl.forEach(([k, v]) => (s += k + v));
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
    'js-sdsl for..of OrderedMap': () => {
      let s = 0;
      for (const [k, v] of sdsl) s += k + v;
      return s;
    },
    'sorted array for..of': () => {
      let s = 0;
      for (const k of sortedKs) s += k;
      return s;
    },
  });

  await compare('TreeMap remove 100k random keys (+ re-put)', {
    'ours TreeMap.remove': () => {
      for (let i = 0; i < N; i++) ours.remove(randomKeys[i]);
      for (let i = 0; i < N; i++) ours.put(randomKeys[i], randomKeys[i]);
      return ours;
    },
    'js-sdsl OrderedMap.eraseElementByKey': () => {
      for (let i = 0; i < N; i++) sdsl.eraseElementByKey(randomKeys[i]);
      for (let i = 0; i < N; i++) sdsl.setElement(randomKeys[i], randomKeys[i]);
      return sdsl;
    },
  });

  await compare('TreeMap build 100k ascending + pollFirst drain', {
    'ours TreeMap.pollFirstEntry': () => {
      const m = new TreeMap<number, number>();
      for (let i = 0; i < N; i++) m.put(i, i);
      let s = 0;
      let e;
      while ((e = m.pollFirstEntry()) !== null) s += e.getKey();
      return s;
    },
    'js-sdsl begin + eraseElementByIterator': () => {
      const m = new OrderedMap<number, number>([], num);
      for (let i = 0; i < N; i++) m.setElement(i, i);
      let s = 0;
      while (m.size()) {
        const it = m.begin();
        s += it.pointer[0];
        m.eraseElementByIterator(it);
      }
      return s;
    },
  });

  await compare('TreeMap string keys 50k put + get', {
    'ours TreeMap<string>': () => {
      const m = new TreeMap<string, number>();
      for (let i = 0; i < strKeys.length; i++) m.put(strKeys[i], i);
      let s = 0;
      for (let i = 0; i < strKeys.length; i++) s += m.get(strKeys[i])!;
      return s;
    },
    'js-sdsl OrderedMap<string>': () => {
      const m = new OrderedMap<string, number>([], str);
      for (let i = 0; i < strKeys.length; i++) m.setElement(strKeys[i], i);
      let s = 0;
      for (let i = 0; i < strKeys.length; i++) s += m.getElementByKey(strKeys[i])!;
      return s;
    },
  });

  await compare('TreeSet add + contains 100k', {
    'ours TreeSet': () => {
      const t = new TreeSet<number>();
      for (let i = 0; i < N; i++) t.add(randomKeys[i]);
      let c = 0;
      for (let i = 0; i < N; i++) if (t.contains(queries[i])) c++;
      return c;
    },
    'js-sdsl OrderedSet': () => {
      const t = new OrderedSet<number>([], num);
      for (let i = 0; i < N; i++) t.insert(randomKeys[i]);
      let c = 0;
      const end = t.end();
      for (let i = 0; i < N; i++) if (!t.find(queries[i]).equals(end)) c++;
      return c;
    },
  });
}
