// The stream engine. A pipeline is a linked list of stages back to a Source; each intermediate
// operation appends a stage holding a sink factory. A terminal operation wraps its sink with every
// stage's sink (last stage innermost), then the source pushes elements through the chain: in one
// bulk loop for plain pipelines, element by element (checking the head sink's `cancelled` flag)
// when a short-circuiting stage or terminal is present. One engine serves all four stream kinds;
// the subclasses only add the kind-specific operations and pick the Optional flavour.
import { IllegalArgumentException, IllegalStateException, IndexOutOfBoundsException } from '../../exceptions';
import { ImmutableList } from '../../immutable/ImmutableCollections';
import type { Iterator } from '../../interfaces/Iterator';
import type { List } from '../../interfaces/List';
import type { Comparator } from '../../util/Comparator';
import { requireNonNull } from '../../util/Objects';
import { DoubleSummaryStatistics, IntSummaryStatistics, LongSummaryStatistics } from '../../util/SummaryStatistics';
import type { Collector } from '../Collector';
import type { Gatherer } from '../Gatherer';
import { Optional, OptionalDouble, OptionalInt, OptionalLong } from '../Optional';
import { BaseSpliterator, Spliterator } from '../Spliterator';
import type { DoubleStream, IntStream, LongStream, Stream } from '../Stream';
import {
  ActionSink,
  addSuppressed,
  closeAfterFailure,
  ArraySink,
  ChainedSink,
  CollectSink,
  CountSink,
  DistinctSink,
  DoubleSumSink,
  DropWhileSink,
  FilterSink,
  FindSink,
  FoldSink,
  ForwardSink,
  GatherSink,
  MapMultiSink,
  MapSink,
  MatchSink,
  NumberDistinctSink,
  NumberSortedSink,
  PeekSink,
  ReduceSink,
  SliceSink,
  Sink,
  SortedSink,
  SumSink,
  TakeWhileSink,
} from './Sink';
import { SpliteratorIterator } from '../Spliterators';
import { ArraySpliterator, DelegatingSpliterator, drain, JsIterator, NumberIterator } from './spliterators';

const LINKED = 'stream has already been operated upon or closed';
const { DISTINCT, SORTED, ORDERED, SIZED, SUBSIZED } = Spliterator;
/**
 * Stage flags: what the pipeline knows about its elements, as the characteristic bits a pipeline
 * spliterator reports (SORTED means natural order), plus internal bits above them.
 */
const STREAM_FLAGS = DISTINCT | SORTED | ORDERED | SIZED;
/** Stage flag: the stage may stop the traversal early. */
const SHORT_CIRCUIT = 1 << 30;
/** Cleared by element-changing stages (map, flatMap, gather, ...). */
const NOT_SORTED_DISTINCT = DISTINCT | SORTED;

/** pull: the buffer a spliterator() traversal fills (flatMap pauses once it holds an element); null when pushing. */
type SinkFactory = (down: Sink, shortCircuit: boolean, pull: unknown[] | null) => Sink;
/** Maps the exact upstream size to this stage's output size (-1 unknown); null = unchanged. */
type SizeFn = ((n: number) => number) | null;
const UNKNOWN_SIZE: SizeFn = () => -1;

/** Shared by every stage of one pipeline: the source and the stream-wide state. */
export class Source {
  handlers: (() => void)[] | null = null;
  consumed = false;
  constructor(public sp: Spliterator<any> | null, public supplier: (() => Spliterator<any>) | null, public parallel: boolean) {}
}

type Ctor<P> = new (src: Source, prev: AbstractPipeline | null, op: SinkFactory | null, flags: number, size: SizeFn) => P;

/** Runs close handlers in order; the first failure is rethrown with the later ones in `suppressed`. */
export function runAll(handlers: readonly (() => void)[]): void {
  let failed = false;
  let first: unknown;
  for (const h of handlers) {
    try {
      h();
    } catch (e) {
      if (!failed) {
        failed = true;
        first = e;
      } else addSuppressed(first, e);
    }
  }
  if (failed) throw first;
}

