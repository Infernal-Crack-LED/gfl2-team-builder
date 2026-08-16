/**
 * Reusable save/load control for user profiles (conventions §7 — the only
 * runtime API). The host page supplies `getCode` (serialize current state to
 * an opaque base64url blob) and `onLoad` (apply a loaded blob); this control
 * owns naming, listing, and deletion.
 *
 * Logged out → a muted hint + login button. Logged in → a "Save" chip that
 * opens an InlineNameField (upsert by name) and a "▾ Saved (n)" dropdown
 * with load-on-click rows and per-row delete buttons.
 */
import { useEffect, useRef, useState } from 'react';
import { deleteProfile, listProfiles, saveProfile, useAuth } from '../auth';
import type { SavedProfile } from '../auth';
import { InlineNameField } from './InlineNameField';

export function SaveProfileControl({
  kind,
  getCode,
  onLoad,
}: {
  kind: string;
  /** Serialize the current state; null means "nothing worth saving yet". */
  getCode: () => string | null;
  onLoad: (code: string) => void;
}) {
  const { user, loading, login } = useAuth();
  const [profiles, setProfiles] = useState<SavedProfile[]>([]);
  const [naming, setNaming] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // (Re)load the profile list whenever the user or kind changes.
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
        // List failures degrade to an empty dropdown, never a crash.
      });
    return () => {
      live = false;
    };
  }, [user, kind]);

  // Standard popover dismiss (§5): outside-mousedown + Escape, attached only
  // while the dropdown is open, cleaned up on close.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onDocDown = (e: globalThis.MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (loading) {
    return null;
  }

  if (!user) {
    return (
      <div className="save-profile">
        <span className="muted">Log in with Discord to save</span>
        <button type="button" className="nav-btn discord" onClick={login}>
          Log in
        </button>
      </div>
    );
  }

  const refresh = async () => {
    setProfiles(await listProfiles(kind));
  };

  const submitName = async (name: string) => {
    const code = getCode();
    if (!code) {
      setError('Nothing to save yet');
      setNaming(false);
      return;
    }
    try {
      await saveProfile(kind, name, code);
      setNaming(false);
      setError(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const remove = async (id: string) => {
    await deleteProfile(id);
    await refresh();
  };

  return (
    <div className="save-profile" ref={rootRef}>
      <div className="pills">
        {naming ? (
          <InlineNameField
            placeholder="Build name"
            onSubmit={submitName}
            onCancel={() => setNaming(false)}
          />
        ) : (
          <button
            type="button"
            className="chip"
            onClick={() => setNaming(true)}
          >
            Save
          </button>
        )}
        <div className="save-profile-dropdown">
          <button
            type="button"
            className={'chip' + (open ? ' on' : '')}
            onClick={() => setOpen((o) => !o)}
            aria-haspopup="true"
            aria-expanded={open}
          >
            ▾ Saved ({profiles.length})
          </button>
          {open && (
            <div className="save-profile-panel" role="menu">
              {profiles.length === 0 ? (
                <div className="muted">No saved builds yet</div>
              ) : (
                profiles.map((p) => (
                  <div key={p.id} className="save-profile-row" role="menuitem">
                    <button
                      type="button"
                      className="save-profile-load"
                      onClick={() => {
                        onLoad(p.code);
                        setOpen(false);
                      }}
                    >
                      {p.name}
                    </button>
                    <button
                      type="button"
                      className="save-profile-delete"
                      aria-label={`Delete ${p.name}`}
                      onClick={() => remove(p.id)}
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
      {error && (
        <div className="save-profile-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
