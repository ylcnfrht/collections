import { formatDouble, formatFixed6 } from '../../src/util/formatDouble';

describe('formatDouble (reference Double.toString)', () => {
  it.each([
    [1, '1.0'],
    [-1, '-1.0'],
    [0, '0.0'],
    [-0, '-0.0'],
    [NaN, 'NaN'],
    [Infinity, 'Infinity'],
    [-Infinity, '-Infinity'],
    [123.456, '123.456'],
    [0.1, '0.1'],
    [0.001, '0.001'],
    [1e-3, '0.001'],
    [9.99e-4, '9.99E-4'],
    [1e-4, '1.0E-4'],
    [1.5e-10, '1.5E-10'],
    [9999999, '9999999.0'],
    [1e7, '1.0E7'],
    [-1e7, '-1.0E7'],
    [1.2345e7, '1.2345E7'],
    [1e21, '1.0E21'],
    [1e100, '1.0E100'],
    [Number.MAX_VALUE, '1.7976931348623157E308'],
    [Number.MIN_VALUE, '4.9E-324'],
    [2 * Number.MIN_VALUE, '9.9E-324'],
    [4 * Number.MIN_VALUE, '2.0E-323'],
    [9 * Number.MIN_VALUE, '4.4E-323'],
    [10 * Number.MIN_VALUE, '4.9E-323'],
    [-Number.MIN_VALUE, '-4.9E-324'],
    [3e-320, '3.0E-320'],
    [1e-310, '1.0E-310'],
    [1e23, '1.0E23'],
    [0.30000000000000004, '0.30000000000000004'],
    [100, '100.0'],
    [2 ** 53, '9.007199254740992E15'],
  ])('%p -> %s', (d, s) => {
    expect(formatDouble(d)).toBe(s);
  });

  it('uses the shortest digits that round-trip', () => {
    for (const d of [0.1, 0.2, 1 / 3, 2 / 3, 123.456, 1e-5 / 3, 5e300 / 7]) expect(Number(formatDouble(d))).toBe(d);
    expect(formatDouble(1 / 3)).toBe('0.3333333333333333');
  });
});

describe('formatFixed6 (reference %f)', () => {
  it.each([
    [0, '0.000000'],
    [-0, '-0.000000'],
    [1, '1.000000'],
    [2.75, '2.750000'],
    [0.3, '0.300000'],
    [2.675, '2.675000'],
    [5e-7, '0.000001'],
    [-5e-7, '-0.000001'],
    [4e-7, '0.000000'],
    [2.5e-7, '0.000000'],
    [1e-7, '0.000000'],
    [5e-8, '0.000000'],
    [1.5e-6, '0.000002'],
    [0.1234565, '0.123457'],
    [1.0000005, '1.000001'],
    [1.0000004999, '1.000000'],
    [0.9999995, '1.000000'],
    [9.9999995, '10.000000'],
    [-123.456, '-123.456000'],
    [1e21, '1000000000000000000000.000000'],
    [1.2345678901234569e23, '123456789012345690000000.000000'],
    [NaN, 'NaN'],
    [Infinity, 'Infinity'],
    [-Infinity, '-Infinity'],
  ])('%p -> %s', (d, s) => {
    expect(formatFixed6(d)).toBe(s);
  });

  it('never switches to exponent form', () => {
    const s = formatFixed6(1e300);
    expect(s).toBe('1' + '0'.repeat(300) + '.000000');
  });
});
