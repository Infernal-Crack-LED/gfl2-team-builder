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
            Game data and art are extracted directly from the Girls&apos;
            Frontline 2: Exilium game client.
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
          <li>
            Default recommendation builds, and select values the client
            doesn&apos;t state, from the{' '}
            <a
              href="https://docs.google.com/spreadsheets/d/1DogyU3K7ZXw2qbhP1EhRXIAw5nCyIV5G5e-QWviBZME/edit?usp=sharing"
              target="_blank"
              rel="noreferrer"
            >
              GFL2 Official Release Info Compilation
            </a>{' '}
            — community-maintained spreadsheet, used with its maintainers&apos;
            permission.
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
