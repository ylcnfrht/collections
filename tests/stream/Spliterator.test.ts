import {
  ArrayIndexOutOfBoundsException,
  ArrayList,
  IllegalStateException,
  NoSuchElementException,
  NullPointerException,
  UnsupportedOperationException,
} from '../../src';
import { BaseSpliterator, Spliterator } from '../../src/stream/Spliterator';
import { Spliterators } from '../../src/stream/Spliterators';

const all = <T>(s: Spliterator<T>): T[] => {
  const out: T[] = [];
  s.forEachRemaining((x) => out.push(x));
  return out;
};
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const SIZED_SUB = Spliterator.SIZED | Spliterator.SUBSIZED;

/** Counts up to n through tryAdvance only. */
class Counter extends Spliterators.AbstractSpliterator<number> {
  private i = 0;
  constructor(private readonly n: number, est: number, chars: number) {
    super(est, chars);
  }
  tryAdvance(action: (t: number) => void): boolean {
    if (this.i >= this.n) return false;
    action(this.i++);
    return true;
  }
}

describe('Spliterator flags', () => {
  it('use the reference bit values', () => {
    expect(Spliterator).toEqual({
      DISTINCT: 0x1,
      SORTED: 0x4,
      ORDERED: 0x10,
      SIZED: 0x40,
      NONNULL: 0x100,
      IMMUTABLE: 0x400,
      CONCURRENT: 0x1000,
      SUBSIZED: 0x4000,
    });
  });
});

describe('BaseSpliterator defaults', () => {
  class One extends BaseSpliterator<string> {
    done = false;
    constructor(private readonly chars: number) {
      super();
    }
    tryAdvance(action: (t: string) => void): boolean {
      if (this.done) return false;
      this.done = true;
      action('x');
      return true;
    }
    estimateSize(): number {
      return this.done ? 0 : 1;
    }
    characteristics(): number {
      return this.chars;
    }
  }
  it('forEachRemaining loops tryAdvance; trySplit is null', () => {
    const s = new One(Spliterator.SIZED);
    expect(s.trySplit()).toBeNull();
    expect(all(s)).toEqual(['x']);
    expect(() => s.forEachRemaining(null as never)).toThrow(NullPointerException);
  });
  it('getExactSizeIfKnown is -1 unless SIZED', () => {
    expect(new One(Spliterator.SIZED).getExactSizeIfKnown()).toBe(1);
    expect(new One(0).getExactSizeIfKnown()).toBe(-1);
  });
  it('hasCharacteristics needs every bit', () => {
    const s = new One(Spliterator.SIZED | Spliterator.ORDERED);
    expect(s.hasCharacteristics(Spliterator.SIZED)).toBe(true);
    expect(s.hasCharacteristics(Spliterator.SIZED | Spliterator.ORDERED)).toBe(true);
    expect(s.hasCharacteristics(Spliterator.SIZED | Spliterator.DISTINCT)).toBe(false);
  });
  it('getComparator: null if SORTED, else IllegalStateException', () => {
    expect(new One(Spliterator.SORTED).getComparator()).toBeNull();
    expect(() => new One(0).getComparator()).toThrow(IllegalStateException);
  });
});

