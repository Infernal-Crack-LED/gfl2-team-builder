/**
 * The squad slot strip — portrait, saved-build dropdown, "Edit build" modal,
 * and remove — shared by the team builder (/team-builder) and the squad card
 * composer (/tools/infographics).
 *
 * It lives here rather than in either page because the two produce the SAME
 * artifact: a team code whose slots each carry a full DollBuild. When only the
 * team builder could set builds, a squad card made in the composer was
 * silently poorer than the identical squad made next door.
 *
 * The strip is presentational about state: the host owns the `squad` array and
 * every mutation goes back out through the callbacks, so a page can keep its
 * own boot/serialize rules. What the strip owns is the modal.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_STAT_PREFS, getWeaponForDoll, type Doll } from '../data';
import {
  BUILD_VERSION,
  decodeDollBuild,
  encodeDollBuild,
  type DollBuild,
} from '../../../src/share/buildCode';
import { BUILD_KIND, listProfiles, useAuth, type SavedProfile } from '../auth';
import { GameIcon } from './GameIcon';
import { Modal } from './Modal';
import { DollBuilder } from '../DollBuilderPage';
import { hrefForDoll, onSpaLinkClick } from '../router';

/** A filled squad slot: the doll and the exact build she's running. */
export interface SquadSlot {
  doll: Doll;
  build: DollBuild;
}

/** A saved profile paired with the build decoded out of it. */
export interface SavedBuild {
  profile: SavedProfile;
  build: DollBuild;
}

/**
 * The build a doll starts on when she's placed: her imprint weapon at R1 and
 * the default stat spread — the same defaults the per-doll builder opens with,
 * so "Edit build" never begins by contradicting what the slot already showed.
 */
export function defaultBuildFor(doll: Doll): DollBuild {
  return {
    v: BUILD_VERSION,
    doll: doll.slug,
    weapon: getWeaponForDoll(doll.id)?.id ?? null,
    keys: [],
    vert: [],
    cal: 1,
    stats: [...DEFAULT_STAT_PREFS],
    ck: [],
    exp: null,
    set: null,
  };
}

/**
 * Canonical string form of a build, for equality only. Two DollBuilds that
 * mean the same thing can differ in key order and in which optional fields
 * are present at all (a decoded code omits the absent ones), so both sides of
 * every comparison go through this — otherwise the slot dropdown would read
 * "Custom" for a saved build it had just loaded.
 */
export function canonicalBuild(build: DollBuild): string {
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
    set: build.set ?? null,
  });
}

/**
 * The signed-in user's saved per-doll builds, decoded and grouped by doll
 * slug. Logged out it stays empty and every dropdown offers only the default.
 */
export function useSavedDollBuilds(): Map<string, SavedBuild[]> {
  const { user } = useAuth();
  const [savedBuilds, setSavedBuilds] = useState<SavedBuild[]>([]);

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

  return useMemo(() => {
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
}

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
  const current = canonicalBuild(slot.build);
  const match = saved.find((s) => canonicalBuild(s.build) === current);
  const isDefault = current === canonicalBuild(defaultBuildFor(slot.doll));
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

export function SquadStrip({
  squad,
  onSetBuild,
  onRemove,
}: {
  /** Positional slots — nulls are empty placeholders, and stay in place. */
  squad: (SquadSlot | null)[];
  onSetBuild: (index: number, build: DollBuild) => void;
  onRemove: (index: number) => void;
}) {
  const { user } = useAuth();
  const savedByDoll = useSavedDollBuilds();
  /** Index of the slot whose builder modal is open. */
  const [editing, setEditing] = useState<number | null>(null);
  const editingSlot = editing !== null ? squad[editing] : null;

  /**
   * The modal's live channel back into the squad. Stable while a given slot
   * is open, which is what keeps DollBuilder's change effect from re-firing
   * on every render — see its onBuildChange contract.
   */
  const handleEditingBuildChange = useCallback(
    (build: DollBuild) => {
      if (editing !== null) {
        onSetBuild(editing, build);
      }
    },
    [editing, onSetBuild]
  );

  return (
    <>
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
                    onPick={(build) => onSetBuild(i, build)}
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
                  onClick={() => onRemove(i)}
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
    </>
  );
}
