// Engine-level behaviour: a lazy reference model compared against random pipelines, infinite-stream
// short-circuiting, resource closing, size propagation, the spliterator escape hatch and StreamSupport.
import {
  IllegalArgumentException,
  IllegalStateException,
  IndexOutOfBoundsException,
  NullPointerException,
} from '../../src/exceptions';
import { ArrayList } from '../../src/list/ArrayList';
import { HashSet } from '../../src/set/HashSet';
import { TreeSet } from '../../src/set/TreeSet';
import type { Collector } from '../../src/stream/Collector';
import { Comparator } from '../../src/util/Comparator';
import type { Downstream, Gatherer, Integrator } from '../../src/stream/Gatherer';
import { streamFactories } from '../../src/stream/hook';
import { BaseSpliterator, Spliterator } from '../../src/stream/Spliterator';
import { StreamSupport } from '../../src/stream/StreamSupport';
import { DoubleStream, IntStream, LongStream, Stream } from '../../src/stream/Streams';
import { rng } from '../helpers';

function arrayList<T>(xs: readonly T[]): ArrayList<T> {
  const l = new ArrayList<T>();
  for (const x of xs) l.add(x);
  return l;
}

function gatherer<T, A, R>(init: () => A, integ: (s: A, t: T, d: Downstream<R>) => boolean, fin: (s: A, d: Downstream<R>) => void): Gatherer<T, A, R> {
  return {
    initializer: () => init,
    integrator: () => integ as Integrator<A, T, R>,
    combiner: () => (a) => a,
    finisher: () => fin,
    andThen: () => {
      throw new Error('unused');
    },
  };
}

/** A spliterator the engine has no fast path for: only tryAdvance and the BaseSpliterator defaults. */
class PlainSpliterator<T> extends BaseSpliterator<T> {
  i = 0;
  constructor(private readonly a: T[], private readonly flags = Spliterator.ORDERED | Spliterator.SIZED) {
    super();
  }
  tryAdvance(action: (t: T) => void): boolean {
    if (this.i >= this.a.length) return false;
    action(this.a[this.i++]);
    return true;
  }
  estimateSize(): number {
    return this.a.length - this.i;
  }
  characteristics(): number {
    return this.flags;
  }
}

// ---------------------------------------------------------------- lazy reference model (generators)

type Model = Iterable<number>;
interface Op {
  desc: string;
  apply(s: Stream<number>, log: string[]): Stream<number>;
  model(m: Model, log: string[]): Model;
}

function* mFilter(m: Model, p: (x: number) => boolean) {
  for (const x of m) if (p(x)) yield x;
}
function* mMap(m: Model, f: (x: number) => number) {
  for (const x of m) yield f(x);
}
function* mPeek(m: Model, f: (x: number) => void) {
  for (const x of m) {
    f(x);
    yield x;
  }
}
function* mSorted(m: Model, c: (a: number, b: number) => number) {
  const a = [...m];
  a.sort(c);
  yield* a;
}
function* mDistinct(m: Model) {
  const seen = new Set<number>();
  for (const x of m) if (!seen.has(x)) (seen.add(x), yield x);
}
function* mLimit(m: Model, n: number) {
  if (n <= 0) return;
  let i = 0;
  for (const x of m) {
    yield x;
    if (++i >= n) return;
  }
}
function* mSkip(m: Model, n: number) {
  let i = 0;
  for (const x of m) if (i++ >= n) yield x;
}
function* mTakeWhile(m: Model, p: (x: number) => boolean) {
  for (const x of m) {
    if (!p(x)) return;
    yield x;
  }
}
function* mDropWhile(m: Model, p: (x: number) => boolean) {
  let dropping = true;
  for (const x of m) {
    if (dropping && p(x)) continue;
    dropping = false;
    yield x;
  }
}
function* mFlatMap(m: Model, f: (x: number) => number[] | null) {
  for (const x of m) {
    const r = f(x);
    if (r !== null) yield* r;
  }
}
function* mGatherUntil(m: Model, t: number) {
  for (const x of m) {
    yield x;
    if (x > t) break;
  }
  yield -1;
}

function randomOp(r: (n: number) => number, id: number): Op {
  const k = r(13);
  const n = 1 + r(8);
  const t = r(30);
  switch (k) {
    case 0:
      return { desc: `filter(%${n + 1})`, apply: (s) => s.filter((x) => x % (n + 1) !== 0), model: (m) => mFilter(m, (x) => x % (n + 1) !== 0) };
    case 1:
      return { desc: `map(*3%50)`, apply: (s) => s.map((x) => (x * 3) % 50), model: (m) => mMap(m, (x) => (x * 3) % 50) };
    case 2: {
      const rev = r(2) === 0;
      const c = rev ? (a: number, b: number) => b - a : null;
      return {
        desc: rev ? 'sorted(desc)' : 'sorted()',
        apply: (s) => (c ? s.sorted(c) : s.sorted()),
        model: (m) => mSorted(m, c ?? ((a, b) => a - b)),
      };
    }
    case 3:
      return { desc: 'distinct', apply: (s) => s.distinct(), model: (m) => mDistinct(m) };
    case 4:
      return { desc: `limit(${n})`, apply: (s) => s.limit(n), model: (m) => mLimit(m, n) };
    case 5:
      return { desc: `skip(${n})`, apply: (s) => s.skip(n), model: (m) => mSkip(m, n) };
    case 6:
      return { desc: `takeWhile(<${t})`, apply: (s) => s.takeWhile((x) => x < t), model: (m) => mTakeWhile(m, (x) => x < t) };
    case 7:
      return { desc: `dropWhile(<${t})`, apply: (s) => s.dropWhile((x) => x < t), model: (m) => mDropWhile(m, (x) => x < t) };
    case 8:
      return {
        desc: `peek#${id}`,
        apply: (s, log) => s.peek((x) => log.push(`${id}:${x}`)),
        model: (m, log) => mPeek(m, (x) => log.push(`${id}:${x}`)),
      };
    case 9: {
      const f = (x: number) => (x % 3 === 0 ? null : [x, x + 100]);
      return {
        desc: 'flatMap',
        apply: (s) => s.flatMap((x) => {
          const a = f(x);
          return a === null ? null : Stream.of(...a);
        }),
        model: (m) => mFlatMap(m, f),
      };
    }
    case 10:
      return {
        // one emission at most: a batch is pushed eagerly even past a downstream stop (tested separately)
        desc: 'mapMulti',
        apply: (s) => s.mapMulti<number>((x, e) => (x % 2 === 0 ? e(-x) : undefined)),
        model: (m) => mFlatMap(m, (x) => (x % 2 === 0 ? [-x] : [])),
      };
    case 11:
      return {
        desc: 'mapToInt.map.boxed',
        apply: (s) => s.mapToInt((x) => x).map((x) => x + 1).boxed(),
        model: (m) => mMap(m, (x) => x + 1),
      };
    default:
      return {
        desc: `gatherUntil(>${t})`,
        apply: (s) =>
          s.gather(
            gatherer<number, null, number>(
              () => null,
              (_, x, d) => d.push(x) && !(x > t),
              (_, d) => {
                d.push(-1);
              }
            )
          ),
        model: (m) => mGatherUntil(m, t),
      };
  }
}

