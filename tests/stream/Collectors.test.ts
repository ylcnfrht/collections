import { unmodifiableList } from '../../src/Collections';
import { ArrayList } from '../../src/list/ArrayList';
import { LinkedList } from '../../src/list/LinkedList';
import { HashMap } from '../../src/map/HashMap';
import { LinkedHashMap } from '../../src/map/LinkedHashMap';
import { TreeMap } from '../../src/map/TreeMap';
import { HashSet } from '../../src/set/HashSet';
import { TreeSet } from '../../src/set/TreeSet';
import { Collector, Collectors } from '../../src/stream/Collectors';
import { Optional } from '../../src/stream/Optional';
import { Comparator } from '../../src/util/Comparator';
import { DoubleSummaryStatistics, IntSummaryStatistics, LongSummaryStatistics } from '../../src/util/SummaryStatistics';
import { expectThrows, Point } from '../helpers';
import { allSplits, chars, collect, collectSplit, FakeStream, fill, plain, sorted } from './collectors/support';

const {
  toCollection, toList, toUnmodifiableList, toSet, toUnmodifiableSet, joining, mapping, filtering, flatMapping,
  collectingAndThen, counting, minBy, maxBy, summingInt, summingLong, summingDouble, averagingInt, averagingLong,
  averagingDouble, reducing, groupingBy, groupingByConcurrent, partitioningBy, toMap, toUnmodifiableMap,
  toConcurrentMap, summarizingInt, summarizingLong, summarizingDouble, teeing,
} = Collectors;

const words = ['apple', 'banana', 'cherry', 'avocado', 'blueberry', 'cranberry', 'apricot', 'date'];
const nums = [5, 3, 8, 1, 9, 2, 7, 4, 6, 10];
const len = (s: string) => s.length;
const first = (s: string) => s[0];
const isEven = (n: number) => n % 2 === 0;
const natural = (a: number, b: number) => a - b;

/** Arguments the reference checks only when the collector runs: creating succeeds, collecting throws NullPointerException. */
const throwsAtUse = (make: () => Collector<any, any, any>, input: unknown[] = ['ab', 'cd']) => {
  const c = make();
  expectThrows(() => collect(input, c), 'NullPointerException');
};

interface Person {
  name: string;
  city: string;
  height: number;
  salary: number;
  dept: string;
}
const people: Person[] = [
  { name: 'Ann', city: 'Oslo', height: 170, salary: 3000, dept: 'eng' },
  { name: 'Bob', city: 'Rome', height: 182, salary: 1500, dept: 'ops' },
  { name: 'Cid', city: 'Oslo', height: 190, salary: 2500, dept: 'eng' },
  { name: 'Dee', city: 'Lima', height: 160, salary: 1800, dept: 'ops' },
  { name: 'Eve', city: 'Rome', height: 175, salary: 4000, dept: 'mgmt' },
  { name: 'Flo', city: 'Oslo', height: 165, salary: 1000, dept: 'eng' },
];

// ---------------------------------------------------------------- characteristics

describe('characteristics match the reference', () => {
  const id = (x: unknown) => x;
  const k = (s: string) => s;
  const cases: [string, Collector<any, any, any>, string[]][] = [
    ['toCollection', toCollection(() => new ArrayList()), ['IDENTITY_FINISH']],
    ['toList', toList(), ['IDENTITY_FINISH']],
    ['toUnmodifiableList', toUnmodifiableList(), []],
    ['toSet', toSet(), ['IDENTITY_FINISH', 'UNORDERED']],
    ['toUnmodifiableSet', toUnmodifiableSet(), ['UNORDERED']],
    ['joining()', joining(), []],
    ['joining(d)', joining(','), []],
    ['joining(d,p,s)', joining(',', '[', ']'), []],
    ['mapping(toList)', mapping(id, toList()), ['IDENTITY_FINISH']],
    ['mapping(toSet)', mapping(id, toSet()), ['IDENTITY_FINISH', 'UNORDERED']],
    ['mapping(counting)', mapping(id, counting()), []],
    ['filtering(toSet)', filtering(() => true, toSet()), ['IDENTITY_FINISH', 'UNORDERED']],
    ['flatMapping(toList)', flatMapping(() => null, toList()), ['IDENTITY_FINISH']],
    ['collectingAndThen(toList)', collectingAndThen(toList(), id), []],
    ['collectingAndThen(toSet)', collectingAndThen(toSet(), id), ['UNORDERED']],
    ['collectingAndThen(joining)', collectingAndThen(joining(), id), []],
    ['counting', counting(), []],
    ['minBy', minBy(natural), []],
    ['maxBy', maxBy(natural), []],
    ['summingInt', summingInt(len), []],
    ['summingLong', summingLong(len), []],
    ['summingDouble', summingDouble(len), []],
    ['averagingInt', averagingInt(len), []],
    ['averagingLong', averagingLong(len), []],
    ['averagingDouble', averagingDouble(len), []],
    ['reducing(op)', reducing(natural), []],
    ['reducing(id,op)', reducing(0, natural), []],
    ['reducing(id,map,op)', reducing(0, len, natural), []],
    ['groupingBy(f)', groupingBy(k), ['IDENTITY_FINISH']],
    ['groupingBy(f,toSet)', groupingBy(k, toSet()), ['IDENTITY_FINISH']],
    ['groupingBy(f,counting)', groupingBy(k, counting()), []],
    ['groupingBy(f,map,toList)', groupingBy(k, () => new TreeMap<any, any>(), toList()), ['IDENTITY_FINISH']],
    ['groupingBy(f,map,joining)', groupingBy(k, () => new TreeMap<any, any>(), joining()), []],
    ['groupingByConcurrent(f)', groupingByConcurrent(k), ['CONCURRENT', 'IDENTITY_FINISH', 'UNORDERED']],
    ['groupingByConcurrent(f,counting)', groupingByConcurrent(k, counting()), ['CONCURRENT', 'UNORDERED']],
    ['groupingByConcurrent(f,map,toList)', groupingByConcurrent(k, () => new HashMap<any, any>(), toList()), ['CONCURRENT', 'IDENTITY_FINISH', 'UNORDERED']],
    ['partitioningBy(p)', partitioningBy(isEven), ['IDENTITY_FINISH']],
    ['partitioningBy(p,counting)', partitioningBy(isEven, counting()), []],
    ['partitioningBy(p,toSet)', partitioningBy(isEven, toSet()), ['IDENTITY_FINISH']],
    ['toMap(k,v)', toMap(k, k), ['IDENTITY_FINISH']],
    ['toMap(k,v,m)', toMap(k, k, (a) => a), ['IDENTITY_FINISH']],
    ['toMap(k,v,m,f)', toMap(k, k, (a) => a, () => new TreeMap<any, any>()), ['IDENTITY_FINISH']],
    ['toUnmodifiableMap(k,v)', toUnmodifiableMap(k, k), []],
    ['toUnmodifiableMap(k,v,m)', toUnmodifiableMap(k, k, (a) => a), []],
    ['toConcurrentMap(k,v)', toConcurrentMap(k, k), ['CONCURRENT', 'IDENTITY_FINISH', 'UNORDERED']],
    ['toConcurrentMap(k,v,m)', toConcurrentMap(k, k, (a) => a), ['CONCURRENT', 'IDENTITY_FINISH', 'UNORDERED']],
    ['toConcurrentMap(k,v,m,f)', toConcurrentMap(k, k, (a) => a, () => new HashMap<any, any>()), ['CONCURRENT', 'IDENTITY_FINISH', 'UNORDERED']],
    ['summarizingInt', summarizingInt(len), ['IDENTITY_FINISH']],
    ['summarizingLong', summarizingLong(len), ['IDENTITY_FINISH']],
    ['summarizingDouble', summarizingDouble(len), ['IDENTITY_FINISH']],
    ['teeing(toList,toList)', teeing(toList(), toList(), id), []],
    ['teeing(toSet,toSet)', teeing(toSet(), toSet(), id), ['UNORDERED']],
    ['teeing(toSet,counting)', teeing(toSet(), counting(), id), []],
    ['teeing(concurrent,concurrent)', teeing(toConcurrentMap(k, k), groupingByConcurrent(k, counting()), id), ['CONCURRENT', 'UNORDERED']],
    ['teeing(concurrent,toSet)', teeing(toConcurrentMap(k, k), toSet(), id), ['UNORDERED']],
    ['Collector.of no finisher', Collector.of(() => [], () => {}, (a) => a), ['IDENTITY_FINISH']],
    ['Collector.of no finisher + UNORDERED', Collector.of(() => [], () => {}, (a) => a, 'UNORDERED'), ['IDENTITY_FINISH', 'UNORDERED']],
    ['Collector.of finisher', Collector.of(() => [], () => {}, (a) => a, id), []],
    ['Collector.of finisher + CONCURRENT', Collector.of(() => [], () => {}, (a) => a, id, 'CONCURRENT', 'CONCURRENT'), ['CONCURRENT']],
  ];
  it.each(cases)('%s', (_name, c, expected) => {
    expect(chars(c)).toEqual(expected);
  });

  it('characteristics sets are unmodifiable', () => {
    expectThrows(() => toList().characteristics().add('CONCURRENT'), 'UnsupportedOperationException');
    expectThrows(() => joining().characteristics().add('CONCURRENT'), 'UnsupportedOperationException');
    expectThrows(() => Collector.of(() => [], () => {}, (a) => a, 'UNORDERED').characteristics().clear(), 'UnsupportedOperationException');
  });

  it('collectingAndThen does not change the downstream characteristics', () => {
    const s = toSet();
    collectingAndThen(s, (x) => x);
    expect(chars(s)).toEqual(['IDENTITY_FINISH', 'UNORDERED']);
  });
});

