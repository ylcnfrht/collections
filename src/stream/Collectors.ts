// Collectors: the standard mutable-reduction recipes, plus the value side of Collector (Collector.of, Characteristics).
// Each factory mirrors the reference implementation: same containers, same combiners, same characteristics.
import { AbstractMap, SimpleImmutableEntry } from '../abstract/AbstractMap';
import { AbstractSet } from '../abstract/AbstractSet';
import { IllegalStateException, NullPointerException } from '../exceptions';
import { buildSet, List as ImmutableList, Map as ImmutableMap, Set as ImmutableSet } from '../immutable/ImmutableCollections';
import type { Collection } from '../interfaces/Collection';
import type { Iterator } from '../interfaces/Iterator';
import type { List } from '../interfaces/List';
import type { Map, MapEntry } from '../interfaces/Map';
import type { Set } from '../interfaces/Set';
import { ArrayList } from '../list/ArrayList';
import { HashMap } from '../map/HashMap';
import { HashSet } from '../set/HashSet';
import type { Comparator } from '../util/Comparator';
import { requireNonNull, toString } from '../util/Objects';
import { CompensatedSum, DoubleSummaryStatistics, IntSummaryStatistics, LongSummaryStatistics } from '../util/SummaryStatistics';
import type { Collector as CollectorType, CollectorCharacteristics } from './Collector';
import { Optional } from './Optional';
import { closeAfterFailure } from './pipeline/Sink';

export type Collector<T, A, R> = CollectorType<T, A, R>;
export type { CollectorCharacteristics };

/** Anything with forEach and close: the streams flatMapping consumes. */
interface ClosableSource<U> {
  forEach(action: (u: U) => void): void;
  close(): void;
}

type Chars = Set<CollectorCharacteristics>;
// any: the container type the reference hides behind a wildcard; callers never touch it
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Hidden = any;

const CHAR_ORDER: readonly CollectorCharacteristics[] = ['CONCURRENT', 'UNORDERED', 'IDENTITY_FINISH'];
const charRank = (c: CollectorCharacteristics): number => {
  const i = CHAR_ORDER.indexOf(c);
  return i < 0 ? CHAR_ORDER.length : i;
};

function chars(...cs: CollectorCharacteristics[]): Chars {
  // unmodifiable and deduplicated, in enum order like an EnumSet; contains(null) is false
  return buildSet(cs.length > 1 ? cs.slice().sort((a, b) => charRank(a) - charRank(b)) : cs, false, true);
}

const throwNpe = (): never => {
  throw new NullPointerException();
};
/**
 * f, or a function throwing NullPointerException when f is null/undefined: the reference does not check these
 * arguments when the collector is created, only fails where it calls them.
 */
function lazy<F>(f: F): NonNullable<F> {
  return (f ?? throwNpe) as NonNullable<F>;
}

const CH_CONCURRENT_ID = chars('CONCURRENT', 'UNORDERED', 'IDENTITY_FINISH');
const CH_CONCURRENT_NOID = chars('CONCURRENT', 'UNORDERED');
const CH_ID = chars('IDENTITY_FINISH');
const CH_UNORDERED_ID = chars('UNORDERED', 'IDENTITY_FINISH');
const CH_NOID = chars();
const CH_UNORDERED_NOID = chars('UNORDERED');

const identity = <X>(x: X): X => x;

class CollectorImpl<T, A, R> implements CollectorType<T, A, R> {
  constructor(
    private readonly sup: () => A,
    private readonly acc: (a: A, t: T) => void,
    private readonly comb: (a: A, b: A) => A,
    private readonly fin: (a: A) => R,
    private readonly ch: Chars
  ) {}
  supplier(): () => A {
    return this.sup;
  }
  accumulator(): (a: A, t: T) => void {
    return this.acc;
  }
  combiner(): (a: A, b: A) => A {
    return this.comb;
  }
  finisher(): (a: A) => R {
    return this.fin;
  }
  characteristics(): Chars {
    return this.ch;
  }
}

function make<T, A, R>(sup: () => A, acc: (a: A, t: T) => void, comb: (a: A, b: A) => A, fin: (a: A) => R, ch: Chars): CollectorType<T, A, R> {
  return new CollectorImpl(sup, acc, comb, fin, ch);
}

