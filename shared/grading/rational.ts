export class Rational {
  readonly n: bigint;
  readonly d: bigint;
  constructor(n: bigint | number, d: bigint | number = 1n) {
    let a = BigInt(n), b = BigInt(d);
    if (b === 0n) throw new RangeError('Zero denominator');
    if (b < 0n) { a = -a; b = -b; }
    const gcd = (x: bigint, y: bigint): bigint => { x = x < 0n ? -x : x; while (y) [x, y] = [y, x % y]; return x || 1n; };
    const g = gcd(a, b); this.n = a / g; this.d = b / g;
  }
  static fromNumber(value: number): Rational {
    if (!Number.isFinite(value)) throw new RangeError('Expected finite number');
    const [mantissa, exponent = '0'] = String(value).toLowerCase().split('e');
    const negative = mantissa.startsWith('-');
    const unsigned = negative ? mantissa.slice(1) : mantissa;
    const decimal = unsigned.indexOf('.');
    const digits = unsigned.replace('.', '');
    const scale = (decimal < 0 ? 0 : unsigned.length - decimal - 1) - Number(exponent);
    const signed = BigInt(digits) * (negative ? -1n : 1n);
    return scale <= 0 ? new Rational(signed * 10n ** BigInt(-scale)) : new Rational(signed, 10n ** BigInt(scale));
  }
  add(b: Rational): Rational { return new Rational(this.n * b.d + b.n * this.d, this.d * b.d); }
  sub(b: Rational): Rational { return new Rational(this.n * b.d - b.n * this.d, this.d * b.d); }
  mul(b: Rational): Rational { return new Rational(this.n * b.n, this.d * b.d); }
  div(b: Rational): Rational { return new Rational(this.n * b.d, this.d * b.n); }
  compare(b: Rational): number { const x = this.n * b.d - b.n * this.d; return x < 0n ? -1 : x > 0n ? 1 : 0; }
  min(b: Rational): Rational { return this.compare(b) <= 0 ? this : b; }
  max(b: Rational): Rational { return this.compare(b) >= 0 ? this : b; }
  toNumber(): number {
    if (this.n === 0n) return 0;
    const negative = this.n < 0n;
    const numerator = negative ? -this.n : this.n;
    const round = (a: bigint, b: bigint): bigint => {
      const quotient = a / b, remainder = a % b;
      return quotient + (2n * remainder > b || (2n * remainder === b && quotient % 2n === 1n) ? 1n : 0n);
    };
    let exponent = numerator.toString(2).length - this.d.toString(2).length;
    if (exponent >= 0 ? numerator < this.d << BigInt(exponent) : numerator << BigInt(-exponent) < this.d) exponent--;
    if (exponent > 1023) return negative ? -Infinity : Infinity;
    const shift = exponent < -1022 ? 1074 : 52 - exponent;
    const significand = shift >= 0 ? round(numerator << BigInt(shift), this.d) : round(numerator, this.d << BigInt(-shift));
    const value = exponent < -1022 ? Number(significand) * Number.MIN_VALUE : Number(significand) * 2 ** (exponent - 52);
    return negative ? -value : value;
  }
  roundHalfUp(decimals: number): Rational {
    if (!Number.isInteger(decimals) || decimals < 0) throw new RangeError('Invalid decimal places');
    const factor = 10n ** BigInt(decimals);
    const scaled = this.n * factor;
    const quotient = scaled / this.d;
    const remainder = scaled % this.d;
    const absoluteRemainder = remainder < 0n ? -remainder : remainder;
    const direction = scaled < 0n ? -1n : 1n;
    return new Rational(quotient + (absoluteRemainder * 2n >= this.d ? direction : 0n), factor);
  }
}
export const ZERO = new Rational(0n);
export const ONE = new Rational(1n);
export const R = Rational.fromNumber;
export function sum(values: Iterable<Rational>): Rational { let result = ZERO; for (const value of values) result = result.add(value); return result; }