describe('Spliterators.spliterator(array, characteristics)', () => {
  it('is SIZED|SUBSIZED plus the given flags and traverses the array', () => {
    const s = Spliterators.spliterator([1, 2, 3], Spliterator.ORDERED);
    expect(s.characteristics()).toBe(SIZED_SUB | Spliterator.ORDERED);
    expect(s.estimateSize()).toBe(3);
    expect(s.getExactSizeIfKnown()).toBe(3);
    expect(all(s)).toEqual([1, 2, 3]);
    expect(s.estimateSize()).toBe(0);
    expect(s.tryAdvance(() => undefined)).toBe(false);
  });
  it('splits in halves, prefix first', () => {
    const s = Spliterators.spliterator(range(5), 0);
    const p = s.trySplit()!;
    expect(p.estimateSize()).toBe(2);
    expect(s.estimateSize()).toBe(3);
    expect(all(p)).toEqual([0, 1]);
    const out: number[] = [];
    while (s.tryAdvance((x) => out.push(x)));
    expect(out).toEqual([2, 3, 4]);
    expect(Spliterators.spliterator([1], 0).trySplit()).toBeNull();
  });
  it('works on any array-like', () => {
    expect(all(Spliterators.spliterator(new Float64Array([1.5, 2.5]), 0))).toEqual([1.5, 2.5]);
    expect(all(Spliterators.spliterator('ab' as unknown as ArrayLike<string>, 0))).toEqual(['a', 'b']);
  });
  it('getComparator: null when SORTED is given, else IllegalStateException', () => {
    expect(Spliterators.spliterator([1, 2], Spliterator.SORTED).getComparator()).toBeNull();
    expect(() => Spliterators.spliterator([1, 2], 0).getComparator()).toThrow(IllegalStateException);
  });
  it('rejects null arrays and actions', () => {
    expect(() => Spliterators.spliterator(null as unknown as number[], 0)).toThrow(NullPointerException);
    expect(() => Spliterators.spliterator([1], 0).tryAdvance(null as never)).toThrow(NullPointerException);
    expect(() => Spliterators.spliterator([1], 0).forEachRemaining(null as never)).toThrow(NullPointerException);
  });
});

describe('Spliterators.spliterator(array, fromIndex, toIndex, characteristics)', () => {
  it('covers [fromIndex, toIndex)', () => {
    const s = Spliterators.spliterator(range(10), 2, 6, Spliterator.IMMUTABLE);
    expect(s.characteristics()).toBe(SIZED_SUB | Spliterator.IMMUTABLE);
    expect(s.estimateSize()).toBe(4);
    expect(all(s)).toEqual([2, 3, 4, 5]);
    expect(all(Spliterators.spliterator(range(3), 3, 3, 0))).toEqual([]);
  });
  it('throws ArrayIndexOutOfBoundsException for a bad range, with the reference messages', () => {
    expect(() => Spliterators.spliterator([1, 2], 1, 3, 0)).toThrow(new ArrayIndexOutOfBoundsException('Array index out of range: 3'));
    expect(() => Spliterators.spliterator([1, 2], -1, 1, 0)).toThrow(new ArrayIndexOutOfBoundsException('Array index out of range: -1'));
    expect(() => Spliterators.spliterator([1, 2], 2, 1, 0)).toThrow(new ArrayIndexOutOfBoundsException('origin(2) > fence(1)'));
  });
});

describe('Spliterators.spliterator(collection, characteristics)', () => {
  it('is late-binding and adds SIZED|SUBSIZED', () => {
    const l = ArrayList.of(1, 2);
    const s = Spliterators.spliterator(l, Spliterator.ORDERED);
    l.add(3);
    expect(s.characteristics()).toBe(SIZED_SUB | Spliterator.ORDERED);
    expect(s.estimateSize()).toBe(3);
    expect(all(s)).toEqual([1, 2, 3]);
    expect(s.estimateSize()).toBe(0);
  });
  it('keeps CONCURRENT sources unsized', () => {
    const s = Spliterators.spliterator(ArrayList.of(1), Spliterator.CONCURRENT);
    expect(s.characteristics()).toBe(Spliterator.CONCURRENT);
    expect(s.getExactSizeIfKnown()).toBe(-1);
  });
  it('splits off growing batches; pieces are SIZED', () => {
    const s = Spliterators.spliterator(ArrayList.of(...range(4000)), 0);
    const p1 = s.trySplit()!;
    const p2 = s.trySplit()!;
    expect(p1.estimateSize()).toBe(1024);
    expect(p2.estimateSize()).toBe(2048);
    expect(p1.characteristics()).toBe(SIZED_SUB);
    expect(s.estimateSize()).toBe(4000 - 3072);
    const out = [...all(p1), ...all(p2), ...all(s)];
    expect(out).toEqual(range(4000));
    expect(s.trySplit()).toBeNull();
  });
  it('tryAdvance counts the estimate down', () => {
    const s = Spliterators.spliterator(ArrayList.of(1, 2), 0);
    expect(s.tryAdvance(() => undefined)).toBe(true);
    expect(s.estimateSize()).toBe(1);
    expect(s.tryAdvance(() => undefined)).toBe(true);
    expect(s.tryAdvance(() => undefined)).toBe(false);
    expect(s.estimateSize()).toBe(0);
  });
});

