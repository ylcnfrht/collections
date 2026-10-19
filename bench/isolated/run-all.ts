// Isolated benchmark: every (workload, implementation) pair runs alone in a fresh container from the
// same image, pinned to one CPU, one after another in a shuffled order, REPS times; the median is kept.
// usage: npm run bench:isolated [-- --reps 3] [--only <workload id>]
import { execFileSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { workloads } from './workloads';

const IMAGE = 'nodestd-collections-bench';
const ROOT = join(__dirname, '../..');
const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i < 0 ? undefined : process.argv[i + 1];
};
const REPS = Number(arg('--reps') ?? 3);
const only = arg('--only');

interface Result { workload: string; impl: string; check: number; opsPerSec: number; rme: number; node: string }

function shuffle<T>(a: T[], seed = 7): T[] {
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];

function main() {
  console.log('building image ...');
  execFileSync('docker', ['build', '-q', '-f', 'bench/isolated/Dockerfile', '-t', IMAGE, '.'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });

  const selected = workloads.filter((w) => !only || w.id === only);
  const jobs = shuffle(selected.flatMap((w) => Object.keys(w.impls).flatMap((impl) => Array.from({ length: REPS }, () => ({ w: w.id, impl })))));
  const results: Result[] = [];
  jobs.forEach((j, n) => {
    const out = execFileSync('docker', [
      'run', '--rm', '--network', 'none', '--cpuset-cpus', '1', '--cpus', '1', '--memory', '2g',
      IMAGE, 'npx', 'ts-node', '--transpile-only', '-P', 'tsconfig.test.json', 'bench/isolated/run-one.ts', j.w, j.impl,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
    const r = JSON.parse(out.trim().split('\n').pop()!) as Result;
    results.push(r);
    console.log(`[${n + 1}/${jobs.length}] ${j.w} | ${j.impl}: ${Math.round(r.opsPerSec).toLocaleString('en-US')} ops/s ±${r.rme.toFixed(1)}%`);
  });

  const report = selected.map((w) => {
    const rows = Object.keys(w.impls).map((impl) => {
      const rs = results.filter((r) => r.workload === w.id && r.impl === impl);
      return { impl, opsPerSec: median(rs.map((r) => r.opsPerSec)), rme: median(rs.map((r) => r.rme)), runs: rs.map((r) => Math.round(r.opsPerSec)), check: rs[0].check };
    });
    const checks = new Set(rows.map((r) => r.check));
    if (checks.size !== 1) throw new Error(`${w.id}: implementations disagree on the result: ${JSON.stringify(rows.map((r) => [r.impl, r.check]))}`);
    const base = rows.find((r) => r.impl === w.baseline)!.opsPerSec;
    return { id: w.id, title: w.title, detail: w.detail, baseline: w.baseline, rows: rows.map((r) => ({ ...r, vsBaseline: r.opsPerSec / base })).sort((a, b) => b.opsPerSec - a.opsPerSec) };
  });

  const meta = { date: new Date().toISOString(), node: results[0]?.node, reps: REPS, docker: '--cpuset-cpus 1 --cpus 1 --memory 2g --network none' };
  writeFileSync(join(__dirname, 'results.json'), JSON.stringify({ meta, report }, null, 2) + '\n');
  for (const w of report) {
    console.log(`\n## ${w.title} (${w.detail}), relative to ${w.baseline}`);
    console.table(w.rows.map((r) => ({ implementation: r.impl, 'ops/sec': Math.round(r.opsPerSec).toLocaleString('en-US'), '±%': r.rme.toFixed(1), 'vs baseline': r.vsBaseline.toFixed(2) + 'x', runs: r.runs.join(' / ') })));
  }
  console.log('\nwrote bench/isolated/results.json');
}

main();