interface Terminal {
  desc: string;
  logged: boolean;
  run(s: Stream<number>): unknown;
  model(m: Model): unknown;
}

function first(m: Model): number | undefined {
  for (const x of m) return x;
  return undefined;
}

function randomTerminal(r: (n: number) => number): Terminal {
  const t = r(30);
  switch (r(10)) {
    case 0:
      return { desc: 'toArray', logged: true, run: (s) => s.toArray(), model: (m) => [...m] };
    case 1:
      return { desc: 'count', logged: false, run: (s) => s.count(), model: (m) => [...m].length };
    case 2:
      return { desc: 'findFirst', logged: true, run: (s) => s.findFirst().orElse(-999), model: (m) => first(m) ?? -999 };
    case 3:
      return { desc: `anyMatch(>${t})`, logged: true, run: (s) => s.anyMatch((x) => x > t), model: (m) => first(mFilter(m, (x) => x > t)) !== undefined };
    case 4:
      return { desc: `allMatch(<${t})`, logged: true, run: (s) => s.allMatch((x) => x < t), model: (m) => first(mFilter(m, (x) => !(x < t))) === undefined };
    case 5:
      return { desc: `noneMatch(=${t})`, logged: true, run: (s) => s.noneMatch((x) => x === t), model: (m) => first(mFilter(m, (x) => x === t)) === undefined };
    case 6:
      return { desc: 'reduce(+)', logged: true, run: (s) => s.reduce(0, (a, b) => a + b), model: (m) => [...m].reduce((a, b) => a + b, 0) };
    case 7:
      return { desc: 'iterator', logged: true, run: (s) => [...s], model: (m) => [...m] };
    case 8:
      return { desc: 'toList', logged: true, run: (s) => s.toList().toArray(), model: (m) => [...m] };
    default:
      return {
        desc: 'max',
        logged: true,
        run: (s) => s.max((a, b) => a - b).orElse(-999),
        model: (m) => [...m].reduce((a, b) => (b > a ? b : a), -999),
      };
  }
}

function randomSource(r: (n: number) => number, a: number[]): { desc: string; make(): Stream<number> } {
  switch (r(6)) {
    case 0:
      return { desc: 'ofArray', make: () => Stream.ofArray(a) };
    case 1:
      return { desc: 'ArrayList', make: () => arrayList(a).stream() };
    case 2:
      return { desc: 'iterate.limit.map', make: () => Stream.iterate(0, (i) => i + 1).limit(a.length).map((i) => a[i]) };
    case 3: {
      const h = a.length >> 1;
      return { desc: 'concat', make: () => Stream.concat(Stream.ofArray(a.slice(0, h)), arrayList(a.slice(h)).stream()) };
    }
    case 4:
      return { desc: 'plain spliterator', make: () => StreamSupport.stream(new PlainSpliterator(a), false) };
    default:
      return { desc: 'IntStream.boxed', make: () => IntStream.ofArray(a).boxed() };
  }
}

describe('engine · random pipelines match a lazy model (results and peek order)', () => {
  for (let seed = 1; seed <= 250; seed++) {
    const r = rng(seed * 7919);
    const a = Array.from({ length: r(26) }, () => r(31));
    const src = randomSource(r, a);
    const ops = Array.from({ length: 1 + r(6) }, (_, i) => randomOp(r, i));
    const term = randomTerminal(r);
    it(`#${seed} ${src.desc} → ${ops.map((o) => o.desc).join(' → ')} → ${term.desc}`, () => {
      const log: string[] = [];
      const mlog: string[] = [];
      let s = src.make();
      let m: Model = a;
      for (const op of ops) {
        s = op.apply(s, log);
        m = op.model(m, mlog);
      }
      expect(term.run(s)).toEqual(term.model(m));
      if (term.logged) expect(log).toEqual(mlog);
    });
  }
});

