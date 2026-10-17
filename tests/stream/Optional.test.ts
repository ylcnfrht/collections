import { NoSuchElementException, NullPointerException } from '../../src';
import { Optional, OptionalDouble, OptionalInt, OptionalLong } from '../../src/stream/Optional';

// stream() needs the stream engine; skip those few tests until it exists
let hasEngine = false;
try {
  require('../../src/stream/StreamSupport');
  hasEngine = true;
} catch {
  hasEngine = false;
}
const itEngine = hasEngine ? it : it.skip;

class Boom extends Error {}

describe('Optional', () => {
  it('empty() is a shared empty instance', () => {
    expect(Optional.empty()).toBe(Optional.empty());
    expect(Optional.empty().isPresent()).toBe(false);
    expect(Optional.empty().isEmpty()).toBe(true);
  });

  it('of() holds a value and rejects null/undefined', () => {
    const o = Optional.of('a');
    expect(o.isPresent()).toBe(true);
    expect(o.isEmpty()).toBe(false);
    expect(o.get()).toBe('a');
    expect(() => Optional.of(null)).toThrow(NullPointerException);
    expect(() => Optional.of(undefined)).toThrow(NullPointerException);
    expect(Optional.of(0).get()).toBe(0);
    expect(Optional.of(false).get()).toBe(false);
  });

  it('ofNullable() maps null and undefined to empty', () => {
    expect(Optional.ofNullable(null)).toBe(Optional.empty());
    expect(Optional.ofNullable(undefined)).toBe(Optional.empty());
    expect(Optional.ofNullable(1).get()).toBe(1);
  });

  it('get() and orElseThrow() throw NoSuchElementException "No value present" when empty', () => {
    expect(() => Optional.empty().get()).toThrow(new NoSuchElementException('No value present'));
    expect(() => Optional.empty().orElseThrow()).toThrow(new NoSuchElementException('No value present'));
    expect(Optional.of(1).orElseThrow()).toBe(1);
  });

  it('orElseThrow(supplier) throws what the supplier gives', () => {
    expect(() => Optional.empty().orElseThrow(() => new Boom())).toThrow(Boom);
    expect(Optional.of(2).orElseThrow(() => new Boom())).toBe(2);
    expect(() => Optional.empty().orElseThrow(undefined)).toThrow(NullPointerException);
  });

  it('ifPresent / ifPresentOrElse', () => {
    const seen: unknown[] = [];
    Optional.of(1).ifPresent((v) => seen.push(v));
    Optional.empty().ifPresent((v) => seen.push(v));
    Optional.of(2).ifPresentOrElse(
      (v) => seen.push(v),
      () => seen.push('none')
    );
    Optional.empty().ifPresentOrElse(
      (v) => seen.push(v),
      () => seen.push('none')
    );
    expect(seen).toEqual([1, 2, 'none']);
  });

  it('filter', () => {
    expect(Optional.of(4).filter((x) => x > 3).get()).toBe(4);
    expect(Optional.of(2).filter((x) => x > 3)).toBe(Optional.empty());
    expect(Optional.empty<number>().filter(() => true)).toBe(Optional.empty());
    expect(() => Optional.of(1).filter(null as never)).toThrow(NullPointerException);
    expect(() => Optional.empty().filter(null as never)).toThrow(NullPointerException);
  });

  it('map: a null/undefined result is empty', () => {
    expect(Optional.of(2).map((x) => x * 3).get()).toBe(6);
    expect(Optional.of(2).map(() => null)).toBe(Optional.empty());
    expect(Optional.of(2).map(() => undefined)).toBe(Optional.empty());
    let called = false;
    expect(
      Optional.empty<number>().map(() => {
        called = true;
        return 1;
      })
    ).toBe(Optional.empty());
    expect(called).toBe(false);
    expect(() => Optional.empty().map(null as never)).toThrow(NullPointerException);
  });

  it('flatMap: returns the mapper result; a null result throws', () => {
    expect(Optional.of(2).flatMap((x) => Optional.of(x + 1)).get()).toBe(3);
    expect(Optional.of(2).flatMap(() => Optional.empty())).toBe(Optional.empty());
    expect(Optional.empty<number>().flatMap((x) => Optional.of(x))).toBe(Optional.empty());
    expect(() => Optional.of(2).flatMap(() => null as never)).toThrow(NullPointerException);
    expect(() => Optional.of(2).flatMap(null as never)).toThrow(NullPointerException);
  });

  it('or', () => {
    const a = Optional.of(1);
    expect(a.or(() => Optional.of(2))).toBe(a);
    expect(Optional.empty<number>().or(() => Optional.of(2)).get()).toBe(2);
    expect(() => Optional.empty().or(() => null as never)).toThrow(NullPointerException);
    expect(() => a.or(null as never)).toThrow(NullPointerException);
  });

  it('orElse / orElseGet', () => {
    expect(Optional.of(1).orElse(2)).toBe(1);
    expect(Optional.empty<number>().orElse(2)).toBe(2);
    expect(Optional.empty<number | null>().orElse(null)).toBeNull();
    expect(Optional.of(1).orElseGet(() => 2)).toBe(1);
    expect(Optional.empty<number>().orElseGet(() => 2)).toBe(2);
  });

  it('equals and hashCode follow the value', () => {
    expect(Optional.of('a').equals(Optional.of('a'))).toBe(true);
    expect(Optional.of('a').equals(Optional.of('b'))).toBe(false);
    expect(Optional.of('a').equals(Optional.empty())).toBe(false);
    expect(Optional.empty().equals(Optional.empty())).toBe(true);
    expect(Optional.of('a').equals('a')).toBe(false);
    expect(Optional.of(NaN).equals(Optional.of(NaN))).toBe(true);
    const o = Optional.of(1);
    expect(o.equals(o)).toBe(true);
    // Objects.hashCode of the value: Integer 1, String "a", Double 1.5; empty is 0
    expect(Optional.of(1).hashCode()).toBe(1);
    expect(Optional.of('a').hashCode()).toBe(97);
    expect(Optional.of(1.5).hashCode()).toBe(1073217536);
    expect(Optional.empty().hashCode()).toBe(0);
  });

  it('toString: "Optional[x]" / "Optional.empty"', () => {
    expect(Optional.of('x').toString()).toBe('Optional[x]');
    expect(Optional.of(1).toString()).toBe('Optional[1]');
    expect(Optional.empty().toString()).toBe('Optional.empty');
  });

  itEngine('stream() has the value or nothing', () => {
    expect(Optional.of(1).stream().toList().toArray()).toEqual([1]);
    expect(Optional.empty().stream().count()).toBe(0);
    expect(Optional.of(1).stream().spliterator().characteristics()).toBe(0x4450);
    expect(Optional.empty().stream().spliterator().getExactSizeIfKnown()).toBe(0);
  });
});