function checkCount(n: number): number {
  if (!(Number.isInteger(n) && n >= 0)) throw new IllegalArgumentException(String(n));
  return n;
}

/** Head stage flags of a spliterator source; SORTED only for natural order. */
function sourceFlags(sp: Spliterator<any>): number {
  const c = sp.characteristics() & STREAM_FLAGS;
  return (c & SORTED) !== 0 && sp.getComparator() !== null ? c & ~SORTED : c;
}

export abstract class AbstractPipeline<T = any> {
  private linked = false;
  /** Set on map / filter stages so a directly following map / filter can fuse with them. */
  mapFn: ((t: any) => any) | null = null;
  filterFn: ((t: any) => boolean) | null = null;

  constructor(
    readonly src: Source,
    readonly prev: AbstractPipeline | null,
    readonly op: SinkFactory | null,
    readonly flags: number,
    readonly size: SizeFn
  ) {}

  // ---------------------------------------------------------------- engine

  protected link(): void {
    if (this.linked) throw new IllegalStateException(LINKED);
    this.linked = true;
  }

  /** Appends a stage: its flags are this stage's minus `clear` plus `set`; an unknown size clears SIZED. */
  protected chain(ctor: Ctor<any>, set: number, clear: number, size: SizeFn, op: SinkFactory | null): any {
    this.link();
    const f = (this.flags & ~clear) | set;
    return new ctor(this.src, this, op, size === UNKNOWN_SIZE ? f & ~SIZED : f, size);
  }

  protected self(): Ctor<any> {
    return this.constructor as Ctor<any>;
  }

  /**
   * Marks this stage used and hands out the source spliterator (once per pipeline). A supplier is
   * called now, or with `lazy` (spliterator()/iterator()) on the returned spliterator's first use.
   */
  protected open(lazy = false): Spliterator<any> {
    this.link();
    const s = this.src;
    if (s.consumed) throw new IllegalStateException('source already consumed or closed');
    s.consumed = true;
    const sp = s.sp ?? (lazy ? new DelegatingSpliterator(s.supplier!) : requireNonNull(s.supplier!()));
    s.sp = null;
    s.supplier = null;
    return sp;
  }

  /** Wraps sink with every stage's sink, first stage outermost. */
  wrap(sink: Sink, shortCircuit: boolean, pull: unknown[] | null = null): Sink {
    for (let p: AbstractPipeline | null = this; p !== null; p = p.prev) if (p.op !== null) sink = p.op(sink, shortCircuit, pull);
    return sink;
  }

  /** Pushes the source through the stages into terminal. */
  exec<S extends Sink>(sp: Spliterator<any>, terminal: S, terminalShortCircuit: boolean): S {
    const sc = terminalShortCircuit || (this.flags & SHORT_CIRCUIT) !== 0;
    const sink = this.wrap(terminal, sc);
    sink.begin(sp.getExactSizeIfKnown());
    drain(sp, sink, sc);
    sink.end();
    return terminal;
  }

  /** Output size for an exact source size n, or -1 when some stage makes it unknown. */
  exactSize(n: number): number {
    if (this.prev === null) return n;
    const m = this.prev.exactSize(n);
    return m < 0 || this.size === null ? m : this.size(m);
  }

  /** flatMap support: evaluates this stream into an outer sink (no begin/end), then the caller closes it. */
  pushInto(sink: Sink, shortCircuit: boolean): void {
    const sp = this.open();
    // no stages: drain straight into the outer sink (no begin/end, its cancellation checked directly)
    if (this.prev === null) drain(sp, sink, shortCircuit);
    else this.exec(sp, new ForwardSink(sink), shortCircuit);
  }

  protected abstract some(v: unknown): unknown;
  protected abstract none(): unknown;

  // ---------------------------------------------------------------- BaseStream

  iterator(): Iterator<T> {
    return new SpliteratorIterator(this.spliterator());
  }

  /** Lazy: elements are pulled through the stages only as the spliterator is advanced. */
  spliterator(): Spliterator<T> {
    const sp = this.open(true);
    return this.prev === null ? sp : new WrappingSpliterator(this, sp);
  }

