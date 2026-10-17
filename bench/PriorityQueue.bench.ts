import { MinPriorityQueue, PriorityQueue as DsPQ } from '@datastructures-js/priority-queue';
import { PriorityQueue as SdslPQ } from 'js-sdsl';
import Heap from 'mnemonist/heap';
import { PriorityQueue } from '../src/queue/PriorityQueue';
import { compare } from './harness';
import { SimpleList } from '../tests/support';

function randoms(n: number, seed: number): number[] {
  let s = seed;
  return Array.from({ length: n }, () => {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    return s;
  });
}

const asc = (a: number, b: number) => a - b;

function sortedInsert(a: number[], v: number): void {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const m = (lo + hi) >>> 1;
    if (a[m] > v) lo = m + 1;
    else hi = m;
  }
  a.splice(lo, 0, v); // descending, so the minimum pops off the end
}

interface Task {
  pri: number;
  id: number;
}

export default async function () {
  const N = 100_000;
  const xs = randoms(N, 1);

  await compare('offer 100k random numbers', {
    ours: () => {
      const q = new PriorityQueue<number>();
      for (let i = 0; i < N; i++) q.offer(xs[i]);
      return q;
    },
    'ours (comparator)': () => {
      const q = new PriorityQueue<number>(asc);
      for (let i = 0; i < N; i++) q.offer(xs[i]);
      return q;
    },
    'datastructures-js MinPriorityQueue': () => {
      const q = new MinPriorityQueue<number>();
      for (let i = 0; i < N; i++) q.enqueue(xs[i]);
      return q;
    },
    'mnemonist Heap': () => {
      const q = new Heap<number>();
      for (let i = 0; i < N; i++) q.push(xs[i]);
      return q;
    },
    'js-sdsl PriorityQueue': () => {
      const q = new SdslPQ<number>([], asc);
      for (let i = 0; i < N; i++) q.push(xs[i]);
      return q;
    },
    'baseline push + sort': () => xs.slice().sort(asc),
  }, 600);

  await compare('offer + poll all 100k (heap sort)', {
    ours: () => {
      const q = new PriorityQueue<number>();
      for (let i = 0; i < N; i++) q.offer(xs[i]);
      let s = 0;
      for (let i = 0; i < N; i++) s += q.poll() as number;
      return s;
    },
    'datastructures-js MinPriorityQueue': () => {
      const q = new MinPriorityQueue<number>();
      for (let i = 0; i < N; i++) q.enqueue(xs[i]);
      let s = 0;
      for (let i = 0; i < N; i++) s += q.dequeue() as number;
      return s;
    },
    'mnemonist Heap': () => {
      const q = new Heap<number>();
      for (let i = 0; i < N; i++) q.push(xs[i]);
      let s = 0;
      for (let i = 0; i < N; i++) s += q.pop() as number;
      return s;
    },
    'js-sdsl PriorityQueue': () => {
      const q = new SdslPQ<number>([], asc);
      for (let i = 0; i < N; i++) q.push(xs[i]);
      let s = 0;
      for (let i = 0; i < N; i++) s += q.pop() as number;
      return s;
    },
    'baseline push + sort': () => {
      const a = xs.slice().sort(asc);
      let s = 0;
      for (let i = 0; i < N; i++) s += a[i];
      return s;
    },
  }, 600);

  const K = 1000;
  const churn = randoms(N, 2);
  const seed = xs.slice(0, K);
  await compare('steady churn (size 1k, 100k offer/poll)', {
    ours: () => {
      const q = new PriorityQueue<number>();
      for (let i = 0; i < K; i++) q.offer(seed[i]);
      let s = 0;
      for (let i = 0; i < N; i++) {
        q.offer(churn[i]);
        s += q.poll() as number;
      }
      return s;
    },
    'datastructures-js MinPriorityQueue': () => {
      const q = new MinPriorityQueue<number>();
      for (let i = 0; i < K; i++) q.enqueue(seed[i]);
      let s = 0;
      for (let i = 0; i < N; i++) {
        q.enqueue(churn[i]);
        s += q.dequeue() as number;
      }
      return s;
    },
    'mnemonist Heap': () => {
      const q = new Heap<number>();
      for (let i = 0; i < K; i++) q.push(seed[i]);
      let s = 0;
      for (let i = 0; i < N; i++) {
        q.push(churn[i]);
        s += q.pop() as number;
      }
      return s;
    },
    'js-sdsl PriorityQueue': () => {
      const q = new SdslPQ<number>([], asc);
      for (let i = 0; i < K; i++) q.push(seed[i]);
      let s = 0;
      for (let i = 0; i < N; i++) {
        q.push(churn[i]);
        s += q.pop() as number;
      }
      return s;
    },
    'baseline sorted array': () => {
      const a = seed.slice().sort((x, y) => y - x);
      let s = 0;
      for (let i = 0; i < N; i++) {
        sortedInsert(a, churn[i]);
        s += a.pop() as number;
      }
      return s;
    },
  }, 600);

  const M = 10_000;
  const tasks: Task[] = randoms(M, 3).map((pri, id) => ({ pri: pri % 1000, id }));
  const byTask = (a: Task, b: Task) => a.pri - b.pri || a.id - b.id;
  await compare('objects, custom comparator, offer + poll 10k', {
    ours: () => {
      const q = new PriorityQueue<Task>(byTask);
      for (let i = 0; i < M; i++) q.offer(tasks[i]);
      let s = 0;
      for (let i = 0; i < M; i++) s += (q.poll() as Task).id;
      return s;
    },
    'datastructures-js PriorityQueue': () => {
      const q = new DsPQ<Task>(byTask);
      for (let i = 0; i < M; i++) q.enqueue(tasks[i]);
      let s = 0;
      for (let i = 0; i < M; i++) s += (q.dequeue() as Task).id;
      return s;
    },
    'mnemonist Heap': () => {
      const q = new Heap<Task>(byTask);
      for (let i = 0; i < M; i++) q.push(tasks[i]);
      let s = 0;
      for (let i = 0; i < M; i++) s += (q.pop() as Task).id;
      return s;
    },
    'js-sdsl PriorityQueue': () => {
      const q = new SdslPQ<Task>([], byTask);
      for (let i = 0; i < M; i++) q.push(tasks[i]);
      let s = 0;
      for (let i = 0; i < M; i++) s += (q.pop() as Task).id;
      return s;
    },
    'baseline push + sort': () => {
      const a = tasks.slice().sort(byTask);
      let s = 0;
      for (let i = 0; i < M; i++) s += a[i].id;
      return s;
    },
  }, 600);

  const list = SimpleList.of(...xs);
  await compare('heapify 100k via constructor', {
    ours: () => PriorityQueue.of(...xs),
    'ours (from collection)': () => new PriorityQueue<number>(list),
    'datastructures-js MinPriorityQueue.fromArray': () => MinPriorityQueue.fromArray(xs.slice()),
    'mnemonist Heap.from': () => Heap.from(xs),
    'js-sdsl PriorityQueue (copy)': () => new SdslPQ<number>(xs, asc),
    'baseline sort': () => xs.slice().sort(asc),
  }, 600);

  const ours = PriorityQueue.of(...xs);
  const ds = MinPriorityQueue.fromArray(xs.slice());
  const mn = Heap.from(xs);
  const sd = new SdslPQ<number>(xs, asc);
  const sorted = xs.slice().sort(asc);
  await compare('peek loop 100k', {
    ours: () => {
      let s = 0;
      for (let i = 0; i < N; i++) s += ours.peek() as number;
      return s;
    },
    'datastructures-js MinPriorityQueue': () => {
      let s = 0;
      for (let i = 0; i < N; i++) s += ds.front() as number;
      return s;
    },
    'mnemonist Heap': () => {
      let s = 0;
      for (let i = 0; i < N; i++) s += mn.peek() as number;
      return s;
    },
    'js-sdsl PriorityQueue': () => {
      let s = 0;
      for (let i = 0; i < N; i++) s += sd.top() as number;
      return s;
    },
    'baseline sorted array': () => {
      let s = 0;
      for (let i = 0; i < N; i++) s += sorted[0];
      return s;
    },
  }, 600);
}
