/**
 * Team effect list — for the current squad, shows every effect the team can
 * put on the field and how the members interact through it.
 *
 * The list is partitioned by team relevance, because a flat dump drowns the
 * one thing this page exists to show (cross-member synergy) in single-doll
 * noise:
 *   - Team synergies: a member's kit uses an effect SOMEONE ELSE provides.
 *     Few, high-signal, rendered expanded.
 *   - Own-kit effects: a member interacting with her own effect. True no
 *     matter who else is on the team, so the whole tier starts collapsed.
 *   - Also on the field: provided effects nobody's kit reacts to — one chip
 *     row, each chip carrying the effect text as a tooltip.
 *
 * Rows are merged per member+relation: "gains — Passive · Skill 3 · Vertebrae
 * Lv2" is one row, not four, with each surface keeping its own text snippet
 * as a tooltip. Carrier rows (member gains what she herself provides — a
 * duplicate of the Sources list) and weak "mentions" edges are dropped from
 * the interaction view; a head toggle brings mentions back.
 *
 * Data comes from `data/effect-matrix.json` via computeTeamEffects; the
 * matrix is rebuilt automatically at the end of every sync. The filter box
 * matches names and tag labels across all three tiers — type "defense down"
 * to see every defense-down source on the squad.
 */

import { Fragment, useMemo, useState } from 'react';
import type { Doll } from '../data';
import {
  getEffectById,
  getEffectDetails,
  PHASE_COLORS,
  resolveEffectMarkers,
} from '../data';
import {
  computeTeamEffects,
  type MatrixRelation,
  type TeamEffectAffected,
  type TeamEffectEntry,
} from '../effectMatrix';
import { effectTagLabel, getEffectTags } from '../effectTags';
import { GameIcon } from './GameIcon';

const RELATION_LABEL: Record<MatrixRelation, string> = {
  applies: 'applies',
  gains: 'gains',
  removes: 'removes',
  conditional: 'conditional',
  enhances: 'enhances',
  includes: 'includes',
  considered: 'counts as',
  mentions: 'mentions',
};

/** Flatten a snippet's effect markers into plain text for tooltips. */
function snippetText(snippet: string): string {
  if (!snippet) {
    return '';
  }
  return resolveEffectMarkers(snippet)
    .map((seg) => (typeof seg === 'string' ? seg : seg.name))
    .join('');
}

/** An effect's base description as tooltip text, or undefined for none. */
function effectTooltip(
  effectId: string | null | undefined
): string | undefined {
  if (!effectId) {
    return undefined;
  }
  const effect = getEffectById(effectId);
  const main = effect ? getEffectDetails(effect).main : null;
  return main ? snippetText(main) : undefined;
}

// --- Row merging ---

/** The common shape of a source or affected edge, for shared row rendering. */
interface RowEdge {
  member: Doll;
  relation: MatrixRelation;
  viaEffectName: string | null;
  viaEffectId: string | null;
  label: string;
  snippet: string;
}

interface MergedRow extends Omit<RowEdge, 'label' | 'snippet'> {
  parts: { label: string; snippet: string }[];
}

/**
 * One row per member+relation+via, surfaces merged: five "Asteria gains …"
 * edges become a single row listing all five surfaces. Input order is kept
 * (Map preserves insertion order), so upstream sorting survives.
 */
function mergeRows(edges: RowEdge[]): MergedRow[] {
  const map = new Map<string, MergedRow>();
  for (const e of edges) {
    const key = `${e.member.id}|${e.relation}|${e.viaEffectName ?? ''}`;
    let row = map.get(key);
    if (!row) {
      row = {
        member: e.member,
        relation: e.relation,
        viaEffectName: e.viaEffectName,
        viaEffectId: e.viaEffectId,
        parts: [],
      };
      map.set(key, row);
    }
    if (!row.parts.some((p) => p.label === e.label)) {
      row.parts.push({ label: e.label, snippet: e.snippet });
    }
  }
  return [...map.values()];
}

