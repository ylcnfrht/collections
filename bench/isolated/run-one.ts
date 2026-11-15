// Runs one implementation of one workload in this process and prints a JSON result line.
// usage: run-one.ts <workload id> <implementation name>
import { Bench } from 'tinybench';
import { workloads, type Load } from './workloads';

// the published build of this library, not the sources
const load: Load = async () => require('../../dist/index.js');

let sink: unknown; // keeps results observable so the JIT can't drop the work

async function main() {
  const [id, name] = process.argv.slice(2);
  const w = workloads.find((x) => x.id === id);
  const factory = w?.impls[name];
  if (!w || !factory) throw new Error(`unknown workload/implementation: ${id} / ${name}`);
  const data = w.data();
  const impl = await factory(load);
  const state = w.prepare?.(impl, data);
  const check = w.run(impl, data, state);

  const bench = new Bench({ time: 1000, warmupTime: 300 });
  bench.add(name, () => {
    sink = w.run(impl, data, state);
  });
  await bench.run();
  const r = bench.tasks[0].result as { state: string; throughput?: { mean: number }; latency?: { rme: number; samplesCount?: number }; error?: Error };
  if (r.state === 'errored') throw r.error;
  if (sink !== check) throw new Error(`checksum changed between runs: ${String(sink)} vs ${check}`);
  console.log(JSON.stringify({ workload: id, impl: name, check, opsPerSec: r.throughput?.mean ?? 0, rme: r.latency?.rme ?? 0, node: process.version }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
