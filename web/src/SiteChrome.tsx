/**
 * Shared site chrome — nav bar + footer rendered on every page.
 * Ported from nikke-sim's SiteChrome.tsx so both sites share one look: the
 * page links are pill tabs that collapse into a TabDropdown at ≤640px, the
 * Discord auth control stays visible at every width, and secondary links live
 * behind the hamburger. The footer is the brand-tile social row + the
 * "made by Max" line.
 */
import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import type { Route } from './router';
import { hrefFor, navigate } from './router';
import { socials } from './site-data';
import { BrandIcon } from './social-icons';
import { TabDropdown, useMediaQuery } from './TabDropdown';
import { useAuth } from './auth';

const NAV: { route: Route; label: string }[] = [
  { route: 'characters', label: 'Characters' },
  { route: 'weapons', label: 'Weapons' },
  { route: 'team-builder', label: 'Team Builder' },
];

// Secondary links — collapse into the hamburger at all sizes
const MENU: { route: Route; label: string }[] = [
  { route: 'dev', label: 'Meet the dev' },
  { route: 'credits', label: 'Credits' },
  { route: 'privacy', label: 'Privacy' },
  { route: 'terms', label: 'Terms' },
];

// Intercept left-clicks for in-app (pushState) navigation; let modified clicks
// (open-in-new-tab, etc.) and the real href behave natively.
function navClick(e: MouseEvent, route: Route) {
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
 * a FULL page navigation (OAuth leaves the SPA); icon-only on mobile to save
 * width, same as nikke-sim. Logged in: avatar + username + logout.
 */
function AuthControl({ mobile }: { mobile: boolean }) {
  const { user, loading, login, logout } = useAuth();
  if (loading) {
    // Avoid flashing "Log in" while the stored token is being validated.
    return null;
  }
  if (!user) {
    return (
      <button
        type="button"
        className="nav-btn discord nav-login"
        onClick={login}
        title="save teams and builds to your Discord account"
      >
        <span className="discord-icon" aria-hidden="true">
          <BrandIcon name="discord" />
        </span>
        {!mobile && <span>Log in with Discord</span>}
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
      <span className="nav-user-name" title="logged in">
        {user.username}
      </span>
      <button type="button" className="nav-btn nav-logout" onClick={logout}>
        Log out
      </button>
    </div>
  );
}

export function SiteNav({ current }: { current: Route }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const mobile = useMediaQuery('(max-width: 640px)'); // page nav → focused dropdown

  // Close the menu on an outside click or Escape.
  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onDocDown = (e: globalThis.MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
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

  // A menu link both navigates and closes the menu.
  const menuNav = (e: MouseEvent, route: Route) => {
    navClick(e, route);
    setMenuOpen(false);
  };

  return (
    <nav className="site-nav">
      <div className="site-nav-inner">
        <div className="site-nav-left">
          {/* Brand / home link — the nikkesim.app mark + wordmark */}
          <a
            href={hrefFor('home')}
            className={'site-nav-brand' + (current === 'home' ? ' on' : '')}
            onClick={(e) => navClick(e, 'home')}
          >
            <img
              className="site-nav-logo"
              src="/nikkesim-icon.png"
              alt=""
              width={22}
              height={22}
            />
            GFL2
          </a>

          {mobile ? (
            <TabDropdown
              label="Page"
              items={NAV.map((n) => ({
                key: n.route,
                label: n.label,
                active: current === n.route,
                href: hrefFor(n.route),
                onSelect: (e) => navClick(e, n.route),
              }))}
            />
          ) : (
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
          <AuthControl mobile={mobile} />
          <div className="nav-menu" ref={menuRef}>
            <button
              className={'nav-btn nav-menu-btn' + (menuOpen ? ' on' : '')}
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
                      'nav-menu-item' + (current === n.route ? ' on' : '')
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
        </div>
      </div>
    </nav>
  );
}

// Shared social footer rendered on every page — brand tiles, rounded corners.
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="social-row">
        {socials.map((s) => (
          <a
            key={s.label}
            className={
              'social-tile' +
              (s.icon.kind === 'img' && s.icon.round ? ' round' : '')
            }
            href={s.href}
            target="_blank"
            rel="noreferrer"
            aria-label={s.label}
            title={s.label}
            style={{ background: s.brand }}
          >
            {s.icon.kind === 'brand' ? (
              <BrandIcon name={s.icon.name} />
            ) : (
              <img src={s.icon.src} alt="" />
            )}
            <span className="sr-only">{s.label}</span>
          </a>
        ))}
      </div>
      <div className="site-footer-by">
        made by{' '}
        <a href={hrefFor('dev')} onClick={(e) => navClick(e, 'dev')}>
          Max
        </a>
        {' · '}
        <a href={hrefFor('credits')} onClick={(e) => navClick(e, 'credits')}>
          Credits
        </a>
        {' · '}
        <a href={hrefFor('privacy')} onClick={(e) => navClick(e, 'privacy')}>
          Privacy
        </a>
        {' · '}
        <a href={hrefFor('terms')} onClick={(e) => navClick(e, 'terms')}>
          Terms
        </a>
        {' · '}GFL2 Team Builder
      </div>
    </footer>
  );
}
