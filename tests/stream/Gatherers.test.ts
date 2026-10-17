import { RuntimeException } from '../../src/exceptions';
import type { List } from '../../src/interfaces/List';
import { Gatherer, Gatherers, Integrator, type Downstream } from '../../src/stream/Gatherers';
import { expectThrows } from '../helpers';
import { gather, gatherSplit, Sink } from './gatherers/evaluate';

const nums = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const arrays = <T>(ls: List<T>[]) => ls.map((l) => l.toArray());
const NPE = 'NullPointerException';
const IAE = 'IllegalArgumentException';
const UOE = 'UnsupportedOperationException';
const nul = null as any;

// reference documentation "map" example
const map = <T, R>(f: (t: T) => R) => Gatherer.of<T, R>((_, e, d) => d.push(f(e)));
const filter = <T>(p: (t: T) => boolean) => Gatherer.of<T, T>((_, e, d) => !p(e) || d.push(e));
const takeWhile = <T>(p: (t: T) => boolean) => Gatherer.ofSequential<T, T>((_, e, d) => p(e) && d.push(e));
const limit = <T>(n: number) =>
  Gatherer.ofSequential(
    () => ({ left: n }),
    Integrator.of<{ left: number }, T, T>((s, e, d) => s.left-- > 0 && d.push(e) && s.left > 0)
  );
// distinctBy, as in the reference documentation of Stream.gather
const distinctBy = <T, K>(key: (t: T) => K) =>
  Gatherer.ofSequential(
    () => new Set<K>(),
    Integrator.ofGreedy<Set<K>, T, T>((seen, e, d) => {
      const k = key(e);
      if (seen.has(k)) return true;
      seen.add(k);
      return d.push(e);
    })
  );
// parallel sum: emits the total from the finisher
const sum = () =>
  Gatherer.of(
    () => ({ v: 0 }),
    Integrator.ofGreedy<{ v: number }, number, number>((s, e) => ((s.v += e), true)),
    (a, b) => ({ v: a.v + b.v }),
    (s, d) => void d.push(s.v)
  );

describe('Gatherer sentinels', () => {
  test('defaultInitializer is one instance returning null', () => {
    expect(Gatherer.defaultInitializer()).toBe(Gatherer.defaultInitializer());
    expect(Gatherer.defaultInitializer()()).toBeNull();
  });
  test('defaultCombiner is one instance and throws UnsupportedOperationException', () => {
    expect(Gatherer.defaultCombiner()).toBe(Gatherer.defaultCombiner());
    expectThrows(() => Gatherer.defaultCombiner()(1, 2), UOE);
  });
  test('defaultFinisher is one instance and does nothing', () => {
    expect(Gatherer.defaultFinisher()).toBe(Gatherer.defaultFinisher());
    const s = new Sink();
    expect(Gatherer.defaultFinisher()(null, s)).toBeUndefined();
    expect(s.out).toEqual([]);
  });
  test('sentinels are distinct', () => {
    const set = new Set<unknown>([Gatherer.defaultInitializer(), Gatherer.defaultCombiner(), Gatherer.defaultFinisher()]);
    expect(set.size).toBe(3);
  });
});

describe('Integrator', () => {
  const f = (_: null, e: number, d: Downstream<number>) => d.push(e);
  test('of returns the function itself', () => expect(Integrator.of(f)).toBe(f));
  test('of is not greedy', () => expect(Integrator.of(f).greedy).toBeUndefined());
  test('of keeps an already greedy integrator greedy', () => {
    const g = Integrator.ofGreedy(f);
    expect(Integrator.of(g).greedy).toBe(true);
  });
  test('of(null) returns null like the reference', () => expect(Integrator.of(nul)).toBeNull());
  test('ofGreedy marks greedy', () => expect(Integrator.ofGreedy(f).greedy).toBe(true));
  test('ofGreedy does not mutate the source function', () => {
    Integrator.ofGreedy(f);
    expect((f as any).greedy).toBeUndefined();
  });
  test('ofGreedy delegates arguments and result', () => {
    const calls: unknown[][] = [];
    const g = Integrator.ofGreedy((s: number, e: number, d: Downstream<number>) => (calls.push([s, e, d]), false));
    const s = new Sink<number>();
    expect(g(1, 2, s)).toBe(false);
    expect(calls).toEqual([[1, 2, s]]);
  });
  test('ofGreedy(null) returns null like the reference', () => expect(Integrator.ofGreedy(nul)).toBeNull());
  test('ofGreedy(undefined) returns undefined', () => expect(Integrator.ofGreedy(undefined as any)).toBeUndefined());
  test('ofGreedy result declares three parameters', () => expect(Integrator.ofGreedy(f).length).toBe(3));
});

