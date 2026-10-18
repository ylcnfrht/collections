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
  // stack traces) would be _ArrayList. Renaming the inner binding back is safe: it denotes the same class.
  // (keepNames would do this with a static block per class, which stops consumers from tree-shaking any of them.)
  async onSuccess() {
    for (const f of ['dist/index.js', 'dist/index.mjs']) {
      let s = readFileSync(f, 'utf8');
      for (const [, n] of s.matchAll(/= class _(\w+)\b/g)) s = s.replace(new RegExp(`\\b_${n}\\b`, 'g'), n);
      writeFileSync(f, s);
    }
  },
});
