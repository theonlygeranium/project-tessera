import { describe, expect, it } from 'vitest';
import { R, Rational } from './rational';

describe('exact rationals', () => {
  it('adds decimal inputs exactly', () => { expect(R(0.1).add(R(0.2)).compare(R(0.3))).toBe(0); });
  it('parses shortest decimal exponent strings', () => {
    expect(R(1e-7)).toEqual(new Rational(1n, 10000000n));
    expect(R(1e21)).toEqual(new Rational(1000000000000000000000n));
    expect(R(-1.25e-4)).toEqual(new Rational(-1n, 8000n));
  });
  it('rounds half up at exact boundaries', () => {
    expect(R(89.95).roundHalfUp(1).toNumber()).toBe(90);
    expect(R(89.94).roundHalfUp(1).toNumber()).toBe(89.9);
    expect(new Rational(1n, 8n).roundHalfUp(2).toNumber()).toBe(0.13);
    expect(R(-1.25).roundHalfUp(1).toNumber()).toBe(-1.3);
  });
  it('converts large ratios without overflow or reversing exact order', () => {
    const denominator = 10n ** 400n;
    const lower = new Rational(denominator - 10n ** 384n, denominator);
    const upper = new Rational(denominator, denominator);
    expect(lower.toNumber()).toBeLessThan(upper.toNumber());
    expect(new Rational(10n ** 400n, 10n ** 399n).toNumber()).toBe(10);
    const unit = 2n ** 54n;
    expect(new Rational(unit + 2n, unit).toNumber()).toBe(1);
    expect(new Rational(unit + 3n, unit).toNumber()).toBe(1 + Number.EPSILON);
  });
});
