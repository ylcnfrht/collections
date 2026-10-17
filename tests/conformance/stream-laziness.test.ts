// Conformance: laziness and evaluation order.
// package summary: "Intermediate operations return a new stream. They are always lazy; executing an intermediate
// operation such as filter() does not actually perform any filtering, but instead creates a new stream that, when
// traversed, contains the elements of the initial stream that match the given predicate. Traversal of the pipeline
// source does not begin until the terminal operation of the pipeline is executed."
// "in a pipeline such as the filter-map-sum example above, filtering, mapping, and summing can be fused into a
// single pass on the data, with minimal intermediate state."
import { ArrayList, Collectors, Gatherers, IntStream, List, Stream, StreamSupport, Spliterator } from '../../src';

describe('nothing runs before the terminal operation', () => {
  const ops: [string, (s: Stream<number>, log: string[]) => Stream<unknown>][] = [
    ['filter', (s, log) => s.filter((x) => (log.push('f' + x), true))],
    ['map', (s, log) => s.map((x) => (log.push('m' + x), x))],
    ['peek', (s, log) => s.peek((x) => log.push('p' + x))],
    ['flatMap', (s, log) => s.flatMap((x) => (log.push('fm' + x), Stream.of(x)))],
    ['mapMulti', (s, log) => s.mapMulti((x, c) => (log.push('mm' + x), c(x)))],
    ['sorted', (s, log) => s.sorted((a, b) => (log.push('cmp'), a - b))],
    ['distinct', (s, log) => s.peek(() => log.push('d')).distinct()],
    ['takeWhile', (s, log) => s.takeWhile((x) => (log.push('tw' + x), true))],
    ['dropWhile', (s, log) => s.dropWhile((x) => (log.push('dw' + x), false))],
    ['mapToInt', (s, log) => s.mapToInt((x) => (log.push('mi' + x), x)).boxed()],
    ['gather', (s, log) => s.peek(() => log.push('g')).gather(Gatherers.windowFixed(2))],
  ];
  it.each(ops)('%s is lazy', (_name, op) => {
    const log: string[] = [];
    const s = op(Stream.of(2, 1), log);
    expect(log).toEqual([]);
    s.toArray();
    expect(log.length).toBeGreaterThan(0);
  });
  it('the source supplier of generate is not called before the terminal op', () => {
    let calls = 0;
    const s = Stream.generate(() => ++calls).limit(3).map((x) => x * 2);
    expect(calls).toBe(0);
    expect(s.toArray()).toEqual([2, 4, 6]);
  });
  it('iterate does not call f before the terminal op', () => {
    let calls = 0;
    Stream.iterate(0, (x) => (calls++, x + 1)).limit(5);
    expect(calls).toBe(0);
  });
  // package summary non-interference example: list modified after stream creation but before the terminal op
  it('package example: source modified before the terminal op is seen ("one two three")', () => {
    const l = new ArrayList<string>(List.of('one', 'two'));
    const sl = l.stream();
    l.add('three');
    expect(sl.collect(Collectors.joining(' '))).toBe('one two three');
  });
  // StreamSupport.stream(supplier, ...): "The Supplier.get() method will be invoked on the supplier no more than once,
  // and only after the terminal operation of the stream pipeline commences."
  it('StreamSupport supplier is invoked once, only after the terminal op starts', () => {
    let gets = 0;
    const src = List.of(1, 2, 3);
    const s = StreamSupport.stream(() => (gets++, src.spliterator()), Spliterator.SIZED | Spliterator.ORDERED, false).map((x) => x + 1);
    expect(gets).toBe(0);
    expect(s.toArray()).toEqual([2, 3, 4]);
    expect(gets).toBe(1);
  });
});

