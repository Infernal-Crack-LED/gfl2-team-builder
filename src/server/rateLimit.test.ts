/**
 * Pins the limiter that stands in front of the unauthenticated share mint.
 * Time is a parameter, not a clock, so these are exact rather than flaky.
 */
import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rateLimit.js';

const WINDOW = 60_000;

describe('createRateLimiter', () => {
  it('allows up to the limit, then refuses within the window', () => {
    const rl = createRateLimiter({ limit: 3, windowMs: WINDOW });
    expect(rl.allow('a', 0)).toBe(true);
    expect(rl.allow('a', 1)).toBe(true);
    expect(rl.allow('a', 2)).toBe(true);
    expect(rl.allow('a', 3)).toBe(false);
    // Still refused at the last instant of the window.
    expect(rl.allow('a', WINDOW - 1)).toBe(false);
  });

  it('starts a fresh window once the old one elapses', () => {
    const rl = createRateLimiter({ limit: 1, windowMs: WINDOW });
    expect(rl.allow('a', 0)).toBe(true);
    expect(rl.allow('a', WINDOW - 1)).toBe(false);
    expect(rl.allow('a', WINDOW)).toBe(true);
  });

  it('counts each key separately', () => {
    const rl = createRateLimiter({ limit: 1, windowMs: WINDOW });
    expect(rl.allow('a', 0)).toBe(true);
    expect(rl.allow('a', 0)).toBe(false);
    expect(rl.allow('b', 0)).toBe(true);
  });

  it('evicts stale keys instead of growing without bound', () => {
    const rl = createRateLimiter({ limit: 5, windowMs: WINDOW, maxKeys: 2 });
    expect(rl.allow('a', 0)).toBe(true);
    expect(rl.allow('b', 0)).toBe(true);
    // Map is full of LIVE windows — refuse rather than grow.
    expect(rl.allow('c', 1)).toBe(false);
    // Once a and b expire, their slots are reclaimed.
    expect(rl.allow('c', WINDOW + 1)).toBe(true);
  });
});
