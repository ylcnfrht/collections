import { Bench } from 'tinybench';

export type Cases = Record<string, () => unknown>;

export interface Row {
  group: string;
  name: string;
  opsPerSec: number;
  rme: number;
}

const rows: Row[] = [];
// keeps results observable so the JIT can't drop the benchmarked work
export let sink: unknown;

/**
 * Runs every case in one group and prints ops/sec plus the ratio to the fastest.
 * Name our implementation's case starting with "ours" so the summary can find it.
 */
export async function compare(group: string, cases: Cases, time = 300): Promise<void> {
  const bench = new Bench({ time, warmupTime: 100 });
  for (const [name, fn] of Object.entries(cases)) bench.add(name, () => {
    sink = fn();
  });
  await bench.run();
  const res = bench.tasks.map((t) => {
    const r = t.result as { state: string; throughput?: { mean: number }; latency?: { rme: number }; error?: Error };
    if (r.state === 'errored') throw r.error;
    return { group, name: t.name, opsPerSec: r.throughput?.mean ?? 0, rme: r.latency?.rme ?? 0 };
  });
  const best = Math.max(...res.map((r) => r.opsPerSec));
  console.log(`\n## ${group}`);
  console.table(
    res.map((r) => ({
      name: r.name,
      'ops/sec': Math.round(r.opsPerSec).toLocaleString('en-US'),
      '±%': r.rme.toFixed(1),
      'vs fastest': (r.opsPerSec / best).toFixed(2) + 'x',
    }))
  );
  rows.push(...res);
}

/** Groups where our case is not the fastest, with the gap. */
export function losses(): { group: string; ours: number; fastest: string; ratio: number }[] {
  const out: { group: string; ours: number; fastest: string; ratio: number }[] = [];
  for (const g of new Set(rows.map((r) => r.group))) {
    const rs = rows.filter((r) => r.group === g);
    const ours = rs.find((r) => r.name.startsWith('ours'));
    const top = rs.reduce((a, b) => (b.opsPerSec > a.opsPerSec ? b : a));
    if (ours && top !== ours) out.push({ group: g, ours: ours.opsPerSec, fastest: top.name, ratio: ours.opsPerSec / top.opsPerSec });
  }
  return out;
}

export function printLosses(): void {
  const l = losses();
  console.log(l.length ? '\nNot fastest in:' : '\nFastest in every group.');
  if (l.length) console.table(l.map((x) => ({ group: x.group, 'fastest': x.fastest, 'ours / fastest': x.ratio.toFixed(2) + 'x' })));
}
