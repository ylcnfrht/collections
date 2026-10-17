// Conformance: Optional, OptionalInt, OptionalLong, OptionalDouble.
import { Optional, OptionalDouble, OptionalInt, OptionalLong, Stream } from '../../src';
import { expectThrows, Point } from '../helpers';

const NPE = 'NullPointerException';
const NSEE = 'NoSuchElementException';

describe('Optional', () => {
  describe('factories', () => {
    it('of(value) is present', () => expect(Optional.of(1).isPresent()).toBe(true));
    // of: "NullPointerException - if value is null"
    it('of(null) throws NullPointerException', () => expectThrows(() => Optional.of(null), NPE));
    it('of(undefined) throws NullPointerException', () => expectThrows(() => Optional.of(undefined), NPE));
    it('ofNullable(value) is present', () => expect(Optional.ofNullable('x').get()).toBe('x'));
    it('ofNullable(null) is empty', () => expect(Optional.ofNullable(null).isEmpty()).toBe(true));
    it('ofNullable(undefined) is empty', () => expect(Optional.ofNullable(undefined).isPresent()).toBe(false));
    it('empty() is empty', () => expect(Optional.empty().isPresent()).toBe(false));
    it('of keeps falsy non-null values', () => {
      expect(Optional.of(0).get()).toBe(0);
      expect(Optional.of('').get()).toBe('');
      expect(Optional.of(false).get()).toBe(false);
    });
  });

  describe('get / isPresent / isEmpty', () => {
    it('get returns the value', () => expect(Optional.of('v').get()).toBe('v'));
    // get: "NoSuchElementException - if no value is present"
    it('get on empty throws NoSuchElementException', () => expectThrows(() => Optional.empty().get(), NSEE));
    it('isEmpty is the negation of isPresent', () => {
      expect(Optional.of(1).isEmpty()).toBe(false);
      expect(Optional.empty().isEmpty()).toBe(true);
    });
  });

  describe('ifPresent / ifPresentOrElse', () => {
    it('ifPresent runs the action with the value', () => {
      const seen: number[] = [];
      Optional.of(3).ifPresent((v) => seen.push(v));
      expect(seen).toEqual([3]);
    });
    it('ifPresent does nothing when empty', () => {
      let n = 0;
      Optional.empty().ifPresent(() => n++);
      expect(n).toBe(0);
    });
    it('ifPresentOrElse runs the action when present', () => {
      const log: string[] = [];
      Optional.of('a').ifPresentOrElse((v) => log.push(v), () => log.push('empty'));
      expect(log).toEqual(['a']);
    });
    it('ifPresentOrElse runs the empty action when empty', () => {
      const log: string[] = [];
      Optional.empty<string>().ifPresentOrElse((v) => log.push(v), () => log.push('empty'));
      expect(log).toEqual(['empty']);
    });
  });

  describe('filter / map / flatMap / or', () => {
    it('filter keeps a matching value', () => expect(Optional.of(4).filter((x) => x > 3).get()).toBe(4));
    it('filter empties a non-matching value', () => expect(Optional.of(2).filter((x) => x > 3).isPresent()).toBe(false));
    it('filter on empty does not call the predicate', () => {
      let n = 0;
      expect(Optional.empty<number>().filter(() => (n++, true)).isPresent()).toBe(false);
      expect(n).toBe(0);
    });
    it('map applies the mapper', () => expect(Optional.of(2).map((x) => x * 5).get()).toBe(10));
    // map: "If a value is present, returns an Optional describing (as if by ofNullable) the result of applying the given mapping function"
    it('map to null gives empty', () => expect(Optional.of(2).map(() => null).isPresent()).toBe(false));
    it('map on empty does not call the mapper', () => {
      let n = 0;
      Optional.empty<number>().map((x) => (n++, x));
      expect(n).toBe(0);
    });
    it('flatMap returns the mapper result', () => expect(Optional.of(2).flatMap((x) => Optional.of(x + 1)).get()).toBe(3));
    it('flatMap may return empty', () => expect(Optional.of(2).flatMap(() => Optional.empty()).isPresent()).toBe(false));
    // flatMap: "NullPointerException - if the mapping function is null or returns a null result"
    it('flatMap returning null throws NullPointerException', () => expectThrows(() => Optional.of(1).flatMap(() => null as any), NPE));
    it('flatMap on empty is empty', () => expect(Optional.empty<number>().flatMap((x) => Optional.of(x)).isPresent()).toBe(false));
    it('or returns this when present', () => {
      const o = Optional.of(1);
      expect(o.or(() => Optional.of(2))).toBe(o);
    });
    it('or returns the supplied Optional when empty', () => expect(Optional.empty<number>().or(() => Optional.of(2)).get()).toBe(2));
    // or: "NullPointerException - if the supplying function is null or produces a null result"
    it('or with a supplier returning null throws NullPointerException', () => expectThrows(() => Optional.empty().or(() => null as any), NPE));
    // Optional class doc example: findFirst().flatMap(name -> Optional.of(...))
    it('doc example: findFirst then flatMap', () =>
      expect(Stream.of('a.txt', 'b.txt').filter((n) => n.startsWith('b')).findFirst().flatMap((n) => Optional.of(n.length)).get()).toBe(5));
  });

  describe('stream', () => {
    it('present gives a one-element stream', () => expect(Optional.of(5).stream().toArray()).toEqual([5]));
    it('empty gives an empty stream', () => expect(Optional.empty().stream().count()).toBe(0));
    // stream() API note: Stream<Optional<T>> os = ..; Stream<T> s = os.flatMap(Optional::stream)
    it('doc example: flatMap(Optional::stream)', () =>
      expect(Stream.of(Optional.of('a'), Optional.empty<string>(), Optional.of('b')).flatMap((o) => o.stream()).toArray()).toEqual(['a', 'b']));
  });

  describe('orElse / orElseGet / orElseThrow', () => {
    it('orElse returns the value when present', () => expect(Optional.of(1).orElse(2)).toBe(1));
    it('orElse returns other when empty', () => expect(Optional.empty<number>().orElse(2)).toBe(2));
    it('orElse may return null', () => expect(Optional.empty<string | null>().orElse(null)).toBeNull());
    it('orElseGet calls the supplier only when empty', () => {
      let n = 0;
      expect(Optional.of(1).orElseGet(() => (n++, 2))).toBe(1);
      expect(Optional.empty<number>().orElseGet(() => (n++, 3))).toBe(3);
      expect(n).toBe(1);
    });
    it('orElseThrow() returns the value when present', () => expect(Optional.of('v').orElseThrow()).toBe('v'));
    // orElseThrow(): "NoSuchElementException - if no value is present"
    it('orElseThrow() on empty throws NoSuchElementException', () => expectThrows(() => Optional.empty().orElseThrow(), NSEE));
    it('orElseThrow(supplier) throws the supplied exception', () => {
      const err = new RangeError('custom');
      expect(() => Optional.empty().orElseThrow(() => err)).toThrow(err);
    });
    it('orElseThrow(supplier) does not call the supplier when present', () => {
      let n = 0;
      expect(Optional.of(1).orElseThrow(() => (n++, new Error()))).toBe(1);
      expect(n).toBe(0);
    });
  });

  describe('equals / hashCode / toString', () => {
    // equals: "both instances have no value present or; the present values are "equal to" each other via equals()"
    it('equal values are equal', () => expect(Optional.of(new Point(1, 2)).equals(Optional.of(new Point(1, 2)))).toBe(true));
    it('different values are not equal', () => expect(Optional.of(1).equals(Optional.of(2))).toBe(false));
    it('empties are equal', () => expect(Optional.empty().equals(Optional.ofNullable(null))).toBe(true));
    it('empty is not equal to present', () => expect(Optional.empty().equals(Optional.of(1))).toBe(false));
    it('not equal to the bare value', () => expect(Optional.of(1).equals(1)).toBe(false));
    // hashCode: "hash code of the value, if present, otherwise 0 (zero) if no value is present."
    it('hashCode of empty is 0', () => expect(Optional.empty().hashCode()).toBe(0));
    it('hashCode of present is the value hash', () => expect(Optional.of(new Point(1, 2)).hashCode()).toBe(new Point(1, 2).hashCode()));
    it('toString of present', () => expect(Optional.of('x').toString()).toBe('Optional[x]'));
    it('toString of present number', () => expect(Optional.of(42).toString()).toBe('Optional[42]'));
    it('toString of present object uses its toString', () => expect(Optional.of(new Point(1, 2)).toString()).toBe('Optional[(1,2)]'));
    it('toString of empty', () => expect(Optional.empty().toString()).toBe('Optional.empty'));
  });
});