describe('element-by-element (vertical) evaluation for stateless operations', () => {
  it('filter and map interleave per element', () => {
    const log: string[] = [];
    Stream.of(1, 2, 3)
      .filter((x) => (log.push('filter' + x), x !== 2))
      .map((x) => (log.push('map' + x), x))
      .forEach((x) => log.push('each' + x));
    expect(log).toEqual(['filter1', 'map1', 'each1', 'filter2', 'filter3', 'map3', 'each3']);
  });
  it('peek-map-peek chain is vertical', () => {
    const log: string[] = [];
    Stream.of('a', 'b')
      .peek((x) => log.push('1' + x))
      .map((x) => x.toUpperCase())
      .peek((x) => log.push('2' + x))
      .toArray();
    expect(log).toEqual(['1a', '2A', '1b', '2B']);
  });
  it('findFirst touches only the first element', () => {
    const log: number[] = [];
    Stream.of(1, 2, 3)
      .map((x) => (log.push(x), x))
      .findFirst();
    expect(log).toEqual([1]);
  });
  it('findFirst after filter stops at the first match', () => {
    const log: number[] = [];
    Stream.of(1, 2, 3, 4, 5)
      .peek((x) => log.push(x))
      .filter((x) => x > 2)
      .findFirst();
    expect(log).toEqual([1, 2, 3]);
  });
  it('limit pulls only what it needs from the source', () => {
    const log: number[] = [];
    Stream.of(1, 2, 3, 4, 5)
      .peek((x) => log.push(x))
      .limit(2)
      .toArray();
    expect(log).toEqual([1, 2]);
  });
  it('limit on an infinite source with peek evaluates exactly n elements', () => {
    const log: number[] = [];
    expect(
      Stream.iterate(0, (x) => x + 1)
        .peek((x) => log.push(x))
        .limit(3)
        .toArray(),
    ).toEqual([0, 1, 2]);
    expect(log).toEqual([0, 1, 2]);
  });
  it('takeWhile stops pulling after the first failing element', () => {
    const log: number[] = [];
    Stream.of(1, 2, 3, 4)
      .peek((x) => log.push(x))
      .takeWhile((x) => x < 3)
      .toArray();
    expect(log).toEqual([1, 2, 3]);
  });
  it('anyMatch stops pulling after a match', () => {
    const log: number[] = [];
    Stream.of(1, 2, 3, 4)
      .peek((x) => log.push(x))
      .anyMatch((x) => x === 2);
    expect(log).toEqual([1, 2]);
  });
  it('iterator() pulls lazily, one element per next()', () => {
    const log: number[] = [];
    const it = Stream.of(1, 2, 3)
      .peek((x) => log.push(x))
      .iterator();
    it.next();
    expect(log).toEqual([1]);
    it.next();
    expect(log).toEqual([1, 2]);
  });
  it('skip still visits skipped elements upstream but not downstream', () => {
    const up: number[] = [];
    const down: number[] = [];
    Stream.of(1, 2, 3)
      .peek((x) => up.push(x))
      .skip(2)
      .peek((x) => down.push(x))
      .toArray();
    expect([up, down]).toEqual([[1, 2, 3], [3]]);
  });
  it('IntStream map/filter are vertical', () => {
    const log: string[] = [];
    IntStream.range(0, 3)
      .map((i) => (log.push('m' + i), i))
      .filter((i) => (log.push('f' + i), true))
      .sum();
    expect(log).toEqual(['m0', 'f0', 'm1', 'f1', 'm2', 'f2']);
  });
});

describe('short-circuiting on infinite streams', () => {
  const nat = () => Stream.iterate(1, (x) => x + 1);
  it('limit', () => expect(nat().limit(3).toArray()).toEqual([1, 2, 3]));
  it('findFirst', () => expect(nat().map((x) => x * x).filter((x) => x > 50).findFirst().get()).toBe(64));
  it('findAny', () => expect(nat().filter((x) => x > 5).findAny().isPresent()).toBe(true));
  it('anyMatch', () => expect(nat().anyMatch((x) => x === 1000)).toBe(true));
  it('allMatch', () => expect(nat().allMatch((x) => x < 10)).toBe(false));
  it('noneMatch', () => expect(nat().noneMatch((x) => x === 3)).toBe(false));
  it('takeWhile', () => expect(nat().takeWhile((x) => x <= 4).toArray()).toEqual([1, 2, 3, 4]));
  it('iterator', () => expect(nat().iterator().next()).toBe(1));
  it('generate with limit', () => expect(Stream.generate(() => 'g').limit(1).toArray()).toEqual(['g']));
  it('IntStream.iterate with limit', () => expect(IntStream.iterate(0, (i) => i - 1).limit(3).toArray()).toEqual([0, -1, -2]));
  it('IntStream.generate with anyMatch', () => {
    let i = 0;
    expect(IntStream.generate(() => i++).anyMatch((x) => x === 10)).toBe(true);
  });
  it('mapMulti then limit', () => expect(nat().mapMulti<number>((x, c) => (c(x), c(-x))).limit(4).toArray()).toEqual([1, -1, 2, -2]));
  it('gather windowFixed then limit', () =>
    expect(nat().gather(Gatherers.windowFixed(2)).limit(2).map((w) => w.toArray()).toArray()).toEqual([[1, 2], [3, 4]]));
  it('gather scan then findFirst', () => expect(nat().gather(Gatherers.scan(() => 0, (a: number, b: number) => a + b)).skip(3).findFirst().get()).toBe(10));
});
