/**
 * Doll detail page — nikke-sim UnitPage structure: breadcrumbs, a header
 * (96px .unit-portrait + name + identity pills), then stacked .unit-panel
 * sections. Everything derived from data/*.json. Degrades, never vanishes:
 * a section without data shows one muted line instead of disappearing.
 *
 * No section renders a raw blob: game text goes through <RichText> (tags
 * stripped, `[<kind>:<uuid>]` markers swapped for names), and the two fields
 * the sync pipeline stores verbatim — vertebrae and the remolding pattern —
 * come in already distilled from getVertebraeForDoll/getRemoldingPattern.
 *
 * Sets its own document head (title/description/canonical) so the full
 * dataset doesn't land in the eager entry chunk.
 */
import { useEffect, useState } from 'react';
import {
  ammoOption,
  classOption,
  getAllCommonKeys,
  getAttachmentSet,
  getDollById,
  getDollBySlug,
  getEffectDetails,
  getEffectsForDoll,
  getKeysForDoll,
  getRemoldingPattern,
  getVertebraeForDoll,
  getWeaponById,
  getWeaponForDoll,
  imagoOption,
  phaseOption,
  STAT_PREF_OPTIONS,
  weaponTypeOption,
  dollWeaponType,
  PHASE_COLORS,
  type Doll,
  type Effect,
  type FilterOption,
  type Key,
  type Skill,
  type Weapon,
} from './data';
import { GameIcon } from './components/GameIcon';
import { StaticKeyCard } from './components/KeyCard';
import { RichText } from './components/RichText';
import {
  RecCardPreview,
  type RecCardPreviewData,
} from './components/RecCardPreview';
import { decodeRecBuild, type RecBuild } from '../../src/share/buildCode';
import { commonKeySource, fixedKeySlot } from '../../src/share/keyLabels';
import {
  hrefFor,
  hrefForBuilder,
  hrefForWeapon,
  onSpaLinkClick,
} from './router';
import { escapeJsonLd } from './jsonLd';
import { dollPageMeta, setDetailMeta } from './useDocumentHead';

/**
 * The iopwiki icon for an identity pill, when the row has one. Rarity has no
 * wiki art, and an unrecognized value (a new class from a CN-only doll) simply
 * resolves to nothing — the pill still renders its label.
 */
function IdentIcon({ option }: { option: FilterOption | undefined }) {
  if (!option?.icon) {
    return null;
  }
  return (
    <img
      className="pill-icon"
      src={option.icon}
      alt=""
      data-colored={option.colored ? '' : undefined}
      loading="lazy"
    />
  );
}