// ---------------------------------------------------------------- Collector.of

describe('Collector.of', () => {
  it('Characteristics constants', () => {
    expect(Collector.Characteristics).toEqual({ CONCURRENT: 'CONCURRENT', UNORDERED: 'UNORDERED', IDENTITY_FINISH: 'IDENTITY_FINISH' });
  });
  it('without finisher returns the container', () => {
    const c = Collector.of<number, number[]>(() => [], (a, t) => a.push(t), (a, b) => a.concat(b));
    expect(collect([1, 2, 3], c)).toEqual([1, 2, 3]);
    expect(collectSplit([1, 2, 3], c, 1)).toEqual([1, 2, 3]);
  });
  it('with finisher applies it', () => {
    const c = Collector.of<number, number[], number>(() => [], (a, t) => a.push(t), (a, b) => a.concat(b), (a) => a.length, Collector.Characteristics.UNORDERED);
    expect(collect([1, 2, 3], c)).toBe(3);
    expect(chars(c)).toEqual(['UNORDERED']);
  });
  it('exposes exactly the functions given', () => {
    const sup = () => [] as number[];
    const acc = (a: number[], t: number) => void a.push(t);
    const comb = (a: number[]) => a;
    const fin = (a: number[]) => a.length;
    const c = Collector.of(sup, acc, comb, fin);
    expect(c.supplier()).toBe(sup);
    expect(c.accumulator()).toBe(acc);
    expect(c.combiner()).toBe(comb);
    expect(c.finisher()).toBe(fin);
  });
  it.each([
    ['supplier', () => Collector.of(null as any, () => {}, (a) => a)],
    ['accumulator', () => Collector.of(() => 0, null as any, (a) => a)],
    ['combiner', () => Collector.of(() => 0, () => {}, null as any)],
    ['finisher', () => Collector.of(() => 0, () => {}, (a) => a, null as any)],
    ['characteristic (no finisher)', () => Collector.of(() => 0, () => {}, (a) => a, 'UNORDERED', null as any)],
    ['characteristic (finisher)', () => Collector.of(() => 0, () => {}, (a) => a, (a: number) => a, null as any)],
  ])('null %s throws NullPointerException', (_n, fn) => expectThrows(fn, 'NullPointerException'));
});

// ---------------------------------------------------------------- toCollection / toList / toSet

describe('toCollection', () => {
  it('collects into the supplied collection, in order', () => {
    const r = collect(words, toCollection(() => new LinkedList<string>()));
    expect(r).toBeInstanceOf(LinkedList);
    expect(r.toArray()).toEqual(words);
  });
  it('reference example: toCollection(TreeSet::new)', () => {
    const r = collect(people.map((p) => p.city), toCollection(() => new TreeSet<string>()));
    expect(r.toArray()).toEqual(['Lima', 'Oslo', 'Rome']);
  });
  it('combiner appends right to left', () => {
    for (const r of allSplits(words, toCollection(() => new ArrayList<string>()))) expect(r.toArray()).toEqual(words);
  });
  it('a fresh collection per supplier call', () => {
    const c = toCollection(() => new ArrayList<number>());
    expect(c.supplier()()).not.toBe(c.supplier()());
  });
  it('null factory is accepted, throws NullPointerException when used', () => throwsAtUse(() => toCollection(null as any)));
});

describe('toList', () => {
  it('ArrayList in encounter order', () => {
    const r = collect(words, toList());
    expect(r).toBeInstanceOf(ArrayList);
    expect(r.toArray()).toEqual(words);
  });
  it('allows nulls and duplicates', () => {
    expect(collect([null, 1, null, 1], toList()).toArray()).toEqual([null, 1, null, 1]);
  });
  it('empty input', () => expect(collect([], toList()).size()).toBe(0));
  it('result is modifiable', () => {
    const r = collect([1], toList());
    r.add(2);
    expect(r.toArray()).toEqual([1, 2]);
  });
  it('combiner keeps order at every split point', () => {
    for (const r of allSplits(nums, toList())) expect(r.toArray()).toEqual(nums);
  });
  it('reference example: names to list', () => {
    expect(collect(people.map((p) => p.name), toList()).toArray()).toEqual(['Ann', 'Bob', 'Cid', 'Dee', 'Eve', 'Flo']);
  });
});

describe('toUnmodifiableList', () => {
  it('ordered, unmodifiable', () => {
    const r = collect(words, toUnmodifiableList());
    expect(r.toArray()).toEqual(words);
    expectThrows(() => r.add('x'), 'UnsupportedOperationException');
    expectThrows(() => r.set(0, 'x'), 'UnsupportedOperationException');
  });
  it('null element throws NullPointerException at finish', () => {
    const c = toUnmodifiableList<string | null>();
    const a = fill(['a', null], c);
    expectThrows(() => c.finisher()(a), 'NullPointerException');
  });
  it('empty input gives empty list', () => expect(collect([], toUnmodifiableList()).isEmpty()).toBe(true));
  it('combiner keeps order', () => {
    for (const r of allSplits(nums, toUnmodifiableList())) expect(r.toArray()).toEqual(nums);
  });
  it('equals an ArrayList with the same elements', () => {
    expect(collect([1, 2], toUnmodifiableList()).equals(collect([1, 2], toList()))).toBe(true);
  });
});

describe('toSet', () => {
  it('HashSet without duplicates', () => {
    const r = collect([1, 2, 2, 3, 1], toSet());
    expect(r).toBeInstanceOf(HashSet);
    expect(sorted(r)).toEqual([1, 2, 3]);
  });
  it('value equality for elements with equals/hashCode', () => {
    const r = collect([new Point(1, 2), new Point(1, 2), new Point(2, 1)], toSet());
    expect(r.size()).toBe(2);
  });
  it('allows null', () => expect(collect([null, null], toSet()).contains(null)).toBe(true));
  it('combiner merges smaller into larger', () => {
    for (const r of allSplits([1, 2, 3, 2, 1, 4], toSet())) expect(sorted(r)).toEqual([1, 2, 3, 4]);
  });
  it('combiner returns the larger container', () => {
    const c = toSet<number>();
    const small = fill([1], c);
    const big = fill([2, 3, 4], c);
    expect(c.combiner()(small, big)).toBe(big);
    expect(c.combiner()(fill([2, 3, 4], c), fill([1], c)).size()).toBe(4);
  });
});