  /** close(); installed on the prototype below where the runtime has Symbol.dispose. */
  declare [Symbol.dispose]: () => void;

  /** Consumes the stream like iterator(); leaving a for..of early closes the stream. */
  [Symbol.iterator](): IterableIterator<T> {
    return new JsIterator(this.spliterator(), () => this.close());
  }

  isParallel(): boolean {
    return this.src.parallel;
  }

  sequential(): any {
    this.src.parallel = false;
    return this;
  }

  parallel(): any {
    this.src.parallel = true;
    return this;
  }

  /** Returns this stream when it is already unordered. SORTED goes too (the reference reports it only with ORDERED). */
  unordered(): any {
    return (this.flags & ORDERED) === 0 ? this : this.chain(this.self(), 0, ORDERED | SORTED, null, null);
  }

  onClose(closeHandler: () => void): any {
    if (this.linked) throw new IllegalStateException(LINKED);
    requireNonNull(closeHandler);
    (this.src.handlers ??= []).push(closeHandler);
    return this;
  }

  close(): void {
    this.linked = true;
    const s = this.src;
    s.consumed = true;
    s.sp = null;
    s.supplier = null;
    const hs = s.handlers;
    s.handlers = null;
    if (hs !== null) runAll(hs);
  }

  // ---------------------------------------------------------------- shared intermediate operations

  filter(predicate: (t: T) => boolean): any {
    requireNonNull(predicate);
    const f = this.filterFn;
    // filter after filter fuses into one stage: same calls in the same order, one sink hop less
    const p = f === null ? predicate : (t: T) => f(t) && predicate(t);
    const s = this.fuse(this.self(), f !== null, 0, UNKNOWN_SIZE, (d) => new FilterSink(d, p));
    s.filterFn = p;
    return s;
  }

  /**
   * Appends a stage, or with `replace` swaps this (stateless) stage for the fused one. A chain of
   * same-class sinks is a recursive call the JIT won't inline, so fusing matters for speed.
   */
  private fuse(ctor: Ctor<any>, replace: boolean, clear: number, size: SizeFn, op: SinkFactory): AbstractPipeline {
    if (!replace) return this.chain(ctor, 0, clear, size, op);
    this.link();
    return new ctor(this.src, this.prev, op, this.flags, size);
  }

  map(mapper: (t: T) => any): any {
    return this.mapTo(this.self(), mapper);
  }

  protected mapTo(ctor: Ctor<any>, mapper: (t: T) => any): any {
    requireNonNull(mapper);
    const f = this.mapFn;
    const m = f === null ? mapper : (t: T) => mapper(f(t));
    const s = this.fuse(ctor, f !== null, NOT_SORTED_DISTINCT, null, (d) => new MapSink(d, m));
    s.mapFn = m;
    return s;
  }

  /** A null/undefined mapped stream counts as empty; each mapped stream is closed after its elements are pushed. */
  flatMap(mapper: (t: T) => any): any {
    return this.flatMapTo(this.self(), mapper);
  }

  protected flatMapTo(ctor: Ctor<any>, mapper: (t: T) => any): any {
    requireNonNull(mapper);
    return this.chain(ctor, 0, NOT_SORTED_DISTINCT, UNKNOWN_SIZE, (d, sc, pull) => new FlatMapSink(d, mapper, sc, pull));
  }

  mapMulti(mapper: (t: T, consumer: (r: any) => void) => void): any {
    return this.mapMultiTo(this.self(), mapper);
  }

  protected mapMultiTo(ctor: Ctor<any>, mapper: (t: T, consumer: (r: any) => void) => void): any {
    requireNonNull(mapper);
    return this.chain(ctor, 0, NOT_SORTED_DISTINCT, UNKNOWN_SIZE, (d) => new MapMultiSink(d, mapper));
  }

  peek(action: (t: T) => void): any {
    requireNonNull(action);
    return this.chain(this.self(), 0, 0, null, (d) => new PeekSink(d, action));
  }

