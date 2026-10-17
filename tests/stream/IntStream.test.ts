import { IllegalArgumentException, IllegalStateException, NoSuchElementException, NullPointerException } from '../../src/exceptions';
import { OptionalDouble, OptionalInt } from '../../src/stream/Optional';
import { Spliterator } from '../../src/stream/Spliterator';
import { IntStream, Stream } from '../../src/stream/Streams';
import { IntSummaryStatistics } from '../../src/util/SummaryStatistics';

describe('IntStream · factories', () => {
  it('range(start, end) is half-open', () => expect(IntStream.range(2, 5).toArray()).toEqual([2, 3, 4]));
  it('rangeClosed(start, end) includes end', () => expect(IntStream.rangeClosed(2, 5).toArray()).toEqual([2, 3, 4, 5]));
  it.each([
    [5, 5],
    [6, 5],
    [0, -10],
  ])('range(%i, %i) is empty', (a, b) => expect(IntStream.range(a, b).count()).toBe(0));
  it('rangeClosed(5, 5) has one element', () => expect(IntStream.rangeClosed(5, 5).toArray()).toEqual([5]));
  it('rangeClosed(6, 5) is empty', () => expect(IntStream.rangeClosed(6, 5).count()).toBe(0));
  it('negative ranges', () => expect(IntStream.range(-3, 0).toArray()).toEqual([-3, -2, -1]));
  it('range at the int limits', () => {
    expect(IntStream.rangeClosed(2147483646, 2147483647).toArray()).toEqual([2147483646, 2147483647]);
    expect(IntStream.range(-2147483648, -2147483646).toArray()).toEqual([-2147483648, -2147483647]);
  });
  it('a huge range is lazy: count() is instant and limit pulls little', () => {
    expect(IntStream.rangeClosed(-2147483648, 2147483647).count()).toBe(4294967296);
    expect(IntStream.range(0, 2147483647).filter((x) => x % 1000 === 999).limit(2).toArray()).toEqual([999, 1999]);
  });
  it('range spliterator is SIZED, SORTED, DISTINCT, ORDERED and splits', () => {
    const sp = IntStream.range(0, 10).spliterator();
    expect(sp.hasCharacteristics(Spliterator.SIZED | Spliterator.SORTED | Spliterator.DISTINCT | Spliterator.ORDERED)).toBe(true);
    expect(sp.getComparator()).toBeNull();
    const prefix = sp.trySplit()!;
    expect(prefix.estimateSize() + sp.estimateSize()).toBe(10);
    const out: number[] = [];
    prefix.forEachRemaining((x) => out.push(x));
    sp.forEachRemaining((x) => out.push(x));
    expect(out).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(IntStream.range(0, 1).spliterator().trySplit()).toBeNull();
  });
  it('range spliterator tryAdvance', () => {
    const sp = IntStream.range(0, 2).spliterator();
    const out: number[] = [];
    while (sp.tryAdvance((x) => out.push(x)));
    expect(out).toEqual([0, 1]);
    expect(sp.estimateSize()).toBe(0);
  });
  it('of(...)', () => expect(IntStream.of(3, 1, 2).toArray()).toEqual([3, 1, 2]));
  it('of() is empty', () => expect(IntStream.of().count()).toBe(0));
  it('ofArray streams an existing array', () => expect(IntStream.ofArray(Int32Array.of(1, 2)).sum()).toBe(3));
  it('empty()', () => expect(IntStream.empty().findFirst()).toBe(OptionalInt.empty()));
  it('iterate(seed, f)', () => expect(IntStream.iterate(1, (x) => x * 3).limit(4).toArray()).toEqual([1, 3, 9, 27]));
  it('iterate(seed, hasNext, next)', () => expect(IntStream.iterate(0, (x) => x < 10, (x) => x + 4).toArray()).toEqual([0, 4, 8]));
  it('generate(s)', () => expect(IntStream.generate(() => 7).limit(3).toArray()).toEqual([7, 7, 7]));
  it('concat', () => expect(IntStream.concat(IntStream.range(0, 2), IntStream.of(9)).toArray()).toEqual([0, 1, 9]));
  it('concat closes both', () => {
    let n = 0;
    IntStream.concat(IntStream.of(1).onClose(() => n++), IntStream.of(2).onClose(() => n++)).close();
    expect(n).toBe(2);
  });
  it('builder', () => {
    const b = IntStream.builder();
    b.accept(1);
    expect(b.add(2).add(3).build().sum()).toBe(6);
    expect(() => b.add(4)).toThrow(IllegalStateException);
  });
});