describe('Spliterators.spliterator(iterator, size, characteristics)', () => {
  it('uses the given size', () => {
    const s = Spliterators.spliterator(ArrayList.of(1, 2, 3).iterator(), 3, Spliterator.ORDERED);
    expect(s.characteristics()).toBe(SIZED_SUB | Spliterator.ORDERED);
    expect(s.estimateSize()).toBe(3);
    expect(s.trySplit()!.estimateSize()).toBe(3);
    expect(s.estimateSize()).toBe(0);
    expect(Spliterators.spliterator(ArrayList.of(1).iterator(), 1, Spliterator.CONCURRENT).characteristics()).toBe(Spliterator.CONCURRENT);
  });
});

describe('Spliterators.spliteratorUnknownSize', () => {
  it('clears SIZED|SUBSIZED and estimates Infinity', () => {
    const s = Spliterators.spliteratorUnknownSize(ArrayList.of(1, 2).iterator(), Spliterator.ORDERED | SIZED_SUB);
    expect(s.characteristics()).toBe(Spliterator.ORDERED);
    expect(s.estimateSize()).toBe(Infinity);
    expect(s.getExactSizeIfKnown()).toBe(-1);
    expect(all(s)).toEqual([1, 2]);
    expect(s.estimateSize()).toBe(Infinity);
  });
  it('splits off unsized batches', () => {
    const s = Spliterators.spliteratorUnknownSize(ArrayList.of(...range(3000)).iterator(), Spliterator.ORDERED);
    const p = s.trySplit()!;
    expect(p.characteristics()).toBe(Spliterator.ORDERED);
    expect(p.estimateSize()).toBe(Infinity);
    expect(p.getExactSizeIfKnown()).toBe(-1);
    const q = p.trySplit()!;
    expect(q.estimateSize()).toBe(Infinity);
    expect([...all(q), ...all(p)]).toEqual(range(1024));
    const p2 = s.trySplit()!;
    expect(all(p2)).toEqual(range(3000).slice(1024));
    expect(s.trySplit()).toBeNull();
    expect(s.tryAdvance(() => undefined)).toBe(false);
  });
  it('rejects a null iterator', () => {
    expect(() => Spliterators.spliteratorUnknownSize(null as never, 0)).toThrow(NullPointerException);
  });
});

describe('Spliterators.emptySpliterator', () => {
  it('is empty, SIZED|SUBSIZED, never splits', () => {
    for (const s of [
      Spliterators.emptySpliterator<number>(),
      Spliterators.emptyIntSpliterator(),
      Spliterators.emptyLongSpliterator(),
      Spliterators.emptyDoubleSpliterator(),
    ]) {
      expect(s.characteristics()).toBe(SIZED_SUB);
      expect(s.estimateSize()).toBe(0);
      expect(s.getExactSizeIfKnown()).toBe(0);
      expect(s.trySplit()).toBeNull();
      expect(s.tryAdvance(() => undefined)).toBe(false);
      expect(all(s)).toEqual([]);
      expect(() => s.tryAdvance(null as never)).toThrow(NullPointerException);
      expect(() => s.forEachRemaining(null as never)).toThrow(NullPointerException);
      expect(() => s.getComparator()).toThrow(IllegalStateException);
    }
  });
});

