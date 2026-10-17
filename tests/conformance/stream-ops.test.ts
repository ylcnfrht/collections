// Conformance: Stream intermediate operations.
import { Comparator, DoubleStream, IntStream, List, LongStream, Optional, Stream } from '../../src';
import { expectThrows, Point } from '../helpers';

const IAE = 'IllegalArgumentException';

describe('filter', () => {
  it('keeps matching elements in order', () => expect(Stream.of(1, 2, 3, 4, 5).filter((x) => x % 2 === 1).toArray()).toEqual([1, 3, 5]));
  it('can remove everything', () => expect(Stream.of(1, 2).filter(() => false).count()).toBe(0));
  it('can keep everything', () => expect(Stream.of(1, 2).filter(() => true).toArray()).toEqual([1, 2]));
  it('sees null elements', () => expect(Stream.of<string | null>('a', null, 'b').filter((x) => x !== null).toArray()).toEqual(['a', 'b']));
  it('predicate called once per element', () => {
    const seen: number[] = [];
    Stream.of(3, 4).filter((x) => (seen.push(x), true)).toArray();
    expect(seen).toEqual([3, 4]);
  });
});

describe('map', () => {
  // package summary: "if the source is a List containing [1, 2, 3], then the result of executing map(x -> x*2) must be [2, 4, 6]"
  it('map(x -> x*2) over [1, 2, 3] is [2, 4, 6]', () => expect(List.of(1, 2, 3).stream().map((x) => x * 2).toArray()).toEqual([2, 4, 6]));
  it('changes the element type', () => expect(Stream.of(1, 22).map(String).toArray()).toEqual(['1', '22']));
  it('may map to null', () => expect(Stream.of(1, 2).map((x) => (x === 1 ? null : x)).toArray()).toEqual([null, 2]));
  it('chained maps compose', () => expect(Stream.of(1).map((x) => x + 1).map((x) => x * 10).toArray()).toEqual([20]));
  it('mapToInt gives an IntStream', () => expect(Stream.of('a', 'bb', 'ccc').mapToInt((s) => s.length).sum()).toBe(6));
  it('mapToLong gives a LongStream', () => expect(Stream.of('a', 'bb').mapToLong((s) => s.length).max().getAsLong()).toBe(2));
  it('mapToDouble gives a DoubleStream', () => expect(Stream.of(1, 2).mapToDouble((x) => x / 2).toArray()).toEqual([0.5, 1]));
  // package summary example: widgets.stream().filter(w -> w.getColor() == RED).mapToInt(w -> w.getWeight()).sum()
  it('package example: sum of red widget weights', () => {
    const widgets = List.of({ color: 'RED', weight: 3 }, { color: 'BLUE', weight: 5 }, { color: 'RED', weight: 4 });
    expect(widgets.stream().filter((w) => w.color === 'RED').mapToInt((w) => w.weight).sum()).toBe(7);
  });
});

