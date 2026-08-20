/**
 * Team effect matrix — typed access to `data/effect-matrix.json` (produced by
 * `npm run derive`, automatically at the end of every sync) plus the team
 * query that powers the Team Builder's effect list.
 *
 * For a squad, `computeTeamEffects` answers two questions per effect:
 *   - sources:  which member confers it, and from what surface
 *               (skill / weapon / key / vertebrae / summon / remolding)
 *   - affected: which members' behavior depends on it — directly (their own
 *               skills) or transitively via an effect they carry (Makiatto's
 *               Alert referencing Frost Barrier is the canonical case)
 *
 * Effect→effect conferral is followed transitively (BFS, cycle-safe): if a
 * member provides Frost Barrier and Frost Barrier's own text applies Frigid
 * on destruction, Frigid shows as provided "via Frost Barrier".
 */

import matrixJson from '../../data/effect-matrix.json';
import type { Doll } from './data';
import { allEffects } from './data';

// --- JSON shapes (mirror src/derive/effectMatrix.ts output) ---

export type MatrixRelation =
  | 'applies'
  | 'gains'
  | 'removes'
  | 'conditional'
  | 'enhances'
  | 'includes'
  | 'considered'
  | 'mentions';

interface MatrixEdgeBase {
  relation: MatrixRelation;
  snippet: string;
}

export interface MatrixSkillEdge extends MatrixEdgeBase {
  kind: 'skill';
  dollId: string;
  dollName: string;
  skillId: string | null;
  skillName: string | null;
  skillType: string | null;
  levels: number[];
}

export interface MatrixSummonSkillEdge extends MatrixEdgeBase {
  kind: 'summon-skill';
  dollId: string;
  dollName: string;
  summonName: string | null;
  skillName: string | null;
  skillType: string | null;
  levels: number[];
}

export interface MatrixSummonEdge extends MatrixEdgeBase {
  kind: 'summon';
  dollId: string;
  dollName: string;
  summonName: string | null;
  path: string;
}

export interface MatrixVertebraeEdge extends MatrixEdgeBase {
  kind: 'vertebrae';
  dollId: string;
  dollName: string;
  level: number | null;
  segment: number | null;
}

export interface MatrixRemoldingEdge extends MatrixEdgeBase {
  kind: 'remolding';
  dollId: string;
  dollName: string;
  stage: string | null;
  path: string;
}

export interface MatrixWeaponEdge extends MatrixEdgeBase {
  kind: 'weapon';
  weaponId: string;
  weaponName: string;
  imprintDollId: string | null;
  imprintDollName: string | null;
  field: 'effect' | 'imprintDescription';
}

export interface MatrixWeaponImprintEdge extends MatrixEdgeBase {
  kind: 'weapon-imprint';
  dollId: string | null;
  dollName: string | null;
  weaponName: string | null;
  field: 'effect' | 'trait';
}

export interface MatrixKeyEdge extends MatrixEdgeBase {
  kind: 'key';
  keyId: string;
  keyTitle: string | null;
  keyType: string | null;
  level: number | null;
  dollId: string | null;
  dollName: string | null;
}

export interface MatrixEffectEdge extends MatrixEdgeBase {
  kind: 'effect';
  effectId: string;
  effectName: string | null;
  ownerDollId: string | null;
  ownerDollName: string | null;
}

export type MatrixEdge =
  | MatrixSkillEdge
  | MatrixSummonSkillEdge
  | MatrixSummonEdge
  | MatrixVertebraeEdge
  | MatrixRemoldingEdge
  | MatrixWeaponEdge
  | MatrixWeaponImprintEdge
  | MatrixKeyEdge
  | MatrixEffectEdge;

export interface MatrixEffectJson {
  effectId: string;
  effectName: string | null;
  effectTags: string[];
  exclusiveDollId: string | null;
  exclusiveDollName: string | null;
  sources: MatrixEdge[];
  interactions: MatrixEdge[];
}

interface EffectMatrixFileJson {
  generator: string;
  syncedAt: string;
  effects: MatrixEffectJson[];
  unresolvedRefs: { effectId: string; foundIn: string }[];
}

// --- Loaded matrix ---

const matrixData = matrixJson as unknown as EffectMatrixFileJson;

