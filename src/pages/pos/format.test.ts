import { describe, expect, it } from 'vitest';
import { formatPosAmount } from './format';

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
