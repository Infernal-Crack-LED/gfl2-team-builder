/**
 * Team effect list — for the current squad, shows every effect the team can
 * put on the field (with its source: doll + skill/weapon/key/vertebrae) and
 * which teammates care about it (behavior that references the effect,
 * directly or via an effect they carry — e.g. Makiatto's Alert triggering
 * off Frost Barrier).
 *
 * Data comes from `data/effect-matrix.json` via computeTeamEffects; the
 * matrix is rebuilt automatically at the end of every sync. Each card also
 * shows the effect's derived buff/debuff tags (`data/effect-tags.json` via
 * getEffectTags), and the filter box matches tag labels — type "defense
 * down" to see every defense-down source on the squad.
 */

import { useMemo, useState } from 'react';
import type { Doll } from '../data';
import { resolveEffectMarkers } from '../data';
import {
  computeTeamEffects,
  type MatrixRelation,
  type TeamEffectEntry,
} from '../effectMatrix';
import { effectTagLabel, getEffectTags } from '../effectTags';

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

function EffectCard({ entry }: { entry: TeamEffectEntry }) {
  const [open, setOpen] = useState(false);
  // Derived tags (from data/effect-tags.json) that aren't already shown via
  // the upstream tag chips — e.g. "Defense Down" next to upstream "Defense".
  const upstreamLower = new Set(entry.effectTags.map((t) => t.toLowerCase()));
  const derivedTags = getEffectTags(entry.effectId).filter(
    (id) =>
      !upstreamLower.has(id) && !upstreamLower.has(effectTagLabel(id).toLowerCase())
  );

  return (
    <div className="teameffect-card">
      <button
        type="button"
        className="teameffect-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="teameffect-name">{entry.effectName}</span>
        {entry.effectTags.map((tag) => (
          <span
            key={tag}
            className={
              'teameffect-tag' +
              (tag === 'Debuff' ? ' teameffect-tag-debuff' : '')
            }
          >
            {tag}
          </span>
        ))}
        {derivedTags.map((id) => (
          <span
            key={id}
            className={
              'teameffect-tag teameffect-tag-derived' +
              (id === 'debuff' ? ' teameffect-tag-debuff' : '')
            }
          >
            {effectTagLabel(id)}
          </span>
        ))}
        <span className="teameffect-count">
          {entry.affected.length > 0
            ? `affects ${entry.affected.length}`
            : 'no interactions'}
        </span>
      </button>

      {open && (
        <div className="teameffect-body">
          <div className="teameffect-section">
            <div className="teameffect-section-title">Sources</div>
            {entry.sources.map((s, i) => (
              <div
                key={i}
                className="teameffect-row"
                title={snippetText(s.snippet)}
              >
                <span className="teameffect-member">{s.member.name}</span>
                <span className={'teameffect-relation teameffect-rel-' + s.relation}>
                  {RELATION_LABEL[s.relation]}
                </span>
                <span className="teameffect-label">{s.label}</span>
                {s.viaEffectName && (
                  <span className="teameffect-via">via {s.viaEffectName}</span>
                )}
              </div>
            ))}
          </div>

          <div className="teameffect-section">
            <div className="teameffect-section-title">
              Affected teammates
            </div>
            {entry.affected.length === 0 && (
              <div className="teameffect-row teameffect-row-muted">
                Nobody on this team interacts with it.
              </div>
            )}
            {entry.affected.map((a, i) => (
              <div
                key={i}
                className="teameffect-row"
                title={snippetText(a.snippet)}
              >
                <span className="teameffect-member">{a.member.name}</span>
                <span className={'teameffect-relation teameffect-rel-' + a.relation}>
                  {RELATION_LABEL[a.relation]}
                </span>
                {a.viaEffectName ? (
                  <span className="teameffect-via">via {a.viaEffectName}</span>
                ) : (
                  <span className="teameffect-label">{a.label}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function TeamEffectsPanel({ squad }: { squad: (Doll | null)[] }) {
  const members = useMemo(() => squad.filter((d) => d != null), [squad]);
  const entries = useMemo(() => computeTeamEffects(members), [members]);
  const [filter, setFilter] = useState('');

  if (members.length === 0) {
    return null;
  }

  const needle = filter.trim().toLowerCase();
  const visible = needle
    ? entries.filter(
        (e) =>
          e.effectName.toLowerCase().includes(needle) ||
          e.effectTags.some((tag) => tag.toLowerCase().includes(needle)) ||
          getEffectTags(e.effectId).some(
            (id) =>
              id.includes(needle) ||
              effectTagLabel(id).toLowerCase().includes(needle)
          )
      )
    : entries;

  return (
    <section className="teambuilder-effects">
      <div className="teambuilder-effects-head">
        <h2>Team Effects</h2>
        <span className="muted">
          {entries.length} effect{entries.length === 1 ? '' : 's'} from this
          squad
        </span>
        <input
          type="search"
          className="teambuilder-effects-filter"
          placeholder="Filter by name or tag…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      {visible.length === 0 ? (
        <p className="muted">No effects match.</p>
      ) : (
        <div className="teambuilder-effects-list">
          {visible.map((entry) => (
            <EffectCard key={entry.effectId} entry={entry} />
          ))}
        </div>
      )}
    </section>
  );
}