export const matrixEffects: MatrixEffectJson[] = matrixData.effects;

const matrixByEffectId = new Map<string, MatrixEffectJson>();
for (const entry of matrixEffects) {
  matrixByEffectId.set(entry.effectId, entry);
}

// Name index: the datamine models per-kit copies of shared-vocabulary
// effects (each doll's Frost Barrier is its own row, citations point at the
// shared row), so edges for one NAMED mechanic are spread over several ids.
// The panel treats the name as the identity — exactly what the curated
// dataset did when it kept one row per name.
const matrixByEffectName = new Map<string, MatrixEffectJson[]>();
for (const entry of matrixEffects) {
  if (!entry.effectName) {
    continue;
  }
  const list = matrixByEffectName.get(entry.effectName) ?? [];
  list.push(entry);
  matrixByEffectName.set(entry.effectName, list);
}

/** Reverse index: effect X → matrix entries whose sources say X confers them. */
const grantedByEffect = new Map<
  string,
  { target: MatrixEffectJson; edge: MatrixEffectEdge }[]
>();
for (const entry of matrixEffects) {
  for (const edge of entry.sources) {
    if (edge.kind !== 'effect') {
      continue;
    }
    let list = grantedByEffect.get(edge.effectId);
    if (!list) {
      list = [];
      grantedByEffect.set(edge.effectId, list);
    }
    list.push({ target: entry, edge });
  }
}

export function getMatrixEffect(
  effectId: string
): MatrixEffectJson | undefined {
  return matrixByEffectId.get(effectId);
}

// --- Team query ---

/** Per-slot equipment overrides for future weapon/key pickers. */
export interface TeamLoadout {
  /** dollId → weaponId; absent = default (doll carries her imprint weapon) */
  weaponByDollId?: Record<string, string | null>;
}

export interface TeamEffectSource {
  member: Doll;
  relation: 'applies' | 'gains';
  /** e.g. "Skill 2 — Covering Charge", "Key — Justice Is My Strength" */
  label: string;
  /** set when the effect is conferred through another provided effect */
  viaEffectName: string | null;
  /** id twin of viaEffectName, for tooltip lookups */
  viaEffectId: string | null;
  snippet: string;
}

export interface TeamEffectAffected {
  member: Doll;
  relation: MatrixRelation;
  /** null = the member's own kit references it directly; else the carrier effect */
  viaEffectName: string | null;
  /** id twin of viaEffectName, for tooltip lookups */
  viaEffectId: string | null;
  label: string;
  snippet: string;
}

export interface TeamEffectEntry {
  effectId: string;
  effectName: string;
  effectTags: string[];
  sources: TeamEffectSource[];
  affected: TeamEffectAffected[];
}

/** Which squad member owns a source edge (null = nobody on the team). */
function edgeOwner(edge: MatrixEdge, loadout?: TeamLoadout): string | null {
  switch (edge.kind) {
    case 'skill':
    case 'summon-skill':
    case 'summon':
    case 'vertebrae':
    case 'remolding':
    case 'weapon-imprint':
      return edge.dollId;
    case 'key':
      return edge.dollId;
    case 'weapon': {
      if (!edge.imprintDollId) {
        return null;
      }
      const equipped = loadout?.weaponByDollId?.[edge.imprintDollId];
      // Default assumption: the doll carries her own imprint weapon
      if (equipped === undefined) {
        return edge.imprintDollId;
      }
      return equipped === edge.weaponId ? edge.imprintDollId : null;
    }
    case 'effect':
      return edge.ownerDollId;
  }
}

/** Short human label for an edge's surface (member name shown separately). */
function edgeLabel(edge: MatrixEdge): string {
  switch (edge.kind) {
    case 'skill':
      return `${edge.skillType ?? 'Skill'} — ${edge.skillName ?? 'Unknown'}`;
    case 'summon-skill':
      return `Summon ${edge.summonName ?? '?'} — ${edge.skillName ?? 'Unknown'}`;
    case 'summon':
      return `Summon ${edge.summonName ?? '?'}`;
    case 'vertebrae':
      return `Vertebrae Lv${edge.level ?? '?'}`;
    case 'remolding':
      return edge.stage != null ? `Remolding ${edge.stage}` : 'Remolding';
    case 'weapon':
      return `Weapon — ${edge.weaponName}`;
    case 'weapon-imprint':
      return `Weapon imprint — ${edge.weaponName ?? '?'}`;
    case 'key':
      return `Key — ${edge.keyTitle ?? 'Unknown'}`;
    case 'effect':
      return `Effect — ${edge.effectName ?? '?'}`;
  }
}

