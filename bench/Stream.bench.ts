// Stream engine vs native Array chains, native Iterator helpers and hand-written loops.
import type { Collector } from '../src/stream/Collector';
import { IntStream, Stream } from '../src/stream/Streams';
import { HashSet } from '../src/set/HashSet';
import { compare } from './harness';

// Iterator helpers aren't in the ES2020 lib typings this project compiles against
type It = any;
const values = (a: number[]): It => a.values();
const IteratorCtor = (globalThis as any).Iterator;

function nums(n: number): number[] {
  const a: number[] = [];
  let s = 12345;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    a.push(s % 1000);
  }
  return a;
}

/** Minimal array-building collector (the Collectors module isn't a dependency of this bench). */
function toArrayCollector<T>(): Collector<T, T[], T[]> {
  const chars = new HashSet<'IDENTITY_FINISH'>();
  chars.add('IDENTITY_FINISH');
  return {
    supplier: () => () => [],
    accumulator: () => (a, t) => {
      a.push(t);
    },
    combiner: () => (a, b) => a.concat(b),
    finisher: () => (a) => a,
    characteristics: () => chars as any,
  };
}

export default async function () {
  const A = nums(100_000);
  const BIG = Array.from({ length: 1_000_000 }, (_, i) => i);
  const S10K = nums(10_000);
  const OUTER = Array.from({ length: 10_000 }, (_, i) => i);
  const INNER = Array.from({ length: 10 }, (_, i) => i);
  const even = (x: number) => (x & 1) === 0;
  const triple = (x: number) => x * 3;
  const add = (a: number, b: number) => a + b;

  await compare('filter→map→sum 100k', {
    'ours Stream': () => Stream.ofArray(A).filter(even).map(triple).reduce(0, add),
    'ours IntStream': () => IntStream.ofArray(A).filter(even).map(triple).sum(),
    'native Array chain': () => A.filter(even).map(triple).reduce(add, 0),
    'native Iterator helpers': () => values(A).filter(even).map(triple).reduce(add, 0),
    'for loop': () => {
      let s = 0;
      for (let i = 0; i < A.length; i++) if (even(A[i])) s += triple(A[i]);
      return s;
    },
  });

  await compare('filter→map→toList 100k', {
    'ours toList': () => Stream.ofArray(A).filter(even).map(triple).toList(),
    'ours toArray': () => Stream.ofArray(A).filter(even).map(triple).toArray(),
    'native Array chain': () => A.filter(even).map(triple),
    'native Iterator helpers': () => values(A).filter(even).map(triple).toArray(),
    'for loop': () => {
      const out: number[] = [];
      for (let i = 0; i < A.length; i++) if (even(A[i])) out.push(triple(A[i]));
      return out;
    },
  });

  const hit = (x: number) => x % 1000 === 999;
  await compare('filter→findFirst 1M (hit at 999)', {
    'ours Stream': () => Stream.ofArray(BIG).filter(hit).map(triple).findFirst().orElse(-1),
    'native Array filter()[0]': () => BIG.filter(hit).map(triple)[0],
    'native Array find': () => {
      const r = BIG.find(hit);
      return r === undefined ? -1 : triple(r);
    },
    'native Iterator helpers': () => values(BIG).filter(hit).map(triple).find(() => true),
    'for loop': () => {
      for (let i = 0; i < BIG.length; i++) if (hit(BIG[i])) return triple(BIG[i]);
      return -1;
    },
  });

  const inc = (x: number) => x + 1;
  await compare('limit(10) of infinite iterate', {
    'ours Stream': () => Stream.iterate(0, inc).limit(10).toArray(),
    'native Array.from': () => Array.from({ length: 10 }, (_, i) => i),
    'native Iterator helpers': () => {
      let i = 0;
      return IteratorCtor.from({ next: () => ({ value: i++, done: false }) }).take(10).toArray();
    },
    'for loop': () => {
      const out: number[] = [];
      for (let x = 0; out.length < 10; x = inc(x)) out.push(x);
      return out;
    },
  });

  const byValue = (a: number, b: number) => a - b;
  await compare('distinct+sorted 10k', {
    'ours Stream': () => Stream.ofArray(S10K).distinct().sorted().toArray(),
    'ours Stream (comparator)': () => Stream.ofArray(S10K).distinct().sorted(byValue).toArray(),
    'ours IntStream': () => IntStream.ofArray(S10K).distinct().sorted().toArray(),
    'native Set+sort': () => [...new Set(S10K)].sort(byValue),
    'native Iterator helpers': () => IteratorCtor.from(new Set(S10K)).toArray().sort(byValue),
  });

  await compare('flatMap 10k×10', {
    'ours flatMap': () => Stream.ofArray(OUTER).flatMap(() => Stream.ofArray(INNER)).toArray(),
    'ours mapMulti': () =>
      Stream.ofArray(OUTER)
        .mapMulti<number>((_, sink) => {
          for (let i = 0; i < INNER.length; i++) sink(INNER[i]);
        })
        .toArray(),
    'native Array flatMap': () => OUTER.flatMap(() => INNER),
    'native Iterator helpers': () => values(OUTER).flatMap(() => INNER).toArray(),
    'for loop': () => {
      const out: number[] = [];
      for (let i = 0; i < OUTER.length; i++) for (let j = 0; j < INNER.length; j++) out.push(INNER[j]);
      return out;
    },
  });

  const col = toArrayCollector<number>();
  await compare('filter→collect(collector) 100k', {
    'ours collect': () => Stream.ofArray(A).filter(even).collect(col),
    'native Array filter': () => A.filter(even),
    'native Iterator helpers': () => values(A).filter(even).toArray(),
    'for loop': () => {
      const out: number[] = [];
      for (let i = 0; i < A.length; i++) if (even(A[i])) out.push(A[i]);
      return out;
    },
  });

  await compare('IntStream.range(0, 1e6).sum()', {
    'ours IntStream': () => IntStream.range(0, 1_000_000).sum(),
    'native Array.from+reduce': () => Array.from({ length: 1_000_000 }, (_, i) => i).reduce(add, 0),
    'native Iterator helpers': () => {
      let i = 0;
      return IteratorCtor.from({ next: () => (i < 1_000_000 ? { value: i++, done: false } : { value: undefined, done: true }) }).reduce(add, 0);
    },
    'for loop': () => {
      let s = 0;
      for (let i = 0; i < 1_000_000; i++) s += i;
      return s;
    },
  });
}