function makeId<T, A>(sup: () => A, acc: (a: A, t: T) => void, comb: (a: A, b: A) => A, ch: Chars): CollectorType<T, A, A> {
  return new CollectorImpl(sup, acc, comb, identity, ch);
}

function isIdentityFinish(c: { characteristics(): Chars }): boolean {
  return c.characteristics().contains('IDENTITY_FINISH');
}

function duplicateKeyException(k: unknown, u: unknown, v: unknown): IllegalStateException {
  return new IllegalStateException(`Duplicate key ${toString(k)} (attempted merging values ${toString(u)} and ${toString(v)})`);
}

/** Merges m2 into m1 with merge() per entry, as the reference's mapMerger. */
function mapMerger<K, V, M extends Map<K, V>>(mergeFunction: (a: V, b: V) => V | null | undefined): (m1: M, m2: M) => M {
  return (m1, m2) => {
    m2.forEach((k, v) => {
      m1.merge(k, v, mergeFunction);
    });
    return m1;
  };
}

function uniqKeysMapAccumulator<T, K, V>(keyMapper: (t: T) => K, valueMapper: (t: T) => V): (map: Map<K, V>, t: T) => void {
  return (map, element) => {
    const k = keyMapper(element);
    const v = requireNonNull(valueMapper(element));
    const u = map.putIfAbsent(k, v);
    if (u !== null && u !== undefined) throw duplicateKeyException(k, u, v);
  };
}

function uniqKeysMapMerger<K, V, M extends Map<K, V>>(): (m1: M, m2: M) => M {
  return (m1, m2) => {
    m2.forEach((k, v) => {
      requireNonNull(v);
      const u = m1.putIfAbsent(k, v);
      if (u !== null && u !== undefined) throw duplicateKeyException(k, u, v);
    });
    return m1;
  };
}

function addAllCombiner<C extends Collection<unknown>>(left: C, right: C): C {
  left.addAll(right);
  return left;
}

function setCombiner<E>(left: Set<E>, right: Set<E>): Set<E> {
  if (left.size() < right.size()) {
    right.addAll(left);
    return right;
  }
  left.addAll(right);
  return left;
}

/** StringJoiner equivalent. Plain concatenation: V8 builds it as a rope, cheaper than array join even after flattening. */
class Joiner {
  value = '';
  empty = true;
  constructor(readonly delimiter: string, readonly prefix: string, readonly suffix: string) {}
  add(s: string): void {
    if (this.empty) {
      this.value = s;
      this.empty = false;
    } else this.value += this.delimiter + s;
  }
  merge(other: Joiner): Joiner {
    if (!other.empty) this.add(other.value);
    return this;
  }
  toString(): string {
    return this.prefix + this.value + this.suffix;
  }
}

/** Optional-returning reduction state. */
interface OptionalBox<T> {
  value: T;
  present: boolean;
}

/**
 * The map partitioningBy returns: exactly two entries, false then true; unmodifiable.
 * Values are read from the live containers, so accumulation into them shows through.
 */
class Partition<T> extends AbstractMap<boolean, T> {
  constructor(public forTrue: T, public forFalse: T) {
    super();
  }
  entrySet(): Set<MapEntry<boolean, T>> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const p = this;
    return new (class extends AbstractSet<MapEntry<boolean, T>> {
      iterator(): Iterator<MapEntry<boolean, T>> {
        return ImmutableList.of<MapEntry<boolean, T>>(new SimpleImmutableEntry(false, p.forFalse), new SimpleImmutableEntry(true, p.forTrue)).iterator();
      }
      size(): number {
        return 2;
      }
    })();
  }
  override size(): number {
    return 2;
  }
  override containsKey(key: unknown): boolean {
    return key === true || key === false;
  }
  override get(key: unknown): T | null {
    return key === true ? this.forTrue : key === false ? this.forFalse : null;
  }
}

// ---- the collectors

function toCollection<T, C extends Collection<T>>(collectionFactory: () => C): CollectorType<T, C, C> {
  return makeId(lazy(collectionFactory), (c, t) => {
    c.add(t);
  }, addAllCombiner, CH_ID);
}

