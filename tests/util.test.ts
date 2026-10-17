import { RuntimeException, IndexOutOfBoundsException, NoSuchElementException } from '../src/exceptions';
import { Comparator, naturalCompare, stableSort } from '../src/util/Comparator';
import { equals, hash, hashCode, identityHashCode, requireNonNull, stringHash, toString } from '../src/util/Objects';
import { expectThrows, Point, refStringHash } from './helpers';

describe('Objects.equals', () => {
  it.each([
    [1, 1, true], [1, 2, false], [NaN, NaN, true], [0, -0, true], ['a', 'a', true], ['a', 'b', false],
    [null, null, true], [undefined, undefined, true], [null, undefined, false], [1, '1', false], [true, true, true],
    [10n, 10n, true], [10n, 11n, false],
  ])('equals(%p, %p) = %p', (a, b, r) => expect(equals(a, b)).toBe(r));
  it('uses equals()', () => expect(equals(new Point(1, 2), new Point(1, 2))).toBe(true));
  it('equals() returning a truthy non-boolean is false', () => expect(equals({ equals: () => 1 }, {})).toBe(false));
  it('plain objects by identity', () => {
    const o = {};
    expect([equals(o, o), equals({}, {})]).toEqual([true, false]);
  });
  it('Dates by time', () => expect([equals(new Date(1), new Date(1)), equals(new Date(1), new Date(2)), equals(new Date(1), 1)]).toEqual([true, false, false]));
  it('NaN is not equal to a non-number', () => expect(equals(NaN, 'NaN')).toBe(false));
});

describe('Objects.hashCode', () => {
  it('int32 numbers hash to themselves', () => expect([hashCode(0), hashCode(42), hashCode(-7), hashCode(2147483647)]).toEqual([0, 42, -7, 2147483647]));
  it('-0 hashes like 0', () => expect(hashCode(-0)).toBe(0));
  it('doubles use IEEE bits (1.5 -> 1073217536)', () => expect(hashCode(1.5)).toBe(1073217536));
  it('NaN has one hash', () => expect(hashCode(NaN)).toBe(hashCode(0 / 0)));
  it('large integers fall back to the double hash', () => expect(hashCode(2 ** 40)).toBe(hashCode(2 ** 40)));
  it('strings use the 31-multiplier hash', () => {
    expect(hashCode('hello')).toBe(99162322);
    expect(hashCode('')).toBe(0);
    expect(stringHash('abc')).toBe(refStringHash('abc'));
  });
  it('booleans', () => expect([hashCode(true), hashCode(false)]).toEqual([1231, 1237]));
  it('bigint like a 64-bit long', () => {
    expect(hashCode(5n)).toBe(5);
    expect(hashCode(-1n)).toBe(0);
    expect(hashCode(2n ** 32n)).toBe(1);
  });
  it('null / undefined are 0', () => expect([hashCode(null), hashCode(undefined)]).toEqual([0, 0]));
  it('uses hashCode()', () => expect(hashCode(new Point(1, 2))).toBe(33));
  it('Dates by time', () => expect(hashCode(new Date(5))).toBe(hashCode(new Date(5))));
  it('plain objects: stable identity hash, distinct per object', () => {
    const a = {};
    expect(hashCode(a)).toBe(hashCode(a));
    const hs = new Set(Array.from({ length: 1000 }, () => hashCode({})));
    expect(hs.size).toBeGreaterThan(990);
  });
  it('symbols and functions get identity hashes', () => {
    const s = Symbol('x');
    const f = () => 0;
    expect([hashCode(s) === hashCode(s), hashCode(f) === hashCode(f)]).toEqual([true, true]);
  });
  it('identityHashCode ignores hashCode()', () => {
    const p = new Point(1, 2);
    expect(identityHashCode(p)).toBe(identityHashCode(p));
    expect(identityHashCode(null)).toBe(0);
    expect(identityHashCode(5)).toBe(5);
  });
  it('always a 32-bit int', () => {
    for (const v of [1e300, -1e-300, 'x'.repeat(1000), 2n ** 100n, new Date(), { hashCode: () => 2 ** 40 }]) {
      const h = hashCode(v);
      expect(h | 0).toBe(h);
    }
  });
  it('hash(...values)', () => expect(hash(1, 2)).toBe(31 * (31 + 1) + 2));
});

