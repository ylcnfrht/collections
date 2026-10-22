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

// so the published typings compile without lib esnext.disposable or @types/node (merges with theirs)
declare global {
  interface SymbolConstructor {
    readonly dispose: unique symbol;
  }
}

/**
 * Behaviour shared by every stream: iteration, the parallel flag, ordering and closing.
 *
 * A stream is single use. Once an intermediate or terminal operation has been called on a stream object, any
 * further operation on it throws {@link IllegalStateException}; only `close()`, `isParallel()`, `parallel()` and
 * `sequential()` stay callable. `parallel()` only records a flag: evaluation is always sequential (one JS thread),
 * which every parallel-capable operation is specified to tolerate. Streams are also JS iterables: `for…of` and
 * spread consume the stream like `iterator()` and close it when the iteration ends.
 */
export interface BaseStream<T, S extends BaseStream<T, S>> extends Iterable<T> {
  /**
   * Returns an {@link Iterator} over the stream's elements. This is a terminal operation; elements are pulled
   * through the stages lazily, as `hasNext()`/`next()` ask for them. Unlike `for…of`, it does not close the stream.
   * @throws {@link IllegalStateException} if the stream was already operated upon or closed
   */
  iterator(): Iterator<T>;
  /**
   * Returns a {@link Spliterator} over the stream's elements; a terminal operation that pulls elements lazily.
   * It reports the pipeline's characteristics (ORDERED, DISTINCT, SORTED, SIZED / SUBSIZED as the stages keep
   * them); with no stages it is the source spliterator itself.
   * @throws {@link IllegalStateException} if the stream was already operated upon or closed
   */
  spliterator(): Spliterator<T>;
  /** Returns `true` if `parallel()` was requested. It only reports the flag; evaluation is always sequential. */
  isParallel(): boolean;
  /** Clears the parallel flag and returns this same stream. Allowed on a stream that was already used. */
  sequential(): S;
  /**
   * Sets the parallel flag and returns this same stream. Evaluation stays sequential on the single JS thread;
   * code written for parallel streams (associative reducers, combiners, `findAny`) gives the same results.
   */
  parallel(): S;
  /**
   * Returns an equivalent stream without the encounter-order constraint (an intermediate operation), or this stream
   * itself when it is already unordered. Evaluation is sequential, so elements still arrive in source order.
   * @throws {@link IllegalStateException} if the stream was already operated upon or closed
   */
  unordered(): S;
  /**
   * Registers a handler run by `close()` and returns this same stream; handlers run in registration order.
   * @throws {@link IllegalStateException} if the stream was already operated upon or closed
   * @throws {@link NullPointerException} if `closeHandler` is null
   */
  onClose(closeHandler: () => void): S;
  /**
   * Closes the stream and runs its close handlers once, in registration order. If handlers throw, the rest still
   * run and the first error is rethrown with later ones attached via `suppressed`. A terminal operation does not
   * close the stream; closing a closed stream does nothing.
   */
  close(): void;
  /** Calls `close()`, so `using s = ...` closes the stream at the end of the block. Present where the runtime has `Symbol.dispose`. */
  [Symbol.dispose](): void;
}

/** Iterator of an {@link IntStream}: adds `nextInt()`. */
export interface PrimitiveIteratorOfInt extends Iterator<number> {
  /**
   * Returns the next element; the same as `next()`.
   * @throws {@link NoSuchElementException} if no elements remain
   */
  nextInt(): number;
}
/** Iterator of a {@link LongStream}: adds `nextLong()`. */
export interface PrimitiveIteratorOfLong extends Iterator<number> {
  /**
   * Returns the next element; the same as `next()`.
   * @throws {@link NoSuchElementException} if no elements remain
   */
  nextLong(): number;
}
/** Iterator of a {@link DoubleStream}: adds `nextDouble()`. */
export interface PrimitiveIteratorOfDouble extends Iterator<number> {
  /**
   * Returns the next element; the same as `next()`.
   * @throws {@link NoSuchElementException} if no elements remain
   */
  nextDouble(): number;
}

