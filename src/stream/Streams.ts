// Stream / IntStream / LongStream / DoubleStream: the contract types merged with their static factories.
// JS extras (not in the reference API): Stream.from(iterable) and X.ofArray(array). ofArray does not copy:
// its length is fixed when the stream is created, element values are read when the terminal operation runs.
import { IllegalStateException } from '../exceptions';
import { requireNonNull } from '../util/Objects';
import { DoublePipeline, IntPipeline, LongPipeline, makeStream, RefPipeline, runAll } from './pipeline/Pipeline';
import {
  ARRAY_FLAGS,
  EngineArraySpliterator,
  ConcatSpliterator,
  GenerateSpliterator,
  Iterate3Spliterator,
  IterateSpliterator,
  IterableSpliterator,
  ITERATE_FLAGS,
  NUMBER_ITERATE_FLAGS,
  RangeSpliterator,
} from './pipeline/spliterators';
import { Spliterator } from './Spliterator';
import type {
  DoubleStream as DoubleStreamType,
  IntStream as IntStreamType,
  LongStream as LongStreamType,
  NumberStreamBuilder,
  Stream as StreamType,
  StreamBuilder,
} from './Stream';
import './StreamSupport';

// interfaces, not type aliases, so documentation tools list their members
/**
 * A lazy, single-use sequence of elements supporting aggregate operations: intermediate operations build the
 * pipeline, one terminal operation runs it. The `Stream` value holds the factories (`Stream.of`, `Stream.from`, …).
 */
export interface Stream<T> extends StreamType<T> {}
/** A stream of integers (JS numbers). The `IntStream` value holds the factories (`IntStream.range`, `IntStream.of`, …). */
export interface IntStream extends IntStreamType {}
/** A stream of long integers (JS numbers, exact up to `Number.MAX_SAFE_INTEGER`). The `LongStream` value holds the factories. */
export interface LongStream extends LongStreamType {}
/** A stream of floating-point numbers with compensated sums. The `DoubleStream` value holds the factories. */
export interface DoubleStream extends DoubleStreamType {}

type Ctor = typeof RefPipeline | typeof IntPipeline | typeof LongPipeline | typeof DoublePipeline;
type Closeable = { isParallel(): boolean; spliterator(): Spliterator<any>; close(): void };

const NONE: readonly never[] = [];
/** empty() and empty ranges report only SIZED | SUBSIZED; of() with no values keeps the array flags. */
const EMPTY_FLAGS = Spliterator.SIZED | Spliterator.SUBSIZED;

function from(ctor: Ctor, sp: Spliterator<any>): any {
  return makeStream(ctor as any, sp, null, false);
}

function ofArray(ctor: Ctor, a: ArrayLike<any>): any {
  return from(ctor, new EngineArraySpliterator(requireNonNull(a), 0, a.length, ARRAY_FLAGS));
}

function empty(ctor: Ctor): any {
  return from(ctor, new EngineArraySpliterator(NONE, 0, 0, EMPTY_FLAGS));
}

function iterate(ctor: Ctor, seed: any, a: any, b: any, n: number): any {
  requireNonNull(a);
  const flags = ctor === RefPipeline ? ITERATE_FLAGS : NUMBER_ITERATE_FLAGS;
  if (n < 3) return from(ctor, new IterateSpliterator(seed, a, flags));
  return from(ctor, new Iterate3Spliterator(seed, a, requireNonNull(b), flags));
}

function generate(ctor: Ctor, s: () => any): any {
  return from(ctor, new GenerateSpliterator(requireNonNull(s)));
}

/** Lazy: both inputs are consumed now but traversed only by the terminal operation; closing it closes both. */
function concat(ctor: Ctor, a: Closeable, b: Closeable): any {
  requireNonNull(a);
  requireNonNull(b);
  const s = makeStream(ctor as any, new ConcatSpliterator(a.spliterator(), b.spliterator()), null, a.isParallel() || b.isParallel());
  return s.onClose(() => runAll([() => a.close(), () => b.close()]));
}

