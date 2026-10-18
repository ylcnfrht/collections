import { ClassCastException, NullPointerException } from '../exceptions';
import { requireNonNull } from './Objects';

/** Comparator as a plain function: negative, zero or positive. */
export type Comparator<T> = (a: T, b: T) => number;

/** Comparable: objects that define their own natural ordering. */
export interface Comparable<T> {
  compareTo(o: T): number;
}

/** naturalCompare for two numbers, without its type dispatch. @internal */
export function compareNumbers(a: number, b: number): number {
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

const REVERSED_FROM: unique symbol = Symbol('reversedFrom');
type Reversed<T> = Comparator<T> & { [REVERSED_FROM]?: Comparator<T> };

const REVERSE_NATURAL: Reversed<unknown> = (a, b) => naturalCompare(b, a);
REVERSE_NATURAL[REVERSED_FROM] = naturalCompare;

/**
 * Reverse of c, or of natural ordering when c is null/omitted (one shared instance).
 * Reversing a reversed comparator gives back the original; reversing natural ordering gives the shared reverse.
 */
export function reverseOrder<T>(c?: Comparator<T> | null): Comparator<T> {
  if (c == null || c === naturalCompare) return REVERSE_NATURAL;
  const from = (c as Reversed<T>)[REVERSED_FROM];
  if (from !== undefined) return from;
  const r: Reversed<T> = (a, b) => c(b, a);
  r[REVERSED_FROM] = c;
  return r;
}

/** Numeric comparison for int/long/double keys (bigints too); NaN last, -0 equal to 0 like natural ordering. */
function compareKeys(a: number | bigint, b: number | bigint): number {
  return a < b ? -1 : a > b ? 1 : compareNumbers(a as number, b as number);
}

function chain<T>(first: Comparator<T>, second: Comparator<T>): Comparator<T> {
  return (a, b) => first(a, b) || second(a, b);
}

// nullsFirst/nullsLast comparators remember how they were made, so composing them stays null-friendly
// as the reference's NullComparator does (thenComparing/reversed wrap the inner comparator instead)
const NULLS: unique symbol = Symbol('nulls');
type NullsComparator<T> = Comparator<T> & { [NULLS]?: { first: boolean; real: Comparator<T> | null } };

function nulls<T>(first: boolean, real: Comparator<T> | null): Comparator<T | null | undefined> {
  const r = (first
    ? (a, b) => (a == null ? (b == null ? 0 : -1) : b == null ? 1 : real === null ? 0 : real(a, b))
    : (a, b) => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : real === null ? 0 : real(a, b))) as NullsComparator<T | null | undefined>;
  r[NULLS] = { first, real: real as Comparator<T | null | undefined> | null };
  return r;
}

/** c.thenComparing(other), dispatching like the reference's override on null-friendly comparators. */
function then<T>(c: Comparator<T>, other: Comparator<T>): Comparator<T> {
  requireNonNull(other);
  const n = (c as NullsComparator<T>)[NULLS];
  if (n === undefined) return chain(c, other);
  return nulls(n.first, n.real === null ? other : then(n.real, other)) as Comparator<T>;
}

/**
 * Comparator factories and combinators. Comparators are plain functions, so the reference's default
 * methods become functions taking the comparator first:
 * `c.reversed()` → `reversed(c)`, `c.thenComparing(other)` → `thenComparing(c, other)`,
 * `c.thenComparing(key[, keyCmp])` → `thenComparingBy(c, key[, keyCmp])`,
 * `c.thenComparingInt/Long/Double(key)` → `thenComparingInt/Long/Double(c, key)`.
 */
export const Comparator = {
  naturalOrder<T>(): Comparator<T> {
    return naturalCompare;
  },
  /** Same instance as Collections.reverseOrder(). */
  reverseOrder<T>(): Comparator<T> {
    return REVERSE_NATURAL;
  },
  /** reversed(reversed(c)) === c. @throws NullPointerException if c is null */
  reversed<T>(c: Comparator<T>): Comparator<T> {
    const n = (requireNonNull(c) as NullsComparator<T>)[NULLS];
    if (n === undefined) return reverseOrder(c);
    return nulls(!n.first, n.real === null ? null : Comparator.reversed(n.real)) as Comparator<T>;
  },
  /** Compares by key; keyComparator defaults to natural ordering. @throws NullPointerException for a null key or an explicitly null keyComparator */
  comparing<T, U>(key: (t: T) => U, keyComparator?: Comparator<U>): Comparator<T> {
    requireNonNull(key);
    const kc = arguments.length > 1 ? requireNonNull(keyComparator) : (naturalCompare as Comparator<U>);
    return (a, b) => kc(key(a), key(b));
  },
  comparingInt<T>(key: (t: T) => number): Comparator<T> {
    requireNonNull(key);
    return (a, b) => compareKeys(key(a), key(b));
  },
  comparingLong<T>(key: (t: T) => number | bigint): Comparator<T> {
    requireNonNull(key);
    return (a, b) => compareKeys(key(a), key(b));
  },
  comparingDouble<T>(key: (t: T) => number): Comparator<T> {
    requireNonNull(key);
    return (a, b) => compareKeys(key(a), key(b));
  },
  /** first, then each of rest to break ties. @throws NullPointerException if any comparator is null */
  thenComparing<T>(first: Comparator<T>, ...rest: Comparator<T>[]): Comparator<T> {
    let c = requireNonNull(first);
    for (const r of rest) c = then(c, r);
    return c;
  },
  /** c.thenComparing(key[, keyComparator]). @throws NullPointerException for a null argument */
  thenComparingBy<T, U>(c: Comparator<T>, key: (t: T) => U, keyComparator?: Comparator<U>): Comparator<T> {
    requireNonNull(c);
    const k = arguments.length > 2 ? Comparator.comparing(key, keyComparator) : Comparator.comparing(key);
    return then(c, k);
  },
  thenComparingInt<T>(c: Comparator<T>, key: (t: T) => number): Comparator<T> {
    return then(requireNonNull(c), Comparator.comparingInt(key));
  },
  thenComparingLong<T>(c: Comparator<T>, key: (t: T) => number | bigint): Comparator<T> {
    return then(requireNonNull(c), Comparator.comparingLong(key));
  },
  thenComparingDouble<T>(c: Comparator<T>, key: (t: T) => number): Comparator<T> {
    return then(requireNonNull(c), Comparator.comparingDouble(key));
  },
  /**
   * Nulls (and undefined) before everything else. Omitted c = natural ordering;
   * an explicit null c makes all non-null values equal.
   */
  nullsFirst<T>(c?: Comparator<T> | null): Comparator<T | null | undefined> {
    return nulls(true, arguments.length === 0 ? (naturalCompare as Comparator<T>) : (c ?? null));
  },
  /** Like nullsFirst, with nulls last. */
  nullsLast<T>(c?: Comparator<T> | null): Comparator<T | null | undefined> {
    return nulls(false, arguments.length === 0 ? (naturalCompare as Comparator<T>) : (c ?? null));
  },
  /** The greater of a and b by c; a when they compare equal. */
  max<T>(c: Comparator<T>, a: T, b: T): T {
    return requireNonNull(c)(a, b) >= 0 ? a : b;
  },
  /** The lesser of a and b by c; a when they compare equal. */
  min<T>(c: Comparator<T>, a: T, b: T): T {
    return requireNonNull(c)(a, b) <= 0 ? a : b;
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
