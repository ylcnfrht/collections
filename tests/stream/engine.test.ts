// Engine-level behaviour: a lazy reference model compared against random pipelines, infinite-stream
// short-circuiting, resource closing, size propagation, the spliterator escape hatch and StreamSupport.
import { IllegalStateException, NullPointerException } from '../../src/exceptions';
import { ArrayList } from '../../src/list/ArrayList';
import type { Downstream, Gatherer, Integrator } from '../../src/stream/Gatherer';
import { streamFactories } from '../../src/stream/hook';
import { BaseSpliterator, Spliterator } from '../../src/stream/Spliterator';
import { StreamSupport } from '../../src/stream/StreamSupport';
import { IntStream, Stream } from '../../src/stream/Streams';
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