describe('flatMap', () => {
  it('flattens mapped streams in order', () =>
    expect(Stream.of(1, 2, 3).flatMap((x) => Stream.of(x, x * 10)).toArray()).toEqual([1, 10, 2, 20, 3, 30]));
  // "(If a mapped stream is null an empty stream is used, instead.)"
  it('a null mapped stream counts as empty', () =>
    expect(Stream.of(1, 2, 3).flatMap((x) => (x === 2 ? null : Stream.of(x))).toArray()).toEqual([1, 3]));
  it('an undefined mapped stream counts as empty', () =>
    expect(Stream.of(1, 2).flatMap((x) => (x === 1 ? undefined : Stream.of(x))).toArray()).toEqual([2]));
  it('empty mapped streams vanish', () => expect(Stream.of(1, 2).flatMap(() => Stream.empty()).count()).toBe(0));
  // "Each mapped stream is closed after its contents have been placed into this stream."
  it('closes each mapped stream after use', () => {
    const closed: number[] = [];
    Stream.of(1, 2, 3)
      .flatMap((x) => Stream.of(x).onClose(() => closed.push(x)))
      .toArray();
    expect(closed).toEqual([1, 2, 3]);
  });
  it('mapped stream is closed after its elements were pushed downstream', () => {
    const log: string[] = [];
    Stream.of(1, 2)
      .flatMap((x) => Stream.of(x).onClose(() => log.push(`close${x}`)))
      .forEach((x) => log.push(`elem${x}`));
    expect(log).toEqual(['elem1', 'close1', 'elem2', 'close2']);
  });
  // doc example: lines.flatMap(line -> Stream.of(line.split(" +")))
  it('doc example: split lines into words', () =>
    expect(Stream.of('a b', 'c  d e').flatMap((line) => Stream.of(...line.split(/ +/))).toArray()).toEqual(['a', 'b', 'c', 'd', 'e']));
  // doc example: orders.flatMap(order -> order.getLineItems().stream())
  it('doc example: line items of orders', () => {
    const orders = List.of({ items: List.of('x', 'y') }, { items: List.of<string>() }, { items: List.of('z') });
    expect(orders.stream().flatMap((o) => o.items.stream()).toArray()).toEqual(['x', 'y', 'z']);
  });
  it('flatMapToInt', () => expect(Stream.of(2, 3).flatMapToInt((n) => IntStream.range(0, n)).toArray()).toEqual([0, 1, 0, 1, 2]));
  it('flatMapToInt null is empty', () => expect(Stream.of(1).flatMapToInt(() => null).count()).toBe(0));
  it('flatMapToLong', () => expect(Stream.of(1, 2).flatMapToLong((n) => LongStream.of(n, -n)).toArray()).toEqual([1, -1, 2, -2]));
  it('flatMapToDouble', () => expect(Stream.of(1).flatMapToDouble((n) => DoubleStream.of(n / 4)).toArray()).toEqual([0.25]));
  it('flatMapToInt closes inner streams', () => {
    const log: string[] = [];
    Stream.of(1, 2)
      .flatMapToInt((n) => IntStream.of(n).onClose(() => log.push('c' + n)))
      .sum();
    expect(log).toEqual(['c1', 'c2']);
  });
  it('flatMap with Optional.stream drops empties (Optional.stream doc example)', () =>
    expect(Stream.of(Optional.of(1), Optional.empty<number>(), Optional.of(3)).flatMap((o) => o.stream()).toArray()).toEqual([1, 3]));
});

describe('mapMulti', () => {
  it('can emit zero, one or many elements per input', () =>
    expect(
      Stream.of(0, 1, 2)
        .mapMulti<number>((n, sink) => {
          for (let i = 0; i < n; i++) sink(n);
        })
        .toArray(),
    ).toEqual([1, 2, 2]));
  // doc example: numbers.<Integer>mapMulti((number, consumer) -> { if (number instanceof Integer i) consumer.accept(i); })
  it('doc example: keep only integers', () =>
    expect(
      Stream.of<number | string>(1, 'a', 2.5, 3)
        .mapMulti<number>((x, c) => {
          if (typeof x === 'number' && Number.isInteger(x)) c(x);
        })
        .toArray(),
    ).toEqual([1, 3]));
  // doc example: expandIterable over List.of(1, List.of(2, List.of(3, 4)), 5)
  it('doc example: expand nested iterables', () => {
    const expand = (e: unknown, c: (x: unknown) => void): void => {
      if (e !== null && typeof e === 'object' && Symbol.iterator in (e as object)) {
        for (const ie of e as Iterable<unknown>) expand(ie, c);
      } else if (e !== null) c(e);
    };
    const nested = List.of<unknown>(1, List.of<unknown>(2, List.of(3, 4)), 5);
    expect(nested.stream().mapMulti(expand).toArray()).toEqual([1, 2, 3, 4, 5]);
  });
  it('keeps encounter order of emitted elements', () =>
    expect(Stream.of('ab', 'cd').mapMulti<string>((s, c) => [...s].forEach(c)).toArray()).toEqual(['a', 'b', 'c', 'd']));
  it('mapMultiToInt', () => expect(Stream.of('ab', 'c').mapMultiToInt((s, c) => c(s.length)).toArray()).toEqual([2, 1]));
  it('mapMultiToLong', () => expect(Stream.of(1, 2).mapMultiToLong((n, c) => (c(n), c(n))).sum()).toBe(6));
  it('mapMultiToDouble', () => expect(Stream.of(1).mapMultiToDouble((n, c) => c(n + 0.5)).toArray()).toEqual([1.5]));
  it('works with limit after it', () =>
    expect(Stream.of(1, 2, 3).mapMulti<number>((n, c) => (c(n), c(n))).limit(3).toArray()).toEqual([1, 1, 2]));
});

