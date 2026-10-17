// Conformance: Stream.gather, Gatherer, Integrator, Gatherers.
import { Downstream, Gatherer, Gatherers, Integrator, List, Stream } from '../../src';
import { expectThrows } from '../helpers';

const IAE = 'IllegalArgumentException';
const NPE = 'NullPointerException';
const UOE = 'UnsupportedOperationException';
const arrays = <T>(s: Stream<List<T>>): T[][] => s.map((w) => w.toArray()).toArray();

// Gatherer class doc example: a "map" gatherer built from a stateless integrator.
function map<T, R>(mapper: (t: T) => R): Gatherer<T, any, R> {
  return Gatherer.of(Integrator.ofGreedy((_unused: unknown, element: T, downstream: Downstream<R>) => downstream.push(mapper(element))));
}

describe('Gatherers.windowFixed', () => {
  // doc example: Stream.of(1,2,3,4,5,6,7,8).gather(Gatherers.windowFixed(3)).toList() => [[1, 2, 3], [4, 5, 6], [7, 8]]
  it('doc example: windows of 3 with a shorter last window', () =>
    expect(arrays(Stream.of(1, 2, 3, 4, 5, 6, 7, 8).gather(Gatherers.windowFixed(3)))).toEqual([[1, 2, 3], [4, 5, 6], [7, 8]]));
  it('exact multiple has no partial window', () => expect(arrays(Stream.of(1, 2, 3, 4).gather(Gatherers.windowFixed(2)))).toEqual([[1, 2], [3, 4]]));
  it('window larger than the stream gives one window', () => expect(arrays(Stream.of(1, 2).gather(Gatherers.windowFixed(5)))).toEqual([[1, 2]]));
  it('window of 1 wraps each element', () => expect(arrays(Stream.of('a', 'b').gather(Gatherers.windowFixed(1)))).toEqual([['a'], ['b']]));
  it('empty stream produces no windows', () => expect(Stream.empty<number>().gather(Gatherers.windowFixed(3)).count()).toBe(0));
  // "IllegalArgumentException - if windowSize is less than 1"
  it('windowSize 0 throws IllegalArgumentException', () => expectThrows(() => Gatherers.windowFixed(0), IAE));
  it('negative windowSize throws IllegalArgumentException', () => expectThrows(() => Gatherers.windowFixed(-2), IAE));
  // "Each window produced is an unmodifiable List; calls to any mutator method will always cause UnsupportedOperationException to be thrown."
  it('windows are unmodifiable', () => {
    const w = Stream.of(1, 2).gather(Gatherers.windowFixed(2)).findFirst().get();
    expectThrows(() => w.add(3), UOE);
  });
  it('the partial last window is unmodifiable too', () => {
    const w = Stream.of(1, 2, 3).gather(Gatherers.windowFixed(2)).toArray()[1];
    expectThrows(() => w.set(0, 9), UOE);
  });
  it('windows may hold null elements', () => expect(arrays(Stream.of<number | null>(null, 1).gather(Gatherers.windowFixed(2)))).toEqual([[null, 1]]));
  it('windows are independent of each other', () => {
    const ws = Stream.of(1, 2, 3, 4).gather(Gatherers.windowFixed(2)).toArray();
    expect(ws[0].toArray()).toEqual([1, 2]);
    expect(ws[1].toArray()).toEqual([3, 4]);
  });
  it('short-circuits on an infinite stream', () =>
    expect(arrays(Stream.iterate(0, (x) => x + 1).gather(Gatherers.windowFixed(3)).limit(2))).toEqual([[0, 1, 2], [3, 4, 5]]));
});

