/**
 * Build codecs — the single source of truth for encoding doll builds and team
 * compositions into URL-safe strings. Shared by the browser (web/) and the
 * Node server (src/server/) — this module must stay DOM-free and
 * dependency-free so both hosts import the same file (isomorphic base64 via
 * the globalThis Buffer/Blob trick below).
 *
 * Wire format: base64url(JSON(payload)) with a version field checked exactly.
 * Decoders are TOTAL: anything malformed or from an unknown version returns
 * null, never throws — callers treat null as "no valid build" and fall back
 * to empty state. A garbage `?b=` param must never break a page or reach a
 * canvas renderer.
 */

export const BUILD_VERSION = 1;

// --- Isomorphic base64url ---------------------------------------------------

// Node's Buffer exists at runtime as globalThis.Buffer, but the web tsconfig
// doesn't include node types — reach it through a structural type so this
// file compiles in BOTH the Node (root) and browser (web/) projects without
// pulling node globals into the browser project.
interface BufferLike {
  from(data: Uint8Array): { toString(encoding: 'base64'): string };
  from(data: string, encoding: 'base64'): { toString(encoding: 'utf8'): string };
}
const nodeBuffer = (globalThis as { Buffer?: BufferLike }).Buffer;

export function b64urlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }
  const b64 = nodeBuffer ? nodeBuffer.from(bytes).toString('base64') : btoa(bin);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(code: string): string {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  if (nodeBuffer) {
    return nodeBuffer.from(b64 + pad, 'base64').toString('utf8');
  }
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

// --- Doll build -------------------------------------------------------------

/**
 * One character's equipment choices on the per-doll builder page.
 * Ids (not slugs) for weapon/keys — those tables key by UUID; the doll uses
 * its slug because that's what URLs address.
 */
export interface DollBuild {
  v: typeof BUILD_VERSION;
  doll: string; // doll slug
  weapon: string | null; // weapon id, null = no weapon picked
  keys: string[]; // unlocked key ids
  vert: number[]; // active vertebra segments (1-6)
}

const MAX_SLUG = 64;
const MAX_KEYS = 12;
const MAX_VERT = 6;

export function encodeDollBuild(build: DollBuild): string {
  return b64urlEncode(JSON.stringify(build));
}

export function decodeDollBuild(code: string): DollBuild | null {
  try {
    const o: unknown = JSON.parse(b64urlDecode(code.trim()));
    if (!o || typeof o !== 'object') {
      return null;
    }
    const b = o as Record<string, unknown>;
    if (
      b.v !== BUILD_VERSION ||
      typeof b.doll !== 'string' ||
      b.doll.length === 0 ||
      b.doll.length > MAX_SLUG ||
      !(b.weapon === null || typeof b.weapon === 'string') ||
      !Array.isArray(b.keys) ||
      !Array.isArray(b.vert)
    ) {
      return null;
    }
    const keys = b.keys.filter((k): k is string => typeof k === 'string');
    const vert = b.vert.filter(
      (n): n is number =>
        typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= MAX_VERT
    );
    if (keys.length > MAX_KEYS || b.keys.length !== keys.length) {
      return null;
    }
    return { v: BUILD_VERSION, doll: b.doll, weapon: b.weapon as string | null, keys, vert };
  } catch {
    return null;
  }
}

// --- Team build -------------------------------------------------------------

/** One squad slot: a doll slug plus (optionally) its equipment, inlined. */
export interface TeamSlot {
  d: string; // doll slug
  w?: string | null; // weapon id
  k?: string[]; // key ids
  t?: number[]; // vertebra segments
}

export interface TeamBuild {
  v: typeof BUILD_VERSION;
  s: (TeamSlot | null)[]; // positional squad slots, up to TEAM_SLOTS entries
}

export const TEAM_SLOTS = 5;

export function encodeTeamBuild(team: TeamBuild): string {
  return b64urlEncode(JSON.stringify(team));
}

export function decodeTeamBuild(code: string): TeamBuild | null {
  try {
    const o: unknown = JSON.parse(b64urlDecode(code.trim()));
    if (!o || typeof o !== 'object') {
      return null;
    }
    const t = o as Record<string, unknown>;
    if (t.v !== BUILD_VERSION || !Array.isArray(t.s)) {
      return null;
    }
    if (t.s.length > TEAM_SLOTS) {
      return null;
    }
    const slots: (TeamSlot | null)[] = [];
    for (const raw of t.s as unknown[]) {
      if (raw === null) {
        slots.push(null);
        continue;
      }
      if (typeof raw !== 'object') {
        return null;
      }
      const s = raw as Record<string, unknown>;
      if (
        typeof s.d !== 'string' ||
        s.d.length === 0 ||
        s.d.length > MAX_SLUG
      ) {
        return null;
      }
      const slot: TeamSlot = { d: s.d };
      if (typeof s.w === 'string' || s.w === null) {
        slot.w = s.w;
      }
      if (Array.isArray(s.k)) {
        const k = s.k.filter((x): x is string => typeof x === 'string');
        if (k.length !== s.k.length || k.length > MAX_KEYS) {
          return null;
        }
        slot.k = k;
      }
      if (Array.isArray(s.t)) {
        const vt = s.t.filter(
          (n): n is number =>
            typeof n === 'number' &&
            Number.isInteger(n) &&
            n >= 1 &&
            n <= MAX_VERT
        );
        if (vt.length !== s.t.length) {
          return null;
        }
        slot.t = vt;
      }
      slots.push(slot);
    }
    return { v: BUILD_VERSION, s: slots };
  } catch {
    return null;
  }
}

/** Try both codecs — used on public share links where the kind isn't known. */
export function decodeAnyBuild(
  code: string
): { kind: 'build'; build: DollBuild } | { kind: 'team'; build: TeamBuild } | null {
  const d = decodeDollBuild(code);
  if (d) {
    return { kind: 'build', build: d };
  }
  const t = decodeTeamBuild(code);
  if (t) {
    return { kind: 'team', build: t };
  }
  return null;
}

// --- Idempotent share naming -------------------------------------------------

/**
 * Deterministic profile-row name for a shared code. The profiles store upserts
 * by (user, kind, name), so naming the row by a hash of the content makes
 * re-sharing an unchanged build reuse the same row/URL instead of burning a
 * slot against the per-kind cap. Two 32-bit FNV-style lanes (~2^64) — a
 * collision would repoint someone's link.
 */
export function shareProfileName(code: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < code.length; i++) {
    const c = code.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b + c, 0x85ebca6b) >>> 0;
  }
  const hex = (n: number) => n.toString(16).padStart(8, '0');
  return `share-${hex(a)}${hex(b)}`;
}
