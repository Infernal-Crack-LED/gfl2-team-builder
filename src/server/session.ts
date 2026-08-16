/**
 * Dependency-free HMAC-signed session tokens (JWT-alike, two segments, no
 * header). Ported verbatim in semantics from the nikke-sim/bakery-bot
 * pattern: the token is `base64url(JSON({...payload, exp})) + "." +
 * base64url(HMAC-SHA256(body, secret))`. No header segment because there is
 * exactly one algorithm — a header would only invite alg-confusion mistakes.
 *
 * Tokens travel in the URL fragment on the client (see web/src/auth.ts), so
 * they never hit server logs; the HMAC makes them unforgeable, and `exp`
 * bounds their lifetime.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SessionPayload {
  [key: string]: unknown;
}

function b64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function hmac(body: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(body, 'utf8').digest();
}

/** Mint a token carrying `payload` that expires `ttlSec` seconds from now. */
export function sign(
  payload: SessionPayload,
  secret: string,
  ttlSec: number
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const body = b64urlJson({ ...payload, exp });
  return `${body}.${hmac(body, secret).toString('base64url')}`;
}

/**
 * Verify a token: split on the separator, recompute the HMAC, compare with
 * `timingSafeEqual` (constant-time — a naive `===` leaks signature bytes via
 * timing), then enforce `exp`. Returns the payload, or null for anything
 * malformed, tampered, or expired.
 */
export function verify<T = SessionPayload>(
  token: string,
  secret: string
): T | null {
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) {
    return null;
  }
  const body = token.slice(0, dot);
  const presented = Buffer.from(token.slice(dot + 1), 'base64url');
  const expected = hmac(body, secret);
  // timingSafeEqual throws on length mismatch — check length first.
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
    return null;
  }
  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof payload.exp !== 'number' ||
    payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    return null;
  }
  return payload as T;
}
