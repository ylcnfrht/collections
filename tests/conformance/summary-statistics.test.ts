// Conformance: Int/Long/DoubleSummaryStatistics.
import { Collectors, DoubleStream, DoubleSummaryStatistics, IntStream, IntSummaryStatistics, List, LongStream, LongSummaryStatistics } from '../../src';
import { expectThrows } from '../helpers';

const IAE = 'IllegalArgumentException';
const stats = (s: { getCount(): number; getSum(): number; getMin(): number; getMax(): number; getAverage(): number }) => [
  s.getCount(),
  s.getSum(),
  s.getMin(),
  s.getMax(),
  s.getAverage(),
];

describe('IntSummaryStatistics', () => {
  it('records count, sum, min, max, average', () => {
    const s = new IntSummaryStatistics();
    [4, -2, 7].forEach((v) => s.accept(v));
    expect(stats(s)).toEqual([3, 9, -2, 7, 3]);
  });
  // getMin: "or Integer.MAX_VALUE if none have been recorded"; getMax: "or Integer.MIN_VALUE"; getAverage: "or zero if no values have been recorded"
  it('empty instance', () => expect(stats(new IntSummaryStatistics())).toEqual([0, 0, 2147483647, -2147483648, 0]));
  it('combine merges another instance', () => {
    const a = new IntSummaryStatistics();
    const b = new IntSummaryStatistics();
    a.accept(1);
    b.accept(10);
    b.accept(-5);
    a.combine(b);
    expect(stats(a)).toEqual([3, 6, -5, 10, 2]);
  });
  it('combine with an empty instance changes nothing', () => {
    const a = new IntSummaryStatistics();
    a.accept(3);
    a.combine(new IntSummaryStatistics());
    expect(stats(a)).toEqual([1, 3, 3, 3, 3]);
  });
  it('combine(null) throws NullPointerException', () => expectThrows(() => new IntSummaryStatistics().combine(null as any), 'NullPointerException'));
  // class doc example: intStream.collect(IntSummaryStatistics::new, IntSummaryStatistics::accept, IntSummaryStatistics::combine)
  it('doc example: collect with accept/combine', () => {
    const s = IntStream.of(1, 2, 3).collect(
      () => new IntSummaryStatistics(),
      (st, v) => st.accept(v),
      (x, y) => x.combine(y),
    );
    expect(stats(s)).toEqual([3, 6, 1, 3, 2]);
  });
  // class doc example: people.stream().collect(Collectors.summarizingInt(Person::getDependents))
  it('doc example: summarizingInt over people', () => {
    const s = List.of({ deps: 2 }, { deps: 0 }, { deps: 4 }).stream().collect(Collectors.summarizingInt((p: { deps: number }) => p.deps));
    expect(stats(s)).toEqual([3, 6, 0, 4, 2]);
  });
  it('toString', () => {
    const s = new IntSummaryStatistics();
    [1, 2, 3].forEach((v) => s.accept(v));
    expect(s.toString()).toBe('IntSummaryStatistics{count=3, sum=6, min=1, average=2.000000, max=3}');
  });
  it('toString of empty', () =>
    expect(new IntSummaryStatistics().toString()).toBe('IntSummaryStatistics{count=0, sum=0, min=2147483647, average=0.000000, max=-2147483648}'));
  it('toString average has six decimals', () => {
    const s = new IntSummaryStatistics();
    [1, 2].forEach((v) => s.accept(v));
    expect(s.toString()).toBe('IntSummaryStatistics{count=2, sum=3, min=1, average=1.500000, max=2}');
  });
  it('average of 1, 1, 2 is 4/3', () => {
    const s = new IntSummaryStatistics();
    [1, 1, 2].forEach((v) => s.accept(v));
    expect(s.getAverage()).toBeCloseTo(4 / 3, 12);
    expect(s.toString()).toContain('average=1.333333');
  });
  // constructor: "If count is zero then the remaining arguments are ignored and an empty instance is constructed."
  it('constructor with count 0 ignores the other arguments', () => expect(stats(new IntSummaryStatistics(0, 5, 1, 99))).toEqual([0, 0, 2147483647, -2147483648, 0]));
  it('constructor with a positive count', () => expect(stats(new IntSummaryStatistics(2, 1, 5, 6))).toEqual([2, 6, 1, 5, 3]));
  // "IllegalArgumentException - if count is negative or count is positive and min is greater than max"
  it('constructor with a negative count throws IllegalArgumentException', () => expectThrows(() => new IntSummaryStatistics(-1, 0, 0, 0), IAE));
  it('constructor with min > max throws IllegalArgumentException', () => expectThrows(() => new IntSummaryStatistics(1, 5, 1, 0), IAE));
  it('constructed instance keeps accepting', () => {
    const s = new IntSummaryStatistics(1, 3, 3, 3);
    s.accept(9);
    expect(stats(s)).toEqual([2, 12, 3, 9, 6]);
  });
});

