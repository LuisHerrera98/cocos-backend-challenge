// Money is handled in integer cents to avoid float rounding errors.
export const toCents = (amount: string | number): number =>
  Math.round(Number(amount) * 100);

export const fromCents = (cents: number): number => cents / 100;
