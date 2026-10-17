import { ArrayIndexOutOfBoundsException, ConcurrentModificationException, NoSuchElementException, UnsupportedOperationException } from '../exceptions';
import type { Collection } from '../interfaces/Collection';
import type { Iterator } from '../interfaces/Iterator';
import { requireNonNull } from '../util/Objects';
import { BaseSpliterator, SourceComparator, Spliterator } from './Spliterator';

/** First batch size of an iterator-backed trySplit; each later split takes this many more. @internal */
export const BATCH_UNIT = 1 << 10;
/** Largest batch an iterator-backed trySplit copies out. @internal */
export const MAX_BATCH = 1 << 25;

const SIZED = Spliterator.SIZED;
const SUBSIZED = Spliterator.SUBSIZED;
const SORTED = Spliterator.SORTED;

/**
 * Spliterator over array[index, fence). Splits in halves. Reports exactly `chars` (callers add SIZED|SUBSIZED);
 * with unknownSize it is a batch of an unsized source: estimateSize() is Infinity.
 * @internal
 */
export class ArraySpliterator<T> extends BaseSpliterator<T> {
  constructor(
    private readonly array: ArrayLike<T>,
    private index: number,
    private readonly fence: number,
    private readonly chars: number,
    private readonly cmp: SourceComparator<T> | null = null,
    private readonly unknownSize = false
  ) {
    super();
  }

  tryAdvance(action: (t: T) => void): boolean {
    requireNonNull(action);
    const i = this.index;
    if (i >= this.fence) return false;
    this.index = i + 1;
    action(this.array[i]);
    return true;
  }

  override forEachRemaining(action: (t: T) => void): void {
    requireNonNull(action);
    const a = this.array;
    const hi = this.fence;
    let i = this.index;
    this.index = hi;
    for (; i < hi; i++) action(a[i]);
  }

  override trySplit(): Spliterator<T> | null {
    const lo = this.index;
    const mid = (lo + this.fence) >>> 1;
    if (lo >= mid) return null;
    this.index = mid;
    return new ArraySpliterator(this.array, lo, mid, this.chars, this.cmp, this.unknownSize);
  }

  estimateSize(): number {
    return this.unknownSize ? Infinity : this.fence - this.index;
  }

  characteristics(): number {
    return this.chars;
  }

  override getComparator(): SourceComparator<T> | null {
    if ((this.chars & SORTED) !== 0) return this.cmp;
    return super.getComparator();
  }
}

/** What an iterator-backed spliterator reads its elements and size from. */
export interface SpliteratorSource<T> {
  iterator(): Iterator<T>;
  size(): number;
}

/** Extras for the hash and tree sources, which mirror the reference's dedicated spliterators. @internal */
export interface SourceOptions<T> {
  /** Checked after forEachRemaining and after each tryAdvance: ConcurrentModificationException when it moved. */
  modCounter?: { modCount: number };
  /** SIZED is dropped once split (the reference's hash/tree spliterators only know their size unsplit). */
  sizedOnlyUnsplit?: boolean;
  /** Comparator reported for SORTED (null = natural ordering). */
  comparator?: SourceComparator<T> | null;
  /** Never call source.size(): the estimate is Infinity (for sources whose size is costly, like tree range views). */
  unknownSize?: boolean;
  /** Traversal leaves the estimate alone (only trySplit lowers it), as the reference's iterator and hash spliterators do. */
  keepEstimate?: boolean;
}

/** Options of the reference's plain iterator spliterator. @internal */
export const KEEP_ESTIMATE: SourceOptions<never> = Object.freeze({ keepEstimate: true });

/**
 * Spliterator over an iterator: either a collection's, created at first use (late-binding), or a given one.
 * Splits by copying out growing batches into ArraySpliterators, like the reference. Traversal counts the estimate
 * down unless opts.keepEstimate.
 * @internal
 */
export class IteratorSpliterator<T> extends BaseSpliterator<T> {
  private batch = 0;
  private expectedModCount = 0;
  private split = false;

  /** source != null: bind to source.iterator()/size() on first use; otherwise traverse `it`, sized `est` (Infinity = unknown). */
  constructor(
    private readonly source: SpliteratorSource<T> | null,
    private it: Iterator<T> | null,
    private est: number,
    private readonly chars: number,
    private readonly opts: SourceOptions<T> = {}
  ) {
    super();
  }

  private bind(): Iterator<T> {
    let it = this.it;
    if (it === null) {
      const s = this.source!;
      it = this.it = s.iterator();
      this.est = this.opts.unknownSize ? Infinity : s.size();
      if (this.opts.modCounter) this.expectedModCount = this.opts.modCounter.modCount;
    }
    return it;
  }

