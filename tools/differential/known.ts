// Library divergences the harness has found and that are reported but not fixed yet. The jest smoke test tolerates
// these (so `npx jest` stays green); `npm run test:diff` still reports them and exits non-zero. Delete an entry once
// the library is fixed. Matched against divergence signatures: "<Target> <op> <result|state|log> ref=<kind> ours=<kind>".
export const KNOWN_LIBRARY_DIVERGENCES: { pattern: RegExp; note: string }[] = [];

export const isKnown = (signature: string) => KNOWN_LIBRARY_DIVERGENCES.some((k) => k.pattern.test(signature));
