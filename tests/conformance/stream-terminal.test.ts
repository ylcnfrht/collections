// Conformance: Stream terminal operations.
import { ArrayList, Collectors, Comparator, List, Optional, Stream } from '../../src';
import { expectThrows } from '../helpers';

const NPE = 'NullPointerException';
const UOE = 'UnsupportedOperationException';

describe('forEach / forEachOrdered', () => {
  it('forEach visits every element', () => {
    const out: number[] = [];
    Stream.of(1, 2, 3).forEach((x) => out.push(x));
    expect(out.sort()).toEqual([1, 2, 3]);
  });
  it('forEach on a sequential ordered stream follows encounter order', () => {
    const out: string[] = [];
    Stream.of('a', 'b', 'c').forEach((x) => out.push(x));
    expect(out).toEqual(['a', 'b', 'c']);
  });
  // "Performs an action for each element of this stream, in the encounter order of the stream if the stream has a defined encounter order."
  it('forEachOrdered follows encounter order even for a parallel stream', () => {
    const out: number[] = [];
    Stream.of(5, 4, 3, 2, 1).parallel().forEachOrdered((x) => out.push(x));
    expect(out).toEqual([5, 4, 3, 2, 1]);
  });
  it('forEach on empty never calls the action', () => {
    let n = 0;
    Stream.empty().forEach(() => n++);
    expect(n).toBe(0);
  });
  it('package example: side-effecting forEach vs toList give the same elements', () => {
    const results = new ArrayList<string>();
    Stream.of('ab', 'x', 'ac').filter((s) => s.startsWith('a')).forEach((s) => results.add(s));
    const viaToList = Stream.of('ab', 'x', 'ac').filter((s) => s.startsWith('a')).toList();
    expect(results.toArray()).toEqual(viaToList.toArray());
  });
});

describe('toArray', () => {
  it('returns the elements in order', () => expect(Stream.of(3, 1, 2).toArray()).toEqual([3, 1, 2]));
  it('empty stream gives []', () => expect(Stream.empty().toArray()).toEqual([]));
  it('keeps nulls', () => expect(Stream.of<number | null>(null, 1).toArray()).toEqual([null, 1]));
  it('returns a fresh, independent array', () => {
    const a = Stream.of(1, 2).toArray();
    a.push(3);
    expect(a).toEqual([1, 2, 3]);
  });
  // "generator - a function which produces a new array of the desired type and the provided length"
  it('toArray(generator) returns the generated array, filled', () => {
    const made: number[][] = [];
    const r = Stream.of(1, 2, 3).toArray((n) => {
      const a = new Array<number>(n);
      made.push(a);
      return a;
    });
    expect(r).toEqual([1, 2, 3]);
    expect(made).toContain(r);
  });
  it('toArray(generator) asks for the exact length', () => {
    const lengths: number[] = [];
    const r = Stream.of(1, 2, 3, 4)
      .filter((x) => x % 2 === 0)
      .toArray((n) => {
        lengths.push(n);
        return new Array<number>(n);
      });
    expect(r).toEqual([2, 4]);
    expect(lengths[lengths.length - 1]).toBe(2);
  });
  it('toArray(generator) into a typed array', () => {
    const r = Stream.of(1.5, 2.5).toArray((n) => new Float64Array(n));
    expect(r).toBeInstanceOf(Float64Array);
    expect(Array.from(r)).toEqual([1.5, 2.5]);
  });
  // doc example: people.stream().filter(p -> p.getGender() == MALE).toArray(Person[]::new)
  it('doc example: filter then toArray(generator)', () => {
    const people = List.of({ n: 'a', male: true }, { n: 'b', male: false }, { n: 'c', male: true });
    expect(people.stream().filter((p) => p.male).toArray((n) => new Array(n)).map((p) => p.n)).toEqual(['a', 'c']);
  });
});

