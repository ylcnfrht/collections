import { IllegalStateException } from '../../src/exceptions';
import { OptionalDouble } from '../../src/stream/Optional';
import { DoubleStream } from '../../src/stream/Streams';
import { DoubleSummaryStatistics } from '../../src/util/SummaryStatistics';

describe('DoubleStream', () => {
  it('of / empty / ofArray', () => {
    expect(DoubleStream.of(0.5, 1.5).toArray()).toEqual([0.5, 1.5]);
    expect(DoubleStream.empty().count()).toBe(0);
    expect(DoubleStream.ofArray(Float64Array.of(1, 2)).sum()).toBe(3);
  });
  it('iterate / generate / concat / builder', () => {
    expect(DoubleStream.iterate(1, (x) => x / 2).limit(3).toArray()).toEqual([1, 0.5, 0.25]);
    expect(DoubleStream.iterate(1, (x) => x > 0.2, (x) => x / 2).toArray()).toEqual([1, 0.5, 0.25]);
    expect(DoubleStream.generate(() => 0.1).limit(2).toArray()).toEqual([0.1, 0.1]);
    expect(DoubleStream.concat(DoubleStream.of(1), DoubleStream.of(2)).sum()).toBe(3);
    const b = DoubleStream.builder();
    b.accept(1.5);
    expect(b.build().toArray()).toEqual([1.5]);
    expect(() => b.build()).toThrow(IllegalStateException);
  });

  it('sum is compensated (Kahan)', () => {
    expect(DoubleStream.of(0.1, 0.2, 0.3).sum()).toBe(0.6);
    const xs = new Array<number>(10).fill(0.1);
    expect(DoubleStream.ofArray(xs).sum()).toBe(1);
    expect(xs.reduce((a, b) => a + b, 0)).not.toBe(1);
  });
  it('sum compensates many small addends to a large one', () => {
    const xs = [1e16, ...new Array<number>(1000).fill(1)];
    expect(DoubleStream.ofArray(xs).sum()).toBe(1e16 + 1000);
    expect(xs.reduce((a, b) => a + b, 0)).toBe(1e16);
  });
  it('sum of infinities', () => {
    expect(DoubleStream.of(Infinity, 1).sum()).toBe(Infinity);
    expect(DoubleStream.of(Infinity, Infinity).sum()).toBe(Infinity);
    expect(DoubleStream.of(-Infinity, -Infinity).sum()).toBe(-Infinity);
    expect(DoubleStream.of(Infinity, -Infinity).sum()).toBeNaN();
  });
  it('sum with NaN is NaN', () => expect(DoubleStream.of(1, NaN).sum()).toBeNaN());
  it('sum of empty is 0', () => expect(DoubleStream.empty().sum()).toBe(0));
  it('average is compensated', () => {
    expect(DoubleStream.of(0.1, 0.2, 0.3).average().getAsDouble()).toBeCloseTo(0.2, 15);
    expect(DoubleStream.ofArray([1e16, 1, 1, 1, 1]).average().getAsDouble()).toBe((1e16 + 4) / 5);
  });
  it('average of empty', () => expect(DoubleStream.empty().average()).toBe(OptionalDouble.empty()));
  it('min / max follow Math.min/Math.max: NaN wins, -0 < 0', () => {
    expect(DoubleStream.of(1, NaN, -1).min().getAsDouble()).toBeNaN();
    expect(DoubleStream.of(1, NaN).max().getAsDouble()).toBeNaN();
    expect(Object.is(DoubleStream.of(0, -0).min().getAsDouble(), -0)).toBe(true);
    expect(Object.is(DoubleStream.of(-0, 0).max().getAsDouble(), 0)).toBe(true);
    expect(DoubleStream.of(2.5, -1.5).min().getAsDouble()).toBe(-1.5);
    expect(DoubleStream.empty().max().isPresent()).toBe(false);
  });
  it('sorted orders -Infinity, -0, 0, Infinity, NaN', () => {
    const r = DoubleStream.of(NaN, Infinity, 0, -0, -Infinity, 1.5).sorted().toArray();
    expect(r.map((x) => (Object.is(x, -0) ? '-0' : String(x)))).toEqual(['-Infinity', '-0', '0', '1.5', 'Infinity', 'NaN']);
  });
  it('distinct: NaN equals NaN, -0 differs from 0', () => {
    const r = DoubleStream.of(NaN, 0, NaN, -0, 0, -0).distinct().toArray();
    expect(r.length).toBe(3);
    expect(r[0]).toBeNaN();
    expect(Object.is(r[1], 0)).toBe(true);
    expect(Object.is(r[2], -0)).toBe(true);
  });
  it('summaryStatistics', () => {
    const s = DoubleStream.of(0.5, 2.5).summaryStatistics();
    expect(s).toBeInstanceOf(DoubleSummaryStatistics);
    expect([s.getCount(), s.getSum(), s.getMin(), s.getMax(), s.getAverage()]).toEqual([2, 3, 0.5, 2.5, 1.5]);
  });
  it('mapToInt / mapToLong / mapToObj / boxed', () => {
    expect(DoubleStream.of(1.7, -1.7).mapToInt(Math.trunc).toArray()).toEqual([1, -1]);
    expect(DoubleStream.of(2.2).mapToLong(Math.floor).sum()).toBe(2);
    expect(DoubleStream.of(0.5).mapToObj((x) => `${x}`).toArray()).toEqual(['0.5']);
    expect(DoubleStream.of(0.5).boxed().toList().get(0)).toBe(0.5);
  });
  it('filter / map / flatMap / mapMulti / peek', () => {
    const seen: number[] = [];
    expect(
      DoubleStream.of(1, 2, 3)
        .peek((x) => seen.push(x))
        .filter((x) => x !== 2)
        .map((x) => x / 2)
        .flatMap((x) => DoubleStream.of(x, -x))
        .mapMulti((x, e) => e(x * 2))
        .toArray()
    ).toEqual([1, -1, 3, -3]);
    expect(seen).toEqual([1, 2, 3]);
  });
  it('limit / skip / takeWhile / dropWhile', () => {
    expect(DoubleStream.iterate(0, (x) => x + 0.5).skip(1).limit(2).toArray()).toEqual([0.5, 1]);
    expect(DoubleStream.of(0.1, 0.2, 5, 0.1).takeWhile((x) => x < 1).toArray()).toEqual([0.1, 0.2]);
    expect(DoubleStream.of(0.1, 0.2, 5, 0.1).dropWhile((x) => x < 1).toArray()).toEqual([5, 0.1]);
  });
  it('reduce / collect / count', () => {
    expect(DoubleStream.of(0.5, 0.25).reduce(0, (a, b) => a + b)).toBe(0.75);
    expect(DoubleStream.of(0.5, 0.25).reduce((a, b) => a * b).getAsDouble()).toBe(0.125);
    expect(DoubleStream.of(1, 2).collect(() => [] as number[], (a, x) => a.unshift(x), () => {})).toEqual([2, 1]);
    expect(DoubleStream.of(1, 2, 3).filter((x) => x > 1).count()).toBe(2);
  });
  it('findFirst / matching / iteration', () => {
    expect(DoubleStream.of(NaN).findFirst().getAsDouble()).toBeNaN();
    expect(DoubleStream.empty().findAny().isPresent()).toBe(false);
    expect(DoubleStream.of(0.5).anyMatch((x) => x > 0)).toBe(true);
    expect(DoubleStream.of(0.5).allMatch((x) => x > 1)).toBe(false);
    expect(DoubleStream.of(0.5).noneMatch((x) => x > 1)).toBe(true);
    expect([...DoubleStream.of(0.5, 1)]).toEqual([0.5, 1]);
    const out: number[] = [];
    DoubleStream.of(1.5).forEachOrdered((x) => out.push(x));
    expect(out).toEqual([1.5]);
  });
  it('OptionalDouble.stream()', () => expect(OptionalDouble.of(0.5).stream().map((x) => x * 4).sum()).toBe(2));
});
