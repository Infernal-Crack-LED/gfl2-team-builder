/**
 * Pins the anonymous-share rules: the retention window the sweep deletes on,
 * and the forwarded-for parse the rate limiter keys on.
 */
import { describe, expect, it } from 'vitest';
import {
  ANON_OWNER,
  ANON_RETENTION_MS,
  ANON_ROW_CAP,
  anonExpiryCutoff,
  clientIpFromForwardedFor,
} from './anonShare.js';

describe('retention window', () => {
  it('is three days', () => {
    expect(ANON_RETENTION_MS).toBe(3 * 24 * 60 * 60 * 1000);
  });

  it('puts the cutoff one window behind now', () => {
    const now = Date.UTC(2026, 0, 10);
    expect(anonExpiryCutoff(now).toISOString()).toBe(
      new Date(Date.UTC(2026, 0, 7)).toISOString()
    );
  });
});

describe('ANON_OWNER', () => {
  it('cannot collide with a Discord snowflake', () => {
    // Snowflakes are all digits; the sentinel must never match a real user's
    // discord_id or an anonymous row could be swept out of someone's account.
    expect(/^\d+$/.test(ANON_OWNER)).toBe(false);
  });
});

describe('ANON_ROW_CAP', () => {
  it('is a bound the sweep can actually stay ahead of', () => {
    expect(ANON_ROW_CAP).toBeGreaterThan(0);
    expect(Number.isInteger(ANON_ROW_CAP)).toBe(true);
  });
});

describe('clientIpFromForwardedFor', () => {
  it('takes the LAST entry — the one the trusted proxy appended', () => {
    // A client that forges the header cannot displace the real address, which
    // Railway's edge appends after whatever the client sent.
    expect(clientIpFromForwardedFor('1.2.3.4')).toBe('1.2.3.4');
    expect(clientIpFromForwardedFor('9.9.9.9, 1.2.3.4')).toBe('1.2.3.4');
    expect(clientIpFromForwardedFor('spoofed, junk, 1.2.3.4')).toBe('1.2.3.4');
  });

  it('tolerates whitespace and empty segments', () => {
    expect(clientIpFromForwardedFor('  9.9.9.9 ,  1.2.3.4  ')).toBe('1.2.3.4');
    expect(clientIpFromForwardedFor('1.2.3.4, , ')).toBe('1.2.3.4');
  });

  it('returns null when there is nothing to key on', () => {
    expect(clientIpFromForwardedFor(undefined)).toBeNull();
    expect(clientIpFromForwardedFor('')).toBeNull();
    expect(clientIpFromForwardedFor(' , ')).toBeNull();
  });
});