describe('distinct', () => {
  it('removes duplicates', () => expect(Stream.of(1, 2, 1, 3, 2).distinct().toArray()).toEqual([1, 2, 3]));
  // "distinct elements (according to Object.equals(Object))"
  it('uses equals/hashCode', () => expect(Stream.of(new Point(1, 2), new Point(1, 2), new Point(2, 1)).distinct().count()).toBe(2));
  // "For ordered streams, the selection of distinct elements is stable (for duplicated elements, the element
  // appearing first in the encounter order is preserved.)"
  it('keeps the first occurrence of equal elements', () => {
    const a = new Point(1, 1);
    const b = new Point(1, 1);
    const c = new Point(0, 0);
    const out = Stream.of(c, a, b).distinct().toArray();
    expect(out.length).toBe(2);
    expect(out[0]).toBe(c);
    expect(out[1]).toBe(a);
  });
  it('treats null as a value', () => expect(Stream.of(null, 1, null).distinct().toArray()).toEqual([null, 1]));
  it('distinct strings', () => expect(Stream.of('a', 'b', 'a').distinct().toArray()).toEqual(['a', 'b']));
  it('preserves encounter order for an ordered source', () => expect(Stream.of(3, 1, 3, 2, 1).distinct().toArray()).toEqual([3, 1, 2]));
  it('on an infinite stream with limit is fine (lazy)', () =>
    expect(Stream.iterate(0, (x) => x + 1).map((x) => x % 3).distinct().limit(3).toArray()).toEqual([0, 1, 2]));
  it('NaN equals NaN', () => expect(Stream.of(NaN, NaN).distinct().count()).toBe(1));
});

describe('sorted', () => {
  it('natural order', () => expect(Stream.of(3, 1, 2).sorted().toArray()).toEqual([1, 2, 3]));
  it('natural order of strings', () => expect(Stream.of('b', 'c', 'a').sorted().toArray()).toEqual(['a', 'b', 'c']));
  it('natural order uses compareTo', () =>
    expect(Stream.of(new Point(2, 0), new Point(1, 5), new Point(1, 3)).sorted().map(String).toArray()).toEqual(['(1,3)', '(1,5)', '(2,0)']));
  it('with a comparator', () => expect(Stream.of(1, 3, 2).sorted((a, b) => b - a).toArray()).toEqual([3, 2, 1]));
  it('with Comparator.reverseOrder()', () => expect(Stream.of('a', 'c', 'b').sorted(Comparator.reverseOrder()).toArray()).toEqual(['c', 'b', 'a']));
  it('with a null comparator means natural order', () => expect(Stream.of(2, 1).sorted(null).toArray()).toEqual([1, 2]));
  // "For ordered streams, the sort is stable."
  it('is stable', () => {
    const items = ['b1', 'a1', 'b2', 'a2', 'b3', 'a3'];
    expect(Stream.of(...items).sorted((x, y) => x.charCodeAt(0) - y.charCodeAt(0)).toArray()).toEqual(['a1', 'a2', 'a3', 'b1', 'b2', 'b3']);
  });
  it('is stable on a large input', () => {
    const items = Array.from({ length: 500 }, (_, i) => ({ k: i % 7, i }));
    const out = Stream.of(...items).sorted((a, b) => a.k - b.k).toArray();
    for (let j = 1; j < out.length; j++) {
      if (out[j - 1].k === out[j].k) expect(out[j - 1].i).toBeLessThan(out[j].i);
    }
  });
  it('empty stream', () => expect(Stream.empty<number>().sorted().toArray()).toEqual([]));
  it('sorting is done before any downstream element is processed', () => {
    const log: string[] = [];
    Stream.of(2, 1)
      .peek((x) => log.push('up' + x))
      .sorted()
      .forEach((x) => log.push('down' + x));
    expect(log).toEqual(['up2', 'up1', 'down1', 'down2']);
  });
  it('then limit takes the smallest', () => expect(Stream.of(5, 4, 3, 2, 1).sorted().limit(2).toArray()).toEqual([1, 2]));
});

