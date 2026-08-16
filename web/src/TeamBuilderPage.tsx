/**
 * Team Builder page — squad staging area with filter-driven doll selection.
 *
 * Squad strip: 4 or 5 slots (user-selectable pill toggle). Shrinking 5→4
 * drops a filled fifth doll back into the grid. Placed dolls are excluded
 * from the grid below. Filters default open (filtering IS the task here).
 * DollCards run in badge mode — click places in the next empty slot.
 *
 * No save/share yet (needs a backend decision); the strip is session state
 * only. The page still earns its place as a filter-driven squad planner.
 */
import { useState, useMemo, useCallback } from 'react';
import type { Doll } from './data';
import { DollCards, DollFilters, useDollFilter } from './components/DollGrid';
import { hrefForDoll, onSpaLinkClick } from './router';
import { TeamEffectsPanel } from './components/TeamEffectsPanel';

type SquadSize = 4 | 5;

export function TeamBuilderPage() {
  const [squadSize, setSquadSize] = useState<SquadSize>(4);
  const [squad, setSquad] = useState<(Doll | null)[]>([
    null,
    null,
    null,
    null,
  ]);

  // Set of placed doll IDs — passed to useDollFilter as exclude
  const excludedIds = useMemo(() => {
    const set = new Set<string>();
    for (const d of squad) {
      if (d) {
        set.add(d.id);
      }
    }
    return set;
  }, [squad]);

  const filterResult = useDollFilter({ exclude: excludedIds });

  // Place a doll in the first empty slot
  const placeInSlot = useCallback(
    (doll: Doll) => {
      setSquad((prev) => {
        const idx = prev.findIndex((s) => s === null);
        if (idx === -1) {
          return prev;
        }
        const next = [...prev];
        next[idx] = doll;
        return next;
      });
    },
    []
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

  const filledCount = squad.filter((d) => d !== null).length;

  return (
    <div className="app teambuilder-page">
      <header>
        <h1>Team Builder</h1>
        <p className="muted">
          Build your squad. Click a doll to place her in the next empty slot.
        </p>
      </header>

      {/* Squad strip */}
      <div className="teambuilder-controls">
        <div className="teambuilder-size-toggle">
          <button
            type="button"
            className={
              'pill-toggle' + (squadSize === 4 ? ' on' : '')
            }
            aria-pressed={squadSize === 4}
            onClick={() => toggleSquadSize(4)}
          >
            4
          </button>
          <button
            type="button"
            className={
              'pill-toggle' + (squadSize === 5 ? ' on' : '')
            }
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
        {squad.map((doll, i) => (
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
                    <img
                      className="portrait"
                      src={doll.avatarUrl}
                      alt={doll.name}
                      loading="lazy"
                    />
                  ) : (
                    <div className="portrait-empty" aria-hidden="true">
                      ?
                    </div>
                  )}
                </div>
                <div className="teambuilder-slot-name">
                  <a
                    href={hrefForDoll(doll.slug)}
                    onClick={onSpaLinkClick(hrefForDoll(doll.slug))}
                  >
                    {doll.name}
                  </a>
                </div>
                <button
                  type="button"
                  className="teambuilder-slot-remove"
                  onClick={() => removeFromSlot(i)}
                  aria-label={`Remove ${doll.name}`}
                  title={`Remove ${doll.name}`}
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

      {/* Effect matrix for the current squad */}
      <TeamEffectsPanel squad={squad} />

      {/* Filters above grid (defaultOpen=true — filtering IS the task) */}
      <DollFilters filterResult={filterResult} defaultOpen={true} />

      {/* Doll grid in badge mode */}
      <DollCards
        dolls={filterResult.dolls}
        mode="badge"
        onSelect={placeInSlot}
      />
    </div>
  );
}
