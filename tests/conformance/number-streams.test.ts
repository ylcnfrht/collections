// Conformance: IntStream, LongStream, DoubleStream.
import { DoubleStream, IntStream, LongStream, OptionalDouble, OptionalInt, OptionalLong, Stream } from '../../src';
import { expectThrows } from '../helpers';

const ISE = 'IllegalStateException';

describe('IntStream.range / rangeClosed', () => {
  // range: "from startInclusive (inclusive) to endExclusive (exclusive) by an incremental step of 1"
  it('range(0, 5)', () => expect(IntStream.range(0, 5).toArray()).toEqual([0, 1, 2, 3, 4]));
  it('range(a, a) is empty', () => expect(IntStream.range(3, 3).count()).toBe(0));
  it('range(5, 0) is empty', () => expect(IntStream.range(5, 0).count()).toBe(0));
  it('range with negative bounds', () => expect(IntStream.range(-2, 2).toArray()).toEqual([-2, -1, 0, 1]));
  it('range(a, a+1) has one element', () => expect(IntStream.range(7, 8).toArray()).toEqual([7]));
  it('range count', () => expect(IntStream.range(0, 1000).count()).toBe(1000));
  it('range sum', () => expect(IntStream.range(1, 101).sum()).toBe(5050));
  it('range at the int max boundary', () => expect(IntStream.range(2147483645, 2147483647).toArray()).toEqual([2147483645, 2147483646]));
  // rangeClosed: "from startInclusive (inclusive) to endInclusive (inclusive) by an incremental step of 1"
  it('rangeClosed(1, 5)', () => expect(IntStream.rangeClosed(1, 5).toArray()).toEqual([1, 2, 3, 4, 5]));
  it('rangeClosed(a, a) has one element', () => expect(IntStream.rangeClosed(4, 4).toArray()).toEqual([4]));
  it('rangeClosed(1, 0) is empty', () => expect(IntStream.rangeClosed(1, 0).count()).toBe(0));
  it('rangeClosed up to the int max', () =>
    expect(IntStream.rangeClosed(2147483645, 2147483647).toArray()).toEqual([2147483645, 2147483646, 2147483647]));
  it('rangeClosed from the int min', () =>
    expect(IntStream.rangeClosed(-2147483648, -2147483647).toArray()).toEqual([-2147483648, -2147483647]));
  it('range then limit', () => expect(IntStream.range(0, 1000000).limit(3).toArray()).toEqual([0, 1, 2]));
  it('range then skip', () => expect(IntStream.range(0, 10).skip(8).toArray()).toEqual([8, 9]));
  it('range is ordered and sorted ascending', () => expect(IntStream.range(0, 5).boxed().toArray()).toEqual([0, 1, 2, 3, 4]));
  it('LongStream.range', () => expect(LongStream.range(10, 13).toArray()).toEqual([10, 11, 12]));
  it('LongStream.range empty', () => expect(LongStream.range(1, 1).count()).toBe(0));
  it('LongStream.rangeClosed', () => expect(LongStream.rangeClosed(-1, 1).toArray()).toEqual([-1, 0, 1]));
  it('LongStream.rangeClosed beyond int range', () =>
    expect(LongStream.rangeClosed(4294967296, 4294967298).toArray()).toEqual([4294967296, 4294967297, 4294967298]));
  it('LongStream.rangeClosed empty', () => expect(LongStream.rangeClosed(2, 1).count()).toBe(0));
});

