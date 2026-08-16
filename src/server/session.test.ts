import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sign, verify } from './session.js';

const SECRET = 'test-secret';

describe('session sign/verify', () => {
  it('round-trips a payload', () => {
    const token = sign({ sub: '123', u: 'max', a: null }, SECRET, 3600);
    const payload = verify<{ sub: string; u: string; a: string | null }>(
      token,
      SECRET
    );
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe('123');
    expect(payload!.u).toBe('max');
    expect(payload!.a).toBeNull();
    expect(typeof payload!.exp).toBe('number');
  });

  it('produces exactly two segments', () => {
    const token = sign({ sub: '1' }, SECRET, 60);
    expect(token.split('.')).toHaveLength(2);
  });

  it('rejects a tampered signature', () => {
    const token = sign({ sub: '123' }, SECRET, 3600);
    const [body, sig] = token.split('.');
    // Flip a character in the signature.
    const flipped = (sig!.startsWith('A') ? 'B' : 'A') + sig!.slice(1);
    expect(verify(`${body}.${flipped}`, SECRET)).toBeNull();
  });

  it('rejects a tampered body', () => {
    const token = sign({ sub: '123' }, SECRET, 3600);
    const [body, sig] = token.split('.');
    const tamperedBody = Buffer.from(
      JSON.stringify({ sub: '999', exp: Math.floor(Date.now() / 1000) + 3600 })
    ).toString('base64url');
    expect(verify(`${tamperedBody}.${sig}`, SECRET)).toBeNull();
    expect(body).not.toBe(tamperedBody);
  });

  it('rejects a token signed with a different secret', () => {
    const token = sign({ sub: '123' }, 'other-secret', 3600);
    expect(verify(token, SECRET)).toBeNull();
  });

  it('rejects an expired token', () => {
    // ttlSec 0 → exp == now, which verify treats as expired.
    const token = sign({ sub: '123' }, SECRET, 0);
    expect(verify(token, SECRET)).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(verify('', SECRET)).toBeNull();
    expect(verify('nodot', SECRET)).toBeNull();
    expect(verify('a.', SECRET)).toBeNull();
    expect(verify('.b', SECRET)).toBeNull();
    // Valid HMAC shape but body is not JSON.
    const body = Buffer.from('not json', 'utf8').toString('base64url');
    const sig = createHmac('sha256', SECRET)
      .update(body, 'utf8')
      .digest('base64url');
    expect(verify(`${body}.${sig}`, SECRET)).toBeNull();
  });
});