describe('Gatherers.windowSliding', () => {
  // doc example: windowSliding(2) => [[1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8]]
  it('doc example: windowSliding(2)', () =>
    expect(arrays(Stream.of(1, 2, 3, 4, 5, 6, 7, 8).gather(Gatherers.windowSliding(2)))).toEqual([
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 8],
    ]));
  // doc example: windowSliding(6) => [[1, 2, 3, 4, 5, 6], [2, 3, 4, 5, 6, 7], [3, 4, 5, 6, 7, 8]]
  it('doc example: windowSliding(6)', () =>
    expect(arrays(Stream.of(1, 2, 3, 4, 5, 6, 7, 8).gather(Gatherers.windowSliding(6)))).toEqual([
      [1, 2, 3, 4, 5, 6],
      [2, 3, 4, 5, 6, 7],
      [3, 4, 5, 6, 7, 8],
    ]));
  // "If the stream is empty then no window will be produced."
  it('empty stream produces no window', () => expect(Stream.empty<number>().gather(Gatherers.windowSliding(2)).count()).toBe(0));
  // "If the size of the stream is smaller than the window size then only one window will be emitted, containing all elements of that stream."
  it('shorter stream produces one window with all elements', () => expect(arrays(Stream.of(1, 2).gather(Gatherers.windowSliding(5)))).toEqual([[1, 2]]));
  it('stream size equal to window size gives one window', () => expect(arrays(Stream.of(1, 2, 3).gather(Gatherers.windowSliding(3)))).toEqual([[1, 2, 3]]));
  it('windowSliding(1) wraps each element', () => expect(arrays(Stream.of(1, 2).gather(Gatherers.windowSliding(1)))).toEqual([[1], [2]]));
  it('single element stream', () => expect(arrays(Stream.of(9).gather(Gatherers.windowSliding(2)))).toEqual([[9]]));
  it('windowSize 0 throws IllegalArgumentException', () => expectThrows(() => Gatherers.windowSliding(0), IAE));
  it('windows are unmodifiable', () => expectThrows(() => Stream.of(1, 2, 3).gather(Gatherers.windowSliding(2)).toArray()[0].add(0), UOE));
  it('earlier windows are not changed by later ones', () => {
    const ws = Stream.of(1, 2, 3, 4).gather(Gatherers.windowSliding(3)).toArray();
    expect(ws.map((w) => w.toArray())).toEqual([
      [1, 2, 3],
      [2, 3, 4],
    ]);
  });
  it('short-circuits on an infinite stream', () =>
    expect(arrays(Stream.iterate(1, (x) => x + 1).gather(Gatherers.windowSliding(2)).limit(3))).toEqual([[1, 2], [2, 3], [3, 4]]));
});

describe('Gatherers.fold', () => {
  // doc example: Stream.of(1,2,3,4,5,6,7,8,9).gather(fold(() -> "", (string, number) -> string + number)).findFirst().get() => "123456789"
  it('doc example: fold digits into a string', () =>
    expect(Stream.of(1, 2, 3, 4, 5, 6, 7, 8, 9).gather(Gatherers.fold(() => '', (s: string, n: number) => s + n)).findFirst().get()).toBe('123456789'));
  it('emits exactly one element for a non-empty stream', () =>
    expect(Stream.of(1, 2, 3).gather(Gatherers.fold(() => 0, (a: number, b: number) => a + b)).toArray()).toEqual([6]));
  it('is order-dependent (left fold)', () =>
    expect(Stream.of('a', 'b', 'c').gather(Gatherers.fold(() => 'x', (acc: string, e: string) => e + acc)).toArray()).toEqual(['cbax']));
  it('the initial supplier is evaluated lazily', () => {
    let calls = 0;
    const s = Stream.of(1).gather(Gatherers.fold(() => (calls++, 0), (a: number, b: number) => a + b));
    expect(calls).toBe(0);
    s.toArray();
    expect(calls).toBe(1);
  });
  it('null initial throws NullPointerException', () => expectThrows(() => Gatherers.fold(null as any, (a: number) => a), NPE));
  it('null folder throws NullPointerException', () => expectThrows(() => Gatherers.fold(() => 0, null as any), NPE));
  it('works on a parallel stream', () =>
    expect(Stream.of(1, 2, 3).parallel().gather(Gatherers.fold(() => '', (s: string, n: number) => s + n)).toArray()).toEqual(['123']));
});

