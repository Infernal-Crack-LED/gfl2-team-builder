/**
 * Infographics Creator (/tools/infographics) — the site's card factory,
 * modelled on nikke-sim's Card Builder: pick a card type, compose it from the
 * published game data, see a live client-side preview rendered by the SAME
 * components the builders use, then either download the PNG or mint a hosted,
 * Discord-embeddable image URL.
 *
 * Two cards exist today because two renderers do (src/infographics/core):
 * the build card (one doll) and the squad card (up to five). Both encode to
 * the shared build codecs, so a card made here is the same artifact the
 * builders and the bot produce — the hosted URL is just /api/v1/img/<kind>.png
 * over that code.
 *
 * Everything works logged out; a session only buys the SHORT hosted link
 * (the code is stored server-side under the public share kind) and the
 * "load a saved build" dropdowns.
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
  REFINEMENT_LEVELS,
  STAT_PREF_OPTIONS,
  type Doll,
  type Key,
} from './data';
import {
  BUILD_VERSION,
  decodeDollBuild,
  decodeTeamBuild,
  encodeDollBuild,
  encodeTeamBuild,
  shareProfileName,
  TEAM_SLOTS,
  type DollBuild,
} from '../../src/share/buildCode';
import {
  BUILD_KIND,
  listProfiles,
  saveProfile,
  TEAM_KIND,
  useAuth,
  type SavedProfile,
} from './auth';
import { SHARE_PROFILE_KIND } from './buildShare';
import { copyText } from './clipboard';
import { BuildCardPreview } from './components/BuildCardPreview';
import { GameIcon } from './components/GameIcon';
import { TeamCardPreview } from './components/TeamCardPreview';
import { DollCards, DollFilters, useDollFilter } from './components/DollGrid';
import { hrefFor, hrefForBuilder, onSpaLinkClick } from './router';
import { setDetailMeta } from './useDocumentHead';

const MAX_FIXED_KEYS = 3;
const MAX_COMMON_KEYS = 3;
const MAX_STAT_PREFS = 4;

type CardType = 'build' | 'team';

const CARD_TYPES: { key: CardType; label: string; blurb: string }[] = [
  {
    key: 'build',
    label: 'Build Card',
    blurb: "One doll's weapon, keys, vertebrae and stat priorities.",
  },
  {
    key: 'team',
    label: 'Squad Card',
    blurb: 'Up to five dolls with their weapons, as a roster strip.',
  },
];

/** Display name for a key, matching the server-side keyDisplayName(). */
function keyName(key: Key | undefined): string | null {
  return key?.displayTitle ?? key?.keyTitle ?? null;
}

/**
 * Copy-with-flash button. Every action on this page is "produce a string and
 * put it on the clipboard", so they all share one control and one failure
 * message rather than each page-level handler re-implementing the flash.
 */
function CopyButton({
  label,
  build,
  onFail,
  primary,
}: {
  label: string;
  /** Produces the string to copy; async so it can mint a share row first. */
  build: () => Promise<string> | string;
  onFail: (message: string) => void;
  primary?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    []
  );

  const onClick = async () => {
    const text = await build();
    if (await copyText(text)) {
      setCopied(true);
      if (timer.current) {
        clearTimeout(timer.current);
      }
      timer.current = setTimeout(() => setCopied(false), 1500);
      return;
    }
    onFail('Copy failed — select the URL and copy it manually.');
  };

  return (
    <button
      type="button"
      className={primary ? 'btn-primary' : 'btn-outline'}
      onClick={() => void onClick()}
    >
      {copied ? '✓ Copied' : label}
    </button>
  );
}

/**
 * A row of toggle chips with an optional cap. `selected` is an ordered array
 * (stat preferences are meaningful in order), so this renders selection order
 * rather than option order in the label.
 */