  limit(maxSize: number): any {
    checkCount(maxSize);
    return this.chain(this.self(), SHORT_CIRCUIT, 0, (n) => Math.min(n, maxSize), (d) => new SliceSink(d, 0, maxSize));
  }

  skip(n: number): any {
    if (checkCount(n) === 0) return this;
    return this.chain(this.self(), 0, 0, (m) => Math.max(0, m - n), (d) => new SliceSink(d, n, Infinity));
  }

  takeWhile(predicate: (t: T) => boolean): any {
    requireNonNull(predicate);
    return this.chain(this.self(), SHORT_CIRCUIT, 0, UNKNOWN_SIZE, (d) => new TakeWhileSink(d, predicate));
  }

  dropWhile(predicate: (t: T) => boolean): any {
    requireNonNull(predicate);
    return this.chain(this.self(), 0, 0, UNKNOWN_SIZE, (d) => new DropWhileSink(d, predicate));
  }

  // ---------------------------------------------------------------- shared terminal operations

  forEach(action: (t: T) => void): void {
    requireNonNull(action);
    this.exec(this.open(), new ActionSink(action), false);
  }

  forEachOrdered(action: (t: T) => void): void {
    this.forEach(action);
  }

  /**
   * With a generator: a known exact size is requested before the traversal and the array must have
   * exactly that length (IllegalStateException); otherwise the array is requested afterwards, must
   * not be shorter (IndexOutOfBoundsException), and slots past the elements are set to null.
   */
  toArray(generator?: (length: number) => any): any {
    const sp = this.open();
    if (generator === undefined) return this.exec(sp, new ArraySink<T>(), false).out;
    requireNonNull(generator);
    const size = (this.flags & SIZED) === 0 ? -1 : this.exactSize(sp.getExactSizeIfKnown());
    let out = size < 0 ? null : requireNonNull(generator(size));
    if (out !== null && out.length !== size) throw new IllegalStateException(`array length ${out.length} is not the stream size ${size}`);
    const a = this.exec(sp, new ArraySink<T>(), false).out;
    const n = a.length;
    if (out === null) {
      out = requireNonNull(generator(n));
      if (out.length < n) throw new IndexOutOfBoundsException('does not fit');
      for (let i = n; i < out.length; i++) out[i] = null;
    }
    for (let i = 0; i < n; i++) out[i] = a[i];
    return out;
  }

  reduce(identity: any, accumulator?: any, combiner?: any): any {
    if (arguments.length === 1) {
      requireNonNull(identity);
      const r = this.exec(this.open(), new ReduceSink<T>(identity), false);
      return r.empty ? this.none() : this.some(r.acc);
    }
    requireNonNull(accumulator);
    if (arguments.length > 2) requireNonNull(combiner);
    return this.exec(this.open(), new FoldSink(identity, accumulator), false).acc;
  }

  collect(supplierOrCollector: any, accumulator?: (r: any, t: T) => void, combiner?: (a: any, b: any) => void): any {
    if (arguments.length === 1) {
      // the reference's call order: supplier, accumulator, combiner, then the single-use check
      const c = requireNonNull(supplierOrCollector as Collector<T, any, any>);
      const supplier = c.supplier();
      const accumulator = c.accumulator();
      c.combiner();
      const sp = this.open();
      c.characteristics(); // read before the traversal too (the reference derives its op flags from it)
      const container = supplier();
      this.exec(sp, new CollectSink(container, accumulator), false);
      return c.characteristics().contains('IDENTITY_FINISH') ? container : c.finisher()(container);
    }
    requireNonNull(supplierOrCollector);
    requireNonNull(accumulator);
    requireNonNull(combiner);
    const sp = this.open();
    return this.exec(sp, new CollectSink(supplierOrCollector(), accumulator!), false).container;
  }

  /** Skips traversal when the pipeline is SIZED, so peek actions then don't run. */
  count(): number {
    const sp = this.open();
    if ((this.flags & SIZED) !== 0) {
      const n = sp.getExactSizeIfKnown();
      if (n >= 0) return this.exactSize(n);
    }
    return this.exec(sp, new CountSink(), false).n;
  }

