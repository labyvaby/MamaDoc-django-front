import { describe, expect, it } from 'vitest';
import { formatPosAmount, showMinus } from './format';

describe('POS minus sign', () => {
  it('never prints «−0»', () => {
    expect(showMinus(0, true)).toBe(false);
    expect(showMinus(0.004, true)).toBe(false);
    expect(showMinus(Number.NaN, true)).toBe(false);
  });
  it('marks real write-offs only when asked', () => {
    expect(showMinus(150, true)).toBe(true);
    expect(showMinus(0.01, true)).toBe(true);
    expect(showMinus(150, false)).toBe(false);
  });
});

describe('POS money display', () => {
  it('does not round away tyiyn', () => {
    expect(formatPosAmount(2300.5)).toBe('2\u00a0300,5');
    expect(formatPosAmount(2070.45)).toBe('2\u00a0070,45');
  });
  it('keeps whole amounts compact', () => {
    expect(formatPosAmount(5000)).toBe('5\u00a0000');
    expect(formatPosAmount(0)).toBe('0');
  });
});
