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
            Game data and art are sourced from Girls&apos; Frontline 2: Exilium
            and are the property of <strong>Sunborn Network Technology</strong>.
            They are shown here for identification, commentary and reference in
            a free, non-commercial fan tool, under <strong>fair use</strong> —
            not under any licence. This site is an unofficial fan resource, is
            not affiliated with or endorsed by the rights holders, and makes no
            claim of ownership over any game content.
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
            . Reusable by anyone on those same terms — attribute IOP Wiki, link
            the licence, share alike.
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
            permission. That permission was granted to this project and
            doesn&apos;t travel: ask the sheet&apos;s maintainers before reusing
            it.
          </li>
        </ul>
        <p className="muted">
          Which of this you may reuse, and on what terms, is spelled out on the{' '}
          <a href={hrefFor('usage')} onClick={onSpaLinkClick(hrefFor('usage'))}>
            Usage &amp; Permissions
          </a>{' '}
          page.
        </p>
      </section>

      <section>
        <h2>Built With</h2>
        <ul>
          <li>React + Vite + TypeScript</li>
          <li>Drizzle ORM + PostgreSQL (sync pipeline)</li>
        </ul>
        <p className="muted">
          The site&apos;s own source is licensed under the{' '}
          <a
            href="https://polyformproject.org/licenses/noncommercial/1.0.0"
            target="_blank"
            rel="noreferrer"
          >
            PolyForm Noncommercial License 1.0.0
          </a>
          ; the game art, wiki icons and game data it renders are not covered by
          it.
        </p>
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