function toList<T>(): CollectorType<T, List<T>, List<T>> {
  return makeId<T, List<T>>(() => new ArrayList<T>(), (l, t) => {
    l.add(t);
  }, addAllCombiner, CH_ID);
}

function toUnmodifiableList<T>(): CollectorType<T, List<T>, List<T>> {
  return make<T, List<T>, List<T>>(() => new ArrayList<T>(), (l, t) => {
    l.add(t);
  }, addAllCombiner, (l) => ImmutableList.copyOf(l), CH_NOID);
}

function toSet<T>(): CollectorType<T, Set<T>, Set<T>> {
  return makeId<T, Set<T>>(() => new HashSet<T>(), (s, t) => {
    s.add(t);
  }, setCombiner, CH_UNORDERED_ID);
}

function toUnmodifiableSet<T>(): CollectorType<T, Set<T>, Set<T>> {
  return make<T, Set<T>, Set<T>>(() => new HashSet<T>(), (s, t) => {
    s.add(t);
  }, setCombiner, (s) => ImmutableSet.copyOf(s), CH_UNORDERED_NOID);
}

/** Elements are appended with String(); null gives "null". */
function joining(): CollectorType<string | null, Hidden, string>;
function joining(delimiter: string): CollectorType<string | null, Hidden, string>;
/** A null/undefined delimiter, prefix or suffix throws NullPointerException when the collector is used, like the reference. */
function joining(delimiter: string, prefix: string, suffix: string): CollectorType<string | null, Hidden, string>;
function joining(d?: string, p?: string, s?: string): CollectorType<string | null, Hidden, string> {
  // arguments.length, not default parameters: joining(undefined) must fail like joining(null)
  const n = arguments.length;
  const delimiter = n === 0 ? '' : d, prefix = n < 3 ? '' : p, suffix = n < 3 ? '' : s;
  return make<string | null, Joiner, string>(
    () =>
      new Joiner(
        requireNonNull(delimiter, 'The delimiter must not be null'),
        requireNonNull(prefix, 'The prefix must not be null'),
        requireNonNull(suffix, 'The suffix must not be null')
      ),
    (j, s) => j.add(typeof s === 'string' ? s : toString(s)),
    (a, b) => a.merge(b),
    (j) => j.toString(),
    CH_NOID
  ) as CollectorType<string | null, Hidden, string>;
}

function mapping<T, U, A, R>(mapper: (t: T) => U, downstream: CollectorType<U, A, R>): CollectorType<T, A, R> {
  mapper = lazy(mapper);
  const acc = requireNonNull(downstream).accumulator();
  return make<T, A, R>(downstream.supplier(), (r, t) => acc(r, mapper(t)), downstream.combiner(), downstream.finisher(), downstream.characteristics());
}

function filtering<T, A, R>(predicate: (t: T) => boolean, downstream: CollectorType<T, A, R>): CollectorType<T, A, R> {
  predicate = lazy(predicate);
  const acc = requireNonNull(downstream).accumulator();
  return make<T, A, R>(downstream.supplier(), (r, t) => {
    if (predicate(t)) acc(r, t);
  }, downstream.combiner(), downstream.finisher(), downstream.characteristics());
}

/** Each mapped stream is closed after its elements are consumed; a null/undefined result counts as empty. */
function flatMapping<T, U, A, R>(mapper: (t: T) => ClosableSource<U> | null | undefined, downstream: CollectorType<U, A, R>): CollectorType<T, A, R> {
  mapper = lazy(mapper);
  const acc = requireNonNull(downstream).accumulator();
  return make<T, A, R>(downstream.supplier(), (r, t) => {
    const result = mapper(t);
    if (result === null || result === undefined) return;
    try {
      result.forEach((u) => acc(r, u));
    } catch (e) {
      closeAfterFailure(e, result);
    }
    result.close();
  }, downstream.combiner(), downstream.finisher(), downstream.characteristics());
}

