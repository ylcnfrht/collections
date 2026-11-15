// Doctest: every ```ts block in docs/ and README.md runs against the library, and every
// `console.log(...)` that carries a `// → expected` comment must print exactly that, in order.
// Blocks fenced as ```ts nocheck are skipped (signatures, pseudo-code, intentionally failing code).
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { inspect } from 'util';
import * as ts from 'typescript';
import * as lib from '../src';

const ROOT = join(__dirname, '..');

function markdownFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    // docs/api is generated from the sources by typedoc, and not committed
    if (statSync(p).isDirectory()) return p === join(ROOT, 'docs', 'api') ? [] : markdownFiles(p);
    return p.endsWith('.md') && !p.endsWith('COMPATIBILITY.md') ? [p] : [];
  });
}

interface Block {
  file: string;
  line: number;
  code: string;
}

function blocks(file: string): Block[] {
  const out: Block[] = [];
  const lines = readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^```(ts|typescript)\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const start = i;
    const body: string[] = [];
    for (i++; i < lines.length && !lines[i].startsWith('```'); i++) body.push(lines[i]);
    if (!/\bnocheck\b/.test(m[2])) out.push({ file, line: start + 1, code: body.join('\n') });
  }
  return out;
}

/** What console.log really prints: strings as-is, everything else through util.inspect (as Node does). */
function show(v: unknown): string {
  return typeof v === 'string' ? v : inspect(v, { breakLength: Infinity });
}

function expectations(code: string): string[] {
  return code
    .split('\n')
    // the arrow comment may follow other code on the line, e.g. `catch (e) { console.log(e.name); } // → …`
    .map((l) => /console\.log\(.*\/\/\s*→\s?(.*)$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => m[1].trimEnd());
}

function run(block: Block): string[] {
  const js = ts.transpileModule(block.code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const printed: string[] = [];
  // same realm as the library, so arrays/Maps created in examples are the ones the library expects
  const requireLib = (id: string) => {
    if (id === '@ylcnfrht/typescript-collection-framework') return lib;
    throw new Error(`docs may only import '@ylcnfrht/typescript-collection-framework' (got ${id})`);
  };
  const log = { log: (...a: unknown[]) => printed.push(a.map(show).join(' ')) };
  const fn = new Function('require', 'exports', 'module', 'console', js + `\n//# sourceURL=${relative(ROOT, block.file)}:${block.line}`);
  fn(requireLib, {}, { exports: {} }, log);
  return printed;
}

const files = [join(ROOT, 'README.md'), ...markdownFiles(join(ROOT, 'docs'))];

describe.each(files.map((f) => [relative(ROOT, f), f]))('%s', (_name, file) => {
  const bs = blocks(file);
  if (bs.length === 0) {
    it('has no runnable examples', () => undefined);
    return;
  }
  it.each(bs.map((b) => [b.line, b]))('example at line %i runs and prints what it claims', (_line, b) => {
    // `using` needs Symbol.dispose, which older runtimes lack
    if (/^\s*using\s/m.test((b as Block).code) && typeof Symbol.dispose !== 'symbol') return;
    const printed = run(b as Block);
    const expected = expectations((b as Block).code);
    // only lines carrying an expectation are compared; extra logs without one are allowed only if none expect
    if (expected.length > 0) expect(printed).toEqual(expected);
  });
});

describe('docs examples type-check', () => {
  it('every runnable example compiles under strict mode', () => {
    const all = files.flatMap(blocks);
    const virtual = new Map<string, string>();
    all.forEach((b, i) => virtual.set(join(ROOT, `__doc_${i}.ts`), `declare const console: { log(...a: unknown[]): void };\n${b.code}\nexport {};\n`));
    const options: ts.CompilerOptions = {
      strict: true,
      noEmit: true,
      target: ts.ScriptTarget.ES2022,
      lib: ['lib.es2022.d.ts', 'lib.esnext.disposable.d.ts'],
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      esModuleInterop: true,
      skipLibCheck: true,
      types: [],
      baseUrl: ROOT,
      paths: { '@ylcnfrht/typescript-collection-framework': ['src/index.ts'] },
    };
    const host = ts.createCompilerHost(options);
    const read = host.readFile.bind(host);
    const exists = host.fileExists.bind(host);
    const getSource = host.getSourceFile.bind(host);
    host.readFile = (f) => virtual.get(f) ?? read(f);
    host.fileExists = (f) => virtual.has(f) || exists(f);
    host.getSourceFile = (f, lang, ...rest) =>
      virtual.has(f) ? ts.createSourceFile(f, virtual.get(f)!, lang) : getSource(f, lang, ...rest);
    const program = ts.createProgram([...virtual.keys()], options, host);
    const errors = ts
      .getPreEmitDiagnostics(program)
      .filter((d) => d.file && virtual.has(d.file.fileName))
      .map((d) => {
        const i = Number(/__doc_(\d+)/.exec(d.file!.fileName)![1]);
        const { line } = d.file!.getLineAndCharacterOfPosition(d.start ?? 0);
        return `${relative(ROOT, all[i].file)}:${all[i].line + line}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`;
      });
    expect(errors).toEqual([]);
  }, 120_000);
});

describe('docs links', () => {
  // GitHub-style heading anchors: lowercase, punctuation dropped, spaces to dashes
  const anchor = (h: string) => h.toLowerCase().replace(/[^\w\- ]+/g, '').trim().replace(/ /g, '-');
  const anchorsOf = (file: string) =>
    new Set(
      readFileSync(file, 'utf8')
        .replace(/```[\s\S]*?```/g, '')
        .split('\n')
        .filter((l) => /^#{1,6}\s/.test(l))
        .map((l) => anchor(l.replace(/^#+\s+/, '').replace(/`/g, '')))
    );
  it.each(files.map((f) => [relative(ROOT, f), f]))('%s: relative links and anchors resolve', (_n, file) => {
    const text = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '');
    const broken: string[] = [];
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const href = m[1];
      if (/^(https?:|mailto:)/.test(href)) continue;
      const [p, hash] = href.split('#');
      const target = p ? join(file, '..', p) : file;
      let exists = false;
      try {
        exists = statSync(target).isFile() || statSync(target).isDirectory();
      } catch {
        exists = false;
      }
      if (!exists) broken.push(href);
      else if (hash && target.endsWith('.md') && !anchorsOf(target).has(hash)) broken.push(href);
    }
    expect(broken).toEqual([]);
  });
});