  anyMatch(predicate: (t: T) => boolean): boolean {
    requireNonNull(predicate);
    return this.exec(this.open(), new MatchSink(predicate, true), true).stopped;
  }

  allMatch(predicate: (t: T) => boolean): boolean {
    requireNonNull(predicate);
    return !this.exec(this.open(), new MatchSink(predicate, false), true).stopped;
  }

  noneMatch(predicate: (t: T) => boolean): boolean {
    requireNonNull(predicate);
    return !this.exec(this.open(), new MatchSink(predicate, true), true).stopped;
  }

  findFirst(): any {
    const f = this.exec(this.open(), new FindSink<T>(), true);
    return f.found ? this.some(f.value) : this.none();
  }

  /** Sequential execution: the same element as findFirst(). */
  findAny(): any {
    return this.findFirst();
  }
}

/** Something flatMap can push from: our pipelines, or any stream through its spliterator. */
type Inner = { pushInto?(sink: Sink, shortCircuit: boolean): void; spliterator(): Spliterator<any>; close(): void };

export class FlatMapSink<T> extends ChainedSink<T, any> {
  /**
   * Pull mode: the mapped stream still being read (and its spliterator), the upstream elements not
   * mapped yet, and whether end() is held back until they are done; all kept across pulls.
   */
  inner: Inner | null = null;
  innerSp: Spliterator<any> | null = null;
  readonly queue: T[] = [];
  qi = 0;
  ending = false;
  readonly emit: (r: unknown) => void;
  constructor(
    down: Sink,
    readonly fn: (t: T) => Inner | null | undefined,
    readonly shortCircuit: boolean,
    readonly pull: unknown[] | null
  ) {
    super(down);
    this.emit = (r) => down.accept(r);
  }
  accept(t: T): void {
    if (this.pull !== null) {
      this.queue.push(t);
      if (this.inner === null && this.pull.length === 0) this.resume();
      return;
    }
    const inner = this.fn(t);
    if (inner === null || inner === undefined) return;
    try {
      if (inner instanceof AbstractPipeline) inner.pushInto(this.down, this.shortCircuit);
      else drain(inner.spliterator(), this.down, this.shortCircuit);
    } catch (e) {
      closeAfterFailure(e, inner);
    }
    inner.close();
  }
  override end(): void {
    if (this.pull !== null && this.hasWork()) this.ending = true;
    else this.down.end();
  }
  /** Pull mode: something is left for resume(). */
  hasWork(): boolean {
    return this.inner !== null || this.qi < this.queue.length || this.ending;
  }
  /**
   * Pull mode: maps queued elements and reads their streams one element at a time until the pull
   * buffer holds one, so an infinite mapped stream still yields; later resume() calls go on from there.
   */
  resume(): void {
    const down = this.down;
    const buf = this.pull!;
    const q = this.queue;
    for (;;) {
      let inner: Inner | null | undefined = this.inner;
      if (inner === null) {
        if (down.cancelled) q.length = this.qi = 0;
        if (this.qi === q.length) {
          q.length = this.qi = 0;
          if (this.ending) {
            this.ending = false;
            down.end();
          }
          return;
        }
        const t = q[this.qi];
        q[this.qi++] = undefined as T;
        inner = this.fn(t);
        if (inner === null || inner === undefined) continue;
        this.inner = inner;
      }
      try {
        const sp = (this.innerSp ??= inner.spliterator());
        while (!down.cancelled && buf.length === 0 && sp.tryAdvance(this.emit));
      } catch (e) {
        this.inner = this.innerSp = null;
        closeAfterFailure(e, inner);
      }
      if (buf.length !== 0 && !down.cancelled) return; // paused: this stream may have more
      this.inner = this.innerSp = null;
      inner.close();
      if (buf.length !== 0) return;
    }
  }
}

/** spliterator() of a pipeline with stages: advances the source until the stages emit something. */
class WrappingSpliterator<T> extends BaseSpliterator<T> {
  private readonly buf: T[] = [];
  private pos = 0;
  private sink: Sink | null = null;
  private done = false;
  private readonly push = (t: unknown) => this.sink!.accept(t);
  /** flatMap stages, upstream first: one may hold a partly read mapped stream between pulls. */
  private readonly flat: FlatMapSink<any>[] = [];

