import { NoSuchElementException } from '../exceptions';
import { formatDouble } from '../util/formatDouble';
import { INSPECT, equals, hashCode, requireNonNull, toString } from '../util/Objects';
import { streamFactories } from './hook';
import { BaseSpliterator, Spliterator } from './Spliterator';
import type { DoubleStream, IntStream, LongStream, Stream } from './Stream';

const NO_VALUE = 'No value present';

/** One-element (or empty) spliterator backing Optional*.stream(): what Stream.of(x) / Stream.empty() report. */
class SingleSpliterator<T> extends BaseSpliterator<T> {
  private readonly chars: number;
  constructor(private value: T, private remaining: number) {
    super();
    this.chars = Spliterator.SIZED | Spliterator.SUBSIZED | (remaining > 0 ? Spliterator.ORDERED | Spliterator.IMMUTABLE : 0);
  }
  tryAdvance(action: (t: T) => void): boolean {
    requireNonNull(action);
    if (this.remaining === 0) return false;
    this.remaining = 0;
    action(this.value);
    return true;
  }
  estimateSize(): number {
    return this.remaining;
  }
  characteristics(): number {
    return this.chars;
  }
}

const f64 = new Float64Array(1);
const i32 = new Int32Array(f64.buffer);

/** Double.hashCode: high word XOR low word of the bits, NaN canonicalized. */
function doubleHash(x: number): number {
  if (x !== x) return 0x7ff80000;
  f64[0] = x;
  return i32[0] ^ i32[1];
}

const OPTIONAL_BRAND: unique symbol = Symbol.for('@ylcnfrht/typescript-collection-framework.Optional');

/** o is an optional of the given kind ('Optional', 'OptionalInt', ...), from this or another copy of the library. */
function isOptional(o: unknown, kind: string): o is { present: boolean; value: any } {
  return (o as { [OPTIONAL_BRAND]?: string } | null)?.[OPTIONAL_BRAND] === kind;
}

/** What Optional and the number optionals share: presence, the orElse family, ifPresent. */
abstract class OptionalBase<T> {
  /**
   * Creates an optional; subclasses expose static factories instead.
   * @param value - the held value (ignored when `present` is false)
   * @param present - whether a value is held
   */
  protected constructor(protected readonly value: T, protected readonly present: boolean) {}

  /** The class name used by `toString()` and cross-copy `equals()`: `Optional`, `OptionalInt`, … */
  protected abstract readonly typeName: string;

  /** @internal the kind, shared by every loaded copy of the library */
  get [OPTIONAL_BRAND](): string {
    return this.typeName;
  }

  /** Returns `true` if a value is present. */
  isPresent(): boolean {
    return this.present;
  }

  /** Returns `true` if no value is present. */
  isEmpty(): boolean {
    return !this.present;
  }

  /**
   * Calls `action` with the value if one is present; otherwise does nothing.
   * @throws {@link NullPointerException} if a value is present and action is null
   */
  ifPresent(action: (value: T) => void): void {
    if (this.present) requireNonNull(action)(this.value);
  }

  /**
   * Calls `action` with the value if one is present, otherwise calls `emptyAction`.
   * @throws {@link NullPointerException} if the function that would be called is null
   */
  ifPresentOrElse(action: (value: T) => void, emptyAction: () => void): void {
    if (this.present) requireNonNull(action)(this.value);
    else requireNonNull(emptyAction)();
  }

  /** Returns the value if present, otherwise `other` (evaluated eagerly, even when a value is present). */
  orElse(other: T): T;
  /** Returns the value if present, otherwise `other`; a `null` fallback gives `T | null`. */
  orElse(other: T | null): T | null;
  orElse(other: T | null): T | null {
    return this.present ? this.value : other;
  }

  /**
   * Returns the value if present, otherwise `supplier()` (called only when empty).
   * @throws {@link NullPointerException} if empty and supplier is null
   */
  orElseGet(supplier: () => T): T;
  /**
   * Returns the value if present, otherwise `supplier()`, which may return `null`.
   * @throws {@link NullPointerException} if empty and supplier is null
   */
  orElseGet(supplier: () => T | null): T | null;
  orElseGet(supplier: () => T | null): T | null {
    return this.present ? this.value : requireNonNull(supplier)();
  }

  /**
   * Returns the value if present; otherwise throws {@link NoSuchElementException} ("No value present") without an
   * argument, or the error `exceptionSupplier()` returns.
   * @throws {@link NoSuchElementException} if empty and no supplier is given
   * @throws {@link NullPointerException} if empty and the supplier, or the error it returns, is null
   */
  orElseThrow(exceptionSupplier?: () => unknown): T {
    if (this.present) return this.value;
    if (arguments.length === 0) throw new NoSuchElementException(NO_VALUE);
    throw requireNonNull(requireNonNull(exceptionSupplier)());
  }

  /** Returns `toString()`, so Node's `console.log` and `util.inspect` print the optional the same way. */
  [INSPECT](): string {
    return this.toString();
  }
}

