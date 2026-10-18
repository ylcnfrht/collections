// Runs every bench/*.bench.ts file, or only those whose name matches argv[2].
import { readdirSync } from 'fs';
import { join } from 'path';
import { printLosses } from './harness';
import '../src/stream/StreamSupport'; // bench files import modules directly; load the stream engine as the entry point does

async function main() {
  const filter = process.argv[2]?.toLowerCase();
  const files = readdirSync(__dirname).filter((f) => f.endsWith('.bench.ts') && (!filter || f.toLowerCase().includes(filter)));
  for (const f of files) {
    console.log(`\n# ${f}`);
    const mod = await import(join(__dirname, f));
    await mod.default();
  }
  printLosses();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