describe('Gatherer.of', () => {
  const integ = Integrator.of<null, number, number>((_, e, d) => d.push(e * 2));
  test('of(integrator) parts', () => {
    const g = Gatherer.of(integ);
    expect(g.initializer()).toBe(Gatherer.defaultInitializer());
    expect(g.integrator()).toBe(integ);
    expect(g.combiner()).not.toBe(Gatherer.defaultCombiner());
    expect(g.finisher()).toBe(Gatherer.defaultFinisher());
  });
  test('of(integrator) stateless combiner yields null', () => expect(Gatherer.of(integ).combiner()(null, null)).toBeNull());
  test('of(integrator) evaluates', () => expect(gather(Gatherer.of(integ), [1, 2, 3])).toEqual([2, 4, 6]));
  test('of(integrator, finisher) parts', () => {
    const fin = (_: null, d: Downstream<number>) => void d.push(-1);
    const g = Gatherer.of(integ, fin);
    expect(g.initializer()).toBe(Gatherer.defaultInitializer());
    expect(g.finisher()).toBe(fin);
    expect(g.combiner()).not.toBe(Gatherer.defaultCombiner());
    expect(gather(g, [1, 2])).toEqual([2, 4, -1]);
  });
  test('of 4-arg parts', () => {
    const g = sum();
    expect(g.combiner()).not.toBe(Gatherer.defaultCombiner());
    expect(gather(g, nums(10))).toEqual([55]);
  });
  test('of 4-arg combiner via split evaluation', () => expect(gatherSplit(sum(), nums(10), 4)).toEqual([55]));
  test('of 4-arg accepts the default sentinels', () => {
    const g = Gatherer.of(Gatherer.defaultInitializer(), integ, Gatherer.defaultCombiner(), Gatherer.defaultFinisher());
    expect(gather(g, [5])).toEqual([10]);
  });
  test('of(null) NPE', () => expectThrows(() => Gatherer.of(nul), NPE));
  test('of() NPE', () => expectThrows(() => (Gatherer.of as any)(), NPE));
  test('of(integrator, null) NPE', () => expectThrows(() => Gatherer.of(integ, nul), NPE));
  test('of(null, finisher) NPE', () => expectThrows(() => Gatherer.of(nul, () => {}), NPE));
  test.each([0, 1, 2, 3])('of 4-arg null at position %i NPE', (i) => {
    const args: any[] = [() => 0, integ, (a: number) => a, () => {}];
    args[i] = null;
    expectThrows(() => (Gatherer.of as any)(...args), NPE);
  });
  test('of 4-arg with missing finisher NPE', () => expectThrows(() => (Gatherer.of as any)(() => 0, integ, (a: number) => a), NPE));
});

describe('Gatherer.ofSequential', () => {
  const integ = (_: null, e: number, d: Downstream<number>) => d.push(e + 1);
  const fin = (_: null, d: Downstream<number>) => void d.push(0);
  test('ofSequential(integrator)', () => {
    const g = Gatherer.ofSequential(integ);
    expect(g.initializer()).toBe(Gatherer.defaultInitializer());
    expect(g.combiner()).toBe(Gatherer.defaultCombiner());
    expect(g.finisher()).toBe(Gatherer.defaultFinisher());
    expect(gather(g, [1, 2])).toEqual([2, 3]);
  });
  test('ofSequential(integrator, finisher)', () => {
    const g = Gatherer.ofSequential(integ, fin);
    expect(g.initializer()).toBe(Gatherer.defaultInitializer());
    expect(g.integrator()).toBe(integ);
    expect(g.finisher()).toBe(fin);
    expect(gather(g, [1])).toEqual([2, 0]);
  });
  test('ofSequential(initializer, integrator)', () => {
    const init = () => ({ n: 0 });
    const g = Gatherer.ofSequential(init, (s: { n: number }, e: number, d: Downstream<number>) => d.push(e + s.n++));
    expect(g.initializer()).toBe(init);
    expect(g.finisher()).toBe(Gatherer.defaultFinisher());
    expect(g.combiner()).toBe(Gatherer.defaultCombiner());
    expect(gather(g, [10, 10, 10])).toEqual([10, 11, 12]);
  });
  test('ofSequential(defaultInitializer, integrator) is the initializer form', () => {
    const g = Gatherer.ofSequential(Gatherer.defaultInitializer<null>(), integ);
    expect(g.finisher()).toBe(Gatherer.defaultFinisher());
    expect(g.integrator()).toBe(integ);
  });
  test('ofSequential(greedy zero-arg integrator, finisher) is the integrator form', () => {
    const g = Gatherer.ofSequential(Integrator.ofGreedy(() => true), fin);
    expect(g.finisher()).toBe(fin);
  });
  test('ofSequential(initializer, integrator, finisher)', () => {
    const g = Gatherer.ofSequential(
      () => [] as number[],
      (s: number[], e: number) => (s.push(e), true),
      (s, d: Downstream<number>) => s.reverse().forEach((x) => d.push(x))
    );
    expect(g.combiner()).toBe(Gatherer.defaultCombiner());
    expect(gather(g, [1, 2, 3])).toEqual([3, 2, 1]);
  });
  test('ofSequential(null) NPE', () => expectThrows(() => Gatherer.ofSequential(nul), NPE));
  test('ofSequential() NPE', () => expectThrows(() => (Gatherer.ofSequential as any)(), NPE));
  test('ofSequential(integrator, null) NPE', () => expectThrows(() => Gatherer.ofSequential(integ, nul), NPE));
  test('ofSequential(null, x) NPE', () => expectThrows(() => Gatherer.ofSequential(nul, fin), NPE));
  test('ofSequential(initializer, null) NPE', () => expectThrows(() => Gatherer.ofSequential(() => 0, nul), NPE));
  test.each([0, 1, 2])('ofSequential 3-arg null at %i NPE', (i) => {
    const args: any[] = [() => 0, integ, fin];
    args[i] = null;
    expectThrows(() => (Gatherer.ofSequential as any)(...args), NPE);
  });
});