describe('toUnmodifiableSet', () => {
  it('distinct, unmodifiable', () => {
    const r = collect([3, 1, 3, 2], toUnmodifiableSet());
    expect(sorted(r)).toEqual([1, 2, 3]);
    expectThrows(() => r.add(9), 'UnsupportedOperationException');
  });
  it('null element throws NullPointerException', () => {
    expectThrows(() => collect([1, null], toUnmodifiableSet()), 'NullPointerException');
  });
  it('combiner', () => {
    for (const r of allSplits([1, 2, 1, 3], toUnmodifiableSet())) expect(sorted(r)).toEqual([1, 2, 3]);
  });
  it('empty', () => expect(collect([], toUnmodifiableSet()).size()).toBe(0));
});

// ---------------------------------------------------------------- joining

describe('joining', () => {
  it('no delimiter', () => expect(collect(['a', 'b', 'c'], joining())).toBe('abc'));
  it('delimiter', () => expect(collect(['a', 'b', 'c'], joining(', '))).toBe('a, b, c'));
  it('delimiter, prefix, suffix', () => expect(collect(['a', 'b'], joining('|', '<', '>'))).toBe('<a|b>'));
  it('empty input: empty string', () => expect(collect([], joining())).toBe(''));
  it('empty input with prefix/suffix gives prefix+suffix', () => expect(collect([], joining(',', '[', ']'))).toBe('[]'));
  it('single element has no delimiter', () => expect(collect(['x'], joining(',', '[', ']'))).toBe('[x]'));
  it('null element appends "null"', () => expect(collect(['a', null, 'b'], joining(','))).toBe('a,null,b'));
  it('empty strings still get delimiters', () => expect(collect(['', '', ''], joining(','))).toBe(',,'));
  it('non-string values use their string form', () => expect(collect([1, 2] as any[], joining('-'))).toBe('1-2'));
  it('reference example: joining(", ")', () => {
    expect(collect(nums.map(String), joining(', '))).toBe('5, 3, 8, 1, 9, 2, 7, 4, 6, 10');
  });
  it('combiner keeps order at every split, no stray delimiters', () => {
    for (const r of allSplits(['a', 'b', 'c', 'd'], joining(',', '[', ']'))) expect(r).toBe('[a,b,c,d]');
    for (const r of allSplits(['a', 'b', 'c'], joining())) expect(r).toBe('abc');
  });
  it('combining two empty containers', () => expect(collectSplit([], joining(',', '(', ')'), 0)).toBe('()'));
  it.each([
    ['delimiter', () => joining(null as any), 'The delimiter must not be null'],
    ['undefined delimiter', () => joining(undefined as any), 'The delimiter must not be null'],
    ['delimiter (3-arg)', () => joining(null as any, '', ''), 'The delimiter must not be null'],
    ['prefix', () => joining(',', null as any, ''), 'The prefix must not be null'],
    ['undefined prefix', () => joining(',', undefined as any, ''), 'The prefix must not be null'],
    ['suffix', () => joining(',', '', null as any), 'The suffix must not be null'],
  ])('null %s is accepted, throws NullPointerException when used (even on empty input)', (_n, fn, message) => {
    const c = fn();
    expectThrows(() => collect([], c), 'NullPointerException');
    expect(() => collect(['a'], c)).toThrow(message);
  });
  it('joining() and joining(d) keep their defaults', () => {
    expect(collect(['a', 'b'], joining())).toBe('ab');
    expect(collect(['a', 'b'], joining('-'))).toBe('a-b');
  });
});

// ---------------------------------------------------------------- mapping / filtering / flatMapping

describe('mapping', () => {
  it('maps before accumulating', () => expect(plain(collect(words, mapping(len, toList())))).toEqual(words.map(len)));
  it('reference example: last names by city', () => {
    const r = collect(people, groupingBy((p: Person) => p.city, mapping((p: Person) => p.name, toSet())));
    expect(sorted(r.get('Oslo'))).toEqual(['Ann', 'Cid', 'Flo']);
    expect(sorted(r.get('Rome'))).toEqual(['Bob', 'Eve']);
  });
  it('uses the downstream finisher', () => expect(collect(words, mapping(first, joining()))).toBe('abcabcad'));
  it('combiner', () => {
    for (const r of allSplits(words, mapping(len, toList()))) expect(plain(r)).toEqual(words.map(len));
  });
  it('null args throw', () => {
    throwsAtUse(() => mapping(null as any, toList()));
    expectThrows(() => mapping(len, null as any), 'NullPointerException');
  });
});

describe('filtering', () => {
  it('keeps matching elements', () => expect(plain(collect(nums, filtering(isEven, toList())))).toEqual([8, 2, 4, 6, 10]));
  it('reference example: well-paid by department keeps empty groups', () => {
    const r = collect(people, groupingBy((p: Person) => p.dept, filtering((p: Person) => p.salary > 2000, mapping((p: Person) => p.name, toSet()))));
    expect(sorted(r.get('eng'))).toEqual(['Ann', 'Cid']);
    expect(sorted(r.get('mgmt'))).toEqual(['Eve']);
    expect(r.containsKey('ops')).toBe(true);
    expect(r.get('ops')!.isEmpty()).toBe(true);
  });
  it('nothing matching gives the empty downstream result', () => expect(collect(nums, filtering(() => false, counting()))).toBe(0));
  it('combiner', () => {
    for (const r of allSplits(nums, filtering(isEven, toList()))) expect(plain(r)).toEqual([8, 2, 4, 6, 10]);
  });
  it('null args throw', () => {
    throwsAtUse(() => filtering(null as any, toList()));
    expectThrows(() => filtering(isEven, null as any), 'NullPointerException');
  });
});

