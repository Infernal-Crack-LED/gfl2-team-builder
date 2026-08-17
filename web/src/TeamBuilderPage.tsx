/**
 * Team Builder page — squad staging area with filter-driven doll selection.
 *
 * Squad strip: 5 slots by default, or 4 via the pill toggle. Shrinking 5→4
 * drops a filled fifth doll back into the grid. Placed dolls are excluded
 * from the grid below. Filters default open (filtering IS the task here).
 * DollCards run in badge mode — click places in the next empty slot.
 *
 * Each filled slot carries a FULL DollBuild, not just the doll: a build
 * dropdown under the portrait swaps between the default loadout and the
 * user's saved builds for that doll, and "Edit build" opens the per-doll
 * builder inside a modal. The modal streams every edit straight back into the
 * slot, so the squad uses the edited build with no save and no login — the
 * build only persists if the user saves the SQUAD (or the build itself).
 *
 * Save/share mirrors the per-doll builder exactly: the squad encodes to a
 * TeamBuild code, saved under TEAM_KIND (what /saved lists) and shared via
 * `?b=<code>` or the short `?id=<row>` form. Boot order matches the builder's:
 * `?b=` applies synchronously in the state initializer so a shared squad is
 * the first render; `?id=` needs a fetch and lands in an effect.
 */
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { getDollBySlug, getWeaponForDoll, type Doll } from './data';
import { DollCards, DollFilters, useDollFilter } from './components/DollGrid';
import { GameIcon } from './components/GameIcon';
import { hrefFor, hrefForDoll, onSpaLinkClick } from './router';
import { TeamEffectsPanel } from './components/TeamEffectsPanel';
import { TeamCardPreview, teamCardSlot } from './components/TeamCardPreview';
import { SaveProfileControl } from './components/SaveProfileControl';
import { Modal } from './components/Modal';
import { DollBuilder } from './DollBuilderPage';
import { copyText } from './clipboard';
import {
  BUILD_KIND,
  listProfiles,
  saveProfile,
  TEAM_KIND,
  useAuth,
  type SavedProfile,
} from './auth';
import {
  BUILD_VERSION,
  decodeDollBuild,
  decodeTeamBuild,
  dollBuildFromTeamSlot,
  encodeDollBuild,
  encodeTeamBuild,
  shareProfileName,
  teamSlotFromDollBuild,
  TEAM_SLOTS,
  type DollBuild,
  type TeamBuild,
} from '../../src/share/buildCode';
import {
  SHARE_PROFILE_KIND,
  bootIdFromSearch,
  bootTeamFromCodeParam,
  fetchSharedTeam,
} from './buildShare';

type SquadSize = 4 | 5;

/** A filled squad slot: the doll and the exact build she's running. */
interface SquadSlot {
  doll: Doll;
  build: DollBuild;
}

/**
 * The build a doll starts on when she's placed: her imprint weapon at R1 and
 * nothing else — the same defaults the per-doll builder opens with, so
 * "Edit build" never begins by contradicting what the slot already showed.
 */
function defaultBuildFor(doll: Doll): DollBuild {
  return {
    v: BUILD_VERSION,
    doll: doll.slug,
    weapon: getWeaponForDoll(doll.id)?.id ?? null,
    keys: [],
    vert: [],
    cal: 1,
    stats: [],
    ck: [],
    exp: null,
  };
}

/**
 * Canonical string form of a build, for equality only. Two DollBuilds that
 * mean the same thing can differ in key order and in which optional fields
 * are present at all (a decoded code omits the absent ones), so both sides of
 * every comparison go through this — otherwise the slot dropdown would read
 * "Custom" for a saved build it had just loaded.
 */
function canonical(build: DollBuild): string {
  return encodeDollBuild({
    v: BUILD_VERSION,
    doll: build.doll,
    weapon: build.weapon ?? null,
    keys: build.keys ?? [],
    vert: build.vert ?? [],
    cal: build.cal ?? null,
    stats: build.stats ?? [],
    ck: build.ck ?? [],
    exp: build.exp ?? null,
  });
}

/**
 * Decoded team → the page's slot array. Slugs that no longer resolve are
 * dropped (a stale link loses a doll, it doesn't break the strip). The strip
 * keeps the size the squad was saved at: a 4-slot code stays a 4-slot squad,
 * everything else — including a fresh squad — is 5.
 */
function squadFromTeam(team: TeamBuild): {
  squad: (SquadSlot | null)[];
  size: SquadSize;
} {
  const slots = team.s.map((s) => {
    if (!s) {
      return null;
    }
    const doll = getDollBySlug(s.d);
    return doll ? { doll, build: dollBuildFromTeamSlot(s) } : null;
  });
  const size: SquadSize = team.s.length <= 4 && !slots[4] ? 4 : 5;
  return {
    squad: Array.from({ length: size }, (_, i) => slots[i] ?? null),
    size,
  };
}