describe('evaluation and short-circuit', () => {
  test('integrator returning false stops consumption', () => {
    const seen: number[] = [];
    const g = Gatherer.ofSequential<number, number>((_, e, d) => (seen.push(e), d.push(e), e < 3));
    expect(gather(g, nums(10))).toEqual([1, 2, 3]);
    expect(seen).toEqual([1, 2, 3]);
  });
  test('downstream rejecting stops consumption', () => {
    const seen: number[] = [];
    const g = Gatherer.of<number, number>((_, e, d) => (seen.push(e), d.push(e)));
    expect(gather(g, nums(10), 2)).toEqual([1, 2]);
    expect(seen).toEqual([1, 2]);
  });
  test('Downstream.push returns false after limit and keeps returning false', () => {
    const s = new Sink<number>(1);
    expect(s.push(1)).toBe(false);
    expect(s.isRejecting()).toBe(true);
    expect(s.push(2)).toBe(false);
    expect(s.out).toEqual([1]);
  });
  test('integrator observing isRejecting', () => {
    const flags: boolean[] = [];
    const g = Gatherer.of<number, number>((_, e, d) => {
      flags.push(d.isRejecting());
      d.push(e);
      flags.push(d.isRejecting());
      return true;
    });
    gather(g, [1, 2], 1);
    expect(flags).toEqual([false, true]);
  });
  test('finisher runs after a short-circuit', () => {
    const g = Gatherer.ofSequential<number, number>(
      (_, e, d) => d.push(e) && e < 2,
      (_, d) => void d.push(99)
    );
    expect(gather(g, nums(5))).toEqual([1, 2, 99]);
  });
  test('finisher runs on empty input', () => {
    expect(gather(Gatherer.of<number, number>((_, e, d) => d.push(e), (_, d) => void d.push(7)), [])).toEqual([7]);
  });
  test('each evaluation calls the initializer (state isolation)', () => {
    let calls = 0;
    const g = Gatherer.ofSequential(
      () => (calls++, { n: 0 }),
      (s: { n: number }, _e: number, d: Downstream<number>) => d.push(++s.n)
    );
    expect(gather(g, [0, 0])).toEqual([1, 2]);
    expect(gather(g, [0, 0])).toEqual([1, 2]);
    expect(calls).toBe(2);
  });
  test('the reference "map" example', () => expect(gather(map((i: number) => i + 1), [1, 2])).toEqual([2, 3]));
  test('the reference distinctBy example', () => {
    expect(gather(distinctBy((s: string) => s.length), ['a', 'bb', 'c', 'dd', 'eee'])).toEqual(['a', 'bb', 'eee']);
  });
  test('distinctBy state isolated between evaluations', () => {
    const g = distinctBy((x: number) => x);
    expect(gather(g, [1, 1, 2])).toEqual([1, 2]);
    expect(gather(g, [1, 2, 2])).toEqual([1, 2]);
  });
  test('limit helper', () => expect(gather(limit<number>(3), nums(10))).toEqual([1, 2, 3]));
  test('takeWhile helper', () => expect(gather(takeWhile((x: number) => x < 4), nums(10))).toEqual([1, 2, 3]));
  test('null elements pass through', () => expect(gather(map((x: null) => x), [null, null])).toEqual([null, null]));
});

