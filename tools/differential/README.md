# Differential testing against the reference JDK

Runs the same randomly generated operation scripts on the real JDK (the reference) and on this library, and
compares the results line by line.

```
npm run test:diff                      # 20,000 scripts in batches of 5,000, shrink + report, exit 1 on divergence
npx ts-node --transpile-only -P tsconfig.test.json tools/differential/main.ts \
    --seed 7 --count 2000 --batch 1000 --targets TreeMap,Stream --no-shrink --relax --out /tmp/diff
npx jest tests/differential             # 200-script smoke test (skipped without a JDK)
```

If no JDK 23 or newer is on `PATH` (`javac` and its launcher), the CLI prints a message and exits 0, and the jest
test is skipped.

## Files

| File | Role |
| --- | --- |
| `gen.ts` | Seeded generator (mulberry32). Picks a target and writes ops with arguments from small domains. |
| `RefRunner.java` | Reference runner. Executes a script file on the JDK and prints one normalised line per op. |
| `ref.sh` | Compiles `RefRunner` once into `$TMPDIR/ts-cf-diff-build-<ver>` (`--release <ver> --enable-preview`, because Gatherers are preview in 23) and runs it. `--check` only tests for a usable JDK. |
| `tsRunner.ts` | The same interpreter written against `src/index.ts`. Its output format is identical to the reference runner's. |
| `main.ts` | Driver: generate, run both sides, compare, group divergences, shrink, report. Also exports `runDifferential` for jest. |
| `known.ts` | Library divergences that have been found and reported but not fixed. The jest test tolerates them. `test:diff` does not. |

## Script format

```
@<seed>-<n> <Target>
init [3,null,'ab]            collections: addAll / List.of / Set.of / unmodifiableList(...)
init {1=2,'a=null}           maps: put each / Map.ofEntries
<op> <arg> ...               one op per line
pipe <src> | <stage> | ... | <terminal>     Stream scripts: one pipeline per line
```

Tokens are `null`, ints, `'str` (a leading quote, where `'` alone is the empty string), `2.5` (a double), `[a,b]`
(a list), `{k=v}` (a map), and names from the function catalogue.

## Output normalisation (both runners)

Each op prints `<result> ;; <state of the target>`. Stream lines print `<result>`, followed by `LOG[...]` when a
peek or forEach ran.

- `null`, `true` and `false` print as themselves. Strings are quoted. `void` stands for no result.
- Numbers: integral values print as integers, so `-0` prints as `0`. Other doubles print as shortest round-trip
  digits in the form `<digits>e<exp>` (`2.5` → `25e-1`). `NaN` and `Inf` print as themselves. A magnitude of
  2^53−1 or more prints as `BIG`, which covers the empty `LongSummaryStatistics` min and max.
- `OPT[x]` and `OPT_EMPTY` cover all four Optionals. Summary statistics print as `STATS{count,sum,min,max,avg}`. An
  entry prints as `k=v`.
- Collections and maps keep their iteration order when the order is defined: lists, deques, linked collections,
  sorted collections and sequenced views. Hash-based targets, `Set.of`, `Map.of`, `PriorityQueue`,
  `Collectors.toSet` and `groupingBy` print in **sorted canonical form**, sorting the printed elements as strings.
- An exception prints as `EXC:<SimpleClassName>`.
- A bulk op (`addAll`, `removeIf`, `sort`, `replaceAll`, `putAll`, ...) that throws partway through leaves an
  unspecified partial state. That state depends on iteration order for hashed targets. Such a line prints
  `EXC:X ;; ?` and the rest of the script prints `DEAD`. An `UnsupportedOperationException` is the exception to this
  rule, because it is thrown before anything changes.
- A failed `init` also marks the script dead, for example `Set.of` with duplicates or `List.of` with a null.

## Intentional deviations: how they are handled

