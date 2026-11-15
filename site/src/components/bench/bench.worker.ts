// Runs one implementation of one workload from bench/isolated/workloads.ts in its own worker (its own JS
// engine instance), as in the isolated Docker run.
import { workloads, type Load } from '../../../../bench/isolated/workloads';

export interface Result { ops: number; ms: number; check: number }

const WARMUP_MS = 300;
const TIME_MS = 1000;

const load: Load = () => import('../../../../src/index');

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
      self.postMessage({ progress: (offset + now - start) / (WARMUP_MS + TIME_MS) });
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