describe('OptionalInt', () => {
  it('of / getAsInt', () => expect(OptionalInt.of(5).getAsInt()).toBe(5));
  it('empty getAsInt throws NoSuchElementException', () => expectThrows(() => OptionalInt.empty().getAsInt(), NSEE));
  it('isPresent / isEmpty', () => {
    expect(OptionalInt.of(0).isPresent()).toBe(true);
    expect(OptionalInt.empty().isEmpty()).toBe(true);
  });
  it('ifPresent / ifPresentOrElse', () => {
    const log: string[] = [];
    OptionalInt.of(1).ifPresent((v) => log.push('p' + v));
    OptionalInt.empty().ifPresentOrElse((v) => log.push('p' + v), () => log.push('e'));
    expect(log).toEqual(['p1', 'e']);
  });
  it('orElse / orElseGet', () => {
    expect(OptionalInt.empty().orElse(7)).toBe(7);
    expect(OptionalInt.of(1).orElse(7)).toBe(1);
    expect(OptionalInt.empty().orElseGet(() => 8)).toBe(8);
  });
  it('orElseThrow', () => {
    expect(OptionalInt.of(3).orElseThrow()).toBe(3);
    expectThrows(() => OptionalInt.empty().orElseThrow(), NSEE);
  });
  it('orElseThrow(supplier)', () => {
    const err = new Error('x');
    expect(() => OptionalInt.empty().orElseThrow(() => err)).toThrow(err);
  });
  it('stream', () => {
    expect(OptionalInt.of(4).stream().sum()).toBe(4);
    expect(OptionalInt.empty().stream().count()).toBe(0);
  });
  it('equals', () => {
    expect(OptionalInt.of(1).equals(OptionalInt.of(1))).toBe(true);
    expect(OptionalInt.of(1).equals(OptionalInt.of(2))).toBe(false);
    expect(OptionalInt.empty().equals(OptionalInt.empty())).toBe(true);
    expect(OptionalInt.of(1).equals(OptionalLong.of(1))).toBe(false);
  });
  it('hashCode of empty is 0', () => expect(OptionalInt.empty().hashCode()).toBe(0));
  it('hashCode of a present int is the int itself', () => expect(OptionalInt.of(42).hashCode()).toBe(42));
  it('toString', () => {
    expect(OptionalInt.of(5).toString()).toBe('OptionalInt[5]');
    expect(OptionalInt.of(-3).toString()).toBe('OptionalInt[-3]');
    expect(OptionalInt.empty().toString()).toBe('OptionalInt.empty');
  });
});