describe('OptionalInt / OptionalLong / OptionalDouble', () => {
  const kinds = [
    { name: 'OptionalInt', of: OptionalInt.of, empty: OptionalInt.empty, get: (o: OptionalInt) => o.getAsInt() },
    { name: 'OptionalLong', of: OptionalLong.of, empty: OptionalLong.empty, get: (o: OptionalLong) => o.getAsLong() },
    { name: 'OptionalDouble', of: OptionalDouble.of, empty: OptionalDouble.empty, get: (o: OptionalDouble) => o.getAsDouble() },
  ] as const;

  describe.each(kinds)('$name', (k) => {
    const of = k.of as (v: number) => OptionalInt;
    const empty = k.empty as () => OptionalInt;
    const get = k.get as (o: OptionalInt) => number;

    it('empty() is shared and empty', () => {
      expect(empty()).toBe(empty());
      expect(empty().isPresent()).toBe(false);
      expect(empty().isEmpty()).toBe(true);
      expect(of(3).isPresent()).toBe(true);
      expect(of(3).isEmpty()).toBe(false);
    });

    it('getAs* returns the value or throws NoSuchElementException', () => {
      expect(get(of(3))).toBe(3);
      expect(() => get(empty())).toThrow(new NoSuchElementException('No value present'));
    });

    it('ifPresent / ifPresentOrElse', () => {
      const seen: unknown[] = [];
      of(1).ifPresent((v) => seen.push(v));
      empty().ifPresent((v) => seen.push(v));
      of(2).ifPresentOrElse(
        (v) => seen.push(v),
        () => seen.push('none')
      );
      empty().ifPresentOrElse(
        (v) => seen.push(v),
        () => seen.push('none')
      );
      expect(seen).toEqual([1, 2, 'none']);
    });

    it('orElse / orElseGet / orElseThrow', () => {
      expect(of(1).orElse(9)).toBe(1);
      expect(empty().orElse(9)).toBe(9);
      expect(of(1).orElseGet(() => 9)).toBe(1);
      expect(empty().orElseGet(() => 9)).toBe(9);
      expect(of(1).orElseThrow()).toBe(1);
      expect(() => empty().orElseThrow()).toThrow(NoSuchElementException);
      expect(() => empty().orElseThrow(() => new Boom())).toThrow(Boom);
      expect(of(1).orElseThrow(() => new Boom())).toBe(1);
    });

    it('equals: same kind, same presence, same value', () => {
      expect(of(1).equals(of(1))).toBe(true);
      expect(of(1).equals(of(2))).toBe(false);
      expect(of(1).equals(empty())).toBe(false);
      expect(empty().equals(empty())).toBe(true);
      expect(of(1).equals(1)).toBe(false);
      const o = of(5);
      expect(o.equals(o)).toBe(true);
      for (const other of kinds) if (other.name !== k.name) expect(of(1).equals((other.of as (v: number) => unknown)(1))).toBe(false);
      expect(empty().hashCode()).toBe(0);
    });

    itEngine('stream()', () => {
      expect((of(4).stream() as unknown as { toArray(): number[] }).toArray()).toEqual([4]);
      expect((empty().stream() as unknown as { count(): number }).count()).toBe(0);
    });
  });

  it('toString formats', () => {
    expect(OptionalInt.of(5).toString()).toBe('OptionalInt[5]');
    expect(OptionalInt.empty().toString()).toBe('OptionalInt.empty');
    expect(OptionalLong.of(-7).toString()).toBe('OptionalLong[-7]');
    expect(OptionalLong.empty().toString()).toBe('OptionalLong.empty');
    expect(OptionalDouble.of(1).toString()).toBe('OptionalDouble[1.0]');
    expect(OptionalDouble.of(1e7).toString()).toBe('OptionalDouble[1.0E7]');
    expect(OptionalDouble.of(-0).toString()).toBe('OptionalDouble[-0.0]');
    expect(OptionalDouble.of(NaN).toString()).toBe('OptionalDouble[NaN]');
    expect(OptionalDouble.of(0.5).toString()).toBe('OptionalDouble[0.5]');
    expect(OptionalDouble.empty().toString()).toBe('OptionalDouble.empty');
  });

  it('hashCode: Integer / Long / Double hash of the value (reference values)', () => {
    expect(OptionalInt.of(-1).hashCode()).toBe(-1);
    expect(OptionalInt.of(42).hashCode()).toBe(42);
    expect(OptionalLong.of(-1).hashCode()).toBe(0);
    expect(OptionalLong.of(2 ** 40).hashCode()).toBe(256);
    expect(OptionalLong.of(7).hashCode()).toBe(7);
    expect(OptionalDouble.of(1).hashCode()).toBe(1072693248);
    expect(OptionalDouble.of(1.5).hashCode()).toBe(1073217536);
    expect(OptionalDouble.of(-0).hashCode()).toBe(-2147483648);
    expect(OptionalDouble.of(NaN).hashCode()).toBe(2146959360);
  });

  it('OptionalDouble equality is Double.compare: NaN equals NaN, -0.0 differs from 0.0', () => {
    expect(OptionalDouble.of(NaN).equals(OptionalDouble.of(NaN))).toBe(true);
    expect(OptionalDouble.of(0).equals(OptionalDouble.of(-0))).toBe(false);
    expect(OptionalInt.of(0).equals(OptionalInt.of(-0))).toBe(true);
    expect(OptionalLong.of(0).equals(OptionalLong.of(-0))).toBe(true);
  });
});

