/**
 * IndexNow payload rules.
 *
 * The protocol's whole verification model is "the host serves a file matching
 * the key you submitted with", so the two have to stay in lockstep — and a
 * batch that mixes hosts is rejected outright rather than partially accepted.
 */
import { describe, expect, it } from 'vitest';
import {
  INDEXNOW_KEY,
  INDEXNOW_KEY_FILE,
  INDEXNOW_MAX_URLS,
  describeIndexNowStatus,
  indexNowPayload,
} from './indexnow';
import { SITE } from './pageMeta';

describe('indexNowPayload', () => {
  it('names the host, the key and where the key is published', () => {
    const p = indexNowPayload(SITE, [`${SITE}/characters`]);
    expect(p.host).toBe('refittingroom.app');
    expect(p.key).toBe(INDEXNOW_KEY);
    expect(p.keyLocation).toBe(`${SITE}/${INDEXNOW_KEY_FILE}`);
  });

  it('refuses a URL from another host instead of dropping it', () => {
    // A silently dropped URL is one the site believes it announced and never
    // did; a mixed batch is a 422 for the whole submission anyway.
    expect(() =>
      indexNowPayload(SITE, [`${SITE}/characters`, 'https://example.com/x'])
    ).toThrow(/not on/);
  });

  it('is not fooled by a host that merely starts the same', () => {
    expect(() =>
      indexNowPayload(SITE, ['https://refittingroom.app.evil.test/x'])
    ).toThrow(/not on/);
  });

  it('deduplicates', () => {
    const p = indexNowPayload(SITE, [
      `${SITE}/characters`,
      `${SITE}/characters`,
    ]);
    expect(p.urlList).toEqual([`${SITE}/characters`]);
  });

  it('rejects a batch over the per-request cap', () => {
    const many = Array.from(
      { length: INDEXNOW_MAX_URLS + 1 },
      (_, i) => `${SITE}/characters/doll-${i}`
    );
    expect(() => indexNowPayload(SITE, many)).toThrow(/exceeds/);
  });
});

describe('the published key file', () => {
  it('is a hex key of the length the protocol accepts', () => {
    expect(INDEXNOW_KEY).toMatch(/^[a-f0-9]{8,128}$/);
    expect(INDEXNOW_KEY_FILE).toBe(`${INDEXNOW_KEY}.txt`);
  });
});

describe('describeIndexNowStatus', () => {
  it('treats 202 as success — it means validation is still pending', () => {
    expect(describeIndexNowStatus(200).ok).toBe(true);
    expect(describeIndexNowStatus(202).ok).toBe(true);
  });

  it('explains the failures a deploy is actually likely to hit', () => {
    expect(describeIndexNowStatus(403).message).toContain(INDEXNOW_KEY_FILE);
    for (const s of [400, 403, 422, 429, 500]) {
      expect(describeIndexNowStatus(s).ok, String(s)).toBe(false);
    }
  });
});