describe('LongSummaryStatistics', () => {
  it('records values beyond int range', () => {
    const s = new LongSummaryStatistics();
    [4294967296, 1].forEach((v) => s.accept(v));
    expect(stats(s)).toEqual([2, 4294967297, 1, 4294967296, 2147483648.5]);
  });
  it('empty count, sum and average are 0', () => {
    const s = new LongSummaryStatistics();
    expect([s.getCount(), s.getSum(), s.getAverage()]).toEqual([0, 0, 0]);
  });
  it('empty min is greater than any recorded value and max smaller', () => {
    const s = new LongSummaryStatistics();
    expect(s.getMin()).toBeGreaterThan(2 ** 52);
    expect(s.getMax()).toBeLessThan(-(2 ** 52));
  });
  it('combine', () => {
    const a = new LongSummaryStatistics();
    const b = new LongSummaryStatistics();
    a.accept(10);
    b.accept(20);
    a.combine(b);
    expect(stats(a)).toEqual([2, 30, 10, 20, 15]);
  });
  it('from LongStream', () => expect(stats(LongStream.rangeClosed(1, 4).summaryStatistics())).toEqual([4, 10, 1, 4, 2.5]));
  it('summarizingLong', () => expect(stats(List.of(3, 5).stream().collect(Collectors.summarizingLong((x: number) => x)))).toEqual([2, 8, 3, 5, 4]));
  it('toString', () => {
    const s = new LongSummaryStatistics();
    [5, 15].forEach((v) => s.accept(v));
    expect(s.toString()).toBe('LongSummaryStatistics{count=2, sum=20, min=5, average=10.000000, max=15}');
  });
  it('constructor', () => expect(stats(new LongSummaryStatistics(3, 1, 10, 12))).toEqual([3, 12, 1, 10, 4]));
  it('constructor with negative count throws IllegalArgumentException', () => expectThrows(() => new LongSummaryStatistics(-2, 0, 0, 0), IAE));
  it('constructor with min > max throws IllegalArgumentException', () => expectThrows(() => new LongSummaryStatistics(2, 9, 1, 10), IAE));
});

describe('DoubleSummaryStatistics', () => {
  it('records values', () => {
    const s = new DoubleSummaryStatistics();
    [1.5, -0.5, 2].forEach((v) => s.accept(v));
    expect(stats(s)).toEqual([3, 3, -0.5, 2, 1]);
  });
  // getMin: "Double.POSITIVE_INFINITY if no values were recorded"; getMax: "Double.NEGATIVE_INFINITY if no values were recorded"
  it('empty instance', () => expect(stats(new DoubleSummaryStatistics())).toEqual([0, 0, Infinity, -Infinity, 0]));
  // getMin: "Double.NaN if any recorded value was NaN"
  it('NaN makes min, max, sum and average NaN', () => {
    const s = new DoubleSummaryStatistics();
    [1, NaN, 3].forEach((v) => s.accept(v));
    expect(s.getMin()).toBeNaN();
    expect(s.getMax()).toBeNaN();
    expect(s.getSum()).toBeNaN();
    expect(s.getAverage()).toBeNaN();
    expect(s.getCount()).toBe(3);
  });
  it('sum of many small values stays close to exact', () => {
    const s = new DoubleSummaryStatistics();
    for (let i = 0; i < 1000; i++) s.accept(0.1);
    expect(s.getSum()).toBeCloseTo(100, 10);
  });
  it('infinite values', () => {
    const s = new DoubleSummaryStatistics();
    s.accept(Infinity);
    s.accept(1);
    expect(s.getSum()).toBe(Infinity);
    expect(s.getMax()).toBe(Infinity);
  });
  it('combine', () => {
    const a = new DoubleSummaryStatistics();
    const b = new DoubleSummaryStatistics();
    a.accept(0.5);
    b.accept(1.5);
    a.combine(b);
    expect(stats(a)).toEqual([2, 2, 0.5, 1.5, 1]);
  });
  it('from DoubleStream', () => expect(stats(DoubleStream.of(0.25, 0.75).summaryStatistics())).toEqual([2, 1, 0.25, 0.75, 0.5]));
  it('toString', () => {
    const s = new DoubleSummaryStatistics();
    [0.5, 1.5].forEach((v) => s.accept(v));
    expect(s.toString()).toBe('DoubleSummaryStatistics{count=2, sum=2.000000, min=0.500000, average=1.000000, max=1.500000}');
  });
  it('toString of empty', () =>
    expect(new DoubleSummaryStatistics().toString()).toBe('DoubleSummaryStatistics{count=0, sum=0.000000, min=Infinity, average=0.000000, max=-Infinity}'));
  it('constructor', () => expect(stats(new DoubleSummaryStatistics(2, 0.5, 1.5, 2))).toEqual([2, 2, 0.5, 1.5, 1]));
  it('constructor with count 0 ignores the other arguments', () =>
    expect(stats(new DoubleSummaryStatistics(0, 9, 1, 5))).toEqual([0, 0, Infinity, -Infinity, 0]));
  it('constructor with negative count throws IllegalArgumentException', () => expectThrows(() => new DoubleSummaryStatistics(-1, 0, 0, 0), IAE));
  it('constructor with min > max throws IllegalArgumentException', () => expectThrows(() => new DoubleSummaryStatistics(1, 2, 1, 0), IAE));
});
