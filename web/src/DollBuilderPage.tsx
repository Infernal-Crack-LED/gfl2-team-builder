/**
 * Per-doll builder page (/builder/<slug>) — pick a weapon, keys, and
 * vertebrae for one character, then save (login-gated) or share via URL.
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
  getDollBySlug,
  getKeysForDoll,
  getWeaponById,
  getWeaponForDoll,
  resolveEffectMarkers,
  PHASE_COLORS,
  type Doll,
  type Key,
  type TextSegment,
  type Weapon,
} from './data';
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

/** Editable slice of a DollBuild — the doll slug is fixed by the route. */
interface BuildState {
  weapon: string | null;
  keys: string[];
  vert: number[];
}

/** Vertebrae entries arrive as Record<string, unknown> — narrow once here. */
interface Vertebra {
  segment: number;
  level: number | null;
  name: string | null;
  effect: string | null;
  imageUrl: string | null;
}

function toVertebra(raw: Record<string, unknown>): Vertebra | null {
  const segment = raw.segment;
  if (typeof segment !== 'number' || !Number.isInteger(segment)) {
    return null;
  }
  return {
    segment,
    level: typeof raw.level === 'number' ? raw.level : null,
    name: typeof raw.vertebraeName === 'string' ? raw.vertebraeName : null,
    effect: typeof raw.effect === 'string' ? raw.effect : null,
    imageUrl: typeof raw.imageUrl === 'string' ? raw.imageUrl : null,
  };
}

/**
 * Effect text ships as HTML fragments (`<p>`, colored `<span>`s). We keep the
 * text and drop the tags — [effect:uuid] marker resolution runs AFTER
 * stripping, since markers live in the text content.
 */
function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '');
}

/** Render text segments with effect references as <span title> (DollPage pattern). */
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

/** Resolved, stripped effect text for card bodies. */
function EffectText({ text }: { text: string | null }) {
  if (!text) {
    return null;
  }
  return (
    <p className="dollbuilder-effect">
      <RenderText segments={resolveEffectMarkers(stripHtml(text))} />
    </p>
  );
}

// Fixed display order for key groups; unknown future types append after.
const KEY_TYPE_ORDER = [
  'Affinity Key',
  'Common Key',
  'Expansion Key',
  'Fixed Key',
] as const;

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
  // copy ({ id, name, trait, effect }) used as a fallback. NOTE:
  // doll.weaponImprintType is currently empty across the dataset, so no
  // type-based filtering of the weapon list is possible yet — the picker
  // lists every weapon.
  const imprintWeapon = useMemo(
    () =>
      getWeaponForDoll(doll.id) ??
      (typeof doll.weaponImprint?.id === 'string'
        ? getWeaponById(doll.weaponImprint.id)
        : undefined),
    [doll]
  );

  const dollKeys = useMemo(() => getKeysForDoll(doll.id), [doll]);
  const vertebrae = useMemo(
    () =>
      doll.vertebrae
        .map(toVertebra)
        .filter((v): v is Vertebra => v !== null)
        .sort((a, b) => a.segment - b.segment),
    [doll]
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
    }): BuildState => {
      const validKeys = new Set(dollKeys.map((k) => k.id));
      const validVerts = new Set(vertebrae.map((v) => v.segment));
      return {
        weapon:
          build.weapon && getWeaponById(build.weapon) ? build.weapon : null,
        keys: build.keys.filter((id) => validKeys.has(id)),
        vert: build.vert.filter((s) => validVerts.has(s)),
      };
    },
    [dollKeys, vertebrae]
  );

  // ?b= boot happens synchronously in the initializer so the shared build is
  // the FIRST render — applying it in an effect would flash the default state.
  const [build, setBuild] = useState<BuildState>(() => {
    const boot = bootBuildFromCodeParam(window.location.search, doll.slug);
    return boot
      ? sanitize(boot)
      : { weapon: imprintWeapon?.id ?? null, keys: [], vert: [] };
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
    () => encodeDollBuild({ v: BUILD_VERSION, doll: doll.slug, ...build }),
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

  const toggleKey = useCallback((id: string) => {
    setBuild((prev) => ({
      ...prev,
      keys: prev.keys.includes(id)
        ? prev.keys.filter((k) => k !== id)
        : [...prev.keys, id],
    }));
  }, []);

  const toggleVert = useCallback((segment: number) => {
    setBuild((prev) => ({
      ...prev,
      vert: prev.vert.includes(segment)
        ? prev.vert.filter((s) => s !== segment)
        : [...prev.vert, segment].sort((a, b) => a - b),
    }));
  }, []);

  const phaseColor = PHASE_COLORS[doll.phase ?? ''] ?? 'var(--border)';
  const selectedWeapon = build.weapon ? getWeaponById(build.weapon) : undefined;

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

      {/* Keys — multi-select, no hard cap (the codec caps at 12; the dataset
          maxes at 6 per doll today) */}
      <section className="unit-section unit-panel">
        <h2>
          Keys
          <span className="dollbuilder-count">
            {build.keys.length} selected
          </span>
        </h2>
        {dollKeys.length > 0 ? (
          KEY_TYPE_ORDER.map((type) => {
            const group = dollKeys.filter((k) => k.keyType === type);
            return group.length > 0 ? (
              <div key={type} className="dollbuilder-key-group">
                <h3>{type}</h3>
                <div className="dollbuilder-key-grid">
                  {group.map((key) => (
                    <KeyCard
                      key={key.id}
                      keyData={key}
                      on={build.keys.includes(key.id)}
                      onToggle={() => toggleKey(key.id)}
                    />
                  ))}
                </div>
              </div>
            ) : null;
          })
        ) : (
          <p className="muted">No key data available.</p>
        )}
      </section>

      {/* Vertebrae */}
      <section className="unit-section unit-panel">
        <h2>
          Vertebrae
          <span className="dollbuilder-count">
            {build.vert.length}/{vertebrae.length} active
          </span>
        </h2>
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
                  onClick={() => toggleVert(v.segment)}
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
          <p className="muted">No weapons match “{query}”.</p>
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
  onToggle,
}: {
  keyData: Key;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={'dollbuilder-key-card' + (on ? ' on' : '')}
      aria-pressed={on}
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