  constructor(private readonly p: AbstractPipeline, private readonly sp: Spliterator<any>) {
    super();
  }

  private fill(): boolean {
    const buf = this.buf;
    if (this.sink === null) {
      this.sink = this.p.wrap(new CollectSink(buf, (b: T[], t: T) => b.push(t)), true, buf);
      for (let s: Sink = this.sink; s instanceof ChainedSink; s = s.down) if (s instanceof FlatMapSink) this.flat.push(s);
      this.sink.begin(this.sp.getExactSizeIfKnown());
    }
    const sink = this.sink;
    while (this.pos >= buf.length) {
      buf.length = 0;
      this.pos = 0;
      // flatMap work left over (also from the end() flush) comes before the source and the end
      const f = this.pending();
      if (f !== null) f.resume();
      else if (this.done) return false;
      else if (sink.cancelled || !this.sp.tryAdvance(this.push)) {
        this.done = true;
        sink.end();
      }
    }
    return true;
  }

  /** The most downstream flatMap with a partly read mapped stream: it continues before anything upstream. */
  private pending(): FlatMapSink<any> | null {
    const a = this.flat;
    for (let i = a.length - 1; i >= 0; i--) if (a[i].hasWork()) return a[i];
    return null;
  }

  tryAdvance(action: (t: T) => void): boolean {
    requireNonNull(action);
    if (!this.fill()) return false;
    const t = this.buf[this.pos];
    this.buf[this.pos++] = undefined as T;
    action(t);
    return true;
  }

  override forEachRemaining(action: (t: T) => void): void {
    requireNonNull(action);
    if (this.sink === null && !this.done) {
      // untouched: run the whole pipeline in push mode
      this.done = true;
      this.p.exec(this.sp, new ActionSink(action), false);
    } else while (this.tryAdvance(action));
  }

  /** Exact (after limit/skip adjustment) when SIZED, else the source's estimate. */
  estimateSize(): number {
    return (this.p.flags & SIZED) === 0 ? this.sp.estimateSize() : this.p.exactSize(this.sp.getExactSizeIfKnown());
  }

  /** The stage flags; SIZED / SUBSIZED as the source reports them when the stages keep the size. */
  characteristics(): number {
    const c = this.p.flags & STREAM_FLAGS;
    return (c & SIZED) === 0 ? c : (c & ~SIZED) | (this.sp.characteristics() & (SIZED | SUBSIZED));
  }
}

// ---------------------------------------------------------------- the four kinds

export class RefPipeline<T> extends AbstractPipeline<T> implements Stream<T> {
  protected some(v: unknown): Optional<any> {
    return Optional.of(v);
  }
  protected none(): Optional<any> {
    return Optional.empty();
  }

  mapToInt(mapper: (t: T) => number): IntStream {
    return this.mapTo(IntPipeline, mapper);
  }
  mapToLong(mapper: (t: T) => number): LongStream {
    return this.mapTo(LongPipeline, mapper);
  }
  mapToDouble(mapper: (t: T) => number): DoubleStream {
    return this.mapTo(DoublePipeline, mapper);
  }
  flatMapToInt(mapper: (t: T) => IntStream | null | undefined): IntStream {
    return this.flatMapTo(IntPipeline, mapper);
  }
  flatMapToLong(mapper: (t: T) => LongStream | null | undefined): LongStream {
    return this.flatMapTo(LongPipeline, mapper);
  }
  flatMapToDouble(mapper: (t: T) => DoubleStream | null | undefined): DoubleStream {
    return this.flatMapTo(DoublePipeline, mapper);
  }
  mapMultiToInt(mapper: (t: T, consumer: (n: number) => void) => void): IntStream {
    return this.mapMultiTo(IntPipeline, mapper);
  }
  mapMultiToLong(mapper: (t: T, consumer: (n: number) => void) => void): LongStream {
    return this.mapMultiTo(LongPipeline, mapper);
  }
  mapMultiToDouble(mapper: (t: T, consumer: (n: number) => void) => void): DoubleStream {
    return this.mapMultiTo(DoublePipeline, mapper);
  }

