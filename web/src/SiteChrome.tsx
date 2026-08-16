/**
 * Shared site chrome — nav bar + footer rendered on every page.
 * Modeled on nikke-sim's SiteChrome.tsx: nav links collapse to a
 * dropdown at ≤640px, hamburger for secondary links.
 */
import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import type { Route } from './router';
import { hrefFor, navigate, onSpaLinkClick } from './router';
import { useAuth } from './auth';

const NAV: { route: Route; label: string }[] = [
  { route: 'characters', label: 'Characters' },
  { route: 'weapons', label: 'Weapons' },
  { route: 'team-builder', label: 'Team Builder' },
];

// Secondary links — collapse into hamburger on all sizes
const MENU: { route: Route; label: string }[] = [
  { route: 'credits', label: 'Credits' },
];

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => window.matchMedia(query).matches
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

function navClick(e: MouseEvent<HTMLAnchorElement>, route: Route) {
  if (
    e.defaultPrevented ||
    e.button !== 0 ||
    e.metaKey ||
    e.ctrlKey ||
    e.shiftKey ||
    e.altKey
  ) {
    return;
  }
  e.preventDefault();
  navigate(hrefFor(route));
}

/**
 * Right-side nav auth control. Logged out: a Discord login button that does
 * a FULL page navigation (OAuth leaves the SPA). Logged in: avatar +
 * username + logout. Lives in site-nav-right, which stays visible at the
 * ≤640px breakpoint (only the page links collapse into the dropdown), so it
 * works on mobile without extra handling.
 */
function AuthControl() {
  const { user, loading, login, logout } = useAuth();
  if (loading) {
    // Avoid flashing "Log in" while the stored token is being validated.
    return null;
  }
  if (!user) {
    return (
      <button type="button" className="nav-btn discord" onClick={login}>
        Log in with Discord
      </button>
    );
  }
  return (
    <div className="nav-user">
      {user.avatar && (
        <img
          className="nav-user-avatar"
          src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`}
          alt=""
          width={24}
          height={24}
        />
      )}
      <span className="nav-user-name">{user.username}</span>
      <button type="button" className="nav-btn" onClick={logout}>
        Log out
      </button>
    </div>
  );
}

export function SiteNav({ current }: { current: Route }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobile = useMediaQuery('(max-width: 640px)');

  // Close dropdown on outside click or Escape
  useEffect(() => {
    if (!dropdownOpen) {
      return;
    }
    const onDocDown = (e: globalThis.MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [dropdownOpen]);

  // Close menu on outside click or Escape
  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onDocDown = (e: globalThis.MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const dropdownSelect = (e: MouseEvent<HTMLAnchorElement>, route: Route) => {
    navClick(e, route);
    setDropdownOpen(false);
  };

  const menuNav = (e: MouseEvent<HTMLAnchorElement>, route: Route) => {
    navClick(e, route);
    setMenuOpen(false);
  };

  return (
    <nav className="site-nav">
      <div className="site-nav-inner">
        <div className="site-nav-left">
          {/* Brand / home link */}
          <a
            href="/"
            className={'site-nav-brand' + (current === 'home' ? ' on' : '')}
            onClick={onSpaLinkClick('/')}
          >
            <span className="site-nav-logo" aria-hidden="true">
              ⚔
            </span>
            GFL2
          </a>

          {mobile ? (
            /* Mobile: dropdown nav */
            <div className="nav-dropdown" ref={dropdownRef}>
              <button
                type="button"
                className={
                  'nav-dropdown-btn' + (dropdownOpen ? ' on' : '')
                }
                onClick={() => setDropdownOpen((o) => !o)}
                aria-haspopup="true"
                aria-expanded={dropdownOpen}
              >
                Page <span aria-hidden="true">▾</span>
              </button>
              {dropdownOpen && (
                <div className="nav-dropdown-panel" role="menu">
                  {NAV.map((n) => (
                    <a
                      key={n.route}
                      className={
                        'nav-dropdown-item' +
                        (current === n.route ? ' on' : '')
                      }
                      role="menuitem"
                      href={hrefFor(n.route)}
                      onClick={(e) => dropdownSelect(e, n.route)}
                    >
                      {n.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Desktop: inline nav links */
            NAV.map((n) => (
              <a
                key={n.route}
                href={hrefFor(n.route)}
                onClick={(e) => navClick(e, n.route)}
                className={current === n.route ? 'on' : ''}
              >
                {n.label}
              </a>
            ))
          )}
        </div>

        <div className="site-nav-right">
          <AuthControl />
          {/* Hamburger menu for secondary links */}
          {MENU.length > 0 && (
            <div className="nav-menu" ref={menuRef}>
              <button
                className={'nav-menu-btn' + (menuOpen ? ' on' : '')}
                aria-label="More"
                aria-haspopup="true"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((o) => !o)}
              >
                <span aria-hidden="true">☰</span>
                <span className="sr-only">More</span>
              </button>
              {menuOpen && (
                <div className="nav-menu-panel" role="menu">
                  {MENU.map((n) => (
                    <a
                      key={n.route}
                      className={
                        'nav-menu-item' +
                        (current === n.route ? ' on' : '')
                      }
                      role="menuitem"
                      href={hrefFor(n.route)}
                      onClick={(e) => menuNav(e, n.route)}
                    >
                      {n.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-by">
        made by{' '}
        <a
          href={hrefFor('credits')}
          onClick={(e) => navClick(e, 'credits')}
        >
          Max
        </a>
        {' · '}
        <a
          href={hrefFor('credits')}
          onClick={(e) => navClick(e, 'credits')}
        >
          Credits
        </a>
        {' · '}GFL2 Team Builder
      </div>
    </footer>
  );
}