/** Builds a {@link Stream} by adding elements one at a time, then calling `build()` once. Returned by `Stream.builder()`. */
export interface StreamBuilder<T> {
  /**
   * Adds an element (`null` allowed).
   * @throws {@link IllegalStateException} after `build()`
   */
  accept(t: T): void;
  /**
   * Adds an element and returns this builder, for chaining.
   * @throws {@link IllegalStateException} after `build()`
   */
  add(t: T): StreamBuilder<T>;
  /**
   * Returns an ordered, sized stream of the added elements in insertion order. The builder can then no longer be used.
   * @throws {@link IllegalStateException} if already built
   */
  build(): Stream<T>;
}

/** Builds a number stream (`S` is {@link IntStream}, {@link LongStream} or {@link DoubleStream}). Returned by `IntStream.builder()` and the like. */
export interface NumberStreamBuilder<S> {
  /**
   * Adds a number.
   * @throws {@link IllegalStateException} after `build()`
   */
  accept(t: number): void;
  /**
   * Adds a number and returns this builder, for chaining.
   * @throws {@link IllegalStateException} after `build()`
   */
  add(t: number): NumberStreamBuilder<S>;
  /**
   * Returns an ordered, sized stream of the added numbers in insertion order. The builder can then no longer be used.
   * @throws {@link IllegalStateException} if already built
   */
  build(): S;
}

/**
 * A lazy sequence of elements supporting aggregate operations.
 *
 * Intermediate operations (`filter`, `map`, `sorted`, …) return a new stream and run nothing; one terminal
 * operation (`toList`, `reduce`, `collect`, `count`, …) then runs the pipeline, passing each element through every
 * stage before reading the next. Short-circuiting operations (`limit`, `takeWhile`, `findFirst`, `anyMatch`, …)
 * stop reading early, so they work on infinite streams. Ordered sources keep their encounter order through the
 * stages. Elements may be `null`. Each stream object is single use (see {@link BaseStream}); a required function
 * argument that is `null` throws {@link NullPointerException}, and exceptions thrown by callbacks propagate
 * unchanged out of the terminal operation.
 */