/** A saved profile paired with the build decoded out of it. */
interface SavedBuild {
  profile: SavedProfile;
  build: DollBuild;
}

/**
 * Per-slot build picker: the user's saved builds for THIS doll, plus the
 * default loadout. "Custom (edited)" is not selectable — it exists only to
 * name what the slot currently holds after an edit in the modal, so the
 * control never claims a saved build is loaded when it isn't.
 */
function SlotBuildSelect({
  slot,
  saved,
  loggedIn,
  onPick,
}: {
  slot: SquadSlot;
  saved: SavedBuild[];
  loggedIn: boolean;
  onPick: (build: DollBuild) => void;
}) {
  const current = canonical(slot.build);
  const match = saved.find((s) => canonical(s.build) === current);
  const isDefault = current === canonical(defaultBuildFor(slot.doll));
  const value = match ? match.profile.id : isDefault ? '' : 'custom';

  return (
    <select
      className="teambuilder-build-select"
      aria-label={`Build for ${slot.doll.name}`}
      title={
        loggedIn
          ? `Build for ${slot.doll.name}`
          : 'Log in with Discord to load your saved builds here'
      }
      value={value}
      onChange={(e) => {
        const picked = saved.find((s) => s.profile.id === e.target.value);
        onPick(picked ? picked.build : defaultBuildFor(slot.doll));
      }}
    >
      <option value="">Default build</option>
      {saved.map((s) => (
        <option key={s.profile.id} value={s.profile.id}>
          {s.profile.name}
        </option>
      ))}
      {value === 'custom' && (
        <option value="custom" disabled>
          Custom (edited)
        </option>
      )}
    </select>
  );
}

