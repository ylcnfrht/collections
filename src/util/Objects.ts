import { IndexOutOfBoundsException, NullPointerException } from '../exceptions';

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
 * (like JS Map/Set: NaN equals NaN, +0 equals -0). Dates compare by time.
 */
export function equals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false;
  if (typeof a === 'number') return typeof b === 'number' && a !== a && b !== b;
  if (a instanceof Date) return b instanceof Date && a.getTime() === b.getTime();
  const eq = (a as { equals?: unknown }).equals;
  return typeof eq === 'function' && eq.call(a, b) === true;
}

/** Combined hash of several values (31 * h + hash). */
export function hash(...values: unknown[]): number {
  let h = 1;
  for (const v of values) h = (Math.imul(31, h) + hashCode(v)) | 0;
  return h;
}

/** Throws NullPointerException for null or undefined. */
export function requireNonNull<T>(o: T, message?: string): NonNullable<T> {
  if (o === null || o === undefined) throw new NullPointerException(message);
  return o as NonNullable<T>;
}

export function isNull(o: unknown): o is null | undefined {
  return o === null || o === undefined;
}

/** String form used by collection toString(): null -> "null". */
export function toString(o: unknown): string {
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
};