describe('Gatherers.scan', () => {
  // doc example: Stream.of(1,...,9).gather(scan(() -> "", (string, number) -> string + number)).toList()
  // => ["1", "12", "123", "1234", "12345", "123456", "1234567", "12345678", "123456789"]
  it('doc example: prefix scan of digits', () =>
    expect(Stream.of(1, 2, 3, 4, 5, 6, 7, 8, 9).gather(Gatherers.scan(() => '', (s: string, n: number) => s + n)).toList().toArray()).toEqual([
      '1',
      '12',
      '123',
      '1234',
      '12345',
      '123456',
      '1234567',
      '12345678',
      '123456789',
    ]));
  it('running sum', () => expect(Stream.of(1, 2, 3, 4).gather(Gatherers.scan(() => 0, (a: number, b: number) => a + b)).toArray()).toEqual([1, 3, 6, 10]));
  // "...each subsequent value is obtained by applying the BiFunction to the current value and the next input element,
  // after which the resulting value is produced downstream." — the initial value itself is not emitted.
  it('does not emit the initial value', () => expect(Stream.of(5).gather(Gatherers.scan(() => 100, (a: number, b: number) => a + b)).toArray()).toEqual([105]));
  it('empty stream produces nothing', () => expect(Stream.empty<number>().gather(Gatherers.scan(() => 0, (a: number, b: number) => a + b)).count()).toBe(0));
  it('short-circuits on an infinite stream', () =>
    expect(Stream.generate(() => 1).gather(Gatherers.scan(() => 0, (a: number, b: number) => a + b)).limit(4).toArray()).toEqual([1, 2, 3, 4]));
  it('null scanner throws NullPointerException', () => expectThrows(() => Gatherers.scan(() => 0, null as any), NPE));
});

describe('Gatherers.mapConcurrent', () => {
  // "This operation preserves the ordering of the stream."
  it('maps preserving encounter order', () =>
    expect(Stream.of(1, 2, 3, 4, 5).gather(Gatherers.mapConcurrent(2, (x: number) => x * 10)).toArray()).toEqual([10, 20, 30, 40, 50]));
  it('maxConcurrency 1', () => expect(Stream.of('a', 'b').gather(Gatherers.mapConcurrent(1, (s: string) => s.toUpperCase())).toArray()).toEqual(['A', 'B']));
  it('maxConcurrency larger than the stream', () => expect(Stream.of(1).gather(Gatherers.mapConcurrent(100, (x: number) => x + 1)).toArray()).toEqual([2]));
  it('empty stream', () => expect(Stream.empty<number>().gather(Gatherers.mapConcurrent(4, (x: number) => x)).count()).toBe(0));
  // "IllegalArgumentException - if maxConcurrency is less than 1"
  it('maxConcurrency 0 throws IllegalArgumentException', () => expectThrows(() => Gatherers.mapConcurrent(0, (x: number) => x), IAE));
  it('null mapper throws NullPointerException', () => expectThrows(() => Gatherers.mapConcurrent(1, null as any), NPE));
  it('with limit', () => expect(Stream.iterate(1, (x) => x + 1).gather(Gatherers.mapConcurrent(3, (x: number) => -x)).limit(3).toArray()).toEqual([-1, -2, -3]));
});