| Deviation | Handling |
| --- | --- |
| `remove(int)` vs `remove(Object)` | The op `removeAt i` maps to the reference's `remove(int)`. `remove e` passes an object. |
| -0 vs 0 | Int-catalogue functions add `+ 0` (int arithmetic has no -0). Printing collapses -0 to 0. The double catalogue has no `neg` or `mod3`, and doubles are non-negative, so no -0 reaches a `DoubleStream` (whose `distinct` keeps -0.0 and 0.0 apart). |
| IntStream overflow, longs above 2^53 | Inputs are small ints, there are no `times`/`sq` reductions, and `BIG` normalisation applies. |
| Unboxing a null | The reference throws NPE when a null is unboxed (`mapToInt`, `summingInt`, lambdas). In the TS runner the catalogue lambdas call `nn()` to do the same, because the library cannot know a JS function "unboxes". |
| Hash iteration order | Sorted canonical form, as above. `minCmp`/`maxCmp` on unordered targets only use total orders. `values().remove(v)` is excluded on hashed maps, because which of several equal values goes depends on iteration order. |
| Identity hashCode | No `hashCode` op for `PriorityQueue` and `ArrayDeque` (the reference inherits `Object.hashCode`) or for `IdentityHashMap`. |
| `IdentityHashMap` | Int keys only, and values stay inside the boxed-int cache (-128..127). Ops that could grow values (`merge`, `compute`, `replaceAll`, ...) are excluded. Under those limits, reference identity matches `===`. |
| `toString` formats | `toStr` only runs on ordered targets. `toListStr`/`findFirstStr` only run on int and string streams, because a JS number cannot tell `1.0` from `1`. Summary-statistics `toString` is compared after `BIG` normalisation. |
| sorted() elision | The reference skips `sorted()` on a stream that is already SORTED, which changes what an upstream `peek` observes. The generator never puts `peek` before a natural `sorted()`. |
| Not generated | Parallel streams, APIs newer than JDK 23 (`ofLazy`, `Comparator.min/max`), spliterator size estimates, PriorityQueue iteration order (always printed sorted), and comparators with ties for PriorityQueue (tie order is implementation-specific). |
| `--relax` (CLI only) | Treats `ArrayIndexOutOfBoundsException` like `IndexOutOfBoundsException` while comparing. Use it for exploration, so the known Vector divergence does not hide later ops. |

## Reproducing a failure

Every divergent script id is `<seed>-<n>`. `--seed S --count N` regenerates exactly the same scripts, and batches
use seeds S, S+1, ... The report prints each distinct divergence (grouped by signature) as a **shrunk** script. The
shrinker greedily drops lines, pipeline stages and literal elements while the same signature still diverges. The
diverging line is marked `>>`, with the reference's line and ours under it. To rerun a script by hand, save it to a
file (including the `@id Target` header) and run

```
npx ts-node --transpile-only -P tsconfig.test.json tools/differential/main.ts --script repro.txt
```

This prints both outputs line by line and marks differences with `!!`.

## Adding an op

1. `gen.ts`: add `'<name> <argkinds>'` to the right op group (`COLL`, `LIST`, `MAPOPS`, ...). For a stream stage or
   terminal, add it in `stage()`/`terminal()`/`collector()` and keep the element-type tracking correct. Argument
   kinds are listed above `COLL`.
2. `RefRunner.java`: add a `case "<name>"` to `Script.op` (or to `Pipe.stage`/`terminal`, or to `Coll.parse`).
3. `tsRunner.ts`: add the same case. Use the shared catalogue (`un`, `po`, `bin`, `bif`, `cmp`, `flatO`) so that
   both sides run identical lambdas.
4. If the op touches several elements and can throw partway through, add it to `BULK` in **both** runners.
5. Run `main.ts --count 2000` and triage. A divergence is either a harness bug (fix the runners or the generator), an
   intentional deviation (encode it as a normalisation or exclusion, and document it in the table above), or a
   library bug (report it, and add it to `known.ts` until it is fixed).