  private checkMod(): void {
    const mc = this.opts.modCounter;
    if (mc !== undefined && mc.modCount !== this.expectedModCount) throw new ConcurrentModificationException();
  }

  tryAdvance(action: (t: T) => void): boolean {
    requireNonNull(action);
    const it = this.bind();
    if (!it.hasNext()) return false;
    if (this.est > 0 && !this.opts.keepEstimate) this.est--;
    action(it.next());
    this.checkMod();
    return true;
  }

  override forEachRemaining(action: (t: T) => void): void {
    requireNonNull(action);
    const it = this.bind();
    while (it.hasNext()) action(it.next());
    if (this.est !== Infinity && !this.opts.keepEstimate) this.est = 0;
    this.checkMod();
  }

  override trySplit(): Spliterator<T> | null {
    const it = this.bind();
    const s = this.est;
    if (s > 1 && it.hasNext()) {
      const n = Math.min(this.batch + BATCH_UNIT, s, MAX_BATCH);
      const a: T[] = [];
      let j = 0;
      do a.push(it.next());
      while (++j < n && it.hasNext());
      this.batch = j;
      this.split = true;
      const cmp = this.opts.comparator ?? null;
      if (s !== Infinity) {
        this.est = s - j;
        const piece = this.opts.sizedOnlyUnsplit ? this.chars & ~(SIZED | SUBSIZED) : this.chars | SIZED | SUBSIZED;
        return new ArraySpliterator(a, 0, j, piece, cmp);
      }
      return new ArraySpliterator(a, 0, j, this.chars & ~(SIZED | SUBSIZED), cmp, true);
    }
    return null;
  }

  estimateSize(): number {
    this.bind();
    return this.est;
  }

  characteristics(): number {
    return this.split && this.opts.sizedOnlyUnsplit ? this.chars & ~SIZED : this.chars;
  }

  override getComparator(): SourceComparator<T> | null {
    if ((this.chars & SORTED) !== 0) return this.opts.comparator ?? null;
    return super.getComparator();
  }
}

/**
 * Index-based, late-binding, fail-fast spliterator over an owner's backing array (ArrayList, PriorityQueue).
 * The array is read from the owner at first use; ConcurrentModificationException if owner.modCount moved.
 * @internal
 */
export class OwnedArraySpliterator<T> extends BaseSpliterator<T> {
  private a: readonly T[] | null = null;

  constructor(
    private readonly owner: { modCount: number },
    private readonly arrayOf: () => readonly T[],
    private readonly chars: number,
    private index = 0,
    private fence = -1,
    private expectedModCount = 0
  ) {
    super();
  }

  private getFence(): number {
    let hi = this.fence;
    if (hi < 0) {
      this.a = this.arrayOf();
      this.expectedModCount = this.owner.modCount;
      hi = this.fence = this.a.length;
    }
    return hi;
  }

  override trySplit(): Spliterator<T> | null {
    const hi = this.getFence();
    const lo = this.index;
    const mid = (lo + hi) >>> 1;
    if (lo >= mid) return null;
    this.index = mid;
    const s = new OwnedArraySpliterator(this.owner, this.arrayOf, this.chars, lo, mid, this.expectedModCount);
    s.a = this.a;
    return s;
  }

  tryAdvance(action: (t: T) => void): boolean {
    requireNonNull(action);
    const hi = this.getFence();
    const i = this.index;
    if (i >= hi) return false;
    const a = this.a!;
    if (i >= a.length) throw new ConcurrentModificationException();
    this.index = i + 1;
    action(a[i]);
    if (this.owner.modCount !== this.expectedModCount) throw new ConcurrentModificationException();
    return true;
  }

  override forEachRemaining(action: (t: T) => void): void {
    requireNonNull(action);
    const hi = this.getFence();
    const a = this.a!;
    let i = this.index;
    this.index = hi;
    // the length guard keeps a shrinking array from yielding phantom undefineds; any change is reported below
    for (; i < hi && hi <= a.length; i++) action(a[i]);
    if (i < hi || this.owner.modCount !== this.expectedModCount) throw new ConcurrentModificationException();
  }

  estimateSize(): number {
    return this.getFence() - this.index;
  }

  characteristics(): number {
    return this.chars;
  }
}