describe('flatMapping', () => {
  it('flattens each mapped stream in order', () => {
    const r = collect([[1, 2], [], [3]], flatMapping((a: number[]) => new FakeStream(a), toList()));
    expect(plain(r)).toEqual([1, 2, 3]);
  });
  it('closes every non-null stream', () => {
    const streams: FakeStream<number>[] = [];
    collect([[1], [2, 3]], flatMapping((a: number[]) => {
      const s = new FakeStream(a);
      streams.push(s);
      return s;
    }, toList()));
    expect(streams.map((s) => s.closed)).toEqual([1, 1]);
  });
  it('null/undefined result counts as empty', () => {
    const r = collect([1, 2, 3], flatMapping((n: number) => (n === 2 ? null : n === 3 ? undefined : new FakeStream([n * 10])), toList()));
    expect(plain(r)).toEqual([10]);
  });
  it('closes the stream when the downstream throws, rethrowing the original', () => {
    const s = new FakeStream([1]);
    const c = flatMapping(() => s, Collector.of(() => 0, () => {
      throw new Error('boom');
    }, (a) => a));
    expect(() => collect([0], c)).toThrow('boom');
    expect(s.closed).toBe(1);
  });
  it('a failing close after a failing body is attached as suppressed', () => {
    const s = new FakeStream([1], true);
    const c = flatMapping(() => s, Collector.of(() => 0, () => {
      throw new Error('boom');
    }, (a) => a));
    try {
      collect([0], c);
      fail('expected throw');
    } catch (e) {
      expect((e as Error).message).toBe('boom');
      expect(((e as any).suppressed as Error[])[0].message).toBe('close failed');
    }
  });
  it('a close that rethrows the body failure does not suppress it into itself; non-Error objects collect suppressed too', () => {
    const boom = new Error('boom');
    const same = { forEach: () => { throw boom; }, close: () => { throw boom; } };
    expect(() => collect([0], flatMapping(() => same as any, toList()))).toThrow(boom);
    expect((boom as any).suppressed).toBeUndefined();
    const body = { code: 1 };
    const c = flatMapping(() => ({ forEach: () => { throw body; }, close: () => { throw new Error('close failed'); } }) as any, toList());
    try {
      collect([0], c);
      fail('expected throw');
    } catch (e) {
      expect(e).toBe(body);
      expect((body as any).suppressed.map((x: Error) => x.message)).toEqual(['close failed']);
    }
  });
  it('a failing close alone propagates', () => {
    expect(() => collect([0], flatMapping(() => new FakeStream([1], true), toList()))).toThrow('close failed');
  });
  it('a non-Error body failure is rethrown as is', () => {
    const c = flatMapping(() => new FakeStream([1], true), Collector.of(() => 0, () => {
      throw 'str';
    }, (a) => a));
    expect(() => collect([0], c)).toThrow('str');
  });
  it('reference example: line items by customer', () => {
    const orders = [
      { customer: 'x', items: ['a', 'b'] },
      { customer: 'y', items: ['c'] },
      { customer: 'x', items: ['b', 'd'] },
    ];
    const r = collect(orders, groupingBy((o: (typeof orders)[0]) => o.customer, flatMapping((o: (typeof orders)[0]) => new FakeStream(o.items), toSet())));
    expect(sorted(r.get('x'))).toEqual(['a', 'b', 'd']);
    expect(sorted(r.get('y'))).toEqual(['c']);
  });
  it('combiner', () => {
    for (const r of allSplits([[1], [2, 3], [4]], flatMapping((a: number[]) => new FakeStream(a), toList()))) expect(plain(r)).toEqual([1, 2, 3, 4]);
  });
  it('null args throw', () => {
    throwsAtUse(() => flatMapping(null as any, toList()));
    expectThrows(() => flatMapping(() => null, null as any), 'NullPointerException');
  });
});

// ---------------------------------------------------------------- collectingAndThen

describe('collectingAndThen', () => {
  it('applies the finisher after the downstream', () => expect(collect(words, collectingAndThen(toList(), (l) => l.size()))).toBe(8));
  it('reference example: unmodifiable list', () => {
    const r = collect(['a', 'b'], collectingAndThen(toList(), unmodifiableList));
    expect(r.toArray()).toEqual(['a', 'b']);
    expectThrows(() => r.add('c'), 'UnsupportedOperationException');
  });
  it('composes with a non-identity downstream finisher', () => {
    expect(collect(['a', 'b'], collectingAndThen(joining(','), (s) => s.toUpperCase()))).toBe('A,B');
  });
  it('combiner', () => {
    for (const r of allSplits(nums, collectingAndThen(toList(), (l) => l.size()))) expect(r).toBe(10);
  });
  it('null args throw', () => {
    expectThrows(() => collectingAndThen(null as any, (x) => x), 'NullPointerException');
    expectThrows(() => collectingAndThen(toList(), null as any), 'NullPointerException');
  });
});

// ---------------------------------------------------------------- counting / min / max

describe('counting', () => {
  it('counts', () => expect(collect(words, counting())).toBe(8));
  it('zero for empty', () => expect(collect([], counting())).toBe(0));
  it('counts nulls', () => expect(collect([null, null], counting())).toBe(2));
  it('combiner', () => {
    for (const r of allSplits(nums, counting())) expect(r).toBe(10);
  });
});

describe('minBy / maxBy', () => {
  it('minBy', () => expect(collect(nums, minBy(natural)).get()).toBe(1));
  it('maxBy', () => expect(collect(nums, maxBy(natural)).get()).toBe(10));
  it('empty gives empty Optional', () => {
    expect(collect([], minBy(natural)).isPresent()).toBe(false);
    expect(collect([], maxBy(natural)).isPresent()).toBe(false);
  });
  it('ties: minBy keeps the first, maxBy keeps the first', () => {
    const byLen = Comparator.comparing(len);
    expect(collect(['bb', 'aa', 'cc'], minBy(byLen)).get()).toBe('bb');
    expect(collect(['bb', 'aa', 'cc'], maxBy(byLen)).get()).toBe('bb');
  });
  it('combiner at every split', () => {
    for (const r of allSplits(nums, minBy(natural))) expect(r.get()).toBe(1);
    for (const r of allSplits(nums, maxBy(natural))) expect(r.get()).toBe(10);
  });
  it('combining two empty containers gives empty', () => expect(collectSplit([], maxBy(natural), 0).isPresent()).toBe(false));
  it('a null result gives an empty Optional', () => {
    const nullsFirst = (a: number | null, b: number | null) => (a === null ? -1 : b === null ? 1 : a - b);
    expect(collect([3, null, 1], minBy(nullsFirst)).isPresent()).toBe(false);
  });
  it('null comparator throws', () => {
    expectThrows(() => minBy(null as any), 'NullPointerException');
    expectThrows(() => maxBy(null as any), 'NullPointerException');
  });
});

// ---------------------------------------------------------------- summing / averaging

describe('summing', () => {
  it('summingInt', () => expect(collect(words, summingInt(len))).toBe(words.join('').length));
  it('summingLong', () => expect(collect([2 ** 40, 2 ** 40], summingLong((n: number) => n))).toBe(2 ** 41));
  it('summingDouble', () => expect(collect([0.5, 0.25], summingDouble((n: number) => n))).toBe(0.75));
  it('zero for empty', () => {
    expect(collect([], summingInt(len))).toBe(0);
    expect(collect([], summingLong(len))).toBe(0);
    expect(collect([], summingDouble(len))).toBe(0);
  });
  it('reference example: total salaries', () => expect(collect(people, summingInt((p: Person) => p.salary))).toBe(13800));
  it('summingDouble is compensated', () => {
    const xs = [1, ...Array(10).fill(1e-16)];
    expect(collect(xs, summingDouble((n: number) => n))).toBe(1.000000000000001);
    expect(xs.reduce((a, b) => a + b)).toBe(1); // naive drifts
  });
  it('summingDouble compensated across the combiner', () => {
    const xs = [1, ...Array(10).fill(1e-16)];
    for (const r of allSplits(xs, summingDouble((n: number) => n))) expect(r).toBeCloseTo(1.000000000000001, 15);
  });
  it('summingDouble: infinity wins over NaN compensation', () => {
    expect(collect([Number.MAX_VALUE, Number.MAX_VALUE], summingDouble((n: number) => n))).toBe(Infinity);
    expect(collect([-Number.MAX_VALUE, -Number.MAX_VALUE], summingDouble((n: number) => n))).toBe(-Infinity);
  });
  it('summingDouble NaN propagates', () => expect(collect([1, NaN], summingDouble((n: number) => n))).toBeNaN());
  it('combiners', () => {
    for (const r of allSplits(nums, summingInt((n: number) => n))) expect(r).toBe(55);
    for (const r of allSplits(nums, summingLong((n: number) => n))) expect(r).toBe(55);
    for (const r of allSplits(nums, summingDouble((n: number) => n / 2))) expect(r).toBe(27.5);
  });
  it.each([
    ['summingInt', () => summingInt(null as any)],
    ['summingLong', () => summingLong(null as any)],
    ['summingDouble', () => summingDouble(null as any)],
  ])('%s(null) is accepted, throws NullPointerException when used', (_n, fn) => throwsAtUse(fn as () => Collector<any, any, any>));
});

