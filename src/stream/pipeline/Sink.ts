// Push-side of the engine: every stage contributes a Sink; a terminal operation is the last one.
// The source drives the chain with begin(size) / accept(t)* / end(). Cancellation is pushed, not
// polled: a sink that wants no more elements calls stop(), which flags it and every sink upstream of
// it (up to a buffering barrier such as sorted()), so a short-circuiting driver only reads the head
// sink's `cancelled` field before each element instead of walking the chain. Every sink class sets
// all its fields in its constructor so instances of one class share a single hidden shape.
import { HashSet } from '../../set/HashSet';
import { naturalCompare, stableSort } from '../../util/Comparator';
import type { Comparator } from '../../util/Comparator';
import { CompensatedSum } from '../../util/SummaryStatistics';
import type { Downstream, Gatherer, Integrator } from '../Gatherer';

/** Receives the elements of one traversal. size is the exact element count, or -1 if unknown. */
export abstract class Sink<T = any> {
  /** This sink, or one downstream of it (short of a barrier), wants no more elements. */
  cancelled = false;
  /** The sink feeding this one; set when an upstream stage wraps it. */
  up: Sink | null = null;
  /** Buffers until end() (sorted): a downstream stop() doesn't cross it. */
  barrier = false;
  begin(_size: number): void {}
  abstract accept(t: T): void;
  end(): void {}
  /**
   * Bulk entry for array sources: accepts a[lo..hi). Hot sink classes override it with their own
   * loop, which removes one dynamic dispatch per element from the head of the chain.
   */
  acceptArray(a: ArrayLike<T>, lo: number, hi: number): void {
    for (let i = lo; i < hi; i++) this.accept(a[i]);
  }
  /** Like acceptArray but stops once cancelled; returns the index of the first element not consumed. */
  acceptArrayWhile(a: ArrayLike<T>, lo: number, hi: number): number {
    let i = lo;
    while (i < hi && !this.cancelled) this.accept(a[i++]);
    return i;
  }
  /** Requests cancellation for this sink and everything upstream of it, up to a barrier. */
  stop(): void {
    let s: Sink | null = this;
    while (s !== null && !s.cancelled) {
      s.cancelled = true;
      s = s.up;
      if (s !== null && s.barrier) return;
    }
  }
}

/** An intermediate stage: forwards to `down`. By default the size becomes unknown. */
export abstract class ChainedSink<T = any, R = any> extends Sink<T> {
  readonly down: Sink<R>;
  constructor(down: Sink<R>) {
    super();
    this.down = down;
    down.up = this;
  }
  override begin(_size: number): void {
    this.down.begin(-1);
  }
  override end(): void {
    this.down.end();
  }
}

/** Attaches `e` to `first.suppressed` (like addSuppressed; self-suppression and primitives are ignored). */
export function addSuppressed(first: unknown, e: unknown): void {
  if (first === e || first === null || (typeof first !== 'object' && typeof first !== 'function')) return;
  try {
    const f = first as { suppressed?: unknown[] };
    (f.suppressed ??= []).push(e);
  } catch {
    // frozen error object: nothing to attach to
  }
}

/** try-with-resources after the body threw `e`: closes c, attaches a close failure to e, rethrows e. */
export function closeAfterFailure(e: unknown, c: { close(): void }): never {
  try {
    c.close();
  } catch (e2) {
    addSuppressed(e, e2);
  }
  throw e;
}

// ---------------------------------------------------------------- stateless stages

export class MapSink<T, R> extends ChainedSink<T, R> {
  constructor(down: Sink<R>, readonly fn: (t: T) => R) {
    super(down);
  }
  override begin(size: number): void {
    this.down.begin(size);
  }
  accept(t: T): void {
    this.down.accept(this.fn(t));
  }
  override acceptArray(a: ArrayLike<T>, lo: number, hi: number): void {
    const f = this.fn;
    const d = this.down;
    for (let i = lo; i < hi; i++) d.accept(f(a[i]));
  }
  override acceptArrayWhile(a: ArrayLike<T>, lo: number, hi: number): number {
    const f = this.fn;
    const d = this.down;
    let i = lo;
    while (i < hi && !this.cancelled) d.accept(f(a[i++]));
    return i;
  }
}

