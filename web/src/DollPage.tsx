/**
 * Doll detail page — everything derived from data/*.json. Degrades, never
 * vanishes: a section without data shows one muted line instead of
 * disappearing. [effect:<uuid>] markers resolve to effect names via the
 * shared data.ts helper.
 *
 * Sets its own document head (title/description/canonical) so the full
 * dataset doesn't land in the eager entry chunk.
 */
import { useEffect, useState } from 'react';
import {
  getDollBySlug,
  getEffectsForDoll,
  getKeysForDoll,
  getWeaponForDoll,
  resolveEffectMarkers,
  PHASE_COLORS,
  type Skill,
  type TextSegment,
} from './data';
import { hrefFor, hrefForWeapon, onSpaLinkClick } from './router';
import { escapeJsonLd } from './jsonLd';
import { setDetailMeta } from './useDocumentHead';

/** Render text segments with effect references as <span title>. */
function RenderText({ segments }: { segments: TextSegment[] }) {
  return (
    <>
      {segments.map((seg, i) =>
        typeof seg === 'string' ? (
          <span key={i}>{seg}</span>
        ) : (
          <span key={i} className="effect-ref" title={seg.name}>
            {seg.name}
          </span>
        )
      )}
    </>
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
    <div className="dollpage-skill">
      <h3>{skill.name ?? 'Skill'}</h3>
      {skill.skillTags && skill.skillTags.length > 0 && (
        <div className="dollpage-skill-tags">
          {skill.skillTags.map((tag, i) => (
            <span key={i} className="dollpage-tag">
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
        <div className="dollpage-skill-tabs">
          {[1, 2, 3, 4]
            .filter((lv) => descriptions[lv - 1])
            .map((lv) => (
              <button
                key={lv}
                type="button"
                className={'pill-toggle' + (level === lv ? ' on' : '')}
                aria-pressed={level === lv}
                onClick={() => setLevel(lv)}
              >
                Lv{lv}
              </button>
            ))}
        </div>
      )}

      <div className="dollpage-skill-desc">
        <RenderText segments={resolveEffectMarkers(currentDesc)} />
      </div>

      {/* Skill metadata */}
      <div className="dollpage-skill-meta">
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

export function DollPage({ slug }: { slug: string | null }) {
  const doll = slug ? getDollBySlug(slug) : undefined;

  // Set document head for this doll
  useEffect(() => {
    if (doll) {
      setDetailMeta(
        `${doll.name} — GFL2 Doll Kit & Stats`,
        `${doll.name}: ${doll.class ?? 'Unknown class'} ${doll.phase ?? ''} doll in Girls' Frontline 2: Exilium. View skills, keys, and stats.`
      );

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
  const dollEffects = getEffectsForDoll(doll.id);
  const imprintWeapon = getWeaponForDoll(doll.id);
  const phaseColor = PHASE_COLORS[doll.phase ?? ''] ?? 'var(--border)';

  return (
    <div className="app dollpage">
      {/* Breadcrumb */}
      <nav className="dollpage-breadcrumb">
        <a
          href={hrefFor('characters')}
          onClick={onSpaLinkClick(hrefFor('characters'))}
        >
          Characters
        </a>
        {' › '}
        {doll.name}
      </nav>

      {/* Header */}
      <div className="dollpage-header">
        <div className="dollpage-portrait">
          {doll.avatarUrl ? (
            <img src={doll.avatarUrl} alt={doll.name} loading="lazy" />
          ) : (
            <div className="portrait-empty" aria-hidden="true">
              ?
            </div>
          )}
        </div>
        <div className="dollpage-info">
          <h1>{doll.name}</h1>
          <div className="dollpage-ident">
            {doll.phase && (
              <span
                className="dollpage-ident-pill"
                style={{ borderColor: phaseColor }}
              >
                {doll.phase}
              </span>
            )}
            {doll.class && (
              <span className="dollpage-ident-pill">{doll.class}</span>
            )}
            {doll.weaponImprintType && (
              <span className="dollpage-ident-pill">
                {doll.weaponImprintType}
              </span>
            )}
            {doll.ammoTypes && doll.ammoTypes.length > 0 && (
              <span className="dollpage-ident-pill">
                {doll.ammoTypes.join(', ')}
              </span>
            )}
            {doll.rarity && (
              <span
                className={
                  'dollpage-ident-pill' +
                  (doll.rarity === 'Elite' ? ' elite' : '')
                }
              >
                {doll.rarity}
              </span>
            )}
            {doll.movement != null && (
              <span className="dollpage-ident-pill">Move: {doll.movement}</span>
            )}
            {doll.stabilityGauge != null && (
              <span className="dollpage-ident-pill">
                Stability: {doll.stabilityGauge}
              </span>
            )}
            {doll.regionTag === 'cn' && (
              <span className="dollpage-ident-pill cn">CN</span>
            )}
            {doll.preview && (
              <span className="dollpage-ident-pill preview">Unreleased</span>
            )}
          </div>
        </div>
      </div>

      {/* Skills */}
      <section className="dollpage-section">
        <h2>Skills</h2>
        {doll.skills && doll.skills.length > 0 ? (
          <div className="dollpage-skills">
            {doll.skills.map((skill, i) => (
              <SkillSection key={i} skill={skill} />
            ))}
          </div>
        ) : (
          <p className="muted">No skill data available.</p>
        )}
      </section>

      {/* Keys */}
      <section className="dollpage-section">
        <h2>Keys</h2>
        {dollKeys.length > 0 ? (
          <div className="dollpage-keys">
            {dollKeys.map((key) => (
              <div key={key.id} className="dollpage-key-card">
                <h3>{key.displayTitle ?? key.keyTitle ?? 'Key'}</h3>
                {key.keyType && <span className="muted">{key.keyType}</span>}
                {key.attributes && key.attributes.length > 0 && (
                  <ul>
                    {key.attributes.map((attr, i) => (
                      <li key={i}>
                        {attr.name}: {attr.value}
                      </li>
                    ))}
                  </ul>
                )}
                {key.effect && (
                  <p>
                    <RenderText segments={resolveEffectMarkers(key.effect)} />
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No key data available.</p>
        )}
      </section>

      {/* Exclusive effects */}
      <section className="dollpage-section">
        <h2>Exclusive Effects</h2>
        {dollEffects.length > 0 ? (
          <ul>
            {dollEffects.map((eff) => (
              <li key={eff.id}>
                <strong>{eff.effectName ?? 'Unknown'}</strong>
                {eff.effectDetails && (
                  <p className="muted">{eff.effectDetails}</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No exclusive effects.</p>
        )}
      </section>

      {/* Weapon imprint */}
      <section className="dollpage-section">
        <h2>Weapon Imprint</h2>
        {imprintWeapon ? (
          <div>
            <a
              href={hrefForWeapon(imprintWeapon.slug)}
              onClick={onSpaLinkClick(hrefForWeapon(imprintWeapon.slug))}
            >
              {imprintWeapon.name}
            </a>
            {imprintWeapon.primaryAttribute && (
              <span className="muted">
                {' '}
                — {imprintWeapon.primaryAttribute}{' '}
                {imprintWeapon.primaryAttributeStat}
              </span>
            )}
          </div>
        ) : (
          <p className="muted">No weapon imprint data.</p>
        )}
      </section>

      {/* Remolding pattern */}
      <section className="dollpage-section">
        <h2>Remolding Pattern</h2>
        {doll.remoldingPattern ? (
          <pre className="dollpage-remolding-table">
            {JSON.stringify(doll.remoldingPattern, null, 2)}
          </pre>
        ) : (
          <p className="muted">No remolding pattern data.</p>
        )}
      </section>

      {/* Vertebrae */}
      <section className="dollpage-section">
        <h2>Vertebrae</h2>
        {doll.vertebrae && doll.vertebrae.length > 0 ? (
          <ul className="dollpage-vertebrae">
            {doll.vertebrae.map((v, i) => (
              <li key={i}>
                <pre>{JSON.stringify(v, null, 2)}</pre>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No vertebrae data.</p>
        )}
      </section>

      {/* Bio */}
      <section className="dollpage-section">
        <h2>Bio</h2>
        {doll.bio ? (
          <p>
            <RenderText segments={resolveEffectMarkers(doll.bio)} />
          </p>
        ) : (
          <p className="muted">No bio available.</p>
        )}
      </section>

      {/* Tools */}
      <section className="dollpage-section">
        <h2>Tools</h2>
        <div className="dollpage-tools">
          <a
            href={hrefFor('team-builder')}
            onClick={onSpaLinkClick(hrefFor('team-builder'))}
          >
            Team Builder
          </a>
          <a
            href={hrefFor('characters')}
            onClick={onSpaLinkClick(hrefFor('characters'))}
          >
            All Characters
          </a>
          <a
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