describe('andThen', () => {
  const inc = map((i: number) => i + 1);
  const str = map((i: number) => `${i}`);
  test('the reference increment-then-toString example', () => expect(gather(inc.andThen(str), [1, 2, 3])).toEqual(['2', '3', '4']));
  test('andThen(null) NPE', () => expectThrows(() => inc.andThen(nul), NPE));
  test('composite andThen(null) NPE', () => expectThrows(() => inc.andThen(inc).andThen(nul), NPE));
  test('three gatherers', () => {
    const g = inc.andThen(filter((x: number) => x % 2 === 0)).andThen(str);
    expect(gather(g, nums(6))).toEqual(['2', '4', '6']);
  });
  test('three gatherers, right-nested', () => {
    const g = inc.andThen(filter((x: number) => x % 2 === 0).andThen(str));
    expect(gather(g, nums(6))).toEqual(['2', '4', '6']);
  });
  test('composite andThen composite', () => {
    const a = inc.andThen(inc);
    const b = inc.andThen(str);
    expect(gather(a.andThen(b), [0])).toEqual(['3']);
  });
  test('stateless greedy pair stays stateless and greedy', () => {
    const a = Gatherer.of(Integrator.ofGreedy<null, number, number>((_, e, d) => d.push(e + 1)));
    const c = a.andThen(a);
    expect(c.initializer()).toBe(Gatherer.defaultInitializer());
    expect(c.integrator().greedy).toBe(true);
    expect(c.finisher()).toBe(Gatherer.defaultFinisher());
    expect(c.combiner()).not.toBe(Gatherer.defaultCombiner());
    expect(c.combiner()(null, null)).toBeNull();
    expect(gather(c, [1, 2])).toEqual([3, 4]);
  });
  test('stateless greedy pair with a sequential side is sequential', () => {
    const a = Gatherer.of(Integrator.ofGreedy<null, number, number>((_, e, d) => d.push(e)));
    const b = Gatherer.ofSequential(Integrator.ofGreedy<null, number, number>((_, e, d) => d.push(e)));
    expect(a.andThen(b).combiner()).toBe(Gatherer.defaultCombiner());
    expect(b.andThen(a).combiner()).toBe(Gatherer.defaultCombiner());
  });
  test('stateless greedy pair finishers: left feeds right, then right', () => {
    const log: string[] = [];
    const a = Gatherer.of(
      Integrator.ofGreedy<null, number, number>((_, e, d) => d.push(e)),
      (_, d) => (log.push('a'), void d.push(100))
    );
    const b = Gatherer.of(
      Integrator.ofGreedy<null, number, number>((_, e, d) => d.push(e * 2)),
      (_, d) => (log.push('b'), void d.push(-1))
    );
    expect(gather(a.andThen(b), [1])).toEqual([2, 200, -1]);
    expect(log).toEqual(['a', 'b']);
    expect(gather(b.andThen(map((x: number) => x)), [1])).toEqual([2, -1]);
    expect(gather(map((x: number) => x).andThen(a), [1])).toEqual([1, 100]);
  });
  test('stateless greedy fast path forwards downstream rejection', () => {
    const a = Gatherer.of(Integrator.ofGreedy<null, number, number>((_, e, d) => d.push(e)));
    expect(gather(a.andThen(a), nums(10), 3)).toEqual([1, 2, 3]);
  });
  test('stateful composition keeps separate states', () => {
    const g = Gatherers.scan(() => 0, (a: number, b: number) => a + b).andThen(Gatherers.scan(() => 0, (a: number, b: number) => a + b));
    expect(gather(g, [1, 1, 1])).toEqual([1, 3, 6]);
    expect(gather(g, [1, 1, 1])).toEqual([1, 3, 6]);
  });
  test('composed initializer calls both initializers per evaluation', () => {
    let n = 0;
    const s = () =>
      Gatherer.ofSequential(
        () => (n++, {}),
        (_s: object, e: number, d: Downstream<number>) => d.push(e)
      );
    const g = s().andThen(s());
    gather(g, [1]);
    gather(g, [1]);
    expect(n).toBe(4);
  });
  test('composed stateless side is not initialized', () => {
    let n = 0;
    const g = Gatherer.ofSequential(() => (n++, 0), (_s: number, e: number, d: Downstream<number>) => d.push(e)).andThen(inc);
    expect(gather(g, [1])).toEqual([2]);
    expect(n).toBe(1);
  });
  test('right short-circuit stops upstream', () => {
    const seen: number[] = [];
    const tap = map((x: number) => (seen.push(x), x));
    expect(gather(tap.andThen(limit(2)), nums(10))).toEqual([1, 2]);
    expect(seen).toEqual([1, 2]);
  });
  test('left short-circuit stops upstream', () => {
    const g = takeWhile((x: number) => x < 3).andThen(inc);
    expect(gather(g, nums(10))).toEqual([2, 3]);
  });
  test('right short-circuited ignores further left output', () => {
    const fanOut = Gatherer.of<number, number>((_, e, d) => (d.push(e), d.push(e), d.push(e), true));
    const counted: number[] = [];
    const tap = map((x: number) => (counted.push(x), x));
    expect(gather(fanOut.andThen(limit(2)).andThen(tap), [1, 2])).toEqual([1, 1]);
    expect(counted).toEqual([1, 1]);
  });
  test('inner downstream reports not rejecting (as the reference)', () => {
    const flags: boolean[] = [];
    const probe = Gatherer.ofSequential<number, number>((_, e, d) => {
      d.push(e);
      flags.push(d.isRejecting());
      return true;
    });
    gather(probe.andThen(limit(1)), [1, 2]);
    expect(flags[0]).toBe(false);
  });
  test('finisher order: this then that, left output routed through right', () => {
    const log: string[] = [];
    const a = Gatherer.ofSequential(
      () => [] as number[],
      (s: number[], e: number) => (s.push(e), true),
      (s, d: Downstream<number>) => (log.push('a'), s.forEach((x) => d.push(x)))
    );
    const b = Gatherer.ofSequential(
      () => ({ sum: 0 }),
      (s: { sum: number }, e: number, d: Downstream<number>) => ((s.sum += e), d.push(e * 10)),
      (s, d: Downstream<number>) => (log.push('b'), void d.push(s.sum))
    );
    expect(gather(a.andThen(b), [1, 2])).toEqual([10, 20, 3]);
    expect(log).toEqual(['a', 'b']);
  });
  test('only right has a finisher', () => {
    const g = inc.andThen(Gatherers.fold(() => 0, (a: number, b: number) => a + b));
    expect(gather(g, [1, 2])).toEqual([5]);
  });
  test('only left has a finisher', () => {
    const g = Gatherers.fold(() => 0, (a: number, b: number) => a + b).andThen(inc);
    expect(gather(g, [1, 2])).toEqual([4]);
  });
  test('no finisher on either side gives defaultFinisher', () => {
    expect(takeWhile((_x: number) => true).andThen(inc).finisher()).toBe(Gatherer.defaultFinisher());
  });
  test('greedy-ness: greedy only when both are greedy', () => {
    const g1 = Gatherers.scan(() => 0, (a: number) => a);
    expect(g1.andThen(g1).integrator().greedy).toBe(true);
    expect(g1.andThen(takeWhile((_x: number) => true)).integrator().greedy).toBeUndefined();
    expect(takeWhile((_x: number) => true).andThen(g1).integrator().greedy).toBeUndefined();
  });
  test('combiner is default when either side is sequential', () => {
    expect(sum().andThen(takeWhile((_x: number) => true)).combiner()).toBe(Gatherer.defaultCombiner());
    expect(takeWhile((_x: number) => true).andThen(sum()).combiner()).toBe(Gatherer.defaultCombiner());
  });
  test('parallel stateful composition combines states', () => {
    const g = sum().andThen(sum());
    expect(g.combiner()).not.toBe(Gatherer.defaultCombiner());
    expect(gatherSplit(g, nums(10), 3)).toEqual([55]);
  });
  test('combined composite state keeps short-circuit flags', () => {
    const stopAt2 = Gatherer.of<number, number>((_, e, d) => d.push(e) && e < 2);
    const g = stopAt2.andThen(sum());
    const c = g.combiner();
    const st = (input: number[]) => {
      const s = g.initializer()();
      for (const x of input) if (!g.integrator()(s, x, new Sink())) break;
      return s;
    };
    const joined = c(st([1, 2]), st([1]));
    expect(joined.leftProceed).toBe(false);
    expect(joined.rightProceed).toBe(true);
    const sink = new Sink<number>();
    g.finisher()(joined, sink);
    expect(sink.out).toEqual([4]);
  });
  test('composite parts are computed once and stable', () => {
    const g = inc.andThen(limit(1));
    expect(g.initializer()).toBe(g.initializer());
    expect(g.integrator()).toBe(g.integrator());
    expect(g.combiner()).toBe(g.combiner());
    expect(g.finisher()).toBe(g.finisher());
  });
  test('chain of five built-ins', () => {
    const g = Gatherers.scan(() => 0, (a: number, b: number) => a + b)
      .andThen(filter((x: number) => x % 2 === 1))
      .andThen(Gatherers.windowFixed<number>(2))
      .andThen(map((l: List<number>) => l.size()))
      .andThen(Gatherers.fold(() => 0, (a: number, b: number) => a + b));
    // prefix sums 1,3,6,10,15,21,28,36 -> odd 1,3,15,21 -> 2 windows of 2
    expect(gather(g, nums(8))).toEqual([4]);
  });
  test('short-circuit across a three-gatherer chain', () => {
    const seen: number[] = [];
    const g = map((x: number) => (seen.push(x), x)).andThen(Gatherers.windowFixed<number>(2)).andThen(limit(2));
    expect(arrays(gather(g, nums(100)))).toEqual([[1, 2], [3, 4]]);
    expect(seen).toEqual([1, 2, 3, 4]);
  });
  test('composite with a user-implemented gatherer object', () => {
    const custom: Gatherer<number, null, number> = {
      initializer: () => Gatherer.defaultInitializer(),
      integrator: () => (_s, e, d) => d.push(-e),
      combiner: () => Gatherer.defaultCombiner(),
      finisher: () => Gatherer.defaultFinisher(),
      andThen: (that) => inc.andThen(that as any) as any,
    };
    expect(gather(inc.andThen(custom), [1])).toEqual([-2]);
  });
});

