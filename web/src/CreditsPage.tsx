/**
 * Credits page — data sources and acknowledgments.
 */
import { hrefFor, onSpaLinkClick } from './router';

export function CreditsPage() {
  return (
    <div className="app credits-page">
      <header>
        <h1>Credits</h1>
      </header>

      <section>
        <h2>Data Sources</h2>
        <ul>
          <li>
            Game data from{' '}
            <a href="https://dandegate.net" target="_blank" rel="noreferrer">
              dandegate.net
            </a>{' '}
            — community-maintained GFL2 database. Skill and key icons are
            mirrored from it and served from this site.
          </li>
          <li>
            Class, phase, ammo and Imago factor icons from{' '}
            <a href="https://iopwiki.com/wiki" target="_blank" rel="noreferrer">
              IOP Wiki
            </a>
            , used under{' '}
            <a
              href="https://creativecommons.org/licenses/by-sa/3.0/"
              target="_blank"
              rel="noreferrer"
            >
              CC BY-SA 3.0
            </a>
            .
          </li>
        </ul>
        <p className="muted">
          All game art and assets are the property of Sunborn Network
          Technology.
        </p>
      </section>

      <section>
        <h2>Built With</h2>
        <ul>
          <li>React + Vite + TypeScript</li>
          <li>Drizzle ORM + PostgreSQL (sync pipeline)</li>
        </ul>
      </section>

      <section>
        <h2>Made by Max</h2>
        <p className="muted">
          <a href={hrefFor('dev')} onClick={onSpaLinkClick(hrefFor('dev'))}>
            Meet the dev
          </a>{' '}
          — or find me on{' '}
          <a
            href="https://github.com/Infernal-Crack-LED"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          .
        </p>
      </section>
    </div>
  );
}
