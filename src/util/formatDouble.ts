/**
 * Reference double-to-string formatting: "1.0" not "1", "1.0E7" for |d| >= 1e7,
 * "1.0E-4" for |d| < 1e-3, "-0.0", "NaN", "Infinity". Digits are the shortest
 * round-trip representation, which JS and the reference agree on.
 */
export function formatDouble(d: number): string {
  if (d !== d) return 'NaN';
  if (d === Infinity) return 'Infinity';
  if (d === -Infinity) return '-Infinity';
  if (d === 0) return Object.is(d, -0) ? '-0.0' : '0.0';
  const abs = Math.abs(d);
  if (abs >= 1e-3 && abs < 1e7) {
    const s = String(d);
    return s.includes('.') ? s : s + '.0';
  }
  const [m, e] = d.toExponential().split('e');
  return `${m.includes('.') ? m : m + '.0'}E${e[0] === '+' ? e.slice(1) : e}`;
}

/** printf-style "%f": six decimals, with NaN/Infinity spelled out. */
export function formatFixed6(d: number): string {
  if (d !== d) return 'NaN';
  if (d === Infinity) return 'Infinity';
  if (d === -Infinity) return '-Infinity';
  return d.toFixed(6);
}
