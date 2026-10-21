// Runs one implementation of one workload from bench/isolated/workloads.ts in its own worker (its own JS
// engine instance), so its library is the only one loaded, as in the isolated Docker run.
import { workloads, type Load } from '../../../bench/isolated/workloads';

export interface Result { ops: number; ms: number; check: number }

const WARMUP_MS = 300;
const TIME_MS = 1000;

/** collections.js reads Node's `global`; this worker runs only that library, so defining it here is contained */
const withNodeGlobal = <T>(load: () => Promise<T>) => () => {
  (globalThis as { global?: unknown }).global ??= globalThis;
  return load();
};

// static specifiers, so the bundler emits one chunk per package and a worker fetches only its own
const packages: Record<Parameters<Load>[0], () => Promise<any>> = {
  ours: () => import('../../../src/index'),
  'js-sdsl': () => import('js-sdsl'),
  // mnemonist exposes its subpaths to require() only; the browser takes the classes from its entry point
  'mnemonist/lru-map': async () => ({ default: (await import('mnemonist')).LRUMap }),
  'mnemonist/heap': async () => ({ default: (await import('mnemonist')).Heap }),
  'mnemonist/circular-buffer': async () => ({ default: (await import('mnemonist')).CircularBuffer }),
  '@datastructures-js/priority-queue': () => import('@datastructures-js/priority-queue'),
  'collections/fast-map': withNodeGlobal(() => import('collections/fast-map')),
  'collections/fast-set': withNodeGlobal(() => import('collections/fast-set')),
  'collections/lru-map': withNodeGlobal(() => import('collections/lru-map')),
  'collections/sorted-set': withNodeGlobal(() => import('collections/sorted-set')),
  'collections/heap': withNodeGlobal(() => import('collections/heap')),
  'collections/deque': withNodeGlobal(() => import('collections/deque')),
};

// adapters expect what require() returns: a CommonJS class itself, or an object of named exports
const load: Load = async (pkg) => {
  const m = await packages[pkg]();
  if (typeof m.default === 'function') return m.default;
  return m.default && typeof m.default === 'object' ? { ...m.default, ...m } : m;
};

/**
 * Rounds until `ms` have passed; returns rounds, elapsed time and the last round's checksum. Posts
 * { progress } (0..1 of warm-up plus measurement) at most every 50 ms, so the page can show a bar.
 */
function runFor(round: () => number, ms: number, offset: number) {
  let rounds = 0;
  let check = 0;
  const start = performance.now();
  let now = start;
  let posted = start;
  while (now - start < ms) {
    check = round();
    rounds++;
    now = performance.now();
    if (now - posted > 50) {
      posted = now;
      self.postMessage({ progress: (offset + now - start) / (WARMUP_MS + TIME_MS), measuring: offset > 0 });
    }
  }
  return { rounds, ms: now - start, check };
}

self.onmessage = async (e: MessageEvent<{ workload: string; impl: string }>) => {
  try {
    const w = workloads.find((x) => x.id === e.data.workload)!;
    const data = w.data();
    const impl = await w.impls[e.data.impl](load);
    const state = w.prepare?.(impl, data);
    const round = () => w.run(impl, data, state);
    runFor(round, WARMUP_MS, 0);
    const r = runFor(round, TIME_MS, WARMUP_MS);
    const result: Result = { ops: r.rounds * w.unit.perRun, ms: r.ms, check: r.check };
    self.postMessage(result);
  } catch (err) {
    self.postMessage({ error: (err as Error).message });
  }
};
