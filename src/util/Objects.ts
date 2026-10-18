import { IndexOutOfBoundsException, NullPointerException } from '../exceptions';

/** Node's util.inspect hook (console.log, REPL): collections, entries and optionals print as their toString(). */
export const INSPECT: unique symbol = Symbol.for('nodejs.util.inspect.custom') as never;

const identityHashes = new WeakMap<object, number>();
// shortcut: symbols can't be WeakMap keys on older runtimes, so their hashes are never freed; fine unless millions of symbols are hashed.
const symbolHashes = new Map<symbol, number>();
let nextIdentity = 0;

function newIdentityHash(): number {
  // murmur3 finalizer spreads sequential ids across all 32 bits
  let h = ++nextIdentity;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) | 0;
}

/** Identity hash: stable per reference, ignores any hashCode() method. */
export function identityHashCode(o: unknown): number {
  if (o === null || o === undefined) return 0;
  if (typeof o === 'object' || typeof o === 'function') {
    let h = identityHashes.get(o);
    if (h === undefined) identityHashes.set(o, (h = newIdentityHash()));
    return h;
  }
  if (typeof o === 'symbol') {
    let h = symbolHashes.get(o);
    if (h === undefined) symbolHashes.set(o, (h = newIdentityHash()));
    return h;
  }
  return hashCode(o);
}

const f64 = new Float64Array(1);
const i32 = new Int32Array(f64.buffer);

/** Double hash: high 32 bits XOR low 32 bits of the IEEE-754 representation. */
function doubleHash(x: number): number {
  if (x !== x) return 0x7ff80000; // canonical NaN
  f64[0] = x;
  return (i32[0] ^ i32[1]) | 0;
}

/** String hash: h = 31 * h + charCode, in 32-bit arithmetic. */
export function stringHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/**
 * Value hash. Values that are `equals` always hash the same:
 * int32 numbers hash like Integer, other numbers like Double, strings like String,
 * booleans like Boolean, bigints like Long, Dates by time, objects via hashCode() or identity.
 */
export function hashCode(o: unknown): number {
  switch (typeof o) {
    case 'number':
      return Number.isInteger(o) && o >= -2147483648 && o <= 2147483647 ? o | 0 : doubleHash(o);
    case 'string':
      return stringHash(o);
    case 'boolean':
      return o ? 1231 : 1237;
    case 'bigint': {
      const v = BigInt.asIntN(64, o);
      return Number(BigInt.asIntN(32, v ^ (v >> BigInt(32))));
    }
    case 'undefined':
      return 0;
  }
  if (o === null) return 0;
  if (o instanceof Date) return doubleHash(o.getTime());
  const h = (o as { hashCode?: unknown }).hashCode;
  if (typeof h === 'function') return h.call(o) | 0;
  return identityHashCode(o);
}

/**
 * Value equality. Uses a.equals(b) when defined; otherwise SameValueZero
 * (like JS Map/Set: NaN equals NaN, +0 equals -0). Dates compare by time, so invalid Dates are equal.
 */
export function equals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false;
  if (typeof a === 'number') return typeof b === 'number' && a !== a && b !== b;
  if (a instanceof Date) return b instanceof Date && equals(a.getTime(), b.getTime());
  const eq = (a as { equals?: unknown }).equals;
  return typeof eq === 'function' && eq.call(a, b) === true;
}

/** Combined hash of several values (31 * h + hash). */
export function hash(...values: unknown[]): number {
  let h = 1;
  for (const v of values) h = (Math.imul(31, h) + hashCode(v)) | 0;
  return h;
}

/** Throws NullPointerException for null or undefined. message may be a supplier, called only on failure. */
export function requireNonNull<T>(o: T, message?: string | (() => string)): NonNullable<T> {
  if (o === null || o === undefined) throw new NullPointerException(typeof message === 'function' ? message() : message);
  return o as NonNullable<T>;
}

/** o, or defaultObj when o is null/undefined. @throws NullPointerException if both are null */
export function requireNonNullElse<T>(o: T | null | undefined, defaultObj: T): NonNullable<T> {
  return o != null ? (o as NonNullable<T>) : requireNonNull(defaultObj, 'defaultObj');
}

