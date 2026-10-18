import {
  ClassCastException,
  IllegalArgumentException,
  IllegalStateException,
  IndexOutOfBoundsException,
  NoSuchElementException,
  NullPointerException,
  UnsupportedOperationException,
} from '../../src/exceptions';
import { List } from '../../src/immutable/ImmutableCollections';
import type { Set as SetType } from '../../src/interfaces/Set';
import { ArrayList } from '../../src/list/ArrayList';
import { HashSet } from '../../src/set/HashSet';
import { LinkedHashSet } from '../../src/set/LinkedHashSet';
import type { Collector, CollectorCharacteristics } from '../../src/stream/Collector';
import type { Downstream, Gatherer, Integrator } from '../../src/stream/Gatherer';
import { Optional } from '../../src/stream/Optional';
import { Spliterator } from '../../src/stream/Spliterator';
import { DoubleStream, IntStream, LongStream, Stream } from '../../src/stream/Streams';
import { Comparator } from '../../src/util/Comparator';
import { Point } from '../helpers';

const LINKED = 'stream has already been operated upon or closed';

function arrayList<T>(...xs: T[]): ArrayList<T> {
  const l = new ArrayList<T>();
  for (const x of xs) l.add(x);
  return l;
}

function chars(...cs: CollectorCharacteristics[]): SetType<CollectorCharacteristics> {
  const s = new HashSet<CollectorCharacteristics>();
  for (const c of cs) s.add(c);
  return s;
}

function collector<T, A, R>(
  supplier: () => A,
  acc: (a: A, t: T) => void,
  finisher: (a: A) => R,
  ...cs: CollectorCharacteristics[]
): Collector<T, A, R> {
  return {
    supplier: () => supplier,
    accumulator: () => acc,
    combiner: () => (a) => a,
    finisher: () => finisher,
    characteristics: () => chars(...cs),
  };
}

function gatherer<T, A, R>(
  init: () => A,
  integ: (s: A, t: T, d: Downstream<R>) => boolean,
  fin: (s: A, d: Downstream<R>) => void = () => {},
  greedy = false
): Gatherer<T, A, R> {
  const i = ((s: A, t: T, d: Downstream<R>) => integ(s, t, d)) as Integrator<A, T, R>;
  if (greedy) (i as { greedy?: boolean }).greedy = true;
  return {
    initializer: () => init,
    integrator: () => i,
    combiner: () => (a) => a,
    finisher: () => fin,
    andThen: () => {
      throw new Error('unused');
    },
  };
}