class Builder<T, S> {
  private buf: T[] | null = [];
  constructor(private readonly ctor: Ctor) {}
  /** @throws IllegalStateException after build() */
  accept(t: T): void {
    if (this.buf === null) throw new IllegalStateException();
    this.buf.push(t);
  }
  add(t: T): this {
    this.accept(t);
    return this;
  }
  /** @throws IllegalStateException if already built */
  build(): S {
    const b = this.buf;
    if (b === null) throw new IllegalStateException();
    this.buf = null;
    // as the reference: 0-1 elements stream like of(..); more come from a buffer that is not IMMUTABLE
    return b.length < 2 ? ofArray(this.ctor, b) : from(this.ctor, new EngineArraySpliterator(b, 0, b.length, ARRAY_FLAGS & ~Spliterator.IMMUTABLE));
  }
}

function range(ctor: Ctor, start: number, end: number): any {
  return start < end ? from(ctor, new RangeSpliterator(start, end)) : empty(ctor);
}

function iterateOf(ctor: Ctor) {
  function it<T>(seed: T, f: (t: T) => T): any;
  function it<T>(seed: T, hasNext: (t: T) => boolean, next: (t: T) => T): any;
  function it(seed: unknown, a: any, b?: any): any {
    return iterate(ctor, seed, a, b, arguments.length);
  }
  return it;
}

function numberStatics<S>(ctor: Ctor) {
  return {
    /** Returns an ordered, sized stream of the given numbers. */
    of: (...values: number[]): S => ofArray(ctor, values),
    /**
     * Returns an ordered, sized stream over the array itself, without copying (an addition to the reference API).
     * The range is fixed at creation; values are read when the terminal operation runs.
     * @throws {@link NullPointerException} if array is null
     */
    ofArray: (array: ArrayLike<number>): S => ofArray(ctor, array),
    /** Returns an empty stream. */
    empty: (): S => empty(ctor),
    /**
     * `iterate(seed, f)`: returns the infinite ordered stream `seed, f(seed), f(f(seed)), …`.
     * `iterate(seed, hasNext, next)`: returns the ordered stream a `for (n = seed; hasNext(n); n = next(n))` loop
     * would visit.
     * @throws {@link NullPointerException} if a function argument is null
     */
    iterate: iterateOf(ctor) as {
      (seed: number, f: (n: number) => number): S;
      (seed: number, hasNext: (n: number) => boolean, next: (n: number) => number): S;
    },
    /**
     * Returns an infinite, unordered stream of the values `s()` returns, called once per element pulled.
     * @throws {@link NullPointerException} if s is null
     */
    generate: (s: () => number): S => generate(ctor, s),
    /**
     * Returns a lazy stream of all elements of `a` followed by all of `b`. Both inputs count as used; the result
     * is parallel if either input is, and closing it closes both.
     * @throws {@link NullPointerException} if a or b is null
     */
    concat: (a: S, b: S): S => concat(ctor, a as unknown as Closeable, b as unknown as Closeable),
    /** Returns a builder that collects numbers one at a time and then builds a stream of them. */
    builder: (): NumberStreamBuilder<S> => new Builder<number, S>(ctor),
  };
}

function rangeStatics<S>(ctor: Ctor) {
  return {
    /** Returns the ordered stream `start, start + 1, …, end - 1`: `start` inclusive, `end` exclusive; empty when start >= end. */
    range: (start: number, end: number): S => range(ctor, start, end),
    /** Returns the ordered stream `start, start + 1, …, end`: both bounds inclusive; empty when start > end. */
    rangeClosed: (start: number, end: number): S => range(ctor, start, end + 1),
  };
}