/**
 * A container that may or may not hold a non-null value; `null` and `undefined` both mean "absent". Returned by
 * stream operations that may have no result (`findFirst`, `min`, `max`, `reduce(op)`, `Collectors.minBy`).
 * Instances are immutable; the empty optional is a shared instance.
 */
export class Optional<T> extends OptionalBase<T> {
  // any: the single empty instance serves every element type
  private static readonly EMPTY: Optional<any> = new Optional<any>(undefined, false);

  private constructor(value: T, present: boolean) {
    super(value, present);
  }

  /** Returns `'Optional'`, the name `toString()` prints. */
  protected get typeName(): string {
    return 'Optional';
  }

  /** Returns the empty optional (a shared instance). */
  static empty<T>(): Optional<T> {
    return Optional.EMPTY;
  }

  /**
   * Returns an optional holding `value`.
   * @throws {@link NullPointerException} if value is null or undefined
   */
  static of<T>(value: T): Optional<NonNullable<T>> {
    return new Optional(requireNonNull(value), true);
  }

  /** Returns an optional holding `value`, or the empty optional when `value` is `null` or `undefined`. */
  static ofNullable<T>(value: T | null | undefined): Optional<NonNullable<T>> {
    return value === null || value === undefined ? Optional.EMPTY : new Optional(value as NonNullable<T>, true);
  }

  /**
   * Returns the value.
   * @throws {@link NoSuchElementException} ("No value present") if empty
   */
  get(): T {
    if (!this.present) throw new NoSuchElementException(NO_VALUE);
    return this.value;
  }

  /**
   * Returns this optional if it is empty or `predicate(value)` holds, otherwise the empty optional.
   * @throws {@link NullPointerException} if predicate is null, even when empty
   */
  filter(predicate: (value: T) => boolean): Optional<T> {
    requireNonNull(predicate);
    return !this.present || predicate(this.value) ? this : Optional.EMPTY;
  }

  /**
   * Returns `Optional.ofNullable(mapper(value))` if a value is present (empty when the mapper returns
   * `null`/`undefined`), otherwise the empty optional.
   * @throws {@link NullPointerException} if mapper is null, even when empty
   */
  map<U>(mapper: (value: T) => U | null | undefined): Optional<NonNullable<U>> {
    requireNonNull(mapper);
    return this.present ? Optional.ofNullable(mapper(this.value)) : Optional.EMPTY;
  }

  /**
   * Returns `mapper(value)` if a value is present, otherwise the empty optional. The mapper must return an optional.
   * @throws {@link NullPointerException} if mapper is null (even when empty) or returns null
   */
  flatMap<U>(mapper: (value: T) => Optional<U>): Optional<U> {
    requireNonNull(mapper);
    return this.present ? requireNonNull(mapper(this.value)) : Optional.EMPTY;
  }

  /**
   * Returns this optional if a value is present, otherwise the optional `supplier()` returns.
   * @throws {@link NullPointerException} if supplier is null (even when present) or returns null
   */
  or(supplier: () => Optional<T>): Optional<T> {
    requireNonNull(supplier);
    return this.present ? this : requireNonNull(supplier());
  }

  /** Returns a {@link Stream} of the value, or an empty stream; `flatMap(o => o.stream())` drops empty optionals. */
  stream(): Stream<T> {
    return streamFactories().stream(new SingleSpliterator(this.value, this.present ? 1 : 0), false);
  }

  /** Returns `true` if `o` is an `Optional` and both are empty or both hold equal values (by `equals` semantics). */
  equals(o: unknown): boolean {
    if (o === this) return true;
    // by brand, not instanceof: equal across two loaded copies of the library (CJS and ESM in one process)
    if (!isOptional(o, 'Optional')) return false;
    return o.present === this.present && equals(this.value, o.value);
  }

  /** Returns the value's hash code, or `0` when empty. */
  hashCode(): number {
    return this.present ? hashCode(this.value) : 0;
  }

  /** Returns `Optional[value]`, or `Optional.empty`. */
  override toString(): string {
    return this.present ? `Optional[${toString(this.value)}]` : 'Optional.empty';
  }
}

/**
 * Shared implementation of OptionalInt / OptionalLong / OptionalDouble.
 * `same` decides value equality (doubles compare like Double.compare: NaN equals NaN, -0 differs from 0).
 */
abstract class NumberOptional extends OptionalBase<number> {

  /** Returns the number stream of this optional's kind over `spliterator`. */
  protected abstract streamOf(spliterator: Spliterator<number>): unknown;

  /**
   * Returns the value.
   * @throws {@link NoSuchElementException} ("No value present") if empty
   */
  protected getValue(): number {
    if (!this.present) throw new NoSuchElementException(NO_VALUE);
    return this.value;
  }