export interface Stream<T> extends BaseStream<T, Stream<T>> {
  // intermediate
  /** Returns a stream of the elements that match `predicate`. Intermediate, stateless. */
  filter(predicate: (t: T) => boolean): Stream<T>;
  /** Returns a stream of `mapper` applied to each element. Intermediate, stateless; a `null` result flows through like any element. */
  map<R>(mapper: (t: T) => R): Stream<R>;
  /** Returns an {@link IntStream} of `mapper` applied to each element. Intermediate, stateless. */
  mapToInt(mapper: (t: T) => number): IntStream;
  /** Returns a {@link LongStream} of `mapper` applied to each element. Intermediate, stateless. */
  mapToLong(mapper: (t: T) => number): LongStream;
  /** Returns a {@link DoubleStream} of `mapper` applied to each element. Intermediate, stateless. */
  mapToDouble(mapper: (t: T) => number): DoubleStream;
  /**
   * Returns a stream that replaces each element with the elements of the stream `mapper` returns. Intermediate.
   * A `null`/`undefined` result counts as an empty stream; each mapped stream is closed after its elements have
   * been pushed downstream, even when a short-circuit stops the pipeline early.
   */
  flatMap<R>(mapper: (t: T) => Stream<R> | null | undefined): Stream<R>;
  /** Like `flatMap`, with a mapper that returns an {@link IntStream}; `null`/`undefined` counts as empty, each mapped stream is closed. */
  flatMapToInt(mapper: (t: T) => IntStream | null | undefined): IntStream;
  /** Like `flatMap`, with a mapper that returns a {@link LongStream}; `null`/`undefined` counts as empty, each mapped stream is closed. */
  flatMapToLong(mapper: (t: T) => LongStream | null | undefined): LongStream;
  /** Like `flatMap`, with a mapper that returns a {@link DoubleStream}; `null`/`undefined` counts as empty, each mapped stream is closed. */
  flatMapToDouble(mapper: (t: T) => DoubleStream | null | undefined): DoubleStream;
  /**
   * Returns a stream of the values `mapper` passes to `consumer`, zero or more per element. Intermediate, stateless.
   * A push-style `flatMap` that creates no inner streams.
   */
  mapMulti<R>(mapper: (t: T, consumer: (r: R) => void) => void): Stream<R>;
  /** Like `mapMulti`, producing an {@link IntStream}. */
  mapMultiToInt(mapper: (t: T, consumer: (n: number) => void) => void): IntStream;
  /** Like `mapMulti`, producing a {@link LongStream}. */
  mapMultiToLong(mapper: (t: T, consumer: (n: number) => void) => void): LongStream;
  /** Like `mapMulti`, producing a {@link DoubleStream}. */
  mapMultiToDouble(mapper: (t: T, consumer: (n: number) => void) => void): DoubleStream;
  /**
   * Returns a stream without duplicates, by `equals()`/`hashCode()` like a `HashSet` (primitives by value, plain
   * objects by identity); the first occurrence is kept. Intermediate and stateful (it remembers every element seen)
   * but not a barrier: each element is emitted the first time it is seen.
   */
  distinct(): Stream<T>;
  /**
   * Returns a stream sorted in natural order (numbers numerically, strings by code unit, objects through
   * `compareTo`); stable for ordered streams. Intermediate and a stateful barrier: it buffers every element before
   * emitting any, so it never finishes on an infinite stream. A no-op on a source already in natural order.
   * @throws {@link ClassCastException} (from the terminal operation) for elements that cannot be compared
   */
  sorted(): Stream<T>;
  /**
   * Returns a stream sorted by `comparator`; stable for ordered streams. Intermediate and a stateful barrier.
   * @throws {@link NullPointerException} if comparator is null or undefined
   */
  sorted(comparator: Comparator<T>): Stream<T>;
  /**
   * Returns a stream that runs `action` on each element as it passes. Intermediate, stateless; meant for debugging.
   * Elements that are never pulled (after a short-circuit, or when `count()` skips traversal) are not seen.
   */
  peek(action: (t: T) => void): Stream<T>;
  /**
   * Returns a stream of at most the first `maxSize` elements. Intermediate, stateful and short-circuiting.
   * @throws {@link IllegalArgumentException} if maxSize is negative or not an integer
   */
  limit(maxSize: number): Stream<T>;
  /**
   * Returns a stream without the first `n` elements (this same stream when `n` is 0). Intermediate, stateful.
   * @throws {@link IllegalArgumentException} if n is negative or not an integer
   */
  skip(n: number): Stream<T>;
  /** Returns the longest prefix of elements matching `predicate`. Intermediate, stateful and short-circuiting: it stops at the first failure. */
  takeWhile(predicate: (t: T) => boolean): Stream<T>;
  /** Returns the elements after the longest prefix matching `predicate`. Intermediate, stateful. */
  dropWhile(predicate: (t: T) => boolean): Stream<T>;
  /**
   * Returns a stream transformed by `gatherer`, a custom intermediate operation (see {@link Gatherers}). It
   * short-circuits when the gatherer's integrator returns `false`; the gatherer's finisher runs at the end.
   */
  gather<R>(gatherer: Gatherer<T, any, R>): Stream<R>;

