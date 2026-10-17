import { IllegalStateException, NullPointerException } from '../../src/exceptions';
import { OptionalLong } from '../../src/stream/Optional';
import { LongStream } from '../../src/stream/Streams';
import { LongSummaryStatistics } from '../../src/util/SummaryStatistics';

const BIG = 2 ** 40;

describe('LongStream', () => {
  it('range beyond 32 bits', () => expect(LongStream.range(BIG, BIG + 3).toArray()).toEqual([BIG, BIG + 1, BIG + 2]));
  it('rangeClosed up to MAX_SAFE_INTEGER', () =>
    expect(LongStream.rangeClosed(Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER).toArray()).toEqual([
      Number.MAX_SAFE_INTEGER - 1,
      Number.MAX_SAFE_INTEGER,
    ]));
  it('empty ranges', () => {
    expect(LongStream.range(BIG, BIG).count()).toBe(0);
    expect(LongStream.rangeClosed(BIG + 1, BIG).count()).toBe(0);
  });
  it('count of a huge range does not traverse', () => expect(LongStream.range(0, 2 ** 50).count()).toBe(2 ** 50));
  it('a huge range is lazy under limit', () => expect(LongStream.range(BIG, 2 ** 50).skip(5).limit(2).toArray()).toEqual([BIG + 5, BIG + 6]));
  it('of / empty / iterate / generate / concat / builder', () => {
    expect(LongStream.of(1, 2).sum()).toBe(3);
    expect(LongStream.empty().count()).toBe(0);
    expect(LongStream.iterate(1, (x) => x * 1000).limit(3).toArray()).toEqual([1, 1000, 1e6]);
    expect(LongStream.iterate(1, (x) => x < 1e7, (x) => x * 1000).toArray()).toEqual([1, 1000, 1e6]);
    expect(LongStream.generate(() => BIG).limit(2).sum()).toBe(2 * BIG);
    expect(LongStream.concat(LongStream.of(1), LongStream.of(2)).toArray()).toEqual([1, 2]);
    expect(LongStream.builder().add(5).build().toArray()).toEqual([5]);
    expect(LongStream.ofArray([7, 8]).max().getAsLong()).toBe(8);
  });
  it('builder rejects use after build', () => {
    const b = LongStream.builder();
    b.build();
    expect(() => b.accept(1)).toThrow(IllegalStateException);
  });
  it('sum / min / max / average', () => {
    const xs = [BIG, -5, 3];
    expect(LongStream.of(...xs).sum()).toBe(BIG - 2);
    expect(LongStream.of(...xs).min().getAsLong()).toBe(-5);
    expect(LongStream.of(...xs).max().getAsLong()).toBe(BIG);
    expect(LongStream.of(1, 2, 4).average().getAsDouble()).toBeCloseTo(7 / 3, 12);
  });
  it('min / max / average of empty', () => {
    expect(LongStream.empty().min()).toBe(OptionalLong.empty());
    expect(LongStream.empty().max().isPresent()).toBe(false);
    expect(LongStream.empty().average().isPresent()).toBe(false);
  });
  it('summaryStatistics', () => {
    const s = LongStream.of(BIG, 1).summaryStatistics();
    expect(s).toBeInstanceOf(LongSummaryStatistics);
    expect([s.getCount(), s.getSum(), s.getMin(), s.getMax()]).toEqual([2, BIG + 1, 1, BIG]);
  });
  it('mapToInt / mapToDouble / asDoubleStream / mapToObj / boxed', () => {
    expect(LongStream.of(BIG).mapToInt((x) => x / BIG).toArray()).toEqual([1]);
    expect(LongStream.of(3).mapToDouble((x) => x / 2).toArray()).toEqual([1.5]);
    expect(LongStream.of(3).asDoubleStream().sum()).toBe(3);
    expect(LongStream.of(3).mapToObj(String).toArray()).toEqual(['3']);
    expect(LongStream.of(3, 1).boxed().sorted().toArray()).toEqual([1, 3]);
  });
  it('sorted / distinct', () => {
    expect(LongStream.of(BIG, 1, -BIG).sorted().toArray()).toEqual([-BIG, 1, BIG]);
    expect(LongStream.of(BIG, BIG, 1).distinct().toArray()).toEqual([BIG, 1]);
  });
  it('flatMap / mapMulti', () => {
    expect(LongStream.of(1, 2).flatMap((x) => LongStream.of(x, x)).toArray()).toEqual([1, 1, 2, 2]);
    expect(LongStream.of(1).mapMulti((x, e) => e(x + BIG)).toArray()).toEqual([BIG + 1]);
  });
  it('reduce / collect / findFirst / matching', () => {
    expect(LongStream.of(2, 3).reduce(1, (a, b) => a * b)).toBe(6);
    expect(LongStream.of(2, 3).reduce((a, b) => a - b).getAsLong()).toBe(-1);
    expect(LongStream.of(4, 5).collect(() => [0], (a, x) => (a[0] += x), () => {})).toEqual([9]);
    expect(LongStream.of(4, 5).findFirst().getAsLong()).toBe(4);
    expect(LongStream.of(4, 5).findAny()).toEqual(OptionalLong.of(4));
    expect(LongStream.of(4, 5).anyMatch((x) => x === 5)).toBe(true);
    expect(LongStream.of(4, 5).allMatch((x) => x === 5)).toBe(false);
    expect(LongStream.of(4, 5).noneMatch((x) => x === 6)).toBe(true);
  });
  it('takeWhile / dropWhile / peek / filter / map', () => {
    const seen: number[] = [];
    expect(
      LongStream.range(0, 10)
        .peek((x) => seen.push(x))
        .filter((x) => x % 2 === 0)
        .map((x) => x * BIG)
        .takeWhile((x) => x < 4 * BIG)
        .toArray()
    ).toEqual([0, 2 * BIG]);
    expect(seen).toEqual([0, 1, 2, 3, 4]);
    expect(LongStream.range(0, 5).dropWhile((x) => x < 3).toArray()).toEqual([3, 4]);
  });
  it('iterator / forEach / JS iteration', () => {
    const out: number[] = [];
    LongStream.of(1, 2).forEach((x) => out.push(x));
    LongStream.of(3).forEachOrdered((x) => out.push(x));
    expect(out).toEqual([1, 2, 3]);
    expect(LongStream.of(1).iterator().next()).toBe(1);
    expect(Array.from(LongStream.of(1, 2))).toEqual([1, 2]);
  });
  it('null mapper is rejected', () => expect(() => LongStream.of(1).mapToInt(null as unknown as (x: number) => number)).toThrow(NullPointerException));
  it('OptionalLong.stream()', () => expect(OptionalLong.of(BIG).stream().sum()).toBe(BIG));
});
