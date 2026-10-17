// Differential harness entry point: generate scripts, run them on the reference JDK (ref.sh) and on our
// library (tsRunner), compare line by line, shrink each distinct divergence and report.
//   ts-node --transpile-only tools/differential/main.ts [--seed 1] [--count 2000] [--batch 2000]
//     [--targets ArrayList,Stream] [--no-shrink] [--script file] [--out dir]
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { generate, Script, scriptText } from './gen';
import { assess } from './assessments';
import { isKnown } from './known';
import { runScripts } from './tsRunner';

export const REF_SH = path.join(__dirname, 'ref.sh');

export function refAvailable(): boolean {
  return spawnSync('sh', [REF_SH, '--check'], { stdio: 'inherit' }).status === 0;
}

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ts-cf-diff-'));

/** Runs scripts on the reference side; returns id -> output lines. */
export function runRef(scripts: Script[], timeoutMs = 600_000): Map<string, string[]> {
  const dir = tmpDir();
  const inFile = path.join(dir, 'scripts.txt');
  const outFile = path.join(dir, 'ref.out');
  fs.writeFileSync(inFile, scripts.map(scriptText).join(''));
  const r = spawnSync('sh', [REF_SH, inFile, outFile], { stdio: ['ignore', 'inherit', 'inherit'], timeout: timeoutMs, killSignal: 'SIGKILL' });
  if (r.status !== 0) throw new Error(`reference runner failed (status ${r.status})`);
  const out = parseOutput(fs.readFileSync(outFile, 'utf8'));
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

export function runOurs(scripts: Script[]): Map<string, string[]> {
  return parseOutput(runScripts(scripts.map(scriptText).join('')));
}

function parseOutput(text: string): Map<string, string[]> {
  const m = new Map<string, string[]>();
  let cur: string[] = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('@')) m.set(line.slice(1), (cur = []));
    else if (line !== '') cur.push(line);
  }
  return m;
}

export interface Divergence {
  script: Script;
  line: number; // index into script.lines
  ref: string;
  ours: string;
  signature: string;
}

const kindOf = (s: string) => (s.startsWith('EXC:') ? s.split(' ')[0] : s === 'DEAD' ? 'DEAD' : 'value');

/** Groups divergences that are most likely the same root cause. */
function signature(s: Script, line: number, ref: string, ours: string): string {
  const l = s.lines[line];
  let opName = l.split(' ')[0];
  if (opName === 'x') opName = `x:${l.split(' ')[1]}`;
  if (opName === 'pipe') {
    const stages = l.slice(5).split(' | ');
    const term = stages[stages.length - 1].split(' ');
    opName = `pipe:${term[0]}${term[0] === 'collect' ? ':' + term[1] : ''}`;
  }
  // result vs state divergence
  const [rr, rs] = ref.split(' ;; ');
  const [or, os_] = ours.split(' ;; ');
  const where = rr !== or ? 'result' : rs !== os_ ? 'state' : 'log';
  // view arguments (ranges, type tags) do not matter for grouping
  const type = s.type.split('/').map((seg) => seg.split(':')[0]).join('/');
  return `${type} ${opName} ${where} ref=${kindOf(rr)} ours=${kindOf(or)}`;
}

/**
 * Exploration aid (--relax): treat ArrayIndexOutOfBoundsException like its superclass IndexOutOfBoundsException, so the
 * known Vector/List.of exception-class divergence does not end the comparison of those scripts early.
 */
let relax = false;
const relaxed = (l: string[]) => (relax ? l.map((x) => x.replace(/EXC:ArrayIndexOutOfBoundsException/g, 'EXC:IndexOutOfBoundsException')) : l);

/** Lines actually compared for a script: up to and including its first divergence, DEAD lines excluded. */
export function comparedLines(s: Script, ref: Map<string, string[]>, ours: Map<string, string[]>): number {
  const a = relaxed(ref.get(s.id) ?? []);
  const b = relaxed(ours.get(s.id) ?? []);
  let n = 0;
  for (let i = 0; i < s.lines.length; i++) {
    if (a[i] !== 'DEAD') n++;
    if (a[i] !== b[i]) break;
  }
  return n;
}