// --- Classification ---

type Tier = 'synergy' | 'own-kit' | 'field';

interface ClassifiedEntry {
  entry: TeamEffectEntry;
  tier: Tier;
  /** Affected edges that are real interactions (not carrier-gains, not mentions). */
  interactions: TeamEffectAffected[];
  /** Weak "mentions" edges, shown only behind the head toggle. */
  mentions: TeamEffectAffected[];
  /** Distinct members whose kits interact with the effect, in squad order. */
  interactors: Doll[];
}

/**
 * Tier an entry by who reacts to it. Carrier rows (relation 'gains') mirror
 * the Sources list one-for-one, so they never count as interactions; mentions
 * are too weak to drive tiering either way.
 *
 * Cross-member means an interacting member has a provider OTHER than herself
 * — not "isn't a provider at all": Makiatto both gains Frost Barrier and
 * reacts to it, but Helen applying it to the team is still a synergy.
 */
function classify(entry: TeamEffectEntry): ClassifiedEntry {
  const interactions = entry.affected.filter(
    (a) => a.relation !== 'gains' && a.relation !== 'mentions'
  );
  const mentions = entry.affected.filter((a) => a.relation === 'mentions');
  const interactors: Doll[] = [];
  for (const a of interactions) {
    if (!interactors.some((d) => d.id === a.member.id)) {
      interactors.push(a.member);
    }
  }
  const cross = interactors.some((d) =>
    entry.sources.some((s) => s.member.id !== d.id)
  );
  const tier: Tier =
    interactions.length === 0 ? 'field' : cross ? 'synergy' : 'own-kit';
  return { entry, tier, interactions, mentions, interactors };
}

// --- Rendering ---

/** Member name with her portrait — faces scan faster than repeated text. */
function MemberChip({ doll }: { doll: Doll }) {
  return (
    <span className="teameffect-member">
      {doll.avatarUrl ? (
        <GameIcon className="teameffect-avatar" src={doll.avatarUrl} alt="" />
      ) : (
        <span
          className="teameffect-avatar teameffect-avatar-empty"
          aria-hidden="true"
        >
          {doll.name.charAt(0)}
        </span>
      )}
      {doll.name}
    </span>
  );
}

/**
 * A merged row. When the edge came through a carrier effect the surface
 * labels just repeat the carrier's name, so the row shows "via X" instead —
 * with the referencing snippet (falling back to X's own text) as the tooltip.
 */
function EffectRow({ row }: { row: MergedRow }) {
  return (
    <div className="teameffect-row">
      <MemberChip doll={row.member} />
      <span className={'teameffect-relation teameffect-rel-' + row.relation}>
        {RELATION_LABEL[row.relation]}
      </span>
      {row.viaEffectName ? (
        <span
          className="teameffect-via"
          data-tooltip={
            snippetText(row.parts[0]?.snippet ?? '') ||
            effectTooltip(row.viaEffectId)
          }
        >
          via {row.viaEffectName}
        </span>
      ) : (
        <span className="teameffect-labels">
          {row.parts.map((p, i) => (
            <Fragment key={i}>
              {i > 0 && <span className="teameffect-label-sep"> · </span>}
              <span
                className="teameffect-label"
                data-tooltip={snippetText(p.snippet) || undefined}
              >
                {p.label}
              </span>
            </Fragment>
          ))}
        </span>
      )}
    </div>
  );
}

/** Tag chip descriptor — upstream tags and derived ones render alike. */
interface TagChip {
  key: string;
  label: string;
  debuff: boolean;
  buff: boolean;
  /** Element tint, same palette as the character-page phase pill. */
  color: string | undefined;
  derived: boolean;
}