  // terminal
  /** Runs `action` for each element. Terminal; evaluation is sequential, so elements arrive in encounter order. */
  forEach(action: (t: T) => void): void;
  /** Runs `action` for each element in encounter order. Terminal; here the same as `forEach`. */
  forEachOrdered(action: (t: T) => void): void;
  /** Returns a new JS array of the elements in encounter order. Terminal. */
  toArray(): T[];
  /**
   * Returns the elements in an array-like that `generator` creates (a typed array, for example). Terminal.
   * When the stream size is known exactly, `generator(size)` is called before the traversal and must return an
   * array of exactly that length. Otherwise it is called with the element count afterwards, and slots past the
   * elements are set to `null`. Element type checks of the reference are not emulated.
   * @throws {@link IllegalStateException} if a sized stream's generator returns an array of another length
   * @throws {@link IndexOutOfBoundsException} if an unsized stream's generator returns a shorter array
   */
  toArray<A extends WritableArrayLike<T>>(generator: (length: number) => A): A;
  /**
   * Folds the elements, starting from `identity`, with an associative `accumulator`. Terminal.
   * @returns the result, or `identity` for an empty stream
   */
  reduce(identity: T, accumulator: (a: T, b: T) => T): T;
  /**
   * Folds the elements with an associative `accumulator`, without an initial value. Terminal.
   * @returns the result, or an empty {@link Optional} for an empty stream
   * @throws {@link NullPointerException} if the result is null
   */
  reduce(accumulator: (a: T, b: T) => T): Optional<T>;
  /**
   * Folds the elements into a value of another type `U`, starting from `identity`. Terminal. `combiner` merges two
   * partial results; evaluation is sequential so it is never called, but it must be correct.
   * @returns the result, or `identity` for an empty stream
   */
  reduce<U>(identity: U, accumulator: (u: U, t: T) => U, combiner: (a: U, b: U) => U): U;
  /** Performs a mutable reduction with `collector` (see {@link Collectors}) and returns its result. Terminal. */
  collect<R, A>(collector: Collector<T, A, R>): R;
  /**
   * Performs a mutable reduction: `supplier` creates the container, `accumulator` adds each element to it. Terminal.
   * `combiner` merges the second container into the first; evaluation is sequential so it is never called.
   * @returns the container
   */
  collect<R>(supplier: () => R, accumulator: (r: R, t: T) => void, combiner: (a: R, b: R) => void): R;
  /**
   * Returns an unmodifiable {@link List} of the elements in encounter order. Terminal. Unlike `List.of` and
   * `Collectors.toUnmodifiableList()` it allows null elements; mutators throw {@link UnsupportedOperationException}.
   */
  toList(): List<T>;
  /**
   * Returns the smallest element by `comparator` (the first of equal ones), or an empty {@link Optional}. Terminal.
   * @throws {@link NullPointerException} if the element selected is null
   */
  min(comparator: Comparator<T>): Optional<T>;
  /**
   * Returns the largest element by `comparator` (the first of equal ones), or an empty {@link Optional}. Terminal.
   * @throws {@link NullPointerException} if the element selected is null
   */
  max(comparator: Comparator<T>): Optional<T>;
  /**
   * Returns the number of elements. Terminal. When the pipeline's size is known exactly (a sized source and no
   * filtering stage) the result is computed without traversal, so `peek` and `map` callbacks do not run.
   */
  count(): number;
  /** Returns whether any element matches `predicate`; `false` for an empty stream. Terminal, short-circuiting. */
  anyMatch(predicate: (t: T) => boolean): boolean;
  /** Returns whether all elements match `predicate`; `true` for an empty stream. Terminal, short-circuiting. */
  allMatch(predicate: (t: T) => boolean): boolean;
  /** Returns whether no element matches `predicate`; `true` for an empty stream. Terminal, short-circuiting. */
  noneMatch(predicate: (t: T) => boolean): boolean;
  /**
   * Returns the first element, or an empty {@link Optional} for an empty stream. Terminal, short-circuiting.
   * @throws {@link NullPointerException} if the element selected is null
   */
  findFirst(): Optional<T>;
  /**
   * Returns some element, or an empty {@link Optional}. Terminal, short-circuiting. Evaluation is sequential, so
   * it is always the first element, as `findFirst()` returns.
   * @throws {@link NullPointerException} if the element selected is null
   */
  findAny(): Optional<T>;
}

