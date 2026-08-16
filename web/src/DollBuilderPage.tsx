/**
 * Per-doll builder page (/builder/<slug>) — pick a weapon, keys, vertebrae,
 * refinement, stat preferences, and common keys for one character, then
 * save (login-gated) or share via URL.
 *
 * State is a single DollBuild-derived object; encodeDollBuild serializes it
 * for both the save control and the share links. Boot order on load:
 * `?b=<code>` applies synchronously in the state initializer (no flash of
 * default state); `?id=<uuid>` needs a network round-trip so it lands in an
 * effect. `?b=` wins when both are present — it needs no fetch.
 *
 * Sets its own document head (per-doll title/description) like DollPage, so
 * useDocumentHead skips this route's detail URLs.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  allWeapons,
  getAllCommonKeys,
  getDollBySlug,
  getKeysForDoll,
  getVertebraeForDoll,
  getWeaponById,
  getWeaponForDoll,
  PHASE_COLORS,
  STAT_PREF_OPTIONS,
  REFINEMENT_LEVELS,
  type Doll,
  type Key,
  type Weapon,
} from './data';
import { RichText } from './components/RichText';
import { BuildCardPreview } from './components/BuildCardPreview';
import {
  BUILD_VERSION,
  decodeDollBuild,
  encodeDollBuild,
  shareProfileName,
} from '../../src/share/buildCode';
import { BUILD_KIND, saveProfile, useAuth } from './auth';
import { SaveProfileControl } from './components/SaveProfileControl';
import { hrefFor, hrefForBuilder, hrefForDoll, onSpaLinkClick } from './router';
import { setDetailMeta } from './useDocumentHead';
import {
  SHARE_PROFILE_KIND,
  bootBuildFromCodeParam,
  bootIdFromSearch,
  fetchSharedBuild,
} from './buildShare';

/** Max fixed keys a doll can equip. */
const MAX_FIXED_KEYS = 3;
/** Max common keys a doll can equip. */
const MAX_COMMON_KEYS = 3;

/** Editable slice of a DollBuild — the doll slug is fixed by the route. */
interface BuildState {
  weapon: string | null;
  keys: string[];
  /** Selected expansion key id — separate from `keys`, outside its cap. */
  expansionKey: string | null;
  vert: number[];
  refinement: number | null;
  statPrefs: string[];
  commonKeys: string[];
}

/** Resolved, stripped effect text for card bodies. */
function EffectText({ text }: { text: string | null }) {
  return <RichText text={text} className="dollbuilder-effect" />;
}