function tagChips(entry: TeamEffectEntry): TagChip[] {
  const chips: TagChip[] = entry.effectTags.map((tag) => ({
    key: tag,
    label: tag,
    debuff: tag === 'Debuff',
    buff: tag === 'Buff',
    color: PHASE_COLORS[tag],
    derived: false,
  }));
  const upstreamLower = new Set(entry.effectTags.map((t) => t.toLowerCase()));
  for (const id of getEffectTags(entry.effectId)) {
    if (
      upstreamLower.has(id) ||
      upstreamLower.has(effectTagLabel(id).toLowerCase())
    ) {
      continue;
    }
    const label = effectTagLabel(id);
    chips.push({
      key: id,
      label,
      debuff: id === 'debuff',
      buff: id === 'buff',
      color: PHASE_COLORS[label],
      derived: true,
    });
  }
  return chips;
}

/** How many tag chips a card header shows before folding into "+N". */
const MAX_TAG_CHIPS = 4;

function EffectCard({
  classified,
  showMentions,
}: {
  classified: ClassifiedEntry;
  showMentions: boolean;
}) {
  const { entry, interactions, mentions, interactors } = classified;
  const [open, setOpen] = useState(false);

  const chips = tagChips(entry);
  const shownChips = chips.slice(0, MAX_TAG_CHIPS);
  const extraChips = chips.slice(MAX_TAG_CHIPS);

  const sourceRows = mergeRows(entry.sources);
  const usedRows = mergeRows(
    showMentions ? [...interactions, ...mentions] : interactions
  );

  return (
    <div className="teameffect-card">
      <button
        type="button"
        className="teameffect-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {/* Name over tags — two stacked lines, portraits fill the height. */}
        <span className="teameffect-headmain">
          <span
            className="teameffect-name"
            data-tooltip={effectTooltip(entry.effectId)}
          >
            {entry.effectName}
          </span>
          {chips.length > 0 && (
            <span className="teameffect-headtags">
              {shownChips.map((c) => (
                <span
                  key={c.key}
                  className={
                    'teameffect-tag' +
                    (c.derived ? ' teameffect-tag-derived' : '') +
                    (c.debuff ? ' teameffect-tag-debuff' : '') +
                    (c.buff ? ' teameffect-tag-buff' : '')
                  }
                  style={
                    c.color
                      ? { color: c.color, borderColor: c.color }
                      : undefined
                  }
                >
                  {c.label}
                </span>
              ))}
              {extraChips.length > 0 && (
                <span
                  className="teameffect-tag teameffect-tag-more"
                  data-tooltip={extraChips.map((c) => c.label).join(', ')}
                >
                  +{extraChips.length}
                </span>
              )}
            </span>
          )}
        </span>
        {/* Faces of everyone whose kit reacts — the who-cares summary that
            makes a collapsed card worth scanning. */}
        <span className="teameffect-interactors">
          {interactors.map((d) => (
            <span
              key={d.id}
              className="teameffect-interactor"
              data-tooltip={d.name}
            >
              {d.avatarUrl ? (
                <GameIcon
                  className="teameffect-avatar"
                  src={d.avatarUrl}
                  alt={d.name}
                />
              ) : (
                <span
                  className="teameffect-avatar teameffect-avatar-empty"
                  aria-hidden="true"
                >
                  {d.name.charAt(0)}
                </span>
              )}
            </span>
          ))}
        </span>
      </button>

      {open && (
        <div className="teameffect-body">
          <div className="teameffect-section">
            <div className="teameffect-section-title">Provided by</div>
            {sourceRows.map((row, i) => (
              <EffectRow key={i} row={row} />
            ))}
          </div>

          {usedRows.length > 0 && (
            <div className="teameffect-section">
              <div className="teameffect-section-title">Used by</div>
              {usedRows.map((row, i) => (
                <EffectRow key={i} row={row} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TeamEffectsPanel({ squad }: { squad: (Doll | null)[] }) {
  const members = useMemo(() => squad.filter((d) => d != null), [squad]);
  const entries = useMemo(() => computeTeamEffects(members), [members]);
  const [filter, setFilter] = useState('');
  const [showMentions, setShowMentions] = useState(false);

  const classified = useMemo(() => entries.map(classify), [entries]);

  if (members.length === 0) {
    return null;
  }

  const needle = filter.trim().toLowerCase();
  const matches = (e: TeamEffectEntry): boolean =>
    !needle ||
    e.effectName.toLowerCase().includes(needle) ||
    e.effectTags.some((tag) => tag.toLowerCase().includes(needle)) ||
    getEffectTags(e.effectId).some(
      (id) =>
        id.includes(needle) || effectTagLabel(id).toLowerCase().includes(needle)
    );

  const visible = classified.filter((c) => matches(c.entry));
  const synergy = visible
    .filter((c) => c.tier === 'synergy')
    .sort(
      (a, b) =>
        b.interactors.length - a.interactors.length ||
        a.entry.effectName.localeCompare(b.entry.effectName)
    );
  const ownKit = visible
    .filter((c) => c.tier === 'own-kit')
    .sort((a, b) => a.entry.effectName.localeCompare(b.entry.effectName));
  const field = visible
    .filter((c) => c.tier === 'field')
    .sort((a, b) => a.entry.effectName.localeCompare(b.entry.effectName));

  return (
    <section className="teambuilder-effects">
      <div className="teambuilder-effects-head">
        <h2>Team Effects</h2>
        <label className="teambuilder-effects-mentions">
          <input
            type="checkbox"
            checked={showMentions}
            onChange={(e) => setShowMentions(e.target.checked)}
          />
          show mentions
        </label>
        <input
          type="search"
          className="teambuilder-effects-filter"
          placeholder="Filter by name or tag…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {visible.length === 0 && <p className="muted">No effects match.</p>}

      {(synergy.length > 0 || !needle) && (
        <details className="teameffect-tier" open>
          <summary className="teameffect-tier-title">
            Team synergies
            <span className="teameffect-tier-count">{synergy.length}</span>
          </summary>
          {synergy.length === 0 ? (
            <p className="muted teameffect-tier-empty">
              No cross-member synergies yet — effects one member provides and
              another member's kit uses will show up here.
            </p>
          ) : (
            <div className="teambuilder-effects-list">
              {synergy.map((c) => (
                <EffectCard
                  key={c.entry.effectId}
                  classified={c}
                  showMentions={showMentions}
                />
              ))}
            </div>
          )}
        </details>
      )}

      {ownKit.length > 0 && (
        /* Collapsed by default; forced open while a filter needle is active
           so matches inside it aren't invisible. */
        <details className="teameffect-tier" open={needle ? true : undefined}>
          <summary className="teameffect-tier-title">
            Own-kit effects
            <span className="teameffect-tier-count">{ownKit.length}</span>
            <span className="teameffect-tier-hint">
              members interacting with their own effects
            </span>
          </summary>
          <div className="teambuilder-effects-list">
            {ownKit.map((c) => (
              <EffectCard
                key={c.entry.effectId}
                classified={c}
                showMentions={showMentions}
              />
            ))}
          </div>
        </details>
      )}

      {field.length > 0 && (
        <div className="teameffect-tier">
          <h3 className="teameffect-tier-title">
            Also on the field
            <span className="teameffect-tier-count">{field.length}</span>
            <span className="teameffect-tier-hint">
              provided, but nobody's kit reacts — hover for what each does
            </span>
          </h3>
          <div className="teameffect-chips">
            {field.map((c) => {
              const debuff =
                c.entry.effectTags.includes('Debuff') ||
                getEffectTags(c.entry.effectId).includes('debuff');
              const buff =
                !debuff &&
                (c.entry.effectTags.includes('Buff') ||
                  getEffectTags(c.entry.effectId).includes('buff'));
              return (
                <span
                  key={c.entry.effectId}
                  className={
                    'teameffect-chip' +
                    (debuff ? ' teameffect-chip-debuff' : '') +
                    (buff ? ' teameffect-chip-buff' : '')
                  }
                  data-tooltip={effectTooltip(c.entry.effectId)}
                >
                  {c.entry.effectName}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
