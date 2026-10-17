// Smoke benchmark proving the harness works; real files are bench/<Collection>.bench.ts.
import { compare } from './harness';

export default async function () {
  const N = 10_000;
  await compare('harness smoke: fill 10k', {
    'native Array.push': () => {
      const a: number[] = [];
      for (let i = 0; i < N; i++) a.push(i);
      return a;
    },
    'native Array prealloc': () => {
      const a = new Array<number>(N);
      for (let i = 0; i < N; i++) a[i] = i;
      return a;
    },
  }, 100);
}
