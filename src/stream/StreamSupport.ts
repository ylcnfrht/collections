// Low-level stream construction from spliterators. Loading this module plugs the engine into
// Collection.stream(), Optional.stream() and friends (see hook.ts).
import { requireNonNull } from '../util/Objects';
import { registerStreamFactories } from './hook';
import { DoublePipeline, IntPipeline, LongPipeline, makeStream, RefPipeline } from './pipeline/Pipeline';
import type { Spliterator } from './Spliterator';
import type { DoubleStream, IntStream, LongStream, Stream } from './Stream';

type Ctor = typeof RefPipeline | typeof IntPipeline | typeof LongPipeline | typeof DoublePipeline;

// (spliterator, parallel) or (supplier, characteristics, parallel). The supplier is called once, when the
// terminal operation starts or on first use of spliterator() / iterator(); characteristics are the stream's flags.
function make(ctor: Ctor, src: unknown, a: unknown, b: unknown): any {
  requireNonNull(src);
  return typeof src === 'function'
    ? makeStream(ctor as any, null, src as () => Spliterator<any>, b === true, a as number)
    : makeStream(ctor as any, src as Spliterator<any>, null, a === true);
}

/** Returns a {@link Stream} over `spliterator`; `parallel` only sets `isParallel()`. */
function stream<T>(spliterator: Spliterator<T>, parallel: boolean): Stream<T>;
/** Returns a {@link Stream} whose spliterator `supplier` creates late, when the terminal operation starts; `characteristics` must match what it reports. */
function stream<T>(supplier: () => Spliterator<T>, characteristics: number, parallel: boolean): Stream<T>;
function stream(src: unknown, a: unknown, b?: unknown): any {
  return make(RefPipeline, src, a, b);
}
/** Returns an {@link IntStream} over `spliterator`; `parallel` only sets `isParallel()`. */
function intStream(spliterator: Spliterator<number>, parallel: boolean): IntStream;
/** Returns an {@link IntStream} whose spliterator `supplier` creates late; `characteristics` must match what it reports. */
function intStream(supplier: () => Spliterator<number>, characteristics: number, parallel: boolean): IntStream;
function intStream(src: unknown, a: unknown, b?: unknown): any {
  return make(IntPipeline, src, a, b);
}
/** Returns a {@link LongStream} over `spliterator`; `parallel` only sets `isParallel()`. */
function longStream(spliterator: Spliterator<number>, parallel: boolean): LongStream;
/** Returns a {@link LongStream} whose spliterator `supplier` creates late; `characteristics` must match what it reports. */
function longStream(supplier: () => Spliterator<number>, characteristics: number, parallel: boolean): LongStream;
function longStream(src: unknown, a: unknown, b?: unknown): any {
  return make(LongPipeline, src, a, b);
}
/** Returns a {@link DoubleStream} over `spliterator`; `parallel` only sets `isParallel()`. */
function doubleStream(spliterator: Spliterator<number>, parallel: boolean): DoubleStream;
/** Returns a {@link DoubleStream} whose spliterator `supplier` creates late; `characteristics` must match what it reports. */
function doubleStream(supplier: () => Spliterator<number>, characteristics: number, parallel: boolean): DoubleStream;
function doubleStream(src: unknown, a: unknown, b?: unknown): any {
  return make(DoublePipeline, src, a, b);
}

/**
 * Low-level stream construction from a {@link Spliterator}, for custom sources: `stream`, `intStream`, `longStream`
 * and `doubleStream`. Each has two forms:
 * `(spliterator, parallel)`, and `(supplier, characteristics, parallel)`, which calls `supplier` once, when the
 * terminal operation starts or `spliterator()`/`iterator()` is first used, so the source binds late. `parallel` only
 * sets the flag `isParallel()` reports; evaluation is sequential.
 * @throws {@link NullPointerException} if the spliterator or supplier is null
 */
export const StreamSupport = {
  /** Creates a `Stream` over a spliterator, or over a spliterator supplier bound late (see {@link StreamSupport}). */
  stream,
  /** Creates an `IntStream` over an int spliterator, or over a supplier of one bound late. */
  intStream,
  /** Creates a `LongStream` over a long spliterator, or over a supplier of one bound late. */
  longStream,
  /** Creates a `DoubleStream` over a double spliterator, or over a supplier of one bound late. */
  doubleStream,
};

registerStreamFactories(StreamSupport);
