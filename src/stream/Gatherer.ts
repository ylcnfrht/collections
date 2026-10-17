// Type contract for gatherers (custom intermediate operations). Gatherer.of/ofSequential,
// Integrator.of/ofGreedy and the default* sentinels live with Gatherers.

/** Receives elements from a gatherer. */
export interface Downstream<T> {
  /** @returns false if the downstream wants no more elements */
  push(element: T): boolean;
  /** true once push would no longer accept elements */
  isRejecting(): boolean;
}

/**
 * Consumes one element. Returning false stops the upstream (short-circuit).
 * A greedy integrator (Integrator.ofGreedy) never initiates a stop; the flag only enables optimisations.
 */
export type Integrator<A, T, R> = ((state: A, element: T, downstream: Downstream<R>) => boolean) & {
  readonly greedy?: boolean;
};

/**
 * Only integrator() is required. A missing member means its default: no state (null), the default
 * combiner (sequential-only), a finisher that does nothing, and the default composition for andThen.
 */
export interface Gatherer<T, A, R> {
  initializer?(): () => A;
  integrator(): Integrator<A, T, R>;
  /** Merges two states in parallel evaluation; the default combiner marks a gatherer sequential-only. */
  combiner?(): (left: A, right: A) => A;
  finisher?(): (state: A, downstream: Downstream<R>) => void;
  /** Composes this gatherer with that, feeding this one's output into that. */
  andThen?<RR>(that: Gatherer<R, any, RR>): Gatherer<T, any, RR>;
}