function collectingAndThen<T, A, R, RR>(downstream: CollectorType<T, A, R>, finisher: (r: R) => RR): CollectorType<T, A, RR> {
  requireNonNull(finisher);
  let ch = requireNonNull(downstream).characteristics();
  if (ch.contains('IDENTITY_FINISH')) {
    ch = ch.size() === 1 ? CH_NOID : chars(...ch.toArray().filter((c) => c !== 'IDENTITY_FINISH'));
  }
  const df = downstream.finisher();
  return make<T, A, RR>(downstream.supplier(), downstream.accumulator(), downstream.combiner(), (a) => finisher(df(a)), ch);
}

function counting<T>(): CollectorType<T, Hidden, number> {
  return summingLong<T>(() => 1);
}

function reducingOptional<T>(op: (a: T, b: T) => T): CollectorType<T, Hidden, Optional<NonNullable<T>>> {
  const accept = (box: OptionalBox<T>, t: T): void => {
    if (box.present) box.value = op(box.value, t);
    else {
      box.value = t;
      box.present = true;
    }
  };
  return make<T, OptionalBox<T>, Optional<NonNullable<T>>>(
    () => ({ value: undefined as unknown as T, present: false }),
    accept,
    (a, b) => {
      if (b.present) accept(a, b.value);
      return a;
    },
    (a) => Optional.ofNullable(a.value),
    CH_NOID
  ) as CollectorType<T, Hidden, Optional<NonNullable<T>>>;
}

function minBy<T>(comparator: Comparator<T>): CollectorType<T, Hidden, Optional<NonNullable<T>>> {
  requireNonNull(comparator);
  return reducingOptional<T>((a, b) => (comparator(a, b) <= 0 ? a : b));
}

function maxBy<T>(comparator: Comparator<T>): CollectorType<T, Hidden, Optional<NonNullable<T>>> {
  requireNonNull(comparator);
  return reducingOptional<T>((a, b) => (comparator(a, b) >= 0 ? a : b));
}

/** Plain sum of mapper results; like IntStream.sum() here, int overflow does not wrap (documented difference). */
function summingInt<T>(mapper: (t: T) => number): CollectorType<T, Hidden, number> {
  return summingLong(mapper);
}

/** Plain sum; exact up to Number.MAX_SAFE_INTEGER. */
function summingLong<T>(mapper: (t: T) => number): CollectorType<T, Hidden, number> {
  mapper = lazy(mapper);
  return make<T, number[], number>(() => [0], (a, t) => {
    a[0] += mapper(t);
  }, (a, b) => {
    a[0] += b[0];
    return a;
  }, (a) => a[0], CH_NOID) as CollectorType<T, Hidden, number>;
}

/** Compensated (Kahan) summation, as the reference; an infinite plain sum wins over a NaN compensated one. */
function summingDouble<T>(mapper: (t: T) => number): CollectorType<T, Hidden, number> {
  mapper = lazy(mapper);
  return make<T, CompensatedSum, number>(() => new CompensatedSum(), (a, t) => a.add(mapper(t)), (a, b) => {
    a.addAll(b);
    return a;
  }, (a) => a.result(), CH_NOID) as CollectorType<T, Hidden, number>;
}

/** 0 when no elements. */
function averagingInt<T>(mapper: (t: T) => number): CollectorType<T, Hidden, number> {
  return averagingLong(mapper);
}

/** 0 when no elements. */
function averagingLong<T>(mapper: (t: T) => number): CollectorType<T, Hidden, number> {
  mapper = lazy(mapper);
  // [sum, count]
  return make<T, number[], number>(() => [0, 0], (a, t) => {
    a[0] += mapper(t);
    a[1]++;
  }, (a, b) => {
    a[0] += b[0];
    a[1] += b[1];
    return a;
  }, (a) => (a[1] === 0 ? 0 : a[0] / a[1]), CH_NOID) as CollectorType<T, Hidden, number>;
}

/** Compensated summation, as the reference. 0 when no elements. */
function averagingDouble<T>(mapper: (t: T) => number): CollectorType<T, Hidden, number> {
  return collectingAndThen(summarizingDouble(mapper), (st) => st.getAverage()) as CollectorType<T, Hidden, number>;
}

