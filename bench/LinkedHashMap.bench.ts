// LinkedHashMap / LinkedHashSet vs native Map/Set (insertion-ordered), js-sdsl HashMap/HashSet
// (also insertion-ordered) and mnemonist's LRU caches.
import { HashMap as SdslHashMap, HashSet as SdslHashSet } from 'js-sdsl';
import LRUCache from 'mnemonist/lru-cache';
import LRUMap from 'mnemonist/lru-map';
import { LinkedHashMap } from '../src/map/LinkedHashMap';
import { LinkedHashSet } from '../src/set/LinkedHashSet';
import { rng } from '../tests/helpers';
import { compare } from './harness';

export default async function () {
  const N = 100_000;
  const strs = Array.from({ length: N }, (_, i) => 'key' + i);

  await compare('LinkedHashMap put 100k int keys', {
    'ours LinkedHashMap': () => {
      const m = new LinkedHashMap<number, number>();
      for (let i = 0; i < N; i++) m.put(i, i);
      return m;
    },
    'native Map': () => {
      const m = new Map<number, number>();
      for (let i = 0; i < N; i++) m.set(i, i);
      return m;
    },
    'js-sdsl HashMap': () => {
      const m = new SdslHashMap<number, number>();
      for (let i = 0; i < N; i++) m.setElement(i, i);
      return m;
    },
  });

  await compare('LinkedHashMap put 100k string keys', {
    'ours LinkedHashMap': () => {
      const m = new LinkedHashMap<string, number>();
      for (let i = 0; i < N; i++) m.put(strs[i], i);
      return m;
    },
    'native Map': () => {
      const m = new Map<string, number>();
      for (let i = 0; i < N; i++) m.set(strs[i], i);
      return m;
    },
    'js-sdsl HashMap': () => {
      const m = new SdslHashMap<string, number>();
      for (let i = 0; i < N; i++) m.setElement(strs[i], i);
      return m;
    },
  });

  const ours = new LinkedHashMap<number, number>();
  const native = new Map<number, number>();
  const sdsl = new SdslHashMap<number, number>();
  for (let i = 0; i < N; i++) {
    ours.put(i, i);
    native.set(i, i);
    sdsl.setElement(i, i);
  }

  await compare('LinkedHashMap get 100k int keys', {
    'ours LinkedHashMap': () => {
      let s = 0;
      for (let i = 0; i < N; i++) s += ours.get(i)!;
      return s;
    },
    'native Map': () => {
      let s = 0;
      for (let i = 0; i < N; i++) s += native.get(i)!;
      return s;
    },
    'js-sdsl HashMap': () => {
      let s = 0;
      for (let i = 0; i < N; i++) s += sdsl.getElementByKey(i)!;
      return s;
    },
  });

  await compare('LinkedHashMap ordered iteration 100k', {
    'ours for..of': () => {
      let s = 0;
      for (const [k, v] of ours) s += k + v;
      return s;
    },
    'ours forEach': () => {
      let s = 0;
      ours.forEach((k, v) => (s += k + v));
      return s;
    },
    'native for..of': () => {
      let s = 0;
      for (const [k, v] of native) s += k + v;
      return s;
    },
    'native forEach': () => {
      let s = 0;
      native.forEach((v, k) => (s += k + v));
      return s;
    },
    'js-sdsl forEach': () => {
      let s = 0;
      sdsl.forEach(([k, v]) => (s += k + v));
      return s;
    },
  });

  // 80% of lookups hit a hot set that fits the cache, 20% go to a large cold range
  const CAP = 1000;
  const r = rng(1);
  const stream = Array.from({ length: N }, () => (r(10) < 8 ? r(900) : 1000 + r(1_000_000)));
  await compare('LRU cache cap 1k, 100k get-or-put (~80% hits)', {
    'ours LinkedHashMap.lru': () => {
      const c = LinkedHashMap.lru<number, number>(CAP);
      let hits = 0;
      for (let i = 0; i < N; i++) {
        const k = stream[i];
        if (c.get(k) !== null) hits++;
        else c.put(k, i);
      }
      return hits;
    },
    'mnemonist LRUCache': () => {
      const c = new LRUCache<number, number>(CAP);
      let hits = 0;
      for (let i = 0; i < N; i++) {
        const k = stream[i];
        if (c.get(k) !== undefined) hits++;
        else c.set(k, i);
      }
      return hits;
    },
    'mnemonist LRUMap': () => {
      const c = new LRUMap<number, number>(CAP);
      let hits = 0;
      for (let i = 0; i < N; i++) {
        const k = stream[i];
        if (c.get(k) !== undefined) hits++;
        else c.set(k, i);
      }
      return hits;
    },
    'native Map delete+set': () => {
      const c = new Map<number, number>();
      let hits = 0;
      for (let i = 0; i < N; i++) {
        const k = stream[i];
        const v = c.get(k);
        if (v !== undefined) {
          hits++;
          c.delete(k);
          c.set(k, v);
        } else {
          c.set(k, i);
          if (c.size > CAP) c.delete(c.keys().next().value!);
        }
      }
      return hits;
    },
  });

  await compare('LinkedHashSet add+has 100k int', {
    'ours LinkedHashSet': () => {
      const s = new LinkedHashSet<number>();
      for (let i = 0; i < N; i++) s.add(i);
      let c = 0;
      for (let i = 0; i < N; i++) if (s.contains(i)) c++;
      return c;
    },
    'native Set': () => {
      const s = new Set<number>();
      for (let i = 0; i < N; i++) s.add(i);
      let c = 0;
      for (let i = 0; i < N; i++) if (s.has(i)) c++;
      return c;
    },
    'js-sdsl HashSet': () => {
      const s = new SdslHashSet<number>();
      for (let i = 0; i < N; i++) s.insert(i);
      let c = 0;
      for (let i = 0; i < N; i++) if (!s.find(i).equals(s.end())) c++;
      return c;
    },
  });

  // each case fills then drains from the front, so fill cost is included equally
  await compare('LinkedHashMap fill + pollFirstEntry drain 100k', {
    'ours LinkedHashMap': () => {
      const m = new LinkedHashMap<number, number>();
      for (let i = 0; i < N; i++) m.put(i, i);
      let s = 0;
      for (let e; (e = m.pollFirstEntry()) !== null; ) s += e.getValue();
      return s;
    },
    'native Map': () => {
      const m = new Map<number, number>();
      for (let i = 0; i < N; i++) m.set(i, i);
      let s = 0;
      // one live iterator: re-reading entries().next() per step is O(n) over deleted slots
      for (const [k, v] of m) {
        m.delete(k);
        s += v;
      }
      return s;
    },
    'js-sdsl HashMap': () => {
      const m = new SdslHashMap<number, number>();
      for (let i = 0; i < N; i++) m.setElement(i, i);
      let s = 0;
      while (!m.empty()) {
        const [k, v] = m.front()!;
        m.eraseElementByKey(k);
        s += v;
      }
      return s;
    },
  });
}