describe('averaging', () => {
  it('averagingInt', () => expect(collect(nums, averagingInt((n: number) => n))).toBe(5.5));
  it('averagingLong', () => expect(collect([1, 2], averagingLong((n: number) => n))).toBe(1.5));
  it('averagingDouble', () => expect(collect([0.5, 1.5, 4], averagingDouble((n: number) => n))).toBe(2));
  it('zero when empty', () => {
    expect(collect([], averagingInt(len))).toBe(0);
    expect(collect([], averagingLong(len))).toBe(0);
    expect(collect([], averagingDouble(len))).toBe(0);
  });
  it('averagingDouble is compensated', () => {
    const xs = [1, ...Array(9).fill(1e-16)];
    expect(collect(xs, averagingDouble((n: number) => n))).toBe((1 + 9e-16) / 10);
  });
  it('averagingDouble infinity', () => expect(collect([Number.MAX_VALUE, Number.MAX_VALUE], averagingDouble((n: number) => n))).toBe(Infinity));
  it('combiners', () => {
    for (const r of allSplits(nums, averagingInt((n: number) => n))) expect(r).toBe(5.5);
    for (const r of allSplits(nums, averagingLong((n: number) => n))) expect(r).toBe(5.5);
    for (const r of allSplits(nums, averagingDouble((n: number) => n))) expect(r).toBe(5.5);
  });
  it('combining two empty containers gives 0', () => {
    expect(collectSplit([], averagingInt(len), 0)).toBe(0);
    expect(collectSplit([], averagingDouble(len), 0)).toBe(0);
  });
  it.each([
    ['averagingInt', () => averagingInt(null as any)],
    ['averagingLong', () => averagingLong(null as any)],
    ['averagingDouble', () => averagingDouble(null as any)],
  ])('%s(null) is accepted, throws NullPointerException when used', (_n, fn) => throwsAtUse(fn as () => Collector<any, any, any>));
});

// ---------------------------------------------------------------- reducing

describe('reducing', () => {
  const add = (a: number, b: number) => a + b;
  it('reducing(op)', () => expect(collect(nums, reducing(add)).get()).toBe(55));
  it('reducing(op) empty', () => expect(collect([], reducing(add)).isPresent()).toBe(false));
  it('reducing(op) single element: op not called', () => {
    const op = jest.fn(add);
    expect(collect([7], reducing(op)).get()).toBe(7);
    expect(op).not.toHaveBeenCalled();
  });
  it('reducing(identity, op)', () => expect(collect(nums, reducing(100, add))).toBe(155));
  it('reducing(identity, op) empty gives identity', () => expect(collect([], reducing(42, add))).toBe(42));
  it('reducing(identity, mapper, op)', () => expect(collect(words, reducing(0, len, add))).toBe(words.join('').length));
  it('reducing(identity, mapper, op) empty gives identity', () => expect(collect([], reducing('', first, (a, b) => a + b))).toBe(''));
  it('reference example: tallest by city', () => {
    const byHeight = Comparator.comparing((p: Person) => p.height);
    const r = collect(people, groupingBy((p: Person) => p.city, reducing((a: Person, b: Person) => (byHeight(a, b) >= 0 ? a : b))));
    expect(r.get('Oslo')!.get().name).toBe('Cid');
    expect(r.get('Rome')!.get().name).toBe('Bob');
  });
  it('reference example: longest last name by city', () => {
    const byLength = Comparator.comparing(len);
    const r = collect(people, groupingBy((p: Person) => p.city, reducing('', (p: Person) => p.name + p.city, (a: string, b: string) => (byLength(a, b) >= 0 ? a : b))));
    expect(r.get('Lima')).toBe('DeeLima');
  });
  it('combiners (identity used per container)', () => {
    for (const r of allSplits(nums, reducing(add))) expect(r.get()).toBe(55);
    for (const r of allSplits(nums, reducing(0, add))) expect(r).toBe(55);
    for (const r of allSplits(words, reducing(0, len, add))) expect(r).toBe(words.join('').length);
  });
  it('null args throw', () => {
    throwsAtUse(() => reducing(null as any));
    throwsAtUse(() => reducing(0, null as any));
    throwsAtUse(() => reducing(0, null as any, add));
    throwsAtUse(() => reducing(0, len, null as any));
  });
});

// ---------------------------------------------------------------- groupingBy

describe('groupingBy', () => {
  it('default: HashMap of ArrayLists, downstream order kept', () => {
    const r = collect(words, groupingBy(first));
    expect(r).toBeInstanceOf(HashMap);
    expect(r.get('a')).toBeInstanceOf(ArrayList);
    expect(plain(r)).toEqual({ a: ['apple', 'avocado', 'apricot'], b: ['banana', 'blueberry'], c: ['cherry', 'cranberry'], d: ['date'] });
  });
  it('reference example: by department', () => {
    const r = collect(people, groupingBy((p: Person) => p.dept));
    expect(r.get('eng')!.toArray().map((p) => p.name)).toEqual(['Ann', 'Cid', 'Flo']);
  });
  it('reference example: total salary by department', () => {
    expect(plain(collect(people, groupingBy((p: Person) => p.dept, summingInt((p: Person) => p.salary))))).toEqual({ eng: 6500, ops: 3300, mgmt: 4000 });
  });
  it('downstream counting', () => expect(plain(collect(words, groupingBy(first, counting())))).toEqual({ a: 3, b: 2, c: 2, d: 1 }));
  it('downstream finisher applied to every group', () => {
    expect(plain(collect(words, groupingBy(first, joining('+'))))).toEqual({ a: 'apple+avocado+apricot', b: 'banana+blueberry', c: 'cherry+cranberry', d: 'date' });
  });
  it('reference example: map factory TreeMap with mapping(toSet)', () => {
    const r = collect(people, groupingBy((p: Person) => p.city, () => new TreeMap<string, any>(), mapping((p: Person) => p.name, toSet())));
    expect(r).toBeInstanceOf(TreeMap);
    expect(r.keySet().toArray()).toEqual(['Lima', 'Oslo', 'Rome']);
  });
  it('map factory with a finishing downstream keeps the map instance', () => {
    const m = new LinkedHashMap<string, number>();
    const c = groupingBy(first, () => m, counting());
    expect(collect(['b', 'a', 'b'], c)).toBe(m);
    expect(m.keySet().toArray()).toEqual(['b', 'a']);
  });
  it('null key throws NullPointerException with the reference message', () => {
    expect(() => collect(['a', 'b'], groupingBy((s: string) => (s === 'b' ? null : s)))).toThrow('element cannot be mapped to a null key');
    expectThrows(() => collect([1], groupingBy(() => undefined)), 'NullPointerException');
  });
  it('value-equal keys group together', () => {
    const r = collect([1, 2, 3], groupingBy((n: number) => new Point(n % 2, 0), counting()));
    expect(r.get(new Point(1, 0))).toBe(2);
  });
  it('empty input gives empty map', () => expect(collect([], groupingBy(first)).isEmpty()).toBe(true));
  it('combiner merges groups with the downstream combiner, keeping order', () => {
    for (const r of allSplits(words, groupingBy(first))) {
      expect(plain(r)).toEqual({ a: ['apple', 'avocado', 'apricot'], b: ['banana', 'blueberry'], c: ['cherry', 'cranberry'], d: ['date'] });
    }
    for (const r of allSplits(words, groupingBy(first, counting()))) expect(plain(r)).toEqual({ a: 3, b: 2, c: 2, d: 1 });
    for (const r of allSplits(words, groupingBy(first, () => new TreeMap<string, any>(), joining()))) expect(plain(r).a).toBe('appleavocadoapricot');
  });
  it('nested groupingBy', () => {
    const r = collect(people, groupingBy((p: Person) => p.city, groupingBy((p: Person) => p.dept, counting())));
    expect(plain(r)).toEqual({ Oslo: { eng: 3 }, Rome: { ops: 1, mgmt: 1 }, Lima: { ops: 1 } });
    for (const s of allSplits(people, groupingBy((p: Person) => p.city, groupingBy((p: Person) => p.dept, counting())))) expect(plain(s)).toEqual(plain(r));
  });
  it('groupingBy with partitioningBy downstream', () => {
    const r = collect(people, groupingBy((p: Person) => p.city, partitioningBy((p: Person) => p.salary > 2000, mapping((p: Person) => p.name, toList()))));
    expect(plain(r)).toEqual({ Oslo: { false: ['Flo'], true: ['Ann', 'Cid'] }, Rome: { false: ['Bob'], true: ['Eve'] }, Lima: { false: ['Dee'], true: [] } });
  });
  it('null args throw', () => {
    throwsAtUse(() => groupingBy(null as any));
    expectThrows(() => groupingBy(first, null as any), 'NullPointerException');
    throwsAtUse(() => groupingBy(first, null as any, toList()));
    expectThrows(() => groupingBy(first, () => new HashMap<any, any>(), null as any), 'NullPointerException');
  });
});