describe('reduce', () => {
  // doc example: Integer sum = integers.reduce(0, (a, b) -> a+b);
  it('reduce(identity, op) sums', () => expect(Stream.of(1, 2, 3, 4).reduce(0, (a, b) => a + b)).toBe(10));
  it('reduce(identity, op) on empty returns identity', () => expect(Stream.empty<number>().reduce(42, (a, b) => a + b)).toBe(42));
  it('reduce(identity, op) folds left to right', () => expect(Stream.of('a', 'b', 'c').reduce('', (a, b) => a + b)).toBe('abc'));
  it('reduce(op) returns Optional of the result', () => expect(Stream.of(1, 2, 3).reduce((a, b) => a * b).get()).toBe(6));
  it('reduce(op) on empty is Optional.empty', () => expect(Stream.empty<number>().reduce((a, b) => a + b).isPresent()).toBe(false));
  it('reduce(op) with one element does not call op', () => {
    let calls = 0;
    expect(Stream.of(7).reduce((a, b) => (calls++, a + b)).get()).toBe(7);
    expect(calls).toBe(0);
  });
  // "NullPointerException - if the result of the reduction is null"
  it('reduce(op) with a null result throws NullPointerException', () =>
    expectThrows(() => Stream.of<string | null>('a', 'b').reduce(() => null), NPE));
  it('reduce(op) with a single null element throws NullPointerException', () => expectThrows(() => Stream.of(null).reduce((a) => a), NPE));
  it('reduce(op) max', () => expect(Stream.of(3, 9, 2).reduce((a, b) => Math.max(a, b)).get()).toBe(9));
  // package example: widgets.stream().reduce(0, (sum, b) -> sum + b.getWeight(), Integer::sum)
  it('reduce(identity, accumulator, combiner) maps while reducing', () => {
    const widgets = List.of({ w: 3 }, { w: 4 }, { w: 5 });
    expect(widgets.stream().reduce(0, (sum, b) => sum + b.w, (a, b) => a + b)).toBe(12);
  });
  it('3-arg reduce on empty returns identity', () => expect(Stream.empty<string>().reduce(0, (n, s) => n + s.length, (a, b) => a + b)).toBe(0));
  it('3-arg reduce on a parallel stream gives the same result', () =>
    expect(Stream.of('aa', 'b', 'cccc').parallel().reduce(0, (n, s) => n + s.length, (a, b) => a + b)).toBe(7));
  it('3-arg reduce result type differs from element type', () =>
    expect(Stream.of(1, 2).reduce('', (s, n) => s + n, (a, b) => a + b)).toBe('12'));
  it('package example: parallel sum via reduce(0, Integer::sum)', () =>
    expect(List.of(1, 2, 3, 4, 5).parallelStream().reduce(0, (a, b) => a + b)).toBe(15));
});

describe('collect', () => {
  // doc example: stringStream.collect(ArrayList::new, ArrayList::add, ArrayList::addAll)
  it('collect(supplier, accumulator, combiner) into an ArrayList', () => {
    const l = Stream.of('a', 'b').collect(
      () => new ArrayList<string>(),
      (c, x) => c.add(x),
      (a, b) => a.addAll(b),
    );
    expect(l).toBeInstanceOf(ArrayList);
    expect(l.toArray()).toEqual(['a', 'b']);
  });
  // doc example: stringStream.collect(StringBuilder::new, StringBuilder::append, StringBuilder::append).toString()
  it('collect into a string builder', () => {
    const sb = Stream.of('x', 'y', 'z').collect(
      () => [] as string[],
      (b, s) => b.push(s),
      (a, b) => a.push(...b),
    );
    expect(sb.join('')).toBe('xyz');
  });
  it('3-arg collect on empty returns the supplied container', () => {
    const c = Stream.empty<number>().collect(
      () => [] as number[],
      (a, x) => a.push(x),
      (a, b) => a.push(...b),
    );
    expect(c).toEqual([]);
  });
  it('3-arg collect on a parallel stream keeps order', () => {
    const c = Stream.of(1, 2, 3, 4, 5, 6)
      .parallel()
      .collect(
        () => [] as number[],
        (a, x) => a.push(x),
        (a, b) => a.push(...b),
      );
    expect(c).toEqual([1, 2, 3, 4, 5, 6]);
  });
  // package example: stream.collect(() -> new ArrayList<>(), (c, e) -> c.add(e.toString()), (c1, c2) -> c1.addAll(c2))
  it('package example: toString of every element', () => {
    const strings = Stream.of(1, 2).collect(
      () => new ArrayList<string>(),
      (c, e) => c.add(String(e)),
      (c1, c2) => c1.addAll(c2),
    );
    expect(strings.toArray()).toEqual(['1', '2']);
  });
  it('collect(Collector) with toList', () => expect(Stream.of(1, 2).collect(Collectors.toList()).toArray()).toEqual([1, 2]));
});

