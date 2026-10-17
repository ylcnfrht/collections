// Minimal sequential gatherer evaluator, independent of the stream engine.
import type { Downstream, Gatherer } from '../../../src/stream/Gatherer';

/** Collects pushes into an array; rejects once `limit` elements were accepted (like a downstream limit()). */
export class Sink<R> implements Downstream<R> {
  readonly out: R[] = [];
  pushes = 0;
  constructor(private readonly limit = Infinity) {}
  push(e: R): boolean {
    this.pushes++;
    if (this.out.length >= this.limit) return false;
    this.out.push(e);
    return this.out.length < this.limit;
  }
  isRejecting(): boolean {
    return this.out.length >= this.limit;
  }
}

/** Integrates input[from, to) into state; returns false when integration stopped early. */
export function integrateRange<T, A, R>(g: Gatherer<T, A, R>, state: A, input: readonly T[], sink: Downstream<R>, from = 0, to = input.length): boolean {
  const integrator = g.integrator();
  for (let i = from; i < to; i++) if (!integrator(state, input[i], sink) || sink.isRejecting()) return false;
  return true;
}

/** initializer -> integrator per element until it returns false or the downstream rejects -> finisher. */
export function gather<T, A, R>(g: Gatherer<T, A, R>, input: readonly T[], limit = Infinity): R[] {
  const sink = new Sink<R>(limit);
  const state = g.initializer()();
  const integrator = g.integrator();
  // loop inlined (not integrateRange) so benchmarks measure the gatherer, not an extra call layer
  for (let i = 0; i < input.length; i++) if (!integrator(state, input[i], sink) || sink.isRejecting()) break;
  g.finisher()(state, sink);
  return sink.out;
}

/** Splits input at `at`, integrates both halves in separate states, combines, then finishes. */
export function gatherSplit<T, A, R>(g: Gatherer<T, A, R>, input: readonly T[], at: number): R[] {
  const sink = new Sink<R>();
  const left = g.initializer()();
  const right = g.initializer()();
  integrateRange(g, left, input, sink, 0, at);
  integrateRange(g, right, input, sink, at);
  g.finisher()(g.combiner()(left, right), sink);
  return sink.out;
}
