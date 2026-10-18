// Renders docs/COMPATIBILITY.md from a proof run: coverage matrix (every public API row: times compared, or the
// justified exclusion), normalisations, per-target totals and the assessed divergence list.
import { ApiRow, readApi } from './api';
import type { Assessment } from './assessments';
import type { CoverageData } from './coverage';
import { scriptText } from './gen';
import type { Divergence } from './main';

/** API rows that cannot be compared with the reference runtime, with the reason. Matched on owner and member. */
export const EXCLUSIONS: { owner: RegExp; member: RegExp; kind?: ApiRow['kind']; reason: string }[] = [
  { owner: /./, member: /^\[(iterator|dispose|SET_BRAND|RANDOM_ACCESS|INSPECT)\]$/, reason: 'JS protocol / brand symbol (INSPECT: the util.inspect hook behind console.log); no reference counterpart' },
  { owner: /^(ArrayList|LinkedList|Vector|Stack|ArrayDeque|PriorityQueue|HashMap|LinkedHashMap|HashSet|LinkedHashSet|TreeSet)$/, member: /^of$/, kind: 'static',
    reason: 'JS-only convenience factory (the reference has no Class.of on these classes)' },
  { owner: /^(Stream|IntStream|LongStream|DoubleStream)$/, member: /^(from|ofArray)$/, reason: 'JS-only source (array / iterable) with no reference counterpart' },
  { owner: /^LinkedHashMap$/, member: /^lru$/, kind: 'static', reason: 'JS-only convenience factory' },
  { owner: /^(List|Set|Map)$/, member: /^ofLazy$/, reason: 'API newer than the reference runtime (JDK 23)' },
  { owner: /^Comparator$/, member: /^(max|min)$/, reason: 'API newer than the reference runtime (JDK 23)' },
  { owner: /^Objects$/, member: /^(identityHashCode|toIdentityString)$/, reason: 'identity-based values; differ by design between runtimes' },
  { owner: /./, member: /^modCount$/, reason: 'implementation field (protected in the reference)' },
  { owner: /^(Vector|Stack)$/, member: /^capacityIncrement$/, reason: 'implementation field (protected in the reference)' },
  { owner: /^LinkedHashMap$/, member: /^accessOrder$/, reason: 'implementation field (private in the reference)' },
  { owner: /^(HashMap|LinkedHashMap)$/, member: /^(getNode|removeNode)$/, reason: 'implementation hook (package-private in the reference)' },
  { owner: /./, member: /^removeRange$/, reason: 'protected in the reference (exercised indirectly through subList(..).clear())' },
  { owner: /^WritableArrayLike$/, member: /./, reason: 'type helper, not a runtime API' },
  { owner: /^Comparable$/, member: /^compareTo$/, reason: 'implemented by user element types, not by the library' },
  { owner: /^Integrator$/, member: /^greedy$/, kind: 'interface', reason: 'marker flag (the reference uses the Integrator.Greedy subtype)' },
  { owner: /^RANDOM_ACCESS$/, member: /./, reason: 'JS symbol constant (marker); RandomAccess itself is compared through isRandomAccess' },
  { owner: /^(PriorityQueue|ArrayDeque|IdentityHashMap)$/, member: /^hashCode$/, reason: 'identity hash code in the reference (not overridden there)' },
  { owner: /^(Collection|SequencedCollection|Queue|Deque)$/, member: /^hashCode$/, kind: 'interface',
    reason: 'identity hash code in the reference for these wrappers/views (not overridden there)' },
  { owner: /^AbstractCollection$|^AbstractQueue$/, member: /^hashCode$/, reason: 'identity hash code in the reference (not overridden there)' },
  { owner: /^AbstractCollection$/, member: /^(iterator|size|add)$/, reason: 'abstract hook implemented by the subclass (the harness subclass), not library code' },
  { owner: /^AbstractSet$/, member: /^(iterator|size|add)$/, reason: 'abstract hook implemented by the subclass (the harness subclass), not library code' },
  { owner: /^AbstractQueue$/, member: /^(offer|poll|peek|iterator|size)$/, reason: 'abstract hook implemented by the subclass (the harness subclass), not library code' },
  { owner: /^AbstractMap$/, member: /^(entrySet|put)$/, reason: 'abstract hook implemented by the subclass (the harness subclass), not library code' },
  { owner: /^AbstractList$/, member: /^(get|size|set|removeAt)$/, reason: 'abstract hook implemented by the subclass (the harness subclass), not library code' },
  { owner: /^AbstractSequentialList$/, member: /^(listIterator|size)$/, reason: 'abstract hook implemented by the subclass (the harness subclass), not library code' },
  { owner: /^RuntimeException$/, member: /^name$/, reason: 'base class; the library never throws it directly (its subclasses are compared)' },
];

/** Rows of exceptions: covered when that exception type was compared as the outcome of an op. */
const isException = (owner: string) => /Exception$/.test(owner);

