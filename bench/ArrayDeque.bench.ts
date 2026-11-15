import { ArrayDeque } from '../src/queue/ArrayDeque';
import { compare } from './harness';

// Native unshift / shift-drain at 100k are O(n^2) (about 1 op/sec), so they are left out.
export default async function () {
  const N = 100_000;

  await compare('ArrayDeque addLast 100k', {
    'ours ArrayDeque.addLast': () => {
      const d = new ArrayDeque<number>();
      for (let i = 0; i < N; i++) d.addLast(i);
      return d;
    },
    'native Array.push': () => {
      const a: number[] = [];
      for (let i = 0; i < N; i++) a.push(i);
      return a;
    },
  });

  const STEADY = 1_000;
  await compare('ArrayDeque queue churn (size 1k, 100k offer+poll)', {
    'ours ArrayDeque offer/poll': () => {
      const d = new ArrayDeque<number>();
      for (let i = 0; i < STEADY; i++) d.offer(i);
      let s = 0;
      for (let i = 0; i < N; i++) {
        d.offer(i);
        s += d.poll() as number;
      }
      return s;
    },
    'native Array push/shift': () => {
      const a: number[] = [];
      for (let i = 0; i < STEADY; i++) a.push(i);
      let s = 0;
      for (let i = 0; i < N; i++) {
        a.push(i);
        s += a.shift() as number;
      }
      return s;
    },
  });

  await compare('ArrayDeque stack push/pop 100k', {
    'ours ArrayDeque push/pop': () => {
      const d = new ArrayDeque<number>();
      for (let i = 0; i < N; i++) d.push(i);
      let s = 0;
      for (let i = 0; i < N; i++) s += d.pop();
      return s;
    },
    'native Array push/pop': () => {
      const a: number[] = [];
      for (let i = 0; i < N; i++) a.push(i);
      let s = 0;
      for (let i = 0; i < N; i++) s += a.pop() as number;
      return s;
    },
  });

  const M = 10_000;
  const ours = new ArrayDeque<number>();
  const arr: number[] = [];
  // half via the front so the ring buffer wraps like real use
  for (let i = 0; i < M / 2; i++) {
    ours.addFirst(i);
    arr.unshift(i);
  }
  for (let i = M / 2; i < M; i++) {
    ours.addLast(i);
    arr.push(i);
  }

  await compare('ArrayDeque for..of 10k', {
    'ours ArrayDeque': () => {
      let s = 0;
      for (const x of ours) s += x;
      return s;
    },
    'native Array': () => {
      let s = 0;
      for (const x of arr) s += x;
      return s;
    },
  });

  // one hit at the far end plus one miss: two full scans
  await compare('ArrayDeque contains (primitive) 10k', {
    'ours ArrayDeque.contains': () => ours.contains(M - 1) && !ours.contains(-1),
    'native Array.includes': () => arr.includes(M - 1) && !arr.includes(-1),
  });
}
