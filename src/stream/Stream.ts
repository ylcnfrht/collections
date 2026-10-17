// Type contracts for streams. Implementations live in the pipeline modules; the value-side
// statics (Stream.of, IntStream.range, ...) are exported next to them and merged with these types.
import type { Iterator } from '../interfaces/Iterator';
import type { List } from '../interfaces/List';
import type { Comparator } from '../util/Comparator';
import type { WritableArrayLike } from '../util/arrays';
import type { DoubleSummaryStatistics, IntSummaryStatistics, LongSummaryStatistics } from '../util/SummaryStatistics';
import type { Collector } from './Collector';
import type { Gatherer } from './Gatherer';
import type { Optional, OptionalDouble, OptionalInt, OptionalLong } from './Optional';
import type { Spliterator } from './Spliterator';

/**
 * Common stream behaviour. A stream may be operated on (an intermediate or terminal
 * operation invoked) only once; further use throws IllegalStateException.
 * parallel() only records the flag: execution is always sequential (single-threaded JS),
 * which every parallel-capable operation is specified to tolerate.
 * Streams are also JS-iterable, consuming the stream like iterator().
 */
export interface BaseStream<T, S extends BaseStream<T, S>> extends Iterable<T> {
  iterator(): Iterator<T>;
  spliterator(): Spliterator<T>;
  isParallel(): boolean;
  sequential(): S;
  parallel(): S;
  unordered(): S;
  /** Registers a handler run by close(); handlers run in registration order. */
  onClose(closeHandler: () => void): S;
  /** Runs the close handlers. The first exception is rethrown after all ran; later ones are attached via `suppressed`. */
  close(): void;
}

/** Stream.Builder */
export interface StreamBuilder<T> {
  /** @throws IllegalStateException after build() */
  accept(t: T): void;
  add(t: T): StreamBuilder<T>;
  build(): Stream<T>;
}

/** Number-element builders (IntStream.Builder, ...). */
export interface NumberStreamBuilder<S> {
  accept(t: number): void;
  add(t: number): NumberStreamBuilder<S>;
  build(): S;
}

/** Lazy sequence of elements supporting aggregate operations. */
export interface Stream<T> extends BaseStream<T, Stream<T>> {
  // intermediate
  filter(predicate: (t: T) => boolean): Stream<T>;
  map<R>(mapper: (t: T) => R): Stream<R>;
  mapToInt(mapper: (t: T) => number): IntStream;
  mapToLong(mapper: (t: T) => number): LongStream;
  mapToDouble(mapper: (t: T) => number): DoubleStream;
  /** A null/undefined result stream is treated as empty; each mapped stream is closed after use. */
  flatMap<R>(mapper: (t: T) => Stream<R> | null | undefined): Stream<R>;
  flatMapToInt(mapper: (t: T) => IntStream | null | undefined): IntStream;
  flatMapToLong(mapper: (t: T) => LongStream | null | undefined): LongStream;
  flatMapToDouble(mapper: (t: T) => DoubleStream | null | undefined): DoubleStream;
  mapMulti<R>(mapper: (t: T, consumer: (r: R) => void) => void): Stream<R>;
  mapMultiToInt(mapper: (t: T, consumer: (n: number) => void) => void): IntStream;
  mapMultiToLong(mapper: (t: T, consumer: (n: number) => void) => void): LongStream;
  mapMultiToDouble(mapper: (t: T, consumer: (n: number) => void) => void): DoubleStream;
  /** Distinct by equals()/hashCode() (Objects.equals); the first occurrence is kept for ordered streams. */
  distinct(): Stream<T>;
  /** Stable for ordered streams. No argument (or null) = natural ordering. */
  sorted(comparator?: Comparator<T> | null): Stream<T>;
  peek(action: (t: T) => void): Stream<T>;
  /** @throws IllegalArgumentException if maxSize is negative */
  limit(maxSize: number): Stream<T>;
  /** @throws IllegalArgumentException if n is negative */
  skip(n: number): Stream<T>;
  takeWhile(predicate: (t: T) => boolean): Stream<T>;
  dropWhile(predicate: (t: T) => boolean): Stream<T>;
  gather<R>(gatherer: Gatherer<T, any, R>): Stream<R>;

