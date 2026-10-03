import { clamp } from '../domain/time';

export const MIN_PANEL_PX = 160;

/** Move `deltaFrac` of the split from child index-1 to child index (the divider between them). */
export function resizePair(sizes: number[], index: number, deltaFrac: number, minFrac: number): number[] {
  const a = sizes[index - 1];
  const b = sizes[index];
  const total = a + b;
  const lo = Math.min(minFrac, total / 2);
  const nextA = clamp(a + deltaFrac, lo, total - lo);
  const next = [...sizes];
  next[index - 1] = nextA;
  next[index] = total - nextA;
  return next;
}
