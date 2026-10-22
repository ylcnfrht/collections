import { IllegalArgumentException } from '../exceptions';
import { formatFixed6 } from './formatDouble';
import { INSPECT, requireNonNull } from './Objects';

const INT_MAX = 2147483647;
const INT_MIN = -2147483648;

/** Shared body of Int- and LongSummaryStatistics: count/sum/min/max/average of integral values. */
abstract class IntegralSummaryStatistics {
  private count = 0;
  private sum = 0;
  private min: number;
  private max: number;

  protected constructor(emptyMin: number, emptyMax: number, args: number[]) {
    this.min = emptyMin;
    this.max = emptyMax;
    if (args.length === 0) return;
    const [count, min, max, sum] = args;
    if (count < 0) throw new IllegalArgumentException('Negative count value');
    if (count === 0) return;
    if (min > max) throw new IllegalArgumentException('Minimum greater than maximum');
    this.count = count;
    this.min = min;
    this.max = max;
    this.sum = sum;
  }

  /** The class name toString() prints (kept as a string so minified bundles print it too). */
  protected abstract readonly kind: string;

  /** Records `value`: increments the count, adds it to the sum and updates min and max. */
  accept(value: number): void {
    this.count++;
    this.sum += value;
    if (value < this.min) this.min = value;
    if (value > this.max) this.max = value;
  }

  /**
   * Merges the state of `other` into this one, as if every value it recorded had been recorded here.
   * @throws {@link NullPointerException} if `other` is `null`
   */
  combine(other: this): void {
    requireNonNull(other);
    this.count += other.count;
    this.sum += other.sum;
    if (other.min < this.min) this.min = other.min;
    if (other.max > this.max) this.max = other.max;
  }

  /** Returns the number of recorded values. */
  getCount(): number {
    return this.count;
  }
  /** Returns the sum of the recorded values (0 when empty). The sum is a JS number, so it is exact up to 2^53. */
  getSum(): number {
    return this.sum;
  }
  /** Returns the smallest recorded value, or the class's empty minimum when nothing was recorded. */
  getMin(): number {
    return this.min;
  }
  /** Returns the largest recorded value, or the class's empty maximum when nothing was recorded. */
  getMax(): number {
    return this.max;
  }
  /** Returns the arithmetic mean of the recorded values, or 0 when nothing was recorded. */
  getAverage(): number {
    return this.count > 0 ? this.sum / this.count : 0;
  }

  /** Node's `util.inspect` hook: `console.log` prints the `toString()` form. */
  [INSPECT](): string {
    return this.toString();
  }
  /** Returns e.g. `IntSummaryStatistics{count=2, sum=3, min=1, average=1.500000, max=2}`. */
  toString(): string {
    return `${this.kind}{count=${this.count}, sum=${this.sum}, min=${this.min}, average=${formatFixed6(this.getAverage())}, max=${this.max}}`;
  }
}

/** count/sum/min/max/average of int values. Empty: min = 2^31-1, max = -2^31, average = 0. */
export class IntSummaryStatistics extends IntegralSummaryStatistics {
  protected readonly kind = 'IntSummaryStatistics';
  /** Creates empty statistics (count 0). */
  constructor();
  /**
   * Creates statistics with the given state. With `count` 0 the other arguments are ignored.
   * @throws {@link IllegalArgumentException} if `count < 0`, or `count > 0` and `min > max`
   */
  constructor(count: number, min: number, max: number, sum: number);
  constructor(...args: number[]) {
    super(INT_MAX, INT_MIN, args);
  }
}

/**
 * count/sum/min/max/average of long values, held as JS numbers.
 * Empty: min = Number.MAX_SAFE_INTEGER, max = Number.MIN_SAFE_INTEGER (the closest numbers to the 64-bit limits).
 */
export class LongSummaryStatistics extends IntegralSummaryStatistics {
  protected readonly kind = 'LongSummaryStatistics';
  /** Creates empty statistics (count 0). */
  constructor();
  /**
   * Creates statistics with the given state. With `count` 0 the other arguments are ignored.
   * @throws {@link IllegalArgumentException} if `count < 0`, or `count > 0` and `min > max`
   */
  constructor(count: number, min: number, max: number, sum: number);
  constructor(...args: number[]) {
    super(Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, args);
  }
}

/**
 * Compensated (Kahan) sum, laid out like the reference, plus a simple sum: when the compensated sum turns NaN on
 * infinities, the simple one is the answer. Shared by DoubleSummaryStatistics, DoubleStream.sum and the double collectors.
 * @internal
 */