describe('toList', () => {
  it('returns the elements in encounter order', () => expect(Stream.of(3, 1).toList().toArray()).toEqual([3, 1]));
  // "The returned List is unmodifiable; calls to any mutator method will always cause UnsupportedOperationException to be thrown."
  it('add throws UnsupportedOperationException', () => expectThrows(() => Stream.of(1).toList().add(2), UOE));
  it('set throws UnsupportedOperationException', () => expectThrows(() => Stream.of(1).toList().set(0, 2), UOE));
  it('remove throws UnsupportedOperationException', () => expectThrows(() => Stream.of(1).toList().remove(0), UOE));
  it('clear throws UnsupportedOperationException', () => expectThrows(() => Stream.of(1).toList().clear(), UOE));
  it('empty stream gives an empty list', () => expect(Stream.empty().toList().size()).toBe(0));
  // library: "unlike List.of it allows null elements" (API note: equivalent to unmodifiableList(new ArrayList<>(Arrays.asList(toArray()))))
  it('allows null elements', () => {
    const l = Stream.of<string | null>('a', null).toList();
    expect(l.size()).toBe(2);
    expect(l.get(1)).toBeNull();
  });
  it('contains(null) is allowed on the result', () => expect(Stream.of<string | null>(null).toList().contains(null)).toBe(true));
  it('equals a list with the same elements', () => expect(Stream.of(1, 2).toList().equals(List.of(1, 2))).toBe(true));
  it('toString like other lists', () => expect(Stream.of(1, 2).toList().toString()).toBe('[1, 2]'));
});

describe('min / max', () => {
  const cmp = (a: number, b: number) => a - b;
  it('min', () => expect(Stream.of(3, 1, 2).min(cmp).get()).toBe(1));
  it('max', () => expect(Stream.of(3, 1, 2).max(cmp).get()).toBe(3));
  it('min on empty is Optional.empty', () => expect(Stream.empty<number>().min(cmp).isEmpty()).toBe(true));
  it('max on empty is Optional.empty', () => expect(Stream.empty<number>().max(cmp).isEmpty()).toBe(true));
  it('min with natural order comparator over strings', () => expect(Stream.of('b', 'a', 'c').min(Comparator.naturalOrder()).get()).toBe('a'));
  it('max with a key comparator', () =>
    expect(Stream.of('aa', 'b', 'cccc', 'dd').max(Comparator.comparingInt((s: string) => s.length)).get()).toBe('cccc'));
  // "NullPointerException - if the minimum element is null"
  it('min selecting null throws NullPointerException', () =>
    expectThrows(() => Stream.of<string | null>('a', null).min(Comparator.nullsFirst<string>()), NPE));
  it('max selecting null throws NullPointerException', () =>
    expectThrows(() => Stream.of<string | null>('a', null).max(Comparator.nullsLast<string>()), NPE));
});

describe('count', () => {
  it('counts the elements', () => expect(Stream.of(1, 2, 3).count()).toBe(3));
  it('counts after filter', () => expect(Stream.of(1, 2, 3).filter((x) => x > 1).count()).toBe(2));
  it('counts after flatMap', () => expect(Stream.of(1, 2).flatMap((x) => Stream.of(x, x)).count()).toBe(4));
  it('empty is 0', () => expect(Stream.empty().count()).toBe(0));
  // doc example: List.of("A","B","C","D").stream().peek(System.out::println).count() — count is 4;
  // "An implementation may choose to not execute the stream pipeline" so peek calls are not asserted.
  it('doc example: count of a SIZED list source with peek is the list size', () =>
    expect(List.of('A', 'B', 'C', 'D').stream().peek(() => {}).count()).toBe(4));
  it('count over a limited infinite stream', () => expect(Stream.iterate(0, (x) => x + 1).limit(7).count()).toBe(7));
  it('count of a SIZED source with skip', () => expect(List.of(1, 2, 3, 4, 5).stream().skip(2).count()).toBe(3));
});