describe('peek', () => {
  it('sees each element and passes it through', () => {
    const seen: number[] = [];
    expect(Stream.of(1, 2).peek((x) => seen.push(x)).toArray()).toEqual([1, 2]);
    expect(seen).toEqual([1, 2]);
  });
  // doc example: filter(e -> e.length() > 3).peek(...).map(String::toUpperCase).peek(...).collect(toList())
  it('doc example: peek between filter and map', () => {
    const log: string[] = [];
    const out = Stream.of('one', 'two', 'three', 'four')
      .filter((e) => e.length > 3)
      .peek((e) => log.push('Filtered value: ' + e))
      .map((e) => e.toUpperCase())
      .peek((e) => log.push('Mapped value: ' + e))
      .toArray();
    expect(out).toEqual(['THREE', 'FOUR']);
    expect(log).toEqual(['Filtered value: three', 'Mapped value: THREE', 'Filtered value: four', 'Mapped value: FOUR']);
  });
});

describe('limit', () => {
  it('truncates', () => expect(Stream.of(1, 2, 3, 4).limit(2).toArray()).toEqual([1, 2]));
  it('limit(0) is empty', () => expect(Stream.of(1, 2).limit(0).count()).toBe(0));
  it('limit beyond size keeps all', () => expect(Stream.of(1, 2).limit(10).toArray()).toEqual([1, 2]));
  it('limit exactly size', () => expect(Stream.of(1, 2).limit(2).toArray()).toEqual([1, 2]));
  // "IllegalArgumentException - if maxSize is negative"
  it('negative maxSize throws IllegalArgumentException', () => expectThrows(() => Stream.of(1).limit(-1), IAE));
  it('on an infinite stream terminates', () => expect(Stream.generate(() => 'z').limit(2).toArray()).toEqual(['z', 'z']));
  it('limit then limit', () => expect(Stream.of(1, 2, 3, 4).limit(3).limit(2).toArray()).toEqual([1, 2]));
  it('IntStream negative limit', () => expectThrows(() => IntStream.of(1).limit(-5), IAE));
});

describe('skip', () => {
  it('discards the first n', () => expect(Stream.of(1, 2, 3, 4).skip(2).toArray()).toEqual([3, 4]));
  it('skip(0) keeps all', () => expect(Stream.of(1, 2).skip(0).toArray()).toEqual([1, 2]));
  // "If this stream contains fewer than n elements then an empty stream will be returned."
  it('skip beyond size is empty', () => expect(Stream.of(1, 2).skip(5).count()).toBe(0));
  it('skip exactly size is empty', () => expect(Stream.of(1, 2).skip(2).count()).toBe(0));
  // "IllegalArgumentException - if n is negative"
  it('negative n throws IllegalArgumentException', () => expectThrows(() => Stream.of(1).skip(-1), IAE));
  it('skip then limit pages through', () => expect(Stream.of(0, 1, 2, 3, 4, 5, 6).skip(2).limit(3).toArray()).toEqual([2, 3, 4]));
  it('limit then skip', () => expect(Stream.of(0, 1, 2, 3, 4, 5).limit(4).skip(1).toArray()).toEqual([1, 2, 3]));
  it('skip on an infinite stream with limit', () => expect(Stream.iterate(0, (x) => x + 1).skip(10).findFirst().get()).toBe(10));
  it('LongStream negative skip', () => expectThrows(() => LongStream.of(1).skip(-1), IAE));
});

