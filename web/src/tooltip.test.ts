import { describe, it, expect } from 'vitest';
import { tooltipShift } from './tooltip';

describe('tooltipShift', () => {
  const bounds = { min: 8, max: 408 };

  it('leaves a tooltip that already fits alone', () => {
    expect(tooltipShift({ left: 100, width: 200 }, bounds)).toBe(0);
  });

  it('pushes a tooltip that spills past the left edge inward', () => {
    // Centered on an anchor at the panel's left edge: starts 42px too far left.
    expect(tooltipShift({ left: -34, width: 200 }, bounds)).toBe(42);
  });

  it('pulls a tooltip that spills past the right edge inward', () => {
    // 340px tooltip centered near the right edge would end at 468.
    expect(tooltipShift({ left: 268, width: 200 }, bounds)).toBe(-60);
  });

  it('lands flush against an edge with no extra gap', () => {
    expect(tooltipShift({ left: 8, width: 400 }, bounds)).toBe(0);
    expect(tooltipShift({ left: 9, width: 400 }, bounds)).toBe(-1);
  });

  it('pins a tooltip too wide for the space to the left bound', () => {
    expect(tooltipShift({ left: 100, width: 600 }, bounds)).toBe(-92);
  });

  it('is a no-op when there is nothing to gain', () => {
    expect(tooltipShift({ left: 8, width: 600 }, bounds)).toBe(0);
  });
});