export class FilterSink<T> extends ChainedSink<T, T> {
  constructor(down: Sink<T>, readonly fn: (t: T) => boolean) {
    super(down);
  }
  accept(t: T): void {
    if (this.fn(t)) this.down.accept(t);
  }
  override acceptArray(a: ArrayLike<T>, lo: number, hi: number): void {
    const f = this.fn;
    const d = this.down;
    for (let i = lo; i < hi; i++) {
      const t = a[i];
      if (f(t)) d.accept(t);
    }
  }
  override acceptArrayWhile(a: ArrayLike<T>, lo: number, hi: number): number {
    const f = this.fn;
    const d = this.down;
    let i = lo;
    while (i < hi && !this.cancelled) {
      const t = a[i++];
      if (f(t)) d.accept(t);
    }
    return i;
  }
}

export class PeekSink<T> extends ChainedSink<T, T> {
  constructor(down: Sink<T>, readonly fn: (t: T) => void) {
    super(down);
  }
  override begin(size: number): void {
    this.down.begin(size);
  }
  accept(t: T): void {
    this.fn(t);
    this.down.accept(t);
  }
  override acceptArray(a: ArrayLike<T>, lo: number, hi: number): void {
    const f = this.fn;
    const d = this.down;
    for (let i = lo; i < hi; i++) {
      const t = a[i];
      f(t);
      d.accept(t);
    }
  }
}

export class MapMultiSink<T, R> extends ChainedSink<T, R> {
  readonly emit: (r: R) => void;
  constructor(down: Sink<R>, readonly fn: (t: T, consumer: (r: R) => void) => void) {
    super(down);
    this.emit = (r) => down.accept(r);
  }
  accept(t: T): void {
    this.fn(t, this.emit);
  }
  override acceptArray(a: ArrayLike<T>, lo: number, hi: number): void {
    const f = this.fn;
    const e = this.emit;
    for (let i = lo; i < hi; i++) f(a[i], e);
  }
}

/**
 * Terminal of a flatMap inner pipeline: forwards to the outer sink (not linked into its chain) and
 * mirrors the outer sink's cancellation into the inner chain. begin/end are swallowed.
 */
export class ForwardSink<T> extends Sink<T> {
  constructor(readonly down: Sink<T>) {
    super();
  }
  override begin(_size: number): void {
    if (this.down.cancelled) this.stop();
  }
  accept(t: T): void {
    const d = this.down;
    d.accept(t);
    if (d.cancelled) this.stop();
  }
}

// ---------------------------------------------------------------- stateful stages

/** distinct() by equals()/hashCode(); the first occurrence wins. */
export class DistinctSink<T> extends ChainedSink<T, T> {
  seen: HashSet<T> | null = null;
  override begin(_size: number): void {
    this.seen = new HashSet<T>();
    this.down.begin(-1);
  }
  override end(): void {
    this.seen = null;
    this.down.end();
  }
  accept(t: T): void {
    if (this.seen!.add(t)) this.down.accept(t);
  }
}

/**
 * distinct() for number streams. Doubles compare like boxed equality (NaN equals NaN, -0 differs from 0);
 * int and long streams have no -0, so there it is the same value as 0.
 */
export class NumberDistinctSink extends ChainedSink<number, number> {
  seen: HashSet<number> | null = null;
  negZero = false;
  constructor(down: Sink<number>, private readonly doubles: boolean) {
    super(down);
  }
  override begin(_size: number): void {
    this.seen = new HashSet<number>();
    this.negZero = false;
    this.down.begin(-1);
  }
  override end(): void {
    this.seen = null;
    this.down.end();
  }
  accept(t: number): void {
    // HashSet equality is SameValueZero, so -0 needs its own flag
    if (this.doubles && t === 0 && 1 / t < 0) {
      if (this.negZero) return;
      this.negZero = true;
    } else if (!this.seen!.add(t)) return;
    this.down.accept(t);
  }
}