describe('takeWhile', () => {
  // "If this stream is ordered then [returns] the longest prefix of elements taken from this stream that match the given predicate."
  it('takes the longest matching prefix', () => expect(Stream.of(1, 2, 3, 10, 1, 2).takeWhile((x) => x < 5).toArray()).toEqual([1, 2, 3]));
  it('empty when the first element fails', () => expect(Stream.of(9, 1).takeWhile((x) => x < 5).count()).toBe(0));
  it('all when every element matches', () => expect(Stream.of(1, 2).takeWhile(() => true).toArray()).toEqual([1, 2]));
  it('on empty stream', () => expect(Stream.empty<number>().takeWhile(() => true).count()).toBe(0));
  it('terminates an infinite stream', () => expect(Stream.iterate(1, (x) => x * 2).takeWhile((x) => x < 50).toArray()).toEqual([1, 2, 4, 8, 16, 32]));
  it('does not test elements after the first failure', () => {
    const tested: number[] = [];
    Stream.of(1, 2, 9, 3)
      .takeWhile((x) => (tested.push(x), x < 5))
      .toArray();
    expect(tested).toEqual([1, 2, 9]);
  });
  it('IntStream.takeWhile', () => expect(IntStream.iterate(0, (i) => i + 3).takeWhile((i) => i < 10).toArray()).toEqual([0, 3, 6, 9]));
});

describe('dropWhile', () => {
  // "If this stream is ordered then [returns] the remaining elements of this stream after dropping the longest prefix of elements that match"
  it('drops the longest matching prefix', () => expect(Stream.of(1, 2, 3, 10, 1, 2).dropWhile((x) => x < 5).toArray()).toEqual([10, 1, 2]));
  it('keeps all when the first element fails', () => expect(Stream.of(9, 1).dropWhile((x) => x < 5).toArray()).toEqual([9, 1]));
  it('empty when every element matches', () => expect(Stream.of(1, 2).dropWhile(() => true).count()).toBe(0));
  it('stops testing after the first failure', () => {
    const tested: number[] = [];
    Stream.of(1, 7, 2, 3)
      .dropWhile((x) => (tested.push(x), x < 5))
      .toArray();
    expect(tested).toEqual([1, 7]);
  });
  it('then limit on an infinite stream', () =>
    expect(Stream.iterate(0, (x) => x + 1).dropWhile((x) => x < 100).limit(2).toArray()).toEqual([100, 101]));
  it('DoubleStream.dropWhile', () => expect(DoubleStream.of(0.5, 1.5, 0.5).dropWhile((d) => d < 1).toArray()).toEqual([1.5, 0.5]));
});

describe('combined intermediate pipelines', () => {
  it('filter-map-sorted-distinct-limit', () =>
    expect(
      Stream.of(5, 3, 8, 3, 1, 9, 2)
        .filter((x) => x > 1)
        .map((x) => x * 2)
        .sorted()
        .distinct()
        .limit(3)
        .toArray(),
    ).toEqual([4, 6, 10]));
  it('parallel pipeline gives the same ordered result', () => {
    const run = (s: Stream<number>) => s.filter((x) => x % 3 !== 0).map((x) => x * x).skip(1).limit(4).toArray();
    const src = Array.from({ length: 30 }, (_, i) => i);
    expect(run(Stream.of(...src).parallel())).toEqual(run(Stream.of(...src)));
  });
});