describe('groupingByConcurrent', () => {
  it('same groups as groupingBy', () => {
    expect(plain(collect(words, groupingByConcurrent(first)))).toEqual(plain(collect(words, groupingBy(first))));
  });
  it('with downstream', () => expect(plain(collect(words, groupingByConcurrent(first, counting())))).toEqual({ a: 3, b: 2, c: 2, d: 1 }));
  it('with map factory', () => {
    const r = collect(words, groupingByConcurrent(first, () => new TreeMap<string, any>(), joining()));
    expect(r).toBeInstanceOf(TreeMap);
    expect(r.firstKey()).toBe('a');
  });
  it('null key throws', () => expect(() => collect([1], groupingByConcurrent(() => null))).toThrow('element cannot be mapped to a null key'));
  it('combiner', () => {
    for (const r of allSplits(words, groupingByConcurrent(first, counting()))) expect(plain(r)).toEqual({ a: 3, b: 2, c: 2, d: 1 });
  });
  it('null args throw', () => {
    throwsAtUse(() => groupingByConcurrent(null as any));
    expectThrows(() => groupingByConcurrent(first, null as any), 'NullPointerException');
    throwsAtUse(() => groupingByConcurrent(first, null as any, toList()));
  });
});

// ---------------------------------------------------------------- partitioningBy

describe('partitioningBy', () => {
  it('splits into true/false lists in encounter order', () => {
    const r = collect(nums, partitioningBy(isEven));
    expect(r.get(true)!.toArray()).toEqual([8, 2, 4, 6, 10]);
    expect(r.get(false)!.toArray()).toEqual([5, 3, 1, 9, 7]);
  });
  it('reference example: passing/failing', () => {
    const r = collect([55, 80, 30, 90], partitioningBy((g: number) => g >= 60));
    expect(plain(r)).toEqual({ true: [80, 90], false: [55, 30] });
  });
  it('always has both keys, even on empty input', () => {
    const r = collect([], partitioningBy(isEven));
    expect(r.size()).toBe(2);
    expect(r.containsKey(true)).toBe(true);
    expect(r.containsKey(false)).toBe(true);
    expect(r.get(true)!.isEmpty()).toBe(true);
  });
  it('all on one side still has the other key', () => {
    const r = collect([2, 4], partitioningBy(isEven, counting()));
    expect(r.get(false)).toBe(0);
    expect(r.get(true)).toBe(2);
  });
  it('iteration order is false then true', () => {
    const r = collect(nums, partitioningBy(isEven, counting()));
    expect(r.keySet().toArray()).toEqual([false, true]);
    expect(r.entrySet().toArray().map((e) => e.getValue())).toEqual([5, 5]);
    expect(r.toString()).toBe('{false=5, true=5}');
    expect(r.entrySet().size()).toBe(2);
  });
  it('non-boolean keys are absent', () => {
    const r = collect(nums, partitioningBy(isEven));
    expect(r.containsKey('true')).toBe(false);
    expect(r.get(1)).toBeNull();
    expect(r.get(null)).toBeNull();
  });
  it('is unmodifiable', () => {
    const r = collect(nums, partitioningBy(isEven, counting()));
    expectThrows(() => r.put(true, 1), 'UnsupportedOperationException');
    expectThrows(() => r.clear(), 'UnsupportedOperationException');
  });
  it('equals and hashCode as a map', () => {
    const r = collect([1, 2, 3], partitioningBy(isEven, counting()));
    const m = new HashMap<boolean, number>();
    m.put(true, 1);
    m.put(false, 2);
    expect(r.equals(m)).toBe(true);
    expect(m.equals(r)).toBe(true);
    expect(r.hashCode()).toBe(m.hashCode());
    expect(r.containsValue(2)).toBe(true);
  });
  it('downstream finisher applied to both sides', () => {
    expect(plain(collect(['a', 'bb', 'c'], partitioningBy((s: string) => s.length > 1, joining(','))))).toEqual({ false: 'a,c', true: 'bb' });
  });
  it('combiner', () => {
    for (const r of allSplits(nums, partitioningBy(isEven))) expect(plain(r)).toEqual({ false: [5, 3, 1, 9, 7], true: [8, 2, 4, 6, 10] });
    for (const r of allSplits(nums, partitioningBy(isEven, counting()))) expect(plain(r)).toEqual({ false: 5, true: 5 });
  });
  it('nested partitioningBy with groupingBy', () => {
    const r = collect(words, partitioningBy((w: string) => w.length > 5, groupingBy(first, counting())));
    expect(plain(r)).toEqual({ false: { a: 1, d: 1 }, true: { a: 2, b: 2, c: 2 } });
  });
  it('null args throw', () => {
    throwsAtUse(() => partitioningBy(null as any));
    expectThrows(() => partitioningBy(isEven, null as any), 'NullPointerException');
    expectThrows(() => partitioningBy(isEven, undefined as any), 'NullPointerException');
  });
});

// ---------------------------------------------------------------- toMap family

describe('toMap', () => {
  it('HashMap of key -> value', () => {
    const r = collect(words, toMap((w: string) => w, len));
    expect(r).toBeInstanceOf(HashMap);
    expect(r.get('banana')).toBe(6);
    expect(r.size()).toBe(8);
  });
  it('duplicate key throws IllegalStateException with the reference message', () => {
    expect(() => collect(['ab', 'ac'], toMap(first, (w: string) => w))).toThrow('Duplicate key a (attempted merging values ab and ac)');
    expectThrows(() => collect(['ab', 'ac'], toMap(first, (w: string) => w)), 'IllegalStateException');
  });
  it('null value throws NullPointerException', () => expectThrows(() => collect(['a'], toMap(first, () => null)), 'NullPointerException'));
  it('null key is allowed (HashMap)', () => expect(collect(['a'], toMap(() => null, first)).get(null)).toBe('a'));
  it('reference example: student id -> student', () => {
    const r = collect(people, toMap((p: Person) => p.name, (p: Person) => p));
    expect(r.get('Eve')!.city).toBe('Rome');
  });
  it('combiner merges, detecting duplicates across containers', () => {
    for (const r of allSplits(words, toMap((w: string) => w, len))) expect(r.size()).toBe(8);
    const c = toMap(first, (w: string) => w);
    expect(() => collectSplit(['ab', 'ac'], c, 1)).toThrow('Duplicate key a (attempted merging values ab and ac)');
  });
  it('merge function: reference example phone book', () => {
    const r = collect(people, toMap((p: Person) => p.city, (p: Person) => p.name, (a: string, b: string) => a + ', ' + b));
    expect(r.get('Oslo')).toBe('Ann, Cid, Flo');
  });
  it('merge function across the combiner keeps order', () => {
    for (const r of allSplits(people, toMap((p: Person) => p.city, (p: Person) => p.name, (a: string, b: string) => a + ', ' + b))) {
      expect(r.get('Oslo')).toBe('Ann, Cid, Flo');
    }
  });
  it('merge function returning null removes the key', () => {
    const r = collect(['a1', 'a2', 'b1'], toMap(first, (w: string) => w, () => null as unknown as string));
    expect(r.containsKey('a')).toBe(false);
    expect(r.containsKey('b')).toBe(true);
  });
  it('merge: null value throws', () => expectThrows(() => collect(['a'], toMap(first, () => null, (a) => a)), 'NullPointerException'));
  it('map factory', () => {
    const r = collect(['b', 'a', 'c'], toMap((w: string) => w, len, (a: number) => a, () => new TreeMap<string, number>()));
    expect(r).toBeInstanceOf(TreeMap);
    expect(r.keySet().toArray()).toEqual(['a', 'b', 'c']);
  });
  it('null args throw', () => {
    throwsAtUse(() => toMap(null as any, first));
    throwsAtUse(() => toMap(first, null as any));
    throwsAtUse(() => toMap(first, first, null as any));
    throwsAtUse(() => toMap(first, first, (a) => a, null as any));
  });
});