describe('IntStream · operations', () => {
  it('filter / map', () =>
    expect(
      IntStream.range(0, 10)
        .filter((x) => x % 3 === 0)
        .map((x) => x * x)
        .toArray()
    ).toEqual([0, 9, 36, 81]));
  it('map does not coerce to 32 bits', () => expect(IntStream.of(2147483647).map((x) => x + 1).toArray()).toEqual([2147483648]));
  it('mapToObj', () => expect(IntStream.range(0, 3).mapToObj((i) => 'abc'[i]).toArray()).toEqual(['a', 'b', 'c']));
  it('mapToLong / mapToDouble', () => {
    expect(IntStream.of(1, 2).mapToLong((x) => x * 1e10).sum()).toBe(3e10);
    expect(IntStream.of(1, 2).mapToDouble((x) => x / 4).toArray()).toEqual([0.25, 0.5]);
  });
  it('asLongStream / asDoubleStream keep values', () => {
    expect(IntStream.of(1, 2).asLongStream().toArray()).toEqual([1, 2]);
    expect(IntStream.of(1, 2).asDoubleStream().average().getAsDouble()).toBe(1.5);
  });
  it('boxed', () => {
    const s: Stream<number> = IntStream.of(2, 1).boxed();
    expect(s.sorted().toList().toString()).toBe('[1, 2]');
  });
  it('flatMap', () => expect(IntStream.of(1, 3).flatMap((n) => IntStream.range(0, n)).toArray()).toEqual([0, 0, 1, 2]));
  it('flatMap null is empty', () => expect(IntStream.of(1).flatMap(() => null).count()).toBe(0));
  it('mapMulti', () => expect(IntStream.of(1, 2).mapMulti((x, e) => (e(x), e(-x))).toArray()).toEqual([1, -1, 2, -2]));
  it('distinct keeps first occurrences', () => expect(IntStream.of(3, 1, 3, 1, 2).distinct().toArray()).toEqual([3, 1, 2]));
  it('sorted ascending', () => expect(IntStream.of(10, -1, 2, 100).sorted().toArray()).toEqual([-1, 2, 10, 100]));
  it('sorted then findFirst', () => expect(IntStream.of(5, 3, 9).sorted().findFirst().getAsInt()).toBe(3));
  it('peek', () => {
    const seen: number[] = [];
    IntStream.of(1, 2)
      .peek((x) => seen.push(x))
      .sum();
    expect(seen).toEqual([1, 2]);
  });
  it('limit / skip', () => {
    expect(IntStream.range(0, 10).skip(3).limit(2).toArray()).toEqual([3, 4]);
    expect(() => IntStream.of(1).limit(-1)).toThrow(IllegalArgumentException);
    expect(() => IntStream.of(1).skip(-1)).toThrow(IllegalArgumentException);
  });
  it('takeWhile / dropWhile', () => {
    expect(IntStream.iterate(1, (x) => x + 1).takeWhile((x) => x < 4).toArray()).toEqual([1, 2, 3]);
    expect(IntStream.range(0, 6).dropWhile((x) => x < 4).toArray()).toEqual([4, 5]);
  });
  it('unordered / parallel flags', () => {
    const s = IntStream.range(0, 3).parallel();
    expect(s.isParallel()).toBe(true);
    expect(s.unordered().sum()).toBe(3);
  });

  it('sum', () => expect(IntStream.rangeClosed(1, 100).sum()).toBe(5050));
  it('sum of empty is 0', () => expect(IntStream.empty().sum()).toBe(0));
  it('sum does not wrap on overflow (documented difference)', () => expect(IntStream.of(2147483647, 1).sum()).toBe(2147483648));
  it('min / max', () => {
    expect(IntStream.of(3, -2, 7).min().getAsInt()).toBe(-2);
    expect(IntStream.of(3, -2, 7).max().getAsInt()).toBe(7);
  });
  it('min / max of empty', () => {
    expect(IntStream.empty().min().isPresent()).toBe(false);
    expect(IntStream.empty().max()).toBe(OptionalInt.empty());
  });
  it('average', () => expect(IntStream.of(1, 2).average().getAsDouble()).toBe(1.5));
  it('average of empty is empty', () => expect(IntStream.empty().average()).toBe(OptionalDouble.empty()));
  it('count', () => expect(IntStream.range(0, 50).filter((x) => x % 2 === 1).count()).toBe(25));
  it('count of a sized range skips traversal', () => {
    let peeks = 0;
    expect(
      IntStream.range(0, 10)
        .peek(() => peeks++)
        .count()
    ).toBe(10);
    expect(peeks).toBe(0);
  });
  it('summaryStatistics', () => {
    const s = IntStream.of(4, 1, 7).summaryStatistics();
    expect(s).toBeInstanceOf(IntSummaryStatistics);
    expect([s.getCount(), s.getSum(), s.getMin(), s.getMax(), s.getAverage()]).toEqual([3, 12, 1, 7, 4]);
  });
  it('summaryStatistics of empty', () => {
    const s = IntStream.empty().summaryStatistics();
    expect(s.getCount()).toBe(0);
    expect(s.getMin()).toBe(2147483647);
    expect(s.getMax()).toBe(-2147483648);
  });
  it('reduce(identity, op)', () => expect(IntStream.of(1, 2, 3).reduce(10, (a, b) => a + b)).toBe(16));
  it('reduce(op)', () => {
    expect(IntStream.of(2, 3).reduce((a, b) => a * b).getAsInt()).toBe(6);
    expect(IntStream.empty().reduce((a, b) => a * b).isPresent()).toBe(false);
  });
  it('collect(supplier, accumulator, combiner)', () =>
    expect(
      IntStream.range(0, 4).collect(
        () => [] as number[],
        (a, x) => a.push(x),
        (a, b) => a.push(...b)
      )
    ).toEqual([0, 1, 2, 3]));
  it('findFirst / findAny', () => {
    expect(IntStream.of(5, 6).findFirst().getAsInt()).toBe(5);
    expect(IntStream.of(5, 6).findAny().getAsInt()).toBe(5);
    expect(() => IntStream.empty().findFirst().getAsInt()).toThrow(NoSuchElementException);
  });
  it('findFirst short-circuits an infinite stream', () => expect(IntStream.iterate(1, (x) => x * 2).filter((x) => x > 1000).findFirst().getAsInt()).toBe(1024));
  it('anyMatch / allMatch / noneMatch', () => {
    expect(IntStream.range(0, 5).anyMatch((x) => x === 4)).toBe(true);
    expect(IntStream.range(0, 5).allMatch((x) => x < 5)).toBe(true);
    expect(IntStream.range(0, 5).noneMatch((x) => x > 3)).toBe(false);
    expect(IntStream.generate(() => 1).anyMatch((x) => x === 1)).toBe(true);
  });
  it('forEach / forEachOrdered', () => {
    const out: number[] = [];
    IntStream.range(0, 3).forEach((x) => out.push(x));
    IntStream.range(3, 5).forEachOrdered((x) => out.push(x));
    expect(out).toEqual([0, 1, 2, 3, 4]);
  });
  it('iterator and JS iteration', () => {
    const it = IntStream.range(0, 2).iterator();
    expect([it.next(), it.next(), it.hasNext()]).toEqual([0, 1, false]);
    expect([...IntStream.of(4, 5)]).toEqual([4, 5]);
  });
  it('single use', () => {
    const s = IntStream.range(0, 3);
    s.sum();
    expect(() => s.sum()).toThrow(IllegalStateException);
  });
  it('null arguments are rejected', () => {
    expect(() => IntStream.of(1).map(null as unknown as (x: number) => number)).toThrow(NullPointerException);
    expect(() => IntStream.of(1).mapToObj(null as unknown as (x: number) => number)).toThrow(NullPointerException);
    expect(() => IntStream.generate(null as unknown as () => number)).toThrow(NullPointerException);
  });
  it('OptionalInt.stream() round trip', () => expect(OptionalInt.of(3).stream().map((x) => x + 1).toArray()).toEqual([4]));
});