describe('OptionalLong', () => {
  it('of / getAsLong', () => expect(OptionalLong.of(4294967296).getAsLong()).toBe(4294967296));
  it('empty getAsLong throws NoSuchElementException', () => expectThrows(() => OptionalLong.empty().getAsLong(), NSEE));
  it('orElse / orElseThrow', () => {
    expect(OptionalLong.empty().orElse(-1)).toBe(-1);
    expectThrows(() => OptionalLong.empty().orElseThrow(), NSEE);
  });
  it('stream', () => expect(OptionalLong.of(9).stream().toArray()).toEqual([9]));
  it('equals', () => {
    expect(OptionalLong.of(9).equals(OptionalLong.of(9))).toBe(true);
    expect(OptionalLong.empty().equals(OptionalLong.of(0))).toBe(false);
  });
  it('toString', () => {
    expect(OptionalLong.of(10).toString()).toBe('OptionalLong[10]');
    expect(OptionalLong.empty().toString()).toBe('OptionalLong.empty');
  });
});

describe('OptionalDouble', () => {
  it('of / getAsDouble', () => expect(OptionalDouble.of(1.5).getAsDouble()).toBe(1.5));
  it('empty getAsDouble throws NoSuchElementException', () => expectThrows(() => OptionalDouble.empty().getAsDouble(), NSEE));
  it('orElse / orElseGet', () => {
    expect(OptionalDouble.empty().orElse(0.5)).toBe(0.5);
    expect(OptionalDouble.empty().orElseGet(() => 2.5)).toBe(2.5);
  });
  it('stream', () => expect(OptionalDouble.of(0.25).stream().toArray()).toEqual([0.25]));
  // equals: "values are considered equal if, according to Double.compare(double, double), the values are equal" (NaN equals NaN; -0.0 differs from 0.0)
  it('NaN equals NaN', () => expect(OptionalDouble.of(NaN).equals(OptionalDouble.of(NaN))).toBe(true));
  it('0.0 does not equal -0.0', () => expect(OptionalDouble.of(0).equals(OptionalDouble.of(-0))).toBe(false));
  it('equal values are equal', () => expect(OptionalDouble.of(1.5).equals(OptionalDouble.of(1.5))).toBe(true));
  it('toString', () => {
    expect(OptionalDouble.of(1).toString()).toBe('OptionalDouble[1.0]');
    expect(OptionalDouble.of(2.5).toString()).toBe('OptionalDouble[2.5]');
    expect(OptionalDouble.of(NaN).toString()).toBe('OptionalDouble[NaN]');
    expect(OptionalDouble.empty().toString()).toBe('OptionalDouble.empty');
  });
  it('average of IntStream is an OptionalDouble that prints with a decimal point', () =>
    expect(Stream.of(1, 2, 3).mapToInt((x) => x).average().toString()).toBe('OptionalDouble[2.0]'));
});