function reducing<T>(op: (a: T, b: T) => T): CollectorType<T, Hidden, Optional<NonNullable<T>>>;
function reducing<T>(identity: T, op: (a: T, b: T) => T): CollectorType<T, Hidden, T>;
function reducing<T, U>(identity: U, mapper: (t: T) => U, op: (a: U, b: U) => U): CollectorType<T, Hidden, U>;
function reducing(...args: unknown[]): AnyCollector {
  type F = (a: unknown, b: unknown) => unknown;
  if (args.length <= 1) return reducingOptional(lazy(args[0]) as F);
  const id = args[0];
  const mapper = args.length === 2 ? identity : (lazy(args[1]) as (t: unknown) => unknown);
  const op = lazy(args[args.length - 1]) as F;
  return make<unknown, unknown[], unknown>(() => [id], (a, t) => {
    a[0] = op(a[0], mapper(t));
  }, (a, b) => {
    a[0] = op(a[0], b[0]);
    return a;
  }, (a) => a[0], CH_NOID);
}

const NULL_KEY = 'element cannot be mapped to a null key';

function groupingImpl<T, K, D, A, M extends Map<K, D>>(
  classifier: (t: T) => K,
  mapFactory: () => M,
  downstream: CollectorType<T, A, D>,
  idChars: Chars,
  noIdChars: Chars
): CollectorType<T, Hidden, M> {
  classifier = lazy(classifier);
  mapFactory = lazy(mapFactory);
  const dSup = requireNonNull(downstream).supplier();
  const dAcc = downstream.accumulator();
  const newContainer = (): A => dSup();
  // the map holds containers (A) while accumulating, results (D) after the finisher
  const accumulator = (m: Map<K, A>, t: T): void => {
    const key = requireNonNull(classifier(t), NULL_KEY);
    dAcc(m.computeIfAbsent(key, newContainer) as A, t);
  };
  const merger = mapMerger<K, A, Map<K, A>>(downstream.combiner());
  if (isIdentityFinish(downstream)) {
    return make<T, Map<K, A>, M>(mapFactory as unknown as () => Map<K, A>, accumulator, merger, identity as never, idChars) as CollectorType<T, Hidden, M>;
  }
  const dFin = downstream.finisher();
  return make<T, Map<K, A>, M>(mapFactory as unknown as () => Map<K, A>, accumulator, merger, (m) => {
    (m as unknown as Map<K, unknown>).replaceAll((_k, v) => dFin(v as A));
    return m as unknown as M;
  }, noIdChars) as CollectorType<T, Hidden, M>;
}

/** Default map HashMap, default downstream toList(). @throws NullPointerException "element cannot be mapped to a null key" */
function groupingBy<T, K>(classifier: (t: T) => K): CollectorType<T, Hidden, Map<K, List<T>>>;
function groupingBy<T, K, A, D>(classifier: (t: T) => K, downstream: CollectorType<T, A, D>): CollectorType<T, Hidden, Map<K, D>>;
function groupingBy<T, K, D, A, M extends Map<K, D>>(classifier: (t: T) => K, mapFactory: () => M, downstream: CollectorType<T, A, D>): CollectorType<T, Hidden, M>;
function groupingBy(classifier: (t: unknown) => unknown, a?: unknown, b?: unknown): CollectorType<unknown, unknown, unknown> {
  const [mapFactory, downstream] = groupingArgs(arguments.length, a, b);
  return groupingImpl(classifier, mapFactory, downstream, CH_ID, CH_NOID);
}

/**
 * Same results as groupingBy (single-threaded runtime), reported as CONCURRENT and UNORDERED.
 * The default map is a HashMap standing in for a concurrent hash map (so null-valued results are not rejected).
 */
function groupingByConcurrent<T, K>(classifier: (t: T) => K): CollectorType<T, Hidden, Map<K, List<T>>>;
function groupingByConcurrent<T, K, A, D>(classifier: (t: T) => K, downstream: CollectorType<T, A, D>): CollectorType<T, Hidden, Map<K, D>>;
function groupingByConcurrent<T, K, D, A, M extends Map<K, D>>(classifier: (t: T) => K, mapFactory: () => M, downstream: CollectorType<T, A, D>): CollectorType<T, Hidden, M>;
function groupingByConcurrent(classifier: (t: unknown) => unknown, a?: unknown, b?: unknown): CollectorType<unknown, unknown, unknown> {
  const [mapFactory, downstream] = groupingArgs(arguments.length, a, b);
  return groupingImpl(classifier, mapFactory, downstream, CH_CONCURRENT_ID, CH_CONCURRENT_NOID);
}