describe('Gatherers.fold', () => {
  const concat = (s: string, n: number) => s + n;
  test('the reference example', () => expect(gather(Gatherers.fold(() => '', concat), nums(9))).toEqual(['123456789']));
  test('empty input emits the initial value', () => expect(gather(Gatherers.fold(() => 'x', concat), [])).toEqual(['x']));
  test('non-associative op keeps encounter order', () =>
    expect(gather(Gatherers.fold(() => 100, (a: number, b: number) => a - b), [1, 2, 3])).toEqual([94]));
  test('non-associative op: division', () =>
    expect(gather(Gatherers.fold(() => 1024, (a: number, b: number) => a / b), [2, 4, 8])).toEqual([16]));
  test('is sequential and greedy', () => {
    const g = Gatherers.fold(() => 0, (a: number) => a);
    expect(g.combiner()).toBe(Gatherer.defaultCombiner());
    expect(g.integrator().greedy).toBe(true);
    expect(g.finisher()).not.toBe(Gatherer.defaultFinisher());
  });
  test('initial is called once per evaluation', () => {
    let n = 0;
    const g = Gatherers.fold(() => (n++, 0), (a: number, b: number) => a + b);
    expect(gather(g, [1, 2])).toEqual([3]);
    expect(gather(g, [3])).toEqual([3]);
    expect(n).toBe(2);
  });
  test('null accumulator is allowed', () => expect(gather(Gatherers.fold(() => null, () => null), [1])).toEqual([null]));
  test('folder exception propagates', () =>
    expect(() => gather(Gatherers.fold(() => 0, () => { throw new TypeError('x'); }), [1])).toThrow(TypeError));
  test('null initial NPE', () => expectThrows(() => Gatherers.fold(nul, concat), NPE));
  test('null folder NPE', () => expectThrows(() => Gatherers.fold(() => '', nul), NPE));
});