describe('Stream · factories', () => {
  it('of() with no arguments is empty', () => expect(Stream.of().toArray()).toEqual([]));
  it('of(x) holds one element', () => expect(Stream.of('a').toArray()).toEqual(['a']));
  it('of(...) keeps argument order', () => expect(Stream.of(3, 1, 2).toArray()).toEqual([3, 1, 2]));
  it('of(null) is a one-element stream holding null', () => expect(Stream.of(null).toArray()).toEqual([null]));
  it('ofNullable(null) and ofNullable(undefined) are empty', () => {
    expect(Stream.ofNullable(null).count()).toBe(0);
    expect(Stream.ofNullable(undefined).count()).toBe(0);
  });
  it('ofNullable(x) holds x', () => expect(Stream.ofNullable(0).toArray()).toEqual([0]));
  it('empty() is empty', () => expect(Stream.empty().findFirst().isPresent()).toBe(false));
  it('empty() returns a fresh stream each time', () => {
    const a = Stream.empty();
    a.count();
    expect(Stream.empty().count()).toBe(0);
  });

  it('iterate(seed, f) is infinite and lazy', () => {
    let calls = 0;
    const s = Stream.iterate(1, (x) => {
      calls++;
      return x * 2;
    });
    expect(calls).toBe(0);
    expect(s.limit(5).toArray()).toEqual([1, 2, 4, 8, 16]);
    expect(calls).toBe(4);
  });
  it('iterate(seed, hasNext, next) stops when hasNext fails', () =>
    expect(Stream.iterate(1, (x) => x < 20, (x) => x * 3).toArray()).toEqual([1, 3, 9]));
  it('iterate 3-arg is empty when the seed fails hasNext', () =>
    expect(Stream.iterate(5, (x) => x < 0, (x) => x + 1).count()).toBe(0));
  it('iterate 3-arg does not call next after hasNext failed', () => {
    let calls = 0;
    const r = Stream.iterate(
      0,
      (x) => x < 2,
      (x) => {
        calls++;
        return x + 1;
      }
    ).toArray();
    expect(r).toEqual([0, 1]);
    expect(calls).toBe(2);
  });
  it('iterate 3-arg works with short-circuit terminals', () =>
    expect(Stream.iterate(1, (x) => x < 100, (x) => x + 1).anyMatch((x) => x === 50)).toBe(true));
  it('iterate rejects a null function', () => {
    expect(() => Stream.iterate(1, null as unknown as (x: number) => number)).toThrow(NullPointerException);
    expect(() => Stream.iterate(1, (x) => x > 0, null as unknown as (x: number) => number)).toThrow(NullPointerException);
  });
  it('generate(s) is infinite; limit makes it finite', () => {
    let n = 0;
    expect(Stream.generate(() => n++).limit(3).toArray()).toEqual([0, 1, 2]);
  });
  it('generate rejects null', () => expect(() => Stream.generate(null as unknown as () => number)).toThrow(NullPointerException));

  it('concat keeps order: all of a, then b', () =>
    expect(Stream.concat(Stream.of(1, 2), Stream.of(3)).toArray()).toEqual([1, 2, 3]));
  it('concat is lazy', () => {
    const seen: number[] = [];
    const s = Stream.concat(Stream.of(1).peek((x) => seen.push(x)), Stream.of(2).peek((x) => seen.push(x)));
    expect(seen).toEqual([]);
    expect(s.findFirst().get()).toBe(1);
    expect(seen).toEqual([1]);
  });
  it('concat consumes both inputs', () => {
    const a = Stream.of(1);
    const b = Stream.of(2);
    Stream.concat(a, b);
    expect(() => a.count()).toThrow(IllegalStateException);
    expect(() => b.count()).toThrow(IllegalStateException);
  });
  it('concat of an already consumed stream throws', () => {
    const a = Stream.of(1);
    a.count();
    expect(() => Stream.concat(a, Stream.of(2))).toThrow(IllegalStateException);
  });
  it('concat close() closes both inputs, a first', () => {
    const log: string[] = [];
    const s = Stream.concat(Stream.of(1).onClose(() => log.push('a')), Stream.of(2).onClose(() => log.push('b')));
    s.close();
    expect(log).toEqual(['a', 'b']);
  });
  it('concat close() closes b even when a fails, suppressing b failure', () => {
    const ea = new Error('a');
    const eb = new Error('b');
    const s = Stream.concat(
      Stream.of(1).onClose(() => {
        throw ea;
      }),
      Stream.of(2).onClose(() => {
        throw eb;
      })
    );
    let caught: unknown;
    try {
      s.close();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBe(ea);
    expect((ea as Error & { suppressed: unknown[] }).suppressed).toEqual([eb]);
  });
  it('concat is parallel when either input is', () => {
    expect(Stream.concat(Stream.of(1), Stream.of(2).parallel()).isParallel()).toBe(true);
    expect(Stream.concat(Stream.of(1), Stream.of(2)).isParallel()).toBe(false);
  });
  it('concat spliterator is SIZED when both are, never SORTED/DISTINCT', () => {
    const sp = Stream.concat(IntStream.range(0, 3).boxed(), Stream.of(9)).spliterator();
    expect(sp.estimateSize()).toBe(4);
    expect(Stream.concat(Stream.of(1), Stream.of(2)).spliterator().hasCharacteristics(Spliterator.SIZED)).toBe(true);
    const r = Stream.concat(IntStream.range(0, 3).boxed(), IntStream.range(0, 3).boxed()).spliterator();
    expect(r.hasCharacteristics(Spliterator.SORTED)).toBe(false);
  });
  it('concat with an infinite stream short-circuits', () =>
    expect(Stream.concat(Stream.of(-1), Stream.iterate(0, (x) => x + 1)).limit(4).toArray()).toEqual([-1, 0, 1, 2]));
  it('nested concat', () =>
    expect(Stream.concat(Stream.concat(Stream.of(1), Stream.of(2)), Stream.concat(Stream.of(3), Stream.empty<number>())).toArray()).toEqual([1, 2, 3]));

  it('builder collects added elements in order', () => {
    const b = Stream.builder<string>();
    b.accept('a');
    b.add('b').add('c');
    expect(b.build().toArray()).toEqual(['a', 'b', 'c']);
  });
  it('builder rejects accept/add after build', () => {
    const b = Stream.builder<number>();
    b.build();
    expect(() => b.accept(1)).toThrow(IllegalStateException);
    expect(() => b.add(1)).toThrow(IllegalStateException);
  });
  it('builder rejects a second build', () => {
    const b = Stream.builder<number>();
    b.build();
    expect(() => b.build()).toThrow(IllegalStateException);
  });
  it('builder allows null elements', () => expect(Stream.builder<null>().add(null).build().count()).toBe(1));

  it('from(array) streams the array', () => expect(Stream.from([1, 2]).toArray()).toEqual([1, 2]));
  it('from(JS Set) streams in insertion order', () => expect(Stream.from(new Set(['x', 'y'])).toArray()).toEqual(['x', 'y']));
  it('from(string) streams code points', () => expect(Stream.from('ab').toArray()).toEqual(['a', 'b']));
  describe('from(iterable) calls return() like for..of: at most once, never after the end', () => {
    function source(n: number, opts: { returnThrows?: boolean; nextThrowsAt?: number } = {}) {
      const log: string[] = [];
      let i = 0;
      const iterable = {
        [Symbol.iterator]: () => ({
          next: () => {
            if (i === opts.nextThrowsAt) throw new Error('nextBoom');
            return i < n ? { value: i++, done: false as const } : { value: undefined, done: true as const };
          },
          return: () => {
            log.push(`return@${i}`);
            if (opts.returnThrows) throw new Error('returnBoom');
            return { value: undefined, done: true as const };
          },
        }),
      };
      return { iterable, log };
    }
    it('once after a short circuit, even when the stream is closed too', () => {
      const { iterable, log } = source(5);
      const s = Stream.from(iterable);
      expect(s.findFirst().get()).toBe(0);
      s.close();
      expect(log).toEqual(['return@1']);
    });
    it('never after the iterable is exhausted', () => {
      const { iterable, log } = source(3);
      const s = Stream.from(iterable);
      expect(s.toList().toArray()).toEqual([0, 1, 2]);
      s.close();
      expect(log).toEqual([]);
    });
    it('once for an inner stream of flatMap', () => {
      const { iterable, log } = source(5);
      expect(Stream.of(1).flatMap(() => Stream.from(iterable)).findFirst().get()).toBe(0);
      expect(log).toEqual(['return@1']);
    });
    it('a throwing return() does not hide the stage failure; it is attached as suppressed', () => {
      const { iterable } = source(5, { returnThrows: true });
      try {
        Stream.from(iterable).forEach((x) => {
          if (x === 1) throw new Error('primary');
        });
        fail('expected throw');
      } catch (e) {
        expect([(e as Error).message, ((e as any).suppressed as Error[]).map((x) => x.message)]).toEqual(['primary', ['returnBoom']]);
      }
    });
    it('not when the iterator itself throws from next()', () => {
      const { iterable, log } = source(5, { nextThrowsAt: 2 });
      expect(() => Stream.from(iterable).forEach(() => undefined)).toThrow('nextBoom');
      expect(log).toEqual([]);
    });
  });
  describe('from(generator) closes the generator when the stream stops early', () => {
    let finished = 0;
    function* gen() {
      try {
        for (let i = 1; ; i++) yield i;
      } finally {
        finished++;
      }
    }
    beforeEach(() => (finished = 0));
    it('short-circuiting terminal', () => {
      expect(Stream.from(gen()).filter((x) => x > 2).findFirst().get()).toBe(3);
      expect(finished).toBe(1);
    });
    it('limit', () => {
      expect(Stream.from(gen()).limit(2).toList().toArray()).toEqual([1, 2]);
      expect(finished).toBe(1);
    });
    it('a throwing stage', () => {
      expect(() => Stream.from(gen()).forEach(() => {
        throw new Error('boom');
      })).toThrow('boom');
      expect(finished).toBe(1);
    });
    it('break out of for..of', () => {
      for (const x of Stream.from(gen())) if (x === 2) break;
      expect(finished).toBe(1);
    });
    it('close() after a partial iterator()', () => {
      const s = Stream.from(gen());
      expect(s.iterator().next()).toBe(1);
      s.close();
      expect(finished).toBe(1);
    });
    it('a for..of that runs to the end of a short-circuited stream closes the generator', () => {
      const seen: number[] = [];
      for (const x of Stream.from(gen()).limit(3)) seen.push(x);
      expect([seen, finished]).toEqual([[1, 2, 3], 1]);
    });
    it('the stream iterator yields nothing after return()', () => {
      const it = Stream.of(1, 2, 3)[Symbol.iterator]();
      it.next();
      it.return!();
      expect(it.next()).toEqual({ value: undefined, done: true });
    });
    it('an exhausted generator is not closed again', () => {
      let returned = 0;
      const it = [1, 2][Symbol.iterator]();
      const src = { [Symbol.iterator]: () => ({ next: () => it.next(), return: () => (returned++, { value: undefined, done: true as const }) }) };
      expect(Stream.from(src).toList().toArray()).toEqual([1, 2]);
      expect(returned).toBe(0);
    });
  });
  it('from(collection) uses its spliterator', () => {
    const s = Stream.from(arrayList(1, 2, 3));
    expect(s.spliterator().getExactSizeIfKnown()).toBe(3);
  });
  it('from(generator) is lazy and short-circuits', () => {
    let pulled = 0;
    function* g() {
      for (let i = 0; ; i++) {
        pulled++;
        yield i;
      }
    }
    expect(Stream.from(g()).filter((x) => x > 2).findFirst().get()).toBe(3);
    expect(pulled).toBe(4);
  });
  it('from(iterable) supports full traversal', () => expect(Stream.from(new Map([[1, 'a']]).values()).toList().toString()).toBe('[a]'));
  it('from(null) throws', () => expect(() => Stream.from(null as unknown as number[])).toThrow(NullPointerException));
  it('ofArray does not copy: the array is read by the terminal operation', () => {
    const a = [1, 2, 3];
    const s = Stream.ofArray(a);
    a[0] = 9;
    expect(s.toArray()).toEqual([9, 2, 3]);
  });
  it('ofArray accepts array-likes', () => expect(Stream.ofArray({ length: 2, 0: 'a', 1: 'b' }).toArray()).toEqual(['a', 'b']));
});

describe('Stream · intermediate operations', () => {
  it('filter keeps matching elements in order', () => expect(Stream.of(1, 2, 3, 4).filter((x) => x % 2 === 0).toArray()).toEqual([2, 4]));
  it('map transforms', () => expect(Stream.of('a', 'bb').map((s) => s.length).toArray()).toEqual([1, 2]));
  it('map may produce null', () => expect(Stream.of(1).map(() => null).toArray()).toEqual([null]));
  it('null functions are rejected when the operation is called', () => {
    const s = Stream.of(1);
    expect(() => s.filter(null as unknown as (x: number) => boolean)).toThrow(NullPointerException);
    expect(() => s.map(null as unknown as (x: number) => number)).toThrow(NullPointerException);
    expect(() => s.peek(null as unknown as (x: number) => void)).toThrow(NullPointerException);
    expect(() => s.flatMap(null as unknown as (x: number) => Stream<number>)).toThrow(NullPointerException);
    expect(() => s.takeWhile(null as unknown as (x: number) => boolean)).toThrow(NullPointerException);
    expect(() => s.dropWhile(null as unknown as (x: number) => boolean)).toThrow(NullPointerException);
    expect(() => s.mapMulti(null as unknown as () => void)).toThrow(NullPointerException);
    expect(() => s.gather(null as unknown as Gatherer<number, unknown, number>)).toThrow(NullPointerException);
    // the stream is still usable after rejected calls
    expect(s.count()).toBe(1);
  });
  it('consecutive maps and filters keep per-element call order', () => {
    const log: string[] = [];
    const r = Stream.of(1, 2, 3)
      .filter((x) => (log.push(`f1:${x}`), x !== 2))
      .filter((x) => (log.push(`f2:${x}`), x !== 3))
      .map((x) => (log.push(`m1:${x}`), x * 10))
      .map((x) => (log.push(`m2:${x}`), x + 1))
      .mapToInt((x) => (log.push(`m3:${x}`), x))
      .boxed()
      .toArray();
    expect(r).toEqual([11]);
    expect(log).toEqual(['f1:1', 'f2:1', 'm1:1', 'm2:10', 'm3:11', 'f1:2', 'f1:3', 'f2:3']);
  });
  it('a map stage cannot be reused after another map was chained on it', () => {
    const a = Stream.of(1).map((x) => x + 1);
    const b = a.map((x) => x * 2);
    expect(() => a.map((x) => x)).toThrow(IllegalStateException);
    expect(() => a.filter(() => true)).toThrow(IllegalStateException);
    expect(b.toArray()).toEqual([4]);
  });
  it('a filter stage cannot be reused after another filter was chained on it', () => {
    const a = Stream.of(1, 2, 3).filter((x) => x > 1);
    const b = a.filter((x) => x < 3);
    expect(() => a.count()).toThrow(IllegalStateException);
    expect(b.toArray()).toEqual([2]);
  });
  it('long map chains', () => {
    let s = Stream.of(0);
    for (let i = 0; i < 50; i++) s = s.map((x) => x + 1);
    expect(s.findFirst().get()).toBe(50);
  });
  it('mapToInt / mapToLong / mapToDouble produce number streams', () => {
    expect(Stream.of('a', 'bbb').mapToInt((s) => s.length).sum()).toBe(4);
    expect(Stream.of('a', 'bbb').mapToLong((s) => s.length).max().getAsLong()).toBe(3);
    expect(Stream.of(1, 2).mapToDouble((x) => x / 2).average().getAsDouble()).toBe(0.75);
  });

  it('flatMap concatenates mapped streams in order', () =>
    expect(Stream.of(1, 2).flatMap((x) => Stream.of(x, x * 10)).toArray()).toEqual([1, 10, 2, 20]));
  it('flatMap treats null and undefined results as empty', () =>
    expect(Stream.of(1, 2, 3).flatMap((x) => (x === 2 ? null : x === 3 ? undefined : Stream.of(x))).toArray()).toEqual([1]));
  it('flatMap closes every mapped stream after use', () => {
    const closed: number[] = [];
    Stream.of(1, 2)
      .flatMap((x) => Stream.of(x).onClose(() => closed.push(x)))
      .forEach(() => {});
    expect(closed).toEqual([1, 2]);
  });
  it('flatMap closes the mapped stream when the downstream throws, suppressing its close failure', () => {
    const boom = new Error('boom');
    const closeErr = new Error('close');
    let closed = false;
    let caught: unknown;
    try {
      Stream.of(1)
        .flatMap((x) =>
          Stream.of(x).onClose(() => {
            closed = true;
            throw closeErr;
          })
        )
        .forEach(() => {
          throw boom;
        });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBe(boom);
    expect(closed).toBe(true);
    expect((boom as Error & { suppressed: unknown[] }).suppressed).toEqual([closeErr]);
  });
  it('flatMap propagates a close failure after successful traversal', () => {
    const e = new Error('close');
    expect(() =>
      Stream.of(1)
        .flatMap((x) =>
          Stream.of(x).onClose(() => {
            throw e;
          })
        )
        .toArray()
    ).toThrow(e);
  });
  it('flatMap over inner pipelines with stages', () =>
    expect(Stream.of(3, 1).flatMap((n) => Stream.iterate(n, (x) => x + 1).limit(2).map((x) => x * 2)).toArray()).toEqual([6, 8, 2, 4]));
  it('flatMap short-circuits infinite inner streams', () =>
    expect(Stream.of(1, 2).flatMap((x) => Stream.generate(() => x)).limit(3).toArray()).toEqual([1, 1, 1]));
  it('flatMap closes an inner stream cut short by the downstream', () => {
    let closed = 0;
    Stream.of(1, 2, 3)
      .flatMap(() => Stream.iterate(0, (x) => x + 1).onClose(() => closed++))
      .findFirst();
    expect(closed).toBe(1);
  });
  it('flatMap accepts a stream it cannot see inside (only spliterator/close)', () => {
    const foreign = { spliterator: () => Stream.of(7, 8).spliterator(), close: () => {} } as unknown as Stream<number>;
    expect(Stream.of(1).flatMap(() => foreign).toArray()).toEqual([7, 8]);
  });
  it('flatMap of an already consumed inner stream throws', () => {
    const inner = Stream.of(1);
    inner.count();
    expect(() => Stream.of(1).flatMap(() => inner).toArray()).toThrow(IllegalStateException);
  });
  it('flatMapToInt / Long / Double', () => {
    expect(Stream.of(2, 3).flatMapToInt((n) => IntStream.range(0, n)).toArray()).toEqual([0, 1, 0, 1, 2]);
    expect(Stream.of(1).flatMapToLong((n) => LongStream.of(n, n)).sum()).toBe(2);
    expect(Stream.of(1).flatMapToDouble(() => null).count()).toBe(0);
    expect(Stream.of(1).flatMapToDouble((n) => DoubleStream.of(n / 4)).toArray()).toEqual([0.25]);
  });

  it('mapMulti emits zero or more per element, in order', () =>
    expect(
      Stream.of(1, 2, 3)
        .mapMulti<number>((x, emit) => {
          for (let i = 0; i < x - 1; i++) emit(x);
        })
        .toArray()
    ).toEqual([2, 3, 3]));
  it('mapMultiToInt / Long / Double', () => {
    expect(Stream.of('ab').mapMultiToInt((s, e) => e(s.length)).sum()).toBe(2);
    expect(Stream.of(1).mapMultiToLong((x, e) => (e(x), e(x))).count()).toBe(2);
    expect(Stream.of(1).mapMultiToDouble((x, e) => e(x + 0.5)).toArray()).toEqual([1.5]);
  });

  it('distinct keeps the first occurrence, in encounter order', () => expect(Stream.of(3, 1, 3, 2, 1).distinct().toArray()).toEqual([3, 1, 2]));
  it('distinct uses equals/hashCode', () => {
    const a = new Point(1, 2);
    const b = new Point(1, 2);
    const r = Stream.of(a, b, new Point(0, 0)).distinct().toArray();
    expect(r.length).toBe(2);
    expect(r[0]).toBe(a);
  });
  it('distinct handles null, NaN and -0 like Objects.equals', () =>
    expect(Stream.of<unknown>(null, null, NaN, NaN, 0, -0, undefined).distinct().toArray()).toEqual([null, NaN, 0, undefined]));
  it('distinct after a short-circuit limit stays lazy', () =>
    expect(Stream.iterate(0, (x) => (x + 1) % 3).distinct().limit(3).toArray()).toEqual([0, 1, 2]));

  it('sorted() uses natural ordering', () => expect(Stream.of('b', 'c', 'a').sorted().toArray()).toEqual(['a', 'b', 'c']));
  it('sorted(null) throws NullPointerException eagerly', () =>
    expect(() => Stream.of(2, 1).sorted(null as unknown as Comparator<number>)).toThrow(NullPointerException));
  it('sorted(comparator) is stable', () => {
    const r = Stream.of('bb', 'a', 'cc', 'b', 'aa').sorted((x, y) => x.length - y.length).toArray();
    expect(r).toEqual(['a', 'b', 'bb', 'cc', 'aa']);
  });
  it('sorted() orders numbers numerically (not as strings)', () => expect(Stream.of(10, 9, 100).sorted().toArray()).toEqual([9, 10, 100]));
  it('sorted() uses compareTo', () =>
    expect(Stream.of(new Point(2, 0), new Point(1, 5)).sorted().map((p) => p.x).toArray()).toEqual([1, 2]));
  it('sorted() with natural ordering throws NullPointerException on null', () =>
    expect(() => Stream.of<number | null>(1, null).sorted().toArray()).toThrow(NullPointerException));
  it('sorted() of incomparable values throws ClassCastException', () =>
    expect(() => Stream.of<unknown>(1, 'a').sorted().toArray()).toThrow(ClassCastException));
  it('sorted with a comparator may order null', () =>
    expect(Stream.of<number | null>(2, null, 1).sorted((a, b) => (a ?? -1) - (b ?? -1)).toArray()).toEqual([null, 1, 2]));
  it('sorted then limit only replays what is needed', () => {
    const seen: number[] = [];
    const r = Stream.of(5, 3, 4, 1)
      .sorted()
      .peek((x) => seen.push(x))
      .limit(2)
      .toArray();
    expect(r).toEqual([1, 3]);
    expect(seen).toEqual([1, 3]);
  });

  it('peek runs per element, interleaved with downstream stages', () => {
    const log: string[] = [];
    Stream.of(1, 2)
      .peek((x) => log.push(`p${x}`))
      .map((x) => x * 10)
      .forEach((x) => log.push(`f${x}`));
    expect(log).toEqual(['p1', 'f10', 'p2', 'f20']);
  });

  it('limit keeps the first n', () => expect(Stream.of(1, 2, 3).limit(2).toArray()).toEqual([1, 2]));
  it('limit(0) is empty and pulls nothing', () => {
    let pulled = 0;
    expect(Stream.generate(() => pulled++).limit(0).toArray()).toEqual([]);
    expect(pulled).toBe(0);
  });
  it('limit larger than the stream keeps everything', () => expect(Stream.of(1, 2).limit(10).toArray()).toEqual([1, 2]));
  it('limit rejects negative sizes', () => expect(() => Stream.of(1).limit(-1)).toThrow(IllegalArgumentException));
  it('limit rejects NaN', () => expect(() => Stream.of(1).limit(NaN)).toThrow(IllegalArgumentException));
  it('limit pulls exactly n elements from an infinite source', () => {
    let pulled = 0;
    Stream.generate(() => pulled++)
      .limit(5)
      .forEach(() => {});
    expect(pulled).toBe(5);
  });
  it('skip drops the first n', () => expect(Stream.of(1, 2, 3).skip(2).toArray()).toEqual([3]));
  it('skip beyond the size is empty', () => expect(Stream.of(1, 2).skip(5).toArray()).toEqual([]));
  it('skip(0) returns the same stream', () => {
    const s = Stream.of(1);
    expect(s.skip(0)).toBe(s);
  });
  it('skip rejects negative counts', () => expect(() => Stream.of(1).skip(-2)).toThrow(IllegalArgumentException));
  it('skip then limit on an infinite source', () => expect(Stream.iterate(0, (x) => x + 1).skip(3).limit(2).toArray()).toEqual([3, 4]));

  it('takeWhile stops at the first failing element', () =>
    expect(Stream.of(1, 2, 5, 1).takeWhile((x) => x < 3).toArray()).toEqual([1, 2]));
  it('takeWhile does not test after failing', () => {
    let tests = 0;
    Stream.of(1, 5, 1, 1)
      .takeWhile((x) => (tests++, x < 3))
      .toArray();
    expect(tests).toBe(2);
  });
  it('takeWhile terminates infinite streams', () =>
    expect(Stream.iterate(1, (x) => x * 2).takeWhile((x) => x < 100).count()).toBe(7));
  it('dropWhile drops the leading matching run only', () =>
    expect(Stream.of(1, 2, 5, 1).dropWhile((x) => x < 3).toArray()).toEqual([5, 1]));
  it('dropWhile stops testing after the first failure', () => {
    let tests = 0;
    Stream.of(1, 5, 1, 1)
      .dropWhile((x) => (tests++, x < 3))
      .toArray();
    expect(tests).toBe(2);
  });
  it('dropWhile of all matching is empty', () => expect(Stream.of(1, 1).dropWhile(() => true).count()).toBe(0));

  it('gather: integrator pushes to the downstream', () => {
    const g = gatherer<number, null, string>(
      () => null,
      (_, t, d) => d.push(`<${t}>`)
    );
    expect(Stream.of(1, 2).gather(g).toArray()).toEqual(['<1>', '<2>']);
  });
  it('gather: state from the initializer, emitted by the finisher', () => {
    const g = gatherer<number, number[], number>(
      () => [0],
      (s, t) => ((s[0] += t), true),
      (s, d) => {
        d.push(s[0]);
      }
    );
    expect(Stream.of(1, 2, 3).gather(g).toArray()).toEqual([6]);
  });
  it('gather: initializer runs only at the terminal operation', () => {
    let inits = 0;
    const s = Stream.of(1).gather(
      gatherer(
        () => inits++,
        () => true
      )
    );
    expect(inits).toBe(0);
    s.count();
    expect(inits).toBe(1);
  });
  it('gather: an integrator returning false short-circuits an infinite stream', () => {
    const takeTwo = gatherer<number, { n: number }, number>(
      () => ({ n: 0 }),
      (s, t, d) => {
        d.push(t);
        return ++s.n < 2;
      }
    );
    expect(Stream.iterate(0, (x) => x + 1).gather(takeTwo).toArray()).toEqual([0, 1]);
  });
  it('gather: the finisher still runs after a short-circuit', () => {
    const g = gatherer<number, null, number>(
      () => null,
      () => false,
      (_, d) => {
        d.push(-1);
      }
    );
    expect(Stream.of(1, 2).gather(g).toArray()).toEqual([-1]);
  });
  it('gather: push reports and isRejecting reflects downstream cancellation', () => {
    const results: boolean[] = [];
    const rejecting: boolean[] = [];
    const g = gatherer<number, null, number>(
      () => null,
      (_, t, d) => {
        results.push(d.push(t));
        rejecting.push(d.isRejecting());
        return true;
      },
      (_, d) => {
        results.push(d.push(99));
      }
    );
    expect(Stream.of(1, 2, 3).gather(g).limit(2).toArray()).toEqual([1, 2]);
    expect(results).toEqual([true, false, false]);
    expect(rejecting).toEqual([false, true]);
  });
  it('gather: a greedy integrator is still evaluated correctly', () => {
    const g = gatherer<number, null, number>(
      () => null,
      (_, t, d) => d.push(t * 2),
      undefined,
      true
    );
    expect(Stream.of(1, 2).gather(g).toArray()).toEqual([2, 4]);
    expect(Stream.iterate(1, (x) => x + 1).gather(g).limit(2).toArray()).toEqual([2, 4]);
  });
  it('gather: chained gatherers', () => {
    const dup = gatherer<number, null, number>(
      () => null,
      (_, t, d) => d.push(t) && d.push(t)
    );
    expect(Stream.of(1, 2).gather(dup).gather(dup).toArray()).toEqual([1, 1, 1, 1, 2, 2, 2, 2]);
  });

  it('unordered() keeps the elements', () => expect(Stream.of(1, 2).unordered().toArray()).toEqual([1, 2]));
  it('parallel/sequential only flip the flag and return the same stream', () => {
    const s = Stream.of(1, 2, 3);
    expect(s.isParallel()).toBe(false);
    expect(s.parallel()).toBe(s);
    expect(s.isParallel()).toBe(true);
    const m = s.map((x) => x + 1);
    expect(m.isParallel()).toBe(true);
    expect(m.sequential()).toBe(m);
    expect(m.isParallel()).toBe(false);
    expect(m.toArray()).toEqual([2, 3, 4]);
  });
  it('a parallel stream evaluates sequentially and in order', () =>
    expect(
      arrayList(1, 2, 3, 4)
        .parallelStream()
        .map((x) => x * 2)
        .toArray()
    ).toEqual([2, 4, 6, 8]));
});

describe('Stream · terminal operations', () => {
  it('forEach visits in encounter order', () => {
    const out: number[] = [];
    Stream.of(3, 1, 2).forEach((x) => out.push(x));
    expect(out).toEqual([3, 1, 2]);
  });
  it('forEachOrdered visits in encounter order', () => {
    const out: number[] = [];
    Stream.of(3, 1, 2).parallel().forEachOrdered((x) => out.push(x));
    expect(out).toEqual([3, 1, 2]);
  });
  it('forEach rejects null', () => expect(() => Stream.of(1).forEach(null as unknown as () => void)).toThrow(NullPointerException));

  it('toArray() returns a fresh array', () => {
    const src = [1, 2];
    const a = Stream.ofArray(src).toArray();
    expect(a).toEqual([1, 2]);
    expect(a).not.toBe(src);
  });
  it('toArray(generator) fills the generated array', () => {
    const a = Stream.of(1, 2, 3).toArray((n) => new Array<number>(n));
    expect(a).toEqual([1, 2, 3]);
  });
  it('toArray(generator) is called with the exact size', () => {
    const sizes: number[] = [];
    Stream.of(1, 2, 3, 4)
      .filter((x) => x > 1)
      .toArray((n) => (sizes.push(n), new Array<number>(n)));
    expect(sizes).toEqual([3]);
  });
  it('toArray(generator) into a typed array', () => {
    const a = Stream.of(1, 2).toArray((n) => new Float64Array(n));
    expect(a).toBeInstanceOf(Float64Array);
    expect(Array.from(a)).toEqual([1, 2]);
  });
  it('toArray(generator) on an unsized stream rejects a too-small array', () =>
    expect(() =>
      Stream.of(1, 2)
        .filter(() => true)
        .toArray(() => new Int32Array(1))
    ).toThrow(IndexOutOfBoundsException));

  it('reduce(identity, op) folds left', () => expect(Stream.of('a', 'b', 'c').reduce('>', (x, y) => x + y)).toBe('>abc'));
  it('reduce(identity, op) of empty is the identity', () => expect(Stream.empty<number>().reduce(7, (a, b) => a + b)).toBe(7));
  it('reduce(op) folds and wraps in Optional', () => expect(Stream.of(1, 2, 3).reduce((a, b) => a * 10 + b).get()).toBe(123));
  it('reduce(op) of empty is Optional.empty', () => expect(Stream.empty<number>().reduce((a, b) => a + b)).toBe(Optional.empty()));
  it('reduce(op) of a single element does not call op', () => {
    let calls = 0;
    expect(Stream.of(5).reduce((a) => (calls++, a)).get()).toBe(5);
    expect(calls).toBe(0);
  });
  it('reduce(op) throws NullPointerException when the result is null', () =>
    expect(() => Stream.of<number | null>(null).reduce((a) => a)).toThrow(NullPointerException));
  it('reduce(identity, accumulator, combiner) folds with the accumulator', () =>
    expect(Stream.of('ab', 'c').reduce(0, (n, s) => n + s.length, (a, b) => a + b)).toBe(3));
  it('reduce rejects null functions', () => {
    expect(() => Stream.of(1).reduce(null as unknown as (a: number, b: number) => number)).toThrow(NullPointerException);
    expect(() => Stream.of(1).reduce(0, null as unknown as (a: number, b: number) => number)).toThrow(NullPointerException);
    expect(() => Stream.of(1).reduce(0, (a, b) => a + b, null as unknown as (a: number, b: number) => number)).toThrow(NullPointerException);
  });

  it('collect(collector) with IDENTITY_FINISH skips the finisher', () => {
    let finished = false;
    const c = collector<number, number[], number[]>(
      () => [],
      (a, t) => a.push(t),
      (a) => ((finished = true), a),
      'IDENTITY_FINISH'
    );
    expect(Stream.of(1, 2).collect(c)).toEqual([1, 2]);
    expect(finished).toBe(false);
  });
  it('collect(collector) applies the finisher otherwise', () => {
    const c = collector<string, string[], string>(
      () => [],
      (a, t) => a.push(t),
      (a) => a.join('-')
    );
    expect(Stream.of('a', 'b').collect(c)).toBe('a-b');
  });
  it('collect(collector) on empty still runs supplier and finisher', () => {
    const c = collector<number, number[], number>(
      () => [],
      (a, t) => a.push(t),
      (a) => a.length
    );
    expect(Stream.empty<number>().collect(c)).toBe(0);
  });
  it('collect(supplier, accumulator, combiner)', () => {
    const r = Stream.of(1, 2, 3).collect(
      () => new ArrayList<number>(),
      (l, x) => l.add(x),
      (a, b) => a.addAll(b)
    );
    expect(r.toString()).toBe('[1, 2, 3]');
  });
  it('collect rejects null arguments', () => {
    expect(() => Stream.of(1).collect(null as unknown as Collector<number, unknown, unknown>)).toThrow(NullPointerException);
    expect(() => Stream.of(1).collect(() => [], null as unknown as () => void, () => {})).toThrow(NullPointerException);
    expect(() => Stream.of(1).collect(() => [], () => {}, null as unknown as () => void)).toThrow(NullPointerException);
  });
  it('collect into a LinkedHashSet keeps first-seen order', () => {
    const r = Stream.of(2, 1, 2).collect(
      () => new LinkedHashSet<number>(),
      (s, x) => s.add(x),
      (a, b) => a.addAll(b)
    );
    expect(r.toString()).toBe('[2, 1]');
  });

  it('toList() is unmodifiable', () => {
    const l = Stream.of(1, 2).toList();
    expect(() => l.add(3)).toThrow(UnsupportedOperationException);
    expect(() => l.set(0, 3)).toThrow(UnsupportedOperationException);
    expect(() => l.remove(1 as unknown as number)).toThrow(UnsupportedOperationException);
  });
  it('toList() allows null elements', () => {
    const l = Stream.of<number | null>(1, null).toList();
    expect(l.size()).toBe(2);
    expect(l.get(1)).toBeNull();
    expect(l.contains(null)).toBe(true);
  });
  it('toList() equals an equivalent List', () => expect(Stream.of(1, 2).toList().equals(List.of(1, 2))).toBe(true));
  it('toList() of empty is empty', () => expect(Stream.empty().toList().isEmpty()).toBe(true));

  it('min/max with a comparator', () => {
    const c = (a: string, b: string) => a.length - b.length;
    expect(Stream.of('ccc', 'a', 'bb').min(c).get()).toBe('a');
    expect(Stream.of('ccc', 'a', 'bb').max(c).get()).toBe('ccc');
  });
  it('min/max pick the first of equal elements', () => {
    const c = (a: string, b: string) => a.length - b.length;
    expect(Stream.of('x', 'y').min(c).get()).toBe('x');
    expect(Stream.of('x', 'y').max(c).get()).toBe('x');
  });
  it('min/max of empty are empty', () => {
    expect(Stream.empty<number>().min((a, b) => a - b).isPresent()).toBe(false);
    expect(Stream.empty<number>().max((a, b) => a - b).isPresent()).toBe(false);
  });
  it('min throws NullPointerException when the minimum is null', () =>
    expect(() => Stream.of<number | null>(1, null).min((a, b) => (a === null ? -1 : b === null ? 1 : a - b))).toThrow(NullPointerException));
  it('max rejects a null comparator', () => expect(() => Stream.of(1).max(null as unknown as (a: number, b: number) => number)).toThrow(NullPointerException));

  it('count() counts', () => expect(Stream.of(1, 2, 3).filter((x) => x > 1).count()).toBe(2));
  it('count() of empty is 0', () => expect(Stream.empty().count()).toBe(0));

  it('anyMatch / allMatch / noneMatch', () => {
    expect(Stream.of(1, 2).anyMatch((x) => x === 2)).toBe(true);
    expect(Stream.of(1, 2).anyMatch((x) => x === 3)).toBe(false);
    expect(Stream.of(1, 2).allMatch((x) => x > 0)).toBe(true);
    expect(Stream.of(1, 2).allMatch((x) => x > 1)).toBe(false);
    expect(Stream.of(1, 2).noneMatch((x) => x > 5)).toBe(true);
    expect(Stream.of(1, 2).noneMatch((x) => x > 1)).toBe(false);
  });
  it('matching on empty: anyMatch false, allMatch and noneMatch true', () => {
    expect(Stream.empty().anyMatch(() => true)).toBe(false);
    expect(Stream.empty().allMatch(() => false)).toBe(true);
    expect(Stream.empty().noneMatch(() => true)).toBe(true);
  });
  it('anyMatch stops at the first match', () => {
    let tests = 0;
    Stream.of(1, 2, 3).anyMatch((x) => (tests++, x === 2));
    expect(tests).toBe(2);
  });
  it('allMatch stops at the first mismatch', () => {
    let tests = 0;
    Stream.of(1, 2, 3).allMatch((x) => (tests++, x < 2));
    expect(tests).toBe(2);
  });
  it('noneMatch stops at the first match', () => {
    let tests = 0;
    Stream.of(1, 2, 3).noneMatch((x) => (tests++, x === 1));
    expect(tests).toBe(1);
  });
  it('match predicates use truthiness', () => expect(Stream.of(0, 1).anyMatch((x) => x as unknown as boolean)).toBe(true));
  it('match operations reject null predicates', () => {
    expect(() => Stream.of(1).anyMatch(null as unknown as () => boolean)).toThrow(NullPointerException);
    expect(() => Stream.of(1).allMatch(null as unknown as () => boolean)).toThrow(NullPointerException);
    expect(() => Stream.of(1).noneMatch(null as unknown as () => boolean)).toThrow(NullPointerException);
  });

  it('findFirst returns the first element', () => expect(Stream.of(4, 5).findFirst().get()).toBe(4));
  it('findFirst of empty is empty', () => expect(Stream.empty().findFirst().isEmpty()).toBe(true));
  it('findFirst throws NullPointerException when the first element is null', () =>
    expect(() => Stream.of(null, 1).findFirst()).toThrow(NullPointerException));
  it('findAny returns an element (the first, sequentially)', () => expect(Stream.of(4, 5).findAny().get()).toBe(4));
  it('findAny throws NullPointerException on a null element', () => expect(() => Stream.of(undefined).findAny()).toThrow(NullPointerException));
  it('findFirst pulls a single element', () => {
    let pulled = 0;
    Stream.generate(() => pulled++).findFirst();
    expect(pulled).toBe(1);
  });

  it('iterator() walks the elements', () => {
    const it = Stream.of(1, 2).iterator();
    expect(it.hasNext()).toBe(true);
    expect(it.next()).toBe(1);
    expect(it.next()).toBe(2);
    expect(it.hasNext()).toBe(false);
    expect(() => it.next()).toThrow(NoSuchElementException);
  });
  it('iterator().remove() is unsupported', () => {
    const it = Stream.of(1).iterator();
    it.next();
    expect(() => it.remove()).toThrow(UnsupportedOperationException);
  });
  it('iterator() is lazy', () => {
    const seen: number[] = [];
    const it = Stream.of(1, 2, 3)
      .peek((x) => seen.push(x))
      .filter((x) => x > 1)
      .iterator();
    expect(seen).toEqual([]);
    expect(it.next()).toBe(2);
    expect(seen).toEqual([1, 2]);
  });
  it('iterator() over an infinite stream', () => {
    const it = Stream.iterate(0, (x) => x + 2)
      .map((x) => x + 1)
      .iterator();
    expect([it.next(), it.next(), it.next()]).toEqual([1, 3, 5]);
  });
  it('iterator().forEachRemaining after next()', () => {
    const it = Stream.of(1, 2, 3).map((x) => x * 2).iterator();
    expect(it.hasNext()).toBe(true);
    const out: number[] = [];
    it.forEachRemaining((x) => out.push(x));
    expect(out).toEqual([2, 4, 6]);
  });
  it('spliterator() of a stream without stages is the source spliterator', () => {
    const sp = Stream.of(1, 2, 3).spliterator();
    expect(sp.getExactSizeIfKnown()).toBe(3);
    expect(sp.hasCharacteristics(Spliterator.ORDERED | Spliterator.SIZED)).toBe(true);
  });
  it('spliterator() with stages advances lazily', () => {
    const sp = Stream.of(1, 2, 3, 4)
      .filter((x) => x % 2 === 0)
      .spliterator();
    const out: number[] = [];
    expect(sp.tryAdvance((x) => out.push(x))).toBe(true);
    expect(out).toEqual([2]);
    sp.forEachRemaining((x) => out.push(x));
    expect(out).toEqual([2, 4]);
    expect(sp.tryAdvance(() => {})).toBe(false);
  });
  it('spliterator() through sorted() and limit()', () => {
    const sp = Stream.of(3, 1, 2).sorted().limit(2).spliterator();
    const out: number[] = [];
    while (sp.tryAdvance((x) => out.push(x)));
    expect(out).toEqual([1, 2]);
  });
  it('spliterator().forEachRemaining before any tryAdvance runs the pipeline in push mode', () => {
    const out: number[] = [];
    Stream.of(1, 2, 3)
      .map((x) => -x)
      .spliterator()
      .forEachRemaining((x) => out.push(x));
    expect(out).toEqual([-1, -2, -3]);
  });
  it('spliterator() reports the ORDERED flag and an estimate', () => {
    const sp = Stream.of(1, 2).filter((x) => x > 0).spliterator();
    expect(sp.hasCharacteristics(Spliterator.ORDERED)).toBe(true);
    expect(sp.estimateSize()).toBe(2);
    expect(sp.trySplit()).toBeNull();
    expect(sp.getExactSizeIfKnown()).toBe(-1);
  });
  it('streams are JS iterables (spread)', () => expect([...Stream.of(1, 2).map((x) => x + 1)]).toEqual([2, 3]));
  it('for-of can break out of an infinite stream', () => {
    const out: number[] = [];
    for (const x of Stream.iterate(0, (n) => n + 1)) {
      if (x > 2) break;
      out.push(x);
    }
    expect(out).toEqual([0, 1, 2]);
  });
  it('[Symbol.iterator] consumes the stream', () => {
    const s = Stream.of(1);
    Array.from(s);
    expect(() => s.count()).toThrow(IllegalStateException);
  });
});

describe('Stream · single use', () => {
  it('a second terminal operation throws IllegalStateException', () => {
    const s = Stream.of(1, 2);
    s.count();
    expect(() => s.toArray()).toThrow(IllegalStateException);
    expect(() => s.toArray()).toThrow(LINKED);
  });
  it('an intermediate operation links the stream', () => {
    const s = Stream.of(1);
    s.map((x) => x);
    expect(() => s.filter(() => true)).toThrow(IllegalStateException);
    expect(() => s.forEach(() => {})).toThrow(IllegalStateException);
  });
  it('each terminal operation consumes', () => {
    const ops: ((s: Stream<number>) => unknown)[] = [
      (s) => s.forEach(() => {}),
      (s) => s.toArray(),
      (s) => s.toList(),
      (s) => s.reduce(0, (a, b) => a + b),
      (s) => s.reduce((a, b) => a + b),
      (s) => s.collect(() => [] as number[], (a, x) => a.push(x), () => {}),
      (s) => s.min((a, b) => a - b),
      (s) => s.count(),
      (s) => s.anyMatch(() => true),
      (s) => s.findFirst(),
      (s) => s.iterator(),
      (s) => s.spliterator(),
    ];
    for (const op of ops) {
      const s = Stream.of(1, 2);
      op(s);
      expect(() => s.count()).toThrow(IllegalStateException);
    }
  });
  it('a terminal operation on a closed stream throws', () => {
    const s = Stream.of(1);
    s.close();
    expect(() => s.count()).toThrow(IllegalStateException);
  });
  it('a derived stream fails once its source was closed', () => {
    const s = Stream.of(1);
    const m = s.map((x) => x);
    s.close();
    expect(() => m.count()).toThrow(IllegalStateException);
  });
  it('onClose after a terminal operation throws', () => {
    const s = Stream.of(1);
    s.count();
    expect(() => s.onClose(() => {})).toThrow(IllegalStateException);
  });
  it('the error is thrown before any element is processed', () => {
    let peeks = 0;
    const s = Stream.of(1).peek(() => peeks++);
    s.count();
    expect(() => s.forEach(() => {})).toThrow(IllegalStateException);
    expect(peeks).toBe(0);
  });
});

describe('Stream · close and onClose', () => {
  it('handlers run in registration order', () => {
    const log: number[] = [];
    const s = Stream.of(1)
      .onClose(() => log.push(1))
      .onClose(() => log.push(2));
    s.close();
    expect(log).toEqual([1, 2]);
  });
  it('onClose returns the same stream', () => {
    const s = Stream.of(1);
    expect(s.onClose(() => {})).toBe(s);
  });
  it('onClose rejects null', () => expect(() => Stream.of(1).onClose(null as unknown as () => void)).toThrow(NullPointerException));
  it('handlers registered on any stage belong to the pipeline', () => {
    const log: string[] = [];
    const m = Stream.of(1)
      .onClose(() => log.push('source'))
      .map((x) => x)
      .onClose(() => log.push('mapped'));
    m.close();
    expect(log).toEqual(['source', 'mapped']);
  });
  it('close() runs handlers once', () => {
    let n = 0;
    const s = Stream.of(1).onClose(() => n++);
    s.close();
    s.close();
    expect(n).toBe(1);
  });
  it('close() after a terminal operation still runs handlers', () => {
    let n = 0;
    const s = Stream.of(1).onClose(() => n++);
    s.count();
    s.close();
    expect(n).toBe(1);
  });
  it('terminal operations do not close the stream', () => {
    let n = 0;
    Stream.of(1)
      .onClose(() => n++)
      .count();
    expect(n).toBe(0);
  });
  it('the first failure is rethrown with later failures suppressed; all handlers run', () => {
    const e1 = new Error('1');
    const e2 = new Error('2');
    const e3 = new Error('3');
    const log: number[] = [];
    const s = Stream.of(1)
      .onClose(() => {
        log.push(1);
        throw e1;
      })
      .onClose(() => {
        log.push(2);
        throw e2;
      })
      .onClose(() => {
        log.push(3);
        throw e3;
      });
    let caught: unknown;
    try {
      s.close();
    } catch (e) {
      caught = e;
    }
    expect(log).toEqual([1, 2, 3]);
    expect(caught).toBe(e1);
    expect((e1 as Error & { suppressed: unknown[] }).suppressed).toEqual([e2, e3]);
  });
  it('the same error thrown twice is not self-suppressed', () => {
    const e = new Error('same');
    const s = Stream.of(1)
      .onClose(() => {
        throw e;
      })
      .onClose(() => {
        throw e;
      });
    expect(() => s.close()).toThrow(e);
    expect((e as Error & { suppressed?: unknown[] }).suppressed).toBeUndefined();
  });
  it('non-object throwables cannot carry suppressed errors but are still rethrown', () => {
    const s = Stream.of(1)
      .onClose(() => {
        throw 'first';
      })
      .onClose(() => {
        throw new Error('second');
      });
    let caught: unknown;
    try {
      s.close();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBe('first');
  });
  it('a frozen error is rethrown without suppressed', () => {
    const e1 = Object.freeze(new Error('frozen'));
    const s = Stream.of(1)
      .onClose(() => {
        throw e1;
      })
      .onClose(() => {
        throw new Error('later');
      });
    expect(() => s.close()).toThrow(e1);
  });
  it('a later failure is thrown when the first handler succeeds', () => {
    const e2 = new Error('2');
    const s = Stream.of(1)
      .onClose(() => {})
      .onClose(() => {
        throw e2;
      });
    expect(() => s.close()).toThrow(e2);
  });
});

describe('Stream · over collections', () => {
  it('ArrayList.stream()', () =>
    expect(
      arrayList(1, 2, 3)
        .stream()
        .map((x) => x * x)
        .toArray()
    ).toEqual([1, 4, 9]));
  it('Collection.stream() binds late: changes before the terminal operation are seen', () => {
    const l = arrayList(1);
    const s = l.stream();
    l.add(2);
    expect(s.toArray()).toEqual([1, 2]);
  });
  it('HashSet.stream().count()', () => {
    const s = new HashSet<string>();
    s.add('a');
    s.add('b');
    expect(s.stream().count()).toBe(2);
  });
  it('List.of(...).stream().sorted()', () => expect(List.of(3, 1, 2).stream().sorted().toList().toString()).toBe('[1, 2, 3]'));
  it('Optional.stream()', () => {
    expect(Optional.of(5).stream().toArray()).toEqual([5]);
    expect(Optional.empty<number>().stream().count()).toBe(0);
  });
});

// characteristics verified on the reference for every source kind
describe('Stream sources · spliterator characteristics (as the reference)', () => {
  const { ORDERED, SIZED, SUBSIZED, IMMUTABLE } = Spliterator;
  const built = <S>(b: { add(x: number): unknown; build(): S }, xs: number[]): S => {
    for (const x of xs) b.add(x);
    return b.build();
  };
  it('of/concat are IMMUTABLE; builders with 2+ elements are not', () => {
    expect(Stream.of(1, 2, 3).spliterator().characteristics()).toBe(ORDERED | SIZED | SUBSIZED | IMMUTABLE);
    expect(Stream.concat(Stream.of(1), Stream.of(2)).spliterator().characteristics()).toBe(ORDERED | SIZED | SUBSIZED | IMMUTABLE);
    expect(built(Stream.builder<number>(), [1, 2]).spliterator().characteristics()).toBe(ORDERED | SIZED | SUBSIZED);
    expect(built(Stream.builder<number>(), [1]).spliterator().characteristics()).toBe(ORDERED | SIZED | SUBSIZED | IMMUTABLE);
    expect(built(Stream.builder<number>(), []).spliterator().characteristics()).toBe(ORDERED | SIZED | SUBSIZED | IMMUTABLE);
    expect(built(IntStream.builder(), [1, 2]).spliterator().characteristics()).toBe(ORDERED | SIZED | SUBSIZED);
    expect(built(LongStream.builder(), [1, 2]).spliterator().characteristics()).toBe(ORDERED | SIZED | SUBSIZED);
    expect(built(DoubleStream.builder(), [1, 2]).spliterator().characteristics()).toBe(ORDERED | SIZED | SUBSIZED);
    expect(built(LongStream.builder(), [1]).spliterator().characteristics()).toBe(ORDERED | SIZED | SUBSIZED | IMMUTABLE);
  });
});