describe('number stream factories', () => {
  it('IntStream.of', () => expect(IntStream.of(3, 1, 2).toArray()).toEqual([3, 1, 2]));
  it('IntStream.of() empty', () => expect(IntStream.of().count()).toBe(0));
  it('IntStream.empty', () => expect(IntStream.empty().sum()).toBe(0));
  it('IntStream.iterate(seed, f)', () => expect(IntStream.iterate(1, (i) => i * 3).limit(4).toArray()).toEqual([1, 3, 9, 27]));
  it('IntStream.iterate(seed, hasNext, next)', () => expect(IntStream.iterate(0, (i) => i < 10, (i) => i + 4).toArray()).toEqual([0, 4, 8]));
  it('IntStream.iterate 3-arg empty', () => expect(IntStream.iterate(5, (i) => i < 0, (i) => i + 1).count()).toBe(0));
  it('IntStream.generate', () => expect(IntStream.generate(() => 7).limit(2).toArray()).toEqual([7, 7]));
  it('IntStream.concat', () => expect(IntStream.concat(IntStream.of(1), IntStream.range(2, 4)).toArray()).toEqual([1, 2, 3]));
  it('IntStream.concat closes both', () => {
    const log: string[] = [];
    IntStream.concat(IntStream.of(1).onClose(() => log.push('a')), IntStream.of(2).onClose(() => log.push('b'))).close();
    expect(log).toEqual(['a', 'b']);
  });
  it('IntStream.builder', () => {
    const b = IntStream.builder();
    b.accept(1);
    b.add(2).add(3);
    expect(b.build().toArray()).toEqual([1, 2, 3]);
  });
  it('IntStream.builder after build throws IllegalStateException', () => {
    const b = IntStream.builder();
    b.build();
    expectThrows(() => b.add(1), ISE);
  });
  it('LongStream.of / empty / iterate / generate', () => {
    expect(LongStream.of(5, 6).toArray()).toEqual([5, 6]);
    expect(LongStream.empty().count()).toBe(0);
    expect(LongStream.iterate(1, (x) => x * 10).limit(3).toArray()).toEqual([1, 10, 100]);
    expect(LongStream.iterate(1, (x) => x < 50, (x) => x * 5).toArray()).toEqual([1, 5, 25]);
    expect(LongStream.generate(() => 2).limit(2).sum()).toBe(4);
  });
  it('LongStream.concat', () => expect(LongStream.concat(LongStream.of(1), LongStream.of(2)).toArray()).toEqual([1, 2]));
  it('LongStream.builder', () => expect(LongStream.builder().add(9).build().toArray()).toEqual([9]));
  it('DoubleStream.of / empty', () => {
    expect(DoubleStream.of(0.5, 1.5).toArray()).toEqual([0.5, 1.5]);
    expect(DoubleStream.empty().count()).toBe(0);
  });
  it('DoubleStream.iterate 2-arg and 3-arg', () => {
    expect(DoubleStream.iterate(1, (d) => d / 2).limit(3).toArray()).toEqual([1, 0.5, 0.25]);
    expect(DoubleStream.iterate(0, (d) => d < 1, (d) => d + 0.25).toArray()).toEqual([0, 0.25, 0.5, 0.75]);
  });
  it('DoubleStream.generate', () => expect(DoubleStream.generate(() => 1.5).limit(2).toArray()).toEqual([1.5, 1.5]));
  it('DoubleStream.concat', () => expect(DoubleStream.concat(DoubleStream.of(1.5), DoubleStream.of(2.5)).toArray()).toEqual([1.5, 2.5]));
  it('DoubleStream.builder', () => expect(DoubleStream.builder().add(0.1).add(0.2).build().count()).toBe(2));
});