  // terminal
  forEach(action: (t: T) => void): void;
  forEachOrdered(action: (t: T) => void): void;
  toArray(): T[];
  toArray<A extends WritableArrayLike<T>>(generator: (length: number) => A): A;
  reduce(identity: T, accumulator: (a: T, b: T) => T): T;
  reduce(accumulator: (a: T, b: T) => T): Optional<T>;
  reduce<U>(identity: U, accumulator: (u: U, t: T) => U, combiner: (a: U, b: U) => U): U;
  collect<R, A>(collector: Collector<T, A, R>): R;
  collect<R>(supplier: () => R, accumulator: (r: R, t: T) => void, combiner: (a: R, b: R) => void): R;
  /** Unmodifiable list; unlike List.of it allows null elements. */
  toList(): List<T>;
  min(comparator: Comparator<T>): Optional<T>;
  max(comparator: Comparator<T>): Optional<T>;
  count(): number;
  anyMatch(predicate: (t: T) => boolean): boolean;
  allMatch(predicate: (t: T) => boolean): boolean;
  noneMatch(predicate: (t: T) => boolean): boolean;
  /** @throws NullPointerException if the element selected is null */
  findFirst(): Optional<T>;
  findAny(): Optional<T>;
}

/** Shared shape of the three number streams; N is the stream type itself. */
interface NumberStream<N extends NumberStream<N, O>, O> extends BaseStream<number, N> {
  filter(predicate: (n: number) => boolean): N;
  map(mapper: (n: number) => number): N;
  mapToObj<U>(mapper: (n: number) => U): Stream<U>;
  flatMap(mapper: (n: number) => N | null | undefined): N;
  mapMulti(mapper: (n: number, consumer: (r: number) => void) => void): N;
  distinct(): N;
  sorted(): N;
  peek(action: (n: number) => void): N;
  limit(maxSize: number): N;
  skip(n: number): N;
  takeWhile(predicate: (n: number) => boolean): N;
  dropWhile(predicate: (n: number) => boolean): N;
  forEach(action: (n: number) => void): void;
  forEachOrdered(action: (n: number) => void): void;
  toArray(): number[];
  reduce(identity: number, op: (a: number, b: number) => number): number;
  reduce(op: (a: number, b: number) => number): O;
  collect<R>(supplier: () => R, accumulator: (r: R, n: number) => void, combiner: (a: R, b: R) => void): R;
  sum(): number;
  min(): O;
  max(): O;
  count(): number;
  average(): OptionalDouble;
  anyMatch(predicate: (n: number) => boolean): boolean;
  allMatch(predicate: (n: number) => boolean): boolean;
  noneMatch(predicate: (n: number) => boolean): boolean;
  findFirst(): O;
  findAny(): O;
  boxed(): Stream<number>;
}

/**
 * IntStream. Elements are JS numbers expected to be 32-bit integers; values are not
 * coerced and sum() does not wrap on overflow (documented difference).
 */
export interface IntStream extends NumberStream<IntStream, OptionalInt> {
  mapToLong(mapper: (n: number) => number): LongStream;
  mapToDouble(mapper: (n: number) => number): DoubleStream;
  asLongStream(): LongStream;
  asDoubleStream(): DoubleStream;
  summaryStatistics(): IntSummaryStatistics;
}

/** LongStream. Elements are JS numbers (not bigint); exact up to Number.MAX_SAFE_INTEGER. */
export interface LongStream extends NumberStream<LongStream, OptionalLong> {
  mapToInt(mapper: (n: number) => number): IntStream;
  mapToDouble(mapper: (n: number) => number): DoubleStream;
  asDoubleStream(): DoubleStream;
  summaryStatistics(): LongSummaryStatistics;
}

/** DoubleStream. sum()/average() use compensated (Kahan) summation like the reference. */
export interface DoubleStream extends NumberStream<DoubleStream, OptionalDouble> {
  mapToInt(mapper: (n: number) => number): IntStream;
  mapToLong(mapper: (n: number) => number): LongStream;
  summaryStatistics(): DoubleSummaryStatistics;
}
