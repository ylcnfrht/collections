import { Deque as SdslDeque } from 'js-sdsl';
import CircularBuffer from 'mnemonist/circular-buffer';
import FixedDeque from 'mnemonist/fixed-deque';
import { ArrayDeque } from '../src/queue/ArrayDeque';
import { compare } from './harness';

// Growable structures (ours with no hint, native Array, js-sdsl) and preallocated ones (ours with a
// capacity hint, mnemonist's fixed-capacity FixedDeque) are separate groups so each is apples to apples.
// Native unshift / shift-drain at 100k are O(n^2) (about 1 op/sec), so they are left out.
export default async function () {
  const N = 100_000;

  await compare('ArrayDeque addLast 100k (growable)', {
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
    'js-sdsl Deque.pushBack': () => {
      const d = new SdslDeque<number>();
      for (let i = 0; i < N; i++) d.pushBack(i);
      return d;
    },
  });

  await compare('ArrayDeque addLast 100k (preallocated)', {
    'ours ArrayDeque(N).addLast': () => {
      const d = new ArrayDeque<number>(N);
      for (let i = 0; i < N; i++) d.addLast(i);
      return d;
    },
    'mnemonist FixedDeque.push': () => {
      const d = new FixedDeque<number>(Array, N);
      for (let i = 0; i < N; i++) d.push(i);
      return d;
    },
  });

  await compare('ArrayDeque addFirst 100k (growable)', {
    'ours ArrayDeque.addFirst': () => {
      const d = new ArrayDeque<number>();
      for (let i = 0; i < N; i++) d.addFirst(i);
      return d;
    },
    'js-sdsl Deque.pushFront': () => {
      const d = new SdslDeque<number>();
      for (let i = 0; i < N; i++) d.pushFront(i);
      return d;
    },
  });

  await compare('ArrayDeque addFirst 100k (preallocated)', {
    'ours ArrayDeque(N).addFirst': () => {
      const d = new ArrayDeque<number>(N);
      for (let i = 0; i < N; i++) d.addFirst(i);
      return d;
    },
    'mnemonist FixedDeque.unshift': () => {
      const d = new FixedDeque<number>(Array, N);
      for (let i = 0; i < N; i++) d.unshift(i);
      return d;
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
    'js-sdsl Deque pushBack/popFront': () => {
      const d = new SdslDeque<number>();
      for (let i = 0; i < STEADY; i++) d.pushBack(i);
      let s = 0;
      for (let i = 0; i < N; i++) {
        d.pushBack(i);
        s += d.popFront() as number;
      }
      return s;
    },
    'mnemonist CircularBuffer push/shift': () => {
      const d = new CircularBuffer<number>(Array, STEADY + 1);
      for (let i = 0; i < STEADY; i++) d.push(i);
      let s = 0;
      for (let i = 0; i < N; i++) {
        d.push(i);
        s += d.shift() as number;
      }
      return s;
    },
  });

  await compare('ArrayDeque stack push/pop 100k (growable)', {
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
    'js-sdsl Deque pushBack/popBack': () => {
      const d = new SdslDeque<number>();
      for (let i = 0; i < N; i++) d.pushBack(i);
      let s = 0;
      for (let i = 0; i < N; i++) s += d.popBack() as number;
      return s;
    },
  });

  await compare('ArrayDeque stack push/pop 100k (preallocated)', {
    'ours ArrayDeque(N) push/pop': () => {
      const d = new ArrayDeque<number>(N);
      for (let i = 0; i < N; i++) d.push(i);
      let s = 0;
      for (let i = 0; i < N; i++) s += d.pop();
      return s;
    },
    'mnemonist FixedDeque push/pop': () => {
      const d = new FixedDeque<number>(Array, N);
      for (let i = 0; i < N; i++) d.push(i);
      let s = 0;
      for (let i = 0; i < N; i++) s += d.pop() as number;
      return s;
    },
  });

  await compare('ArrayDeque pollFirst drain 100k (growable fill + drain)', {
    'ours ArrayDeque addLast/pollFirst': () => {
      const d = new ArrayDeque<number>();
      for (let i = 0; i < N; i++) d.addLast(i);
      let s = 0;
      let x;
      while ((x = d.pollFirst()) !== null) s += x;
      return s;
    },
    'js-sdsl Deque pushBack/popFront': () => {
      const d = new SdslDeque<number>();
      for (let i = 0; i < N; i++) d.pushBack(i);
      let s = 0;
      while (d.size()) s += d.popFront() as number;
      return s;
    },
  });

  await compare('ArrayDeque pollFirst drain 100k (preallocated fill + drain)', {
    'ours ArrayDeque(N) addLast/pollFirst': () => {
      const d = new ArrayDeque<number>(N);
      for (let i = 0; i < N; i++) d.addLast(i);
      let s = 0;
      let x;
      while ((x = d.pollFirst()) !== null) s += x;
      return s;
    },
    'mnemonist FixedDeque push/shift': () => {
      const d = new FixedDeque<number>(Array, N);
      for (let i = 0; i < N; i++) d.push(i);
      let s = 0;
      while (d.size) s += d.shift() as number;
      return s;
    },
  });

  const M = 10_000;
  const ours = new ArrayDeque<number>();
  const arr: number[] = [];
  const sdsl = new SdslDeque<number>();
  const mn = new FixedDeque<number>(Array, M);
  // half via the front so the ring buffers wrap like real use
  for (let i = 0; i < M / 2; i++) {
    ours.addFirst(i);
    arr.unshift(i);
    sdsl.pushFront(i);
    mn.unshift(i);
  }
  for (let i = M / 2; i < M; i++) {
    ours.addLast(i);
    arr.push(i);
    sdsl.pushBack(i);
    mn.push(i);
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
    'js-sdsl Deque': () => {
      let s = 0;
      for (const x of sdsl) s += x;
      return s;
    },
    'mnemonist FixedDeque': () => {
      let s = 0;
      for (const x of mn) s += x;
      return s;
    },
  });

  // one hit at the far end plus one miss: two full scans
  await compare('ArrayDeque contains (primitive) 10k', {
    'ours ArrayDeque.contains': () => ours.contains(M - 1) && !ours.contains(-1),
    'native Array.includes': () => arr.includes(M - 1) && !arr.includes(-1),
    'js-sdsl Deque.find': () => !sdsl.find(M - 1).equals(sdsl.end()) && sdsl.find(-1).equals(sdsl.end()),
  });
}
