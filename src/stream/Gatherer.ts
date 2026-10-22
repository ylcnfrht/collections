// Type contract for gatherers (custom intermediate operations). Gatherer.of/ofSequential,
// Integrator.of/ofGreedy and the default* sentinels live with Gatherers.

/** The next stage, as a gatherer's integrator and finisher see it: they emit elements by calling `push`. */
export interface Downstream<T> {
  /**
   * Sends `element` to the next stage.
   * @returns `false` if the downstream wants no more elements (for example, a later `limit` was reached)
   */
  push(element: T): boolean;
  /** Returns `true` once `push` would no longer accept elements; check it before expensive work or pushing leftovers. */
  isRejecting(): boolean;
}

/**
 * A gatherer's per-element step: called with the state, the element and the {@link Downstream}, it may push zero or
 * more elements and returns `true` to continue or `false` to stop the upstream (short-circuit). A greedy integrator
 * (`Integrator.ofGreedy`) never initiates a stop; the flag only lets the engine skip short-circuit checks.
 * Create one with `Integrator.of` or `Integrator.ofGreedy`, or pass a plain function.
 */
export type Integrator<A, T, R> = ((state: A, element: T, downstream: Downstream<R>) => boolean) & {
  /** `true` for an integrator made by `Integrator.ofGreedy`: it never stops the upstream by itself. */
  readonly greedy?: boolean;
};

/**
 * A custom intermediate operation, applied with `stream.gather(gatherer)`: it can map one element to many or many
 * to one, keep state, emit elements at the end and stop the upstream early. The initializer creates the state once,
 * the integrator runs for each element, and the finisher runs once after the last element or after a stop.
 *
 * Only `integrator()` is required. A missing member means its default: no state (`null`), the default
 * combiner (sequential-only), a finisher that does nothing, and the default composition for `andThen`.
 * Built-ins are in {@link Gatherers}; factories are `Gatherer.of` and `Gatherer.ofSequential`.
 */
export interface Gatherer<T, A, R> {
  /** Returns the function that creates the state, called once per evaluation. */
  initializer?(): () => A;
  /** Returns the {@link Integrator} called for each upstream element. */
  integrator(): Integrator<A, T, R>;
  /** Merges two states in parallel evaluation; the default combiner marks a gatherer sequential-only. */
  combiner?(): (left: A, right: A) => A;
  /** Returns the function run once at the end (after the last element or a stop); it may push what the state still holds. */
  finisher?(): (state: A, downstream: Downstream<R>) => void;
  /** Returns a gatherer that feeds this one's output into `that`; the same as `gather(this).gather(that)`. */
  andThen?<RR>(that: Gatherer<R, any, RR>): Gatherer<T, any, RR>;
}
