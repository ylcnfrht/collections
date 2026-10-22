// Type contract for collectors; Collector.of and the Characteristics constants live with Collectors.
import type { Set } from '../interfaces/Set';

/**
 * Collector characteristic names: `CONCURRENT` (one container may be fed concurrently; no effect here),
 * `UNORDERED` (the result does not depend on encounter order) and `IDENTITY_FINISH` (the finisher is the identity,
 * so the container is the result). Also available as `Collector.Characteristics.*`.
 */
export type CollectorCharacteristics = 'CONCURRENT' | 'UNORDERED' | 'IDENTITY_FINISH';

/**
 * A mutable reduction, passed to `stream.collect(collector)`: a supplier creates a container, the accumulator folds
 * elements in, the combiner merges two containers (parallel-capable), the finisher produces the result.
 * `IDENTITY_FINISH` means the finisher is the identity and is skipped. Evaluation is sequential, so the combiner is
 * never called by streams, but it must still be correct. Ready-made collectors are in {@link Collectors}; build
 * your own with `Collector.of`.
 */
export interface Collector<T, A, R> {
  /** Returns the function that creates a new, empty container. */
  supplier(): () => A;
  /** Returns the function that adds one element to a container. */
  accumulator(): (container: A, t: T) => void;
  /** Returns the function that merges two containers and returns the result (either one, or a new container). */
  combiner(): (a: A, b: A) => A;
  /** Returns the function that turns the final container into the result. */
  finisher(): (container: A) => R;
  /** Returns this collector's characteristics; `stream.collect` skips the finisher when it contains `IDENTITY_FINISH`. */
  characteristics(): Set<CollectorCharacteristics>;
}
