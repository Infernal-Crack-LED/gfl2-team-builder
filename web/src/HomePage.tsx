/**
 * Home page — minimal landing with hero + links to the main sections.
 */
import { hrefFor, onSpaLinkClick } from './router';

export function HomePage() {
  return (
    <div className="app home-page">
      <div className="home-hero">
        <h1>GFL2 Team Builder</h1>
        <p className="muted">
          Build and plan your Girls&apos; Frontline 2: Exilium squad.
        </p>
        <div className="home-links">
          <a
            href={hrefFor('characters')}
            className="btn-primary"
            onClick={onSpaLinkClick(hrefFor('characters'))}
          >
            Browse Characters
          </a>
          <a
            href={hrefFor('weapons')}
            className="btn-primary"
            onClick={onSpaLinkClick(hrefFor('weapons'))}
          >
            Browse Weapons
          </a>
          <a
            href={hrefFor('team-builder')}
            className="btn-primary"
            onClick={onSpaLinkClick(hrefFor('team-builder'))}
          >
            Team Builder
          </a>
        </div>
      </div>
    </div>
  );
}
