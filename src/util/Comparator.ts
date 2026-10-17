import { ClassCastException, NullPointerException } from '../exceptions';
import { requireNonNull } from './Objects';

/** Comparator as a plain function: negative, zero or positive. */
export type Comparator<T> = (a: T, b: T) => number;

/** Comparable: objects that define their own natural ordering. */
export interface Comparable<T> {
  compareTo(o: T): number;
}

function compareNumbers(a: number, b: number): number {
  if (a < b) return -1;
  if (a > b) return 1;
  // NaN sorts last, like Double.compare; -0 and +0 stay equal to match equals()
  const an = a !== a;
  const bn = b !== b;
  return an === bn ? 0 : an ? 1 : -1;
}

function describe(x: unknown): string {
  return x === null ? 'null' : typeof x === 'object' ? (x as object).constructor?.name ?? 'Object' : typeof x;
}

/**
 * Natural ordering: compareTo() if defined, otherwise numbers, strings (UTF-16 code unit order),
 * bigints, booleans and Dates. Anything else throws ClassCastException; null throws NullPointerException.
 */
export function naturalCompare(a: unknown, b: unknown): number {
  if (a === null || a === undefined || b === null || b === undefined) throw new NullPointerException();
  const cmp = (a as { compareTo?: unknown }).compareTo;
  if (typeof cmp === 'function') return cmp.call(a, b);
  const t = typeof a;
  if (t === typeof b) {
    switch (t) {
      case 'number':
        return compareNumbers(a as number, b as number);
      case 'string':
      case 'bigint':
        return a < b ? -1 : a > b ? 1 : 0;
      case 'boolean':
        return a === b ? 0 : a ? 1 : -1;
      case 'object':
        if (a instanceof Date && b instanceof Date) return compareNumbers(a.getTime(), b.getTime());
    }
  }
  throw new ClassCastException(`${describe(a)} cannot be compared to ${describe(b)}`);
}

export const Comparator = {
  naturalOrder<T>(): Comparator<T> {
    return naturalCompare;
  },
  reverseOrder<T>(): Comparator<T> {
    return (a, b) => naturalCompare(b, a);
  },
  reversed<T>(c: Comparator<T>): Comparator<T> {
    requireNonNull(c);
    return (a, b) => c(b, a);
  },
  comparing<T, U>(key: (t: T) => U, keyComparator: Comparator<U> = naturalCompare): Comparator<T> {
    requireNonNull(key);
    return (a, b) => keyComparator(key(a), key(b));
  },
  thenComparing<T>(first: Comparator<T>, ...rest: Comparator<T>[]): Comparator<T> {
    const all = [first, ...rest];
    return (a, b) => {
      for (const c of all) {
        const r = c(a, b);
        if (r !== 0) return r;
      }
      return 0;
    };
  },
  nullsFirst<T>(c: Comparator<T> = naturalCompare): Comparator<T | null | undefined> {
    return (a, b) => (a == null ? (b == null ? 0 : -1) : b == null ? 1 : c(a, b));
  },
  nullsLast<T>(c: Comparator<T> = naturalCompare): Comparator<T | null | undefined> {
    return (a, b) => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : c(a, b));
  },
};

/**
 * Stable in-place sort. Unlike Array.prototype.sort it passes undefined elements to the
 * comparator (so natural ordering throws NullPointerException for them).
 */
export function stableSort<T>(arr: T[], c: Comparator<T> | null | undefined): T[] {
  const cmp = c ?? naturalCompare;
  // native sort is stable; it only skips the comparator for undefined, which needs the boxed path
  if (!arr.includes(undefined as T)) return arr.sort(cmp);
  const boxed = arr.map((v) => ({ v }));
  boxed.sort((x, y) => cmp(x.v, y.v));
  for (let i = 0; i < arr.length; i++) arr[i] = boxed[i].v;
  return arr;
}
