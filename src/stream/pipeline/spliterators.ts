// Source spliterators of the stream factories. Each also implements drainTo(), which pushes straight
// into a sink without a per-element action closure: the engine's fast path.
import { requireNonNull } from '../../util/Objects';
import { BaseSpliterator, Spliterator } from '../Spliterator';
import { SpliteratorIterator } from '../Spliterators';
import { closeAfterFailure, Sink } from './Sink';

const { ORDERED, SIZED, SUBSIZED, IMMUTABLE, NONNULL, DISTINCT, SORTED } = Spliterator;

export abstract class EngineSpliterator<T> extends BaseSpliterator<T> {
  /** Pushes the remaining elements into sink; with shortCircuit, checks sink.cancelled before each. */
  abstract drainTo(sink: Sink<T>, shortCircuit: boolean): void;
}

/** Pushes every remaining element of any spliterator into sink. */
export function drain<T>(sp: Spliterator<T>, sink: Sink<T>, shortCircuit: boolean): void {
  if (sp instanceof EngineSpliterator) sp.drainTo(sink, shortCircuit);
  else if (!shortCircuit) sp.forEachRemaining((t) => sink.accept(t));
  else {
    const f = (t: T) => sink.accept(t);
    while (!sink.cancelled && sp.tryAdvance(f));
  }
}

/** Over a[lo, hi). Doesn't copy: the array is the source. */
export class EngineArraySpliterator<T> extends EngineSpliterator<T> {
  constructor(readonly a: ArrayLike<T>, private lo: number, private readonly hi: number, private readonly flags: number) {
    super();
  }
  tryAdvance(action: (t: T) => void): boolean {
    requireNonNull(action);
    if (this.lo >= this.hi) return false;
    action(this.a[this.lo++]);
    return true;
  }
  override forEachRemaining(action: (t: T) => void): void {
    requireNonNull(action);
    const a = this.a;
    const hi = this.hi;
    let i = this.lo;
    this.lo = hi;
    for (; i < hi; i++) action(a[i]);
  }
  drainTo(sink: Sink<T>, shortCircuit: boolean): void {
    const a = this.a;
    const hi = this.hi;
    let i = this.lo;
    if (shortCircuit) this.lo = sink.acceptArrayWhile(a, i, hi);
    else {
      this.lo = hi;
      sink.acceptArray(a, i, hi);
    }
  }
  override trySplit(): Spliterator<T> | null {
    const lo = this.lo;
    const mid = (lo + this.hi) >>> 1;
    return lo >= mid ? null : new EngineArraySpliterator(this.a, lo, (this.lo = mid), this.flags);
  }
  estimateSize(): number {
    return this.hi - this.lo;
  }
  characteristics(): number {
    return this.flags;
  }
}

export const ARRAY_FLAGS = ORDERED | SIZED | SUBSIZED | IMMUTABLE;

/** Integers in [lo, hi). */
export class RangeSpliterator extends EngineSpliterator<number> {
  constructor(private lo: number, private readonly hi: number) {
    super();
  }
  tryAdvance(action: (t: number) => void): boolean {
    requireNonNull(action);
    if (this.lo >= this.hi) return false;
    action(this.lo++);
    return true;
  }
  override forEachRemaining(action: (t: number) => void): void {
    requireNonNull(action);
    const hi = this.hi;
    let i = this.lo;
    this.lo = hi;
    for (; i < hi; i++) action(i);
  }
  drainTo(sink: Sink<number>, shortCircuit: boolean): void {
    const hi = this.hi;
    let i = this.lo;
    if (shortCircuit) {
      while (i < hi && !sink.cancelled) sink.accept(i++);
      this.lo = i;
    } else {
      this.lo = hi;
      for (; i < hi; i++) sink.accept(i);
    }
  }
  override trySplit(): Spliterator<number> | null {
    const lo = this.lo;
    const mid = lo + Math.floor((this.hi - lo) / 2);
    return lo >= mid ? null : new RangeSpliterator(lo, (this.lo = mid));
  }
  estimateSize(): number {
    return Math.max(0, this.hi - this.lo);
  }
  characteristics(): number {
    return ORDERED | SIZED | SUBSIZED | IMMUTABLE | NONNULL | DISTINCT | SORTED;
  }
}