export interface ReportInput {
  version: string;
  seeds: [number, number];
  batch: number;
  workers: number;
  seconds: number;
  perTarget: Record<string, number>;
  scripts: number;
  ops: number;
  coverage: CoverageData;
  divergences: { signature: string; count: number; example: Divergence; minimal?: Divergence; assessment: Assessment }[];
}

const NORMALISATIONS: [string, string][] = [
  ['`remove(int)` is `removeAt(index)`', 'TypeScript cannot tell remove(index) from remove(element) on a `List<number>`; the op `removeAt i` maps to the reference\'s remove(int).'],
  ['-0 and 0 print as 0; int catalogue functions add `+ 0`', 'int arithmetic has no -0 in the reference; JS numbers do. The double catalogue avoids producing -0, so DoubleStream.distinct (which keeps -0.0 and 0.0 apart) is not affected.'],
  ['Numbers print as integers or shortest round-trip digits (`25e-1`)', 'one JS number type versus the reference\'s int/long/double: values are compared, not their static type.'],
  ['Magnitudes >= 2^53-1 print as BIG', 'JS numbers are exact only up to 2^53; the empty LongSummaryStatistics min/max (64-bit limits) normalise to BIG.'],
  ['Hash-ordered containers print in sorted canonical form', 'iteration order of HashSet/HashMap/IdentityHashMap/PriorityQueue/Set.of/Map.of/Collectors.toSet/groupingBy is unspecified; their contents are compared as sorted multisets, and iterator/spliterator programs on them print `*` for single elements and `#n` for drained remainders.'],
  ['Unordered targets use only total-order comparators for min/max/sort', 'with ties, which element wins depends on iteration order.'],
  ['`values().remove(v)` is not generated on hashed maps', 'which of several equal values is removed depends on iteration order.'],
  ['State after a bulk op that throws midway is not compared', 'partial results of addAll/removeIf/sort/replaceAll/... are unspecified (and iteration-order dependent on hashed targets); the script stops there. UnsupportedOperationException is exempt (thrown before any change).'],
  ['Catalogue lambdas throw NullPointerException on null input', 'the reference unboxes (mapToInt, summingInt, comparingInt, primitive Optional.of, ...); a JS function cannot know it should, so the harness lambdas do it.'],
  ['Comparator results and Objects.compare are compared by sign', 'only the sign of a comparison is specified.'],
  ['Spliterator estimateSize/getExactSizeIfKnown only before traversal', 'after tryAdvance/forEachRemaining/trySplit the estimate is unspecified (printed `~`).'],
  ['trySplit prints prefix ++ rest', 'where (and whether) a spliterator splits is unspecified; for ORDERED spliterators prefix followed by the rest is the encounter order, which is compared.'],
  ['Parallel streams: only integer/string element types, no peek/forEach, order-independent or encounter-order terminals', 'execution is sequential in JS; results of these terminals are specified to be the same, double sums are not (summation order).'],
  ['unordered() only right before order-insensitive terminals', 'the reference may then pick any elements for limit/distinct.'],
  ['IdentityHashMap: small int keys/values only, no value-growing ops, no hashCode', 'reference identity equals JS === only for cached boxed ints (-128..127); its hashCode is identity-based.'],
  ['toString compared only where formats are claimed compatible', 'ordered collections, maps, Optional, summary statistics and int/string streams; a JS number cannot tell 1.0 from 1, so no toString of double collections.'],
  ['Collection/Queue wrappers, views and PriorityQueue/ArrayDeque: no hashCode', 'identity-based in the reference (equals is compared: identity semantics are specified).'],
];

function pct(a: number, b: number): string {
  return b === 0 ? '100.0' : ((100 * a) / b).toFixed(1);
}