interface Provision {
  member: Doll;
  relation: 'applies' | 'gains';
  label: string;
  viaEffectName: string | null;
  viaEffectId: string | null;
  snippet: string;
}

/**
 * Compute the team effect list for a squad. See module docs for semantics.
 */
export function computeTeamEffects(
  squad: Doll[],
  loadout?: TeamLoadout
): TeamEffectEntry[] {
  const members = squad.filter((d): d is Doll => d != null);
  if (members.length === 0) {
    return [];
  }
  const memberIds = new Set(members.map((m) => m.id));

  // 1. Direct provisions per effect — member-owned applies/gains edges
  const provisions = new Map<string, Provision[]>();
  const addProvision = (effectId: string, p: Provision): void => {
    let list = provisions.get(effectId);
    if (!list) {
      list = [];
      provisions.set(effectId, list);
    }
    list.push(p);
  };

  for (const entry of matrixEffects) {
    for (const edge of entry.sources) {
      if (edge.kind === 'effect') {
        continue; // handled by chain expansion below
      }
      const owner = edgeOwner(edge, loadout);
      if (!owner || !memberIds.has(owner)) {
        continue;
      }
      const member = members.find((m) => m.id === owner)!;
      addProvision(entry.effectId, {
        member,
        relation: edge.relation as 'applies' | 'gains',
        label: edgeLabel(edge),
        viaEffectName: null,
        viaEffectId: null,
        snippet: edge.snippet,
      });
    }
    // Exclusive effects are part of the doll's kit — count as self-provided
    // so effect→effect chains rooted in them are followed.
    if (entry.exclusiveDollId && memberIds.has(entry.exclusiveDollId)) {
      const member = members.find((m) => m.id === entry.exclusiveDollId)!;
      addProvision(entry.effectId, {
        member,
        relation: 'gains',
        label: 'Exclusive effect',
        viaEffectName: null,
        viaEffectId: null,
        snippet: '',
      });
    }
  }

  // 2. Chain expansion — provided effect X confers further effects
  const visited = new Set<string>();
  const queue: {
    effectId: string;
    viaEffectName: string | null;
    viaEffectId: string | null;
  }[] = [];
  for (const effectId of provisions.keys()) {
    if (!visited.has(effectId)) {
      visited.add(effectId);
      queue.push({ effectId, viaEffectName: null, viaEffectId: null });
    }
  }
  while (queue.length > 0) {
    const { effectId, viaEffectName, viaEffectId } = queue.shift()!;
    const carrierName =
      viaEffectName ?? matrixByEffectId.get(effectId)?.effectName ?? null;
    const carrierId = viaEffectId ?? effectId;
    for (const { target, edge } of grantedByEffect.get(effectId) ?? []) {
      if (visited.has(target.effectId)) {
        continue;
      }
      visited.add(target.effectId);
      for (const base of provisions.get(effectId) ?? []) {
        addProvision(target.effectId, {
          member: base.member,
          relation: edge.relation as 'applies' | 'gains',
          label: edgeLabel(edge),
          viaEffectName: carrierName,
          viaEffectId: carrierId,
          snippet: edge.snippet,
        });
      }
      queue.push({
        effectId: target.effectId,
        viaEffectName: carrierName,
        viaEffectId: carrierId,
      });
    }
  }

  // 3. Affected members per provided effect
  const effectNameById = new Map<string, string>();
  for (const e of allEffects) {
    if (e.effectName) {
      effectNameById.set(e.id, e.effectName);
    }
  }

  const entries: TeamEffectEntry[] = [];
  for (const [effectId, provs] of provisions) {
    const matrixEntry = matrixByEffectId.get(effectId);
    const affected: TeamEffectAffected[] = [];
    const seen = new Set<string>();
    const addAffected = (a: TeamEffectAffected): void => {
      const key = `${a.member.id}:${a.relation}:${a.viaEffectName ?? ''}:${a.label}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      affected.push(a);
    };

    // Members who gain the effect on themselves carry it
    for (const p of provs) {
      if (p.relation === 'gains') {
        addAffected({
          member: p.member,
          relation: 'gains',
          viaEffectName: p.viaEffectName,
          viaEffectId: p.viaEffectId,
          label: p.label,
          snippet: p.snippet,
        });
      }
    }

    // Interactions live on whichever same-named copy the citing text points
    // at (usually the shared one); gather them across the whole name group.
    const entryName =
      matrixEntry?.effectName ?? effectNameById.get(effectId) ?? null;
    const nameGroup = entryName
      ? (matrixByEffectName.get(entryName) ?? [])
      : matrixEntry
        ? [matrixEntry]
        : [];
    for (const groupEntry of nameGroup) {
      for (const edge of groupEntry.interactions) {
        if (edge.kind === 'effect') {
          // An effect references this one — attribute to whoever carries it
          const carrierId = edge.effectId;
          const carrierName =
            effectNameById.get(carrierId) ??
            edge.effectName ??
            'unknown effect';
          const carriers = members.filter(
            (m) =>
              (matrixByEffectId.get(carrierId)?.exclusiveDollId ?? null) ===
                m.id ||
              (provisions.get(carrierId) ?? []).some(
                (p) => p.member.id === m.id && p.relation === 'gains'
              )
          );
          for (const carrier of carriers) {
            addAffected({
              member: carrier,
              relation: edge.relation,
              viaEffectName: carrierName,
              viaEffectId: carrierId,
              label: edgeLabel(edge),
              snippet: edge.snippet,
            });
          }
          continue;
        }
        const owner = edgeOwner(edge, loadout);
        if (!owner || !memberIds.has(owner)) {
          continue;
        }
        const member = members.find((m) => m.id === owner)!;
        addAffected({
          member,
          relation: edge.relation,
          viaEffectName: null,
          viaEffectId: null,
          label: edgeLabel(edge),
          snippet: edge.snippet,
        });
      }
    }

    const relationRank: Record<MatrixRelation, number> = {
      conditional: 0,
      removes: 1,
      enhances: 2,
      gains: 3,
      applies: 4,
      includes: 5,
      considered: 6,
      mentions: 7,
    };
    affected.sort(
      (a, b) =>
        relationRank[a.relation] - relationRank[b.relation] ||
        members.indexOf(a.member) - members.indexOf(b.member)
    );

    const name =
      matrixEntry?.effectName ?? effectNameById.get(effectId) ?? effectId;
    entries.push({
      effectId,
      effectName: name,
      effectTags: matrixEntry?.effectTags ?? [],
      sources: provs.sort(
        (a, b) => members.indexOf(a.member) - members.indexOf(b.member)
      ),
      affected,
    });
  }

  // One row per NAME: per-kit copies of the same mechanic collapse into a
  // single entry (the curated dataset's shape), deduping repeated edges.
  const byName = new Map<string, TeamEffectEntry>();
  const merged: TeamEffectEntry[] = [];
  for (const entry of entries) {
    const existing = byName.get(entry.effectName);
    if (!existing) {
      byName.set(entry.effectName, entry);
      merged.push(entry);
      continue;
    }
    const seenSrc = new Set(
      existing.sources.map((s) => `${s.member.id}:${s.relation}:${s.label}`)
    );
    for (const s of entry.sources) {
      const key = `${s.member.id}:${s.relation}:${s.label}`;
      if (!seenSrc.has(key)) {
        seenSrc.add(key);
        existing.sources.push(s);
      }
    }
    const seenAff = new Set(
      existing.affected.map(
        (a) =>
          `${a.member.id}:${a.relation}:${a.viaEffectName ?? ''}:${a.label}`
      )
    );
    for (const a of entry.affected) {
      const key = `${a.member.id}:${a.relation}:${a.viaEffectName ?? ''}:${a.label}`;
      if (!seenAff.has(key)) {
        seenAff.add(key);
        existing.affected.push(a);
      }
    }
    existing.effectTags = [
      ...new Set([...existing.effectTags, ...entry.effectTags]),
    ];
  }

  merged.sort(
    (a, b) =>
      b.affected.length - a.affected.length ||
      a.effectName.localeCompare(b.effectName)
  );
  return merged;
}