  distinct(): Stream<T> {
    return this.chain(RefPipeline, DISTINCT, 0, UNKNOWN_SIZE, (d) => new DistinctSink(d));
  }

  /** sorted() is natural order; an explicit null / undefined comparator throws NullPointerException. */
  sorted(comparator?: Comparator<T>): Stream<T> {
    if (arguments.length === 0) return this.chain(RefPipeline, ORDERED | SORTED, 0, null, (d, sc) => new SortedSink(d, null, sc));
    if (comparator === null || comparator === undefined) {
      this.link(); // like the reference: a used stream fails with IllegalStateException first, and the stage is linked
      requireNonNull(comparator);
    }
    const c = comparator!;
    return this.chain(RefPipeline, ORDERED, SORTED, null, (d, sc) => new SortedSink(d, c, sc));
  }

  gather<R>(gatherer: Gatherer<T, any, R>): Stream<R> {
    requireNonNull(gatherer);
    const greedy = gatherer.integrator().greedy === true;
    return this.chain(RefPipeline, greedy ? 0 : SHORT_CIRCUIT, NOT_SORTED_DISTINCT, UNKNOWN_SIZE, (d) => new GatherSink(d, gatherer));
  }

  toList(): List<T> {
    return new ImmutableList(this.toArray() as T[], false);
  }

  min(comparator: Comparator<T>): Optional<T> {
    requireNonNull(comparator);
    return this.reduce((a: T, b: T) => (comparator(a, b) <= 0 ? a : b));
  }

  max(comparator: Comparator<T>): Optional<T> {
    requireNonNull(comparator);
    return this.reduce((a: T, b: T) => (comparator(a, b) >= 0 ? a : b));
  }
}

abstract class NumberPipeline extends AbstractPipeline<number> {
  mapToObj<U>(mapper: (n: number) => U): Stream<U> {
    return this.mapTo(RefPipeline, mapper);
  }

  /** Number streams are iterated with a PrimitiveIterator (nextInt / nextLong / nextDouble). */
  override iterator(): NumberIterator {
    return new NumberIterator(this.spliterator());
  }

  boxed(): Stream<number> {
    return this.chain(RefPipeline, 0, 0, null, null);
  }

  /** Reports neither DISTINCT nor SORTED afterwards, like the reference (which distincts boxed values). */
  distinct(): any {
    return this.chain(this.self(), 0, NOT_SORTED_DISTINCT, UNKNOWN_SIZE, (d) => new NumberDistinctSink(d, this.self() === DoublePipeline));
  }

  sorted(): any {
    return this.chain(this.self(), ORDERED | SORTED, 0, null, (d, sc) => new NumberSortedSink(d, sc));
  }

  /** Only the three-argument form exists for number streams. */
  override collect(supplier: any, accumulator?: any, combiner?: any): any {
    if (arguments.length < 2) throw new IllegalArgumentException('number streams have no collect(Collector); use collect(supplier, accumulator, combiner)');
    return super.collect(supplier, accumulator, combiner);
  }

  sum(): number {
    return this.exec(this.open(), new SumSink(), false).sum;
  }

  min(): any {
    return this.reduce(Math.min);
  }

  max(): any {
    return this.reduce(Math.max);
  }

  average(): OptionalDouble {
    const s = this.exec(this.open(), new DoubleSumSink(), false);
    return s.count === 0 ? OptionalDouble.empty() : OptionalDouble.of(this.total(s) / s.count);
  }

  protected total(s: DoubleSumSink): number {
    return s.sum.simple;
  }

  protected collectStats<S extends { accept(n: number): void }>(stats: S): S {
    this.exec(this.open(), new ActionSink((n: number) => stats.accept(n)), false);
    return stats;
  }
}

