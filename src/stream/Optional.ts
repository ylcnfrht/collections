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

const OPTIONAL_BRAND: unique symbol = Symbol.for('ts-collections-framework.Optional');

/** o is an optional of the given kind ('Optional', 'OptionalInt', ...), from this or another copy of the library. */
function isOptional(o: unknown, kind: string): o is { present: boolean; value: any } {
  return (o as { [OPTIONAL_BRAND]?: string } | null)?.[OPTIONAL_BRAND] === kind;
}

/** What Optional and the number optionals share: presence, the orElse family, ifPresent. */
abstract class OptionalBase<T> {
  protected constructor(protected readonly value: T, protected readonly present: boolean) {}

  protected abstract readonly typeName: string;

  /** @internal the kind, shared by every loaded copy of the library */
  get [OPTIONAL_BRAND](): string {
    return this.typeName;
  }

  isPresent(): boolean {
    return this.present;
  }

  isEmpty(): boolean {
    return !this.present;
  }

  ifPresent(action: (value: T) => void): void {
    if (this.present) requireNonNull(action)(this.value);
  }

  ifPresentOrElse(action: (value: T) => void, emptyAction: () => void): void {
    if (this.present) requireNonNull(action)(this.value);
    else requireNonNull(emptyAction)();
  }

  orElse(other: T): T {
    return this.present ? this.value : other;
  }

  orElseGet(supplier: () => T): T {
    return this.present ? this.value : requireNonNull(supplier)();
  }

  /** Without an argument throws NoSuchElementException; otherwise throws the supplied error. */
  orElseThrow(exceptionSupplier?: () => unknown): T {
    if (this.present) return this.value;
    if (arguments.length === 0) throw new NoSuchElementException(NO_VALUE);
    throw requireNonNull(requireNonNull(exceptionSupplier)());
  }

  [INSPECT](): string {
    return this.toString();
  }
}

/** A container that may or may not hold a non-null value. null and undefined both mean "absent". */
export class Optional<T> extends OptionalBase<T> {
  // any: the single empty instance serves every element type
  private static readonly EMPTY: Optional<any> = new Optional<any>(undefined, false);

  private constructor(value: T, present: boolean) {
    super(value, present);
  }

  protected get typeName(): string {
    return 'Optional';
  }

  static empty<T>(): Optional<T> {
    return Optional.EMPTY;
  }

  /** @throws NullPointerException if value is null or undefined */
  static of<T>(value: T): Optional<NonNullable<T>> {
    return new Optional(requireNonNull(value), true);
  }

  static ofNullable<T>(value: T | null | undefined): Optional<NonNullable<T>> {
    return value === null || value === undefined ? Optional.EMPTY : new Optional(value as NonNullable<T>, true);
  }

  /** @throws NoSuchElementException if empty */
  get(): T {
    if (!this.present) throw new NoSuchElementException(NO_VALUE);
    return this.value;
  }

  filter(predicate: (value: T) => boolean): Optional<T> {
    requireNonNull(predicate);
    return !this.present || predicate(this.value) ? this : Optional.EMPTY;
  }

  map<U>(mapper: (value: T) => U | null | undefined): Optional<NonNullable<U>> {
    requireNonNull(mapper);
    return this.present ? Optional.ofNullable(mapper(this.value)) : Optional.EMPTY;
  }

  /** @throws NullPointerException if the mapper returns null */
  flatMap<U>(mapper: (value: T) => Optional<U>): Optional<U> {
    requireNonNull(mapper);
    return this.present ? requireNonNull(mapper(this.value)) : Optional.EMPTY;
  }

  or(supplier: () => Optional<T>): Optional<T> {
    requireNonNull(supplier);
    return this.present ? this : requireNonNull(supplier());
  }

  stream(): Stream<T> {
    return streamFactories().stream(new SingleSpliterator(this.value, this.present ? 1 : 0), false);
  }

  equals(o: unknown): boolean {
    if (o === this) return true;
    // by brand, not instanceof: equal across two loaded copies of the library (CJS and ESM in one process)
    if (!isOptional(o, 'Optional')) return false;
    return o.present === this.present && equals(this.value, o.value);
  }