/** Buffers everything, sorts stably at end() and replays (stopping early if downstream cancels). */
export class SortedSink<T> extends ChainedSink<T, T> {
  buf: T[] = [];
  constructor(down: Sink<T>, readonly cmp: Comparator<T> | null, readonly shortCircuit: boolean) {
    super(down);
    this.barrier = true;
  }
  override begin(_size: number): void {
    this.buf = [];
  }
  accept(t: T): void {
    this.buf.push(t);
  }
  override end(): void {
    const a = this.buf;
    this.buf = [];
    if (this.cmp === null) stableSort(a, naturalCompare);
    else stableSort(a, this.cmp);
    replay(this.down, a, this.shortCircuit);
  }
}

/** sorted() for number streams: Float64Array order is -Infinity..-0, 0..Infinity, NaN last (like Double.compare). */
export class NumberSortedSink extends ChainedSink<number, number> {
  buf: number[] = [];
  constructor(down: Sink<number>, readonly shortCircuit: boolean) {
    super(down);
    this.barrier = true;
  }
  override begin(_size: number): void {
    this.buf = [];
  }
  accept(t: number): void {
    this.buf.push(t);
  }
  override end(): void {
    const a = new Float64Array(this.buf).sort();
    this.buf = [];
    replay(this.down, a, this.shortCircuit);
  }
}

function replay<T>(down: Sink<T>, a: ArrayLike<T>, shortCircuit: boolean): void {
  const n = a.length;
  down.begin(n);
  if (shortCircuit) {
    for (let i = 0; i < n && !down.cancelled; i++) down.accept(a[i]);
  } else {
    for (let i = 0; i < n; i++) down.accept(a[i]);
  }
  down.end();
}

/** skip(n) and limit(m) in one sink; `left` is Infinity without a limit. */
export class SliceSink<T> extends ChainedSink<T, T> {
  skip: number;
  left: number;
  constructor(down: Sink<T>, skip: number, limit: number) {
    super(down);
    this.skip = skip;
    this.left = limit;
  }
  override begin(size: number): void {
    this.down.begin(size < 0 ? -1 : Math.min(Math.max(0, size - this.skip), this.left));
    if (this.left === 0) this.stop();
  }
  accept(t: T): void {
    if (this.skip > 0) this.skip--;
    else if (this.left > 0) {
      this.left--;
      this.down.accept(t);
      if (this.left === 0) this.stop();
    }
  }
}

export class TakeWhileSink<T> extends ChainedSink<T, T> {
  take = true;
  constructor(down: Sink<T>, readonly fn: (t: T) => boolean) {
    super(down);
  }
  accept(t: T): void {
    if (!this.take) return;
    if (this.fn(t)) this.down.accept(t);
    else {
      this.take = false;
      this.stop();
    }
  }
}

export class DropWhileSink<T> extends ChainedSink<T, T> {
  take = false;
  constructor(down: Sink<T>, readonly fn: (t: T) => boolean) {
    super(down);
  }
  accept(t: T): void {
    if (this.take || (this.take = !this.fn(t))) this.down.accept(t);
  }
}

const noState = (): any => null;
const noFinish = (): void => {};

/** Evaluates a Gatherer; the sink itself is the Downstream handed to the integrator and finisher. */
export class GatherSink<T, A, R> extends ChainedSink<T, R> implements Downstream<R> {
  state: A | null = null;
  readonly init: () => A;
  readonly integrator: Integrator<A, T, R>;
  readonly finisher: (state: A, downstream: Downstream<R>) => void;
  /** A gatherer without initializer / finisher gets the defaults: null state, nothing at the end. */
  constructor(down: Sink<R>, g: Gatherer<T, A, R>) {
    super(down);
    this.init = g.initializer === undefined ? noState : g.initializer();
    this.integrator = g.integrator();
    this.finisher = g.finisher === undefined ? noFinish : g.finisher();
  }
  override begin(_size: number): void {
    this.state = this.init();
    this.down.begin(-1);
  }
  accept(t: T): void {
    if (!this.integrator(this.state as A, t, this)) this.stop();
  }
  override end(): void {
    this.finisher(this.state as A, this);
    this.state = null;
    this.down.end();
  }
  push(r: R): boolean {
    const d = this.down;
    if (d.cancelled) return false;
    d.accept(r);
    return !d.cancelled;
  }
  isRejecting(): boolean {
    return this.down.cancelled;
  }
}

