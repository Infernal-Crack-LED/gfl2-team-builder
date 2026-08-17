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
            — community-maintained GFL2 database.
          </li>
        </ul>
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