describe('Spliterators.iterator', () => {
  it('adapts tryAdvance to hasNext/next', () => {
    const it = Spliterators.iterator(Spliterators.spliterator([1, 2, 3], 0));
    expect(it.hasNext()).toBe(true);
    expect(it.hasNext()).toBe(true);
    expect(it.next()).toBe(1);
    expect(it.next()).toBe(2);
    expect(it.next()).toBe(3);
    expect(it.hasNext()).toBe(false);
    expect(() => it.next()).toThrow(NoSuchElementException);
  });
  it('remove is unsupported', () => {
    const it = Spliterators.iterator(Spliterators.spliterator([1], 0));
    it.next();
    expect(() => it.remove()).toThrow(UnsupportedOperationException);
  });
  it('forEachRemaining hands over a buffered element first', () => {
    const it = Spliterators.iterator(Spliterators.spliterator([1, 2, 3], 0));
    expect(it.hasNext()).toBe(true);
    const out: number[] = [];
    it.forEachRemaining((x) => out.push(x));
    expect(out).toEqual([1, 2, 3]);
    const it2 = Spliterators.iterator(Spliterators.spliterator([1, 2], 0));
    const out2: number[] = [];
    it2.forEachRemaining((x) => out2.push(x));
    expect(out2).toEqual([1, 2]);
    expect(() => it2.forEachRemaining(null as never)).toThrow(NullPointerException);
  });
  it('yields undefined elements faithfully', () => {
    const it = Spliterators.iterator(Spliterators.spliterator([undefined, null], 0));
    expect(it.hasNext()).toBe(true);
    expect(it.next()).toBeUndefined();
    expect(it.next()).toBeNull();
    expect(it.hasNext()).toBe(false);
  });
  it('rejects null', () => {
    expect(() => Spliterators.iterator(null as never)).toThrow(NullPointerException);
  });
});

describe('Spliterators.AbstractSpliterator', () => {
  it('reports its characteristics, SIZED implying SUBSIZED', () => {
    expect(new Counter(3, 3, Spliterator.SIZED).characteristics()).toBe(SIZED_SUB);
    expect(new Counter(3, Infinity, Spliterator.ORDERED).characteristics()).toBe(Spliterator.ORDERED);
    expect(new Counter(3, 3, Spliterator.SIZED).getExactSizeIfKnown()).toBe(3);
  });
  it('traverses through tryAdvance', () => {
    expect(all(new Counter(4, 4, 0))).toEqual(range(4));
  });
  it('splits off batches of 1024, 2048, 3072 ... into SIZED array pieces', () => {
    const s = new Counter(5000, 5000, Spliterator.ORDERED | Spliterator.SIZED);
    const sizes: number[] = [];
    const out: number[] = [];
    for (let p = s.trySplit(); p !== null; p = s.trySplit()) {
      expect(p.characteristics()).toBe(Spliterator.ORDERED | SIZED_SUB);
      sizes.push(p.estimateSize());
      out.push(...all(p));
    }
    expect(sizes).toEqual([1024, 2048, 1928]);
    expect(out).toEqual(range(5000));
    expect(s.estimateSize()).toBe(0);
  });
  it('the batch is capped by the estimate', () => {
    const s = new Counter(10, 5, Spliterator.SIZED);
    expect(s.trySplit()!.estimateSize()).toBe(5);
    expect(s.estimateSize()).toBe(0);
    expect(s.trySplit()).toBeNull();
  });
  it('unsized: pieces are unsized too, the estimate stays Infinity', () => {
    const s = new Counter(3000, Infinity, Spliterator.ORDERED);
    const p = s.trySplit()!;
    expect(p.characteristics()).toBe(Spliterator.ORDERED);
    expect(p.estimateSize()).toBe(Infinity);
    expect(s.estimateSize()).toBe(Infinity);
    expect(all(p)).toEqual(range(1024));
  });
  it('does not split an empty source or one estimated at 1', () => {
    expect(new Counter(0, 10, 0).trySplit()).toBeNull();
    expect(new Counter(5, 1, 0).trySplit()).toBeNull();
  });
});