// ---------------------------------------------------------------- terminal sinks

export class ActionSink<T> extends Sink<T> {
  constructor(readonly fn: (t: T) => void) {
    super();
  }
  accept(t: T): void {
    this.fn(t);
  }
  override acceptArray(a: ArrayLike<T>, lo: number, hi: number): void {
    const f = this.fn;
    for (let i = lo; i < hi; i++) f(a[i]);
  }
}

export class ArraySink<T> extends Sink<T> {
  readonly out: T[] = [];
  accept(t: T): void {
    this.out.push(t);
  }
  override acceptArray(a: ArrayLike<T>, lo: number, hi: number): void {
    const out = this.out;
    for (let i = lo; i < hi; i++) out.push(a[i]);
  }
}

export class CountSink extends Sink<unknown> {
  n = 0;
  accept(_t: unknown): void {
    this.n++;
  }
  override acceptArray(_a: ArrayLike<unknown>, lo: number, hi: number): void {
    this.n += hi - lo;
  }
}

export class FoldSink<T, U> extends Sink<T> {
  constructor(public acc: U, readonly fn: (u: U, t: T) => U) {
    super();
  }
  accept(t: T): void {
    this.acc = this.fn(this.acc, t);
  }
  override acceptArray(a: ArrayLike<T>, lo: number, hi: number): void {
    const f = this.fn;
    let acc = this.acc;
    for (let i = lo; i < hi; i++) acc = f(acc, a[i]);
    this.acc = acc;
  }
}

/** reduce(op) without identity: the first element seeds the accumulator. */
export class ReduceSink<T> extends Sink<T> {
  empty = true;
  acc: T | undefined = undefined;
  constructor(readonly fn: (a: T, b: T) => T) {
    super();
  }
  accept(t: T): void {
    if (this.empty) {
      this.empty = false;
      this.acc = t;
    } else this.acc = this.fn(this.acc as T, t);
  }
}

export class CollectSink<T, R> extends Sink<T> {
  constructor(readonly container: R, readonly fn: (r: R, t: T) => void) {
    super();
  }
  accept(t: T): void {
    this.fn(this.container, t);
  }
  override acceptArray(a: ArrayLike<T>, lo: number, hi: number): void {
    const f = this.fn;
    const c = this.container;
    for (let i = lo; i < hi; i++) f(c, a[i]);
  }
}

export class SumSink extends Sink<number> {
  sum = 0;
  accept(t: number): void {
    this.sum += t;
  }
  override acceptArray(a: ArrayLike<number>, lo: number, hi: number): void {
    let s = this.sum;
    for (let i = lo; i < hi; i++) s += a[i];
    this.sum = s;
  }
}

/** Compensated sum and count (average() of every number stream; sum() of DoubleStream). */
export class DoubleSumSink extends Sink<number> {
  readonly sum = new CompensatedSum();
  count = 0;
  accept(t: number): void {
    this.count++;
    this.sum.add(t);
  }
}

export class FindSink<T> extends Sink<T> {
  found = false;
  value: T | undefined = undefined;
  accept(t: T): void {
    if (!this.found) {
      this.found = true;
      this.value = t;
      this.stop();
    }
  }
}

/** Stops at the first element whose predicate result equals `stopOn`. */
export class MatchSink<T> extends Sink<T> {
  stopped = false;
  constructor(readonly fn: (t: T) => boolean, readonly stopOn: boolean) {
    super();
  }
  accept(t: T): void {
    if (!this.stopped && !!this.fn(t) === this.stopOn) {
      this.stopped = true;
      this.stop();
    }
  }
}