describe('toUnmodifiableMap', () => {
  it('unmodifiable result', () => {
    const r = collect(words, toUnmodifiableMap((w: string) => w, len));
    expect(r.get('date')).toBe(4);
    expectThrows(() => r.put('x', 1), 'UnsupportedOperationException');
  });
  it('duplicate key throws IllegalStateException', () => {
    expect(() => collect(['ab', 'ac'], toUnmodifiableMap(first, (w: string) => w))).toThrow('Duplicate key a (attempted merging values ab and ac)');
  });
  it('null key throws NullPointerException', () => expectThrows(() => collect(['a'], toUnmodifiableMap(() => null, first)), 'NullPointerException'));
  it('null value throws NullPointerException', () => expectThrows(() => collect(['a'], toUnmodifiableMap(first, () => null)), 'NullPointerException'));
  it('with merge function', () => {
    const r = collect(words, toUnmodifiableMap(first, () => 1, (a: number, b: number) => a + b));
    expect(plain(r)).toEqual({ a: 3, b: 2, c: 2, d: 1 });
    expectThrows(() => r.remove('a'), 'UnsupportedOperationException');
  });
  it('combiner', () => {
    for (const r of allSplits(words, toUnmodifiableMap(first, () => 1, (a: number, b: number) => a + b))) expect(plain(r)).toEqual({ a: 3, b: 2, c: 2, d: 1 });
  });
  it('null args throw', () => {
    expectThrows(() => toUnmodifiableMap(null as any, first), 'NullPointerException');
    expectThrows(() => toUnmodifiableMap(first, null as any), 'NullPointerException');
    expectThrows(() => toUnmodifiableMap(first, first, null as any), 'NullPointerException');
  });
});

describe('toConcurrentMap', () => {
  it('same as toMap', () => expect(plain(collect(words, toConcurrentMap((w: string) => w, len)))).toEqual(plain(collect(words, toMap((w: string) => w, len)))));
  it('duplicate key throws', () => expect(() => collect(['ab', 'ac'], toConcurrentMap(first, (w: string) => w))).toThrow('Duplicate key a (attempted merging values ab and ac)'));
  it('null value throws', () => expectThrows(() => collect(['a'], toConcurrentMap(first, () => null)), 'NullPointerException'));
  it('merge function', () => expect(plain(collect(words, toConcurrentMap(first, () => 1, (a: number, b: number) => a + b)))).toEqual({ a: 3, b: 2, c: 2, d: 1 }));
  it('map factory', () => {
    const r = collect(words, toConcurrentMap(first, () => 1, (a: number, b: number) => a + b, () => new TreeMap<string, number>()));
    expect(r.firstKey()).toBe('a');
  });
  it('combiner', () => {
    for (const r of allSplits(words, toConcurrentMap(first, () => 1, (a: number, b: number) => a + b))) expect(plain(r)).toEqual({ a: 3, b: 2, c: 2, d: 1 });
    for (const r of allSplits(words, toConcurrentMap((w: string) => w, len))) expect(r.size()).toBe(8);
  });
  it('null args throw', () => {
    throwsAtUse(() => toConcurrentMap(null as any, first));
    throwsAtUse(() => toConcurrentMap(first, null as any));
    throwsAtUse(() => toConcurrentMap(first, first, null as any));
    throwsAtUse(() => toConcurrentMap(first, first, (a) => a, null as any));
  });
});

// ---------------------------------------------------------------- summarizing

describe('summarizing', () => {
  it('summarizingInt', () => {
    const s = collect(nums, summarizingInt((n: number) => n));
    expect(s).toBeInstanceOf(IntSummaryStatistics);
    expect([s.getCount(), s.getSum(), s.getMin(), s.getMax(), s.getAverage()]).toEqual([10, 55, 1, 10, 5.5]);
  });
  it('summarizingLong', () => {
    const s = collect([2 ** 40, 1], summarizingLong((n: number) => n));
    expect(s).toBeInstanceOf(LongSummaryStatistics);
    expect(s.getSum()).toBe(2 ** 40 + 1);
  });
  it('summarizingDouble', () => {
    const s = collect([0.5, 2.5], summarizingDouble((n: number) => n));
    expect(s).toBeInstanceOf(DoubleSummaryStatistics);
    expect([s.getCount(), s.getSum(), s.getMin(), s.getMax(), s.getAverage()]).toEqual([2, 3, 0.5, 2.5, 1.5]);
  });
  it('empty statistics', () => {
    expect(collect([], summarizingInt(len)).getMin()).toBe(2147483647);
    expect(collect([], summarizingDouble(len)).getMax()).toBe(-Infinity);
    expect(collect([], summarizingLong(len)).getCount()).toBe(0);
  });
  it('combiners', () => {
    for (const s of allSplits(nums, summarizingInt((n: number) => n))) expect([s.getCount(), s.getSum(), s.getMin(), s.getMax()]).toEqual([10, 55, 1, 10]);
    for (const s of allSplits(nums, summarizingLong((n: number) => n))) expect([s.getCount(), s.getSum(), s.getMin(), s.getMax()]).toEqual([10, 55, 1, 10]);
    for (const s of allSplits(nums, summarizingDouble((n: number) => n))) expect([s.getCount(), s.getSum(), s.getMin(), s.getMax()]).toEqual([10, 55, 1, 10]);
  });
  it.each([
    ['summarizingInt', () => summarizingInt(null as any)],
    ['summarizingLong', () => summarizingLong(null as any)],
    ['summarizingDouble', () => summarizingDouble(null as any)],
  ])('%s(null) is accepted, throws NullPointerException when used', (_n, fn) => throwsAtUse(fn as () => Collector<any, any, any>));
});

// ---------------------------------------------------------------- teeing

describe('teeing', () => {
  it('average from sum and count', () => {
    expect(collect(nums, teeing(summingInt((n: number) => n), counting(), (s, c) => s / c))).toBe(5.5);
  });
  it('min and max at once', () => {
    const r = collect(nums, teeing(minBy(natural), maxBy(natural), (a, b) => [a.get(), b.get()]));
    expect(r).toEqual([1, 10]);
  });
  it('both downstream finishers are applied', () => {
    expect(collect(['a', 'b'], teeing(joining(','), joining('-', '[', ']'), (x, y) => x + y))).toBe('a,b[a-b]');
  });
  it('each element is seen by both, in order', () => {
    const r = collect(words, teeing(toList(), mapping(len, toList()), (a, b) => [plain(a), plain(b)]));
    expect(r).toEqual([words, words.map(len)]);
  });
  it('empty input', () => expect(collect([], teeing(counting(), toList(), (c, l) => [c, l.size()]))).toEqual([0, 0]));
  it('nested teeing', () => {
    const c = teeing(counting(), teeing(minBy(natural), maxBy(natural), (a, b) => b.get() - a.get()), (n, range) => `${n}:${range}`);
    expect(collect(nums, c)).toBe('10:9');
  });
  it('combiner at every split', () => {
    for (const r of allSplits(nums, teeing(summingInt((n: number) => n), toList(), (s, l) => [s, plain(l)]))) expect(r).toEqual([55, nums]);
  });
  it('as a groupingBy downstream', () => {
    const r = collect(people, groupingBy((p: Person) => p.city, teeing(counting(), averagingInt((p: Person) => p.height), (c, a) => `${c}@${a}`)));
    expect(r.get('Rome')).toBe('2@178.5');
  });
  it('null args throw', () => {
    expect(() => teeing(null as any, toList(), () => 0)).toThrow('downstream1');
    expect(() => teeing(toList(), null as any, () => 0)).toThrow('downstream2');
    expect(() => teeing(toList(), toList(), null as any)).toThrow('merger');
  });
});

