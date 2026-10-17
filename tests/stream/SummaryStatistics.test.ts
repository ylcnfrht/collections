import { IllegalArgumentException, NullPointerException } from '../../src';
import { DoubleSummaryStatistics, IntSummaryStatistics, LongSummaryStatistics } from '../../src/util/SummaryStatistics';

describe('IntSummaryStatistics', () => {
  it('empty state', () => {
    const s = new IntSummaryStatistics();
    expect(s.getCount()).toBe(0);
    expect(s.getSum()).toBe(0);
    expect(s.getMin()).toBe(2147483647);
    expect(s.getMax()).toBe(-2147483648);
    expect(s.getAverage()).toBe(0);
    expect(s.toString()).toBe('IntSummaryStatistics{count=0, sum=0, min=2147483647, average=0.000000, max=-2147483648}');
  });

  it('accepts values', () => {
    const s = new IntSummaryStatistics();
    for (const v of [3, -1, 7, 2]) s.accept(v);
    expect(s.getCount()).toBe(4);
    expect(s.getSum()).toBe(11);
    expect(s.getMin()).toBe(-1);
    expect(s.getMax()).toBe(7);
    expect(s.getAverage()).toBe(2.75);
    expect(s.toString()).toBe('IntSummaryStatistics{count=4, sum=11, min=-1, average=2.750000, max=7}');
  });

  it('the sum is not limited to 32 bits', () => {
    const s = new IntSummaryStatistics();
    s.accept(2147483647);
    s.accept(2147483647);
    expect(s.getSum()).toBe(4294967294);
  });

  it('combine', () => {
    const a = new IntSummaryStatistics();
    const b = new IntSummaryStatistics();
    a.accept(1);
    b.accept(10);
    b.accept(-5);
    a.combine(b);
    expect([a.getCount(), a.getSum(), a.getMin(), a.getMax()]).toEqual([3, 6, -5, 10]);
    a.combine(new IntSummaryStatistics());
    expect([a.getCount(), a.getMin(), a.getMax()]).toEqual([3, -5, 10]);
    expect(() => a.combine(null as never)).toThrow(NullPointerException);
  });

  it('constructor(count, min, max, sum)', () => {
    const s = new IntSummaryStatistics(2, 1, 5, 6);
    expect([s.getCount(), s.getMin(), s.getMax(), s.getSum(), s.getAverage()]).toEqual([2, 1, 5, 6, 3]);
    s.accept(0);
    expect(s.getMin()).toBe(0);
    // count 0 ignores the rest
    const z = new IntSummaryStatistics(0, 9, 1, 100);
    expect([z.getCount(), z.getSum(), z.getMin(), z.getMax()]).toEqual([0, 0, 2147483647, -2147483648]);
    expect(() => new IntSummaryStatistics(-1, 0, 0, 0)).toThrow(new IllegalArgumentException('Negative count value'));
    expect(() => new IntSummaryStatistics(1, 5, 1, 0)).toThrow(new IllegalArgumentException('Minimum greater than maximum'));
  });
});

describe('LongSummaryStatistics', () => {
  it('empty state uses the safe-integer limits', () => {
    const s = new LongSummaryStatistics();
    expect(s.getCount()).toBe(0);
    expect(s.getMin()).toBe(Number.MAX_SAFE_INTEGER);
    expect(s.getMax()).toBe(Number.MIN_SAFE_INTEGER);
    expect(s.getAverage()).toBe(0);
    expect(s.toString()).toBe(
      `LongSummaryStatistics{count=0, sum=0, min=${Number.MAX_SAFE_INTEGER}, average=0.000000, max=${Number.MIN_SAFE_INTEGER}}`
    );
  });

  it('accepts, combines, formats', () => {
    const s = new LongSummaryStatistics();
    s.accept(2 ** 40);
    s.accept(-3);
    const t = new LongSummaryStatistics();
    t.accept(1);
    s.combine(t);
    expect([s.getCount(), s.getSum(), s.getMin(), s.getMax()]).toEqual([3, 2 ** 40 - 2, -3, 2 ** 40]);
    expect(s.toString()).toBe(`LongSummaryStatistics{count=3, sum=${2 ** 40 - 2}, min=-3, average=366503875924.666700, max=${2 ** 40}}`);
    expect(() => s.combine(null as never)).toThrow(NullPointerException);
  });

  it('constructor validation', () => {
    const s = new LongSummaryStatistics(3, -1, 4, 6);
    expect([s.getCount(), s.getMin(), s.getMax(), s.getSum(), s.getAverage()]).toEqual([3, -1, 4, 6, 2]);
    expect(new LongSummaryStatistics(0, 5, 1, 9).getSum()).toBe(0);
    expect(() => new LongSummaryStatistics(-1, 0, 0, 0)).toThrow(IllegalArgumentException);
    expect(() => new LongSummaryStatistics(1, 2, 1, 0)).toThrow(IllegalArgumentException);
  });
});