// any: erased element/container/result types behind the typed overloads
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCollector = CollectorType<any, any, any>;

function groupingArgs(n: number, a: unknown, b: unknown): [() => Map<unknown, unknown>, AnyCollector] {
  if (n <= 1) return [() => new HashMap(), toList() as AnyCollector];
  if (n === 2) return [() => new HashMap(), a as AnyCollector];
  return [a as () => Map<unknown, unknown>, b as AnyCollector];
}

/** The result always maps both false and true. */
function partitioningBy<T>(predicate: (t: T) => boolean): CollectorType<T, Hidden, Map<boolean, List<T>>>;
function partitioningBy<T, D, A>(predicate: (t: T) => boolean, downstream: CollectorType<T, A, D>): CollectorType<T, Hidden, Map<boolean, D>>;
function partitioningBy<T, D, A>(predicate: (t: T) => boolean, ds?: CollectorType<T, A, D>): CollectorType<T, Hidden, Map<boolean, D>> {
  predicate = lazy(predicate);
  const downstream = arguments.length < 2 ? (toList<T>() as unknown as CollectorType<T, A, D>) : ds!;
  const dSup = requireNonNull(downstream).supplier();
  const dAcc = downstream.accumulator();
  const op = downstream.combiner();
  const sup = (): Partition<A> => new Partition(dSup(), dSup());
  const acc = (p: Partition<A>, t: T): void => dAcc(predicate(t) ? p.forTrue : p.forFalse, t);
  const merger = (l: Partition<A>, r: Partition<A>): Partition<A> => new Partition(op(l.forTrue, r.forTrue), op(l.forFalse, r.forFalse));
  if (isIdentityFinish(downstream)) return make(sup, acc, merger, identity, CH_ID) as unknown as CollectorType<T, Hidden, Map<boolean, D>>;
  const dFin = downstream.finisher();
  return make(sup, acc, merger, (p) => new Partition<D>(dFin(p.forTrue), dFin(p.forFalse)) as Map<boolean, D>, CH_NOID) as CollectorType<T, Hidden, Map<boolean, D>>;
}

/**
 * Without mergeFunction: a duplicate key throws IllegalStateException
 * "Duplicate key k (attempted merging values v1 and v2)"; a null value throws NullPointerException.
 * With mergeFunction: values for equal keys are merged (a null value throws NullPointerException,
 * a null merge result removes the key). Default map HashMap.
 */
function toMap<T, K, U>(keyMapper: (t: T) => K, valueMapper: (t: T) => U): CollectorType<T, Hidden, Map<K, U>>;
function toMap<T, K, U>(keyMapper: (t: T) => K, valueMapper: (t: T) => U, mergeFunction: (a: U, b: U) => U): CollectorType<T, Hidden, Map<K, U>>;
function toMap<T, K, U, M extends Map<K, U>>(keyMapper: (t: T) => K, valueMapper: (t: T) => U, mergeFunction: (a: U, b: U) => U, mapFactory: () => M): CollectorType<T, Hidden, M>;
function toMap(keyMapper: (t: unknown) => unknown, valueMapper: (t: unknown) => unknown, ...rest: unknown[]): AnyCollector {
  return toMapImpl(arguments.length, keyMapper, valueMapper, rest[0], rest[1], CH_ID);
}

