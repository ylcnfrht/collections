// HashMap.get vs native Map.get, the same test on the same keys.
//
//   npm run build                         (once: the test uses the published build in dist/)
//   node bench/demo/index.js              integer keys 0..99,999
//   node bench/demo/index.js strings      string keys 'key0'..'key99999'
//
// Each implementation runs in its own Node process, so neither benefits from the other's JIT warm-up.
const { spawnSync } = require('child_process');

const N = 100_000; // keys in the map
const WARMUP_ROUNDS = 100; // untimed, lets the JIT optimise the loop first
const ROUNDS = 1_000; // timed: every round reads all N keys once

const mode = process.argv[2] === 'strings' ? 'strings' : 'int';
const who = process.argv[3];

function makeMap(name) {
  if (name === 'ours') {
    const { HashMap } = require('../../dist/index.js');
    const m = new HashMap();
    return { label: '@ylcnfrht/collections HashMap', put: (k, v) => m.put(k, v), get: (k) => m.get(k) };
  }
  const m = new Map();
  return { label: 'native Map', put: (k, v) => m.set(k, v), get: (k) => m.get(k) };
}

function runOne(name) {
  const keys = Array.from({ length: N }, (_, i) => (mode === 'int' ? i : 'key' + i));
  const map = makeMap(name);
  for (let i = 0; i < N; i++) map.put(keys[i], i);

  const round = () => {
    let sum = 0;
    for (let i = 0; i < N; i++) sum += map.get(keys[i]);
    return sum;
  };

  for (let r = 0; r < WARMUP_ROUNDS; r++) round();

  let checksum = 0;
  const start = process.hrtime.bigint();
  for (let r = 0; r < ROUNDS; r++) checksum += round();
  const ns = Number(process.hrtime.bigint() - start);

  const ops = ROUNDS * N;
  console.log(map.label);
  console.log(`  operations : ${ops.toLocaleString('en-US')} get calls (${ROUNDS} rounds x ${N.toLocaleString('en-US')} keys)`);
  console.log(`  time       : ${(ns / 1e6).toFixed(1)} ms`);
  console.log(`  throughput : ${Math.round(ops / (ns / 1e9)).toLocaleString('en-US')} get calls per second`);
  console.log(`  per call   : ${(ns / ops).toFixed(2)} ns`);
  console.log(`  checksum   : ${checksum} (must be the same for both)`);
  console.log();
}

if (who) {
  runOne(who);
} else {
  console.log(`Node ${process.version}, ${mode === 'int' ? 'integer' : 'string'} keys, ${N.toLocaleString('en-US')} entries\n`);
  for (const name of ['ours', 'native']) {
    const r = spawnSync(process.execPath, [__filename, mode, name], { stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
}