function ChipRow({
  label,
  options,
  selected,
  onToggle,
  cap,
  empty,
  scroll,
}: {
  label: string;
  options: { id: string; label: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  cap?: number;
  empty?: string;
  /** Long lists (common keys) get a fixed-height scroll box. */
  scroll?: boolean;
}) {
  return (
    <div className="infog-field">
      <span className="infog-field-label">
        {label}
        {cap !== undefined && (
          <span className="infog-field-cap">
            {selected.length}/{cap}
          </span>
        )}
      </span>
      {options.length === 0 ? (
        <p className="muted">{empty ?? 'None available.'}</p>
      ) : (
        <div className={'infog-chips' + (scroll ? ' scroll' : '')}>
          {options.map((opt) => {
            const on = selected.includes(opt.id);
            const full = cap !== undefined && selected.length >= cap && !on;
            return (
              <button
                key={opt.id}
                type="button"
                className={'pill-toggle' + (on ? ' on' : '')}
                aria-pressed={on}
                disabled={full}
                onClick={() => onToggle(opt.id)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Load-a-saved-profile dropdown; renders nothing when logged out. */
function LoadSavedControl({
  kind,
  label,
  onLoad,
}: {
  kind: string;
  label: string;
  onLoad: (code: string) => void;
}) {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<SavedProfile[]>([]);

  useEffect(() => {
    if (!user) {
      setProfiles([]);
      return;
    }
    let live = true;
    listProfiles(kind)
      .then((rows) => {
        if (live) {
          setProfiles(rows);
        }
      })
      .catch(() => {
        // A failed list degrades to "no saves", never a broken page.
      });
    return () => {
      live = false;
    };
  }, [user, kind]);

  if (!user || profiles.length === 0) {
    return null;
  }
  return (
    <label className="infog-load">
      <span className="infog-field-label">{label}</span>
      <select
        defaultValue=""
        onChange={(e) => {
          const row = profiles.find((p) => p.id === e.target.value);
          if (row) {
            onLoad(row.code);
          }
          e.target.value = '';
        }}
      >
        <option value="">Choose a save…</option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}

// --- Build card ------------------------------------------------------------

interface BuildState {
  weapon: string | null;
  keys: string[];
  expansionKey: string | null;
  vert: number[];
  refinement: number | null;
  statPrefs: string[];
  commonKeys: string[];
}

function emptyBuild(doll: Doll): BuildState {
  return {
    weapon: getWeaponForDoll(doll.id)?.id ?? null,
    keys: [],
    expansionKey: null,
    vert: [],
    refinement: 1,
    statPrefs: [],
    commonKeys: [],
  };
}

function BuildCardTool({ onNotice }: { onNotice: (m: string | null) => void }) {
  const [doll, setDoll] = useState<Doll | null>(null);
  const [build, setBuild] = useState<BuildState | null>(null);
  const [picking, setPicking] = useState(true);
  const { user } = useAuth();
  const filterResult = useDollFilter();

  const dollKeys = useMemo(() => (doll ? getKeysForDoll(doll.id) : []), [doll]);
  const commonKeys = useMemo(
    () =>
      getAllCommonKeys().sort((a, b) =>
        (keyName(a) ?? '').localeCompare(keyName(b) ?? '')
      ),
    []
  );
  const vertebrae = useMemo(
    () => (doll ? getVertebraeForDoll(doll) : []),
    [doll]
  );

  const choose = useCallback(
    (next: Doll) => {
      setDoll(next);
      setBuild(emptyBuild(next));
      setPicking(false);
      onNotice(null);
    },
    [onNotice]
  );

  /**
   * Apply a saved/shared code. The code names its own doll, so loading one
   * switches the picker to that doll rather than refusing — on this page the
   * saved build IS the thing being turned into a card.
   */
  const applyCode = useCallback(
    (code: string) => {
      const decoded = decodeDollBuild(code);
      const target = decoded ? getDollBySlug(decoded.doll) : undefined;
      if (!decoded || !target) {
        onNotice('Could not read that saved build.');
        return;
      }
      const validFixed = new Set(
        getKeysForDoll(target.id)
          .filter((k) => k.keyType === 'Fixed Key')
          .map((k) => k.id)
      );
      const validExpansion = new Set(
        getKeysForDoll(target.id)
          .filter((k) => k.keyType === 'Expansion Key')
          .map((k) => k.id)
      );
      const validVert = new Set(
        getVertebraeForDoll(target).map((v) => v.segment)
      );
      setDoll(target);
      setPicking(false);
      setBuild({
        weapon:
          decoded.weapon && getWeaponById(decoded.weapon)
            ? decoded.weapon
            : null,
        keys: decoded.keys
          .filter((id) => validFixed.has(id))
          .slice(0, MAX_FIXED_KEYS),
        expansionKey:
          decoded.exp && validExpansion.has(decoded.exp) ? decoded.exp : null,
        vert: decoded.vert.filter((s) => validVert.has(s)).slice(0, 1),
        refinement: decoded.cal ?? null,
        statPrefs: (decoded.stats ?? []).slice(0, MAX_STAT_PREFS),
        commonKeys: (decoded.ck ?? []).slice(0, MAX_COMMON_KEYS),
      });
      onNotice(null);
    },
    [onNotice]
  );

  const code = useMemo(() => {
    if (!doll || !build) {
      return null;
    }
    const payload: DollBuild = {
      v: BUILD_VERSION,
      doll: doll.slug,
      weapon: build.weapon,
      keys: build.keys,
      vert: build.vert,
      cal: build.refinement,
      stats: build.statPrefs,
      ck: build.commonKeys,
      exp: build.expansionKey,
    };
    return encodeDollBuild(payload);
  }, [doll, build]);

  const previewData = useMemo(() => {
    if (!doll || !build) {
      return null;
    }
    const keyNames = build.keys
      .map((id) => keyName(dollKeys.find((k) => k.id === id)))
      .filter((n): n is string => n != null);
    const expName = build.expansionKey
      ? keyName(dollKeys.find((k) => k.id === build.expansionKey))
      : null;
    if (expName) {
      keyNames.push(expName);
    }
    return {
      dollName: doll.name,
      dollClass: doll.class,
      dollPhase: doll.phase,
      dollRarity: doll.rarity,
      weaponName: build.weapon
        ? (getWeaponById(build.weapon)?.name ?? null)
        : null,
      keyNames,
      vert: build.vert,
      portraitUrl: doll.avatarUrl,
      refinement: build.refinement,
      statPrefs: build.statPrefs,
      commonKeyNames: build.commonKeys
        .map((id) => keyName(commonKeys.find((k) => k.id === id)))
        .filter((n): n is string => n != null),
    };
  }, [doll, build, dollKeys, commonKeys]);

  if (!doll || !build || picking) {
    return (
      <>
        <LoadSavedControl
          kind={BUILD_KIND}
          label="Start from a saved build"
          onLoad={applyCode}
        />
        {doll && (
          <button
            type="button"
            className="btn-outline"
            onClick={() => setPicking(false)}
          >
            ← Back to {doll.name}
          </button>
        )}
        <p className="muted">Pick the doll this card is about.</p>
        <DollFilters filterResult={filterResult} defaultOpen={true} />
        <DollCards dolls={filterResult.dolls} mode="badge" onSelect={choose} />
      </>
    );
  }

  const fixedKeys = dollKeys.filter((k) => k.keyType === 'Fixed Key');
  const expansionKeys = dollKeys.filter((k) => k.keyType === 'Expansion Key');
  const patch = (next: Partial<BuildState>) =>
    setBuild((prev) => (prev ? { ...prev, ...next } : prev));

  const toggleCapped = (list: string[], id: string, cap: number): string[] =>
    list.includes(id)
      ? list.filter((x) => x !== id)
      : list.length >= cap
        ? list
        : [...list, id];

  return (
    <>
      <div className="infog-chosen">
        {doll.avatarUrl ? (
          <GameIcon className="portrait" src={doll.avatarUrl} />
        ) : (
          <div className="portrait portrait-empty" aria-hidden="true">
            ?
          </div>
        )}
        <div>
          <strong>{doll.name}</strong>
          <div className="muted">
            {[doll.class, doll.phase, doll.rarity].filter(Boolean).join(' · ')}
          </div>
        </div>
        <button type="button" className="chip" onClick={() => setPicking(true)}>
          Change doll
        </button>
      </div>

      <LoadSavedControl
        kind={BUILD_KIND}
        label="Load a saved build"
        onLoad={applyCode}
      />

      <div className="infog-fields">
        <label className="infog-field">
          <span className="infog-field-label">Weapon</span>
          <select
            value={build.weapon ?? ''}
            onChange={(e) => patch({ weapon: e.target.value || null })}
          >
            <option value="">No weapon</option>
            {allWeapons
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
          </select>
        </label>

        <ChipRow
          label="Refinement"
          options={REFINEMENT_LEVELS.map((n) => ({
            id: String(n),
            label: `R${n}`,
          }))}
          selected={build.refinement ? [String(build.refinement)] : []}
          onToggle={(id) =>
            patch({
              refinement: build.refinement === Number(id) ? null : Number(id),
            })
          }
        />

        <ChipRow
          label="Fixed keys"
          cap={MAX_FIXED_KEYS}
          options={fixedKeys.map((k) => ({
            id: k.id,
            label: k.keyTitle ?? 'Key',
          }))}
          selected={build.keys}
          onToggle={(id) =>
            patch({ keys: toggleCapped(build.keys, id, MAX_FIXED_KEYS) })
          }
          empty="This doll has no fixed keys in the synced data."
        />

        <ChipRow
          label="Expansion key"
          options={expansionKeys.map((k) => ({
            id: k.id,
            label: k.keyTitle ?? 'Key',
          }))}
          selected={build.expansionKey ? [build.expansionKey] : []}
          onToggle={(id) =>
            patch({ expansionKey: build.expansionKey === id ? null : id })
          }
          empty="This doll has no expansion key yet."
        />

        <ChipRow
          label="Vertebra"
          options={vertebrae.map((v) => ({
            id: String(v.segment),
            label: `V${v.segment}`,
          }))}
          selected={build.vert.map(String)}
          onToggle={(id) =>
            patch({
              vert: build.vert.includes(Number(id)) ? [] : [Number(id)],
            })
          }
          empty="No vertebrae in the synced data."
        />

        <ChipRow
          label="Stat priority"
          cap={MAX_STAT_PREFS}
          options={STAT_PREF_OPTIONS.map((s) => ({ id: s, label: s }))}
          selected={build.statPrefs}
          onToggle={(id) =>
            patch({
              statPrefs: toggleCapped(build.statPrefs, id, MAX_STAT_PREFS),
            })
          }
        />

        <ChipRow
          label="Common keys"
          cap={MAX_COMMON_KEYS}
          scroll
          options={commonKeys.map((k) => ({
            id: k.id,
            label: k.keyTitle ?? 'Key',
          }))}
          selected={build.commonKeys}
          onToggle={(id) =>
            patch({
              commonKeys: toggleCapped(build.commonKeys, id, MAX_COMMON_KEYS),
            })
          }
        />
      </div>

      {previewData && (
        <section className="unit-section unit-panel">
          <h2>Preview</h2>
          <BuildCardPreview data={previewData} />
        </section>
      )}

      {code && (
        <ShareRow
          kind="build"
          code={code}
          pagePath={hrefForBuilder(doll.slug)}
          loggedIn={Boolean(user)}
          onNotice={onNotice}
        />
      )}
    </>
  );
}

// --- Squad card ------------------------------------------------------------

function TeamCardTool({ onNotice }: { onNotice: (m: string | null) => void }) {
  const [squad, setSquad] = useState<Doll[]>([]);
  const { user } = useAuth();

  const excluded = useMemo(() => new Set(squad.map((d) => d.id)), [squad]);
  const filterResult = useDollFilter({ exclude: excluded });

  const applyCode = useCallback(
    (loaded: string) => {
      const decoded = decodeTeamBuild(loaded);
      if (!decoded) {
        onNotice('Could not read that saved squad.');
        return;
      }
      const dolls = decoded.s
        .filter((s) => s !== null)
        .map((s) => getDollBySlug(s.d))
        .filter((d): d is Doll => d !== undefined);
      setSquad(dolls.slice(0, TEAM_SLOTS));
      onNotice(null);
    },
    [onNotice]
  );

  const code = useMemo(
    () =>
      squad.length === 0
        ? null
        : encodeTeamBuild({
            v: BUILD_VERSION,
            s: squad.map((d) => ({
              d: d.slug,
              w: getWeaponForDoll(d.id)?.id ?? null,
            })),
          }),
    [squad]
  );

  return (
    <>
      <LoadSavedControl
        kind={TEAM_KIND}
        label="Start from a saved squad"
        onLoad={applyCode}
      />

      <div className="infog-squad">
        {Array.from({ length: TEAM_SLOTS }, (_, i) => squad[i] ?? null).map(
          (doll, i) => (
            <div
              key={i}
              className={
                'teambuilder-slot' +
                (doll ? ' teambuilder-slot-filled' : ' teambuilder-slot-empty')
              }
            >
              {doll ? (
                <>
                  <div className="teambuilder-portrait">
                    {doll.avatarUrl ? (
                      <GameIcon
                        className="portrait"
                        src={doll.avatarUrl}
                        alt={doll.name}
                      />
                    ) : (
                      <div className="portrait-empty" aria-hidden="true">
                        ?
                      </div>
                    )}
                  </div>
                  <div className="teambuilder-slot-name">{doll.name}</div>
                  <button
                    type="button"
                    className="teambuilder-slot-remove"
                    aria-label={`Remove ${doll.name}`}
                    onClick={() =>
                      setSquad((prev) => prev.filter((d) => d.id !== doll.id))
                    }
                  >
                    ×
                  </button>
                </>
              ) : (
                <div
                  className="teambuilder-slot-placeholder"
                  aria-hidden="true"
                >
                  ?
                </div>
              )}
            </div>
          )
        )}
      </div>

      {squad.length > 0 && (
        <section className="unit-section unit-panel">
          <h2>Preview</h2>
          <TeamCardPreview
            slots={squad.map((d) => ({
              dollName: d.name,
              weaponName: getWeaponForDoll(d.id)?.name ?? null,
              portraitUrl: d.avatarUrl,
            }))}
          />
        </section>
      )}

      {code && (
        <ShareRow
          kind="team"
          code={code}
          pagePath={hrefFor('team-builder')}
          loggedIn={Boolean(user)}
          onNotice={onNotice}
        />
      )}

      <DollFilters
        filterResult={filterResult}
        defaultOpen={squad.length === 0}
      />
      <DollCards
        dolls={filterResult.dolls}
        mode="badge"
        onSelect={(d) =>
          setSquad((prev) =>
            prev.length >= TEAM_SLOTS || prev.some((p) => p.id === d.id)
              ? prev
              : [...prev, d]
          )
        }
      />
    </>
  );
}

// --- Shared share actions --------------------------------------------------

/**
 * The three things you can do with a finished card: take the hosted image URL
 * (what Discord embeds), take a link back to the editor, or — with a session —
 * take the SHORT hosted URL, which stores the code server-side under the
 * public share kind so the URL stays a fixed length.
 */
function ShareRow({
  kind,
  code,
  pagePath,
  loggedIn,
  onNotice,
}: {
  kind: 'build' | 'team';
  code: string;
  pagePath: string;
  loggedIn: boolean;
  onNotice: (m: string | null) => void;
}) {
  const origin = window.location.origin;
  return (
    <div className="infog-actions">
      <CopyButton
        primary
        label="Copy image link"
        build={() => `${origin}/api/v1/img/${kind}.png?b=${code}`}
        onFail={onNotice}
      />
      {loggedIn && (
        <CopyButton
          label="Copy short image link"
          build={async () => {
            try {
              const row = await saveProfile(
                SHARE_PROFILE_KIND,
                shareProfileName(code),
                code
              );
              return `${origin}/api/v1/img/${kind}.png?id=${row.id}`;
            } catch {
              // Sharing never breaks, it only gets longer.
              return `${origin}/api/v1/img/${kind}.png?b=${code}`;
            }
          }}
          onFail={onNotice}
        />
      )}
      <CopyButton
        label="Copy editor link"
        build={() => `${origin}${pagePath}?b=${code}`}
        onFail={onNotice}
      />
      <a
        className="btn-outline"
        href={`${pagePath}?b=${code}`}
        onClick={onSpaLinkClick(`${pagePath}?b=${code}`)}
      >
        Open in editor
      </a>
    </div>
  );
}

// --- Page ------------------------------------------------------------------

/** `?card=team` → the squad card; anything else (or nothing) → the build card. */
function bootCardType(): CardType {
  return new URLSearchParams(window.location.search).get('card') === 'team'
    ? 'team'
    : 'build';
}

export function InfographicsPage() {
  const [cardType, setCardType] = useState<CardType>(bootCardType);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setDetailMeta(
      'GFL2 Infographics Creator — Build & Squad Card Maker',
      "Make shareable Girls' Frontline 2: Exilium infographics: compose a doll build card or a squad card, preview it live, then download the PNG or copy a hosted image link."
    );
  }, []);

  const active = CARD_TYPES.find((c) => c.key === cardType);

  return (
    <div className="app infog-page">
      <nav className="unit-crumbs">
        <a href={hrefFor('tools')} onClick={onSpaLinkClick(hrefFor('tools'))}>
          Tools
        </a>
        {' / '}
        Infographics Creator
      </nav>

      <header>
        <h1>Infographics Creator</h1>
        <p className="muted">
          Compose a card from the live game data, preview it exactly as it will
          render, then download the PNG or copy a hosted link that embeds in
          Discord.
        </p>
      </header>

      <nav className="tabs-bar infog-tabs">
        {CARD_TYPES.map((c) => (
          <button
            key={c.key}
            type="button"
            className={cardType === c.key ? 'on' : ''}
            onClick={() => {
              setCardType(c.key);
              setNotice(null);
              // Keep ?card= honest without a route change — the Tools tiles
              // link here by card type, so the URL should survive a copy.
              const url = new URL(window.location.href);
              url.searchParams.set('card', c.key);
              window.history.replaceState({}, '', url);
            }}
          >
            {c.label}
          </button>
        ))}
      </nav>
      {active && <p className="muted infog-blurb">{active.blurb}</p>}

      {notice && (
        <p className="dollbuilder-notice" role="alert">
          {notice}
        </p>
      )}

      {/* key: switching card type resets the tool's state rather than
          carrying a half-composed card across two different renderers. */}
      {cardType === 'build' ? (
        <BuildCardTool key="build" onNotice={setNotice} />
      ) : (
        <TeamCardTool key="team" onNotice={setNotice} />
      )}
    </div>
  );
}