describe('Stream.gather with custom gatherers', () => {
  it('Gatherer class doc example: a map gatherer', () => expect(Stream.of(1, 2, 3).gather(map((x: number) => x + 1)).toArray()).toEqual([2, 3, 4]));
  // Gatherer doc: inc.andThen(twice) — "Gatherer<Integer, ?, Integer> incThenTwice = inc.andThen(twice);"
  it('andThen composes: increment then double', () => {
    const inc = map((i: number) => i + 1);
    const twice = map((i: number) => i * 2);
    expect(Stream.of(1, 2, 3).gather(inc.andThen(twice)).toArray()).toEqual([4, 6, 8]);
  });
  // Stream.gather doc: source.gather(a).gather(b).gather(c) is equivalent to source.gather(a.andThen(b).andThen(c))
  it('gather(a).gather(b).gather(c) equals gather(a.andThen(b).andThen(c))', () => {
    const a = map((x: number) => x + 1);
    const b = Gatherers.windowFixed<number>(2);
    const c = map((w: List<number>) => w.toArray().join('+'));
    const chained = Stream.of(1, 2, 3, 4, 5).gather(a).gather(b).gather(c).toArray();
    const composed = Stream.of(1, 2, 3, 4, 5).gather(a.andThen(b).andThen(c)).toArray();
    expect(chained).toEqual(['2+3', '4+5', '6']);
    expect(composed).toEqual(chained);
  });
  it('andThen of fold and scan', () =>
    expect(Stream.of(1, 2, 3).gather(Gatherers.scan(() => 0, (a: number, b: number) => a + b).andThen(Gatherers.fold(() => 0, (a: number, b: number) => Math.max(a, b)))).toArray()).toEqual([6]));
  it('a filtering gatherer may push nothing', () => {
    const evens = Gatherer.of(Integrator.of((_s: unknown, e: number, d: Downstream<number>) => (e % 2 === 0 ? d.push(e) : true)));
    expect(Stream.of(1, 2, 3, 4).gather(evens).toArray()).toEqual([2, 4]);
  });
  it('a gatherer may push several elements per input', () => {
    const dup = Gatherer.of(Integrator.of((_s: unknown, e: string, d: Downstream<string>) => d.push(e) && d.push(e)));
    expect(Stream.of('a', 'b').gather(dup).toArray()).toEqual(['a', 'a', 'b', 'b']);
  });
  // Integrator: "Returns true if subsequent integration is desired, false if not."
  it('integrator returning false stops consuming upstream (limit-like)', () => {
    const seen: number[] = [];
    const takeTwo = Gatherer.ofSequential(
      () => ({ n: 0 }),
      Integrator.of((st: { n: number }, e: number, d: Downstream<number>) => {
        seen.push(e);
        st.n++;
        return d.push(e) && st.n < 2;
      }),
    );
    expect(Stream.of(1, 2, 3, 4).gather(takeTwo).toArray()).toEqual([1, 2]);
    expect(seen).toEqual([1, 2]);
  });
  it('a short-circuiting gatherer terminates an infinite stream', () => {
    const firstOverTen = Gatherer.of(Integrator.of((_s: unknown, e: number, d: Downstream<number>) => (e > 10 ? (d.push(e), false) : true)));
    expect(Stream.iterate(1, (x) => x * 2).gather(firstOverTen).toArray()).toEqual([16]);
  });
  // Downstream.push: "Returns: true if more elements can be sent, and false if not."
  it('downstream push returns false once the downstream rejects (limit)', () => {
    const results: boolean[] = [];
    const g = Gatherer.ofSequential(Integrator.of((_s: unknown, e: number, d: Downstream<number>) => {
      const r = d.push(e);
      results.push(r);
      return r;
    }));
    expect(Stream.of(1, 2, 3, 4).gather(g).limit(2).toArray()).toEqual([1, 2]);
    expect(results[results.length - 1]).toBe(false);
  });
  // Downstream.isRejecting is best-effort; only the "not rejecting while everything is accepted" side is guaranteed.
  it('isRejecting is false while the downstream accepts everything', () => {
    const rejecting: boolean[] = [];
    const g = Gatherer.ofSequential(Integrator.of((_s: unknown, e: number, d: Downstream<number>) => {
      rejecting.push(d.isRejecting());
      return d.push(e);
    }));
    Stream.of(1, 2, 3).gather(g).toArray();
    expect(rejecting).toEqual([false, false, false]);
  });
  it('stateful gatherer with initializer and finisher (running batch)', () => {
    const batchSum = Gatherer.ofSequential(
      () => ({ sum: 0 }),
      Integrator.ofGreedy((st: { sum: number }, e: number) => ((st.sum += e), true)),
      (st: { sum: number }, d: Downstream<number>) => void d.push(st.sum),
    );
    expect(Stream.of(1, 2, 3).gather(batchSum).toArray()).toEqual([6]);
  });
  it('finisher runs once at the end, after all elements', () => {
    const log: string[] = [];
    const g = Gatherer.ofSequential(
      () => null,
      Integrator.of((_s: null, e: number, d: Downstream<number>) => (log.push('e' + e), d.push(e))),
      () => void log.push('finish'),
    );
    Stream.of(1, 2).gather(g).toArray();
    expect(log).toEqual(['e1', 'e2', 'finish']);
  });
  it('finisher may push trailing elements', () => {
    const appendEnd = Gatherer.ofSequential(
      Integrator.of((_s: unknown, e: string, d: Downstream<string>) => d.push(e)),
      (_s: unknown, d: Downstream<string>) => void d.push('END'),
    );
    expect(Stream.of('a').gather(appendEnd).toArray()).toEqual(['a', 'END']);
  });
  it('Gatherer.of(integrator, finisher)', () => {
    const g = Gatherer.of(
      Integrator.ofGreedy((_s: unknown, e: number, d: Downstream<number>) => d.push(e * 2)),
      (_s: unknown, d: Downstream<number>) => void d.push(-1),
    );
    expect(Stream.of(1, 2).gather(g).toArray()).toEqual([2, 4, -1]);
  });
  it('Gatherer.of(initializer, integrator, combiner, finisher) on a parallel stream', () => {
    const g = Gatherer.of(
      () => ({ n: 0 }),
      Integrator.ofGreedy((st: { n: number }) => (st.n++, true)),
      (a: { n: number }, b: { n: number }) => ({ n: a.n + b.n }),
      (st: { n: number }, d: Downstream<number>) => void d.push(st.n),
    );
    expect(Stream.of(1, 2, 3, 4).parallel().gather(g).toArray()).toEqual([4]);
    expect(Stream.of(1, 2, 3, 4).gather(g).toArray()).toEqual([4]);
  });
  it('a fresh state is created per evaluation', () => {
    const g = Gatherer.ofSequential(
      () => ({ n: 0 }),
      Integrator.of((st: { n: number }, _e: number, d: Downstream<number>) => d.push(++st.n)),
    );
    expect(Stream.of(7, 7).gather(g).toArray()).toEqual([1, 2]);
    expect(Stream.of(7, 7).gather(g).toArray()).toEqual([1, 2]);
  });
  it('gather is lazy: the initializer is not called before the terminal op', () => {
    let inits = 0;
    const g = Gatherer.ofSequential(
      () => (inits++, 0),
      Integrator.of((_s: number, e: number, d: Downstream<number>) => d.push(e)),
    );
    const s = Stream.of(1).gather(g);
    expect(inits).toBe(0);
    s.toArray();
    expect(inits).toBe(1);
  });
  it('accessors return the supplied functions', () => {
    const init = () => 0;
    const integ = Integrator.of((_s: number, e: number, d: Downstream<number>) => d.push(e));
    const comb = (a: number, b: number) => a + b;
    const fin = (_s: number, _d: Downstream<number>) => {};
    const g = Gatherer.of(init, integ, comb, fin);
    expect(g.initializer()).toBe(init);
    expect(g.integrator()).toBe(integ);
    expect(g.combiner()).toBe(comb);
    expect(g.finisher()).toBe(fin);
  });
  // ofSequential(integrator): "Returns a new, sequential, and stateless Gatherer" — uses the default initializer/combiner/finisher.
  it('ofSequential(integrator) uses the default initializer, combiner and finisher', () => {
    const g = Gatherer.ofSequential(Integrator.of((_s: unknown, e: number, d: Downstream<number>) => d.push(e)));
    expect(g.initializer()).toBe(Gatherer.defaultInitializer());
    expect(g.combiner()).toBe(Gatherer.defaultCombiner());
    expect(g.finisher()).toBe(Gatherer.defaultFinisher());
  });
  it('Gatherer.of(integrator) is parallel-capable but stateless (default initializer and finisher)', () => {
    const g = Gatherer.of(Integrator.of((_s: unknown, e: number, d: Downstream<number>) => d.push(e)));
    expect(g.initializer()).toBe(Gatherer.defaultInitializer());
    expect(g.finisher()).toBe(Gatherer.defaultFinisher());
    expect(g.combiner()).not.toBe(Gatherer.defaultCombiner());
  });
  it('Integrator.ofGreedy marks the integrator greedy', () => {
    const i = Integrator.ofGreedy((_s: unknown, e: number, d: Downstream<number>) => d.push(e));
    expect(i.greedy).toBe(true);
  });
  it('Integrator.of is not greedy', () => expect(Integrator.of((_s: unknown, _e: number, _d: Downstream<number>) => true).greedy).toBeFalsy());
  it('gather(null) throws NullPointerException', () => expectThrows(() => Stream.of(1).gather(null as any), NPE));
  it('Gatherer.of(null) throws NullPointerException', () => expectThrows(() => Gatherer.of(null as any), NPE));
  it('andThen(null) throws NullPointerException', () => expectThrows(() => map((x: number) => x).andThen(null as any), NPE));
  it('gather keeps the parallel flag', () => expect(Stream.of(1).parallel().gather(map((x: number) => x)).isParallel()).toBe(true));
  it('gather on an empty stream still runs the finisher', () => {
    let finished = 0;
    const g = Gatherer.ofSequential(
      () => 0,
      Integrator.of((_s: number, e: number, d: Downstream<number>) => d.push(e)),
      () => void finished++,
    );
    expect(Stream.empty<number>().gather(g).toArray()).toEqual([]);
    expect(finished).toBe(1);
  });
});
