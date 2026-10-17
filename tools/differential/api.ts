// Public API surface of src/index.ts, read from the type declarations with the TypeScript checker:
// every public (non-private, non-protected, non-@internal) member of every exported class, value object and
// interface type. Rows are "<Owner>.<member>"; statics of a class are "<Class>.<member>" with kind 'static'.
import * as path from 'path';
import * as ts from 'typescript';

export interface ApiRow {
  owner: string;
  member: string;
  kind: 'instance' | 'static' | 'object' | 'interface';
}

const INDEX = path.join(__dirname, '../../src/index.ts');

function isPublic(sym: ts.Symbol): boolean {
  for (const d of sym.declarations ?? []) {
    const flags = ts.getCombinedModifierFlags(d as ts.Declaration);
    if (flags & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) return false;
    if (ts.getJSDocTags(d).some((t) => t.tagName.text === 'internal')) return false;
    if (d.getSourceFile().isDeclarationFile && !d.getSourceFile().fileName.includes('/src/')) return false; // lib members (Error.prototype ...)
  }
  const n = sym.getName();
  return !n.startsWith('#') && n !== 'constructor' && n !== 'prototype';
}

export function readApi(): ApiRow[] {
  const program = ts.createProgram([INDEX], { strict: true, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, skipLibCheck: true });
  const checker = program.getTypeChecker();
  const mod = checker.getSymbolAtLocation(program.getSourceFile(INDEX)!)!;
  const rows: ApiRow[] = [];
  const members = (type: ts.Type) =>
    checker.getPropertiesOfType(type).filter(isPublic).map((p) => (p.getName().startsWith('__@') ? `[${p.getName().slice(3).replace(/@\d+$/, '')}]` : p.getName()));
  for (let sym of checker.getExportsOfModule(mod)) {
    const name = sym.getName();
    if (sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
    const decl = sym.declarations?.[0];
    if (!decl) continue;
    if (sym.flags & ts.SymbolFlags.Class) {
      for (const m of members(checker.getDeclaredTypeOfSymbol(sym))) rows.push({ owner: name, member: m, kind: 'instance' });
      for (const m of members(checker.getTypeOfSymbolAtLocation(sym, decl))) rows.push({ owner: name, member: m, kind: 'static' });
    } else if (sym.flags & (ts.SymbolFlags.Variable | ts.SymbolFlags.Function)) {
      const t = checker.getTypeOfSymbolAtLocation(sym, decl);
      if (sym.flags & ts.SymbolFlags.Function) rows.push({ owner: name, member: '()', kind: 'object' });
      else if (t.getCallSignatures().length === 0 && typeof (t as any).value === 'undefined' && !(t.flags & ts.TypeFlags.ESSymbolLike))
        for (const m of members(t)) rows.push({ owner: name, member: m, kind: 'object' });
      else rows.push({ owner: name, member: '(value)', kind: 'object' });
    }
    // interfaces (also those merged with a same-named value object, e.g. Collector, Spliterator, List)
    if (sym.flags & ts.SymbolFlags.Interface || (sym.flags & ts.SymbolFlags.TypeAlias && !(sym.flags & ts.SymbolFlags.Class))) {
      const t = checker.getDeclaredTypeOfSymbol(sym);
      if (t.isClassOrInterface() || t.getProperties().length > 0)
        for (const m of members(t)) rows.push({ owner: name, member: m, kind: 'interface' });
    }
  }
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = `${r.kind}:${r.owner}.${r.member}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
}

if (require.main === module) {
  const rows = readApi();
  const by = new Map<string, string[]>();
  for (const r of rows) by.set(`${r.kind} ${r.owner}`, [...(by.get(`${r.kind} ${r.owner}`) ?? []), r.member]);
  for (const [k, v] of by) console.log(k, `(${v.length})`, v.join(' '));
  console.log('rows', rows.length);
}
