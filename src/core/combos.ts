import { popcount } from './grid.ts';

/**
 * Every set of distinct digits 1..9, indexed by [size][sum] as 9-bit masks.
 * This is the same table the reference app ships as combs.txt, computed instead
 * of shipped — 502 entries for sizes 2..8.
 */
const TABLE: number[][][] = (() => {
  const t: number[][][] = Array.from({ length: 10 }, () =>
    Array.from({ length: 46 }, () => [] as number[]),
  );
  for (let mask = 1; mask < 512; mask++) {
    let sum = 0;
    for (let d = 1; d <= 9; d++) if (mask & (1 << (d - 1))) sum += d;
    t[popcount(mask)][sum].push(mask);
  }
  return t;
})();

/** Digit-set masks of `size` distinct digits summing to `sum`. Never null. */
export function combosFor(size: number, sum: number): number[] {
  if (size < 1 || size > 9 || sum < 1 || sum > 45) return EMPTY;
  return TABLE[size][sum];
}

const EMPTY: number[] = [];

/** Smallest sum reachable with `size` distinct digits: 1+2+...+size. */
export const minSum = (size: number): number => (size * (size + 1)) / 2;

/** Largest sum reachable with `size` distinct digits: 9+8+...  */
export const maxSum = (size: number): number => (size * (19 - size)) / 2;

/**
 * Combinations for the sum calculator, filtered by digits the user has forced
 * in or ruled out. Returns masks, ascending by lowest digit.
 */
export function findCombos(size: number, sum: number, include: number, exclude: number): number[] {
  return combosFor(size, sum).filter((m) => (m & include) === include && (m & exclude) === 0);
}
