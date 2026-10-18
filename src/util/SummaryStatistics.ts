import { IllegalArgumentException } from '../exceptions';
import { formatFixed6 } from './formatDouble';
import { INSPECT, requireNonNull } from './Objects';

const INT_MAX = 2147483647;
const INT_MIN = -2147483648;

/** count/sum/min/max/average of int values. Empty: min = 2^31-1, max = -2^31, average = 0. */
export class IntSummaryStatistics {
  private count = 0;
  private sum = 0;
  private min = INT_MAX;
  private max = INT_MIN;

  constructor();
  /** @throws IllegalArgumentException if count < 0, or count > 0 and min > max */
  constructor(count: number, min: number, max: number, sum: number);
  constructor(count?: number, min?: number, max?: number, sum?: number) {
    if (arguments.length > 0) initFrom(this, count!, min!, max!, sum!);
  }

  accept(value: number): void {
    this.count++;
    this.sum += value;
    if (value < this.min) this.min = value;
    if (value > this.max) this.max = value;
  }

  combine(other: IntSummaryStatistics): void {
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
    return `IntSummaryStatistics{count=${this.count}, sum=${this.sum}, min=${this.min}, average=${formatFixed6(this.getAverage())}, max=${this.max}}`;
  }
}

/**
 * count/sum/min/max/average of long values, held as JS numbers.
 * Empty: min = Number.MAX_SAFE_INTEGER, max = Number.MIN_SAFE_INTEGER (the closest numbers to the 64-bit limits).
 */
export class LongSummaryStatistics {
  private count = 0;
  private sum = 0;
  private min = Number.MAX_SAFE_INTEGER;
  private max = Number.MIN_SAFE_INTEGER;

  constructor();
  constructor(count: number, min: number, max: number, sum: number);
  constructor(count?: number, min?: number, max?: number, sum?: number) {
    if (arguments.length > 0) initFrom(this, count!, min!, max!, sum!);
  }

  accept(value: number): void {
    this.count++;
    this.sum += value;
    if (value < this.min) this.min = value;
    if (value > this.max) this.max = value;
  }

  combine(other: LongSummaryStatistics): void {
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
    return `LongSummaryStatistics{count=${this.count}, sum=${this.sum}, min=${this.min}, average=${formatFixed6(this.getAverage())}, max=${this.max}}`;
  }
}

/**
 * count/sum/min/max/average of doubles. The sum is compensated (Kahan), as in the reference,
 * so long runs of small values don't drift. Empty: min = Infinity, max = -Infinity.
 */
export class DoubleSummaryStatistics {
  private count = 0;
  private sum = 0;
  private sumCompensation = 0;
  private simpleSum = 0;
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
      this.sum = sum!;
      this.simpleSum = sum!;
      this.min = min!;
      this.max = max!;
    }
  }

  accept(value: number): void {
    this.count++;
    this.simpleSum += value;
    this.sumWithCompensation(value);
    this.min = Math.min(this.min, value);
    this.max = Math.max(this.max, value);
  }

  combine(other: DoubleSummaryStatistics): void {
    requireNonNull(other);
    this.count += other.count;
    this.simpleSum += other.simpleSum;
    this.sumWithCompensation(other.sum);
    this.sumWithCompensation(-other.sumCompensation);
    this.min = Math.min(this.min, other.min);
    this.max = Math.max(this.max, other.max);
  }

  private sumWithCompensation(value: number): void {
    const tmp = value - this.sumCompensation;
    const velvel = this.sum + tmp;
    this.sumCompensation = velvel - this.sum - tmp;
    this.sum = velvel;
  }

  getCount(): number {
    return this.count;
  }

  getSum(): number {
    const tmp = this.sum - this.sumCompensation;
    // compensation turns +Infinity + -Infinity style overflow into NaN; the plain sum is right there
    if (tmp !== tmp && (this.simpleSum === Infinity || this.simpleSum === -Infinity)) return this.simpleSum;
    return tmp;
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

function initFrom(s: IntSummaryStatistics | LongSummaryStatistics, count: number, min: number, max: number, sum: number): void {
  if (count < 0) throw new IllegalArgumentException('Negative count value');
  if (count === 0) return;
  if (min > max) throw new IllegalArgumentException('Minimum greater than maximum');
  const t = s as unknown as { count: number; min: number; max: number; sum: number };
  t.count = count;
  t.min = min;
  t.max = max;
  t.sum = sum;
}
