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
  let [m, e] = d.toExponential().split('e');
  // one shortest digit: the reference prints two, choosing the closer pair (4.9E-324, not 5.0E-324); only
  // subnormals are spaced widely enough for that pair to differ from "d.0"
  if (!m.includes('.') && abs < 2.2250738585072014e-308) {
    const p = d.toPrecision(2);
    if (Number(p) === d) [m, e] = p.split('e');
  }
  return `${m.includes('.') ? m : m + '.0'}E${e[0] === '+' ? e.slice(1) : e}`;
}

/**
 * printf-style "%f": six decimals, rounded HALF_UP from the shortest round-trip digits (as the reference's
 * Formatter does, so 5.0E-7 gives "0.000001"), never in exponent form; NaN/Infinity spelled out.
 */
export function formatFixed6(d: number): string {
  if (d !== d) return 'NaN';
  if (d === Infinity) return 'Infinity';
  if (d === -Infinity) return '-Infinity';
  const sign = d < 0 || Object.is(d, -0) ? '-' : '';
  if (d === 0) return sign + '0.000000';
  const [m, e] = Math.abs(d).toExponential().split('e');
  const digits = m.replace('.', '');
  // number of digits kept: those before the point plus six after it
  const keep = Number(e) + 7;
  let n = keep <= 0 ? BigInt(0) : BigInt(digits.slice(0, keep).padEnd(keep, '0'));
  if (keep >= 0 && keep < digits.length && digits.charCodeAt(keep) >= 53 /* '5' */) n += BigInt(1);
  const s = n.toString().padStart(7, '0');
  return `${sign}${s.slice(0, -6)}.${s.slice(-6)}`;
}