describe('Gatherers.scan', () => {
  const concat = (s: string, n: number) => s + n;
  test('the reference example', () =>
    expect(gather(Gatherers.scan(() => '', concat), nums(9))).toEqual(['1', '12', '123', '1234', '12345', '123456', '1234567', '12345678', '123456789']));
  test('empty input emits nothing', () => expect(gather(Gatherers.scan(() => '', concat), [])).toEqual([]));
  test('non-associative op', () =>
    expect(gather(Gatherers.scan(() => 0, (a: number, b: number) => b - a), [1, 2, 3])).toEqual([1, 1, 2]));
  test('honours downstream rejection', () => {
    let calls = 0;
    const g = Gatherers.scan(() => 0, (a: number, b: number) => (calls++, a + b));
    expect(gather(g, nums(10), 3)).toEqual([1, 3, 6]);
    expect(calls).toBe(3);
  });
  test('is sequential, greedy, without finisher', () => {
    const g = Gatherers.scan(() => 0, (a: number) => a);
    expect(g.combiner()).toBe(Gatherer.defaultCombiner());
    expect(g.integrator().greedy).toBe(true);
    expect(g.finisher()).toBe(Gatherer.defaultFinisher());
  });
  test('state isolated between evaluations', () => {
    const g = Gatherers.scan(() => 0, (a: number, b: number) => a + b);
    expect(gather(g, [1, 2])).toEqual([1, 3]);
    expect(gather(g, [1, 2])).toEqual([1, 3]);
  });
  test('null initial NPE', () => expectThrows(() => Gatherers.scan(nul, concat), NPE));
  test('null scanner NPE', () => expectThrows(() => Gatherers.scan(() => '', nul), NPE));
});

describe('Gatherers.windowFixed', () => {
  const run = (size: number, n: number, lim?: number) => arrays(gather(Gatherers.windowFixed<number>(size), nums(n), lim));
  test('the reference example', () => expect(run(3, 8)).toEqual([[1, 2, 3], [4, 5, 6], [7, 8]]));
  test('window size 1', () => expect(run(1, 3)).toEqual([[1], [2], [3]]));
  test('exact multiple', () => expect(run(2, 6)).toEqual([[1, 2], [3, 4], [5, 6]]));
  test('fewer elements than size', () => expect(run(5, 3)).toEqual([[1, 2, 3]]));
  test('exactly one window', () => expect(run(4, 4)).toEqual([[1, 2, 3, 4]]));
  test('empty input', () => expect(run(3, 0)).toEqual([]));
  test('huge window size on small input', () => expect(run(2 ** 31 - 1, 2)).toEqual([[1, 2]]));
  test('downstream rejecting stops; finisher skips partial window', () => expect(run(2, 5, 1)).toEqual([[1, 2]]));
  test('partial window emitted when downstream still accepts', () => expect(run(2, 5, 3)).toEqual([[1, 2], [3, 4], [5]]));
  test.each([0, -1, 1.5, NaN, -Infinity])('size %p throws IAE', (n) => expectThrows(() => Gatherers.windowFixed(n), IAE));
  test('windows are unmodifiable lists', () => {
    const [w] = gather(Gatherers.windowFixed<number>(2), [1, 2]);
    expectThrows(() => w.add(3), UOE);
    expectThrows(() => w.set(0, 3), UOE);
    expectThrows(() => w.clear(), UOE);
    expect(w.get(1)).toBe(2);
    expect(w.size()).toBe(2);
  });
  test('last partial window is unmodifiable', () => {
    const ws = gather(Gatherers.windowFixed<number>(2), [1, 2, 3]);
    expectThrows(() => ws[1].add(4), UOE);
  });
  test('windows allow nulls', () => expect(arrays(gather(Gatherers.windowFixed<null>(2), [null, null]))).toEqual([[null, null]]));
  test('windows equal other lists by value', () => {
    const [a] = gather(Gatherers.windowFixed<number>(2), [1, 2]);
    const [b] = gather(Gatherers.windowFixed<number>(2), [1, 2]);
    expect(a.equals(b)).toBe(true);
    expect(a.hashCode()).toBe(b.hashCode());
  });
  test('is sequential and greedy with a finisher', () => {
    const g = Gatherers.windowFixed(2);
    expect(g.combiner()).toBe(Gatherer.defaultCombiner());
    expect(g.integrator().greedy).toBe(true);
    expect(g.finisher()).not.toBe(Gatherer.defaultFinisher());
  });
  test('state isolated between evaluations', () => {
    const g = Gatherers.windowFixed<number>(2);
    expect(arrays(gather(g, [1, 2, 3]))).toEqual([[1, 2], [3]]);
    expect(arrays(gather(g, [4]))).toEqual([[4]]);
  });
});

