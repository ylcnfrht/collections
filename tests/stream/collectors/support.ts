// Drives collectors directly (no stream engine): supplier -> accumulator per item -> finisher.
import type { Collector } from '../../../src/stream/Collector';

export function isId(c: Collector<any, any, any>): boolean {
  return c.characteristics().contains('IDENTITY_FINISH');
}

function finish<A, R>(c: Collector<any, A, R>, a: A): R {
  if (isId(c)) {
    // the finisher of an IDENTITY_FINISH collector must still be the identity
    expect(c.finisher()(a)).toBe(a);
    return a as unknown as R;
  }
  return c.finisher()(a);
}

export function fill<T, A>(items: readonly T[], c: Collector<T, A, any>): A {
  const a = c.supplier()();
  const acc = c.accumulator();
  for (const t of items) acc(a, t);
  return a;
}

export function collect<T, A, R>(items: readonly T[], c: Collector<T, A, R>): R {
  return finish(c, fill(items, c));
}

/** Accumulates items[0, at) and items[at, n) separately, combines, then finishes. */
export function collectSplit<T, A, R>(items: readonly T[], c: Collector<T, A, R>, at: number): R {
  const left = fill(items.slice(0, at), c);
  const right = fill(items.slice(at), c);
  return finish(c, c.combiner()(left, right));
}

/** Results for every split point 0..n. */
export function allSplits<T, A, R>(items: readonly T[], c: Collector<T, A, R>): R[] {
  const out: R[] = [];
  for (let i = 0; i <= items.length; i++) out.push(collectSplit(items, c, i));
  return out;
}

/** Converts library collections/maps/optionals to plain JS values for toEqual. */
export function plain(x: any): any {
  if (x === null || typeof x !== 'object') return x;
  if (typeof x.entrySet === 'function') {
    const o: Record<string, unknown> = {};
    x.forEach((k: unknown, v: unknown) => {
      o[String(k)] = plain(v);
    });
    return o;
  }
  if (typeof x.toArray === 'function') return x.toArray().map(plain);
  if (typeof x.isPresent === 'function' && typeof x.orElse === 'function') return { opt: x.isPresent() ? plain(x.get()) : 'empty' };
  return x;
}

/** Plain value with arrays sorted, for unordered results (sets). */
export function sorted(x: any): any {
  const p = plain(x);
  return Array.isArray(p) ? [...p].sort() : p;
}

export function chars(c: Collector<any, any, any>): string[] {
  return c.characteristics().toArray().sort();
}

/** Minimal closeable stream stand-in for flatMapping. */
export class FakeStream<U> {
  closed = 0;
  constructor(private readonly items: U[], private readonly failClose = false) {}
  forEach(action: (u: U) => void): void {
    this.items.forEach((u) => action(u));
  }
  close(): void {
    this.closed++;
    if (this.failClose) throw new Error('close failed');
  }
}