/** Shared shape of the three number streams; N is the stream type itself. */
interface NumberStream<N extends NumberStream<N, O>, O> extends BaseStream<number, N> {
  /** Returns a stream of the numbers that match `predicate`. Intermediate, stateless. */
  filter(predicate: (n: number) => boolean): N;
  /** Returns a stream of `mapper` applied to each number. Intermediate, stateless. */
  map(mapper: (n: number) => number): N;
  /** Returns a {@link Stream} of `mapper` applied to each number. Intermediate, stateless. */
  mapToObj<U>(mapper: (n: number) => U): Stream<U>;
  /**
   * Returns a stream that replaces each number with the numbers of the stream `mapper` returns. Intermediate.
   * A `null`/`undefined` result counts as empty; each mapped stream is closed after use.
   */
  flatMap(mapper: (n: number) => N | null | undefined): N;
  /** Returns a stream of the numbers `mapper` passes to `consumer`, zero or more per element. Intermediate, stateless. */
  mapMulti(mapper: (n: number, consumer: (r: number) => void) => void): N;
  /**
   * Returns a stream without duplicate numbers, keeping the first occurrence. Intermediate, stateful. `NaN` equals
   * `NaN`; in a {@link DoubleStream} `-0` and `0` are different values.
   */
  distinct(): N;
  /**
   * Returns a stream sorted in ascending numeric order (`-0` before `0`). Intermediate and a stateful barrier.
   * There is no comparator form: use `boxed().sorted(cmp)`; passing one from JS throws {@link IllegalArgumentException}.
   */
  sorted(): N;
  /** Returns a stream that runs `action` on each number as it passes. Intermediate, stateless; meant for debugging. */
  peek(action: (n: number) => void): N;
  /**
   * Returns a stream of at most the first `maxSize` numbers. Intermediate, stateful and short-circuiting.
   * @throws {@link IllegalArgumentException} if maxSize is negative or not an integer
   */
  limit(maxSize: number): N;
  /**
   * Returns a stream without the first `n` numbers (this same stream when `n` is 0). Intermediate, stateful.
   * @throws {@link IllegalArgumentException} if n is negative or not an integer
   */
  skip(n: number): N;
  /** Returns the longest prefix of numbers matching `predicate`. Intermediate, short-circuiting. */
  takeWhile(predicate: (n: number) => boolean): N;
  /** Returns the numbers after the longest prefix matching `predicate`. Intermediate, stateful. */
  dropWhile(predicate: (n: number) => boolean): N;
  /** Runs `action` for each number in encounter order. Terminal. */
  forEach(action: (n: number) => void): void;
  /** Runs `action` for each number in encounter order. Terminal; here the same as `forEach`. */
  forEachOrdered(action: (n: number) => void): void;
  /** Returns a new JS array of the numbers in encounter order. Terminal. */
  toArray(): number[];
  /**
   * Folds the numbers, starting from `identity`, with an associative `op`. Terminal.
   * @returns the result, or `identity` for an empty stream
   */
  reduce(identity: number, op: (a: number, b: number) => number): number;
  /**
   * Folds the numbers with an associative `op`, without an initial value. Terminal.
   * @returns the result, or an empty number optional for an empty stream
   */
  reduce(op: (a: number, b: number) => number): O;
  /**
   * Performs a mutable reduction into the container `supplier` creates and returns it. Terminal. Only this
   * three-argument form exists (call `boxed()` first to use a {@link Collector}); a one-argument call throws
   * {@link IllegalArgumentException}.
   */
  collect<R>(supplier: () => R, accumulator: (r: R, n: number) => void, combiner: (a: R, b: R) => void): R;
  /** Returns the sum of the numbers, `0` for an empty stream. Terminal. */
  sum(): number;
  /** Returns the smallest number (as `Math.min`: `NaN` wins), or an empty optional. Terminal. */
  min(): O;
  /** Returns the largest number (as `Math.max`: `NaN` wins), or an empty optional. Terminal. */
  max(): O;
  /** Returns the number of elements; computed without traversal when the size is known exactly. Terminal. */
  count(): number;
  /** Returns the arithmetic mean, or an empty {@link OptionalDouble} for an empty stream. Terminal. */
  average(): OptionalDouble;
  /** Returns whether any number matches `predicate`; `false` when empty. Terminal, short-circuiting. */
  anyMatch(predicate: (n: number) => boolean): boolean;
  /** Returns whether all numbers match `predicate`; `true` when empty. Terminal, short-circuiting. */
  allMatch(predicate: (n: number) => boolean): boolean;
  /** Returns whether no number matches `predicate`; `true` when empty. Terminal, short-circuiting. */
  noneMatch(predicate: (n: number) => boolean): boolean;
  /** Returns the first number, or an empty optional. Terminal, short-circuiting. */
  findFirst(): O;
  /** Returns some number, or an empty optional; always the first here (sequential evaluation). Terminal, short-circuiting. */
  findAny(): O;
  /** Returns a {@link Stream} of the same numbers, to use object-stream operations such as `collect(collector)`. Intermediate. */
  boxed(): Stream<number>;
}