describe('Gatherers.windowSliding', () => {
  const run = (size: number, n: number, lim?: number) => arrays(gather(Gatherers.windowSliding<number>(size), nums(n), lim));
  test('the reference example (2)', () => expect(run(2, 8)).toEqual([[1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8]]));
  test('the reference example (6)', () => expect(run(6, 8)).toEqual([[1, 2, 3, 4, 5, 6], [2, 3, 4, 5, 6, 7], [3, 4, 5, 6, 7, 8]]));
  test('window size 1', () => expect(run(1, 3)).toEqual([[1], [2], [3]]));
  test('size equals input length', () => expect(run(3, 3)).toEqual([[1, 2, 3]]));
  test('fewer elements than size gives one window with all', () => expect(run(5, 3)).toEqual([[1, 2, 3]]));
  test('single element, large window', () => expect(run(10, 1)).toEqual([[1]]));
  test('empty input', () => expect(run(3, 0)).toEqual([]));
  test('downstream rejecting stops', () => expect(run(2, 10, 2)).toEqual([[1, 2], [2, 3]]));
  test('finisher skips when downstream rejecting', () => {
    const g = Gatherers.windowSliding<number>(5);
    const s = new Sink<List<number>>(0);
    const st = g.initializer()();
    g.integrator()(st, 1, s);
    g.finisher()(st, s);
    expect(s.pushes).toBe(0);
  });
  test('no trailing window after a full one', () => expect(run(2, 3)).toEqual([[1, 2], [2, 3]]));
  test.each([0, -5, 2.5, NaN])('size %p throws IAE', (n) => expectThrows(() => Gatherers.windowSliding(n), IAE));
  test('windows are unmodifiable and independent', () => {
    const ws = gather(Gatherers.windowSliding<number>(2), [1, 2, 3]);
    expectThrows(() => ws[0].add(9), UOE);
    expectThrows(() => ws[0].removeAt(0), UOE);
    expect(ws[0].toArray()).toEqual([1, 2]);
  });
  test('short window unmodifiable', () => expectThrows(() => gather(Gatherers.windowSliding<number>(3), [1])[0].add(2), UOE));
  test('is sequential and greedy with a finisher', () => {
    const g = Gatherers.windowSliding(2);
    expect(g.combiner()).toBe(Gatherer.defaultCombiner());
    expect(g.integrator().greedy).toBe(true);
    expect(g.finisher()).not.toBe(Gatherer.defaultFinisher());
  });
  test('state isolated between evaluations', () => {
    const g = Gatherers.windowSliding<number>(2);
    expect(arrays(gather(g, [1, 2, 3]))).toEqual([[1, 2], [2, 3]]);
    expect(arrays(gather(g, [7]))).toEqual([[7]]);
  });
});

describe('Gatherers.mapConcurrent', () => {
  test('maxConcurrency < 1 message says "greater than 0", unlike the window gatherers', () => {
    expect(() => Gatherers.mapConcurrent(0, (x: number) => x)).toThrow("'maxConcurrency' must be greater than 0");
    expect(() => Gatherers.windowFixed(0)).toThrow("'windowSize' must be greater than zero");
    expect(() => Gatherers.windowSliding(0)).toThrow("'windowSize' must be greater than zero");
  });
  test('maps preserving order', () => expect(gather(Gatherers.mapConcurrent(4, (x: number) => x * x), [3, 1, 2])).toEqual([9, 1, 4]));
  test('maxConcurrency 1', () => expect(gather(Gatherers.mapConcurrent(1, (x: number) => -x), [1])).toEqual([-1]));
  test('empty input', () => expect(gather(Gatherers.mapConcurrent(2, (x: number) => x), [])).toEqual([]));
  test('null results pass through', () => expect(gather(Gatherers.mapConcurrent(2, () => null), [1, 2])).toEqual([null, null]));
  test('stops mapping once downstream rejects', () => {
    let calls = 0;
    const g = Gatherers.mapConcurrent(8, (x: number) => (calls++, x));
    expect(gather(g, nums(10), 3)).toEqual([1, 2, 3]);
    expect(calls).toBe(3);
  });
  test('mapper not called when downstream already rejecting', () => {
    let calls = 0;
    const g = Gatherers.mapConcurrent(8, (x: number) => (calls++, x));
    expect(g.integrator()(null, 1, new Sink(0))).toBe(false);
    expect(calls).toBe(0);
  });
  test('RuntimeException from mapper rethrown as-is', () => {
    const e = new RuntimeException('boom');
    try {
      gather(Gatherers.mapConcurrent(2, () => { throw e; }), [1]);
      fail('no throw');
    } catch (x) {
      expect(x).toBe(e);
    }
  });
  test('other Error is wrapped in RuntimeException with cause', () => {
    const e = new TypeError('bad');
    try {
      gather(Gatherers.mapConcurrent(2, () => { throw e; }), [1]);
      fail('no throw');
    } catch (x) {
      expect(x).toBeInstanceOf(RuntimeException);
      expect((x as RuntimeException).name).toBe('RuntimeException');
      expect((x as { cause?: unknown }).cause).toBe(e);
      expect((x as Error).message).toBe('TypeError: bad');
    }
  });
  test('non-Error throwable is wrapped', () => {
    try {
      gather(Gatherers.mapConcurrent(2, () => { throw 'str'; }), [1]);
      fail('no throw');
    } catch (x) {
      expect(x).toBeInstanceOf(RuntimeException);
      expect((x as { cause?: unknown }).cause).toBe('str');
    }
  });
  test('elements before the failure were pushed', () => {
    const sink = new Sink<number>();
    const g = Gatherers.mapConcurrent(2, (x: number) => { if (x === 3) throw new Error('x'); return x; });
    const st = g.initializer()();
    expect(() => [1, 2, 3, 4].forEach((x) => g.integrator()(st, x, sink))).toThrow(RuntimeException);
    expect(sink.out).toEqual([1, 2]);
  });
  test('is sequential, stateless, greedy', () => {
    const g = Gatherers.mapConcurrent(2, (x: number) => x);
    expect(g.combiner()).toBe(Gatherer.defaultCombiner());
    expect(g.initializer()).toBe(Gatherer.defaultInitializer());
    expect(g.integrator().greedy).toBe(true);
    expect(g.finisher()).toBe(Gatherer.defaultFinisher());
  });
  test.each([0, -1, 1.5, NaN])('maxConcurrency %p throws IAE', (n) => expectThrows(() => Gatherers.mapConcurrent(n, (x) => x), IAE));
  test('null mapper NPE', () => expectThrows(() => Gatherers.mapConcurrent(1, nul), NPE));
  test('IAE checked before NPE', () => expectThrows(() => Gatherers.mapConcurrent(0, nul), IAE));
  test('composes with windowFixed', () => {
    const g = Gatherers.mapConcurrent(2, (x: number) => x * 10).andThen(Gatherers.windowFixed<number>(2));
    expect(arrays(gather(g, [1, 2, 3]))).toEqual([[10, 20], [30]]);
  });
});