describe('engine · short-circuiting infinite streams', () => {
  const nat = () => Stream.iterate(0, (x) => x + 1);
  it.each<[string, () => unknown, unknown]>([
    ['limit + toArray', () => nat().limit(3).toArray(), [0, 1, 2]],
    ['limit + forEach', () => {
      const out: number[] = [];
      nat().limit(2).forEach((x) => out.push(x));
      return out;
    }, [0, 1]],
    ['limit + count', () => nat().limit(5).count(), 5],
    ['limit + reduce', () => nat().limit(5).reduce(0, (a, b) => a + b), 10],
    ['limit + sorted', () => nat().limit(3).sorted((a, b) => b - a).toArray(), [2, 1, 0]],
    ['limit + distinct', () => nat().map((x) => x % 2).distinct().limit(2).toArray(), [0, 1]],
    ['findFirst after filter', () => nat().filter((x) => x > 10).findFirst().get(), 11],
    ['anyMatch', () => nat().anyMatch((x) => x === 1000), true],
    ['allMatch false', () => nat().allMatch((x) => x < 50), false],
    ['noneMatch false', () => nat().noneMatch((x) => x === 7), false],
    ['takeWhile', () => nat().takeWhile((x) => x < 4).toArray(), [0, 1, 2, 3]],
    ['dropWhile + limit', () => nat().dropWhile((x) => x < 4).limit(2).toArray(), [4, 5]],
    ['skip + findFirst', () => nat().skip(100).findFirst().get(), 100],
    ['generate + limit', () => Stream.generate(() => 'x').limit(2).toArray(), ['x', 'x']],
    ['flatMap infinite inner + limit', () => nat().flatMap((x) => Stream.generate(() => x)).limit(3).toArray(), [0, 0, 0]],
    ['flatMap over infinite outer + findFirst', () => nat().flatMap((x) => (x < 5 ? null : Stream.of(x))).findFirst().get(), 5],
    ['nested flatMap', () => nat().flatMap((x) => nat().flatMap((y) => Stream.of(x * 100 + y))).limit(2).toArray(), [0, 1]],
    ['mapMulti + limit', () => nat().mapMulti<number>((x, e) => (e(x), e(x))).limit(3).toArray(), [0, 0, 1]],
    ['concat(infinite, x) + limit', () => Stream.concat(nat(), Stream.of(-1)).limit(2).toArray(), [0, 1]],
    ['iterator', () => {
      const it = nat().filter((x) => x % 7 === 0).iterator();
      return [it.next(), it.next()];
    }, [0, 7]],
    ['spliterator.tryAdvance', () => {
      let v = -1;
      nat().map((x) => x * 2).skip(2).spliterator().tryAdvance((x) => (v = x));
      return v;
    }, 4],
    ['for-of break', () => {
      for (const x of nat()) if (x === 3) return x;
      return -1;
    }, 3],
    ['IntStream.iterate + limit + sum', () => IntStream.iterate(1, (x) => x + 1).limit(100).sum(), 5050],
    ['IntStream.generate + anyMatch', () => IntStream.generate(() => 4).anyMatch((x) => x === 4), true],
    ['range(0, MAX) + findFirst', () => IntStream.range(0, 2147483647).filter((x) => x > 5).findFirst().getAsInt(), 6],
    ['gather short-circuit', () =>
      nat()
        .gather(gatherer<number, null, number>(() => null, (_, x, d) => d.push(x) && x < 2, () => {}))
        .toArray(), [0, 1, 2]],
    ['limit(0) pulls nothing', () => {
      let pulled = 0;
      Stream.generate(() => pulled++).limit(0).toArray();
      return pulled;
    }, 0],
  ])('%s', (_, run, expected) => {
    expect(run()).toEqual(expected);
  });

  it('mapMulti pushes its whole batch even after the downstream stopped (like the reference)', () => {
    const seen: number[] = [];
    const r = Stream.of(1, 2)
      .mapMulti<number>((x, e) => (e(x), e(x * 10)))
      .peek((x) => seen.push(x))
      .findFirst()
      .get();
    expect(r).toBe(1);
    expect(seen).toEqual([1, 10]);
  });
  it('a sorted barrier stops downstream cancellation from reaching the source', () => {
    const seen: number[] = [];
    const r = Stream.of(3, 1, 2)
      .peek((x) => seen.push(x))
      .sorted()
      .limit(0)
      .toArray();
    expect(r).toEqual([]);
    expect(seen).toEqual([3, 1, 2]);
  });
  it('a limit upstream of sorted still stops the source', () => {
    let pulled = 0;
    expect(
      Stream.generate(() => pulled++)
        .limit(3)
        .sorted((a, b) => b - a)
        .findFirst()
        .get()
    ).toBe(2);
    expect(pulled).toBe(3);
  });
  it('a plain spliterator source is driven by tryAdvance when short-circuiting', () => {
    const sp = new PlainSpliterator([1, 2, 3, 4]);
    expect(StreamSupport.stream(sp, false).anyMatch((x) => x === 2)).toBe(true);
    expect(sp.i).toBe(2);
  });
  it('a plain spliterator source is drained by forEachRemaining otherwise', () => {
    const sp = new PlainSpliterator([1, 2, 3]);
    const spy = jest.spyOn(sp, 'forEachRemaining');
    expect(StreamSupport.stream(sp, false).map((x) => x * 2).toArray()).toEqual([2, 4, 6]);
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it('a foreign inner stream in flatMap is cut short through its spliterator', () => {
    const sp = new PlainSpliterator([1, 2, 3]);
    const foreign = { spliterator: () => sp, close: () => {} } as unknown as Stream<number>;
    expect(Stream.of(0).flatMap(() => foreign).findFirst().get()).toBe(1);
    expect(sp.i).toBe(1);
  });
});

describe('engine · resources', () => {
  it('flatMap closes inner streams in order, each right after its elements', () => {
    const log: string[] = [];
    Stream.of(1, 2)
      .flatMap((x) => Stream.of(x).onClose(() => log.push(`close${x}`)))
      .forEach((x) => log.push(`el${x}`));
    expect(log).toEqual(['el1', 'close1', 'el2', 'close2']);
  });
  it('nested flatMap closes inner before outer', () => {
    const log: string[] = [];
    Stream.of(1)
      .flatMap((x) =>
        Stream.of(x)
          .onClose(() => log.push('mid'))
          .flatMap((y) => Stream.of(y).onClose(() => log.push('inner')))
      )
      .toArray();
    expect(log).toEqual(['inner', 'mid']);
  });
  it('flatMap does not close the outer stream', () => {
    let outer = 0;
    Stream.of(1)
      .onClose(() => outer++)
      .flatMap((x) => Stream.of(x))
      .count();
    expect(outer).toBe(0);
  });
  it('a mapper exception leaves no inner stream to close', () => {
    const e = new Error('mapper');
    expect(() =>
      Stream.of(1)
        .flatMap(() => {
          throw e;
        })
        .toArray()
    ).toThrow(e);
  });
  it('closing a concat of concats closes all four in order', () => {
    const log: number[] = [];
    const s = (i: number) => Stream.of(i).onClose(() => log.push(i));
    Stream.concat(Stream.concat(s(1), s(2)), Stream.concat(s(3), s(4))).close();
    expect(log).toEqual([1, 2, 3, 4]);
  });
  it('concat keeps handlers registered on the concatenated stream too', () => {
    const log: string[] = [];
    const c = Stream.concat(Stream.of(1).onClose(() => log.push('a')), Stream.of(2)).onClose(() => log.push('c'));
    c.close();
    expect(log).toEqual(['a', 'c']);
  });
  it('close() of an IntStream pipeline', () => {
    let n = 0;
    const s = IntStream.range(0, 3)
      .onClose(() => n++)
      .map((x) => x);
    s.close();
    expect(n).toBe(1);
    expect(() => s.sum()).toThrow(IllegalStateException);
  });
  it('exceptions thrown by an operation propagate and leave the stream consumed', () => {
    const s = Stream.of(1, 2).map(() => {
      throw new RangeError('x');
    });
    expect(() => s.toArray()).toThrow(RangeError);
    expect(() => s.toArray()).toThrow(IllegalStateException);
  });
});

describe('engine · size propagation and count()', () => {
  const traversedCount = (build: (peek: (x: number) => void) => Stream<number>) => {
    let peeks = 0;
    const n = build(() => peeks++).count();
    return [n, peeks];
  };
  it.each<[string, (p: (x: number) => void) => Stream<number>, number, boolean]>([
    ['map', (p) => Stream.of(1, 2, 3).peek(p).map((x) => x), 3, false],
    ['sorted', (p) => Stream.of(3, 2, 1).peek(p).sorted(), 3, false],
    ['limit', (p) => Stream.of(1, 2, 3).peek(p).limit(2), 2, false],
    ['skip', (p) => Stream.of(1, 2, 3).peek(p).skip(1), 2, false],
    ['skip past end', (p) => Stream.of(1, 2, 3).peek(p).skip(9), 0, false],
    ['boxed', (p) => IntStream.range(0, 4).boxed().peek(p), 4, false],
    ['collection', (p) => arrayList([1, 2]).stream().peek(p), 2, false],
    ['filter', (p) => Stream.of(1, 2, 3).peek(p).filter((x) => x > 1), 2, true],
    ['distinct', (p) => Stream.of(1, 1, 3).peek(p).distinct(), 2, true],
    ['flatMap', (p) => Stream.of(1, 2).peek(p).flatMap((x) => Stream.of(x, x)), 4, true],
    ['takeWhile', (p) => Stream.of(1, 2, 3).peek(p).takeWhile((x) => x < 3), 2, true],
    ['iterate (unsized)', (p) => Stream.iterate(0, (x) => x + 1).limit(3).peek(p), 3, true],
    ['from(iterable) (unsized)', (p) => Stream.from(new Set([1, 2])).peek(p), 2, true],
  ])('count() after %s', (_, build, expected, traverses) => {
    const [n, peeks] = traversedCount(build);
    expect(n).toBe(expected);
    if (traverses) expect(peeks).toBeGreaterThan(0);
    else expect(peeks).toBe(0);
  });
  it('the size reaches toArray(generator) through limit/skip', () => {
    const sizes: number[] = [];
    IntStream.range(0, 100)
      .boxed()
      .skip(10)
      .limit(5)
      .toArray((n) => (sizes.push(n), new Array<number>(n)));
    expect(sizes).toEqual([5]);
  });
});

describe('engine · spliterator() / iterator() escape hatches', () => {
  it('iterator over distinct and sorted', () => {
    const it = Stream.of(3, 1, 3, 2).distinct().sorted().iterator();
    const out: number[] = [];
    while (it.hasNext()) out.push(it.next());
    expect(out).toEqual([1, 2, 3]);
  });
  it('iterator over a gatherer with a finisher', () => {
    const g = gatherer<number, number[], number>(
      () => [0],
      (s, x) => ((s[0] += x), true),
      (s, d) => {
        d.push(s[0]);
      }
    );
    expect([...Stream.of(1, 2, 3).gather(g)]).toEqual([6]);
  });
  it('iterator over flatMap emits each inner element separately', () => {
    const it = Stream.of(1, 2).flatMap((x) => Stream.of(x, x * 10)).iterator();
    expect([it.next(), it.next(), it.next(), it.next(), it.hasNext()]).toEqual([1, 10, 2, 20, false]);
  });
  it('tryAdvance then forEachRemaining continues where it stopped', () => {
    const sp = Stream.of(1, 2, 3, 4).map((x) => x * 2).spliterator();
    const out: number[] = [];
    sp.tryAdvance((x) => out.push(x));
    sp.forEachRemaining((x) => out.push(x));
    expect(out).toEqual([2, 4, 6, 8]);
  });
  it('spliterator() rejects a null action', () => {
    const sp = Stream.of(1).map((x) => x).spliterator();
    expect(() => sp.tryAdvance(null as unknown as () => void)).toThrow(NullPointerException);
    expect(() => sp.forEachRemaining(null as unknown as () => void)).toThrow(NullPointerException);
  });
  it('spliterator() of an empty pipeline', () => {
    const sp = Stream.empty<number>().filter(() => true).spliterator();
    expect(sp.tryAdvance(() => {})).toBe(false);
    expect(sp.tryAdvance(() => {})).toBe(false);
  });
  it('spliterator() does not traverse until advanced', () => {
    let peeks = 0;
    Stream.of(1, 2).peek(() => peeks++).spliterator();
    expect(peeks).toBe(0);
  });
  it('iterator() of a stream without stages', () => {
    const it = Stream.of('a').iterator();
    expect(it.next()).toBe('a');
    expect(it.hasNext()).toBe(false);
  });
  it('iterator().forEachRemaining without a pending element', () => {
    const out: number[] = [];
    Stream.of(1, 2).iterator().forEachRemaining((x) => out.push(x));
    expect(out).toEqual([1, 2]);
  });
});

describe('engine · source spliterators', () => {
  it('array spliterator: tryAdvance, forEachRemaining, split', () => {
    const sp = Stream.of(1, 2, 3, 4, 5).spliterator();
    const out: number[] = [];
    expect(sp.tryAdvance((x) => out.push(x))).toBe(true);
    const prefix = sp.trySplit()!;
    prefix.forEachRemaining((x) => out.push(x));
    sp.forEachRemaining((x) => out.push(x));
    expect(out).toEqual([1, 2, 3, 4, 5]);
    expect(sp.tryAdvance(() => {})).toBe(false);
    expect(sp.trySplit()).toBeNull();
    expect(() => sp.tryAdvance(null as unknown as () => void)).toThrow(NullPointerException);
  });
  it('iterate spliterators are ORDERED, IMMUTABLE and unsized', () => {
    for (const sp of [Stream.iterate(0, (x) => x + 1).spliterator(), Stream.iterate(0, () => true, (x) => x).spliterator()]) {
      expect(sp.estimateSize()).toBe(Infinity);
      expect(sp.getExactSizeIfKnown()).toBe(-1);
      expect(sp.hasCharacteristics(Spliterator.ORDERED | Spliterator.IMMUTABLE)).toBe(true);
    }
  });
  it('iterate spliterator tryAdvance', () => {
    const sp = Stream.iterate(1, (x) => x * 2).spliterator();
    const out: number[] = [];
    for (let i = 0; i < 4; i++) sp.tryAdvance((x) => out.push(x));
    expect(out).toEqual([1, 2, 4, 8]);
  });
  it('3-arg iterate spliterator ends and stays ended', () => {
    const sp = Stream.iterate(0, (x) => x < 2, (x) => x + 1).spliterator();
    const out: number[] = [];
    while (sp.tryAdvance((x) => out.push(x)));
    expect(out).toEqual([0, 1]);
    expect(sp.tryAdvance(() => {})).toBe(false);
  });
  it('generate spliterator is unordered', () => {
    const sp = Stream.generate(() => 1).spliterator();
    expect(sp.hasCharacteristics(Spliterator.ORDERED)).toBe(false);
    let v = 0;
    sp.tryAdvance((x) => (v = x));
    expect(v).toBe(1);
  });
  it('concat spliterator: tryAdvance across the boundary, forEachRemaining, estimate', () => {
    const sp = Stream.concat(Stream.of(1), Stream.of(2, 3)).spliterator();
    expect(sp.estimateSize()).toBe(3);
    const out: number[] = [];
    sp.tryAdvance((x) => out.push(x));
    sp.tryAdvance((x) => out.push(x));
    expect(sp.estimateSize()).toBe(1);
    sp.forEachRemaining((x) => out.push(x));
    expect(out).toEqual([1, 2, 3]);
    expect(sp.tryAdvance(() => {})).toBe(false);
  });
  it('concat with an unsized side is unsized', () => {
    const sp = Stream.concat(Stream.of(1), Stream.iterate(0, (x) => x)).spliterator();
    expect(sp.hasCharacteristics(Spliterator.SIZED)).toBe(false);
    expect(sp.estimateSize()).toBe(Infinity);
  });
  it('concat forEachRemaining before any advance', () => {
    const out: number[] = [];
    Stream.concat(Stream.of(1), Stream.of(2)).spliterator().forEachRemaining((x) => out.push(x));
    expect(out).toEqual([1, 2]);
  });
  it('iterable spliterator: tryAdvance and size', () => {
    const sp = Stream.from(new Set([5, 6])).spliterator();
    expect(sp.getExactSizeIfKnown()).toBe(-1);
    expect(sp.hasCharacteristics(Spliterator.ORDERED)).toBe(true);
    const out: number[] = [];
    while (sp.tryAdvance((x) => out.push(x)));
    expect(out).toEqual([5, 6]);
  });
  it('range forEachRemaining', () => {
    const out: number[] = [];
    IntStream.range(3, 6).spliterator().forEachRemaining((x) => out.push(x));
    expect(out).toEqual([3, 4, 5]);
  });
});

describe('engine · StreamSupport and the hook', () => {
  it('stream(spliterator, parallel)', () => {
    const s = StreamSupport.stream(new PlainSpliterator([1, 2]), true);
    expect(s.isParallel()).toBe(true);
    expect(s.toArray()).toEqual([1, 2]);
  });
  it('stream(supplier, characteristics, parallel) calls the supplier at the terminal operation', () => {
    let calls = 0;
    const s = StreamSupport.stream(() => (calls++, new PlainSpliterator([1, 2, 3])), Spliterator.SIZED, false);
    const m = s.map((x) => x + 1);
    expect(calls).toBe(0);
    expect(m.toArray()).toEqual([2, 3, 4]);
    expect(calls).toBe(1);
    expect(s.isParallel()).toBe(false);
  });
  it('the supplier form honours the parallel flag', () =>
    expect(StreamSupport.stream(() => new PlainSpliterator([1]), 0, true).isParallel()).toBe(true));
  it('a supplier returning null fails with NullPointerException', () =>
    expect(() => StreamSupport.stream(() => null as unknown as Spliterator<number>, 0, false).count()).toThrow(NullPointerException));
  it('null spliterator / supplier is rejected', () =>
    expect(() => StreamSupport.stream(null as unknown as Spliterator<number>, false)).toThrow(NullPointerException));
  it('intStream / longStream / doubleStream', () => {
    expect(StreamSupport.intStream(new PlainSpliterator([1, 2]), false).sum()).toBe(3);
    expect(StreamSupport.longStream(() => new PlainSpliterator([2 ** 40]), 0, false).max().getAsLong()).toBe(2 ** 40);
    expect(StreamSupport.doubleStream(new PlainSpliterator([0.5]), true).isParallel()).toBe(true);
    expect(StreamSupport.longStream(new PlainSpliterator([1]), false).count()).toBe(1);
    expect(StreamSupport.intStream(() => new PlainSpliterator([1]), 0, true).isParallel()).toBe(true);
    expect(StreamSupport.doubleStream(() => new PlainSpliterator([0.25]), 0, false).sum()).toBe(0.25);
  });
  it('the hook is registered with the engine factories', () => {
    const f = streamFactories();
    expect(f.stream(new PlainSpliterator(['a']), false).toArray()).toEqual(['a']);
    expect(f.intStream(new PlainSpliterator([1]), false).sum()).toBe(1);
  });
  it('Collection.stream() and parallelStream() go through the engine', () => {
    const l = arrayList([1, 2, 3]);
    expect(l.stream().filter((x) => x > 1).count()).toBe(2);
    expect(l.parallelStream().isParallel()).toBe(true);
  });
});

// ---------------------------------------------------------------- compliance (reference values checked on the reference runtime)

const chars = (sp: Spliterator<unknown>) => sp.characteristics();
const C = Spliterator;

describe('engine · pipeline spliterator characteristics', () => {
  it('map keeps SIZED | SUBSIZED | ORDERED with the exact size', () => {
    const sp = Stream.of(1, 2).map((x) => x).spliterator();
    expect(chars(sp)).toBe(0x4050);
    expect(sp.getExactSizeIfKnown()).toBe(2);
    expect(sp.estimateSize()).toBe(2);
  });
  it('peek keeps the size', () => expect(chars(Stream.of(1, 2).peek(() => {}).spliterator())).toBe(0x4050));
  it('sorted() adds SORTED with a null comparator', () => {
    const sp = Stream.of(2, 1).sorted().spliterator();
    expect(chars(sp)).toBe(0x4054);
    expect(sp.getComparator()).toBeNull();
  });
  it('sorted(comparator) is not SORTED', () => {
    const sp = Stream.of(1, 2).sorted(Comparator.reverseOrder()).spliterator();
    expect(chars(sp)).toBe(0x4050);
    expect(() => sp.getComparator()).toThrow(IllegalStateException);
  });
  it('distinct adds DISTINCT and drops SIZED', () => {
    const sp = Stream.of(1, 2).distinct().spliterator();
    expect(chars(sp)).toBe(0x11);
    expect(sp.getExactSizeIfKnown()).toBe(-1);
    expect(sp.estimateSize()).toBe(2);
  });
  it('map drops DISTINCT and SORTED, filter keeps them', () => {
    expect(chars(Stream.of(1, 2).distinct().map((x) => x).spliterator())).toBe(0x10);
    expect(chars(Stream.of(1, 2).distinct().filter(() => true).spliterator())).toBe(0x11);
    expect(chars(Stream.of(1, 2).sorted().filter(() => true).spliterator())).toBe(0x14);
  });
  it('filter / flatMap / mapMulti / takeWhile / dropWhile / gather drop SIZED', () => {
    const t = new TreeSet<number>();
    t.add(1);
    t.add(2);
    expect(chars(Stream.of(1, 2).filter(() => true).spliterator())).toBe(0x10);
    expect(chars(t.stream().flatMap((x) => Stream.of(x)).spliterator())).toBe(0x10);
    expect(chars(t.stream().mapMulti(() => {}).spliterator())).toBe(0x10);
    expect(chars(t.stream().takeWhile(() => true).spliterator())).toBe(0x15);
    expect(chars(t.stream().dropWhile(() => true).spliterator())).toBe(0x15);
    expect(chars(t.stream().gather({ integrator: () => (_s: unknown, e: number, d: Downstream<number>) => d.push(e) }).spliterator())).toBe(0x10);
  });
  it('limit / skip on a SIZED source stay SIZED with the adjusted size', () => {
    const cases: [Spliterator<number>, number][] = [
      [Stream.of(1, 2, 3).limit(2).spliterator(), 2],
      [Stream.of(1, 2, 3).limit(5).spliterator(), 3],
      [Stream.of(1, 2, 3).skip(1).spliterator(), 2],
      [Stream.of(1, 2, 3).skip(5).spliterator(), 0],
      [Stream.of(1, 2, 3).skip(1).limit(1).spliterator(), 1],
    ];
    for (const [sp, n] of cases) {
      expect(chars(sp)).toBe(0x4050);
      expect(sp.getExactSizeIfKnown()).toBe(n);
      expect(sp.estimateSize()).toBe(n);
    }
    expect(chars(Stream.of(1, 2, 3).filter(() => true).limit(2).spliterator())).toBe(0x10);
    expect(Stream.of(1, 2, 3).filter(() => true).limit(2).spliterator().estimateSize()).toBe(3);
    expect(chars(Stream.iterate(1, (x) => x).limit(2).spliterator())).toBe(0x10);
  });
  it('SUBSIZED follows the source: a HashSet stream is SIZED only', () => {
    const h = new HashSet<number>();
    h.add(1);
    const sp = h.stream().map((x) => x).spliterator();
    expect(chars(sp)).toBe(0x40);
    expect(sp.getExactSizeIfKnown()).toBe(1);
  });
  it('a comparator-sorted source is not reported SORTED', () => {
    const t = new TreeSet<number>(Comparator.reverseOrder());
    t.add(1);
    expect(chars(t.stream().filter(() => true).spliterator())).toBe(0x11);
  });
  it('number streams: boxed / asXStream / mapToObj / map / distinct / sorted', () => {
    expect(chars(IntStream.range(0, 3).boxed().spliterator())).toBe(0x4055);
    expect(IntStream.range(0, 3).boxed().spliterator().getExactSizeIfKnown()).toBe(3);
    expect(chars(IntStream.range(0, 3).asLongStream().spliterator())).toBe(0x4055);
    expect(chars(IntStream.range(0, 3).asDoubleStream().spliterator())).toBe(0x4055);
    expect(chars(LongStream.range(0, 3).asDoubleStream().spliterator())).toBe(0x4054);
    expect(chars(IntStream.range(0, 3).mapToObj((x) => x).spliterator())).toBe(0x4050);
    expect(chars(IntStream.range(0, 3).map((x) => x).spliterator())).toBe(0x4050);
    expect(chars(IntStream.range(0, 3).distinct().spliterator())).toBe(0x10);
    expect(chars(IntStream.of(2, 1).sorted().spliterator())).toBe(0x4054);
    expect(chars(IntStream.range(0, 5).limit(2).spliterator())).toBe(0x4055);
    expect(chars(DoubleStream.of(1, 2).boxed().spliterator())).toBe(0x4050);
    expect(chars(IntStream.range(0, 3).flatMap((x) => IntStream.of(x)).spliterator())).toBe(0x10);
  });
  it('a stage-less stream hands out the source spliterator', () => expect(chars(Stream.of(1, 2).spliterator())).toBe(0x4450));
  it('skip after an advance estimates from the source like the reference', () => {
    const sp = Stream.of(1, 2, 3, 4).skip(1).spliterator();
    sp.tryAdvance(() => {});
    expect(sp.estimateSize()).toBe(1);
  });
});

describe('engine · unordered()', () => {
  it('clears ORDERED', () => {
    expect(chars(Stream.of(1, 2).unordered().spliterator())).toBe(0x4040);
    expect(chars(IntStream.range(0, 3).unordered().spliterator())).toBe(0x4041);
  });
  it('returns this for an already unordered stream', () => {
    const h = new HashSet<number>();
    h.add(1);
    const s = h.stream();
    expect(s.unordered()).toBe(s);
    const g = Stream.generate(() => 1);
    expect(g.unordered()).toBe(g);
    const u = Stream.of(1).unordered();
    expect(u.unordered()).toBe(u);
  });
  it('an ordered stream gets a new stage', () => {
    const s = Stream.of(1);
    expect(s.unordered()).not.toBe(s);
  });
});

describe('engine · StreamSupport supplier form', () => {
  const supplied = () => {
    const calls = { n: 0 };
    const sup = () => (calls.n++, new PlainSpliterator([1, 2, 3], C.ORDERED | C.SIZED | C.SUBSIZED));
    return { calls, sup };
  };
  it('characteristics become the head flags', () => {
    const { sup } = supplied();
    expect(chars(StreamSupport.stream(sup, C.SIZED | C.ORDERED | C.DISTINCT, false).map((x) => x).spliterator())).toBe(0x4050);
    expect(chars(StreamSupport.stream(sup, C.DISTINCT, false).filter(() => true).spliterator())).toBe(0x1);
    const sp = StreamSupport.stream(sup, 0, false).map((x) => x).spliterator();
    expect(chars(sp)).toBe(0);
    expect(sp.getExactSizeIfKnown()).toBe(-1);
  });
  it('count() skips traversal only when the characteristics say SIZED', () => {
    const { sup } = supplied();
    const seen: number[] = [];
    expect(StreamSupport.stream(sup, C.SIZED, false).peek((x) => seen.push(x)).count()).toBe(3);
    expect(seen).toEqual([]);
    expect(StreamSupport.stream(sup, 0, false).peek((x) => seen.push(x)).count()).toBe(3);
    expect(seen).toEqual([1, 2, 3]);
  });
  it('spliterator() / iterator() call the supplier only on first use, once', () => {
    const { calls, sup } = supplied();
    const sp = StreamSupport.stream(sup, C.SIZED, false).spliterator();
    expect(calls.n).toBe(0);
    expect(sp.estimateSize()).toBe(3);
    expect(calls.n).toBe(1);
    const out: number[] = [];
    sp.forEachRemaining((x) => out.push(x));
    expect(out).toEqual([1, 2, 3]);
    expect(calls.n).toBe(1);
    const it = StreamSupport.stream(sup, 0, false).map((x) => x * 2).iterator();
    expect(calls.n).toBe(1);
    expect(it.next()).toBe(2);
    expect(calls.n).toBe(2);
  });
  it('the delegating spliterator forwards every method', () => {
    const { sup } = supplied();
    const sp = StreamSupport.stream(sup, 0, false).spliterator();
    expect(sp.hasCharacteristics(C.ORDERED)).toBe(true);
    expect(sp.getExactSizeIfKnown()).toBe(3);
    expect(sp.trySplit()).toBeNull();
    expect(() => sp.getComparator()).toThrow(IllegalStateException);
    let v = 0;
    expect(sp.tryAdvance((x) => (v = x))).toBe(true);
    expect(v).toBe(1);
    expect(chars(sp)).toBe(C.ORDERED | C.SIZED | C.SUBSIZED);
  });
  it('a supplier-headed stream with stages drains a late-bound source in push mode', () => {
    const { sup } = supplied();
    const out: number[] = [];
    StreamSupport.stream(sup, 0, false).filter((x) => x > 1).spliterator().forEachRemaining((x) => out.push(x));
    expect(out).toEqual([2, 3]);
    expect(Stream.of(0).flatMap(() => StreamSupport.stream(sup, 0, false)).toArray()).toEqual([1, 2, 3]);
  });
});

describe('engine · toArray(generator) sizes', () => {
  it('a known size calls the generator first and needs the exact length', () => {
    const log: string[] = [];
    const s = Stream.of(1, 2).peek((x) => log.push('p' + x));
    expect(() => s.toArray((n) => (log.push('gen' + n), new Array<number>(n + 1)))).toThrow(IllegalStateException);
    expect(log).toEqual(['gen2']);
    expect(() => Stream.of(1, 2).toArray(() => new Array<number>(1))).toThrow(IllegalStateException);
    expect(() => Stream.of(2, 1).sorted().toArray(() => new Array<number>(3))).toThrow(IllegalStateException);
    expect(() => Stream.of(1, 2, 3).limit(2).toArray(() => new Array<number>(3))).toThrow(IllegalStateException);
    const ok: string[] = [];
    expect(Stream.of(1, 2).peek((x) => ok.push('p' + x)).toArray((n) => (ok.push('gen' + n), new Array<number>(n)))).toEqual([1, 2]);
    expect(ok).toEqual(['gen2', 'p1', 'p2']);
  });
  it('unknown size: longer arrays are null-padded, shorter ones throw', () => {
    expect(Stream.of<number | null>(1, 2).filter(() => true).toArray((n) => new Array<number | null>(n + 2))).toEqual([1, 2, null, null]);
    expect(() => Stream.of(1, 2).filter(() => true).toArray(() => new Array<number>(1))).toThrow(IndexOutOfBoundsException);
    expect(() => Stream.of(1, 2).filter(() => true).toArray(() => null as unknown as number[])).toThrow(NullPointerException);
    expect(() => Stream.of(1, 2).toArray(() => null as unknown as number[])).toThrow(NullPointerException);
  });
});

describe('engine · collect(collector) call order', () => {
  function logging(log: string[]): Collector<number, number[], number[]> {
    return {
      supplier: () => (log.push('supplier'), () => (log.push('supplier.get'), [])),
      accumulator: () => (log.push('accumulator'), (l: number[], x: number) => (log.push('acc'), l.push(x))),
      combiner: () => (log.push('combiner'), (a: number[]) => a),
      finisher: () => (log.push('finisher'), (a: number[]) => a),
      characteristics: () => (log.push('characteristics'), { contains: () => false }),
    } as unknown as Collector<number, number[], number[]>;
  }
  it('fresh stream', () => {
    const log: string[] = [];
    expect(Stream.of(1).collect(logging(log))).toEqual([1]);
    expect(log).toEqual(['supplier', 'accumulator', 'combiner', 'characteristics', 'supplier.get', 'acc', 'characteristics', 'finisher']);
  });
  it('consumed stream: the functions are fetched before IllegalStateException', () => {
    const log: string[] = [];
    const s = Stream.of(1);
    s.count();
    expect(() => s.collect(logging(log))).toThrow(IllegalStateException);
    expect(log).toEqual(['supplier', 'accumulator', 'combiner']);
  });
});

describe('engine · argument checks', () => {
  it('sorted(null) / sorted(undefined) throw NullPointerException; sorted() is natural', () => {
    expect(() => Stream.of(2, 1).sorted(null as unknown as Comparator<number>)).toThrow(NullPointerException);
    expect(() => Stream.of(2, 1).sorted(undefined as unknown as Comparator<number>)).toThrow(NullPointerException);
    expect(Stream.of(2, 1).sorted().toArray()).toEqual([1, 2]);
  });
  it('sorted(null) on a used stream throws IllegalStateException first, and links the stream', () => {
    const s = Stream.of(1);
    s.count();
    expect(() => s.sorted(null as unknown as Comparator<number>)).toThrow(IllegalStateException);
    const t = Stream.of(1);
    expect(() => t.sorted(null as unknown as Comparator<number>)).toThrow(NullPointerException);
    expect(() => t.count()).toThrow(IllegalStateException);
  });
  it('limit / skip reject non-integers and negatives', () => {
    for (const bad of [1.5, NaN, Infinity, -1]) {
      expect(() => Stream.of(1).limit(bad)).toThrow(IllegalArgumentException);
      expect(() => Stream.of(1).skip(bad)).toThrow(IllegalArgumentException);
      expect(() => IntStream.of(1).limit(bad)).toThrow(IllegalArgumentException);
    }
    expect(Stream.of(1, 2).limit(2 ** 53).toArray()).toEqual([1, 2]);
  });
  it('number streams have no collect(Collector)', () => {
    expect(() => (IntStream.of(1) as any).collect({})).toThrow(IllegalArgumentException);
    expect(() => (LongStream.of(1) as any).collect({})).toThrow(IllegalArgumentException);
    expect(() => (DoubleStream.of(1) as any).collect({}, () => {})).toThrow(NullPointerException);
    expect(IntStream.of(1, 2).collect(() => [] as number[], (a, x) => a.push(x), (a, b) => a.push(...b))).toEqual([1, 2]);
  });
});

// Symbol.dispose is missing on older runtimes (and in jest's sandbox there); the method is then not installed
(typeof Symbol.dispose === 'symbol' ? describe : describe.skip)('engine · Symbol.dispose', () => {
  it('runs close()', () => {
    let closed = 0;
    const s = Stream.of(1).onClose(() => closed++);
    s[Symbol.dispose]();
    expect(closed).toBe(1);
    expect(() => s.count()).toThrow(IllegalStateException);
  });
  it('is shared by every stream kind', () => {
    let closed = 0;
    IntStream.of(1).onClose(() => closed++)[Symbol.dispose]();
    DoubleStream.of(1).map((x) => x).onClose(() => closed++)[Symbol.dispose]();
    expect(closed).toBe(2);
  });
});

describe('engine · pull-mode flatMap', () => {
  it('an infinite mapped stream yields through iterator()', () => {
    const it = Stream.of(1, 100).flatMap((x) => Stream.iterate(x, (i) => i + 1)).iterator();
    expect([it.next(), it.next(), it.next()]).toEqual([1, 2, 3]);
  });
  it('resumes the mapped stream, then moves on and closes each', () => {
    const closed: number[] = [];
    const sp = Stream.of(1, 100)
      .flatMap((x) => Stream.iterate(x, (i) => i + 1).limit(2).onClose(() => closed.push(x)))
      .spliterator();
    const out: number[] = [];
    expect(sp.tryAdvance((x) => out.push(x))).toBe(true);
    expect(closed).toEqual([]);
    while (sp.tryAdvance((x) => out.push(x)));
    expect(out).toEqual([1, 2, 100, 101]);
    expect(closed).toEqual([1, 100]);
  });
  it('nested flatMaps over infinite streams', () => {
    const it = Stream.of(1)
      .flatMap((x) => Stream.iterate(x, (i) => i + 1))
      .flatMap((y) => Stream.generate(() => y * 10))
      .iterator();
    expect([it.next(), it.next()]).toEqual([10, 10]);
  });
  it('a downstream limit closes the pending mapped stream', () => {
    let closed = 0;
    const it = Stream.of(1)
      .flatMap((x) => Stream.iterate(x, (i) => i + 1).onClose(() => closed++))
      .limit(2)
      .iterator();
    const out: number[] = [];
    while (it.hasNext()) out.push(it.next());
    expect(out).toEqual([1, 2]);
    expect(closed).toBe(1);
  });
  it('null mapped streams, filters downstream and non-pipeline inner streams', () => {
    const custom = { spliterator: () => new PlainSpliterator([7, 8]), close: () => {} } as unknown as Stream<number>;
    const sp = Stream.of(0, 1, 2)
      .flatMap((x) => (x === 0 ? null : x === 1 ? custom : Stream.of(5, 6)))
      .filter((x) => x !== 8)
      .spliterator();
    const out: number[] = [];
    while (sp.tryAdvance((x) => out.push(x)));
    expect(out).toEqual([7, 5, 6]);
  });
  it('a failing mapped stream is closed and the failure suppresses close errors', () => {
    const boom = new Error('boom');
    const inner = Stream.generate<number>(() => {
      throw boom;
    }).onClose(() => {
      throw new Error('close');
    });
    const it = Stream.of(1).flatMap(() => inner).iterator();
    let caught: unknown;
    try {
      it.next();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBe(boom);
    expect((boom as { suppressed?: unknown[] }).suppressed?.length).toBe(1);
  });
});

describe('engine · empty / iterate characteristics', () => {
  it('empty() and empty ranges are SIZED | SUBSIZED only', () => {
    for (const sp of [
      Stream.empty().spliterator(),
      Stream.ofNullable(null).spliterator(),
      IntStream.empty().spliterator(),
      LongStream.empty().spliterator(),
      DoubleStream.empty().spliterator(),
      IntStream.range(0, 0).spliterator(),
      IntStream.rangeClosed(1, 0).spliterator(),
      LongStream.range(5, 1).spliterator(),
    ])
      expect(chars(sp)).toBe(0x4040);
  });
  it('of() and builders keep the array flags', () => {
    expect(chars(Stream.of().spliterator())).toBe(0x4450);
    expect(chars(Stream.builder().build().spliterator())).toBe(0x4450);
    expect(chars(IntStream.of().spliterator())).toBe(0x4450);
  });
  it('number iterate is NONNULL, Stream.iterate is not', () => {
    expect(chars(IntStream.iterate(1, (x) => x).spliterator())).toBe(0x510);
    expect(chars(LongStream.iterate(1, () => true, (x) => x).spliterator())).toBe(0x510);
    expect(chars(DoubleStream.iterate(1, (x) => x).spliterator())).toBe(0x510);
    expect(chars(Stream.iterate(1, (x) => x).spliterator())).toBe(0x410);
    expect(chars(Stream.iterate(1, () => true, (x) => x).spliterator())).toBe(0x410);
  });
});

describe('engine · primitive iterators', () => {
  it('nextInt / nextLong / nextDouble', () => {
    const i = IntStream.of(1, 2).iterator();
    expect(i.nextInt()).toBe(1);
    expect(i.next()).toBe(2);
    expect(i.hasNext()).toBe(false);
    expect(LongStream.of(3).map((x) => x).iterator().nextLong()).toBe(3);
    expect(DoubleStream.of(0.5).iterator().nextDouble()).toBe(0.5);
  });
});

describe('engine · gatherer defaults', () => {
  it('only an integrator', () =>
    expect(Stream.of(1, 2).gather({ integrator: () => (_s: unknown, e: number, d: Downstream<number>) => d.push(e * 10) }).toList().toArray()).toEqual([10, 20]));
  it('initializer without finisher', () => {
    const g: Gatherer<number, { n: number }, number> = {
      initializer: () => () => ({ n: 0 }),
      integrator: () => (s, e, d) => d.push((s.n += e)),
    };
    expect(Stream.of(1, 2, 3).gather(g).toArray()).toEqual([1, 3, 6]);
  });
});

describe('engine · pull-mode flatMap after multi-element stages', () => {
  const pulled = <T>(s: Stream<T>) => {
    const out: T[] = [];
    const it = s.iterator();
    while (it.hasNext()) out.push(it.next());
    return out;
  };
  it('after mapMulti', () =>
    expect(
      pulled(
        Stream.of(9)
          .mapMulti<number>((x, c) => {
            c(x);
            c(x);
          })
          .flatMap((x) => Stream.of(x, x))
      )
    ).toEqual([9, 9, 9, 9]));
  it('after sorted (the end flush)', () => expect(pulled(Stream.of(2, 1).sorted().flatMap((x) => Stream.of(x, x)))).toEqual([1, 1, 2, 2]));
  it('after a gatherer finisher', () => {
    const g: Gatherer<number, number[], number> = {
      initializer: () => () => [],
      integrator: () => (s, e) => (s.push(e), true),
      finisher: () => (s, d) => s.forEach((x) => d.push(x)),
    };
    expect(pulled(Stream.of(1, 2).gather(g).flatMap((x) => Stream.of(x, -x)))).toEqual([1, -1, 2, -2]);
  });
  it('a sorted after a flatMap sees every element before sorting', () =>
    expect(pulled(Stream.of(1, 2).flatMap((x) => Stream.of(x * 10, x)).sorted())).toEqual([1, 2, 10, 20]));

  // random chains of multi-emitting stages: pulling must give what pushing gives
  const stages: ((s: Stream<number>, r: (n: number) => number) => Stream<number>)[] = [
    (s, r) => {
      const k = r(3);
      return s.flatMap((x) => (k === 0 ? null : Stream.of(...Array.from({ length: k }, (_, i) => x + i))));
    },
    (s, r) => {
      const k = r(3);
      return s.mapMulti<number>((x, c) => {
        for (let i = 0; i < k; i++) c(x * 2 + i);
      });
    },
    (s) => s.sorted(),
    (s) => s.sorted((a, b) => b - a),
    (s) => s.filter((x) => x % 3 !== 0),
    (s, r) => s.limit(r(12)),
    (s) =>
      s.gather<number>({
        initializer: () => () => [] as number[],
        integrator: () => (st: number[], e: number) => (st.push(e), true),
        finisher: () => (st: number[], d: Downstream<number>) => {
          for (const x of st) if (!d.push(x)) return;
        },
      }),
    (s) => s.flatMap((x) => IntStream.range(0, x % 3).boxed()),
  ];
  it('random chains: pull equals push', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const build = () => {
        const r = rng(seed);
        let s = Stream.of(...Array.from({ length: r(6) }, () => r(20)));
        const n = 1 + r(4);
        for (let i = 0; i < n; i++) s = stages[r(stages.length)](s, r);
        return s;
      };
      const push = build().toArray();
      expect(pulled(build())).toEqual(push);
      const sp = build().spliterator();
      const viaTry: number[] = [];
      while (sp.tryAdvance((x) => viaTry.push(x)));
      expect(viaTry).toEqual(push);
    }
  });
});

describe('engine · cancellation through sorted()', () => {
  it('a short circuit after sorted, inside flatMap, in push and pull mode', () => {
    const inner = () => Stream.of(1, 2).flatMap((x) => Stream.of(x * 30, x * 10, x * 20).sorted());
    expect(inner().limit(4).toList().toArray()).toEqual([10, 20, 30, 20]);
    expect(inner().takeWhile((x) => x < 30).toList().toArray()).toEqual([10, 20]);
    const it = inner().iterator();
    expect([it.next(), it.next(), it.next(), it.next()]).toEqual([10, 20, 30, 20]);
    expect(Stream.of(5, 3, 4).sorted().flatMap((x) => Stream.of(x, -x)).findFirst().get()).toBe(3);
    expect(IntStream.of(3, 1, 2).sorted().limit(2).boxed().toList().toArray()).toEqual([1, 2]);
  });
});

describe('engine · flatMap after downstream cancellation', () => {
  // mapMulti hands flatMap several elements per upstream element, without checking cancellation in between
  const three = <T>(x: T, emit: (t: number) => void) => [1, 2, 3].forEach(emit);
  it('push mode: an inner stream begun after the downstream stopped is not read', () => {
    const read: number[] = [];
    const r = Stream.of(0).mapMulti<number>(three).flatMap((x) => Stream.of(x).peek((v) => read.push(v))).findFirst();
    expect([r.get(), read]).toEqual([1, [1]]);
  });
  it('pull mode: queued elements are not mapped once the downstream stopped', () => {
    const mapped: number[] = [];
    const it = Stream.of(0).mapMulti<number>(three).flatMap((x) => (mapped.push(x), Stream.of(x, x))).limit(2).iterator();
    const out: number[] = [];
    while (it.hasNext()) out.push(it.next());
    expect([out, mapped]).toEqual([[1, 1], [1]]);
  });
});
