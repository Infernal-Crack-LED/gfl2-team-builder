/**
 * Saved builds (/saved) — one place to see everything the logged-in user has
 * saved: per-doll builds from the character builder (kind BUILD_KIND) and
 * squads from the team builder (kind TEAM_KIND).
 *
 * Rows are decoded client-side from the stored share code, so each one can
 * show what's actually in it (the doll and her weapon; the squad's roster)
 * without any new API surface — /api/profiles already returns the code.
 * A row whose code no longer decodes still renders, marked unreadable and
 * deletable, rather than vanishing silently.
 *
 * Share rows (SHARE_PROFILE_KIND) are deliberately NOT listed: they are
 * content-addressed byproducts of pressing "copy short link", not saves the
 * user named or would recognise.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BUILD_KIND,
  deleteProfile,
  listProfiles,
  TEAM_KIND,
  useAuth,
  type SavedProfile,
} from './auth';
import { decodeDollBuild, decodeTeamBuild } from '../../src/share/buildCode';
import { getDollBySlug, getWeaponById, type Doll } from './data';
import { GameIcon } from './components/GameIcon';
import { hrefFor, hrefForBuilder, onSpaLinkClick } from './router';

/** A profile row plus everything decoded out of its code, for rendering. */
interface DecodedRow {
  profile: SavedProfile;
  /** Portraits to show as the row's thumbnail strip. */
  dolls: Doll[];
  /** One-line summary under the name. */
  summary: string;
  /** Where "Open" goes; null when the code can't be read. */
  href: string | null;
}

function decodeBuildRow(profile: SavedProfile): DecodedRow {
  const build = decodeDollBuild(profile.code);
  const doll = build ? getDollBySlug(build.doll) : undefined;
  if (!build || !doll) {
    return {
      profile,
      dolls: [],
      summary:
        'This save could not be read — the code is malformed or from a retired format.',
      href: null,
    };
  }
  const weapon = build.weapon ? getWeaponById(build.weapon) : undefined;
  const parts = [doll.name];
  if (weapon) {
    parts.push(weapon.name);
  }
  if (build.cal) {
    parts.push(`R${build.cal}`);
  }
  const keyCount = build.keys.length + (build.exp ? 1 : 0);
  if (keyCount > 0) {
    parts.push(`${keyCount} key${keyCount === 1 ? '' : 's'}`);
  }
  if (build.vert.length > 0) {
    parts.push(`V${build.vert[0]}`);
  }
  return {
    profile,
    dolls: [doll],
    summary: parts.join(' · '),
    href: `${hrefForBuilder(doll.slug)}?b=${profile.code}`,
  };
}

function decodeTeamRow(profile: SavedProfile): DecodedRow {
  const team = decodeTeamBuild(profile.code);
  if (!team) {
    return {
      profile,
      dolls: [],
      summary:
        'This save could not be read — the code is malformed or from a retired format.',
      href: null,
    };
  }
  const dolls = team.s
    .filter((s) => s !== null)
    .map((s) => getDollBySlug(s.d))
    .filter((d): d is Doll => d !== undefined);
  return {
    profile,
    dolls,
    summary:
      dolls.length > 0 ? dolls.map((d) => d.name).join(' · ') : 'Empty squad',
    href: `${hrefFor('team-builder')}?b=${profile.code}`,
  };
}