describe('plain-object gatherers (members other than integrator are optional)', () => {
  // any: the members are optional in the contract; the cast keeps this independent of how the type spells it
  const plain = <T, R>(g: { integrator: () => any; initializer?: () => any; finisher?: () => any; combiner?: () => any }) => g as any as Gatherer<T, any, R>;
  const twice = plain<number, number>({ integrator: () => (_: unknown, e: number, d: Downstream<number>) => d.push(e) && d.push(e) });
  const inc = map((i: number) => i + 1);
  const str = map((i: number) => `${i}`);

  test('composes on the right', () => expect(gather(inc.andThen(twice), [1, 2])).toEqual([2, 2, 3, 3]));
  test('composes in the middle of a chain (left-nested and right-nested)', () => {
    expect(gather(inc.andThen(twice).andThen(str), [1])).toEqual(['2', '2']);
    expect(gather(inc.andThen(inc.andThen(twice)), [1])).toEqual([3, 3]);
    expect(gather(inc.andThen(inc).andThen(inc.andThen(twice)), [0])).toEqual([3, 3]);
  });
  test('missing members read as the default sentinels', () => {
    const c = inc.andThen(twice);
    expect(c.initializer()).not.toBe(undefined);
    expect(c.combiner()).toBe(Gatherer.defaultCombiner());
    expect(c.finisher()).toBe(Gatherer.defaultFinisher());
    const greedyPlain = plain<number, number>({ integrator: () => Integrator.ofGreedy((_: unknown, e: number, d: Downstream<number>) => d.push(e)) });
    const g = Gatherer.of(Integrator.ofGreedy<null, number, number>((_, e, d) => d.push(e)));
    expect(g.andThen(greedyPlain).initializer()).toBe(Gatherer.defaultInitializer());
    expect(g.andThen(greedyPlain).combiner()).toBe(Gatherer.defaultCombiner());
  });
  test('optional initializer, finisher and combiner are used when present', () => {
    const sum = plain<number, number>({
      initializer: () => () => ({ v: 0 }),
      integrator: () => (s: { v: number }, e: number) => ((s.v += e), true),
      finisher: () => (s: { v: number }, d: Downstream<number>) => void d.push(s.v),
      combiner: () => (a: { v: number }, b: { v: number }) => ({ v: a.v + b.v }),
    });
    const c = inc.andThen(sum);
    expect(gather(c, [1, 2, 3])).toEqual([9]);
    expect(c.combiner()).not.toBe(Gatherer.defaultCombiner());
    expect(gatherSplit(c, [1, 2, 3], 1)).toEqual([9]);
  });
  test('a user andThen returning a plain gatherer gets its missing members filled in', () => {
    const custom = plain<number, number>({
      integrator: () => (_: unknown, e: number, d: Downstream<number>) => d.push(e),
    }) as any;
    custom.andThen = (that: Gatherer<number, any, number>) => plain<number, number>({ integrator: () => (_: unknown, e: number, d: Downstream<number>) => d.push(e * 10) && that.integrator()(null, e, d) });
    // inc.andThen(custom).andThen(x) re-associates to custom.andThen(x), whose plain result is completed
    const c = inc.andThen(custom).andThen(map((x: number) => x) as any);
    expect(c.combiner()).toBe(Gatherer.defaultCombiner());
    expect(c.finisher()).toBe(Gatherer.defaultFinisher());
    expect(gather(c, [1])).toEqual([20, 2]);
  });
  test('a short-circuiting plain gatherer stops the chain', () => {
    const first = plain<number, number>({ integrator: () => (_: unknown, e: number, d: Downstream<number>) => (d.push(e), false) });
    expect(gather(inc.andThen(first), [1, 2, 3])).toEqual([2]);
  });
});