/** Same results as toMap, reported as CONCURRENT, UNORDERED and IDENTITY_FINISH. Default map: HashMap (null keys are not rejected). */
function toConcurrentMap<T, K, U>(keyMapper: (t: T) => K, valueMapper: (t: T) => U): CollectorType<T, Hidden, Map<K, U>>;
function toConcurrentMap<T, K, U>(keyMapper: (t: T) => K, valueMapper: (t: T) => U, mergeFunction: (a: U, b: U) => U): CollectorType<T, Hidden, Map<K, U>>;
function toConcurrentMap<T, K, U, M extends Map<K, U>>(keyMapper: (t: T) => K, valueMapper: (t: T) => U, mergeFunction: (a: U, b: U) => U, mapFactory: () => M): CollectorType<T, Hidden, M>;
function toConcurrentMap(keyMapper: (t: unknown) => unknown, valueMapper: (t: unknown) => unknown, ...rest: unknown[]): AnyCollector {
  return toMapImpl(arguments.length, keyMapper, valueMapper, rest[0], rest[1], CH_CONCURRENT_ID);
}

function toMapImpl(n: number, keyMapper: (t: unknown) => unknown, valueMapper: (t: unknown) => unknown, merge: unknown, factory: unknown, ch: Chars): AnyCollector {
  keyMapper = lazy(keyMapper);
  valueMapper = lazy(valueMapper);
  type M = Map<unknown, unknown>;
  if (n <= 2) return makeId<unknown, M>(() => new HashMap(), uniqKeysMapAccumulator(keyMapper, valueMapper), uniqKeysMapMerger(), ch);
  // a null mergeFunction reaches Map.merge, which rejects it on the first element
  const mergeFunction = merge as (a: unknown, b: unknown) => unknown;
  const mapFactory = n >= 4 ? (lazy(factory) as () => M) : () => new HashMap();
  return makeId<unknown, M>(mapFactory, (map, element) => {
    map.merge(keyMapper(element), valueMapper(element), mergeFunction);
  }, mapMerger(mergeFunction), ch);
}

/** Unmodifiable, null-free result; null keys and values throw NullPointerException, duplicates as toMap. */
function toUnmodifiableMap<T, K, U>(keyMapper: (t: T) => K, valueMapper: (t: T) => U): CollectorType<T, Hidden, Map<K, U>>;
function toUnmodifiableMap<T, K, U>(keyMapper: (t: T) => K, valueMapper: (t: T) => U, mergeFunction: (a: U, b: U) => U): CollectorType<T, Hidden, Map<K, U>>;
function toUnmodifiableMap(keyMapper: (t: unknown) => unknown, valueMapper: (t: unknown) => unknown, mergeFunction?: (a: unknown, b: unknown) => unknown): AnyCollector {
  requireNonNull(keyMapper, 'keyMapper');
  requireNonNull(valueMapper, 'valueMapper');
  const inner = arguments.length < 3 ? toMap(keyMapper, valueMapper) : toMap(keyMapper, valueMapper, requireNonNull(mergeFunction, 'mergeFunction'));
  return collectingAndThen(inner, (m) => ImmutableMap.copyOf(m));
}

function summarizing<T, S extends { accept(n: number): void; combine(o: S): void }>(stats: () => S, mapper: (t: T) => number): CollectorType<T, S, S> {
  mapper = lazy(mapper);
  return makeId<T, S>(stats, (r, t) => r.accept(mapper(t)), (l, r) => {
    l.combine(r);
    return l;
  }, CH_ID);
}

function summarizingInt<T>(mapper: (t: T) => number): CollectorType<T, IntSummaryStatistics, IntSummaryStatistics> {
  return summarizing(() => new IntSummaryStatistics(), mapper);
}

function summarizingLong<T>(mapper: (t: T) => number): CollectorType<T, LongSummaryStatistics, LongSummaryStatistics> {
  return summarizing(() => new LongSummaryStatistics(), mapper);
}

function summarizingDouble<T>(mapper: (t: T) => number): CollectorType<T, DoubleSummaryStatistics, DoubleSummaryStatistics> {
  return summarizing(() => new DoubleSummaryStatistics(), mapper);
}

/**
 * Feeds every element to both downstreams and merges their results.
 * Characteristics: the intersection of both, minus IDENTITY_FINISH.
 */
