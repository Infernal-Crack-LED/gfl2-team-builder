/**
 * Fixed-window, in-process rate limiter.
 *
 * Deliberately the cheap version: a Map of key → (window start, count), no
 * Redis, no DB. It exists to stop the anonymous share endpoint from being
 * looped into a disk-fill, not to be an authoritative quota — and for that a
 * per-process counter is enough, because the thing it protects (row inserts)
 * also has a hard cap behind it.
 *
 * Known limits, all acceptable for that job: counters reset on redeploy, each
 * replica keeps its own, and a fixed window lets a caller send 2× the limit
 * across a window boundary. What it does guarantee is that no single key can
 * sustain more than `limit` per `windowMs` against one process.
 *
 * `maxKeys` bounds the Map itself — otherwise the limiter is its own memory
 * leak under the exact traffic it's meant to survive.
 */

export interface RateLimiter {
  /** True when the call is allowed; false when the key is over its limit. */
  allow(key: string, now: number): boolean;
}

export function createRateLimiter({
  limit,
  windowMs,
  maxKeys = 10_000,
}: {
  limit: number;
  windowMs: number;
  maxKeys?: number;
}): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();

  return {
    allow(key, now) {
      const existing = windows.get(key);
      if (existing && now - existing.start < windowMs) {
        if (existing.count >= limit) {
          return false;
        }
        existing.count += 1;
        return true;
      }

      // New or expired window. Drop stale entries first so the Map tracks
      // live callers rather than every key ever seen.
      if (windows.size >= maxKeys) {
        for (const [k, w] of windows) {
          if (now - w.start >= windowMs) {
            windows.delete(k);
          }
        }
        // Still full — every key is active. Refuse rather than grow: under
        // that much distinct-key pressure the endpoint is being abused.
        if (windows.size >= maxKeys) {
          return false;
        }
      }
      windows.set(key, { start: now, count: 1 });
      return true;
    },
  };
}