// ---------------------------------------------------------------- misc contract checks

describe('contract', () => {
  const all: [string, Collector<any, any, any>][] = [
    ['toList', toList()],
    ['toSet', toSet()],
    ['joining', joining()],
    ['counting', counting()],
    ['groupingBy', groupingBy(String)],
    ['partitioningBy', partitioningBy(Boolean)],
    ['toMap', toMap(String, String)],
    ['summarizingInt', summarizingInt(Number)],
    ['teeing', teeing(toList(), counting(), (a, b) => [a, b])],
  ];
  it.each(all)('%s: supplier gives a fresh container each call', (_n, c) => {
    expect(c.supplier()()).not.toBe(c.supplier()());
  });
  it.each(all)('%s: functions are stable across calls', (_n, c) => {
    expect(c.supplier()).toBe(c.supplier());
    expect(c.accumulator()).toBe(c.accumulator());
    expect(c.combiner()).toBe(c.combiner());
    expect(c.finisher()).toBe(c.finisher());
  });
  it('collectors are reusable', () => {
    const c = groupingBy(first, counting());
    expect(plain(collect(['a'], c))).toEqual({ a: 1 });
    expect(plain(collect(['a', 'b'], c))).toEqual({ a: 1, b: 1 });
  });
  it('characteristics contains(null) is false', () => expect(toList().characteristics().contains(null)).toBe(false));
  it('reference example: optional wrapping with collectingAndThen(maxBy)', () => {
    const r = collect(nums, collectingAndThen(maxBy(natural), (o: Optional<number>) => o.orElse(-1)));
    expect(r).toBe(10);
  });
});

// ---------------------------------------------------------------- null arguments: when the reference checks them

describe('null arguments follow the reference timing', () => {
  it('a null function that never runs is never reported', () => {
    expect(collect([], mapping(null as any, toList())).size()).toBe(0);
    expect(collect([], summingInt(null as any))).toBe(0);
    expect(collect([], groupingBy(null as any)).size()).toBe(0);
    expect(collect([1], reducing(null as any)).get()).toBe(1);
    expect(collect([], toMap(null as any, null as any)).size()).toBe(0);
  });
  it('a null supplier fails even on empty input', () => {
    throwsAtUse(() => toCollection(null as any), []);
    throwsAtUse(() => groupingBy(first, null as any, toList()), []);
    throwsAtUse(() => toMap(first, first, (a) => a, null as any), []);
  });
  it.each([
    ['minBy', () => minBy(null as any), undefined],
    ['maxBy', () => maxBy(null as any), undefined],
    ['collectingAndThen(null, f)', () => collectingAndThen(null as any, (x) => x), undefined],
    ['collectingAndThen(c, null)', () => collectingAndThen(toList(), null as any), undefined],
    ['mapping(f, null)', () => mapping(len, null as any), undefined],
    ['filtering(p, null)', () => filtering(isEven, null as any), undefined],
    ['flatMapping(f, null)', () => flatMapping(() => null, null as any), undefined],
    ['groupingBy(f, null)', () => groupingBy(first, null as any), undefined],
    ['groupingBy(f, m, null)', () => groupingBy(first, () => new HashMap<any, any>(), null as any), undefined],
    ['partitioningBy(p, null)', () => partitioningBy(isEven, null as any), undefined],
    ['toUnmodifiableMap(null, v)', () => toUnmodifiableMap(null as any, first), 'keyMapper'],
    ['toUnmodifiableMap(k, null)', () => toUnmodifiableMap(first, null as any), 'valueMapper'],
    ['toUnmodifiableMap(k, v, null)', () => toUnmodifiableMap(first, first, null as any), 'mergeFunction'],
    ['teeing(null, c, m)', () => teeing(null as any, toList(), () => 0), 'downstream1'],
    ['teeing(c, null, m)', () => teeing(toList(), null as any, () => 0), 'downstream2'],
    ['teeing(c, c, null)', () => teeing(toList(), toList(), null as any), 'merger'],
  ])('%s throws NullPointerException at creation', (_n, fn, message) => {
    expectThrows(fn, 'NullPointerException');
    if (message !== undefined) expect(fn).toThrow(message);
  });
});

describe('teeing checks every downstream function', () => {
  const withNull = (member: 'supplier' | 'accumulator' | 'combiner' | 'finisher'): Collector<any, any, any> => {
    const c = toList();
    return {
      supplier: () => (member === 'supplier' ? null : c.supplier()),
      accumulator: () => (member === 'accumulator' ? null : c.accumulator()),
      combiner: () => (member === 'combiner' ? null : c.combiner()),
      finisher: () => (member === 'finisher' ? null : c.finisher()),
      characteristics: () => c.characteristics(),
    } as unknown as Collector<any, any, any>;
  };
  it.each(['supplier', 'accumulator', 'combiner', 'finisher'] as const)('a null %s is reported with its downstream', (member) => {
    expect(() => teeing(withNull(member), toList(), () => 0)).toThrow(`downstream1 ${member}`);
    expect(() => teeing(toList(), withNull(member), () => 0)).toThrow(`downstream2 ${member}`);
    expectThrows(() => teeing(toList(), withNull(member), () => 0), 'NullPointerException');
  });
  it('downstream1 supplier is checked before downstream2 supplier, suppliers before accumulators', () => {
    expect(() => teeing(withNull('accumulator'), withNull('supplier'), () => 0)).toThrow('downstream2 supplier');
    expect(() => teeing(withNull('supplier'), withNull('supplier'), () => 0)).toThrow('downstream1 supplier');
  });
});

describe('Collector.of characteristics: enum order, deduplicated', () => {
  const fns = [() => new ArrayList<number>(), (l: ArrayList<number>, t: number) => void l.add(t), (a: ArrayList<number>) => a] as const;
  it('without a finisher IDENTITY_FINISH comes last', () => {
    const c = Collector.of(fns[0], fns[1], fns[2], 'UNORDERED', 'UNORDERED');
    expect(String(c.characteristics())).toBe('[UNORDERED, IDENTITY_FINISH]');
    expect(c.characteristics().size()).toBe(2);
  });
  it('with a finisher', () => {
    const c = Collector.of(fns[0], fns[1], fns[2], (a: ArrayList<number>) => a.size(), 'IDENTITY_FINISH', 'CONCURRENT', 'UNORDERED', 'CONCURRENT');
    expect(String(c.characteristics())).toBe('[CONCURRENT, UNORDERED, IDENTITY_FINISH]');
    expect(c.characteristics().toArray()).toEqual(['CONCURRENT', 'UNORDERED', 'IDENTITY_FINISH']);
  });
  it('none / one', () => {
    expect(String(Collector.of(fns[0], fns[1], fns[2], (a: ArrayList<number>) => a).characteristics())).toBe('[]');
    expect(String(Collector.of(fns[0], fns[1], fns[2], 'CONCURRENT').characteristics())).toBe('[CONCURRENT, IDENTITY_FINISH]');
  });
  it('a null characteristic throws NullPointerException', () =>
    expectThrows(() => Collector.of(fns[0], fns[1], fns[2], (a: ArrayList<number>) => a, 'UNORDERED', null as any), 'NullPointerException'));
});
