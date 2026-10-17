// Compatibility proof run: a large seeded differential run across all targets, split over worker processes, with API
// coverage instrumentation on the library side. Writes docs/COMPATIBILITY.md (generated; do not edit by hand).
//   ts-node --transpile-only -P tsconfig.test.json tools/differential/proof.ts [--scripts 200000] [--batch 5000]
//     [--workers N] [--seed 1] [--out docs/COMPATIBILITY.md] [--max-shrink 80]
import { fork, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { assess } from './assessments';
import type { CoverageData } from './coverage';
import { generate, Script, scriptText } from './gen';
import { comparedLines, compare, Divergence, REF_SH, refAvailable, runOurs, runRef, shrinkMany } from './main';

interface WorkerResult {
  perTarget: Record<string, number>;
  scripts: number;
  ops: number;
  divergences: Divergence[];
  divCounts: Record<string, number>;
  coverage: CoverageData;
}

const EXAMPLES_PER_SIGNATURE = 3;

/** Worker: runs the given batch seeds with coverage on, returns aggregated results. */
function worker(seeds: number[], batch: number): WorkerResult {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cov = require('./coverage') as typeof import('./coverage');
  cov.install();
  const res: WorkerResult = { perTarget: {}, scripts: 0, ops: 0, divergences: [], divCounts: {}, coverage: { counts: {}, impls: {} } };
  for (const seed of seeds) {
    const scripts = generate(seed, batch);
    const ref = runRef(scripts);
    const ours = runOurs(scripts);
    for (const s of scripts) {
      const key = s.type.split('/')[0];
      res.perTarget[key] = (res.perTarget[key] ?? 0) + 1;
      res.ops += comparedLines(s, ref, ours);
    }
    res.scripts += scripts.length;
    for (const d of compare(scripts, ref, ours)) {
      res.divCounts[d.signature] = (res.divCounts[d.signature] ?? 0) + 1;
      if (res.divergences.filter((x) => x.signature === d.signature).length < EXAMPLES_PER_SIGNATURE) res.divergences.push(d);
    }
    process.send?.({ progress: seed });
  }
  res.coverage = cov.snapshot();
  return res;
}

function arg(args: string[], k: string): string | undefined {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === '--worker') {
    const { seeds, batch } = JSON.parse(args[1]);
    const r = worker(seeds, batch);
    process.send!({ result: r }, () => process.exit(0));
    return;
  }
  if (!refAvailable()) {
    console.log('proof: no reference JDK (>= 23) found on PATH; skipping.');
    process.exit(0);
  }
  const total = Number(arg(args, '--scripts') ?? 200000);
  const batch = Number(arg(args, '--batch') ?? 5000);
  const seed = Number(arg(args, '--seed') ?? 1);
  const workers = Number(arg(args, '--workers') ?? Math.max(1, Math.min(8, os.cpus().length - 2)));
  const out = arg(args, '--out') ?? path.join(__dirname, '../../docs/COMPATIBILITY.md');
  const maxShrink = Number(arg(args, '--max-shrink') ?? 400);
  const nBatches = Math.ceil(total / batch);
  const seeds = Array.from({ length: nBatches }, (_, i) => seed + i);
  const started = Date.now();
  console.log(`proof: ${nBatches} batches of ${batch} scripts (seeds ${seed}..${seed + nBatches - 1}) on ${workers} workers`);

  const parts = Array.from({ length: workers }, (_, w) => seeds.filter((_, i) => i % workers === w)).filter((p) => p.length > 0);
  let done = 0;
  const results = await Promise.all(
    parts.map(
      (ss) =>
        new Promise<WorkerResult>((resolve, reject) => {
          const child = fork(__filename, ['--worker', JSON.stringify({ seeds: ss, batch })], {
            execArgv: ['-r', 'ts-node/register/transpile-only'],
            env: { ...process.env, TS_NODE_PROJECT: path.join(__dirname, '../../tsconfig.test.json') },
          });
          child.on('message', (m: any) => {
            if (m.progress !== undefined) process.stdout.write(`\rproof: ${++done}/${nBatches} batches`);
            if (m.result) resolve(m.result);
          });
          child.on('exit', (code) => code !== 0 && reject(new Error(`worker exited with ${code}`)));
        })
    )
  );
  console.log('');

  const merged: WorkerResult = { perTarget: {}, scripts: 0, ops: 0, divergences: [], divCounts: {}, coverage: { counts: {}, impls: {} } };
  const { mergeCoverage } = require('./coverage') as typeof import('./coverage');
  for (const r of results) {
    for (const [k, v] of Object.entries(r.perTarget)) merged.perTarget[k] = (merged.perTarget[k] ?? 0) + v;
    merged.scripts += r.scripts;
    merged.ops += r.ops;
    for (const [k, v] of Object.entries(r.divCounts)) merged.divCounts[k] = (merged.divCounts[k] ?? 0) + v;
    merged.divergences.push(...r.divergences);
    mergeCoverage(merged.coverage, r.coverage);
  }

  // shrink one example per signature (largest groups first)
  const sigs = Object.keys(merged.divCounts).sort((a, b) => merged.divCounts[b] - merged.divCounts[a]);
  const minimal = new Map<string, Divergence>();
  const toShrink = sigs.slice(0, maxShrink).map(
    (sig) => merged.divergences.filter((d) => d.signature === sig).sort((a, b) => scriptText(a.script).length - scriptText(b.script).length)[0]
  );
  process.stdout.write(`proof: shrinking ${toShrink.length} divergence(s) `);
  // a smaller script must keep the original's assessment (dropping a stage can change element types)
  const same = (o: Divergence, c: Divergence) => assess(o.signature, o).note === assess(c.signature, c).note;
  shrinkMany(toShrink, (x) => process.stdout.write(x), same).forEach((d, i) => minimal.set(sigs[i], d));
  console.log('');

  const version = spawnSync('sh', [REF_SH, '--version'], { encoding: 'utf8' }).stdout.trim();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { writeReport } = require('./report') as typeof import('./report');
  const md = writeReport({
    version,
    seeds: [seed, seed + nBatches - 1],
    batch,
    workers,
    seconds: Math.round((Date.now() - started) / 1000),
    perTarget: merged.perTarget,
    scripts: merged.scripts,
    ops: merged.ops,
    coverage: merged.coverage,
    divergences: sigs.map((sig) => {
      const ex = merged.divergences.find((d) => d.signature === sig)!;
      return { signature: sig, count: merged.divCounts[sig], example: ex, minimal: minimal.get(sig), assessment: assess(sig, minimal.get(sig) ?? ex) };
    }),
  });
  if (/j\x61va/i.test(md)) throw new Error('report must not mention the reference platform by name');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, md);
  const unexplained = sigs.filter((sig) => assess(sig, minimal.get(sig) ?? merged.divergences.find((d) => d.signature === sig)!).category === 'unassessed');
  console.log(`proof: ${merged.scripts} scripts, ${merged.ops} ops compared, ${sigs.length} divergence signature(s), ${unexplained.length} unassessed -> ${out}`);
  process.exit(unexplained.length > 0 ? 1 : 0);
}

export type { Script };
main().catch((e) => {
  console.error(e);
  process.exit(2);
});
