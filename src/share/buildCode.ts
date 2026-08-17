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

export const BUILD_VERSION = 2;

// --- Isomorphic base64url ---------------------------------------------------

// Node's Buffer exists at runtime as globalThis.Buffer, but the web tsconfig
// doesn't include node types — reach it through a structural type so this
// file compiles in BOTH the Node (root) and browser (web/) projects without
// pulling node globals into the browser project.
interface BufferLike {
  from(data: Uint8Array): { toString(encoding: 'base64'): string };
  from(
    data: string,
    encoding: 'base64'
  ): { toString(encoding: 'utf8'): string };
}
const nodeBuffer = (globalThis as { Buffer?: BufferLike }).Buffer;

export function b64urlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }
  const b64 = nodeBuffer
    ? nodeBuffer.from(bytes).toString('base64')
    : btoa(bin);
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
  keys: string[]; // unlocked fixed key ids (up to 3)
  vert: number[]; // active vertebra segment (0 or 1 entry — single select)
  /** Weapon refinement level 1–6, null = not specified. */
  cal?: number | null;
  /** Ordered stat preferences, highest priority first (up to 4). */
  stats?: string[];
  /** Selected common key ids (up to 3). */
  ck?: string[];
  /** Selected expansion key id — separate from `keys`, not capped by it. */
  exp?: string | null;
}

const MAX_SLUG = 64;
const MAX_KEYS = 12;
const MAX_VERT = 6;
const MAX_STAT_PREFS = 4;
const MAX_STAT_LABEL = 32;

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
    const result: DollBuild = {
      v: BUILD_VERSION,
      doll: b.doll,
      weapon: b.weapon as string | null,
      keys,
      vert,
    };
    // Optional fields — silently dropped from old codes.
    if (
      typeof b.cal === 'number' &&
      Number.isInteger(b.cal) &&
      b.cal >= 1 &&
      b.cal <= 6
    ) {
      result.cal = b.cal;
    }
    if (Array.isArray(b.stats)) {
      const stats = b.stats.filter(
        (s): s is string =>
          typeof s === 'string' && s.length > 0 && s.length <= MAX_STAT_LABEL
      );
      if (stats.length <= MAX_STAT_PREFS && stats.length === b.stats.length) {
        result.stats = stats;
      }
    }
    if (Array.isArray(b.ck)) {
      const ck = b.ck.filter((x): x is string => typeof x === 'string');
      if (ck.length <= 3 && ck.length === b.ck.length) {
        result.ck = ck;
      }
    }
    if (typeof b.exp === 'string' || b.exp === null) {
      result.exp = b.exp;
    }
    return result;
  } catch {
    return null;
  }
}

// --- Team build -------------------------------------------------------------

/**
 * One squad slot: a doll slug plus (optionally) her full build, inlined.
 *
 * The optional fields are the DollBuild fields under short names — a squad
 * slot IS a doll build, so the team builder can hand a slot straight to the
 * per-doll builder and back (teamSlotFromDollBuild / dollBuildFromTeamSlot).
 * Every one is optional and decoded leniently, so codes minted before the
 * build fields existed still decode: a slot with only `d`/`w` is a doll with
 * default equipment, which is exactly what those codes meant.
 */
export interface TeamSlot {
  d: string; // doll slug
  w?: string | null; // weapon id
  k?: string[]; // fixed key ids
  t?: number[]; // vertebra segments
  ex?: string | null; // expansion key id (outside the fixed-key cap)
  cal?: number | null; // weapon refinement 1–6
  st?: string[]; // ordered stat preferences
  ck?: string[]; // common key ids
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
      // Build fields — the same shape decodeDollBuild accepts, but STRICTER
      // about a violation: an over-cap or non-string entry REJECTS the whole
      // team code here, where decodeDollBuild drops the field. A malformed
      // team code is far likelier to mean a broken encoder than a hand-edited
      // URL, and silently truncating one loses a squad member's build.
      if (typeof s.ex === 'string' || s.ex === null) {
        slot.ex = s.ex;
      }
      if (
        typeof s.cal === 'number' &&
        Number.isInteger(s.cal) &&
        s.cal >= 1 &&
        s.cal <= 6
      ) {
        slot.cal = s.cal;
      }
      if (Array.isArray(s.st)) {
        const st = s.st.filter(
          (x): x is string =>
            typeof x === 'string' && x.length > 0 && x.length <= MAX_STAT_LABEL
        );
        if (st.length > MAX_STAT_PREFS || st.length !== s.st.length) {
          return null;
        }
        slot.st = st;
      }
      if (Array.isArray(s.ck)) {
        const ck = s.ck.filter((x): x is string => typeof x === 'string');
        if (ck.length > 3 || ck.length !== s.ck.length) {
          return null;
        }
        slot.ck = ck;
      }
      slots.push(slot);
    }
    return { v: BUILD_VERSION, s: slots };
  } catch {
    return null;
  }
}

/**
 * A doll build → its squad-slot form. The two carry the same information
 * under different field names; keeping the mapping in ONE place is what lets
 * the team builder open the per-doll builder on a slot and write the result
 * straight back without either side knowing the other's shape.
 */
export function teamSlotFromDollBuild(build: DollBuild): TeamSlot {
  const slot: TeamSlot = { d: build.doll, w: build.weapon, k: build.keys };
  if (build.vert.length > 0) {
    slot.t = build.vert;
  }
  if (build.exp != null) {
    slot.ex = build.exp;
  }
  if (build.cal != null) {
    slot.cal = build.cal;
  }
  if (build.stats && build.stats.length > 0) {
    slot.st = build.stats;
  }
  if (build.ck && build.ck.length > 0) {
    slot.ck = build.ck;
  }
  return slot;
}

/** The inverse of teamSlotFromDollBuild — absent fields become empty. */
export function dollBuildFromTeamSlot(slot: TeamSlot): DollBuild {
  return {
    v: BUILD_VERSION,
    doll: slot.d,
    weapon: slot.w ?? null,
    keys: slot.k ?? [],
    vert: slot.t ?? [],
    cal: slot.cal ?? null,
    stats: slot.st ?? [],
    ck: slot.ck ?? [],
    exp: slot.ex ?? null,
  };
}

/** Try both codecs — used on public share links where the kind isn't known. */
export function decodeAnyBuild(
  code: string
):
  | { kind: 'build'; build: DollBuild }
  | { kind: 'team'; build: TeamBuild }
  | null {
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
