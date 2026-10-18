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

  accept(value: number): void {
    this.count++;
    this.sum += value;
    if (value < this.min) this.min = value;
    if (value > this.max) this.max = value;
  }

  combine(other: this): void {
    requireNonNull(other);
    this.count += other.count;
    this.sum += other.sum;
    if (other.min < this.min) this.min = other.min;
    if (other.max > this.max) this.max = other.max;
  }

  getCount(): number {
    return this.count;
  }
  getSum(): number {
    return this.sum;
  }
  getMin(): number {
    return this.min;
  }
  getMax(): number {
    return this.max;
  }
  getAverage(): number {
    return this.count > 0 ? this.sum / this.count : 0;
  }

  [INSPECT](): string {
    return this.toString();
  }
  toString(): string {
    return `${this.kind}{count=${this.count}, sum=${this.sum}, min=${this.min}, average=${formatFixed6(this.getAverage())}, max=${this.max}}`;
  }
}

/** count/sum/min/max/average of int values. Empty: min = 2^31-1, max = -2^31, average = 0. */
export class IntSummaryStatistics extends IntegralSummaryStatistics {
  protected readonly kind = 'IntSummaryStatistics';
  constructor();
  /** @throws IllegalArgumentException if count < 0, or count > 0 and min > max */
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
  constructor();
  /** @throws IllegalArgumentException if count < 0, or count > 0 and min > max */
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

  constructor();
  /** @throws IllegalArgumentException if count < 0, count > 0 and min > max, or any argument is NaN while count > 0 */
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

  accept(value: number): void {
    this.count++;
    this.sum.add(value);
    this.min = Math.min(this.min, value);
    this.max = Math.max(this.max, value);
  }

  combine(other: DoubleSummaryStatistics): void {
    requireNonNull(other);
    this.count += other.count;
    this.sum.addAll(other.sum);
    this.min = Math.min(this.min, other.min);
    this.max = Math.max(this.max, other.max);
  }

  getCount(): number {
    return this.count;
  }

  getSum(): number {
    return this.sum.result();
  }

  getMin(): number {
    return this.min;
  }
  getMax(): number {
    return this.max;
  }
  getAverage(): number {
    return this.count > 0 ? this.getSum() / this.count : 0;
  }

  [INSPECT](): string {
    return this.toString();
  }
  toString(): string {
    return `DoubleSummaryStatistics{count=${this.count}, sum=${formatFixed6(this.getSum())}, min=${formatFixed6(this.min)}, average=${formatFixed6(this.getAverage())}, max=${formatFixed6(this.max)}}`;
  }
}
