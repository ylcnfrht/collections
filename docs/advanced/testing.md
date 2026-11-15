# How the library is tested

This page describes the test layers that back the library's behaviour, down to which exception a call throws and the state a collection is left in. It is written for users who want to know how far to trust the library and for contributors who want to extend the tests.

| Layer | What it checks |
| --- | --- |
| [Contract suites](#contract-suites) | shared behavioural tests run against every implementation and view |
| [Model-based random tests](#model-based-random-tests) | each structure against a trivially correct model |
| [Conformance suite](#conformance-suite) | behaviour written from the reference documentation |
| [Differential testing](#differential-testing-against-the-jdk) | hundreds of thousands of random scripts run on the JDK and on this library, compared step by step |
| [Doctests](#doctests) | every example in these docs |

The suite has about 10,200 tests and covers about 99% of lines.

## Commands

| Command | What it does |
| --- | --- |
| `npm test` | the whole Jest suite: unit, contract, model-based, conformance, doctests, and the differential smoke test (if a real JDK is installed) |
| `npm run test:cov` | the same, with coverage. It fails below 95% statements/lines/functions or 90% branches (`jest.config.ts`). |
| `npx jest tests/docs` | only the doctests of `README.md` and `docs/**/*.md` |
| `npx jest tests/TreeMap` | one file, or any path pattern |
| `npm run typecheck` | `tsc --noEmit` over `src`, `tests` and `bench` in strict mode |
| `npm run build` | `tsup`: CommonJS + ESM bundles with `.d.ts`/`.d.mts` types in `dist/` |
| `npm run test:diff` | differential run: 20,000 random scripts against the JDK |
| `npm run test:diff:proof` | the full proof run: 200,000 scripts plus API coverage. Regenerates `docs/COMPATIBILITY.md`. |
| `npm run bench` | performance benchmarks (see [Performance](./performance.md#running-the-benchmarks)) |
| `npm run docs:api` | the TypeDoc API reference |

`npm run prepublishOnly` chains `typecheck`, `test` and `build`, so a release cannot be published with a type error or a failing test.

## Test layout

```text
tests/
  contracts/        # reusable behaviour suites: collection, list, set, navigableSet, queue, deque, map, navigableMap
  conformance/      # streams, collectors, gatherers, spliterators, Optional, statistics, checked against the Java SE documentation
  stream/           # unit tests of the stream engine, number streams, collectors, gatherers, double formatting
  differential/     # Jest smoke test of the differential harness (200 scripts)
  ArrayList.test.ts, HashMap.test.ts, ...   # per-class tests: contracts + specifics + model-based + scale
  Collections.test.ts, CollectionsCompliance.test.ts, Immutable.test.ts, util.test.ts
  foundation.test.ts  # contracts run against test-only subclasses of the Abstract* skeletons
  index.test.ts       # the public entry point: every export resolves and works together
  docs.test.ts        # doctests
  helpers.ts, support.ts
```

### Contract suites

A contract is a function that registers a full `describe` block of behavioural tests for any implementation of an interface. Each test file calls the contracts that apply to its class:

```ts nocheck
// tests/LinkedList.test.ts
collectionContract('LinkedList', () => new LinkedList(), { allowsNull: true, allowsDuplicates: true });
listContract('LinkedList', () => new LinkedList());
queueContract('LinkedList', () => new LinkedList(), { fifo: true });
dequeContract('LinkedList', () => new LinkedList(), { allowsNull: true });

// views are full implementations too, so they get the same contracts
listContract('LinkedList.reversed()', () => new LinkedList().reversed());
```

| Contract | Options |
| --- | --- |
| `collectionContract` | `allowsNull`, `allowsDuplicates`, `requiresComparable` |
| `listContract` | — |
| `setContract` | `skipScale` |
| `navigableSetContract` | takes a factory that accepts a comparator |
| `queueContract` | `fifo`, `iteratorRemoveIf` |
| `dequeContract` | `allowsNull`, `iteratorRemoveIf` |
| `mapContract` | `allowsNullKey`, `allowsNullValue`, `requiresComparableKeys`, `skipScale`, ... |
| `navigableMapContract` | takes a factory that accepts a comparator |

Each contract runs from about 30 (`queueContract`) to about 190 (`listContract`) tests per implementation.

The contracts cover more than the happy path:

- fail-fast iteration (`ConcurrentModificationException` after a structural change);
- iterator `remove()` state rules (`IllegalStateException`);
- exceptions for bad indices and `null`;
- equality and hashing across different implementations;
- live views (`subList`, `keySet`, `headMap`, `descendingMap`, ...) writing through to the base;
- `toString` formats;
- spliterator characteristics;
- sequenced methods;
- a 100k-element scale check.

Views run the same contracts as the classes they come from. `TreeSet.descendingSet()`, `TreeMap.subMap(...)`, `ArrayList.subList(...)` and `LinkedList.reversed()` all get the full contract.

`tests/support.ts` holds deliberately simple array-backed subclasses of every `Abstract*` skeleton (`SimpleList`, `SimpleSeqList`, `SimpleSet`, `SimpleMap`). `foundation.test.ts` runs the contracts on them. That tests the skeletons independently of the optimised classes. It also tests the contracts themselves, since a contract that fails on a trivially correct implementation is wrong. The same simple classes act as "a different implementation" in cross-type `equals` checks.

### Model-based random tests

For each data structure with a non-trivial internal layout, a seeded random sequence of operations runs against both the structure and a trivially correct JS model. After every step, the two must agree.

| Test | Model | What it stresses |
| --- | --- | --- |
| `TreeSet` / `TreeMap` | a sorted array | red-black rebalancing, `floor`/`ceiling`/`higher`/`lower`, `poll*`, `subMap` views |
| `PriorityQueue` | a sorted array | heap order under `offer`/`poll`/`remove(o)`/iterator removal |
| `ArrayDeque` | a JS array, with a tiny capacity | ring-buffer wrap-around, growth, removal from the middle |
| `Vector` | a JS array | positional operations |
| `HashMap` / `HashSet` | native `Map` / `Set` | 1M random ops over mixed key kinds (integers, sparse integers, strings, objects with `equals`, colliding hashes) |
| `IdentityHashMap` | native `Map` | 200k random ops with object keys |
| `LinkedHashSet` | native `Set` | contents **and** order |

The random generator is a seeded LCG (`rng(seed)` in `tests/helpers.ts`), so a failure always reproduces with the same seed. `Collide` is a helper key class whose instances all share one `hashCode`, to force the collision paths.

### Conformance suite

`tests/conformance/` is written from the Java API documentation, not from the implementation. Many tests quote the sentence they check, for example:

```ts nocheck
// package summary: "if the source is a List containing [1, 2, 3], then the result of executing
// map(x -> x*2) must be [2, 4, 6]"
```

It covers stream basics and laziness (evaluation order, short-circuiting, which stages run), intermediate and terminal operations, number streams, collectors, gatherers, spliterators, `Optional`, and summary statistics. `CollectionsCompliance.test.ts` does the same for `Collections`, `Comparator`, `Objects` and the immutable factories.

### Doctests

`tests/docs.test.ts` extracts every ` ```ts ` block from `README.md` and `docs/**/*.md` (except the generated `COMPATIBILITY.md`) and checks two things:

1. **It runs and prints what it claims.** The block runs against the library. Every `console.log(...)` that carries a `// → expected` comment must print exactly `expected`, in order. Strings print as-is, library collections via `toString()` (`[1, 2]`, `{a=1}`), and JS values via `util.inspect` (`[ 1, 2 ]`).
2. **It type-checks.** All blocks are compiled together under `strict` mode, with `'@ylcnfrht/typescript-collection-framework'` mapped to `src/index.ts`.

```ts
import { ArrayList } from '@ylcnfrht/typescript-collection-framework';

const l = ArrayList.of(3, 1, 2);
// with new:
// const l = new ArrayList<number>();
// l.add(3);
// l.add(1);
// l.add(2);
l.sort(null);
console.log(l); // → [1, 2, 3]
console.log(l.toArray()); // → [ 1, 2, 3 ]
```

Blocks fenced as ` ```ts nocheck ` (signatures, pseudo-code, test excerpts) are skipped. Examples may import only from `'@ylcnfrht/typescript-collection-framework'`. When you change behaviour, `npx jest tests/docs` tells you which documentation went stale.

### Coverage

`npm run test:cov` measures `src/**` (except type-only interfaces and the barrel file). The current figures are about 99.0% of lines, 97.7% of branches and 98.3% of functions. The thresholds in `jest.config.ts` (95/95/95/90) stop coverage from silently regressing. Most of what remains uncovered is defensive branches that need a misbehaving user callback to reach.

## Differential testing against the JDK

Unit tests can only check what their authors thought to check. The differential harness in `tools/differential/` removes that limit. It generates random operation scripts, runs each one on the reference runtime and on this library, and compares the outputs after every single operation.

### How it works

Each batch of scripts goes through six steps:

1. **Generate.** `gen.ts` is seeded (mulberry32). It picks a base target, often wraps it in a view or wrapper (`subList`, `reversed`, `keySet`, `headMap`, `descendingMap`, `unmodifiable*`, `checked*`, `asLifoQueue`, ..., even nested), and writes operations with arguments drawn from small domains, so collisions, duplicates and edge cases are common. The targets are every concrete collection and map, the immutable/empty/singleton factories, harness subclasses of every `Abstract*` skeleton, `LinkedHashMap` with a `removeEldestEntry` override, stream pipelines, and `Misc` scripts that drive `Objects`, `Comparator`, `Optional`, statistics, spliterators, collectors and gatherers by hand. Iterators, list iterators, enumerations and spliterators are driven by small step programs.
2. **Run both sides.** The reference runner and `tsRunner.ts` are two implementations of the same script interpreter. Each prints one line per operation: `<result> ;; <state of the target after the op>`. An exception prints as `EXC:<ClassName>`, so exception types are compared too.
3. **Normalise.** Both runners apply the same documented normalisations for things that legitimately differ. Some examples: one JS number type versus int/long/double, `-0` versus `0`, magnitudes beyond 2⁵³, and sorted canonical output for hash-ordered containers whose iteration order is unspecified. The state after a bulk operation that throws midway is not compared, because it is unspecified. The full list, with a reason for each, is in `docs/COMPATIBILITY.md`.
4. **Compare.** Outputs are compared line by line. The first differing line is the divergence.
5. **Shrink.** Each divergent script is minimised one step at a time: drop a line, drop a pipeline stage, or drop an element of a list or map literal. A step is kept only if the script still diverges with the same signature. All shrink candidates of a round run in one batch. The report then shows a few-line reproduction instead of a 40-op script.
6. **Assess.** Divergences are grouped by signature. Each signature needs an entry in `assessments.ts` that classifies it:
   - `library`: we differ from the reference;
   - `reference-quirk`: the reference contradicts its own documented contract;
   - `intentional`: a documented design difference.

   An unassessed divergence fails the proof run.

The proof run also instruments every public method (`coverage.ts`). It reads the public API from the TypeScript declarations (`api.ts`, about 1,700 rows) and reports which rows the comparisons actually exercised. Rows that cannot be compared are excluded, each with a written reason: identity hashes, JS-only members such as `[Symbol.iterator]`, and APIs newer than the reference version.

### Running it

```sh
npm run test:diff          # 20,000 scripts; shrinks and reports; exit code 1 on any unassessed divergence
npm run test:diff:proof    # 200,000 scripts on worker processes + API coverage -> docs/COMPATIBILITY.md
npx jest tests/differential  # the 200-script smoke test that runs as part of npm test

# a focused run: one seed, some targets, no shrinking
npx ts-node --transpile-only -P tsconfig.test.json tools/differential/main.ts \
    --seed 7 --count 2000 --batch 1000 --targets TreeMap,Stream,Misc --no-shrink --out /tmp/diff

# replay one script (copied from a report, including its "@id Target" header)
npx ts-node --transpile-only -P tsconfig.test.json tools/differential/main.ts --script repro.txt
```

> [!NOTE]
> The harness needs a JDK, version 23 or newer, on `PATH`. Without one, every entry point prints a message and exits 0, and the Jest smoke test is skipped, so `npm test` still passes.

Every script id is `<seed>-<n>`, so `--seed S --count N` regenerates exactly the same scripts.

### The compatibility report

[`docs/COMPATIBILITY.md`](../COMPATIBILITY.md) is generated by `npm run test:diff:proof`. Do not edit it by hand. The current report says:

| | |
| --- | --- |
| Reference runtime | version 23.0.2 |
| Scripts | 200,000 (seeds 1..40, 40 batches of 5,000) |
| Operations compared | 1,692,438 |
| Comparable API covered | 1,602 / 1,602 (100.0%) |
| Excluded API rows (each justified) | 141 |
| Divergent scripts | 57, in 21 signatures |
| Assessment | 8 intentional, 13 reference-quirk, 0 library |
| Run time | 61 s on 8 worker processes |

So every divergence found in 1.7 million compared operations is either a documented design choice, or a case where the reference breaks its own specification. Some examples:

- **Intentional:** `flatMap` iterators pull one element at a time, so `peek` sees fewer elements.
- **Intentional:** `Gatherers.mapConcurrent` maps in order instead of on virtual threads.
- **Reference quirk:** the reference's `HashSet` spliterator drops `SIZED` after traversal.
- **Reference quirk:** a reversed list view accepts `set()` right after `add()`.

The report lists each divergence with a minimal script. For the documented differences in readable form, see [Compatibility](./compatibility.md).

## Timing budgets (PERF=1)

A few tests guard against accidental quadratic behaviour. Examples: `removeAll` of 50k elements from a 100k `ArrayList`, 50k removals through a `HashMap` key set, and `removeIf` on a 100k `HashSet`. They wrap the workload in `timeIt()` and assert a generous budget (`expect(ms).toBeLessThan(1000)`).

Wall-clock budgets are flaky on busy CI machines, so `timeIt` always runs and checks the workload but reports the time only when `PERF=1` is set. Otherwise it returns 0:

```sh
PERF=1 npx jest tests/ArrayList tests/HashMap tests/HashSet tests/Collections
```

Run with `PERF=1` on a quiet machine before merging work that touches a hot path. To measure actual speed, use `npm run bench` (see [Performance](./performance.md)).

## Adding a new collection with contract tests

These steps apply to a new class in this library, and to a [custom collection](./custom-collections.md) in your own project that you want held to the same standard.

1. **Pick the contracts** that match the interfaces it implements. A list gets `collectionContract` + `listContract`. A deque gets `collectionContract` + `queueContract` + `dequeContract`. A sorted set gets `collectionContract` + `setContract` + `navigableSetContract`. A map gets `mapContract` (+ `navigableMapContract`).
2. **Create a test file** `tests/<Name>.test.ts` that calls them with a factory for an empty instance, and with options that describe your class honestly (`allowsNull`, `allowsDuplicates`, `fifo`, ...). An option set wrongly makes the contract expect the wrong behaviour, so failures are informative.
3. **Run the contracts on every view** your class hands out (`subList`, `reversed()`, key sets, range views). Views are where most bugs hide.
4. **Add specifics**: constructor variants, capacity rules, the class's own methods, and a model-based random test against a simple JS model if the internal layout is non-trivial (use `rng(seed)` from `tests/helpers.ts`).
5. **Export it** from `src/index.ts` and add it to `tests/index.test.ts`, which checks the public entry point.
6. **Add it to the differential harness** if it mirrors a reference class. Add the target in `gen.ts` and the constructor in both runners, then run `npm run test:diff:proof` and check that API coverage stays at 100% of comparable rows. `tools/differential/README.md` ("Adding an op") explains how to triage what it finds.
7. **Document it** with runnable examples, and run `npx jest tests/docs`.

For example, the `RingList` from [Implementing your own collections](./custom-collections.md#worked-example-a-fixed-capacity-ring-list-abstractlist) would be tested like this. It is a list that evicts once full, so use a factory with enough capacity for the contracts' fixtures:

```ts nocheck
// tests/RingList.test.ts
import { RingList } from '../src/list/RingList';
import { collectionContract } from './contracts/collection';
import { listContract } from './contracts/list';
import { rng } from './helpers';

const create = () => new RingList<any>(1_000_000);

collectionContract('RingList', create, { allowsNull: true, allowsDuplicates: true });
listContract('RingList', create);
collectionContract('RingList.subList', () => create().subList(0, 0), { allowsNull: true, allowsDuplicates: true });
listContract('RingList.subList', () => create().subList(0, 0));

describe('RingList · eviction', () => {
  it('model-based: appends evict the oldest, like a sliding window over an array', () => {
    const r = rng(7);
    const ring = new RingList<number>(8);
    const model: number[] = [];
    for (let step = 0; step < 10_000; step++) {
      const x = r(100);
      ring.add(x);
      model.push(x);
      if (model.length > 8) model.shift();
      expect(ring.toArray()).toEqual(model);
    }
  });
});
```

Then run `npx jest tests/RingList` and `npm run test:cov`, and check that the new file's coverage is in line with the rest.