function teeing<T, R1, R2, R>(downstream1: CollectorType<T, Hidden, R1>, downstream2: CollectorType<T, Hidden, R2>, merger: (r1: R1, r2: R2) => R): CollectorType<T, Hidden, R> {
  requireNonNull(downstream1, 'downstream1');
  requireNonNull(downstream2, 'downstream2');
  requireNonNull(merger, 'merger');
  const s1 = requireNonNull(downstream1.supplier(), 'downstream1 supplier');
  const s2 = requireNonNull(downstream2.supplier(), 'downstream2 supplier');
  const a1 = requireNonNull(downstream1.accumulator(), 'downstream1 accumulator');
  const a2 = requireNonNull(downstream2.accumulator(), 'downstream2 accumulator');
  const c1 = requireNonNull(downstream1.combiner(), 'downstream1 combiner');
  const c2 = requireNonNull(downstream2.combiner(), 'downstream2 combiner');
  const f1 = requireNonNull(downstream1.finisher(), 'downstream1 finisher');
  const f2 = requireNonNull(downstream2.finisher(), 'downstream2 finisher');
  const ch1 = downstream1.characteristics(), ch2 = downstream2.characteristics();
  const ch = ch1.isEmpty() || ch2.isEmpty() ? CH_NOID : chars(...ch1.toArray().filter((c) => c !== 'IDENTITY_FINISH' && ch2.contains(c)));
  type Pair = { left: unknown; right: unknown };
  return make<T, Pair, R>(() => ({ left: s1(), right: s2() }), (p, t) => {
    a1(p.left, t);
    a2(p.right, t);
  }, (p, o) => {
    p.left = c1(p.left, o.left);
    p.right = c2(p.right, o.right);
    return p;
  }, (p) => merger(f1(p.left), f2(p.right)), ch) as CollectorType<T, Hidden, R>;
}

export const Collectors = {
  toCollection,
  toList,
  toUnmodifiableList,
  toSet,
  toUnmodifiableSet,
  joining,
  mapping,
  filtering,
  flatMapping,
  collectingAndThen,
  counting,
  minBy,
  maxBy,
  summingInt,
  summingLong,
  summingDouble,
  averagingInt,
  averagingLong,
  averagingDouble,
  reducing,
  groupingBy,
  groupingByConcurrent,
  partitioningBy,
  toMap,
  toUnmodifiableMap,
  toConcurrentMap,
  summarizingInt,
  summarizingLong,
  summarizingDouble,
  teeing,
};

// ---- Collector value side

function of<T, R>(supplier: () => R, accumulator: (r: R, t: T) => void, combiner: (a: R, b: R) => R, ...characteristics: CollectorCharacteristics[]): CollectorType<T, R, R>;
function of<T, A, R>(supplier: () => A, accumulator: (a: A, t: T) => void, combiner: (a: A, b: A) => A, finisher: (a: A) => R, ...characteristics: CollectorCharacteristics[]): CollectorType<T, A, R>;
function of(supplier: () => unknown, accumulator: (a: unknown, t: unknown) => void, combiner: (a: unknown, b: unknown) => unknown, ...rest: unknown[]): AnyCollector {
  requireNonNull(supplier);
  requireNonNull(accumulator);
  requireNonNull(combiner);
  // a string 4th argument is a characteristic; anything else (including null) is the finisher
  if (rest.length === 0 || typeof rest[0] === 'string') {
    const cs = rest as CollectorCharacteristics[];
    return makeId(supplier, accumulator, combiner, cs.length === 0 ? CH_ID : chars('IDENTITY_FINISH', ...cs));
  }
  const finisher = requireNonNull(rest[0]) as (a: unknown) => unknown;
  const cs = rest.slice(1) as CollectorCharacteristics[];
  return make(supplier, accumulator, combiner, finisher, cs.length === 0 ? CH_NOID : chars(...cs));
}

export const Collector = {
  /**
   * Collector from functions. Without a finisher the result is the container and IDENTITY_FINISH is
   * always reported; with one, exactly the given characteristics are reported.
   * @throws NullPointerException if any function or characteristic is null
   */
  of,
  Characteristics: {
    CONCURRENT: 'CONCURRENT',
    UNORDERED: 'UNORDERED',
    IDENTITY_FINISH: 'IDENTITY_FINISH',
  } as const satisfies Record<CollectorCharacteristics, CollectorCharacteristics>,
};