describe('sum / min / max / count / average', () => {
  it('IntStream.sum', () => expect(IntStream.of(1, 2, 3).sum()).toBe(6));
  it('IntStream.sum of empty is 0', () => expect(IntStream.empty().sum()).toBe(0));
  it('IntStream.min', () => expect(IntStream.of(3, -1, 2).min().getAsInt()).toBe(-1));
  it('IntStream.max', () => expect(IntStream.of(3, -1, 2).max().getAsInt()).toBe(3));
  it('IntStream.min of empty is OptionalInt.empty', () => expect(IntStream.empty().min().equals(OptionalInt.empty())).toBe(true));
  it('IntStream.max of empty is empty', () => expect(IntStream.empty().max().isPresent()).toBe(false));
  it('IntStream.count', () => expect(IntStream.of(1, 1, 1).count()).toBe(3));
  // "Returns an OptionalDouble describing the arithmetic mean of elements of this stream, or an empty optional if this stream is empty."
  it('IntStream.average', () => expect(IntStream.of(1, 2).average().getAsDouble()).toBe(1.5));
  it('IntStream.average of empty is OptionalDouble.empty', () => expect(IntStream.empty().average().equals(OptionalDouble.empty())).toBe(true));
  it('IntStream.average returns an OptionalDouble', () => expect(IntStream.of(4).average()).toBeInstanceOf(OptionalDouble));
  it('IntStream.min returns an OptionalInt', () => expect(IntStream.of(4).min()).toBeInstanceOf(OptionalInt));
  it('LongStream.sum / min / max / average', () => {
    const s = () => LongStream.of(10, 20, 30);
    expect(s().sum()).toBe(60);
    expect(s().min().getAsLong()).toBe(10);
    expect(s().max().getAsLong()).toBe(30);
    expect(s().average().getAsDouble()).toBe(20);
  });
  it('LongStream.min returns OptionalLong', () => expect(LongStream.of(1).min()).toBeInstanceOf(OptionalLong));
  it('LongStream.max of empty is empty', () => expect(LongStream.empty().max().equals(OptionalLong.empty())).toBe(true));
  it('LongStream.average of empty is empty', () => expect(LongStream.empty().average().isEmpty()).toBe(true));
  it('LongStream.sum beyond int range', () => expect(LongStream.of(2147483647, 2147483647).sum()).toBe(4294967294));
  it('DoubleStream.sum', () => expect(DoubleStream.of(0.5, 0.25).sum()).toBe(0.75));
  it('DoubleStream.sum of empty is 0', () => expect(DoubleStream.empty().sum()).toBe(0));
  it('DoubleStream.sum of many 0.1s is close to the exact value', () =>
    expect(DoubleStream.generate(() => 0.1).limit(10).sum()).toBeCloseTo(1.0, 12));
  // DoubleStream.sum: "If any stream element is a NaN or the sum is at any point a NaN then the sum will be NaN."
  it('DoubleStream.sum with NaN is NaN', () => expect(DoubleStream.of(1, NaN, 2).sum()).toBeNaN());
  it('DoubleStream.sum of +Infinity and -Infinity is NaN', () => expect(DoubleStream.of(Infinity, -Infinity).sum()).toBeNaN());
  it('DoubleStream.sum of infinities of one sign is that infinity', () => expect(DoubleStream.of(Infinity, 1, Infinity).sum()).toBe(Infinity));
  // DoubleStream.min: "If any stream element is a NaN, then the result will be NaN."
  it('DoubleStream.min with NaN is NaN', () => expect(DoubleStream.of(1, NaN, -2).min().getAsDouble()).toBeNaN());
  it('DoubleStream.max with NaN is NaN', () => expect(DoubleStream.of(1, NaN).max().getAsDouble()).toBeNaN());
  it('DoubleStream.min / max', () => {
    expect(DoubleStream.of(1.5, -0.5).min().getAsDouble()).toBe(-0.5);
    expect(DoubleStream.of(1.5, -0.5).max().getAsDouble()).toBe(1.5);
  });
  // equivalent to reduce(Double::min): -0.0 is less than 0.0
  it('DoubleStream.min treats -0.0 as smaller than 0.0', () => expect(Object.is(DoubleStream.of(0, -0).min().getAsDouble(), -0)).toBe(true));
  it('DoubleStream.max treats 0.0 as greater than -0.0', () => expect(Object.is(DoubleStream.of(-0, 0).max().getAsDouble(), 0)).toBe(true));
  it('DoubleStream.min of empty is empty', () => expect(DoubleStream.empty().min().equals(OptionalDouble.empty())).toBe(true));
  it('DoubleStream.average', () => expect(DoubleStream.of(1, 2, 4).average().getAsDouble()).toBeCloseTo(7 / 3, 12));
  it('DoubleStream.average of empty is empty', () => expect(DoubleStream.empty().average().isPresent()).toBe(false));
  it('DoubleStream.average with NaN is NaN', () => expect(DoubleStream.of(1, NaN).average().getAsDouble()).toBeNaN());
});