describe('null functional arguments: NullPointerException only on the branch used', () => {
  const nul = null as any;
  // [name, present instance, empty instance]
  const kinds: [string, any, any][] = [
    ['Optional', Optional.of(1), Optional.empty()],
    ['OptionalInt', OptionalInt.of(1), OptionalInt.empty()],
    ['OptionalLong', OptionalLong.of(1), OptionalLong.empty()],
    ['OptionalDouble', OptionalDouble.of(1), OptionalDouble.empty()],
  ];
  const noop = () => undefined;

  describe.each(kinds)('%s', (_name, present, empty) => {
    it('ifPresent(null): throws when present, not when empty', () => {
      expect(() => present.ifPresent(nul)).toThrow(NullPointerException);
      expect(() => present.ifPresent(undefined)).toThrow(NullPointerException);
      expect(() => empty.ifPresent(nul)).not.toThrow();
    });
    it('ifPresentOrElse: only the branch taken is checked', () => {
      expect(() => present.ifPresentOrElse(nul, noop)).toThrow(NullPointerException);
      expect(() => present.ifPresentOrElse(noop, nul)).not.toThrow();
      expect(() => empty.ifPresentOrElse(noop, nul)).toThrow(NullPointerException);
      expect(() => empty.ifPresentOrElse(nul, noop)).not.toThrow();
    });
    it('orElseGet(null): value when present, throws when empty', () => {
      expect(present.orElseGet(nul)).toBe(1);
      expect(() => empty.orElseGet(nul)).toThrow(NullPointerException);
    });
    it('orElseThrow(supplier) whose result is null/undefined throws NullPointerException', () => {
      expect(() => empty.orElseThrow(() => null)).toThrow(NullPointerException);
      expect(() => empty.orElseThrow(() => undefined)).toThrow(NullPointerException);
      expect(() => empty.orElseThrow(nul)).toThrow(NullPointerException);
      expect(present.orElseThrow(() => null)).toBe(1);
      expect(present.orElseThrow(nul)).toBe(1);
    });
    it('orElseThrow(supplier) throws the supplied error', () => {
      const e = new Boom();
      expect(() => empty.orElseThrow(() => e)).toThrow(e);
    });
  });
});