/** o, or supplier() when o is null/undefined. @throws NullPointerException if the supplier or its result is null */
export function requireNonNullElseGet<T>(o: T | null | undefined, supplier: () => T): NonNullable<T> {
  return o != null ? (o as NonNullable<T>) : requireNonNull(requireNonNull(supplier, 'supplier')(), 'supplier.get()');
}

export function isNull(o: unknown): o is null | undefined {
  return o === null || o === undefined;
}

/**
 * String form used by collection toString(): null -> "null", undefined -> "undefined".
 * With nullDefault, null and undefined both give nullDefault.
 */
export function toString(o: unknown, nullDefault?: string): string {
  if (arguments.length > 1 && (o === null || o === undefined)) return nullDefault as string;
  if (o === null) return 'null';
  try {
    return String(o);
  } catch {
    return Object.prototype.toString.call(o);
  }
}

export function checkIndex(index: number, length: number): number {
  if (!Number.isInteger(index) || index < 0 || index >= length) {
    throw new IndexOutOfBoundsException(`Index ${index} out of bounds for length ${length}`);
  }
  return index;
}

export function checkPositionIndex(index: number, length: number): number {
  if (!Number.isInteger(index) || index < 0 || index > length) {
    throw new IndexOutOfBoundsException(`Index: ${index}, Size: ${length}`);
  }
  return index;
}

function isIndex(n: number): boolean {
  return Number.isInteger(n) && n >= 0;
}

/** Checks 0 <= fromIndex <= toIndex <= length. @returns fromIndex. @throws IndexOutOfBoundsException */
export function checkFromToIndex(fromIndex: number, toIndex: number, length: number): number {
  if (!isIndex(fromIndex) || !isIndex(toIndex) || !isIndex(length) || fromIndex > toIndex || toIndex > length) {
    throw new IndexOutOfBoundsException(`Range [${fromIndex}, ${toIndex}) out of bounds for length ${length}`);
  }
  return fromIndex;
}

/** Checks [fromIndex, fromIndex + size) lies within [0, length). @returns fromIndex. @throws IndexOutOfBoundsException */
export function checkFromIndexSize(fromIndex: number, size: number, length: number): number {
  if (!isIndex(fromIndex) || !isIndex(size) || !isIndex(length) || size > length - fromIndex) {
    throw new IndexOutOfBoundsException(`Range [${fromIndex}, ${fromIndex} + ${size}) out of bounds for length ${length}`);
  }
  return fromIndex;
}

/** 0 if a and b are identical (===), else c(a, b); c is not called for identical arguments. */
export function compare<T>(a: T, b: T, c: (a: T, b: T) => number): number {
  return a === b ? 0 : c(a, b);
}

function isArrayValue(o: unknown): o is ArrayLike<unknown> {
  return Array.isArray(o) || (ArrayBuffer.isView(o) && !(o instanceof DataView));
}

/** Like equals, but arrays (plain and typed) compare element by element, recursively. */
export function deepEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!isArrayValue(a) || !isArrayValue(b)) return equals(a, b);
  if (Array.isArray(a) !== Array.isArray(b) || a.constructor !== b.constructor || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!deepEquals(a[i], b[i])) return false;
  return true;
}

/** `${constructorName}@${hex identity hash}`, ignoring any toString()/hashCode(). @throws NullPointerException for null */
export function toIdentityString(o: unknown): string {
  requireNonNull(o);
  const name = typeof o === 'object' || typeof o === 'function' ? (o as object).constructor?.name || 'Object' : typeof o;
  return `${name}@${(identityHashCode(o) >>> 0).toString(16)}`;
}

export const Objects = {
  equals,
  hashCode,
  hash,
  identityHashCode,
  requireNonNull,
  isNull,
  nonNull: (o: unknown) => !isNull(o),
  toString,
  checkIndex,
  checkFromToIndex,
  checkFromIndexSize,
  requireNonNullElse,
  requireNonNullElseGet,
  compare,
  deepEquals,
  toIdentityString,
};