describe('DoubleSummaryStatistics', () => {
  it('empty state', () => {
    const s = new DoubleSummaryStatistics();
    expect(s.getCount()).toBe(0);
    expect(s.getSum()).toBe(0);
    expect(s.getMin()).toBe(Infinity);
    expect(s.getMax()).toBe(-Infinity);
    expect(s.getAverage()).toBe(0);
    expect(s.toString()).toBe('DoubleSummaryStatistics{count=0, sum=0.000000, min=Infinity, average=0.000000, max=-Infinity}');
  });

  it('compensated (Kahan) summation: ten 0.1 make exactly 1.0', () => {
    const s = new DoubleSummaryStatistics();
    let naive = 0;
    for (let i = 0; i < 10; i++) {
      s.accept(0.1);
      naive += 0.1;
    }
    expect(naive).not.toBe(1);
    expect(s.getSum()).toBe(1);
    expect(s.getAverage()).toBe(0.1);
    expect(s.toString()).toBe('DoubleSummaryStatistics{count=10, sum=1.000000, min=0.100000, average=0.100000, max=0.100000}');
  });

  it('a million 0.1 additions stay accurate', () => {
    const s = new DoubleSummaryStatistics();
    let naive = 0;
    for (let i = 0; i < 1_000_000; i++) {
      s.accept(0.1);
      naive += 0.1;
    }
    expect(Math.abs(s.getSum() - 100000)).toBeLessThan(1e-9);
    expect(Math.abs(naive - 100000)).toBeGreaterThan(1e-7);
  });

  it('large and small magnitudes', () => {
    const s = new DoubleSummaryStatistics();
    s.accept(1e16);
    for (let i = 0; i < 10; i++) s.accept(1);
    s.accept(-1e16);
    expect(s.getSum()).toBe(10);
  });

  it('min/max follow Math.min/Math.max (NaN wins, -0.0 < 0.0)', () => {
    const s = new DoubleSummaryStatistics();
    s.accept(0);
    s.accept(-0);
    expect(Object.is(s.getMin(), -0)).toBe(true);
    expect(Object.is(s.getMax(), 0)).toBe(true);
    s.accept(NaN);
    expect(s.getMin()).toBeNaN();
    expect(s.getMax()).toBeNaN();
    expect(s.getSum()).toBeNaN();
    expect(s.toString()).toBe('DoubleSummaryStatistics{count=3, sum=NaN, min=NaN, average=NaN, max=NaN}');
  });

  it('infinities: the plain sum is reported when compensation turns them into NaN', () => {
    const a = new DoubleSummaryStatistics();
    a.accept(Number.MAX_VALUE);
    a.accept(Number.MAX_VALUE);
    expect(a.getSum()).toBe(Infinity);
    const b = new DoubleSummaryStatistics();
    b.accept(Infinity);
    b.accept(1);
    expect(b.getSum()).toBe(Infinity);
    expect(b.toString()).toBe('DoubleSummaryStatistics{count=2, sum=Infinity, min=1.000000, average=Infinity, max=Infinity}');
    const c = new DoubleSummaryStatistics();
    c.accept(Infinity);
    c.accept(-Infinity);
    expect(c.getSum()).toBeNaN();
    const d = new DoubleSummaryStatistics();
    d.accept(-Infinity);
    d.accept(-1);
    expect(d.getSum()).toBe(-Infinity);
  });

  it('combine keeps the compensation', () => {
    const a = new DoubleSummaryStatistics();
    const b = new DoubleSummaryStatistics();
    for (let i = 0; i < 5; i++) a.accept(0.1);
    for (let i = 0; i < 5; i++) b.accept(0.1);
    b.accept(-2);
    a.combine(b);
    expect(a.getCount()).toBe(11);
    expect(a.getSum()).toBe(-1);
    expect(a.getMin()).toBe(-2);
    expect(a.getMax()).toBe(0.1);
    expect(() => a.combine(null as never)).toThrow(NullPointerException);
  });

  it('constructor(count, min, max, sum) and its validation', () => {
    const s = new DoubleSummaryStatistics(4, -1.5, 2.5, 3);
    expect([s.getCount(), s.getMin(), s.getMax(), s.getSum(), s.getAverage()]).toEqual([4, -1.5, 2.5, 3, 0.75]);
    s.accept(1);
    expect(s.getSum()).toBe(4);
    const z = new DoubleSummaryStatistics(0, 9, 1, NaN);
    expect([z.getCount(), z.getSum(), z.getMin(), z.getMax()]).toEqual([0, 0, Infinity, -Infinity]);
    const allNaN = new DoubleSummaryStatistics(1, NaN, NaN, NaN);
    expect(allNaN.getSum()).toBeNaN();
    expect(() => new DoubleSummaryStatistics(-1, 0, 0, 0)).toThrow(new IllegalArgumentException('Negative count value'));
    expect(() => new DoubleSummaryStatistics(1, 2, 1, 0)).toThrow(new IllegalArgumentException('Minimum greater than maximum'));
    expect(() => new DoubleSummaryStatistics(1, 0, 1, NaN)).toThrow(
      new IllegalArgumentException('Some, not all, of the minimum, maximum, or sum is NaN')
    );
    expect(() => new DoubleSummaryStatistics(1, NaN, 1, 0)).toThrow(IllegalArgumentException);
  });

  it('toString rounds HALF_UP like the reference %f', () => {
    const s = new DoubleSummaryStatistics();
    s.accept(5e-7);
    expect(s.toString()).toBe('DoubleSummaryStatistics{count=1, sum=0.000001, min=0.000001, average=0.000001, max=0.000001}');
    const big = new DoubleSummaryStatistics();
    big.accept(1e21);
    expect(big.toString()).toBe(
      'DoubleSummaryStatistics{count=1, sum=1000000000000000000000.000000, min=1000000000000000000000.000000, average=1000000000000000000000.000000, max=1000000000000000000000.000000}'
    );
  });
});