/** Spliterator with one element (or none); reports what the reference's singleton collections report. @internal */
export class SingletonSpliterator<T> extends BaseSpliterator<T> {
  private est = 1;
  constructor(private readonly element: T) {
    super();
  }
  tryAdvance(action: (t: T) => void): boolean {
    requireNonNull(action);
    if (this.est <= 0) return false;
    this.est = 0;
    action(this.element);
    return true;
  }
  estimateSize(): number {
    return this.est;
  }
  characteristics(): number {
    return (
      (this.element != null ? Spliterator.NONNULL : 0) |
      SIZED |
      SUBSIZED |
      Spliterator.IMMUTABLE |
      Spliterator.DISTINCT |
      Spliterator.ORDERED
    );
  }
}

class EmptySpliterator<T> extends BaseSpliterator<T> {
  tryAdvance(action: (t: T) => void): boolean {
    requireNonNull(action);
    return false;
  }
  override forEachRemaining(action: (t: T) => void): void {
    requireNonNull(action);
  }
  estimateSize(): number {
    return 0;
  }
  characteristics(): number {
    return SIZED | SUBSIZED;
  }
}

const EMPTY: Spliterator<never> = new EmptySpliterator<never>();

/**
 * Spliterators.AbstractSpliterator: subclasses implement tryAdvance only. trySplit copies out
 * growing batches (1024, 2048, ... up to 2^25 elements) into an array-backed spliterator.
 */
abstract class AbstractSpliteratorImpl<T> extends BaseSpliterator<T> {
  private readonly chars: number;
  private est: number;
  private batch = 0;

  /** @param est estimated size (Infinity if unknown); @param additionalCharacteristics SIZED implies SUBSIZED */
  protected constructor(est: number, additionalCharacteristics: number) {
    super();
    this.est = est;
    this.chars = (additionalCharacteristics & SIZED) !== 0 ? additionalCharacteristics | SUBSIZED : additionalCharacteristics;
  }

  override trySplit(): Spliterator<T> | null {
    let held: T | undefined;
    const hold = (t: T) => {
      held = t;
    };
    const s = this.est;
    if (s > 1 && this.tryAdvance(hold)) {
      const n = Math.min(this.batch + BATCH_UNIT, s, MAX_BATCH);
      const a: T[] = [];
      let j = 0;
      do a.push(held as T);
      while (++j < n && this.tryAdvance(hold));
      this.batch = j;
      if (s !== Infinity) {
        this.est = s - j;
        return new ArraySpliterator(a, 0, j, this.chars | SIZED | SUBSIZED);
      }
      return new ArraySpliterator(a, 0, j, this.chars & ~(SIZED | SUBSIZED), null, true);
    }
    return null;
  }

  estimateSize(): number {
    return this.est;
  }

  characteristics(): number {
    return this.chars;
  }
}

/** AbstractSpliterator over numbers; the primitive variants behave the same. */
abstract class AbstractIntSpliteratorImpl extends AbstractSpliteratorImpl<number> {}
abstract class AbstractLongSpliteratorImpl extends AbstractSpliteratorImpl<number> {}
abstract class AbstractDoubleSpliteratorImpl extends AbstractSpliteratorImpl<number> {}

function checkFromToBounds(length: number, origin: number, fence: number): void {
  if (origin > fence) throw new ArrayIndexOutOfBoundsException(`origin(${origin}) > fence(${fence})`);
  if (origin < 0) throw new ArrayIndexOutOfBoundsException(`Array index out of range: ${origin}`);
  if (fence > length) throw new ArrayIndexOutOfBoundsException(`Array index out of range: ${fence}`);
}

function isCollection(o: unknown): o is Collection<unknown> {
  return typeof (o as Collection<unknown>).iterator === 'function' && typeof (o as Collection<unknown>).size === 'function';
}

class SpliteratorIterator<T> implements Iterator<T> {
  private ready = false;
  private nextElement: T | undefined = undefined;
  constructor(private readonly s: Spliterator<T>) {}
  hasNext(): boolean {
    if (!this.ready)
      this.s.tryAdvance((t) => {
        this.ready = true;
        this.nextElement = t;
      });
    return this.ready;
  }
  next(): T {
    if (!this.ready && !this.hasNext()) throw new NoSuchElementException();
    this.ready = false;
    const t = this.nextElement as T;
    this.nextElement = undefined;
    return t;
  }
  remove(): void {
    throw new UnsupportedOperationException('remove');
  }
  forEachRemaining(action: (t: T) => void): void {
    requireNonNull(action);
    if (this.ready) {
      this.ready = false;
      const t = this.nextElement as T;
      this.nextElement = undefined;
      action(t);
    }
    this.s.forEachRemaining(action);
  }
}

/** Static factories for spliterators and the AbstractSpliterator base class. */
export class Spliterators {
  private constructor() {}