export function compare(scripts: Script[], ref: Map<string, string[]>, ours: Map<string, string[]>): Divergence[] {
  const out: Divergence[] = [];
  for (const s of scripts) {
    const a = relaxed(ref.get(s.id) ?? []);
    const b = relaxed(ours.get(s.id) ?? []);
    for (let i = 0; i < s.lines.length; i++) {
      if (a[i] !== b[i]) {
        out.push({ script: s, line: i, ref: a[i], ours: b[i], signature: signature(s, i, a[i] ?? '<missing>', b[i] ?? '<missing>') });
        break;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- shrinking

/** One-step simplifications of a script: drop a line, drop a pipeline stage, drop a list/map literal element. */
function candidates(s: Script): Script[] {
  const out: Script[] = [];
  const mk = (lines: string[]) => out.push({ id: `${s.id}~${out.length}`, type: s.type, lines });
  const first = s.lines[0]?.startsWith('init ') ? 1 : 0;
  for (let i = first; i < s.lines.length; i++) mk([...s.lines.slice(0, i), ...s.lines.slice(i + 1)]);
  s.lines.forEach((l, i) => {
    if (l.startsWith('pipe ')) {
      const st = l.slice(5).split(' | ');
      for (let j = 1; j < st.length - 1; j++) {
        // keep the mandatory limit after an infinite source
        if (j === 1 && /^(iterate2|generate|iiterate2|igenerate|lgenerate|dgenerate|literate2|diterate2) /.test(st[0])) continue;
        const ns = [...st.slice(0, j), ...st.slice(j + 1)];
        mk(s.lines.map((x, k) => (k === i ? 'pipe ' + ns.join(' | ') : x)));
      }
    }
    // literal elements
    const toks = l.split(' ');
    toks.forEach((tok, ti) => {
      if (!/^[[{].+[\]}]$/.test(tok)) return;
      const items = tok.slice(1, -1).split(',');
      for (let e = 0; e < items.length; e++) {
        const nt = tok[0] + [...items.slice(0, e), ...items.slice(e + 1)].join(',') + tok[tok.length - 1];
        mk(s.lines.map((x, k) => (k === i ? toks.map((y, yi) => (yi === ti ? nt : y)).join(' ') : x)));
      }
    });
  });
  return out;
}

export function shrink(d: Divergence, log = (_: string) => {}): Divergence {
  let best = d;
  for (let round = 0; round < 200; round++) {
    const cands = candidates(best.script);
    if (cands.length === 0) break;
    const divs = compare(cands, runRef(cands), runOurs(cands));
    const hit = cands.map((c) => divs.find((x) => x.script === c && x.signature === d.signature)).find((x) => x !== undefined);
    if (!hit) break;
    best = { ...hit, script: { ...hit.script, id: d.script.id } };
    log('.');
  }
  return best;
}

/** Shrinks many divergences at once: each round runs every candidate of every unfinished divergence in one batch. */
export function shrinkMany(
  ds: Divergence[],
  log = (_: string) => {},
  /** extra condition for accepting a smaller script (e.g. the same assessment as the original) */
  same: (orig: Divergence, cand: Divergence) => boolean = () => true
): Divergence[] {
  const best = [...ds];
  const done = ds.map(() => false);
  for (let round = 0; round < 200 && done.some((x) => !x); round++) {
    const cands: { i: number; s: Script }[] = [];
    best.forEach((d, i) => {
      if (done[i]) return;
      const cs = candidates({ ...d.script, id: `${i}` }).map((c, j) => ({ i, s: { ...c, id: `${i}~${j}` } }));
      if (cs.length === 0) done[i] = true;
      cands.push(...cs);
    });
    if (cands.length === 0) break;
    const scripts = cands.map((c) => c.s);
    const divs = compare(scripts, runRef(scripts), runOurs(scripts));
    const byId = new Map(divs.map((d) => [d.script.id, d]));
    best.forEach((d, i) => {
      if (done[i]) return;
      const hit = cands
        .filter((c) => c.i === i)
        .map((c) => byId.get(c.s.id))
        .find((x) => x !== undefined && x.signature === d.signature && same(ds[i], x));
      if (hit) best[i] = { ...hit, script: { ...hit.script, id: ds[i].script.id } };
      else done[i] = true;
    });
    log('.');
  }
  return best;
}

// ---------------------------------------------------------------- driver

export interface Options {
  seed: number;
  count: number;
  batch: number;
  targets?: string[];
  shrink: boolean;
  maxShrink: number;
  quiet?: boolean;
}

export interface Result {
  perTarget: Record<string, number>;
  total: number;
  divergences: Divergence[];
  groups: { signature: string; count: number; example: Divergence; minimal?: Divergence }[];
}

export function runDifferential(o: Options): Result {
  const say = (s: string) => o.quiet || process.stdout.write(s);
  const perTarget: Record<string, number> = {};
  const divergences: Divergence[] = [];
  let total = 0;
  for (let b = 0; total < o.count; b++) {
    const n = Math.min(o.batch, o.count - total);
    const scripts = generate(o.seed + b, n, o.targets);
    for (const s of scripts) perTarget[s.type] = (perTarget[s.type] ?? 0) + 1;
    const divs = compare(scripts, runRef(scripts), runOurs(scripts));
    divergences.push(...divs);
    total += n;
    say(`batch seed=${o.seed + b}: ${n} scripts, ${divs.length} divergent\n`);
  }
  const bySig = new Map<string, Divergence[]>();
  for (const d of divergences) bySig.set(d.signature, [...(bySig.get(d.signature) ?? []), d]);
  const groups = [...bySig.entries()].map(([signature, ds]) => ({
    signature,
    count: ds.length,
    // shortest example shrinks fastest
    example: ds.reduce((a, x) => (scriptText(x.script).length < scriptText(a.script).length ? x : a)),
  })) as Result['groups'];
  groups.sort((a, b) => b.count - a.count);
  if (o.shrink) {
    groups.slice(0, o.maxShrink).forEach((g) => {
      say(`shrinking ${g.signature} `);
      g.minimal = shrink(g.example, say);
      say('\n');
    });
  }
  return { perTarget, total, divergences, groups };
}

export function formatReport(r: Result): string {
  const lines: string[] = [];
  lines.push(`scripts: ${r.total}`);
  lines.push('per target: ' + Object.entries(r.perTarget).sort().map(([k, v]) => `${k}=${v}`).join(' '));
  lines.push(`divergent scripts: ${r.divergences.length} in ${r.groups.length} distinct signature(s)`);
  for (const g of r.groups) {
    const d = g.minimal ?? g.example;
    lines.push('', `== ${g.signature}  (${g.count} script(s); e.g. ${g.example.script.id})${isKnown(g.signature) ? '  [known, see known.ts]' : ''}`);
    const a = assess(g.signature, d);
    if (a.category !== 'unassessed') lines.push(`   assessed (${a.category}): ${a.note}`);
    lines.push(...scriptText(d.script).trimEnd().split('\n').map((l, i) => (i === d.line + 1 ? `>> ${l}` : `   ${l}`)));
    lines.push(`   ref : ${d.ref}`, `   ours: ${d.ours}`);
  }
  return lines.join('\n');
}

function cli(): void {
  const args = process.argv.slice(2);
  const get = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  if (!refAvailable()) {
    console.log('differential: no reference JDK (>= 23) found on PATH; skipping.');
    process.exit(0);
  }
  const scriptFile = get('--script');
  if (scriptFile) {
    // reproduce: run a saved script file on both sides and print both outputs
    const text = fs.readFileSync(scriptFile, 'utf8');
    const scripts: Script[] = text.split(/^(?=@)/m).filter((x) => x.trim()).map((chunk) => {
      const [head, ...lines] = chunk.trim().split('\n');
      const [id, type] = head.slice(1).split(' ');
      return { id, type, lines };
    });
    const ref = runRef(scripts);
    const ours = runOurs(scripts);
    for (const s of scripts) {
      console.log(`@${s.id} ${s.type}`);
      s.lines.forEach((l, i) => {
        const a = ref.get(s.id)?.[i];
        const b = ours.get(s.id)?.[i];
        console.log(`${a === b ? '  ' : '!!'} ${l}\n     ref : ${a}${a === b ? '' : `\n     ours: ${b}`}`);
      });
    }
    process.exit(compare(scripts, ref, ours).length ? 1 : 0);
  }
  relax = args.includes('--relax');
  const r = runDifferential({
    seed: Number(get('--seed') ?? 1),
    count: Number(get('--count') ?? 2000),
    batch: Number(get('--batch') ?? 2000),
    targets: get('--targets')?.split(','),
    shrink: !args.includes('--no-shrink'),
    maxShrink: Number(get('--max-shrink') ?? 40),
  });
  const report = formatReport(r);
  console.log('\n' + report);
  const outDir = get('--out');
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'report.txt'), report + '\n');
  }
  process.exit(r.divergences.length ? 1 : 0);
}

if (require.main === module) cli();
