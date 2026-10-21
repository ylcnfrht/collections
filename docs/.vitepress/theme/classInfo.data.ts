// Build-time facts for the class info line on the collection pages, read from the sources and from the
// generated JDK comparison report, so the line cannot drift from the code.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '../../..');
const SRC = join(ROOT, 'src');
const REPORT = join(ROOT, 'docs/COMPATIBILITY.md');

export interface ClassInfo {
  file: string;
  extends: string | null;
  compared: number;
  comparisons: number;
  excluded: number;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sourceFiles(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []));
}

/** Member rows of `<summary>Name (class)</summary>` and `Name (static)` in the report. */
function coverage(report: string, name: string) {
  let compared = 0;
  let comparisons = 0;
  let excluded = 0;
  for (const kind of ['class', 'static']) {
    const start = report.indexOf(`<summary>${name} (${kind})</summary>`);
    if (start < 0) continue;
    const block = report.slice(start, report.indexOf('</details>', start));
    for (const [, cell] of block.matchAll(/^\| [^|]+ \| ([^|]+) \|$/gm)) {
      const n = Number(cell.trim().replace(/,/g, ''));
      if (Number.isFinite(n) && n > 0) {
        compared++;
        comparisons += n;
      } else if (cell.trim().startsWith('excluded')) excluded++;
    }
  }
  return { compared, comparisons, excluded };
}

export default {
  watch: ['../../../src/**/*.ts', '../../COMPATIBILITY.md'],
  load(): Record<string, ClassInfo> {
    const report = readFileSync(REPORT, 'utf8');
    // internal base classes (e.g. TreeSet's NavigableKeySet) are not part of the API, so they are not shown
    const exported = new Set(readFileSync(join(SRC, 'index.ts'), 'utf8').match(/\b[A-Z]\w+\b/g));
    const out: Record<string, ClassInfo> = {};
    for (const f of sourceFiles(SRC)) {
      for (const [, name, base] of readFileSync(f, 'utf8').matchAll(/^export class (\w+)(?:<[^>{]*>)? extends (\w+)/gm)) {
        out[name] = { file: relative(ROOT, f), extends: exported.has(base) ? base : null, ...coverage(report, name) };
      }
    }
    return out;
  },
};