/** Infinite: seed, f(seed), f(f(seed)), ... f runs only when the next element is requested. */
export class IterateSpliterator<T> extends EngineSpliterator<T> {
  private started = false;
  private prev: T | undefined = undefined;
  constructor(private readonly seed: T, private readonly f: (t: T) => T, private readonly flags: number) {
    super();
  }
  private next(): T {
    let t: T;
    if (this.started) t = this.f(this.prev as T);
    else {
      this.started = true;
      t = this.seed;
    }
    return (this.prev = t);
  }
  tryAdvance(action: (t: T) => void): boolean {
    requireNonNull(action);
    action(this.next());
    return true;
  }
  drainTo(sink: Sink<T>, shortCircuit: boolean): void {
    if (shortCircuit) while (!sink.cancelled) sink.accept(this.next());
    else for (;;) sink.accept(this.next());
  }
  estimateSize(): number {
    return Infinity;
  }
  characteristics(): number {
    return this.flags;
  }
}

/** ORDERED | IMMUTABLE, plus NONNULL for number streams. */
export const ITERATE_FLAGS = ORDERED | IMMUTABLE;
export const NUMBER_ITERATE_FLAGS = ORDERED | IMMUTABLE | NONNULL;

/** seed, next(seed), ... while hasNext holds. */
export class Iterate3Spliterator<T> extends EngineSpliterator<T> {
  private started = false;
  private finished = false;
  private prev: T | undefined = undefined;
  constructor(
    private readonly seed: T,
    private readonly hasNext: (t: T) => boolean,
    private readonly f: (t: T) => T,
    private readonly flags: number
  ) {
    super();
  }
  tryAdvance(action: (t: T) => void): boolean {
    requireNonNull(action);
    if (this.finished) return false;
    let t: T;
    if (this.started) t = this.f(this.prev as T);
    else {
      this.started = true;
      t = this.seed;
    }
    if (!this.hasNext(t)) {
      this.finished = true;
      this.prev = undefined;
      return false;
    }
    action((this.prev = t));
    return true;
  }
  drainTo(sink: Sink<T>, shortCircuit: boolean): void {
    const f = (t: T) => sink.accept(t);
    if (shortCircuit) while (!sink.cancelled && this.tryAdvance(f));
    else while (this.tryAdvance(f));
  }
  estimateSize(): number {
    return Infinity;
  }
  characteristics(): number {
    return this.flags;
  }
}

/** Infinite, unordered: s(), s(), ... */
export class GenerateSpliterator<T> extends EngineSpliterator<T> {
  constructor(private readonly s: () => T) {
    super();
  }
  tryAdvance(action: (t: T) => void): boolean {
    requireNonNull(action);
    action(this.s());
    return true;
  }
  drainTo(sink: Sink<T>, shortCircuit: boolean): void {
    if (shortCircuit) while (!sink.cancelled) sink.accept(this.s());
    else for (;;) sink.accept(this.s());
  }
  estimateSize(): number {
    return Infinity;
  }
  characteristics(): number {
    return IMMUTABLE;
  }
}

/** a's elements, then b's. */
export class ConcatSpliterator<T> extends EngineSpliterator<T> {
  private inB = false;
  private readonly flags: number;
  constructor(private readonly a: Spliterator<T>, private readonly b: Spliterator<T>) {
    super();
    const unsized = a.estimateSize() + b.estimateSize() === Infinity;
    this.flags = a.characteristics() & b.characteristics() & ~(DISTINCT | SORTED | (unsized ? SIZED | SUBSIZED : 0));
  }
  tryAdvance(action: (t: T) => void): boolean {
    if (!this.inB) {
      if (this.a.tryAdvance(action)) return true;
      this.inB = true;
    }
    return this.b.tryAdvance(action);
  }
  override forEachRemaining(action: (t: T) => void): void {
    if (!this.inB) this.a.forEachRemaining(action);
    this.inB = true;
    this.b.forEachRemaining(action);
  }
  drainTo(sink: Sink<T>, shortCircuit: boolean): void {
    if (!this.inB) {
      drain(this.a, sink, shortCircuit);
      if (shortCircuit && sink.cancelled) return;
      this.inB = true;
    }
    drain(this.b, sink, shortCircuit);
  }
  estimateSize(): number {
    return (this.inB ? 0 : this.a.estimateSize()) + this.b.estimateSize();
  }
  characteristics(): number {
    return this.flags;
  }
}

/** An exhausted or closed source: never calls the iterable again. */
const DONE: globalThis.Iterator<never> = { next: () => ({ done: true, value: undefined }) };

/**
 * Over a JS iterable; the iterator is requested on first traversal. Size unknown. Like for..of, it calls the
 * iterator's return() once if traversal stops early (a short circuit, a stage throwing in push mode, close()),
 * never after the iterator finished, and not when the iterator's own next() threw.
 */