/**
 * A stream of integers. Elements are JS numbers expected to be 32-bit integers; values are not coerced and
 * `sum()` does not wrap on overflow (a difference from the reference). Created by `IntStream.range`, `IntStream.of`,
 * `stream.mapToInt` and the like.
 */
export interface IntStream extends NumberStream<IntStream, OptionalInt> {
  /** Returns a {@link PrimitiveIteratorOfInt} over the elements; a terminal operation that does not close the stream. */
  iterator(): PrimitiveIteratorOfInt;
  /** Returns a {@link LongStream} of `mapper` applied to each element. Intermediate. */
  mapToLong(mapper: (n: number) => number): LongStream;
  /** Returns a {@link DoubleStream} of `mapper` applied to each element. Intermediate. */
  mapToDouble(mapper: (n: number) => number): DoubleStream;
  /** Returns the same values as a {@link LongStream}. Intermediate. */
  asLongStream(): LongStream;
  /** Returns the same values as a {@link DoubleStream}. Intermediate. */
  asDoubleStream(): DoubleStream;
  /** Returns the count, sum, min, max and average in one pass. Terminal. */
  summaryStatistics(): IntSummaryStatistics;
}

/**
 * A stream of long integers. Elements are JS numbers (not `bigint`), exact up to `Number.MAX_SAFE_INTEGER`.
 * Created by `LongStream.range`, `LongStream.of`, `stream.mapToLong` and the like.
 */
export interface LongStream extends NumberStream<LongStream, OptionalLong> {
  /** Returns a {@link PrimitiveIteratorOfLong} over the elements; a terminal operation that does not close the stream. */
  iterator(): PrimitiveIteratorOfLong;
  /** Returns an {@link IntStream} of `mapper` applied to each element. Intermediate. */
  mapToInt(mapper: (n: number) => number): IntStream;
  /** Returns a {@link DoubleStream} of `mapper` applied to each element. Intermediate. */
  mapToDouble(mapper: (n: number) => number): DoubleStream;
  /** Returns the same values as a {@link DoubleStream} (no longer reported DISTINCT). Intermediate. */
  asDoubleStream(): DoubleStream;
  /** Returns the count, sum, min, max and average in one pass. Terminal. */
  summaryStatistics(): LongSummaryStatistics;
}

/**
 * A stream of floating-point numbers. `sum()`, `average()` and `summaryStatistics()` use compensated (Kahan)
 * summation like the reference. Created by `DoubleStream.of`, `stream.mapToDouble` and the like.
 */
export interface DoubleStream extends NumberStream<DoubleStream, OptionalDouble> {
  /** Returns a {@link PrimitiveIteratorOfDouble} over the elements; a terminal operation that does not close the stream. */
  iterator(): PrimitiveIteratorOfDouble;
  /** Returns an {@link IntStream} of `mapper` applied to each element. Intermediate. */
  mapToInt(mapper: (n: number) => number): IntStream;
  /** Returns a {@link LongStream} of `mapper` applied to each element. Intermediate. */
  mapToLong(mapper: (n: number) => number): LongStream;
  /** Returns the count, sum, min, max and average in one pass (compensated sums). Terminal. */
  summaryStatistics(): DoubleSummaryStatistics;
}