export class IntPipeline extends NumberPipeline implements IntStream {
  protected some(v: number): OptionalInt {
    return OptionalInt.of(v);
  }
  protected none(): OptionalInt {
    return OptionalInt.empty();
  }
  mapToLong(mapper: (n: number) => number): LongStream {
    return this.mapTo(LongPipeline, mapper);
  }
  mapToDouble(mapper: (n: number) => number): DoubleStream {
    return this.mapTo(DoublePipeline, mapper);
  }
  asLongStream(): LongStream {
    return this.chain(LongPipeline, 0, 0, null, null);
  }
  asDoubleStream(): DoubleStream {
    return this.chain(DoublePipeline, 0, 0, null, null);
  }
  summaryStatistics(): IntSummaryStatistics {
    return this.collectStats(new IntSummaryStatistics());
  }
}

export class LongPipeline extends NumberPipeline implements LongStream {
  protected some(v: number): OptionalLong {
    return OptionalLong.of(v);
  }
  protected none(): OptionalLong {
    return OptionalLong.empty();
  }
  mapToInt(mapper: (n: number) => number): IntStream {
    return this.mapTo(IntPipeline, mapper);
  }
  mapToDouble(mapper: (n: number) => number): DoubleStream {
    return this.mapTo(DoublePipeline, mapper);
  }
  /** Not DISTINCT afterwards: distinct longs may round to the same double. */
  asDoubleStream(): DoubleStream {
    return this.chain(DoublePipeline, 0, DISTINCT, null, null);
  }
  summaryStatistics(): LongSummaryStatistics {
    return this.collectStats(new LongSummaryStatistics());
  }
}

export class DoublePipeline extends NumberPipeline implements DoubleStream {
  protected some(v: number): OptionalDouble {
    return OptionalDouble.of(v);
  }
  protected none(): OptionalDouble {
    return OptionalDouble.empty();
  }
  mapToInt(mapper: (n: number) => number): IntStream {
    return this.mapTo(IntPipeline, mapper);
  }
  mapToLong(mapper: (n: number) => number): LongStream {
    return this.mapTo(LongPipeline, mapper);
  }
  /** Kahan-compensated. */
  override sum(): number {
    return this.exec(this.open(), new DoubleSumSink(), false).sum.result();
  }
  protected override total(s: DoubleSumSink): number {
    return s.sum.result();
  }
  summaryStatistics(): DoubleSummaryStatistics {
    return this.collectStats(new DoubleSummaryStatistics());
  }
}

/** Head stage of a new pipeline; a supplier source takes its flags from `characteristics`. */
export function makeStream(
  ctor: Ctor<any>,
  sp: Spliterator<any> | null,
  supplier: (() => Spliterator<any>) | null,
  parallel: boolean,
  characteristics = 0
): any {
  const flags = sp !== null ? sourceFlags(sp) : characteristics & STREAM_FLAGS;
  return new ctor(new Source(sp, supplier, parallel), null, null, flags, null);
}

// `using s = stream` closes it, where the runtime has Symbol.dispose
const dispose = (Symbol as { dispose?: symbol }).dispose;
if (dispose !== undefined) {
  Object.defineProperty(AbstractPipeline.prototype, dispose, {
    value(this: AbstractPipeline) {
      this.close();
    },
    writable: true,
    configurable: true,
  });
}

// JIT shaping: show the bulk-loop call sites in ArraySpliterator.drainTo several sink classes up front.
// The sites then stay megamorphic, so each sink's acceptArray loop is compiled as its own unit rather
// than inlined into a caller whose inlining budget is already spent (measured up to 2x on hot loops).
{
  const noop = () => {};
  const sinks: Sink[] = [
    new ActionSink(noop),
    new ArraySink(),
    new CountSink(),
    new FoldSink(0, () => 0),
    new SumSink(),
    new CollectSink(null, noop),
    new FilterSink(new CountSink(), () => true),
    new MapSink(new CountSink(), noop),
    new PeekSink(new CountSink(), noop),
  ];
  for (const sink of sinks) {
    new ArraySpliterator([0], 0, 1, 0).drainTo(sink, false);
    new ArraySpliterator([0], 0, 1, 0).drainTo(sink, true);
  }
}
