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

function stream<T>(spliterator: Spliterator<T>, parallel: boolean): Stream<T>;
function stream<T>(supplier: () => Spliterator<T>, characteristics: number, parallel: boolean): Stream<T>;
function stream(src: unknown, a: unknown, b?: unknown): any {
  return make(RefPipeline, src, a, b);
}
function intStream(spliterator: Spliterator<number>, parallel: boolean): IntStream;
function intStream(supplier: () => Spliterator<number>, characteristics: number, parallel: boolean): IntStream;
function intStream(src: unknown, a: unknown, b?: unknown): any {
  return make(IntPipeline, src, a, b);
}
function longStream(spliterator: Spliterator<number>, parallel: boolean): LongStream;
function longStream(supplier: () => Spliterator<number>, characteristics: number, parallel: boolean): LongStream;
function longStream(src: unknown, a: unknown, b?: unknown): any {
  return make(LongPipeline, src, a, b);
}
function doubleStream(spliterator: Spliterator<number>, parallel: boolean): DoubleStream;
function doubleStream(supplier: () => Spliterator<number>, characteristics: number, parallel: boolean): DoubleStream;
function doubleStream(src: unknown, a: unknown, b?: unknown): any {
  return make(DoublePipeline, src, a, b);
}

export const StreamSupport = { stream, intStream, longStream, doubleStream };

registerStreamFactories(StreamSupport);