/** Factories for {@link Stream}. */
export const Stream = {
  /** Returns an ordered, sized stream of the given values (`null` allowed). */
  of<T>(...values: T[]): Stream<T> {
    return ofArray(RefPipeline, values);
  },
  /** Returns a stream of `t`, or an empty stream when `t` is `null` or `undefined`. */
  ofNullable<T>(t: T | null | undefined): Stream<T> {
    return t === null || t === undefined ? empty(RefPipeline) : ofArray(RefPipeline, [t]);
  },
  /** Returns an empty stream. */
  empty<T>(): Stream<T> {
    return empty(RefPipeline);
  },
  /**
   * `iterate(seed, f)`: returns the infinite ordered stream `seed, f(seed), f(f(seed)), …`; limit it with
   * `limit` or `takeWhile`. `iterate(seed, hasNext, next)`: returns the ordered stream a
   * `for (t = seed; hasNext(t); t = next(t))` loop would visit.
   * @throws {@link NullPointerException} if a function argument is null
   */
  iterate: iterateOf(RefPipeline) as {
    <T>(seed: T, f: (t: T) => T): Stream<T>;
    <T>(seed: T, hasNext: (t: T) => boolean, next: (t: T) => T): Stream<T>;
  },
  /**
   * Returns an infinite, unordered stream of the values `s()` returns, called once per element pulled.
   * @throws {@link NullPointerException} if s is null
   */
  generate<T>(s: () => T): Stream<T> {
    return generate(RefPipeline, s);
  },
  /**
   * Returns a lazy stream of all elements of `a` followed by all of `b`. Both inputs count as used; the result is
   * parallel if either input is, and closing it closes both. Nesting `concat` thousands of times deep is quadratic
   * and can overflow the call stack: use `flatMap` to join many streams.
   * @throws {@link NullPointerException} if a or b is null
   */
  concat<T>(a: Stream<T>, b: Stream<T>): Stream<T> {
    return concat(RefPipeline, a, b);
  },
  /** Returns a {@link StreamBuilder} that collects elements one at a time and then builds a stream of them. */
  builder<T>(): StreamBuilder<T> {
    return new Builder<T, Stream<T>>(RefPipeline);
  },
  /**
   * Returns a stream over any JS iterable (an addition to the reference API). Arrays are read like `ofArray` and
   * this library's collections through their own spliterators; any other iterable is read through its JS iterator
   * (ordered, unknown size), which is closed (its `finally` runs) when the stream stops early or is closed.
   * @throws {@link NullPointerException} if iterable is null
   */
  from<T>(iterable: Iterable<T>): Stream<T> {
    requireNonNull(iterable);
    if (Array.isArray(iterable)) return ofArray(RefPipeline, iterable);
    const c = iterable as { spliterator?: () => Spliterator<T> };
    if (typeof c.spliterator === 'function') return from(RefPipeline, c.spliterator());
    const sp = new IterableSpliterator(iterable);
    return from(RefPipeline, sp).onClose(() => sp.close());
  },
  /**
   * Returns an ordered, sized stream over the array itself, without copying (an addition to the reference API).
   * The range (`0` to the length at creation) is fixed; elements are read when the terminal operation runs.
   * @throws {@link NullPointerException} if array is null
   */
  ofArray<T>(array: ArrayLike<T>): Stream<T> {
    return ofArray(RefPipeline, array);
  },
};

/** Factories for {@link IntStream}: `of`, `ofArray`, `empty`, `iterate`, `generate`, `concat`, `builder`, `range`, `rangeClosed`. */
export const IntStream = { ...numberStatics<IntStream>(IntPipeline), ...rangeStatics<IntStream>(IntPipeline) };
/** Factories for {@link LongStream}: `of`, `ofArray`, `empty`, `iterate`, `generate`, `concat`, `builder`, `range`, `rangeClosed`. */
export const LongStream = { ...numberStatics<LongStream>(LongPipeline), ...rangeStatics<LongStream>(LongPipeline) };
/** Factories for {@link DoubleStream}: `of`, `ofArray`, `empty`, `iterate`, `generate`, `concat`, `builder`. */
export const DoubleStream = numberStatics<DoubleStream>(DoublePipeline);