/** "2026-08-16T…" → "16 Aug 2026". Invalid dates degrade to an empty string. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
}

function SavedSection({
  title,
  emptyHint,
  emptyHref,
  emptyCta,
  rows,
  onDelete,
}: {
  title: string;
  emptyHint: string;
  emptyHref: string;
  emptyCta: string;
  rows: DecodedRow[];
  onDelete: (id: string) => void;
}) {
  return (
    <section className="unit-section unit-panel saved-section">
      <h2>
        {title}
        <span className="keys-section-count">{rows.length}</span>
      </h2>

      {rows.length === 0 ? (
        <p className="muted">
          {emptyHint}{' '}
          <a href={emptyHref} onClick={onSpaLinkClick(emptyHref)}>
            {emptyCta}
          </a>
        </p>
      ) : (
        <ul className="saved-list">
          {rows.map(({ profile, dolls, summary, href }) => (
            <li key={profile.id} className="saved-row">
              <div className="saved-thumbs">
                {dolls.length === 0 ? (
                  <div className="portrait portrait-empty" aria-hidden="true">
                    ?
                  </div>
                ) : (
                  dolls.map((d) =>
                    d.avatarUrl ? (
                      <GameIcon
                        key={d.id}
                        className="portrait"
                        src={d.avatarUrl}
                      />
                    ) : (
                      <div
                        key={d.id}
                        className="portrait portrait-empty"
                        aria-hidden="true"
                      >
                        ?
                      </div>
                    )
                  )
                )}
              </div>

              <div className="saved-body">
                <span className="saved-name">{profile.name}</span>
                <span className="saved-summary muted">{summary}</span>
                <span className="saved-date muted">
                  Updated {formatDate(profile.updatedAt)}
                </span>
              </div>

              <div className="saved-row-actions">
                {href && (
                  <a
                    className="btn-outline"
                    href={href}
                    onClick={onSpaLinkClick(href)}
                  >
                    Open
                  </a>
                )}
                <button
                  type="button"
                  className="save-profile-delete"
                  aria-label={`Delete ${profile.name}`}
                  title={`Delete ${profile.name}`}
                  onClick={() => onDelete(profile.id)}
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function SavedPage() {
  const { user, loading, login } = useAuth();
  const [builds, setBuilds] = useState<SavedProfile[]>([]);
  const [teams, setTeams] = useState<SavedProfile[]>([]);
  const [listing, setListing] = useState(true);

  useEffect(() => {
    if (!user) {
      setBuilds([]);
      setTeams([]);
      setListing(false);
      return;
    }
    let live = true;
    setListing(true);
    Promise.all([listProfiles(BUILD_KIND), listProfiles(TEAM_KIND)])
      .then(([b, t]) => {
        if (live) {
          setBuilds(b);
          setTeams(t);
          setListing(false);
        }
      })
      .catch(() => {
        if (live) {
          setListing(false);
        }
      });
    return () => {
      live = false;
    };
  }, [user]);

  // Optimistic removal: the DELETE is scoped to the session's own rows, so a
  // failure can only mean the row was already gone.
  const remove = useCallback((id: string) => {
    setBuilds((prev) => prev.filter((p) => p.id !== id));
    setTeams((prev) => prev.filter((p) => p.id !== id));
    void deleteProfile(id);
  }, []);

  const buildRows = useMemo(() => builds.map(decodeBuildRow), [builds]);
  const teamRows = useMemo(() => teams.map(decodeTeamRow), [teams]);

  if (loading) {
    return null;
  }

  if (!user) {
    return (
      <div className="app saved-page">
        <header>
          <h1>Saved builds</h1>
          <p className="muted">
            Log in with Discord to see the builds and squads you&apos;ve saved.
            Saves are tied to your Discord account, so they follow you to any
            browser.
          </p>
        </header>
        <button type="button" className="nav-btn discord" onClick={login}>
          Log in with Discord
        </button>
      </div>
    );
  }

  return (
    <div className="app saved-page">
      <header>
        <h1>Saved builds</h1>
        <p className="muted">
          Everything you&apos;ve saved from the character builder and the team
          builder. Opening a save loads it back into its builder.
        </p>
      </header>

      {listing ? (
        <p className="muted">Loading your saves…</p>
      ) : (
        <>
          <SavedSection
            title="Character builds"
            rows={buildRows}
            onDelete={remove}
            emptyHint="No saved character builds yet."
            emptyHref={hrefFor('builder')}
            emptyCta="Build a character →"
          />
          <SavedSection
            title="Squads"
            rows={teamRows}
            onDelete={remove}
            emptyHint="No saved squads yet."
            emptyHref={hrefFor('team-builder')}
            emptyCta="Build a squad →"
          />
        </>
      )}
    </div>
  );
}