export function writeReport(r: ReportInput): string {
  const rows = readApi();
  const counts = r.coverage.counts;
  type Row = ApiRow & { count: number; excluded?: string };
  const evaluated: Row[] = rows.map((row) => {
    const ex = EXCLUSIONS.find((e) => e.owner.test(row.owner) && e.member.test(row.member) && (!e.kind || e.kind === row.kind));
    let count = counts[`${row.owner}.${row.member}`] ?? 0;
    if (row.owner === 'Map' && row.member === 'Entry') count = Object.entries(counts).filter(([k]) => k.startsWith('Map.Entry.')).reduce((a, [, n]) => a + n, 0);
    if (isException(row.owner) && row.member === 'name') count = counts[`${row.owner}.name`] ?? 0;
    return { ...row, count, excluded: ex?.reason };
  });
  const comparable = evaluated.filter((x) => !x.excluded);
  const covered = comparable.filter((x) => x.count > 0);
  const uncovered = comparable.filter((x) => x.count === 0);
  const excluded = evaluated.filter((x) => x.excluded);
  const totalDiv = r.divergences.reduce((a, d) => a + d.count, 0);
  const L: string[] = [];
  L.push('# Compatibility with the reference runtime (JDK 23)', '');
  L.push('> Generated by `npm run test:diff:proof` (tools/differential/proof.ts). Do not edit by hand.', '');
  L.push('This library and the reference runtime were run on the same randomly generated operation scripts, and every result was compared step by step. That covers each return value, each exception class, and the full state of the collection after every op. Results go through the normalisations listed below. How the harness works: `tools/differential/README.md`.', '');
  L.push('## Summary', '');
  L.push(`| | |`, `|---|---|`);
  L.push(`| Reference runtime | ${r.version} |`);
  L.push(`| Seeds | ${r.seeds[0]}..${r.seeds[1]} (${r.seeds[1] - r.seeds[0] + 1} batches of ${r.batch}) |`);
  L.push(`| Scripts | ${r.scripts.toLocaleString('en-US')} |`);
  L.push(`| Operations compared | ${r.ops.toLocaleString('en-US')} |`);
  L.push(`| Comparable API covered | ${covered.length} / ${comparable.length} (${pct(covered.length, comparable.length)}%) |`);
  L.push(`| Excluded API rows (justified below) | ${excluded.length} |`);
  L.push(`| Divergent scripts | ${totalDiv.toLocaleString('en-US')} in ${r.divergences.length} signature(s) |`);
  const byCat = new Map<string, number>();
  for (const d of r.divergences) byCat.set(d.assessment.category, (byCat.get(d.assessment.category) ?? 0) + 1);
  L.push(`| Divergence assessment | ${[...byCat].map(([k, v]) => `${k}: ${v}`).join(', ') || 'none'} |`);
  L.push(`| Run time | ${r.seconds}s on ${r.workers} worker process(es) |`, '');

  L.push('## Scripts per target', '');
  L.push('Targets are base types. Many scripts operate on a view or wrapper of the base (subList, reversed, keySet, headMap, unmodifiable*, synchronized*, checked*, ...).', '');
  L.push('| Target | Scripts |', '|---|---:|');
  for (const [k, v] of Object.entries(r.perTarget).sort()) L.push(`| ${k} | ${v.toLocaleString('en-US')} |`);
  L.push('');

  L.push('## Normalisations (intentional deviations)', '');
  L.push('| Normalisation | Reason |', '|---|---|');
  for (const [n, why] of NORMALISATIONS) L.push(`| ${n} | ${why} |`);
  L.push('');

  L.push('## Divergences', '');
  if (r.divergences.length === 0) L.push('None.', '');
  for (const d of r.divergences) {
    const m = d.minimal ?? d.example;
    L.push(`### ${d.signature}`, '');
    L.push(`- scripts: ${d.count}; assessment: **${d.assessment.category}**. ${d.assessment.note}`, '');
    L.push('```');
    L.push(...scriptText(m.script).trimEnd().split('\n').map((l, i) => (i === m.line + 1 ? `>> ${l}` : `   ${l}`)));
    L.push(`   ref : ${m.ref}`, `   ours: ${m.ours}`);
    L.push('```', '');
  }

  L.push('## API coverage matrix', '');
  L.push('Every public member read from the declarations of `src/index.ts`, with the number of harness calls whose results were compared. Calls the library makes internally are not counted. Interface rows count calls on library-internal implementations (views, iterators, streams, spliterators, collectors, ...). Exception rows count how often that exception type was the compared outcome of an op.', '');
  if (uncovered.length > 0) {
    L.push(`**Not covered (${uncovered.length}):** ${uncovered.map((x) => `\`${x.owner}.${x.member}\``).join(', ')}`, '');
  }
  const owners = new Map<string, Row[]>();
  for (const x of evaluated) {
    const k = `${x.owner} (${x.kind === 'static' ? 'static' : x.kind === 'instance' ? 'class' : x.kind})`;
    owners.set(k, [...(owners.get(k) ?? []), x]);
  }
  L.push('| Owner | Covered | Excluded |', '|---|---:|---:|');
  for (const [k, xs] of owners) {
    const c = xs.filter((x) => !x.excluded);
    L.push(`| ${k} | ${c.filter((x) => x.count > 0).length}/${c.length} | ${xs.length - c.length} |`);
  }
  L.push('');
  for (const [k, xs] of owners) {
    L.push(`<details><summary>${k}</summary>`, '', '| Member | Times compared |', '|---|---:|');
    for (const x of xs) L.push(`| ${x.member} | ${x.excluded ? `excluded: ${x.excluded}` : x.count === 0 ? '**NOT COVERED**' : x.count.toLocaleString('en-US')} |`);
    L.push('', '</details>', '');
  }

  L.push('## Library-internal implementations reached', '');
  L.push('Views, iterators, wrappers and stream internals the harness received, with the public interfaces they implement and how many distinct members were called on them.', '');
  L.push('| Implementation | Interfaces | Members called |', '|---|---|---:|');
  for (const [k, v] of Object.entries(r.coverage.impls).sort()) L.push(`| ${k} | ${v.ifaces.join(', ') || '-'} | ${v.members.length} |`);
  L.push('');
  return L.join('\n') + '\n';
}
