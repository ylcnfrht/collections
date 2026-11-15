// HashMap / HashSet vs native Map/Set (the ceiling).
import { HashMap } from '../src/map/HashMap';
import { HashSet } from '../src/set/HashSet';
import { Point } from '../tests/helpers';
import { compare } from './harness';

export default async function () {
  const N = 100_000;
  const strs = Array.from({ length: N }, (_, i) => 'key' + i);

  await compare('HashMap put 100k int keys', {
    'ours HashMap': () => {
      const m = new HashMap<number, number>();
      for (let i = 0; i < N; i++) m.put(i, i);
      return m;
    },
    'native Map': () => {
      const m = new Map<number, number>();
      for (let i = 0; i < N; i++) m.set(i, i);
      return m;
    },
  });

  const ours = new HashMap<number, number>();
  const native = new Map<number, number>();
  for (let i = 0; i < N; i++) {
    ours.put(i, i);
    native.set(i, i);
  }

  await compare('HashMap get 100k int keys', {
    'ours HashMap': () => {
      let s = 0;
      for (let i = 0; i < N; i++) s += ours.get(i)!;
      return s;
    },
    'native Map': () => {
      let s = 0;
      for (let i = 0; i < N; i++) s += native.get(i)!;
      return s;
    },
  });

  await compare('HashMap put 100k string keys', {
    'ours HashMap': () => {
      const m = new HashMap<string, number>();
      for (let i = 0; i < N; i++) m.put(strs[i], i);
      return m;
    },
    'native Map': () => {
      const m = new Map<string, number>();
      for (let i = 0; i < N; i++) m.set(strs[i], i);
      return m;
    },
  });

  // keys 0..2N: half hit, half miss
  await compare('HashMap get hit/miss mix 100k', {
    'ours HashMap': () => {
      let s = 0;
      for (let i = 0; i < N; i++) if (ours.get(i * 2) !== null) s++;
      return s;
    },
    'native Map': () => {
      let s = 0;
      for (let i = 0; i < N; i++) if (native.get(i * 2) !== undefined) s++;
      return s;
    },
  });

  // each case fills then deletes, so fill cost is included equally
  await compare('HashMap put+delete 100k int keys', {
    'ours HashMap': () => {
      const m = new HashMap<number, number>();
      for (let i = 0; i < N; i++) m.put(i, i);
      for (let i = 0; i < N; i++) m.remove(i);
      return m;
    },
    'native Map': () => {
      const m = new Map<number, number>();
      for (let i = 0; i < N; i++) m.set(i, i);
      for (let i = 0; i < N; i++) m.delete(i);
      return m;
    },
  });

  await compare('HashMap iterate entries 100k', {
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
  });

  // random keys up to 2^31 defeat the dense index table, so this measures the native-Map fallback
  const sparse = Array.from({ length: N }, (_, i) => (Math.imul(i + 1, 2654435761) >>> 1));
  await compare('HashMap put+get 100k sparse int keys', {
    'ours HashMap': () => {
      const m = new HashMap<number, number>();
      for (let i = 0; i < N; i++) m.put(sparse[i], i);
      let s = 0;
      for (let i = 0; i < N; i++) s += m.get(sparse[i])!;
      return s;
    },
    'native Map': () => {
      const m = new Map<number, number>();
      for (let i = 0; i < N; i++) m.set(sparse[i], i);
      let s = 0;
      for (let i = 0; i < N; i++) s += m.get(sparse[i])!;
      return s;
    },
  });

  const M = 10_000;
  const pts = Array.from({ length: M }, (_, i) => new Point(i % 100, (i / 100) | 0));
  const probes = Array.from({ length: M }, (_, i) => new Point(i % 100, (i / 100) | 0));
  await compare('HashMap put+get 10k Point keys (equals/hashCode)', {
    'ours HashMap': () => {
      const m = new HashMap<Point, number>();
      for (let i = 0; i < M; i++) m.put(pts[i], i);
      let s = 0;
      for (let i = 0; i < M; i++) s += m.get(probes[i])!;
      return s;
    },
    'native Map, string-encoded key': () => {
      const m = new Map<string, number>();
      for (let i = 0; i < M; i++) m.set(pts[i].x + ',' + pts[i].y, i);
      let s = 0;
      for (let i = 0; i < M; i++) s += m.get(probes[i].x + ',' + probes[i].y)!;
      return s;
    },
  });

  await compare('HashSet add+has 100k int', {
    'ours HashSet': () => {
      const s = new HashSet<number>();
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
  });
}