export class IterableSpliterator<T> extends EngineSpliterator<T> {
  private it: globalThis.Iterator<T> | null = null;
  constructor(private readonly src: Iterable<T>) {
    super();
  }
  private iter(): globalThis.Iterator<T> {
    return (this.it ??= this.src[Symbol.iterator]());
  }
  // pull mode leaves the source open when a stage throws, as the reference does (a caller may go on reading);
  // the stream's close(), or for..of ending, closes it
  tryAdvance(action: (t: T) => void): boolean {
    requireNonNull(action);
    const r = this.next(this.iter());
    if (r.done) {
      this.it = DONE;
      return false;
    }
    action(r.value);
    return true;
  }
  /** it.next(); an iterator whose own next() threw is finished, so it is never closed (as for..of). */
  private next(it: globalThis.Iterator<T>): IteratorResult<T> {
    try {
      return it.next();
    } catch (e) {
      this.it = DONE;
      throw e;
    }
  }
  drainTo(sink: Sink<T>, shortCircuit: boolean): void {
    const it = this.iter();
    for (;;) {
      if (shortCircuit && sink.cancelled) return this.close();
      const r = this.next(it);
      if (r.done) {
        this.it = DONE;
        return;
      }
      try {
        sink.accept(r.value);
      } catch (e) {
        closeAfterFailure(e, this);
      }
    }
  }
  /** Closes the source iterator (iterator.return()) unless it finished or was closed already. */
  close(): void {
    const it = this.it;
    this.it = DONE;
    if (it !== null && it !== DONE) it.return?.();
  }
  estimateSize(): number {
    return Infinity;
  }
  characteristics(): number {
    return ORDERED;
  }
}

/** Late-binding: calls the supplier on first use (spliterator() of a supplier-built stream). */
export class DelegatingSpliterator<T> extends EngineSpliterator<T> {
  private sp: Spliterator<T> | null = null;
  constructor(private readonly supplier: () => Spliterator<T>) {
    super();
  }
  private get(): Spliterator<T> {
    return (this.sp ??= requireNonNull(this.supplier()));
  }
  tryAdvance(action: (t: T) => void): boolean {
    return this.get().tryAdvance(action);
  }
  override forEachRemaining(action: (t: T) => void): void {
    this.get().forEachRemaining(action);
  }
  drainTo(sink: Sink<T>, shortCircuit: boolean): void {
    drain(this.get(), sink, shortCircuit);
  }
  override trySplit(): Spliterator<T> | null {
    return this.get().trySplit();
  }
  estimateSize(): number {
    return this.get().estimateSize();
  }
  override getExactSizeIfKnown(): number {
    return this.get().getExactSizeIfKnown();
  }
  characteristics(): number {
    return this.get().characteristics();
  }
  override hasCharacteristics(characteristics: number): boolean {
    return this.get().hasCharacteristics(characteristics);
  }
  override getComparator() {
    return this.get().getComparator();
  }
}

/** PrimitiveIterator of the number streams: nextInt / nextLong / nextDouble are next(). */
export class NumberIterator extends SpliteratorIterator<number> {
  nextInt(): number {
    return this.next();
  }
  nextLong(): number {
    return this.next();
  }
  nextDouble(): number {
    return this.next();
  }
}

/** JS iterator protocol over a spliterator (what for-of on a stream uses). */
export class JsIterator<T> implements IterableIterator<T> {
  private value: T | undefined = undefined;
  private readonly take = (t: T) => {
    this.value = t;
  };
  private finished = false;
  constructor(
    private readonly sp: Spliterator<T>,
    /** Runs once, when iteration ends: exhausted, or return() (for..of break or throw). */
    private readonly onEnd?: () => void
  ) {}
  return(): IteratorResult<T> {
    this.end();
    return { value: undefined, done: true };
  }
  next(): IteratorResult<T> {
    let more: boolean;
    try {
      more = !this.finished && this.sp.tryAdvance(this.take);
    } catch (e) {
      // a stage threw: iteration is over, so the stream is closed as on break (for..of won't call return())
      closeAfterFailure(e, { close: () => this.end() });
    }
    if (more!) {
      const v = this.value as T;
      this.value = undefined;
      return { value: v, done: false };
    }
    this.end();
    return { value: undefined, done: true };
  }
  private end(): void {
    if (this.finished) return;
    this.finished = true;
    this.onEnd?.();
  }
  [Symbol.iterator](): IterableIterator<T> {
    return this;
  }
}