describe('number stream reduce / collect / match / find', () => {
  it('IntStream.reduce(identity, op)', () => expect(IntStream.rangeClosed(1, 5).reduce(1, (a, b) => a * b)).toBe(120));
  it('IntStream.reduce(op) gives OptionalInt', () => expect(IntStream.of(3, 4).reduce((a, b) => a + b).getAsInt()).toBe(7));
  it('IntStream.reduce(op) of empty is empty', () => expect(IntStream.empty().reduce((a, b) => a + b).isPresent()).toBe(false));
  it('LongStream.reduce(op) gives OptionalLong', () => expect(LongStream.of(3, 4).reduce((a, b) => a * b).getAsLong()).toBe(12));
  it('DoubleStream.reduce(op) gives OptionalDouble', () => expect(DoubleStream.of(0.5, 2).reduce((a, b) => a * b).getAsDouble()).toBe(1));
  it('IntStream.collect 3-arg', () =>
    expect(IntStream.range(0, 3).collect(() => [] as number[], (a, x) => a.push(x), (a, b) => a.push(...b))).toEqual([0, 1, 2]));
  it('IntStream.anyMatch / allMatch / noneMatch', () => {
    expect(IntStream.of(1, 2).anyMatch((x) => x === 2)).toBe(true);
    expect(IntStream.of(1, 2).allMatch((x) => x > 0)).toBe(true);
    expect(IntStream.of(1, 2).noneMatch((x) => x > 1)).toBe(false);
    expect(IntStream.empty().allMatch(() => false)).toBe(true);
  });
  it('IntStream.findFirst / findAny', () => {
    expect(IntStream.of(5, 6).findFirst().getAsInt()).toBe(5);
    expect(IntStream.empty().findFirst().isPresent()).toBe(false);
    expect([5, 6]).toContain(IntStream.of(5, 6).findAny().getAsInt());
  });
  it('DoubleStream.findFirst', () => expect(DoubleStream.of(2.5).findFirst().getAsDouble()).toBe(2.5));
  it('LongStream.findFirst on empty', () => expect(LongStream.empty().findFirst().equals(OptionalLong.empty())).toBe(true));
  it('forEach / forEachOrdered', () => {
    const out: number[] = [];
    IntStream.range(0, 3).forEach((x) => out.push(x));
    IntStream.range(3, 5).parallel().forEachOrdered((x) => out.push(x));
    expect(out).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('number stream intermediate operations', () => {
  it('IntStream.filter / map', () => expect(IntStream.range(0, 6).filter((i) => i % 2 === 0).map((i) => i * i).toArray()).toEqual([0, 4, 16]));
  it('IntStream.mapToObj', () => expect(IntStream.range(0, 3).mapToObj((i) => 'x' + i).toArray()).toEqual(['x0', 'x1', 'x2']));
  it('IntStream.mapToLong', () => expect(IntStream.of(1, 2).mapToLong((i) => i * 4294967296).toArray()).toEqual([4294967296, 8589934592]));
  it('IntStream.mapToDouble', () => expect(IntStream.of(1, 2).mapToDouble((i) => i / 4).toArray()).toEqual([0.25, 0.5]));
  it('IntStream.flatMap', () => expect(IntStream.of(1, 2).flatMap((i) => IntStream.of(i, i)).toArray()).toEqual([1, 1, 2, 2]));
  it('IntStream.flatMap null is empty', () => expect(IntStream.of(1, 2).flatMap((i) => (i === 1 ? null : IntStream.of(i))).toArray()).toEqual([2]));
  it('IntStream.flatMap closes inner streams', () => {
    const log: number[] = [];
    IntStream.of(1, 2)
      .flatMap((i) => IntStream.of(i).onClose(() => log.push(i)))
      .toArray();
    expect(log).toEqual([1, 2]);
  });
  it('IntStream.mapMulti', () => expect(IntStream.of(1, 2).mapMulti((i, c) => (c(i), c(-i))).toArray()).toEqual([1, -1, 2, -2]));
  it('IntStream.distinct', () => expect(IntStream.of(3, 1, 3, 2, 1).distinct().toArray()).toEqual([3, 1, 2]));
  it('IntStream.sorted', () => expect(IntStream.of(3, -1, 2).sorted().toArray()).toEqual([-1, 2, 3]));
  it('IntStream.peek', () => {
    const seen: number[] = [];
    IntStream.of(1, 2).peek((i) => seen.push(i)).sum();
    expect(seen).toEqual([1, 2]);
  });
  it('IntStream.limit / skip', () => expect(IntStream.range(0, 10).skip(3).limit(2).toArray()).toEqual([3, 4]));
  it('IntStream.dropWhile', () => expect(IntStream.of(1, 2, 5, 1).dropWhile((i) => i < 3).toArray()).toEqual([5, 1]));
  it('LongStream.map / filter / mapToObj', () =>
    expect(LongStream.rangeClosed(1, 4).map((x) => x * 2).filter((x) => x > 2).mapToObj((x) => `${x}`).toArray()).toEqual(['4', '6', '8']));
  it('LongStream.mapToInt / mapToDouble', () => {
    expect(LongStream.of(3).mapToInt((x) => x + 1).toArray()).toEqual([4]);
    expect(LongStream.of(3).mapToDouble((x) => x / 2).toArray()).toEqual([1.5]);
  });
  it('LongStream.sorted / distinct', () => expect(LongStream.of(5, 1, 5, 3).distinct().sorted().toArray()).toEqual([1, 3, 5]));
  it('DoubleStream.map / filter / mapToObj', () =>
    expect(DoubleStream.of(1, 2, 3).map((d) => d / 2).filter((d) => d > 0.5).mapToObj((d) => d.toFixed(1)).toArray()).toEqual(['1.0', '1.5']));
  it('DoubleStream.mapToInt / mapToLong', () => {
    expect(DoubleStream.of(2).mapToInt((d) => d * 3).toArray()).toEqual([6]);
    expect(DoubleStream.of(2).mapToLong((d) => d * 3).toArray()).toEqual([6]);
  });
  // DoubleStream.sorted/distinct: "The elements are compared for equality according to Double.compare(double, double)."
  it('DoubleStream.sorted places NaN last', () => {
    const r = DoubleStream.of(NaN, 1, -Infinity, 0.5).sorted().toArray();
    expect(r.slice(0, 3)).toEqual([-Infinity, 0.5, 1]);
    expect(r[3]).toBeNaN();
  });
  it('DoubleStream.distinct collapses NaNs', () => expect(DoubleStream.of(NaN, NaN, 1).distinct().count()).toBe(2));
  it('DoubleStream.distinct keeps -0.0 and 0.0 apart (Double.compare)', () => expect(DoubleStream.of(0, -0).distinct().count()).toBe(2));
  it('DoubleStream.sorted puts -0.0 before 0.0 (Double.compare)', () => {
    const r = DoubleStream.of(0, -0).sorted().toArray();
    expect(Object.is(r[0], -0)).toBe(true);
    expect(Object.is(r[1], 0)).toBe(true);
  });
  it('DoubleStream.flatMap / mapMulti', () => {
    expect(DoubleStream.of(1).flatMap((d) => DoubleStream.of(d, d + 0.5)).toArray()).toEqual([1, 1.5]);
    expect(DoubleStream.of(1).mapMulti((d, c) => c(d * 2)).toArray()).toEqual([2]);
  });
  it('DoubleStream.takeWhile', () => expect(DoubleStream.iterate(0, (d) => d + 0.5).takeWhile((d) => d < 1.2).toArray()).toEqual([0, 0.5, 1]));
});

describe('conversions: boxed / asLongStream / asDoubleStream', () => {
  it('IntStream.boxed gives a Stream of the same values', () => {
    const s: Stream<number> = IntStream.range(0, 3).boxed();
    expect(s.map((x) => x + 1).toArray()).toEqual([1, 2, 3]);
  });
  it('IntStream.asLongStream', () => expect(IntStream.of(1, 2).asLongStream().sum()).toBe(3));
  it('IntStream.asDoubleStream', () => expect(IntStream.of(1, 2).asDoubleStream().average().getAsDouble()).toBe(1.5));
  it('IntStream.asDoubleStream keeps values', () => expect(IntStream.of(-3, 4).asDoubleStream().toArray()).toEqual([-3, 4]));
  it('LongStream.asDoubleStream', () => expect(LongStream.of(4294967296).asDoubleStream().toArray()).toEqual([4294967296]));
  it('LongStream.boxed', () => expect(LongStream.of(1, 2).boxed().toList().toArray()).toEqual([1, 2]));
  it('DoubleStream.boxed', () => expect(DoubleStream.of(0.5).boxed().findFirst().get()).toBe(0.5));
  it('Stream.mapToInt then boxed round-trip', () => expect(Stream.of('a', 'bb').mapToInt((s) => s.length).boxed().toArray()).toEqual([1, 2]));
  it('conversions preserve the parallel flag', () => expect(IntStream.range(0, 3).parallel().boxed().isParallel()).toBe(true));
  it('conversion consumes the original stream', () => {
    const s = IntStream.of(1);
    s.boxed();
    expectThrows(() => s.sum(), ISE);
  });
});

describe('summaryStatistics on number streams', () => {
  it('IntStream.summaryStatistics', () => {
    const st = IntStream.of(1, 2, 3).summaryStatistics();
    expect([st.getCount(), st.getSum(), st.getMin(), st.getMax(), st.getAverage()]).toEqual([3, 6, 1, 3, 2]);
  });
  it('IntStream.summaryStatistics toString', () =>
    expect(IntStream.of(1, 2, 3).summaryStatistics().toString()).toBe('IntSummaryStatistics{count=3, sum=6, min=1, average=2.000000, max=3}'));
  // IntSummaryStatistics.getMin: "or Integer.MAX_VALUE if none have been recorded"
  it('IntStream.summaryStatistics of empty', () => {
    const st = IntStream.empty().summaryStatistics();
    expect([st.getCount(), st.getSum(), st.getMin(), st.getMax(), st.getAverage()]).toEqual([0, 0, 2147483647, -2147483648, 0]);
  });
  it('LongStream.summaryStatistics', () => {
    const st = LongStream.of(10, 20).summaryStatistics();
    expect([st.getCount(), st.getSum(), st.getMin(), st.getMax(), st.getAverage()]).toEqual([2, 30, 10, 20, 15]);
  });
  it('DoubleStream.summaryStatistics', () => {
    const st = DoubleStream.of(1.5, 2.5).summaryStatistics();
    expect([st.getCount(), st.getSum(), st.getMin(), st.getMax(), st.getAverage()]).toEqual([2, 4, 1.5, 2.5, 2]);
  });
  it('DoubleStream.summaryStatistics of empty: min Infinity, max -Infinity', () => {
    const st = DoubleStream.empty().summaryStatistics();
    expect([st.getCount(), st.getSum(), st.getMin(), st.getMax(), st.getAverage()]).toEqual([0, 0, Infinity, -Infinity, 0]);
  });
});

describe('number stream iterators and parallel', () => {
  it('IntStream.iterator', () => {
    const it = IntStream.range(0, 2).iterator();
    expect([it.next(), it.next(), it.hasNext()]).toEqual([0, 1, false]);
  });
  it('IntStream is JS-iterable', () => expect([...IntStream.rangeClosed(1, 3)]).toEqual([1, 2, 3]));
  it('parallel IntStream gives sequential results', () =>
    expect(IntStream.range(0, 100).parallel().filter((i) => i % 7 === 0).toArray()).toEqual(IntStream.range(0, 100).filter((i) => i % 7 === 0).toArray()));
  it('parallel sum equals sequential sum', () => expect(IntStream.range(0, 1000).parallel().sum()).toBe(499500));
  it('unordered / sequential keep the elements', () => expect(IntStream.of(2, 1).unordered().sequential().sorted().toArray()).toEqual([1, 2]));
});
