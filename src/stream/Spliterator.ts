import { IllegalStateException } from '../exceptions';
import { requireNonNull } from '../util/Objects';

/**
 * Traverses and partitions the elements of a source: the low-level protocol behind streams.
 * Sizes are numbers; an unknown size is reported as Infinity (the reference uses Long.MAX_VALUE).
 */
export interface Spliterator<T> {
  /** Performs action on the next element if one exists. @returns false when no elements remain */
  tryAdvance(action: (t: T) => void): boolean;
  forEachRemaining(action: (t: T) => void): void;
  /** Splits off a prefix of the elements, or returns null if it can't (or won't) split. */
  trySplit(): Spliterator<T> | null;
  /** Estimated number of remaining elements; Infinity if unknown or too expensive to compute. */
  estimateSize(): number;
  /** estimateSize() if SIZED, else -1. */
  getExactSizeIfKnown(): number;
  /** Bitwise OR of the characteristic flags below. */
  characteristics(): number;
  hasCharacteristics(characteristics: number): boolean;
  /** The source's comparator if SORTED (null means natural ordering). @throws IllegalStateException if not SORTED */
  getComparator(): SourceComparator<T> | null;
}

/**
 * Comparator typed with method-style (bivariant) parameters, so a Spliterator<T> stays covariant in T
 * like the reference's Comparator<? super T>; a plain function type would make every Collection invariant.
 */
export type SourceComparator<T> = { bivarianceHack(a: T, b: T): number }['bivarianceHack'];

/** Characteristic flags (same bit values as the reference). */
export const Spliterator = {
  DISTINCT: 0x00000001,
  SORTED: 0x00000004,
  ORDERED: 0x00000010,
  SIZED: 0x00000040,
  NONNULL: 0x00000100,
  IMMUTABLE: 0x00000400,
  CONCURRENT: 0x00001000,
  SUBSIZED: 0x00004000,
} as const;

/** Primitive spliterator type names, as members of Spliterator (types only: they carry numbers). */
// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace Spliterator {
  type OfPrimitive<T = number> = Spliterator<T>;
  type OfInt = Spliterator<number>;
  type OfLong = Spliterator<number>;
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
