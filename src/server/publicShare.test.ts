/**
 * Pins the public-share id guard: uuid-shaped only, 404 before the DB sees
 * anything else (no probing, no driver errors on garbage input).
 */
import { describe, expect, it } from 'vitest';
import { PUBLIC_KINDS, PUBLIC_PROFILE_ID_RE } from './publicShare.js';

describe('PUBLIC_PROFILE_ID_RE', () => {
  it('accepts lower/upper-case uuids', () => {
    expect(
      PUBLIC_PROFILE_ID_RE.test('cfc811ae-86b5-4058-80a8-b7d42435410d')
    ).toBe(true);
    expect(
      PUBLIC_PROFILE_ID_RE.test('CFC811AE-86B5-4058-80A8-B7D42435410D')
    ).toBe(true);
  });

  it('rejects anything not exactly uuid-shaped', () => {
    expect(PUBLIC_PROFILE_ID_RE.test('')).toBe(false);
    expect(PUBLIC_PROFILE_ID_RE.test('junk')).toBe(false);
    expect(PUBLIC_PROFILE_ID_RE.test('cfc811ae86b5405880a8b7d42435410d')).toBe(
      false
    ); // no dashes
    expect(
      PUBLIC_PROFILE_ID_RE.test('cfc811ae-86b5-4058-80a8-b7d42435410')
    ).toBe(false); // 35 chars
    expect(
      PUBLIC_PROFILE_ID_RE.test('cfc811ae-86b5-4058-80a8-b7d42435410dd')
    ).toBe(false); // 37
    expect(
      PUBLIC_PROFILE_ID_RE.test('gfc811ae-86b5-4058-80a8-b7d42435410d')
    ).toBe(false); // bad hex
    expect(
      PUBLIC_PROFILE_ID_RE.test(
        "cfc811ae-86b5-4058-80a8-b7d42435410d' OR 1=1--"
      )
    ).toBe(false);
    expect(PUBLIC_PROFILE_ID_RE.test('../etc/passwd..............')).toBe(
      false
    );
  });
});

describe('PUBLIC_KINDS', () => {
  it('contains only the share kind', () => {
    expect([...PUBLIC_KINDS]).toEqual(['gfl2-share']);
  });
});
