# Differential testing against the reference JDK

This harness runs the same randomly generated operation scripts on the real JDK (the reference) and on this library, then compares the results line by line. The proof run also measures how much of the public API those comparisons reach and writes `docs/COMPATIBILITY.md`.

```
npm run test:diff          # 20,000 scripts, shrink + report, exit 1 on any divergence
npm run test:diff:proof    # 200,000 scripts across worker processes + API coverage -> docs/COMPATIBILITY.md
npx jest tests/differential  # 200-script smoke test (skipped without a JDK)

npx ts-node --transpile-only -P tsconfig.test.json tools/differential/main.ts \
    --seed 7 --count 2000 --batch 1000 --targets TreeMap,Stream,Misc --no-shrink --relax --out /tmp/diff
npx ts-node --transpile-only -P tsconfig.test.json tools/differential/proof.ts --scripts 20000 --workers 4 --out /tmp/C.md
```

If no JDK 23 or newer is on `PATH`, every entry point prints a message and exits 0, and the jest test is skipped.

## Files

| File | Role |
| --- | --- |
| `gen.ts` | Seeded generator (mulberry32). Picks a base target, sometimes a view or wrapper of it, and writes ops with arguments from small domains. Also generates stream pipelines and `Misc` scripts. |
| `RefRunner.java` | The reference runner. It executes a script file on the JDK and prints one normalised line per op. |
| `ref.sh` | Compiles `RefRunner` once into `$TMPDIR/ts-cf-diff-build-<ver>` (`--release <ver> --enable-preview`, because Gatherers are preview in 23) and runs it. `--check` tests for a usable JDK; `--version` prints its version line. |
| `tsRunner.ts` | The same interpreter, written against `src/index.ts`. It produces identical output. |
| `main.ts` | Compares outputs, groups divergences by signature, and shrinks them (`shrinkMany` runs every candidate of every divergence in one batch per round). Also the `test:diff` CLI and `--script` reproduction. |
| `proof.ts` | The proof run. Batches go to worker processes (`fork`, no new dependencies); each worker installs coverage instrumentation. Results are merged, shrunk, assessed and rendered. |
| `api.ts` | Reads the public API from the declarations with the TypeScript checker. That gives every public member of every exported class, value object and interface: about 1,700 rows. |
| `coverage.ts` | Wraps every public method: exported classes, value objects, and the prototypes of every library object the harness gets back (views, iterators, streams, spliterators, collectors, gatherers, downstreams). It counts the calls the harness makes. Calls the library makes internally are not counted. |
| `report.ts` | Renders `docs/COMPATIBILITY.md`. Also holds the list of API rows that cannot be compared, each with its reason. |
| `assessments.ts` | One assessment per divergence signature: `library` (we differ from the reference; reported, not fixed here), `reference-quirk` (the reference contradicts its own documented contract) or `intentional` (a documented design difference). Anything unassessed fails the proof run. |
| `known.ts` | Library divergences tolerated by the jest smoke test. It is maintained by whoever fixes them. |

## Scripts

```
@<seed>-<n> <Base>[/<view>[:args]]...
init [3,null,'ab]            collections: addAll / List.of / Set.of / copyOf / singleton / nCopies / ...
init {1=2,'a=null}           maps: put each / Map.ofEntries / Map.of(k, v, ...) / Map.copyOf / singletonMap
<op> <arg> ...               one op per line
pipe <src> | <stage> | ... | <terminal>     Stream scripts: one pipeline per line
x <misc-op> ...              Misc scripts: Objects, Comparator expressions, Optional*, summary statistics, entries,
                             Spliterators, constants, collectors and gatherers driven by hand
```

- **Tokens:** `null`, ints, `'str` (a leading quote, where `'` alone is the empty string), `2.5`, `k=v` (an entry), `[a,b]` (a list), `{k=v}` (a map), and names from the function catalogue.
- **Bases:** every concrete collection and map, several constructor variants, every immutable/empty/singleton factory, and harness subclasses of each `Abstract*` skeleton. One of them is `LinkedHashMap` with a `removeEldestEntry` override.
- **View paths:** `subList`, `reversed`, `keySet`, `values`, `entrySet`, `navigableKeySet`, `descendingKeySet`, `descendingMap`, `descendingSet`, `head/tail/subSet|Map` (inclusive or plain), `sequenced*`, and every `Collections.unmodifiable*`, `synchronized*` and `checked*` wrapper, plus `newSetFromMap`, `newSequencedSetFromMap` and `asLifoQueue`. Views can be nested.

Each target gets the op groups of its interface kind: Collection, List, Deque, NavigableSet, NavigableMap and so on. Iterator, ListIterator, Enumeration and Spliterator objects are driven by small programs:

