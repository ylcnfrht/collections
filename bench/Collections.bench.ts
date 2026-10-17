import { Collections } from '../src/Collections';
import { List, Map } from '../src/immutable/ImmutableCollections';
import { ArrayList } from '../src/list/ArrayList';
import { compare } from './harness';

function range(n: number): number[] {
  const a: number[] = [];
  for (let i = 0; i < n; i++) a.push(i);
  return a;
}

// seeded so both sides of a comparison see the same data
function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    return s / 0x80000000;
  };
}

export default async function () {
  const N = 10_000;

  const ol = List.of(...range(N));
  const fa = Object.freeze(range(N));
  await compare('List.of get-sum 10k', {
    'ours List.of': () => {
      let s = 0;
      for (let i = 0, n = ol.size(); i < n; i++) s += ol.get(i);
      return s;
    },
    'native frozen Array': () => {
      let s = 0;
      for (let i = 0, n = fa.length; i < n; i++) s += fa[i];
      return s;
    },
  });

  const r0 = lcg(1);
  const unsorted = range(N).map(() => Math.floor(r0() * 1e9));
  const al = new ArrayList<number>();
  const na: number[] = [];
  await compare('sort 10k numbers', {
    'ours Collections.sort(ArrayList)': () => {
      al.clear();
      for (let i = 0; i < N; i++) al.add(unsorted[i]);
      Collections.sort(al);
      return al;
    },
    'native Array.sort': () => {
      na.length = 0;
      for (let i = 0; i < N; i++) na.push(unsorted[i]);
      na.sort((a, b) => a - b);
      return na;
    },
  });

  const M = 100_000;
  const sortedList = new ArrayList<number>();
  for (let i = 0; i < M; i++) sortedList.add(i * 2);
  const sortedArr = range(M).map((i) => i * 2);
  const keys = range(M).map(() => Math.floor(r0() * 2 * M));
  const cmp = (a: number, b: number) => (a < b ? -1 : a > b ? 1 : 0);
  await compare('binarySearch 100k queries on 100k', {
    'ours Collections.binarySearch': () => {
      let s = 0;
      for (let q = 0; q < M; q++) s += Collections.binarySearch(sortedList, keys[q], cmp);
      return s;
    },
    'hand-written on Array': () => {
      let s = 0;
      for (let q = 0; q < M; q++) {
        const key = keys[q];
        let lo = 0;
        let hi = sortedArr.length - 1;
        let r = -1;
        while (lo <= hi) {
          const mid = (lo + hi) >>> 1;
          const c = cmp(sortedArr[mid], key);
          if (c < 0) lo = mid + 1;
          else if (c > 0) hi = mid - 1;
          else {
            r = mid;
            break;
          }
        }
        s += r >= 0 ? r : -(lo + 1);
      }
      return s;
    },
  });

  const sl = ArrayList.of(...range(N));
  const sa = range(N);
  const rs = lcg(7);
  const rn = lcg(7);
  await compare('shuffle 10k', {
    'ours Collections.shuffle(ArrayList)': () => {
      Collections.shuffle(sl, rs);
      return sl;
    },
    'native Fisher–Yates': () => {
      for (let i = sa.length - 1; i > 0; i--) {
        const j = Math.floor(rn() * (i + 1));
        const t = sa[i];
        sa[i] = sa[j];
        sa[j] = t;
      }
      return sa;
    },
  });

  const K = 1_000;
  const entries = range(K).map((i) => Map.entry(`k${i}`, i));
  const om = Map.ofEntries(...entries);
  const nm = new globalThis.Map(range(K).map((i) => [`k${i}`, i] as [string, number]));
  const lookups = range(K).map((i) => `k${(i * 7) % K}`);
  await compare('Map.ofEntries get 1k', {
    'ours Map.ofEntries': () => {
      let s = 0;
      for (let i = 0; i < K; i++) s += om.get(lookups[i])!;
      return s;
    },
    'native Map': () => {
      let s = 0;
      for (let i = 0; i < K; i++) s += nm.get(lookups[i])!;
      return s;
    },
  });
}
