/** Asserts fn throws an exception with the given name (checked via Error.name). */
export function expectThrows(fn: () => unknown, name: string): void {
  let err: unknown;
  let threw = false;
  try {
    fn();
  } catch (e) {
    err = e;
    threw = true;
  }
  if (!threw) throw new Error(`expected ${name} but nothing was thrown`);
  expect((err as Error)?.name).toBe(name);
}

/** Value object with equals/hashCode/compareTo (usable in hash and sorted collections). */
export class Point {
  constructor(public readonly x: number, public readonly y: number) {}
  equals(o: unknown): boolean {
    return o instanceof Point && o.x === this.x && o.y === this.y;
  }
  hashCode(): number {
    return (Math.imul(31, this.x) + this.y) | 0;
  }
  compareTo(o: Point): number {
    return this.x - o.x || this.y - o.y;
  }
  toString(): string {
    return `(${this.x},${this.y})`;
  }
}

/** Distinct values that all share one hashCode, to force hash collisions. */
export class Collide {
  constructor(public readonly id: number) {}
  equals(o: unknown): boolean {
    return o instanceof Collide && o.id === this.id;
  }
  hashCode(): number {
    return 42;
  }
  compareTo(o: Collide): number {
    return this.id - o.id;
  }
  toString(): string {
    return `C${this.id}`;
  }
}

/** Independent copy of the 31-multiplier string hash for checking hash formulas. */
export function refStringHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/** Deterministic PRNG: rng(seed)(n) returns an int in [0, n). Failures reproduce. */
export function rng(seed: number): (n: number) => number {
  let s = seed;
  return (n) => {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    return Math.floor((s / 0x80000000) * n);
  };
}

/**
 * Runs fn and returns its wall-clock time. Budgets only hold on a quiet machine, so the
 * time is reported only with PERF=1 (otherwise 0); the workload still runs and is checked.
 * Speed itself is measured by `npm run bench`.
 */
export function timeIt(fn: () => void): number {
  const t = Date.now();
  fn();
  return process.env.PERF ? Date.now() - t : 0;
}