export function TeamBuilderPage() {
  const boot = useMemo(() => bootTeamFromCodeParam(window.location.search), []);
  const { user } = useAuth();
  const [squadSize, setSquadSize] = useState<SquadSize>(() =>
    boot ? squadFromTeam(boot).size : 5
  );
  const [squad, setSquad] = useState<(SquadSlot | null)[]>(() =>
    boot ? squadFromTeam(boot).squad : [null, null, null, null, null]
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<'link' | 'short' | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Index of the slot whose builder modal is open. */
  const [editing, setEditing] = useState<number | null>(null);
  const [savedBuilds, setSavedBuilds] = useState<SavedBuild[]>([]);

  useEffect(
    () => () => {
      if (copyTimer.current) {
        clearTimeout(copyTimer.current);
      }
    },
    []
  );

  // The user's saved per-doll builds, decoded once and grouped by doll below.
  // Logged out this stays empty and each slot dropdown offers only the default.
  useEffect(() => {
    if (!user) {
      setSavedBuilds([]);
      return;
    }
    let live = true;
    listProfiles(BUILD_KIND)
      .then((rows) => {
        if (!live) {
          return;
        }
        setSavedBuilds(
          rows
            .map((profile) => {
              const build = decodeDollBuild(profile.code);
              return build ? { profile, build } : null;
            })
            .filter((s): s is SavedBuild => s !== null)
        );
      })
      .catch(() => {
        // A failed list degrades to "no saved builds", never a broken page.
      });
    return () => {
      live = false;
    };
  }, [user]);

  const savedByDoll = useMemo(() => {
    const map = new Map<string, SavedBuild[]>();
    for (const s of savedBuilds) {
      const list = map.get(s.build.doll);
      if (list) {
        list.push(s);
      } else {
        map.set(s.build.doll, [s]);
      }
    }
    return map;
  }, [savedBuilds]);

  // `?id=` boot — the async counterpart of the `?b=` initializer. Skipped
  // when a valid `?b=` already claimed the state (it needs no fetch).
  useEffect(() => {
    if (boot) {
      return;
    }
    const id = bootIdFromSearch(window.location.search);
    if (!id) {
      return;
    }
    let live = true;
    void fetchSharedTeam(id).then((shared) => {
      if (live && shared) {
        const next = squadFromTeam(shared);
        setSquadSize(next.size);
        setSquad(next.squad);
      }
    });
    return () => {
      live = false;
    };
  }, [boot]);

  // Serialize for the save control and both share links. Empty squads encode
  // fine but aren't worth saving — getCode returns null so SaveProfileControl
  // says "nothing to save yet" instead of storing an empty strip.
  const getCode = useCallback((): string | null => {
    if (!squad.some((s) => s !== null)) {
      return null;
    }
    return encodeTeamBuild({
      v: BUILD_VERSION,
      s: squad
        .slice(0, TEAM_SLOTS)
        .map((s) => (s ? teamSlotFromDollBuild(s.build) : null)),
    });
  }, [squad]);

  const applyLoadedCode = useCallback((code: string) => {
    const decoded = decodeTeamBuild(code);
    if (!decoded) {
      setNotice('Could not read that saved squad.');
      return;
    }
    const next = squadFromTeam(decoded);
    setSquadSize(next.size);
    setSquad(next.squad);
    setNotice(null);
  }, []);

  const flashCopied = useCallback((which: 'link' | 'short') => {
    setCopied(which);
    if (copyTimer.current) {
      clearTimeout(copyTimer.current);
    }
    copyTimer.current = setTimeout(() => setCopied(null), 1500);
  }, []);

  const copyLongLink = useCallback(async () => {
    const code = getCode();
    if (!code) {
      setNotice('Add a doll to the squad first.');
      return;
    }
    if (
      await copyText(
        `${window.location.origin}${hrefFor('team-builder')}?b=${code}`
      )
    ) {
      flashCopied('link');
    } else {
      setNotice('Copy failed — select the URL and copy it manually.');
    }
  }, [getCode, flashCopied]);

  const copyShortLink = useCallback(async () => {
    const code = getCode();
    if (!code) {
      setNotice('Add a doll to the squad first.');
      return;
    }
    const base = `${window.location.origin}${hrefFor('team-builder')}`;
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
      // Sharing never breaks, it only gets longer — fall back to `?b=`.
    }
    if (await copyText(`${base}?b=${code}`)) {
      flashCopied('link');
    } else {
      setNotice('Copy failed — select the URL and copy it manually.');
    }
  }, [getCode, flashCopied]);

  // Set of placed doll IDs — passed to useDollFilter as exclude
  const excludedIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of squad) {
      if (s) {
        set.add(s.doll.id);
      }
    }
    return set;
  }, [squad]);

  const filterResult = useDollFilter({ exclude: excludedIds });

  // Place a doll in the first empty slot, on her default build.
  const placeInSlot = useCallback((doll: Doll) => {
    setSquad((prev) => {
      const idx = prev.findIndex((s) => s === null);
      if (idx === -1) {
        return prev;
      }
      const next = [...prev];
      next[idx] = { doll, build: defaultBuildFor(doll) };
      return next;
    });
  }, []);

  const setSlotBuild = useCallback((index: number, build: DollBuild) => {
    setSquad((prev) =>
      prev.map((s, i) => (i === index && s ? { ...s, build } : s))
    );
  }, []);

  /**
   * The modal's live channel back into the squad. Stable while a given slot
   * is open, which is what keeps DollBuilder's change effect from re-firing
   * on every render — see its onBuildChange contract.
   */
  const handleEditingBuildChange = useCallback(
    (build: DollBuild) => {
      setSquad((prev) =>
        prev.map((s, i) => (i === editing && s ? { ...s, build } : s))
      );
    },
    [editing]
  );

  // Remove a doll from a specific slot
  const removeFromSlot = useCallback((index: number) => {
    setSquad((prev) => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
  }, []);

  // Clear all slots
  const clearSquad = useCallback(() => {
    setSquad((prev) => prev.map(() => null));
  }, []);

  // Toggle squad size — shrinking drops the extra doll back into the grid
  const toggleSquadSize = useCallback((size: SquadSize) => {
    setSquadSize(size);
    setSquad((prev) => {
      if (size === 4 && prev.length === 5) {
        return prev.slice(0, 4);
      }
      if (size === 5 && prev.length === 4) {
        return [...prev, null];
      }
      return prev;
    });
  }, []);

  const filledCount = squad.filter((s) => s !== null).length;
  const editingSlot = editing !== null ? squad[editing] : null;

  return (
    <div className="app teambuilder-page">
      <header>
        <h1>Team Builder</h1>
        <p className="muted">
          Build your squad. Click a doll to place her in the next empty slot,
          then pick or edit her build under her portrait.
        </p>
      </header>

      {/* Save / share actions — same contract as the per-doll builder */}
      <div className="dollbuilder-actions">
        <SaveProfileControl
          kind={TEAM_KIND}
          getCode={getCode}
          onLoad={applyLoadedCode}
        />
        <button
          type="button"
          className="btn-outline"
          onClick={() => void copyLongLink()}
        >
          {copied === 'link' ? '✓ Copied' : 'Copy link'}
        </button>
        {user && (
          <button
            type="button"
            className="btn-outline"
            onClick={() => void copyShortLink()}
          >
            {copied === 'short' ? '✓ Copied' : 'Copy short link'}
          </button>
        )}
      </div>
      {notice && (
        <p className="dollbuilder-notice" role="alert">
          {notice}
        </p>
      )}

      {/* Squad strip */}
      <div className="teambuilder-controls">
        <div className="teambuilder-size-toggle">
          <button
            type="button"
            className={'pill-toggle' + (squadSize === 4 ? ' on' : '')}
            aria-pressed={squadSize === 4}
            onClick={() => toggleSquadSize(4)}
          >
            4
          </button>
          <button
            type="button"
            className={'pill-toggle' + (squadSize === 5 ? ' on' : '')}
            aria-pressed={squadSize === 5}
            onClick={() => toggleSquadSize(5)}
          >
            5
          </button>
        </div>
        <span className="teambuilder-count">
          {filledCount}/{squadSize} filled
        </span>
        {filledCount > 0 && (
          <button
            type="button"
            className="teambuilder-clear"
            onClick={clearSquad}
          >
            Clear
          </button>
        )}
      </div>

      <div className="teambuilder-squad">
        {squad.map((slot, i) => (
          <div
            key={i}
            className={
              'teambuilder-slot' +
              (slot ? ' teambuilder-slot-filled' : ' teambuilder-slot-empty')
            }
          >
            {slot ? (
              <>
                <div className="teambuilder-portrait">
                  {slot.doll.avatarUrl ? (
                    <GameIcon
                      className="portrait"
                      src={slot.doll.avatarUrl}
                      alt={slot.doll.name}
                    />
                  ) : (
                    <div className="portrait-empty" aria-hidden="true">
                      ?
                    </div>
                  )}
                </div>
                <div className="teambuilder-slot-name">
                  <a
                    href={hrefForDoll(slot.doll.slug)}
                    onClick={onSpaLinkClick(hrefForDoll(slot.doll.slug))}
                  >
                    {slot.doll.name}
                  </a>
                </div>

                {/* Build picker + the modal opener, under the portrait. */}
                <div className="teambuilder-slot-build">
                  <SlotBuildSelect
                    slot={slot}
                    saved={savedByDoll.get(slot.doll.slug) ?? []}
                    loggedIn={Boolean(user)}
                    onPick={(build) => setSlotBuild(i, build)}
                  />
                  <button
                    type="button"
                    className="chip teambuilder-edit-build"
                    onClick={() => setEditing(i)}
                  >
                    Edit build
                  </button>
                </div>

                <button
                  type="button"
                  className="teambuilder-slot-remove"
                  onClick={() => removeFromSlot(i)}
                  aria-label={`Remove ${slot.doll.name}`}
                  title={`Remove ${slot.doll.name}`}
                >
                  ×
                </button>
              </>
            ) : (
              <div className="teambuilder-slot-placeholder" aria-hidden="true">
                ?
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Per-slot builder. Edits land in the slot as they happen, so closing
          — by Done, ×, Escape, or the backdrop — always keeps them, with no
          save and no session required. */}
      {editingSlot && (
        <Modal
          wide
          title={`${editingSlot.doll.name} — Build`}
          onClose={() => setEditing(null)}
        >
          <DollBuilder
            key={editingSlot.doll.slug}
            embedded
            doll={editingSlot.doll}
            initialBuild={editingSlot.build}
            onBuildChange={handleEditingBuildChange}
          />
          <div className="modal-actions">
            <span className="muted">
              Changes apply to the squad as you make them.
            </span>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setEditing(null)}
            >
              Done
            </button>
          </div>
        </Modal>
      )}

      {/* Workspace: picking on the left, live effect feedback on the right.
          The aside comes first in the DOM so the single-column (mobile)
          stack keeps the old squad → effects → filters → grid order. */}
      <div className="teambuilder-workspace">
        <aside className="teambuilder-side">
          {filledCount > 0 ? (
            <TeamEffectsPanel squad={squad.map((s) => s?.doll ?? null)} />
          ) : (
            <div className="teambuilder-side-empty">
              Add dolls to the squad to see the effects they put on the field —
              and who on the team reacts to them.
            </div>
          )}
        </aside>

        <div className="teambuilder-pick">
          {/* Filters above grid (defaultOpen=true — filtering IS the task) */}
          <DollFilters filterResult={filterResult} defaultOpen={true} />

          {/* Doll grid in badge mode */}
          <DollCards
            dolls={filterResult.dolls}
            mode="badge"
            onSelect={placeInSlot}
          />
        </div>
      </div>

      {/* Team card preview — an output artifact, not part of the build loop,
          so it lives at the bottom behind a disclosure. */}
      {filledCount > 0 && (
        <details className="unit-section unit-panel teambuilder-preview">
          <summary className="teambuilder-preview-summary">
            Share Card Preview
          </summary>
          <TeamCardPreview
            slots={squad
              .filter((s): s is SquadSlot => s != null)
              .map((s) => teamCardSlot(s.doll, s.build))}
          />
        </details>
      )}
    </div>
  );
}