  /**
   * Returns `true` if `o` is the same kind of number optional and both are empty or both hold the same number.
   * For `OptionalDouble`, `NaN` equals `NaN` and `-0` differs from `0`.
   */
  equals(o: unknown): boolean {
    if (o === this) return true;
    if (!isOptional(o, this.typeName) || o.present !== this.present) return false;
    return !this.present || Object.is(this.value, o.value) || (this.typeName !== 'OptionalDouble' && this.value === o.value);
  }

  /** Returns the hash code the reference gives the boxed value (int, long or double hash); `0` when empty. */
  hashCode(): number {
    if (!this.present) return 0;
    const v = this.value;
    if (this.typeName === 'OptionalDouble') return doubleHash(v);
    // Long.hashCode: low word XOR high word (two's complement)
    if (this.typeName === 'OptionalLong' && Number.isInteger(v)) return (v | 0) ^ (Math.floor(v / 4294967296) | 0);
    return hashCode(v);
  }

  /** Returns `OptionalInt[5]` (and so on), or `OptionalInt.empty`; doubles print as the reference prints them (`1.0`, `1.0E21`). */
  override toString(): string {
    if (!this.present) return `${this.typeName}.empty`;
    return `${this.typeName}[${this.typeName === 'OptionalDouble' ? formatDouble(this.value) : String(this.value)}]`;
  }

  /** Returns a spliterator over the value (one element), or an empty one. */
  protected spliterator(): Spliterator<number> {
    return new SingleSpliterator(this.value, this.present ? 1 : 0);
  }
}

/** An optional `number` returned by {@link IntStream} operations such as `min()` and `findFirst()`. Immutable. */
export class OptionalInt extends NumberOptional {
  private static readonly EMPTY = new OptionalInt(0, false);
  /** `'OptionalInt'`, the name `toString()` prints. */
  protected readonly typeName = 'OptionalInt';
  private constructor(value: number, present: boolean) {
    super(value, present);
  }
  /** Returns the empty optional (a shared instance). */
  static empty(): OptionalInt {
    return OptionalInt.EMPTY;
  }
  /** Returns an optional holding `value`. */
  static of(value: number): OptionalInt {
    return new OptionalInt(value, true);
  }
  /**
   * Returns the value.
   * @throws {@link NoSuchElementException} ("No value present") if empty
   */
  getAsInt(): number {
    return this.getValue();
  }
  /** Returns an {@link IntStream} of the value, or an empty stream. */
  stream(): IntStream {
    return this.streamOf(this.spliterator());
  }
  /** Returns a {@link IntStream} over `s`. */
  protected streamOf(s: Spliterator<number>): IntStream {
    return streamFactories().intStream(s, false);
  }
}

/** An optional `number` returned by {@link LongStream} operations such as `min()` and `findFirst()`. Immutable. */
export class OptionalLong extends NumberOptional {
  private static readonly EMPTY = new OptionalLong(0, false);
  /** `'OptionalLong'`, the name `toString()` prints. */
  protected readonly typeName = 'OptionalLong';
  private constructor(value: number, present: boolean) {
    super(value, present);
  }
  /** Returns the empty optional (a shared instance). */
  static empty(): OptionalLong {
    return OptionalLong.EMPTY;
  }
  /** Returns an optional holding `value`. */
  static of(value: number): OptionalLong {
    return new OptionalLong(value, true);
  }
  /**
   * Returns the value.
   * @throws {@link NoSuchElementException} ("No value present") if empty
   */
  getAsLong(): number {
    return this.getValue();
  }
  /** Returns an {@link LongStream} of the value, or an empty stream. */
  stream(): LongStream {
    return this.streamOf(this.spliterator());
  }
  /** Returns a {@link LongStream} over `s`. */
  protected streamOf(s: Spliterator<number>): LongStream {
    return streamFactories().longStream(s, false);
  }
}

/** An optional `number` returned by {@link DoubleStream} operations and `average()`. Immutable. */
export class OptionalDouble extends NumberOptional {
  private static readonly EMPTY = new OptionalDouble(0, false);
  /** `'OptionalDouble'`, the name `toString()` prints. */
  protected readonly typeName = 'OptionalDouble';
  private constructor(value: number, present: boolean) {
    super(value, present);
  }
  /** Returns the empty optional (a shared instance). */
  static empty(): OptionalDouble {
    return OptionalDouble.EMPTY;
  }
  /** Returns an optional holding `value`. */
  static of(value: number): OptionalDouble {
    return new OptionalDouble(value, true);
  }
  /**
   * Returns the value.
   * @throws {@link NoSuchElementException} ("No value present") if empty
   */
  getAsDouble(): number {
    return this.getValue();
  }
  /** Returns an {@link DoubleStream} of the value, or an empty stream. */
  stream(): DoubleStream {
    return this.streamOf(this.spliterator());
  }
  /** Returns a {@link DoubleStream} over `s`. */
  protected streamOf(s: Spliterator<number>): DoubleStream {
    return streamFactories().doubleStream(s, false);
  }
}