/**
 * Clipboard write with a textarea fallback — navigator.clipboard requires a
 * secure context and permission, and both can be missing (plain-http dev
 * hosts, denied prompts). Returns false only if both paths fail.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fall through to the legacy path.
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export function DollBuilderPage({ slug }: { slug: string | null }) {
  const doll = slug ? getDollBySlug(slug) : undefined;
  if (!doll) {
    return (
      <div className="app dollbuilder-page">
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
  // key={doll.slug}: navigating /builder/a → /builder/b must REMOUNT, not
  // reuse state — the build selections belong to the doll in the URL.
  return <DollBuilder key={doll.slug} doll={doll} />;
}

function DollBuilder({ doll }: { doll: Doll }) {
  const { user } = useAuth();

  // The doll's imprint weapon is the sensible default selection. The
  // imprintDollId lookup is authoritative; doll.weaponImprint is a denormalized
  // copy ({ id, name, trait, effect }) used as a fallback.
  const imprintWeapon = useMemo(
    () =>
      getWeaponForDoll(doll.id) ??
      (typeof doll.weaponImprint?.id === 'string'
        ? getWeaponById(doll.weaponImprint.id)
        : undefined),
    [doll]
  );

  const dollKeys = useMemo(() => getKeysForDoll(doll.id), [doll]);
  const vertebrae = useMemo(() => getVertebraeForDoll(doll), [doll]);
  const commonKeys = useMemo(
    () =>
      getAllCommonKeys().sort((a, b) =>
        (a.displayTitle ?? a.keyTitle ?? '').localeCompare(
          b.displayTitle ?? b.keyTitle ?? ''
        )
      ),
    []
  );

  /**
   * Drop ids that don't resolve against this doll's data — a hand-edited or
   * stale share code must apply cleanly, never produce phantom selections.
   */
  const sanitize = useCallback(
    (build: {
      weapon: string | null;
      keys: string[];
      vert: number[];
      cal?: number | null;
      stats?: string[];
      ck?: string[];
      exp?: string | null;
    }): BuildState => {
      const validFixedKeys = new Set(
        dollKeys.filter((k) => k.keyType === 'Fixed Key').map((k) => k.id)
      );
      const validExpansionKeys = new Set(
        dollKeys.filter((k) => k.keyType === 'Expansion Key').map((k) => k.id)
      );
      const validVerts = new Set(vertebrae.map((v) => v.segment));
      const validCommonKeys = new Set(commonKeys.map((k) => k.id));
      return {
        weapon:
          build.weapon && getWeaponById(build.weapon) ? build.weapon : null,
        // Only fixed keys go in the keys array; capped at MAX_FIXED_KEYS.
        keys: build.keys
          .filter((id) => validFixedKeys.has(id))
          .slice(0, MAX_FIXED_KEYS),
        // Expansion key lives outside the fixed-key cap.
        expansionKey:
          build.exp && validExpansionKeys.has(build.exp) ? build.exp : null,
        // Single-select vertebrae — keep at most the first valid one.
        vert: build.vert.filter((s) => validVerts.has(s)).slice(0, 1),
        refinement:
          typeof build.cal === 'number' &&
          Number.isInteger(build.cal) &&
          build.cal >= 1 &&
          build.cal <= 6
            ? build.cal
            : null,
        statPrefs: (build.stats ?? []).filter((s) =>
          (STAT_PREF_OPTIONS as readonly string[]).includes(s)
        ).slice(0, 4),
        commonKeys: (build.ck ?? [])
          .filter((id) => validCommonKeys.has(id))
          .slice(0, MAX_COMMON_KEYS),
      };
    },
    [dollKeys, vertebrae, commonKeys]
  );

  // ?b= boot happens synchronously in the initializer so the shared build is
  // the FIRST render — applying it in an effect would flash the default state.
  const [build, setBuild] = useState<BuildState>(() => {
    const boot = bootBuildFromCodeParam(window.location.search, doll.slug);
    return boot
      ? sanitize(boot)
      : {
          weapon: imprintWeapon?.id ?? null,
          keys: [],
          expansionKey: null,
          vert: [],
          refinement: 1,
          statPrefs: [],
          commonKeys: [],
        };
  });

  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<'link' | 'short' | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimer.current) {
        clearTimeout(copyTimer.current);
      }
    };
  }, []);

  // Per-doll document head (useDocumentHead skips /builder/<slug>).
  useEffect(() => {
    setDetailMeta(
      `${doll.name} Builder — GFL2 Weapon, Keys & Vertebrae Planner`,
      `Plan ${doll.name}'s build in Girls' Frontline 2: Exilium: pick a weapon, unlock keys, choose vertebra segments, and share the build with a link.`
    );
  }, [doll]);

  // ?id= boot — the async counterpart of the ?b= initializer above. Skipped
  // when a valid ?b= already claimed the state (it needs no fetch).
  useEffect(() => {
    if (bootBuildFromCodeParam(window.location.search, doll.slug)) {
      return;
    }
    const id = bootIdFromSearch(window.location.search);
    if (!id) {
      return;
    }
    let live = true;
    fetchSharedBuild(id, doll.slug).then((shared) => {
      if (live && shared) {
        setBuild(sanitize(shared));
      }
    });
    return () => {
      live = false;
    };
  }, [doll, sanitize]);

  const applyLoadedCode = useCallback(
    (code: string) => {
      const decoded = decodeDollBuild(code);
      if (!decoded) {
        setNotice('Could not read that saved build.');
        return;
      }
      if (decoded.doll !== doll.slug) {
        // A save from another doll's page — refuse rather than clobber state.
        setNotice(
          'That saved build is for a different doll — nothing changed.'
        );
        return;
      }
      setBuild(sanitize(decoded));
      setNotice(null);
    },
    [doll, sanitize]
  );

  const getCode = useCallback(
    () =>
      encodeDollBuild({
        v: BUILD_VERSION,
        doll: doll.slug,
        weapon: build.weapon,
        keys: build.keys,
        vert: build.vert,
        cal: build.refinement,
        stats: build.statPrefs,
        ck: build.commonKeys,
        exp: build.expansionKey,
      }),
    [doll, build]
  );

  const flashCopied = useCallback((which: 'link' | 'short') => {
    setCopied(which);
    if (copyTimer.current) {
      clearTimeout(copyTimer.current);
    }
    copyTimer.current = setTimeout(() => setCopied(null), 1500);
  }, []);

  const copyLongLink = useCallback(async () => {
    const url = `${window.location.origin}${hrefForBuilder(doll.slug)}?b=${getCode()}`;
    if (await copyText(url)) {
      flashCopied('link');
    } else {
      setNotice('Copy failed — select the URL and copy it manually.');
    }
  }, [doll, getCode, flashCopied]);

  const copyShortLink = useCallback(async () => {
    const code = getCode();
    const base = `${window.location.origin}${hrefForBuilder(doll.slug)}`;
    try {
      const row = await saveProfile(
        SHARE_PROFILE_KIND,
        shareProfileName(code),
        code
      );
      if (await copyText(`${base}?id=${row.id}`)) {
        flashCopied('short');
        return;
      }
    } catch {
      // Fall through to the long link.
    }
    // Sharing never breaks, it only gets longer — any failure (logged-out
    // token, offline, endpoint down) degrades to the self-contained ?b= URL.
    if (await copyText(`${base}?b=${code}`)) {
      flashCopied('link');
    } else {
      setNotice('Copy failed — select the URL and copy it manually.');
    }
  }, [doll, getCode, flashCopied]);

  // Toggle a fixed key on/off; respects the 3-key cap.
  const toggleKey = useCallback((id: string) => {
    setBuild((prev) => {
      if (prev.keys.includes(id)) {
        return { ...prev, keys: prev.keys.filter((k) => k !== id) };
      }
      if (prev.keys.length >= MAX_FIXED_KEYS) {
        return prev;
      }
      return { ...prev, keys: [...prev.keys, id] };
    });
  }, []);

  // Toggle the expansion key — single-select, outside the fixed-key cap.
  const toggleExpansionKey = useCallback((id: string) => {
    setBuild((prev) => ({
      ...prev,
      expansionKey: prev.expansionKey === id ? null : id,
    }));
  }, []);

  // Single-select vertebrae: clicking the active one deselects it; clicking
  // a different one swaps to it.
  const selectVert = useCallback((segment: number) => {
    setBuild((prev) => ({
      ...prev,
      vert: prev.vert.includes(segment) ? [] : [segment],
    }));
  }, []);

  const toggleCommonKey = useCallback((id: string) => {
    setBuild((prev) => {
      if (prev.commonKeys.includes(id)) {
        return { ...prev, commonKeys: prev.commonKeys.filter((k) => k !== id) };
      }
      if (prev.commonKeys.length >= MAX_COMMON_KEYS) {
        return prev;
      }
      return { ...prev, commonKeys: [...prev.commonKeys, id] };
    });
  }, []);

  const toggleStatPref = useCallback((stat: string) => {
    setBuild((prev) => {
      if (prev.statPrefs.includes(stat)) {
        return {
          ...prev,
          statPrefs: prev.statPrefs.filter((s) => s !== stat),
        };
      }
      if (prev.statPrefs.length >= 4) {
        return prev;
      }
      return { ...prev, statPrefs: [...prev.statPrefs, stat] };
    });
  }, []);

  const phaseColor = PHASE_COLORS[doll.phase ?? ''] ?? 'var(--border)';
  const selectedWeapon = build.weapon ? getWeaponById(build.weapon) : undefined;

  // Build card preview data — derived from current build state.
  const [showPreview, setShowPreview] = useState(false);
  const cardPreviewData = useMemo(() => {
    const keyNames = [
      ...build.keys
        .map((id) => {
          const k = dollKeys.find((dk) => dk.id === id);
          return k?.displayTitle ?? k?.keyTitle ?? null;
        })
        .filter((n): n is string => n != null),
    ];
    if (build.expansionKey) {
      const ek = dollKeys.find((dk) => dk.id === build.expansionKey);
      const name = ek?.displayTitle ?? ek?.keyTitle ?? null;
      if (name) {
        keyNames.push(name);
      }
    }
    const commonKeyNames = build.commonKeys
      .map((id) => {
        const k = commonKeys.find((ck) => ck.id === id);
        return k?.displayTitle ?? k?.keyTitle ?? null;
      })
      .filter((n): n is string => n != null);
    return {
      dollName: doll.name,
      dollClass: doll.class,
      dollPhase: doll.phase,
      dollRarity: doll.rarity,
      weaponName: selectedWeapon?.name ?? null,
      keyNames,
      vert: build.vert,
      portraitUrl: doll.avatarUrl,
      refinement: build.refinement,
      statPrefs: build.statPrefs,
      commonKeyNames,
    };
  }, [doll, build, dollKeys, commonKeys, selectedWeapon]);

  // Partition keys by type for the builder sections.
  const fixedKeys = dollKeys.filter((k) => k.keyType === 'Fixed Key');
  const expansionKeys = dollKeys.filter((k) => k.keyType === 'Expansion Key');

  return (
    <div className="app dollbuilder-page">
      {/* Breadcrumbs */}
      <nav className="unit-crumbs">
        <a
          href={hrefFor('characters')}
          onClick={onSpaLinkClick(hrefFor('characters'))}
        >
          Characters
        </a>
        {' / '}
        <a
          href={hrefForDoll(doll.slug)}
          onClick={onSpaLinkClick(hrefForDoll(doll.slug))}
        >
          {doll.name}
        </a>
        {' / '}
        Builder
      </nav>

      {/* Header: portrait + name + identity pills (DollPage pattern) */}
      <div className="unit-header">
        {doll.avatarUrl ? (
          <img
            className="portrait unit-portrait"
            src={doll.avatarUrl}
            alt={doll.name}
            loading="lazy"
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
          <h1>{doll.name} — Builder</h1>
          <div className="unit-idents">
            {doll.class && <span className="unit-ident">{doll.class}</span>}
            {doll.phase && (
              <span
                className="unit-ident"
                style={{ borderColor: phaseColor, color: phaseColor }}
              >
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
          </div>
        </div>
      </div>

      {/* Save / share actions */}
      <div className="dollbuilder-actions">
        <SaveProfileControl
          kind={BUILD_KIND}
          getCode={getCode}
          onLoad={applyLoadedCode}
        />
        <button type="button" className="btn-outline" onClick={copyLongLink}>
          {copied === 'link' ? '✓ Copied' : 'Copy link'}
        </button>
        {user && (
          <button type="button" className="btn-outline" onClick={copyShortLink}>
            {copied === 'short' ? '✓ Copied' : 'Copy short link'}
          </button>
        )}
      </div>
      {notice && (
        <p className="dollbuilder-notice" role="alert">
          {notice}
        </p>
      )}

      {/* Weapon */}
      <section className="unit-section unit-panel">
        <h2>Weapon</h2>
        {selectedWeapon ? (
          <div className="dollbuilder-selected">
            {selectedWeapon.imageUrl ? (
              <img
                className="portrait portrait-contain dollbuilder-selected-img"
                src={selectedWeapon.imageUrl}
                alt={selectedWeapon.name}
                loading="lazy"
              />
            ) : (
              <div
                className="portrait portrait-empty dollbuilder-selected-img"
                aria-hidden="true"
              >
                ?
              </div>
            )}
            <div className="dollbuilder-selected-body">
              <div className="dollbuilder-selected-head">
                <strong>{selectedWeapon.name}</strong>
                <span className="muted">
                  {[selectedWeapon.rarity, selectedWeapon.weaponType]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <button
                  type="button"
                  className="chip"
                  onClick={() =>
                    setBuild((prev) => ({ ...prev, weapon: null }))
                  }
                >
                  Remove
                </button>
              </div>
              <EffectText text={selectedWeapon.trait} />
              <EffectText text={selectedWeapon.effect} />
            </div>
          </div>
        ) : (
          <p className="muted">No weapon selected.</p>
        )}
        <WeaponPicker
          selectedId={build.weapon}
          imprintId={imprintWeapon?.id ?? null}
          onSelect={(id) => setBuild((prev) => ({ ...prev, weapon: id }))}
        />
      </section>

      {/* Weapon Refinement */}
      <section className="unit-section unit-panel">
        <h2>Refinement</h2>
        <div className="dollbuilder-refinement">
          {REFINEMENT_LEVELS.map((r) => (
            <button
              key={r}
              type="button"
              className={
                'dollbuilder-ref-btn' + (build.refinement === r ? ' on' : '')
              }
              aria-pressed={build.refinement === r}
              onClick={() =>
                setBuild((prev) => ({
                  ...prev,
                  refinement: prev.refinement === r ? null : r,
                }))
              }
            >
              R{r}
            </button>
          ))}
        </div>
      </section>

      {/* Stat Preferences */}
      <section className="unit-section unit-panel">
        <h2>
          Stat Preferences
          {build.statPrefs.length > 0 && (
            <span className="dollbuilder-count">
              {build.statPrefs.length}/4
            </span>
          )}
        </h2>
        <p className="muted dollbuilder-hint">
          Click stats in priority order (1 → 2 → 3 → 4). Click again to
          remove.
        </p>
        {build.statPrefs.length > 0 && (
          <div className="dollbuilder-stat-summary">
            {build.statPrefs.map((stat, i) => (
              <span key={stat} className="dollbuilder-stat-chosen">
                <span className="dollbuilder-stat-rank">{i + 1}</span>
                {stat}
                <button
                  type="button"
                  className="dollbuilder-stat-remove"
                  aria-label={`Remove ${stat}`}
                  onClick={() => toggleStatPref(stat)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="dollbuilder-stat-options">
          {STAT_PREF_OPTIONS.map((stat) => {
            const chosen = build.statPrefs.includes(stat);
            const rank = chosen
              ? build.statPrefs.indexOf(stat) + 1
              : null;
            const full = build.statPrefs.length >= 4 && !chosen;
            return (
              <button
                key={stat}
                type="button"
                className={
                  'dollbuilder-stat-btn' +
                  (chosen ? ' on' : '') +
                  (full ? ' disabled' : '')
                }
                aria-pressed={chosen}
                disabled={full}
                onClick={() => toggleStatPref(stat)}
              >
                {stat}
                {rank != null && (
                  <span className="dollbuilder-stat-badge">{rank}</span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Keys — Fixed (3×2 grid, left) + Expansion (right) */}
      <section className="unit-section unit-panel">
        <h2>
          Keys
          <span className="dollbuilder-count">
            {build.keys.length}/{MAX_FIXED_KEYS} fixed
          </span>
        </h2>
        <div className="dollbuilder-key-layout">
          <div className="dollbuilder-key-fixed-col">
            <h3>Fixed Keys</h3>
            {fixedKeys.length > 0 ? (
              <div className="dollbuilder-key-grid">
                {fixedKeys.map((key) => {
                  const on = build.keys.includes(key.id);
                  const atCap =
                    build.keys.length >= MAX_FIXED_KEYS && !on;
                  return (
                    <KeyCard
                      key={key.id}
                      keyData={key}
                      on={on}
                      disabled={atCap}
                      onToggle={() => toggleKey(key.id)}
                    />
                  );
                })}
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
                  <KeyCard
                    key={key.id}
                    keyData={key}
                    on={build.expansionKey === key.id}
                    onToggle={() => toggleExpansionKey(key.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Common Keys — searchable picker, up to 3 selections */}
      <section className="unit-section unit-panel">
        <h2>
          Common Keys
          <span className="dollbuilder-count">
            {build.commonKeys.length}/{MAX_COMMON_KEYS}
          </span>
        </h2>
        {build.commonKeys.length > 0 && (
          <div className="dollbuilder-ck-chosen">
            {build.commonKeys.map((id) => {
              const ck = commonKeys.find((k) => k.id === id);
              if (!ck) {
                return null;
              }
              return (
                <div
                  key={id}
                  className="dollbuilder-selected dollbuilder-ck-selected"
                >
                  <div className="dollbuilder-selected-body">
                    <div className="dollbuilder-selected-head">
                      {ck.imageUrl ? (
                        <img
                          className="dollbuilder-key-icon"
                          src={ck.imageUrl}
                          alt=""
                          loading="lazy"
                        />
                      ) : null}
                      <strong>
                        {ck.displayTitle ?? ck.keyTitle ?? 'Common Key'}
                      </strong>
                      {ck.attributes && ck.attributes.length > 0 && (
                        <span className="muted">
                          {ck.attributes
                            .map((a) => `${a.name}: ${a.value}`)
                            .join(' · ')}
                        </span>
                      )}
                      <button
                        type="button"
                        className="chip"
                        onClick={() => toggleCommonKey(ck.id)}
                      >
                        Remove
                      </button>
                    </div>
                    <EffectText text={ck.effect} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <CommonKeyPicker
          selectedIds={build.commonKeys}
          commonKeys={commonKeys}
          onSelect={toggleCommonKey}
          atCap={build.commonKeys.length >= MAX_COMMON_KEYS}
        />
      </section>

      {/* Vertebrae — single select */}
      <section className="unit-section unit-panel">
        <h2>
          Vertebrae
          <span className="dollbuilder-count">
            {build.vert.length > 0 ? `V${build.vert[0]}` : 'none'}
          </span>
        </h2>
        <p className="muted dollbuilder-hint">Select one vertebra segment.</p>
        {vertebrae.length > 0 ? (
          <div className="dollbuilder-vert-grid">
            {vertebrae.map((v) => {
              const on = build.vert.includes(v.segment);
              return (
                <button
                  key={v.segment}
                  type="button"
                  className={'dollbuilder-vert-card' + (on ? ' on' : '')}
                  aria-pressed={on}
                  onClick={() => selectVert(v.segment)}
                >
                  <span className="dollbuilder-vert-head">
                    <span className="dollbuilder-vert-num">V{v.segment}</span>
                    {v.name && <strong>{v.name}</strong>}
                    {v.level != null && (
                      <span className="muted">Lv{v.level}</span>
                    )}
                  </span>
                  <EffectText text={v.effect} />
                </button>
              );
            })}
          </div>
        ) : (
          <p className="muted">No vertebrae data available.</p>
        )}
      </section>

      {/* Build card preview */}
      <section className="unit-section unit-panel">
        <h2>
          <button
            type="button"
            className="dollbuilder-preview-toggle"
            onClick={() => setShowPreview((v) => !v)}
            aria-expanded={showPreview}
          >
            Share Card Preview
            <span className="dollbuilder-preview-arrow">
              {showPreview ? '▾' : '▸'}
            </span>
          </button>
        </h2>
        {showPreview && <BuildCardPreview data={cardPreviewData} />}
      </section>
    </div>
  );
}

/** Searchable weapon list — every weapon, imprint first, then name-sorted. */
function WeaponPicker({
  selectedId,
  imprintId,
  onSelect,
}: {
  selectedId: string | null;
  imprintId: string | null;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState('');

  const weapons = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? allWeapons.filter((w) => w.name.toLowerCase().includes(q))
      : allWeapons;
    return [...list].sort((a, b) => {
      // Imprint weapon floats to the top — it's the canonical pick.
      const ai = a.id === imprintId ? 0 : 1;
      const bi = b.id === imprintId ? 0 : 1;
      return ai - bi || a.name.localeCompare(b.name);
    });
  }, [query, imprintId]);

  return (
    <div className="dollbuilder-picker">
      <input
        type="search"
        placeholder="Search weapons…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search weapons"
      />
      <div className="dollbuilder-picker-list">
        {weapons.map((w) => (
          <WeaponRow
            key={w.id}
            weapon={w}
            on={w.id === selectedId}
            imprint={w.id === imprintId}
            onSelect={() => onSelect(w.id)}
          />
        ))}
        {weapons.length === 0 && (
          <p className="muted">No weapons match "{query}".</p>
        )}
      </div>
    </div>
  );
}

function WeaponRow({
  weapon,
  on,
  imprint,
  onSelect,
}: {
  weapon: Weapon;
  on: boolean;
  imprint: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={'dollbuilder-weapon-row' + (on ? ' on' : '')}
      aria-pressed={on}
      onClick={onSelect}
    >
      {weapon.imageUrl ? (
        <img
          className="portrait portrait-contain portrait-sm"
          src={weapon.imageUrl}
          alt=""
          loading="lazy"
        />
      ) : (
        <span
          className="portrait portrait-empty portrait-sm"
          aria-hidden="true"
        >
          ?
        </span>
      )}
      <span className="dollbuilder-weapon-name">{weapon.name}</span>
      <span className="muted">
        {[weapon.rarity, weapon.weaponType].filter(Boolean).join(' · ')}
      </span>
      {imprint && <span className="unit-ident elite">Imprint</span>}
    </button>
  );
}

function KeyCard({
  keyData,
  on,
  disabled,
  onToggle,
}: {
  keyData: Key;
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={
        'dollbuilder-key-card' +
        (on ? ' on' : '') +
        (disabled ? ' disabled' : '')
      }
      aria-pressed={on}
      disabled={disabled}
      onClick={onToggle}
    >
      <span className="dollbuilder-key-head">
        {keyData.imageUrl ? (
          <img
            className="dollbuilder-key-icon"
            src={keyData.imageUrl}
            alt=""
            loading="lazy"
          />
        ) : (
          <span
            className="dollbuilder-key-icon dollbuilder-key-icon-empty"
            aria-hidden="true"
          >
            ?
          </span>
        )}
        <strong>{keyData.displayTitle ?? keyData.keyTitle ?? 'Key'}</strong>
        {keyData.level != null && (
          <span className="muted">Lv{keyData.level}</span>
        )}
      </span>
      {keyData.attributes && keyData.attributes.length > 0 && (
        <span className="dollbuilder-key-attrs">
          {keyData.attributes.map((attr, i) => (
            <span key={i}>
              {attr.name}: {attr.value}
            </span>
          ))}
        </span>
      )}
      <EffectText text={keyData.effect} />
    </button>
  );
}

/** Searchable common key picker — all common keys, name-sorted, multi-select. */
function CommonKeyPicker({
  selectedIds,
  commonKeys,
  onSelect,
  atCap,
}: {
  selectedIds: string[];
  commonKeys: Key[];
  onSelect: (id: string) => void;
  atCap: boolean;
}) {
  const [query, setQuery] = useState('');
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return commonKeys;
    }
    return commonKeys.filter(
      (k) =>
        (k.displayTitle ?? k.keyTitle ?? '').toLowerCase().includes(q)
    );
  }, [query, commonKeys]);

  return (
    <div className="dollbuilder-picker">
      <input
        type="search"
        placeholder="Search common keys…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search common keys"
      />
      <div className="dollbuilder-picker-list dollbuilder-ck-list">
        {filtered.map((k) => {
          const on = selectedSet.has(k.id);
          const disabled = atCap && !on;
          return (
            <button
              key={k.id}
              type="button"
              className={
                'dollbuilder-weapon-row' +
                (on ? ' on' : '') +
                (disabled ? ' disabled' : '')
              }
              aria-pressed={on}
              disabled={disabled}
              onClick={() => onSelect(k.id)}
            >
              {k.imageUrl ? (
                <img
                  className="dollbuilder-key-icon"
                  src={k.imageUrl}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <span
                  className="dollbuilder-key-icon dollbuilder-key-icon-empty"
                  aria-hidden="true"
                >
                  ?
                </span>
              )}
              <span className="dollbuilder-weapon-name">
                {k.displayTitle ?? k.keyTitle ?? 'Common Key'}
              </span>
              {k.attributes && k.attributes.length > 0 && (
                <span className="muted">
                  {k.attributes
                    .map((a) => `${a.name}: ${a.value}`)
                    .join(' · ')}
                </span>
              )}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="muted">No common keys match "{query}".</p>
        )}
      </div>
    </div>
  );
}
