import { fromCents, toCents } from './money';

describe('money', () => {
  it('converts NUMERIC strings and numbers to cents', () => {
    expect(toCents('925.85')).toBe(92585);
    expect(toCents('753000.00')).toBe(75300000);
    expect(toCents(900.5)).toBe(90050);
  });

  it('adds amounts without float errors', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(fromCents(toCents(0.1) + toCents(0.2))).toBe(0.3);
  });
});