describe('Objects misc', () => {
  it('requireNonNull', () => {
    expect(requireNonNull(0)).toBe(0);
    expectThrows(() => requireNonNull(null), 'NullPointerException');
    expectThrows(() => requireNonNull(undefined, 'msg'), 'NullPointerException');
  });
  it('toString', () => {
    expect([toString(null), toString(undefined), toString(1), toString(Object.create(null))]).toEqual(['null', 'undefined', '1', '[object Object]']);
  });
});

describe('naturalCompare / Comparator', () => {
  it('numbers', () => expect([naturalCompare(1, 2), naturalCompare(2, 1), naturalCompare(1, 1)]).toEqual([-1, 1, 0]));
  it('NaN sorts last', () => expect([naturalCompare(NaN, 1), naturalCompare(1, NaN), naturalCompare(NaN, NaN)]).toEqual([1, -1, 0]));
  it('-0 equals 0 (consistent with equals)', () => expect(naturalCompare(-0, 0)).toBe(0));
  it('strings by UTF-16 code unit', () => expect([naturalCompare('B', 'a'), naturalCompare('a', 'a')]).toEqual([-1, 0]));
  it('bigint, boolean, Date', () => {
    expect(naturalCompare(1n, 2n)).toBe(-1);
    expect([naturalCompare(false, true), naturalCompare(true, true)]).toEqual([-1, 0]);
    expect(naturalCompare(new Date(2), new Date(1))).toBe(1);
  });
  it('compareTo()', () => expect(naturalCompare(new Point(1, 0), new Point(0, 9))).toBeGreaterThan(0));
  it('null throws NullPointerException', () => {
    expectThrows(() => naturalCompare(null, 1), 'NullPointerException');
    expectThrows(() => naturalCompare(1, undefined), 'NullPointerException');
  });
  it('mixed types / plain objects throw ClassCastException', () => {
    expectThrows(() => naturalCompare(1, 'a'), 'ClassCastException');
    expectThrows(() => naturalCompare({}, {}), 'ClassCastException');
    expectThrows(() => naturalCompare(new Date(), 1), 'ClassCastException');
  });
  it('helpers', () => {
    const byLen = Comparator.comparing((s: string) => s.length);
    const xs = ['ccc', 'a', 'bb', 'aa'];
    expect([...xs].sort(byLen)).toEqual(['a', 'bb', 'aa', 'ccc']);
    expect([...xs].sort(Comparator.thenComparing(byLen, Comparator.naturalOrder()))).toEqual(['a', 'aa', 'bb', 'ccc']);
    expect([...xs].sort(Comparator.reversed(byLen))[0]).toBe('ccc');
    expect([3, 1, 2].sort(Comparator.reverseOrder())).toEqual([3, 2, 1]);
    expect([2, null, 1].sort(Comparator.nullsFirst<number>())).toEqual([null, 1, 2]);
    expect([2, null, 1].sort(Comparator.nullsLast<number>())).toEqual([1, 2, null]);
    expect([3, 1].sort(Comparator.comparing((x: number) => x, (a, b) => b - a))).toEqual([3, 1]);
  });
  it('stableSort is stable and passes undefined to the comparator', () => {
    const a = [{ k: 1, i: 0 }, { k: 0, i: 1 }, { k: 1, i: 2 }];
    expect(stableSort(a, (x, y) => x.k - y.k).map((x) => x.i)).toEqual([1, 0, 2]);
    expectThrows(() => stableSort([1, undefined], null), 'NullPointerException');
  });
});

describe('exceptions', () => {
  it('have stable names and a common base', () => {
    const e = new IndexOutOfBoundsException('x');
    expect([e.name, e.message, e instanceof RuntimeException, e instanceof Error]).toEqual(['IndexOutOfBoundsException', 'x', true, true]);
    expect(new NoSuchElementException().name).toBe('NoSuchElementException');
    expect(String(new NoSuchElementException('m'))).toBe('NoSuchElementException: m');
  });
});