- `itw n,h,r,f` drives an iterator.
- `litw 2 p,s:5,a:7,i,j` drives a list iterator from index 2.
- `splw t,c,e,x,k,g,s` drives a spliterator.
- `enumw h,n,a` drives an enumeration.
- `primIter`, `iterT` and `splwT` do the same on streams.

## Output normalisation (both runners)

Each op prints `<result> ;; <target state>`. A view prints `view || base`. Stream and misc lines print `<result>`, followed by `LOG[...]` when a peek, forEach, onClose or ifPresent callback ran.

- **Numbers:** integral values print as integers, so `-0` prints as `0`. Other doubles print as shortest digits in the form `25e-1`. `NaN` and `Inf` print as themselves. A magnitude of 2^53−1 or more prints as `BIG`.
- **Values:** `OPT[x]`/`OPT_EMPTY`; `STATS{count,sum,min,max,avg}`; `k=v` for an entry; `EXC:<SimpleClassName>` for an exception.
- **Ordered collections and maps** print in iteration order.
- **Hash-ordered targets** (HashSet/HashMap/IdentityHashMap/PriorityQueue/`Set.of`/`Map.of`/... and their views) print in sorted canonical form. Iterator programs on them print `*` for an element and `#n` for a drained remainder. Their `toString` is compared with its items sorted.
- **Spliterators:** `estimateSize`/`getExactSizeIfKnown` are printed only before traversal (`~` afterwards). `trySplit` prints prefix ++ rest and ends the program, because the split point is unspecified.
- **Bulk ops that throw midway:** an op such as `addAll`, `removeIf`, `sort` or `replaceAll` that throws partway through prints `EXC:X ;; ?`, and the rest of the script prints `DEAD`. The exception is `UnsupportedOperationException`, which is thrown before anything changes.

The full list of normalisations and their reasons is in `report.ts` (`NORMALISATIONS`) and is rendered into `docs/COMPATIBILITY.md`.

## Coverage, exclusions and assessments

- **API rows** come from the declarations (`api.ts`). Interface rows (Collection, NavigableMap, Iterator, Spliterator, Stream, Collector, Gatherer, Downstream, ...) are credited when a library-internal implementation of that interface is called. A TreeMap key-set view, for example, credits NavigableSet, SortedSet, SequencedSet, Set and Collection.
- **Exception rows** count how often that exception type was the compared outcome of an op.
- **Exclusions** live in `report.ts` (`EXCLUSIONS`). Each has a reason:
  - JS-only members such as `[Symbol.iterator]`, `ArrayList.of` and `Stream.from`.
  - APIs newer than JDK 23: `ofLazy` and `Comparator.max`/`min`.
  - Identity-based values: `Objects.identityHashCode` and the identity `hashCode`s of Collection/Queue wrappers.
  - Members that are not public in the reference: `modCount`, `removeRange`, `getNode`.
  - Abstract hooks implemented by the harness subclasses.
- **Assessments** in `assessments.ts` are regex rules over the divergence signature. A rule can also check the diverging line and its ref/ours outputs. Each rule carries a category and a precise note, and the note ends up in the report.

## Reproducing a failure

Every script id is `<seed>-<n>`. `main.ts --seed S --count N` (and `proof.ts --seed S`) regenerates exactly the same scripts; batches use seeds S, S+1, ... The reports print each divergence as a **shrunk** script, with the diverging line marked `>>` and the reference's line and ours under it. To rerun it by hand, save it (including the `@id Target` header) and run:

```
npx ts-node --transpile-only -P tsconfig.test.json tools/differential/main.ts --script repro.txt
```

This prints both outputs line by line and marks differences with `!!`.

## Adding an op

1. `gen.ts`: add `'<name> <argkinds>'` to the right op group (`COLL`, `LIST`, `MAPOPS`, `NAVSET`, ...). For a stream stage or terminal, add it in `stage()`/`terminal()`/`collector()`; for a misc op, add it in `misc()`. Keep the element-type tracking correct. Argument kinds are listed above `COLL`.
2. `RefRunner.java`: add the case (`Script.op`, `Pipe.stage`/`terminal`, `Coll.parse`, or `Misc.run`).
3. `tsRunner.ts`: add the same case, using the shared catalogue (`un`, `po`, `bin`, `bif`, `cmp`, `flatO`, `numv`, `CmpExpr`, `customGatherer`).
4. If the op touches several elements and can throw midway, add it to `BULK` in **both** runners. If its output depends on hash iteration order, mask it for unordered targets.
5. Run `main.ts --count 5000 --no-shrink` and triage each divergence:
   - **Harness bug:** fix the runners or the generator.
   - **Intentional deviation:** encode it as a normalisation or exclusion and document it.
   - **Library difference or reference quirk:** add a rule to `assessments.ts`.
6. Run `npm run test:diff:proof` and check that coverage stays at 100% of comparable rows.
