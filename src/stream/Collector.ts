// Type contract for collectors; Collector.of and the Characteristics constants live with Collectors.
import type { Set } from '../interfaces/Set';

export type CollectorCharacteristics = 'CONCURRENT' | 'UNORDERED' | 'IDENTITY_FINISH';

/**
 * Mutable reduction: a supplier creates a container, the accumulator folds elements in,
 * the combiner merges two containers (parallel-capable), the finisher produces the result.
 * IDENTITY_FINISH means the finisher is the identity and may be skipped.
 */
export interface Collector<T, A, R> {
  supplier(): () => A;
  accumulator(): (container: A, t: T) => void;
  combiner(): (a: A, b: A) => A;
  finisher(): (container: A) => R;
  characteristics(): Set<CollectorCharacteristics>;
}
