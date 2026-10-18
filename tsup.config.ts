import { readFileSync, writeFileSync } from 'fs';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2020',
  // esbuild emits a self-referencing class as `var ArrayList = class _ArrayList`, so its name (in errors, logs and
  // stack traces) would be _ArrayList. Drop the inner name, so the class takes its name from the var, and point the
  // body's references at the var (same class). Not renaming it to `class ArrayList`: re-bundling that, esbuild sees
  // a clash and names it ArrayList2. Spaces stand in for the removed characters, so the source maps stay aligned.
  // (keepNames would add a static block per class, which stops consumers from tree-shaking any of them.)
  async onSuccess() {
    for (const f of ['dist/index.js', 'dist/index.mjs']) {
      let s = readFileSync(f, 'utf8');
      for (const [, n] of s.matchAll(/= class _(\w+) /g)) {
        // two source classes with one name would share the inner name; keep those as emitted
        if (s.split(`= class _${n} `).length !== 2) continue;
        s = s.replace(`= class _${n} `, `= class ${' '.repeat(n.length + 2)}`);
        s = s.replace(new RegExp(`(?<![.\\w$])_${n}\\b`, 'g'), ` ${n}`);
      }
      writeFileSync(f, s);
    }
  },
});
