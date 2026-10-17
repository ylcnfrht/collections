import { LinkList } from 'js-sdsl';
import { LinkedList } from '../src/list/LinkedList';
import { compare } from './harness';

const N = 10_000;

export default async function () {
  await compare('LinkedList addLast 10k', {
    'ours LinkedList.addLast': () => {
      const l = new LinkedList<number>();
      for (let i = 0; i < N; i++) l.addLast(i);
      return l;
    },
    'native Array.push': () => {
      const a: number[] = [];
      for (let i = 0; i < N; i++) a.push(i);
      return a;
    },
    'js-sdsl LinkList.pushBack': () => {
      const l = new LinkList<number>();
      for (let i = 0; i < N; i++) l.pushBack(i);
      return l;
    },
  });

  await compare('LinkedList addFirst 10k', {
    'ours LinkedList.addFirst': () => {
      const l = new LinkedList<number>();
      for (let i = 0; i < N; i++) l.addFirst(i);
      return l;
    },
    'native Array.unshift': () => {
      const a: number[] = [];
      for (let i = 0; i < N; i++) a.unshift(i);
      return a;
    },
    'js-sdsl LinkList.pushFront': () => {
      const l = new LinkList<number>();
      for (let i = 0; i < N; i++) l.pushFront(i);
      return l;
    },
  });

  await compare('LinkedList fill + removeFirst drain 10k', {
    'ours LinkedList.removeFirst': () => {
      const l = new LinkedList<number>();
      for (let i = 0; i < N; i++) l.addLast(i);
      let s = 0;
      while (!l.isEmpty()) s += l.removeFirst();
      return s;
    },
    'native Array.shift': () => {
      const a: number[] = [];
      for (let i = 0; i < N; i++) a.push(i);
      let s = 0;
      while (a.length) s += a.shift()!;
      return s;
    },
    'js-sdsl LinkList.popFront': () => {
      const l = new LinkList<number>();
      for (let i = 0; i < N; i++) l.pushBack(i);
      let s = 0;
      while (!l.empty()) s += l.popFront()!;
      return s;
    },
  });

  await compare('LinkedList fill + removeLast drain 10k', {
    'ours LinkedList.removeLast': () => {
      const l = new LinkedList<number>();
      for (let i = 0; i < N; i++) l.addLast(i);
      let s = 0;
      while (!l.isEmpty()) s += l.removeLast();
      return s;
    },
    'native Array.pop': () => {
      const a: number[] = [];
      for (let i = 0; i < N; i++) a.push(i);
      let s = 0;
      while (a.length) s += a.pop()!;
      return s;
    },
    'js-sdsl LinkList.popBack': () => {
      const l = new LinkList<number>();
      for (let i = 0; i < N; i++) l.pushBack(i);
      let s = 0;
      while (!l.empty()) s += l.popBack()!;
      return s;
    },
  });

  // steady-state queue of 1k elements, 10k offer+poll pairs
  await compare('LinkedList queue churn (offer+poll) 10k', {
    'ours LinkedList offer/poll': () => {
      const l = new LinkedList<number>();
      for (let i = 0; i < 1000; i++) l.offer(i);
      let s = 0;
      for (let i = 0; i < N; i++) {
        l.offer(i);
        s += l.poll()!;
      }
      return s;
    },
    'native Array push/shift': () => {
      const a: number[] = [];
      for (let i = 0; i < 1000; i++) a.push(i);
      let s = 0;
      for (let i = 0; i < N; i++) {
        a.push(i);
        s += a.shift()!;
      }
      return s;
    },
    'js-sdsl LinkList pushBack/popFront': () => {
      const l = new LinkList<number>();
      for (let i = 0; i < 1000; i++) l.pushBack(i);
      let s = 0;
      for (let i = 0; i < N; i++) {
        l.pushBack(i);
        s += l.popFront()!;
      }
      return s;
    },
  });

  const ours = new LinkedList<number>();
  const arr: number[] = [];
  const sdsl = new LinkList<number>();
  for (let i = 0; i < N; i++) {
    ours.addLast(i);
    arr.push(i);
    sdsl.pushBack(i);
  }

  await compare('LinkedList for..of 10k', {
    'ours LinkedList for..of': () => {
      let s = 0;
      for (const x of ours) s += x;
      return s;
    },
    'native Array for..of': () => {
      let s = 0;
      for (const x of arr) s += x;
      return s;
    },
    'js-sdsl LinkList for..of': () => {
      let s = 0;
      for (const x of sdsl) s += x;
      return s;
    },
  });

  await compare('LinkedList forEach 10k', {
    'ours LinkedList.forEach': () => {
      let s = 0;
      ours.forEach((x) => (s += x));
      return s;
    },
    'native Array.forEach': () => {
      let s = 0;
      arr.forEach((x) => (s += x));
      return s;
    },
    'js-sdsl LinkList.forEach': () => {
      let s = 0;
      sdsl.forEach((x) => (s += x));
      return s;
    },
  });

  // 1k inserts at the middle of a 1k list; a cursor makes each linked insert O(1)
  const M = 1000;
  await compare('LinkedList insert 1k in the middle', {
    'ours LinkedList listIterator.add': () => {
      const l = new LinkedList<number>();
      for (let i = 0; i < M; i++) l.addLast(i);
      const it = l.listIterator(M >> 1);
      for (let i = 0; i < M; i++) it.add(i);
      return l;
    },
    'native Array.splice': () => {
      const a: number[] = [];
      for (let i = 0; i < M; i++) a.push(i);
      for (let i = 0, at = M >> 1; i < M; i++) a.splice(at++, 0, i);
      return a;
    },
    'js-sdsl LinkList.insert': () => {
      const l = new LinkList<number>();
      for (let i = 0; i < M; i++) l.pushBack(i);
      for (let i = 0, at = M >> 1; i < M; i++) l.insert(at++, i);
      return l;
    },
  });

  await compare('LinkedList fill + removeIf half of 10k', {
    'ours LinkedList.removeIf': () => {
      const l = new LinkedList<number>();
      for (let i = 0; i < N; i++) l.addLast(i);
      l.removeIf((x) => (x & 1) === 0);
      return l;
    },
    'native Array.filter': () => {
      let a: number[] = [];
      for (let i = 0; i < N; i++) a.push(i);
      a = a.filter((x) => (x & 1) !== 0);
      return a;
    },
    'js-sdsl LinkList eraseElementByIterator': () => {
      const l = new LinkList<number>();
      for (let i = 0; i < N; i++) l.pushBack(i);
      for (let it = l.begin(); !it.equals(l.end()); ) {
        if ((it.pointer & 1) === 0) it = l.eraseElementByIterator(it);
        else it.next();
      }
      return l;
    },
  });
}
