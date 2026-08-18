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
import { getDollBySlug, type Doll } from './data';
import { DollCards, DollFilters, useDollFilter } from './components/DollGrid';
import { hrefFor } from './router';
import { TeamEffectsPanel } from './components/TeamEffectsPanel';
import {
  SquadStrip,
  defaultBuildFor,
  type SquadSlot,
} from './components/SquadStrip';
import { TeamCardPreview, teamCardSlot } from './components/TeamCardPreview';
import { SaveProfileControl } from './components/SaveProfileControl';
import { ShortLinkExpiryHint } from './components/ShortLinkExpiryHint';
import { copyText } from './clipboard';
import { mintShareId, TEAM_KIND, useAuth } from './auth';
import {
  BUILD_VERSION,
  decodeTeamBuild,
  dollBuildFromTeamSlot,
  encodeTeamBuild,
  teamSlotFromDollBuild,
  TEAM_SLOTS,
  type DollBuild,
  type TeamBuild,
} from '../../src/share/buildCode';
import {
  bootIdFromSearch,
  bootTeamFromCodeParam,
  fetchSharedTeam,
} from './buildShare';

type SquadSize = 4 | 5;

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

  useEffect(
    () => () => {
      if (copyTimer.current) {
        clearTimeout(copyTimer.current);
      }
    },
    []
  );

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
      const id = await mintShareId(code);
      if (await copyText(`${base}?id=${id}`)) {
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

  return (
    <div className="app teambuilder-page">
      <header className="teambuilder-page-header">
        <h1>Team Builder</h1>
      </header>
      <p className="teambuilder-page-subtitle muted">
        Build your squad. Click a doll to place her in the next empty slot, then
        pick or edit her build under her portrait.
      </p>

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
          onClick={() => void copyShortLink()}
        >
          {copied === 'short' ? '✓ Copied' : 'Copy Link'}
        </button>
      </div>
      {!user && <ShortLinkExpiryHint onCopyFullLink={copyLongLink} />}
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

      {/* Workspace: squad strip + doll grid on the left. The effects panel
          lives at the page level so it can align with the subtitle text. */}
      <div className="teambuilder-workspace">
        <div className="teambuilder-squad-sticky">
          <SquadStrip
            squad={squad}
            onSetBuild={setSlotBuild}
            onRemove={removeFromSlot}
          />
        </div>

        <div className="teambuilder-pick">
          {/* Squad card preview — it belongs to the squad above it, not to the
              grid below, so it sits directly under the strip. Collapsed by
              default: it's an output artifact, and an open 5-doll card would
              push the filters and grid off the first screen. */}
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
    </div>
  );
}
