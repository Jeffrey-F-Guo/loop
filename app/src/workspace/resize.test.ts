import { describe, expect, it } from 'vitest';
import { resizePair } from './resize';

describe('resizePair', () => {
  it('moves space between the two neighbours of a divider', () => {
    const next = resizePair([0.3, 0.7], 1, 0.1, 0.1);
    expect(next[0]).toBeCloseTo(0.4);
    expect(next[1]).toBeCloseTo(0.6);
  });
  it('leaves other children alone', () => {
    const next = resizePair([0.2, 0.3, 0.5], 2, -0.1, 0.05);
    expect(next[0]).toBeCloseTo(0.2);
    expect(next[1]).toBeCloseTo(0.2);
    expect(next[2]).toBeCloseTo(0.6);
  });
  it('never shrinks a panel below the minimum', () => {
    expect(resizePair([0.3, 0.7], 1, -0.5, 0.16)[0]).toBeCloseTo(0.16);
    expect(resizePair([0.3, 0.7], 1, 0.9, 0.16)[1]).toBeCloseTo(0.16);
  });
});