  hashCode(): number {
    return this.present ? hashCode(this.value) : 0;
  }

  override toString(): string {
    return this.present ? `Optional[${toString(this.value)}]` : 'Optional.empty';
  }
}

/**
 * Shared implementation of OptionalInt / OptionalLong / OptionalDouble.
 * `same` decides value equality (doubles compare like Double.compare: NaN equals NaN, -0 differs from 0).
 */
abstract class NumberOptional extends OptionalBase<number> {

  protected abstract streamOf(spliterator: Spliterator<number>): unknown;

  protected getValue(): number {
    if (!this.present) throw new NoSuchElementException(NO_VALUE);
    return this.value;
  }

  equals(o: unknown): boolean {
    if (o === this) return true;
    if (!isOptional(o, this.typeName) || o.present !== this.present) return false;
    return !this.present || Object.is(this.value, o.value) || (this.typeName !== 'OptionalDouble' && this.value === o.value);
  }

  /** Integer.hashCode / Long.hashCode / Double.hashCode of the value; 0 when empty. */
  hashCode(): number {
    if (!this.present) return 0;
    const v = this.value;
    if (this.typeName === 'OptionalDouble') return doubleHash(v);
    // Long.hashCode: low word XOR high word (two's complement)
    if (this.typeName === 'OptionalLong' && Number.isInteger(v)) return (v | 0) ^ (Math.floor(v / 4294967296) | 0);
    return hashCode(v);
  }

  override toString(): string {
    if (!this.present) return `${this.typeName}.empty`;
    return `${this.typeName}[${this.typeName === 'OptionalDouble' ? formatDouble(this.value) : String(this.value)}]`;
  }

  protected spliterator(): Spliterator<number> {
    return new SingleSpliterator(this.value, this.present ? 1 : 0);
  }
}

export class OptionalInt extends NumberOptional {
  private static readonly EMPTY = new OptionalInt(0, false);
  protected readonly typeName = 'OptionalInt';
  private constructor(value: number, present: boolean) {
    super(value, present);
  }
  static empty(): OptionalInt {
    return OptionalInt.EMPTY;
  }
  static of(value: number): OptionalInt {
    return new OptionalInt(value, true);
  }
  /** @throws NoSuchElementException if empty */
  getAsInt(): number {
    return this.getValue();
  }
  stream(): IntStream {
    return this.streamOf(this.spliterator());
  }
  protected streamOf(s: Spliterator<number>): IntStream {
    return streamFactories().intStream(s, false);
  }
}

export class OptionalLong extends NumberOptional {
  private static readonly EMPTY = new OptionalLong(0, false);
  protected readonly typeName = 'OptionalLong';
  private constructor(value: number, present: boolean) {
    super(value, present);
  }
  static empty(): OptionalLong {
    return OptionalLong.EMPTY;
  }
  static of(value: number): OptionalLong {
    return new OptionalLong(value, true);
  }
  /** @throws NoSuchElementException if empty */
  getAsLong(): number {
    return this.getValue();
  }
  stream(): LongStream {
    return this.streamOf(this.spliterator());
  }
  protected streamOf(s: Spliterator<number>): LongStream {
    return streamFactories().longStream(s, false);
  }
}

export class OptionalDouble extends NumberOptional {
  private static readonly EMPTY = new OptionalDouble(0, false);
  protected readonly typeName = 'OptionalDouble';
  private constructor(value: number, present: boolean) {
    super(value, present);
  }
  static empty(): OptionalDouble {
    return OptionalDouble.EMPTY;
  }
  static of(value: number): OptionalDouble {
    return new OptionalDouble(value, true);
  }
  /** @throws NoSuchElementException if empty */
  getAsDouble(): number {
    return this.getValue();
  }
  stream(): DoubleStream {
    return this.streamOf(this.spliterator());
  }
  protected streamOf(s: Spliterator<number>): DoubleStream {
    return streamFactories().doubleStream(s, false);
  }
}
