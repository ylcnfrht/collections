import { Vector as SdslVector } from 'js-sdsl';
import { ArrayList } from '../src/list/ArrayList';
import { compare } from './harness';

class Key {
  constructor(readonly k: number) {}
  equals(o: unknown): boolean {
    return o instanceof Key && o.k === this.k;
  }
}

function filled(n: number): ArrayList<number> {
  const l = new ArrayList<number>();
  for (let i = 0; i < n; i++) l.add(i);
  return l;
}

function filledSdsl(n: number): SdslVector<number> {
  const v = new SdslVector<number>();
  for (let i = 0; i < n; i++) v.pushBack(i);
  return v;
}

function range(n: number): number[] {
  const a: number[] = [];
  for (let i = 0; i < n; i++) a.push(i);
  return a;
}

export default async function () {
  const N = 10_000;
  const M = 1_000;

  await compare('append 10k', {
    // loops are inline (as user code would be): behind a shared helper V8's inlining budget runs out before add() is inlined
    'ours ArrayList': () => {
      const l = new ArrayList<number>();
      for (let i = 0; i < N; i++) l.add(i);
      return l;
    },
    'native Array': () => {
      const a: number[] = [];
      for (let i = 0; i < N; i++) a.push(i);
      return a;
    },
    'js-sdsl Vector': () => {
      const v = new SdslVector<number>();
      for (let i = 0; i < N; i++) v.pushBack(i);
      return v;
    },
  });

  const ol = filled(N);
  const na = range(N);
  const sv = filledSdsl(N);
  await compare('get-sum 10k (indexed)', {
    'ours ArrayList': () => {
      let s = 0;
      for (let i = 0, n = ol.size(); i < n; i++) s += ol.get(i);
      return s;
    },
    'native Array': () => {
      let s = 0;
      for (let i = 0, n = na.length; i < n; i++) s += na[i];
      return s;
    },
    'js-sdsl Vector': () => {
      let s = 0;
      for (let i = 0, n = sv.size(); i < n; i++) s += sv.getElementByPos(i);
      return s;
    },
  });

  await compare('for..of 10k', {
    'ours ArrayList': () => {
      let s = 0;
      for (const x of ol) s += x;
      return s;
    },
    'native Array': () => {
      let s = 0;
      for (const x of na) s += x;
      return s;
    },
    'js-sdsl Vector': () => {
      let s = 0;
      for (const x of sv) s += x;
      return s;
    },
  });

  await compare('forEach 10k', {
    'ours ArrayList': () => {
      let s = 0;
      ol.forEach((x) => (s += x));
      return s;
    },
    'native Array': () => {
      let s = 0;
      na.forEach((x) => (s += x));
      return s;
    },
    'js-sdsl Vector': () => {
      let s = 0;
      sv.forEach((x) => (s += x));
      return s;
    },
  });

  await compare('insert at front 1k', {
    'ours ArrayList': () => {
      const l = new ArrayList<number>();
      for (let i = 0; i < M; i++) l.add(0, i);
      return l;
    },
    'native Array': () => {
      const a: number[] = [];
      for (let i = 0; i < M; i++) a.unshift(i);
      return a;
    },
    'js-sdsl Vector': () => {
      const v = new SdslVector<number>();
      for (let i = 0; i < M; i++) v.insert(0, i);
      return v;
    },
  });

  await compare('removeAt(0) drain 1k', {
    'ours ArrayList': () => {
      const l = filled(M);
      let s = 0;
      while (!l.isEmpty()) s += l.removeAt(0);
      return s;
    },
    'native Array': () => {
      const a = range(M);
      let s = 0;
      while (a.length) s += a.shift()!;
      return s;
    },
    'js-sdsl Vector': () => {
      const v = filledSdsl(M);
      let s = 0;
      while (!v.empty()) {
        s += v.front()!;
        v.eraseElementByPos(0);
      }
      return s;
    },
  });

  let probe = 0;
  await compare('indexOf (primitive) 10k', {
    'ours ArrayList': () => ol.indexOf((probe = (probe + 7919) % N)),
    'native Array': () => na.indexOf((probe = (probe + 7919) % N)),
    'js-sdsl Vector': () => {
      const t = (probe = (probe + 7919) % N);
      for (let i = 0, n = sv.size(); i < n; i++) if (sv.getElementByPos(i) === t) return i;
      return -1;
    },
  });

  const keys = Array.from({ length: M }, (_, i) => new Key(i));
  const ok = new ArrayList<Key>();
  const sk = new SdslVector<Key>();
  for (const k of keys) {
    ok.add(k);
    sk.pushBack(k);
  }
  let kp = 0;
  await compare('contains (equals objects) 1k', {
    'ours ArrayList': () => ok.contains(new Key((kp = (kp + 397) % M))),
    'native Array': () => {
      const t = new Key((kp = (kp + 397) % M));
      return keys.some((x) => t.equals(x));
    },
    'js-sdsl Vector': () => {
      const t = new Key((kp = (kp + 397) % M));
      for (let i = 0, n = sk.size(); i < n; i++) if (t.equals(sk.getElementByPos(i))) return true;
      return false;
    },
  });

  let seed = 1;
  const rand = Array.from({ length: N }, () => ((seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x80000000) * 1e6);
  const randList = ArrayList.of(...rand);
  const num = (a: number, b: number) => a - b;
  await compare('sort 10k random numbers', {
    'ours ArrayList': () => {
      const l = new ArrayList(randList);
      l.sort();
      return l;
    },
    'native Array': () => {
      const a = rand.slice();
      a.sort(num);
      return a;
    },
    'js-sdsl Vector': () => {
      const v = new SdslVector<number>(rand);
      v.sort(num);
      return v;
    },
  });

  await compare('removeIf half of 10k', {
    'ours ArrayList': () => {
      const l = filled(N);
      l.removeIf((x) => (x & 1) === 1);
      return l;
    },
    'native Array': () => range(N).filter((x) => (x & 1) === 0),
    'js-sdsl Vector': () => {
      const v = filledSdsl(N);
      // js-sdsl has no bulk remove; rebuild with survivors like a filter would
      const out = new SdslVector<number>();
      v.forEach((x) => {
        if ((x & 1) === 0) out.pushBack(x);
      });
      return out;
    },
  });
}
