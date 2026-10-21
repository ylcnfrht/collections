// Runs one implementation of one workload in its own worker (its own JS engine instance), the same
// test as the isolated benchmark: bench/isolated/workloads.ts, hashmap-get-int and hashmap-put-string.
import { HashMap } from '../../../src/index';

export type Workload = 'hashmap-get-int' | 'hashmap-put-string';
export type Impl = 'ours' | 'native';
export interface Result { ops: number; ms: number; check: number }

const N = 100_000;
const WARMUP_MS = 300;
const TIME_MS = 1000;

function makeRound(workload: Workload, impl: Impl): () => number {
  if (workload === 'hashmap-get-int') {
    const keys = Array.from({ length: N }, (_, i) => i);
    if (impl === 'ours') {
      const m = new HashMap<number, number>();
      for (let i = 0; i < N; i++) m.put(keys[i], i);
      return () => {
        let s = 0;
        for (let i = 0; i < N; i++) s += m.get(keys[i]) ?? 0;
        return s;
      };
    }
    const m = new Map<number, number>();
    for (let i = 0; i < N; i++) m.set(keys[i], i);
    return () => {
      let s = 0;
      for (let i = 0; i < N; i++) s += m.get(keys[i]) ?? 0;
      return s;
    };
  }
  const keys = Array.from({ length: N }, (_, i) => 'key' + i);
  if (impl === 'ours') {
    return () => {
      const m = new HashMap<string, number>();
      for (let i = 0; i < N; i++) m.put(keys[i], i);
      return m.size();
    };
  }
  return () => {
    const m = new Map<string, number>();
    for (let i = 0; i < N; i++) m.set(keys[i], i);
    return m.size;
  };
}

/** Rounds until `ms` have passed; returns rounds, elapsed time and the last round's checksum. */
function runFor(round: () => number, ms: number) {
  let rounds = 0;
  let check = 0;
  const start = performance.now();
  let now = start;
  while (now - start < ms) {
    check = round();
    rounds++;
    now = performance.now();
  }
  return { rounds, ms: now - start, check };
}

self.onmessage = (e: MessageEvent<{ workload: Workload; impl: Impl }>) => {
  const round = makeRound(e.data.workload, e.data.impl);
  runFor(round, WARMUP_MS);
  const r = runFor(round, TIME_MS);
  const result: Result = { ops: r.rounds * N, ms: r.ms, check: r.check };
  self.postMessage(result);
};
