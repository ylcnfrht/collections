// Stream / IntStream / LongStream / DoubleStream: the contract types merged with their static factories.
// JS extras (not in the reference API): Stream.from(iterable) and X.ofArray(array). ofArray does not copy:
// the array is the source, read when the terminal operation runs.
import { IllegalStateException } from '../exceptions';
import { requireNonNull } from '../util/Objects';
import { DoublePipeline, IntPipeline, LongPipeline, makeStream, RefPipeline, runAll } from './pipeline/Pipeline';
import {
  ARRAY_FLAGS,
  ArraySpliterator,
  ConcatSpliterator,
  GenerateSpliterator,
  Iterate3Spliterator,
  IterateSpliterator,
  IterableSpliterator,
  RangeSpliterator,
} from './pipeline/spliterators';
import type { Spliterator } from './Spliterator';
import type {
  DoubleStream as DoubleStreamType,
  IntStream as IntStreamType,
  LongStream as LongStreamType,
  NumberStreamBuilder,
  Stream as StreamType,
  StreamBuilder,
} from './Stream';
import './StreamSupport';

export type Stream<T> = StreamType<T>;
export type IntStream = IntStreamType;
export type LongStream = LongStreamType;
export type DoubleStream = DoubleStreamType;

type Ctor = typeof RefPipeline | typeof IntPipeline | typeof LongPipeline | typeof DoublePipeline;
type Closeable = { isParallel(): boolean; spliterator(): Spliterator<any>; close(): void };

const NONE: readonly never[] = [];

function from(ctor: Ctor, sp: Spliterator<any>): any {
  return makeStream(ctor as any, sp, null, false);
}

function ofArray(ctor: Ctor, a: ArrayLike<any>): any {
  return from(ctor, new ArraySpliterator(requireNonNull(a), 0, a.length, ARRAY_FLAGS));
}

function iterate(ctor: Ctor, seed: any, a: any, b: any, n: number): any {
  requireNonNull(a);
  if (n < 3) return from(ctor, new IterateSpliterator(seed, a));
  return from(ctor, new Iterate3Spliterator(seed, a, requireNonNull(b)));
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
    return ofArray(this.ctor, b);
  }
}

function range(ctor: Ctor, start: number, end: number): any {
  return from(ctor, start < end ? new RangeSpliterator(start, end) : new ArraySpliterator(NONE, 0, 0, ARRAY_FLAGS));
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
    of: (...values: number[]): S => ofArray(ctor, values),
    /** JS extra: a stream over the array itself (no copy). */
    ofArray: (array: ArrayLike<number>): S => ofArray(ctor, array),
    empty: (): S => ofArray(ctor, NONE),
    iterate: iterateOf(ctor) as {
      (seed: number, f: (n: number) => number): S;
      (seed: number, hasNext: (n: number) => boolean, next: (n: number) => number): S;
    },
    generate: (s: () => number): S => generate(ctor, s),
    concat: (a: S, b: S): S => concat(ctor, a as unknown as Closeable, b as unknown as Closeable),
    builder: (): NumberStreamBuilder<S> => new Builder<number, S>(ctor),
  };
}

function rangeStatics<S>(ctor: Ctor) {
  return {
    /** start (inclusive) to end (exclusive); empty when start >= end. */
    range: (start: number, end: number): S => range(ctor, start, end),
    /** start to end, both inclusive; empty when start > end. */
    rangeClosed: (start: number, end: number): S => range(ctor, start, end + 1),
  };
}

export const Stream = {
  of<T>(...values: T[]): Stream<T> {
    return ofArray(RefPipeline, values);
  },
  ofNullable<T>(t: T | null | undefined): Stream<T> {
    return ofArray(RefPipeline, t === null || t === undefined ? NONE : [t]);
  },
  empty<T>(): Stream<T> {
    return ofArray(RefPipeline, NONE);
  },
  iterate: iterateOf(RefPipeline) as {
    <T>(seed: T, f: (t: T) => T): Stream<T>;
    <T>(seed: T, hasNext: (t: T) => boolean, next: (t: T) => T): Stream<T>;
  },
  generate<T>(s: () => T): Stream<T> {
    return generate(RefPipeline, s);
  },
  concat<T>(a: Stream<T>, b: Stream<T>): Stream<T> {
    return concat(RefPipeline, a, b);
  },
  builder<T>(): StreamBuilder<T> {
    return new Builder<T, Stream<T>>(RefPipeline);
  },
  /** JS extra: a stream over any iterable (arrays and our collections use their fast spliterators). */
  from<T>(iterable: Iterable<T>): Stream<T> {
    requireNonNull(iterable);
    if (Array.isArray(iterable)) return ofArray(RefPipeline, iterable);
    const c = iterable as { spliterator?: () => Spliterator<T> };
    return from(RefPipeline, typeof c.spliterator === 'function' ? c.spliterator() : new IterableSpliterator(iterable));
  },
  /** JS extra: a stream over the array itself (no copy). */
  ofArray<T>(array: ArrayLike<T>): Stream<T> {
    return ofArray(RefPipeline, array);
  },
};

export const IntStream = { ...numberStatics<IntStream>(IntPipeline), ...rangeStatics<IntStream>(IntPipeline) };
export const LongStream = { ...numberStatics<LongStream>(LongPipeline), ...rangeStatics<LongStream>(LongPipeline) };
export const DoubleStream = numberStatics<DoubleStream>(DoublePipeline);