describe('anyMatch / allMatch / noneMatch', () => {
  it('anyMatch true', () => expect(Stream.of(1, 2, 3).anyMatch((x) => x === 2)).toBe(true));
  it('anyMatch false', () => expect(Stream.of(1, 2, 3).anyMatch((x) => x === 9)).toBe(false));
  it('allMatch true', () => expect(Stream.of(2, 4).allMatch((x) => x % 2 === 0)).toBe(true));
  it('allMatch false', () => expect(Stream.of(2, 3).allMatch((x) => x % 2 === 0)).toBe(false));
  it('noneMatch true', () => expect(Stream.of(1, 3).noneMatch((x) => x % 2 === 0)).toBe(true));
  it('noneMatch false', () => expect(Stream.of(1, 2).noneMatch((x) => x % 2 === 0)).toBe(false));
  // "If the stream is empty then false is returned and the predicate is not evaluated."
  it('anyMatch on empty is false without evaluating the predicate', () => {
    let calls = 0;
    expect(Stream.empty().anyMatch(() => (calls++, true))).toBe(false);
    expect(calls).toBe(0);
  });
  // "If the stream is empty then true is returned and the predicate is not evaluated."
  it('allMatch on empty is true without evaluating the predicate', () => {
    let calls = 0;
    expect(Stream.empty().allMatch(() => (calls++, false))).toBe(true);
    expect(calls).toBe(0);
  });
  it('noneMatch on empty is true without evaluating the predicate', () => {
    let calls = 0;
    expect(Stream.empty().noneMatch(() => (calls++, true))).toBe(true);
    expect(calls).toBe(0);
  });
  // short-circuiting terminal operations terminate on infinite input
  it('anyMatch terminates on an infinite stream', () => expect(Stream.iterate(0, (x) => x + 1).anyMatch((x) => x > 100)).toBe(true));
  it('allMatch terminates on an infinite stream once false', () => expect(Stream.iterate(0, (x) => x + 1).allMatch((x) => x < 100)).toBe(false));
  it('noneMatch terminates on an infinite stream once matched', () =>
    expect(Stream.generate(() => 5).noneMatch((x) => x === 5)).toBe(false));
  it('anyMatch stops evaluating after the first match (sequential)', () => {
    const seen: number[] = [];
    Stream.of(1, 2, 3, 4).anyMatch((x) => (seen.push(x), x === 2));
    expect(seen).toEqual([1, 2]);
  });
  it('allMatch stops at the first failure (sequential)', () => {
    const seen: number[] = [];
    Stream.of(1, 2, 3, 4).allMatch((x) => (seen.push(x), x < 2));
    expect(seen).toEqual([1, 2]);
  });
});

describe('findFirst / findAny', () => {
  it('findFirst returns the first element', () => expect(Stream.of(4, 5, 6).findFirst().get()).toBe(4));
  it('findFirst on empty is Optional.empty', () => expect(Stream.empty().findFirst().equals(Optional.empty())).toBe(true));
  it('findFirst after filter', () => expect(Stream.of(1, 2, 3, 4).filter((x) => x > 2).findFirst().get()).toBe(3));
  // "NullPointerException - if the element selected is null"
  it('findFirst on a null first element throws NullPointerException', () => expectThrows(() => Stream.of(null, 'a').findFirst(), NPE));
  it('findFirst on a later null is fine', () => expect(Stream.of('a', null).findFirst().get()).toBe('a'));
  it('findFirst on a parallel ordered stream is still the first', () => expect(Stream.of(9, 8, 7).parallel().findFirst().get()).toBe(9));
  it('findFirst terminates on an infinite stream', () => expect(Stream.iterate(1, (x) => x + 1).filter((x) => x % 17 === 0).findFirst().get()).toBe(17));
  // "it is free to select any element in the stream"
  it('findAny returns some element of the stream', () => expect([1, 2, 3]).toContain(Stream.of(1, 2, 3).findAny().get()));
  it('findAny on empty is Optional.empty', () => expect(Stream.empty().findAny().isPresent()).toBe(false));
  it('findAny selecting null throws NullPointerException', () => expectThrows(() => Stream.of(null).findAny(), NPE));
  it('findFirst returns an Optional', () => expect(Stream.of('q').findFirst()).toBeInstanceOf(Optional));
  // Optional class doc: names.stream().filter(...).findFirst().map(...)
  it('Optional doc example: findFirst then map', () =>
    expect(Stream.of('done', 'todo').filter((n) => n !== 'done').findFirst().map((n) => n.toUpperCase()).get()).toBe('TODO'));
});