/** Render a skill with level-variant tabs. */
function SkillSection({ skill }: { skill: Skill }) {
  const [level, setLevel] = useState(1);

  const descriptions = [
    skill.description,
    skill.descriptionLevel2,
    skill.descriptionLevel3,
    skill.descriptionLevel4,
  ];
  const currentDesc = descriptions[level - 1] ?? skill.description;

  return (
    <div className="unit-skill">
      <h3>
        {skill.imageUrl && (
          <GameIcon className="unit-skill-icon" src={skill.imageUrl} />
        )}
        {skill.name ?? 'Skill'}
      </h3>
      {skill.skillTags && skill.skillTags.length > 0 && (
        <div className="unit-skill-tags">
          {skill.skillTags.map((tag, i) => (
            <span key={i} className="unit-ident">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Level tabs (only if level variants exist). Only levels that
          actually have a description get a tab — some skills skip levels
          (e.g. base + Lv3 only), and a tab for a missing level would
          silently re-show the base text. */}
      {(skill.descriptionLevel2 ||
        skill.descriptionLevel3 ||
        skill.descriptionLevel4) && (
        <div className="pills small unit-skill-tabs">
          {[1, 2, 3, 4]
            .filter((lv) => descriptions[lv - 1])
            .map((lv) => (
              <button
                key={lv}
                type="button"
                className={level === lv ? 'on' : ''}
                aria-pressed={level === lv}
                onClick={() => setLevel(lv)}
              >
                Lv{lv}
              </button>
            ))}
        </div>
      )}

      <RichText text={currentDesc} className="unit-skill-desc" />

      {/* Skill metadata */}
      <div className="unit-skill-meta">
        {skill.stabilityDamage != null && (
          <span>Stability: {skill.stabilityDamage}</span>
        )}
        {skill.cooldown != null && <span>Cooldown: {skill.cooldown}</span>}
        {skill.rangeValue != null && (
          <span>
            Range: {skill.rangeValue}
            {skill.effectiveArea ? ` (${skill.effectiveArea})` : ''}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * One exclusive effect: its base text, plus the V3/V6 rewrites when the
 * effect has them. The rewrites restate the whole effect rather than
 * describing a delta, so they're tabbed, not stacked.
 */
function EffectEntry({ effect }: { effect: Effect }) {
  const { main, upgrades } = getEffectDetails(effect);
  const [upgrade, setUpgrade] = useState<number>(-1);
  const shown = upgrade === -1 ? main : (upgrades[upgrade]?.details ?? main);

  return (
    <li>
      <strong>{effect.effectName ?? 'Unknown'}</strong>
      {upgrades.length > 0 && (
        <div className="pills small unit-skill-tabs">
          <button
            type="button"
            className={upgrade === -1 ? 'on' : ''}
            aria-pressed={upgrade === -1}
            onClick={() => setUpgrade(-1)}
          >
            Base
          </button>
          {upgrades.map((u, i) => (
            <button
              key={i}
              type="button"
              className={upgrade === i ? 'on' : ''}
              aria-pressed={upgrade === i}
              onClick={() => setUpgrade(i)}
            >
              {u.name ?? `Upgrade ${i + 1}`}
            </button>
          ))}
        </div>
      )}
      <RichText text={shown} className="muted" />
    </li>
  );
}

/** Renders the elite counterpart card for a weapon. */
function SigWeaponCounterparts({ weapon }: { weapon: Weapon }) {
  const counterparts: {
    label: string;
    blob: Record<string, unknown> | null;
  }[] = [{ label: 'Elite', blob: weapon.eliteCounterpart }].filter(
    (c) => c.blob != null
  );

  if (counterparts.length === 0) {
    return null;
  }

  return (
    <div className="dollpage-counterparts">
      <span className="label">Counterparts</span>
      <div className="dollpage-counterparts-grid">
        {counterparts.map((c) => {
          const id = c.blob!.id as string | undefined;
          const resolved = id ? getWeaponById(id) : undefined;
          const slug = resolved?.slug;
          const name = (c.blob!.name as string | undefined) ?? c.label;
          const rarity = (c.blob!.rarity as string | undefined) ?? null;
          const imageUrl = (c.blob!.imageUrl as string | undefined) ?? null;

          const inner = (
            <div className="dollpage-counterpart-card">
              {imageUrl ? (
                <GameIcon
                  className="portrait portrait-contain dollpage-counterpart-img"
                  src={imageUrl}
                  alt={name}
                />
              ) : (
                <div
                  className="portrait portrait-empty dollpage-counterpart-img"
                  aria-hidden="true"
                >
                  ?
                </div>
              )}
              <div className="dollpage-counterpart-info">
                <strong>{name}</strong>
                {rarity && (
                  <span
                    className={
                      'unit-ident' + (rarity === 'Elite' ? ' elite' : '')
                    }
                  >
                    {rarity}
                  </span>
                )}
              </div>
            </div>
          );

          return slug ? (
            <a
              key={c.label}
              href={hrefForWeapon(slug)}
              onClick={onSpaLinkClick(hrefForWeapon(slug))}
              className="dollpage-counterpart-link"
            >
              {inner}
            </a>
          ) : (
            <div key={c.label}>{inner}</div>
          );
        })}
      </div>
    </div>
  );
}

/** Display name for a key, matching the server-side keyDisplayName(). */
function keyName(key: Key | undefined): string | null {
  return key?.displayTitle ?? key?.keyTitle ?? null;
}

/**
 * Turn a decoded community recommendation code into the preview data shape
 * used by <RecCardPreview>. Mirrors the previewData memo in RecCardTool.
 */
function buildRecCardPreviewData(
  doll: Doll,
  build: RecBuild
): RecCardPreviewData {
  const dollKeys = getKeysForDoll(doll.id);
  const commonKeys = getAllCommonKeys();
  const fixedKeySlots = build.keys
    .map((id) => dollKeys.find((k) => k.id === id))
    .filter((k): k is Key => k !== undefined)
    .map(fixedKeySlot)
    .filter((n): n is number => n !== null);
  const expKey = build.exp
    ? dollKeys.find((k) => k.id === build.exp)
    : undefined;

  return {
    dollName: doll.name,
    dollClass: doll.class,
    dollPhase: doll.phase,
    dollRarity: doll.rarity,
    breakpoints: build.bp,
    optimal: build.opt ?? null,
    weapons: build.ws
      .map((id) => getWeaponById(id))
      .filter((w): w is NonNullable<typeof w> => w !== undefined)
      .map((w) => ({ name: w.name, imageUrl: w.imageUrl ?? null })),
    attachmentSets: build.sets.filter((s) => getAttachmentSet(s)),
    fixedKeySlots,
    expansionKeyName: expKey ? (expKey.keyTitle ?? keyName(expKey)) : null,
    commonKeySources: (build.ck ?? [])
      .map((id) => commonKeys.find((k) => k.id === id))
      .filter((k): k is Key => k !== undefined)
      .map((k) =>
        commonKeySource(k, getDollById(k.dollId ?? '')?.name ?? null)
      ),
    statPrefs: (build.stats ?? []).filter((s) =>
      (STAT_PREF_OPTIONS as readonly string[]).includes(s)
    ),
    notes: build.notes ?? null,
    portraitUrl: doll.avatarUrl,
  };
}

/**
 * Collapsible community recommendation card for a doll. Fetches the default
 * recommendation from /api/v1/rec-defaults/:slug and renders it with the same
 * preview component used by the card creator.
 */
function RecommendedBuildSection({ doll }: { doll: Doll }) {
  const [preview, setPreview] = useState<RecCardPreviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPreview(null);

    fetch(`/api/v1/rec-defaults/${doll.slug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { code?: string } | null) => {
        if (cancelled) {
          return;
        }
        const decoded =
          typeof data?.code === 'string' ? decodeRecBuild(data.code) : null;
        if (decoded) {
          setPreview(buildRecCardPreviewData(doll, decoded));
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [doll]);

  return (
    <details className="unit-section unit-panel rec-section">
      <summary className="rec-section-summary">Recommended Build</summary>
      {loading ? (
        <p className="muted">Loading community recommendation…</p>
      ) : preview ? (
        <RecCardPreview data={preview} />
      ) : (
        <p className="muted">No community recommendation available yet.</p>
      )}
    </details>
  );
}

export function DollPage({ slug }: { slug: string | null }) {
  const doll = slug ? getDollBySlug(slug) : undefined;

  // Set document head for this doll
  useEffect(() => {
    if (doll) {
      const meta = dollPageMeta(doll);
      setDetailMeta(meta.title, meta.description);

      // JSON-LD
      const existing = document.getElementById('jsonld-page');
      if (existing) {
        existing.remove();
      }
      const script = document.createElement('script');
      script.id = 'jsonld-page';
      script.type = 'application/ld+json';
      script.innerHTML = escapeJsonLd({
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: `${doll.name} — GFL2 Doll`,
        about: {
          '@type': 'Thing',
          name: doll.name,
        },
      });
      document.head.appendChild(script);
      return () => {
        script.remove();
      };
    }
  }, [doll]);

  if (!doll) {
    return (
      <div className="app dollpage">
        <h1>Doll not found</h1>
        <p className="muted">
          <a
            href={hrefFor('characters')}
            onClick={onSpaLinkClick(hrefFor('characters'))}
          >
            ← Back to characters
          </a>
        </p>
      </div>
    );
  }

  const dollKeys = getKeysForDoll(doll.id);
  // Affinity keys are an affinity-level stat reward, not a build choice — the
  // same reason the Keys page hides them (see KEY_TYPE_OPTIONS). Her own
  // common key gets its own panel; fixed and expansion share the Keys grid.
  const fixedKeys = dollKeys.filter((k) => k.keyType === 'Fixed Key');
  const expansionKeys = dollKeys.filter((k) => k.keyType === 'Expansion Key');
  const dollCommonKeys = dollKeys.filter((k) => k.keyType === 'Common Key');
  const dollEffects = getEffectsForDoll(doll.id);
  const imprintWeapon = getWeaponForDoll(doll.id);
  const vertebrae = getVertebraeForDoll(doll);
  const remolding = getRemoldingPattern(doll);
  const phaseColor = PHASE_COLORS[doll.phase ?? ''] ?? 'var(--border)';

  return (
    <div className="app dollpage">
      {/* Breadcrumbs */}
      <nav className="unit-crumbs">
        <a
          href={hrefFor('characters')}
          onClick={onSpaLinkClick(hrefFor('characters'))}
        >
          Characters
        </a>
        {' / '}
        {doll.name}
      </nav>

      {/* Header: 96px portrait + name + identity pills */}
      <div className="unit-header">
        {doll.avatarUrl ? (
          <GameIcon
            className="portrait unit-portrait"
            src={doll.avatarUrl}
            alt={doll.name}
          />
        ) : (
          <div
            className="portrait portrait-empty unit-portrait"
            aria-hidden="true"
          >
            ?
          </div>
        )}
        <div className="unit-meta">
          <h1>{doll.name}</h1>
          <div className="unit-idents">
            {doll.class && (
              <span className="unit-ident">
                <IdentIcon option={classOption(doll.class)} />
                {doll.class}
              </span>
            )}
            {doll.phase && (
              <span
                className="unit-ident"
                style={{ borderColor: phaseColor, color: phaseColor }}
              >
                <IdentIcon option={phaseOption(doll.phase)} />
                {doll.phase}
              </span>
            )}
            {doll.rarity && (
              <span
                className={
                  'unit-ident' + (doll.rarity === 'Elite' ? ' elite' : '')
                }
              >
                {doll.rarity}
              </span>
            )}
            {/* One pill per ammo type — each carries its own icon, so joining
                them into a single pill would leave all but the first unlabeled. */}
            {(doll.ammoTypes ?? []).map((ammo) => (
              <span key={ammo} className="unit-ident">
                <IdentIcon option={ammoOption(ammo)} />
                {ammo}
              </span>
            ))}
            {dollWeaponType(doll) && (
              <span className="unit-ident">
                <IdentIcon option={weaponTypeOption(dollWeaponType(doll))} />
                {dollWeaponType(doll)}
              </span>
            )}
            {doll.movement != null && (
              <span className="unit-ident">Move: {doll.movement}</span>
            )}
            {doll.stabilityGauge != null && (
              <span className="unit-ident">
                Stability: {doll.stabilityGauge}
              </span>
            )}
            {doll.regionTag === 'cn' && (
              <span className="unit-ident cn">CN</span>
            )}
            {doll.preview && (
              <span className="unit-ident preview">Unreleased</span>
            )}
          </div>
          <div className="unit-actions">
            <a
              className="btn-primary"
              href={hrefForBuilder(doll.slug)}
              onClick={onSpaLinkClick(hrefForBuilder(doll.slug))}
            >
              Open in builder
            </a>
          </div>
        </div>
      </div>

      {/* Recommended build — community default, collapsed by default */}
      <RecommendedBuildSection doll={doll} />

      {/* Skills */}
      <section className="unit-section unit-panel">
        <h2>Skills</h2>
        {doll.skills && doll.skills.length > 0 ? (
          <div className="unit-skills-grid">
            {doll.skills.map((skill, i) => (
              <SkillSection key={i} skill={skill} />
            ))}
          </div>
        ) : (
          <p className="muted">No skill data available.</p>
        )}
      </section>

      {/* Weapon imprint + sig weapon counterparts */}
      <section className="unit-section unit-panel">
        <h2>Weapon Imprint</h2>
        {imprintWeapon ? (
          <div className="dollpage-imprint">
            <div className="dollpage-imprint-weapon">
              {imprintWeapon.imageUrl && (
                <GameIcon
                  className="portrait portrait-contain dollpage-imprint-img"
                  src={imprintWeapon.imageUrl}
                  alt={imprintWeapon.name}
                />
              )}
              <div className="dollpage-imprint-body">
                <div className="dollpage-imprint-head">
                  <a
                    href={hrefForWeapon(imprintWeapon.slug)}
                    onClick={onSpaLinkClick(hrefForWeapon(imprintWeapon.slug))}
                  >
                    <strong>{imprintWeapon.name}</strong>
                  </a>
                  <span className="muted">
                    {[imprintWeapon.rarity, imprintWeapon.weaponType]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                <div className="dollpage-imprint-stats">
                  {imprintWeapon.primaryAttribute && (
                    <span className="unit-ident">
                      {imprintWeapon.primaryAttribute}:{' '}
                      {imprintWeapon.primaryAttributeStat}
                    </span>
                  )}
                  {imprintWeapon.secondaryAttribute && (
                    <span className="unit-ident">
                      {imprintWeapon.secondaryAttribute}:{' '}
                      {imprintWeapon.secondaryAttributeStat}
                    </span>
                  )}
                </div>
                {imprintWeapon.trait && (
                  <div className="dollpage-imprint-section">
                    <span className="label">Trait</span>
                    <RichText
                      text={imprintWeapon.trait}
                      className="dollpage-imprint-text"
                    />
                  </div>
                )}
                {imprintWeapon.effect && (
                  <div className="dollpage-imprint-section">
                    <span className="label">Effect</span>
                    <RichText
                      text={imprintWeapon.effect}
                      className="dollpage-imprint-text"
                    />
                  </div>
                )}
                {imprintWeapon.imprintDescription && (
                  <div className="dollpage-imprint-section">
                    <span className="label">Imprint Bonus</span>
                    <RichText
                      text={imprintWeapon.imprintDescription}
                      className="dollpage-imprint-text"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Sig weapon counterparts */}
            <SigWeaponCounterparts weapon={imprintWeapon} />
          </div>
        ) : (
          <p className="muted">No weapon imprint data.</p>
        )}
      </section>

      {/* Vertebrae */}
      <section className="unit-section unit-panel">
        <h2>Vertebrae</h2>
        {vertebrae.length > 0 ? (
          <div className="unit-keys-grid">
            {vertebrae.map((v) => (
              <div key={v.id} className="unit-key-card">
                <h3>
                  {v.segment != null ? `V${v.segment}` : 'Vertebra'}
                  {v.name ? ` — ${v.name}` : ''}
                </h3>
                <RichText text={v.effect} />
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No vertebrae data.</p>
        )}
      </section>

      {/* Her own common key — its own panel, since it unlocks separately from
          the fixed/expansion keys below and any doll can equip it. */}
      <section className="unit-section unit-panel">
        <h2>Common Key</h2>
        {dollCommonKeys.length > 0 ? (
          <div className="dollbuilder-key-grid">
            {dollCommonKeys.map((key) => (
              <StaticKeyCard key={key.id} keyData={key} />
            ))}
          </div>
        ) : (
          <p className="muted">No common key data.</p>
        )}
      </section>

      {/* Keys — the builder's layout: fixed grid left, expansion right */}
      <section className="unit-section unit-panel">
        <h2>Keys</h2>
        {fixedKeys.length > 0 || expansionKeys.length > 0 ? (
          <div className="dollbuilder-key-layout">
            <div className="dollbuilder-key-fixed-col">
              <h3>Fixed Keys</h3>
              {fixedKeys.length > 0 ? (
                <div className="dollbuilder-key-grid">
                  {fixedKeys.map((key) => (
                    <StaticKeyCard key={key.id} keyData={key} />
                  ))}
                </div>
              ) : (
                <p className="muted">No fixed key data.</p>
              )}
            </div>
            {expansionKeys.length > 0 && (
              <div className="dollbuilder-key-expansion-col">
                <h3>Expansion</h3>
                <div className="dollbuilder-key-grid">
                  {expansionKeys.map((key) => (
                    <StaticKeyCard key={key.id} keyData={key} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="muted">No key data available.</p>
        )}
      </section>

      {/* Remolding pattern */}
      <section className="unit-section unit-panel">
        <h2>Remolding Pattern</h2>
        {remolding ? (
          <>
            <div className="unit-idents unit-remold-summary">
              {remolding.dollCore && (
                <span className="unit-ident">
                  {/* "Support Core" → the Support class icon. */}
                  <IdentIcon
                    option={classOption(
                      remolding.dollCore.replace(/\s*core$/i, '')
                    )}
                  />
                  {remolding.dollCore}
                </span>
              )}
              {remolding.coreSlots
                .filter((slot) => slot.value > 0)
                .map((slot) => (
                  <span key={slot.label} className="unit-ident">
                    <IdentIcon option={classOption(slot.label)} />
                    {slot.label} ×{slot.value}
                  </span>
                ))}
              {remolding.statBoosts.map((boost) => (
                <span key={boost.level} className="unit-ident">
                  Lv{boost.level}:{' '}
                  {boost.stats.map((s) => `${s.label} +${s.value}`).join(' / ')}
                </span>
              ))}
            </div>
            {remolding.imagoforms.length > 0 && (
              <ol className="unit-imagoforms">
                {remolding.imagoforms.map((form) => (
                  <li key={form.id}>
                    <div className="unit-imago-head">
                      <strong>{form.stage ?? 'Stage'}</strong>
                      {form.coreLevel != null && (
                        <span className="muted">Core Lv{form.coreLevel}</span>
                      )}
                      {/* Imago factor costs, one icon+count per class. Zero-cost
                          classes are dropped rather than shown as "×0". */}
                      {form.factors
                        .filter((f) => f.value > 0)
                        .map((f) => (
                          <span key={f.label} className="unit-imago-cost">
                            <IdentIcon option={imagoOption(f.label)} />
                            {f.value}
                          </span>
                        ))}
                    </div>
                    <RichText
                      text={form.effect}
                      className="unit-imago-effect"
                    />
                  </li>
                ))}
              </ol>
            )}
          </>
        ) : (
          <p className="muted">No remolding pattern data.</p>
        )}
      </section>

      {/* Exclusive effects */}
      <section className="unit-section unit-panel">
        <h2>Exclusive Effects</h2>
        {dollEffects.length > 0 ? (
          <ul className="unit-effects">
            {dollEffects.map((eff) => (
              <EffectEntry key={eff.id} effect={eff} />
            ))}
          </ul>
        ) : (
          <p className="muted">No exclusive effects.</p>
        )}
      </section>

      {/* Tools */}
      <section className="unit-section unit-panel">
        <h2>Tools</h2>
        <div className="unit-tools">
          <a
            className="chip"
            href={hrefFor('team-builder')}
            onClick={onSpaLinkClick(hrefFor('team-builder'))}
          >
            Team Builder
          </a>
          <a
            className="chip"
            href={hrefFor('characters')}
            onClick={onSpaLinkClick(hrefFor('characters'))}
          >
            All Characters
          </a>
          <a
            className="chip"
            href={hrefFor('weapons')}
            onClick={onSpaLinkClick(hrefFor('weapons'))}
          >
            All Weapons
          </a>
        </div>
      </section>
    </div>
  );
}