  /** Base class for spliterators that only implement tryAdvance; see AbstractSpliteratorImpl. */
  static readonly AbstractSpliterator = AbstractSpliteratorImpl;
  static readonly AbstractIntSpliterator = AbstractIntSpliteratorImpl;
  static readonly AbstractLongSpliterator = AbstractLongSpliteratorImpl;
  static readonly AbstractDoubleSpliterator = AbstractDoubleSpliteratorImpl;

  /** Empty spliterator: SIZED|SUBSIZED, never splits. */
  static emptySpliterator<T>(): Spliterator<T> {
    return EMPTY;
  }
  static emptyIntSpliterator(): Spliterator<number> {
    return EMPTY;
  }
  static emptyLongSpliterator(): Spliterator<number> {
    return EMPTY;
  }
  static emptyDoubleSpliterator(): Spliterator<number> {
    return EMPTY;
  }

  /**
   * spliterator(array, characteristics) / spliterator(array, fromIndex, toIndex, characteristics):
   * over the array (range), reporting characteristics | SIZED | SUBSIZED, splitting in halves.
   * @throws ArrayIndexOutOfBoundsException for a bad range
   *
   * spliterator(collection, characteristics): late-binding over collection.iterator(), sized by
   * collection.size(); adds SIZED | SUBSIZED unless CONCURRENT is given.
   *
   * spliterator(iterator, size, characteristics): over the iterator, sized by size; adds SIZED | SUBSIZED unless CONCURRENT.
   */
  static spliterator<T>(array: ArrayLike<T>, characteristics: number): Spliterator<T>;
  static spliterator<T>(array: ArrayLike<T>, fromIndex: number, toIndex: number, characteristics: number): Spliterator<T>;
  static spliterator<T>(collection: Collection<T>, characteristics: number): Spliterator<T>;
  static spliterator<T>(iterator: Iterator<T>, size: number, characteristics: number): Spliterator<T>;
  static spliterator<T>(src: ArrayLike<T> | Collection<T> | Iterator<T>, a: number, b?: number, c?: number): Spliterator<T> {
    requireNonNull(src);
    if (arguments.length >= 4) {
      const array = src as ArrayLike<T>;
      checkFromToBounds(array.length, a, b as number);
      return new ArraySpliterator(array, a, b as number, (c as number) | SIZED | SUBSIZED);
    }
    if (arguments.length === 3) {
      const ch = b as number;
      return new IteratorSpliterator(null, src as Iterator<T>, a, (ch & Spliterator.CONCURRENT) === 0 ? ch | SIZED | SUBSIZED : ch, KEEP_ESTIMATE);
    }
    if (isCollection(src)) {
      return new IteratorSpliterator(src as Collection<T>, null, -1, (a & Spliterator.CONCURRENT) === 0 ? a | SIZED | SUBSIZED : a, KEEP_ESTIMATE);
    }
    const array = src as ArrayLike<T>;
    return new ArraySpliterator(array, 0, array.length, a | SIZED | SUBSIZED);
  }

  /** Over the iterator, with no size: SIZED and SUBSIZED are cleared, estimateSize() is Infinity. */
  static spliteratorUnknownSize<T>(iterator: Iterator<T>, characteristics: number): Spliterator<T> {
    return new IteratorSpliterator(null, requireNonNull(iterator), Infinity, characteristics & ~(SIZED | SUBSIZED), KEEP_ESTIMATE);
  }

  /** Iterator over the spliterator's remaining elements (remove() unsupported). */
  static iterator<T>(spliterator: Spliterator<T>): Iterator<T> {
    return new SpliteratorIterator(requireNonNull(spliterator));
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace Spliterators {
  type AbstractSpliterator<T> = AbstractSpliteratorImpl<T>;
  type AbstractIntSpliterator = AbstractIntSpliteratorImpl;
  type AbstractLongSpliterator = AbstractLongSpliteratorImpl;
  type AbstractDoubleSpliterator = AbstractDoubleSpliteratorImpl;
}

/**
 * Late-binding, fail-fast spliterator over a hash table's iterator, with the reference's hash
 * spliterator characteristics: (DISTINCT) | SIZED, SIZED dropped once split. @internal
 */
export function hashSpliterator<T>(source: SpliteratorSource<T>, owner: { modCount: number }, distinct: boolean): Spliterator<T> {
  return new IteratorSpliterator(source, null, -1, (distinct ? Spliterator.DISTINCT : 0) | SIZED, { modCounter: owner, sizedOnlyUnsplit: true, keepEstimate: true });
}
