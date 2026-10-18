import type { Spliterator } from './Spliterator';
import type { DoubleStream, IntStream, LongStream, Stream } from './Stream';

/**
 * Late binding between the collections and the stream engine. Collections, Optional and
 * friends call these to make streams without importing the pipeline modules directly,
 * which would create import cycles (the pipeline itself uses collections).
 * The stream module registers the real factories when it loads (src/index.ts imports it).
 */
export interface StreamFactories {
  stream<T>(spliterator: Spliterator<T>, parallel: boolean): Stream<T>;
  intStream(spliterator: Spliterator<number>, parallel: boolean): IntStream;
  longStream(spliterator: Spliterator<number>, parallel: boolean): LongStream;
  doubleStream(spliterator: Spliterator<number>, parallel: boolean): DoubleStream;
}

let factories: StreamFactories | null = null;

export function registerStreamFactories(f: StreamFactories): void {
  factories = f;
}

export function streamFactories(): StreamFactories {
  if (factories === null) throw new Error('stream engine not loaded');
  return factories;
}