export class CompensatedSum {
  private sum = 0;
  private c = 0;
  /** The plain running sum. */
  simple = 0;

  constructor(initial = 0) {
    this.sum = this.simple = initial;
  }

  add(value: number): void {
    this.simple += value;
    this.kahan(value);
  }

  addAll(other: CompensatedSum): void {
    this.simple += other.simple;
    this.kahan(other.sum);
    this.kahan(-other.c);
  }

  private kahan(value: number): void {
    const tmp = value - this.c;
    const velvel = this.sum + tmp;
    this.c = velvel - this.sum - tmp;
    this.sum = velvel;
  }

  result(): number {
    const tmp = this.sum - this.c;
    return tmp !== tmp && (this.simple === Infinity || this.simple === -Infinity) ? this.simple : tmp;
  }
}

/**
 * count/sum/min/max/average of doubles. The sum is compensated (Kahan), as in the reference,
 * so long runs of small values don't drift. Empty: min = Infinity, max = -Infinity.
 */
export class DoubleSummaryStatistics {
  private count = 0;
  private sum = new CompensatedSum();
  private min = Infinity;
  private max = -Infinity;

  /** Creates empty statistics (count 0). */
  constructor();
  /**
   * Creates statistics with the given state. With `count` 0 the other arguments are ignored.
   * @throws {@link IllegalArgumentException} if `count < 0`, or `count > 0` and `min > max`, or `count > 0` and some
   * but not all of `min`, `max` and `sum` are `NaN`
   */
  constructor(count: number, min: number, max: number, sum: number);
  constructor(count?: number, min?: number, max?: number, sum?: number) {
    if (arguments.length === 0) return;
    if (count! < 0) throw new IllegalArgumentException('Negative count value');
    if (count! > 0) {
      if (min! > max!) throw new IllegalArgumentException('Minimum greater than maximum');
      // NaN anywhere is fine only if every value is NaN-consistent: the reference requires min/max/sum all non-NaN, or sum NaN
      const ncount = [min!, max!, sum!].filter((v) => v !== v).length;
      if (ncount > 0 && ncount < 3) throw new IllegalArgumentException('Some, not all, of the minimum, maximum, or sum is NaN');
      this.count = count!;
      this.sum = new CompensatedSum(sum!);
      this.min = min!;
      this.max = max!;
    }
  }

  /** Records `value`: increments the count, adds it to the compensated sum and updates min and max (a `NaN` makes both `NaN`). */
  accept(value: number): void {
    this.count++;
    this.sum.add(value);
    this.min = Math.min(this.min, value);
    this.max = Math.max(this.max, value);
  }

  /**
   * Merges the state of `other` into this one, as if every value it recorded had been recorded here.
   * @throws {@link NullPointerException} if `other` is `null`
   */
  combine(other: DoubleSummaryStatistics): void {
    requireNonNull(other);
    this.count += other.count;
    this.sum.addAll(other.sum);
    this.min = Math.min(this.min, other.min);
    this.max = Math.max(this.max, other.max);
  }

  /** Returns the number of recorded values. */
  getCount(): number {
    return this.count;
  }

  /** Returns the compensated sum of the recorded values (0 when empty); `NaN` if any value was `NaN`. */
  getSum(): number {
    return this.sum.result();
  }

  /** Returns the smallest recorded value, `Infinity` when empty, or `NaN` if any value was `NaN`. */
  getMin(): number {
    return this.min;
  }
  /** Returns the largest recorded value, `-Infinity` when empty, or `NaN` if any value was `NaN`. */
  getMax(): number {
    return this.max;
  }
  /** Returns the mean of the recorded values (compensated sum divided by count), or 0 when nothing was recorded. */
  getAverage(): number {
    return this.count > 0 ? this.getSum() / this.count : 0;
  }

  /** Node's `util.inspect` hook: `console.log` prints the `toString()` form. */
  [INSPECT](): string {
    return this.toString();
  }
  /** Returns e.g. `DoubleSummaryStatistics{count=2, sum=3.000000, min=1.000000, average=1.500000, max=2.000000}`. */
  toString(): string {
    return `DoubleSummaryStatistics{count=${this.count}, sum=${formatFixed6(this.getSum())}, min=${formatFixed6(this.min)}, average=${formatFixed6(this.getAverage())}, max=${formatFixed6(this.max)}}`;
  }
}
