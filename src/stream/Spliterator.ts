import { IllegalStateException } from '../exceptions';
import { requireNonNull } from '../util/Objects';

/**
 * Traverses and partitions the elements of a source: the low-level protocol behind streams. It hands out elements
 * one at a time (`tryAdvance`) or all at once (`forEachRemaining`), may split off part of its elements
 * (`trySplit`), and describes the source with a size estimate and characteristic flags (the constants on the
 * `Spliterator` value). A spliterator is single use and not meant to be shared. Sizes are numbers; an unknown size
 * is reported as `Infinity` (the reference uses `Long.MAX_VALUE`). Build a stream over one with {@link StreamSupport}.
 */
export interface Spliterator<T> {
  /**
   * Calls `action` with the next element if one remains.
   * @returns `true` if an element was passed to `action`, `false` when no elements remain
   * @throws {@link NullPointerException} if action is null
   */
  tryAdvance(action: (t: T) => void): boolean;
  /**
   * Calls `action` for every remaining element, in encounter order when ORDERED. Usually faster than a
   * `tryAdvance` loop; afterwards no elements remain.
   * @throws {@link NullPointerException} if action is null
   */
  forEachRemaining(action: (t: T) => void): void;
  /**
   * Splits off a prefix of the remaining elements into a new spliterator and keeps the rest, or returns `null` if it
   * cannot (or will not) split. Together the pieces cover the elements exactly once, in order. Streams run
   * sequentially and never call it.
   */
  trySplit(): Spliterator<T> | null;
  /** Returns the estimated number of remaining elements: exact when SIZED, `Infinity` if unknown or too expensive to compute. */
  estimateSize(): number;
  /** Returns `estimateSize()` if SIZED, else `-1`. */
  getExactSizeIfKnown(): number;
  /** Returns the bitwise OR of the characteristic flags (`Spliterator.ORDERED`, `Spliterator.SIZED`, …). */
  characteristics(): number;
  /** Returns `true` if all the flags in `characteristics` are set. */
  hasCharacteristics(characteristics: number): boolean;
  /**
   * Returns the source's comparator if SORTED (`null` means natural ordering).
   * @throws {@link IllegalStateException} if not SORTED
   */
  getComparator(): SourceComparator<T> | null;
}

/**
 * Comparator typed with method-style (bivariant) parameters, so a `Spliterator<T>` stays covariant in `T`
 * like the reference's `Comparator<? super T>`; a plain function type would make every Collection invariant.
 */
export type SourceComparator<T> = {
  /** Compares `a` with `b`: negative if `a` sorts first, positive if `b` does, zero if they are equal. */
  bivarianceHack(a: T, b: T): number;
}['bivarianceHack'];

/**
 * Characteristic flags (same bit values as the reference), combined with bitwise OR. Report only flags that are
 * true: the stream engine trusts them (`distinct()` on a DISTINCT source and `count()` on a SIZED one skip work).
 */
export const Spliterator = {
  /** No two elements are `equals`. */
  DISTINCT: 0x00000001,
  /** Elements follow `getComparator()` (or natural order); implies ORDERED. */
  SORTED: 0x00000004,
  /** Elements have a defined encounter order. */
  ORDERED: 0x00000010,
  /** `estimateSize()` is exact before traversal. */
  SIZED: 0x00000040,
  /** No element is `null`. */
  NONNULL: 0x00000100,
  /** The source cannot change during traversal. */
  IMMUTABLE: 0x00000400,
  /** The source may change safely during traversal. */
  CONCURRENT: 0x00001000,
  /** Every spliterator `trySplit()` returns is SIZED and SUBSIZED too. */
  SUBSIZED: 0x00004000,
} as const;

/** Primitive spliterator type names, as members of Spliterator (types only: they carry numbers). */
// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace Spliterator {
  /** A spliterator of numbers; the same as `Spliterator<T>`. */
  type OfPrimitive<T = number> = Spliterator<T>;
  /** A spliterator of an int source; the same as `Spliterator<number>`. */
  type OfInt = Spliterator<number>;
  /** A spliterator of a long source; the same as `Spliterator<number>`. */
  type OfLong = Spliterator<number>;
  /** A spliterator of a double source; the same as `Spliterator<number>`. */
  type OfDouble = Spliterator<number>;
}

/** Primitive spliterators carry numbers; the aliases keep the reference names. */
export type IntSpliterator = Spliterator<number>;
export type LongSpliterator = Spliterator<number>;
export type DoubleSpliterator = Spliterator<number>;

/**
 * Convenience base: subclasses implement tryAdvance, estimateSize and characteristics.
 * Defaults: forEachRemaining loops tryAdvance, trySplit returns null, getComparator throws unless SORTED.
 */
export abstract class BaseSpliterator<T> implements Spliterator<T> {
  abstract tryAdvance(action: (t: T) => void): boolean;
  abstract estimateSize(): number;
  abstract characteristics(): number;

  forEachRemaining(action: (t: T) => void): void {
    requireNonNull(action);
    while (this.tryAdvance(action));
  }

  trySplit(): Spliterator<T> | null {
    return null;
  }

  getExactSizeIfKnown(): number {
    return (this.characteristics() & Spliterator.SIZED) === 0 ? -1 : this.estimateSize();
  }

  hasCharacteristics(characteristics: number): boolean {
    return (this.characteristics() & characteristics) === characteristics;
  }

  getComparator(): SourceComparator<T> | null {
    if (this.hasCharacteristics(Spliterator.SORTED)) return null;
    throw new IllegalStateException();
  }
}
