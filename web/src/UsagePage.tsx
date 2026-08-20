/**
 * Usage permissions page — who owns what on this site, and what may be reused.
 *
 * Three kinds of material with three different answers: game content owned by
 * Sunborn and shown under fair use; community work under its owners' terms; and
 * the original work built here, the only part this project can license. The
 * "not ours" entries name whom to ask instead.
 *
 * Reference, not essay: state the rule, name the owner, stop.
 */
import { hrefFor, onSpaLinkClick } from './router';

export function UsagePage() {
  return (
    <div className="app legal-page usage-page">
      <header>
        <h1>Usage &amp; Permissions</h1>
        <p className="muted">Last updated: 2026-08-20</p>
      </header>

      <section>
        <h2>Game content</h2>
        <p>
          Doll and weapon names, portraits, weapon art, skill and key icons,
          skill text, stat values and every other in-game asset shown here are
          the property of <strong>Sunborn Network Technology</strong> and its
          affiliates, reproduced for identification, commentary and reference
          under <strong>fair use</strong>.
        </p>
        <p>
          Fair use is not a licence. This project claims no ownership of game
          content, grants no rights in it, and is not affiliated with, endorsed
          by, or sponsored by Sunborn. &ldquo;Girls&rsquo; Frontline 2:
          Exilium&rdquo; and related names are trademarks of their respective
          owners.
        </p>
        <p>
          Values here are compiled from the game and cross-checked against
          community sources. The compilation is this project&rsquo;s; the
          content is Sunborn&rsquo;s. Anything you reuse that carries game
          content stands on your own fair-use claim.
        </p>
        <p>
          The game data and art gathered here are free to copy for any fan
          project: the JSON in <code>data/</code> and the images under{' '}
          <code>/game-assets/</code>. No permission request or attribution
          condition required.
        </p>
        <p>
          Serve your own copy — host the files on your own origin rather than
          requesting them from refittingroom.app.
        </p>
        <p>
          Mirror:{' '}
          <a
            href="https://github.com/Infernal-Crack-LED/gfl2-team-builder"
            target="_blank"
            rel="noreferrer"
          >
            github.com/Infernal-Crack-LED/gfl2-team-builder
          </a>
        </p>
        <p>
          Excluded: <code>data/recommendations-source.json</code> (compilation
          spreadsheet) and <code>/gfl2-icons/</code> (IOP Wiki). Copying the
          compilation does not change ownership of the game content in it.
        </p>
      </section>

      <section>
        <h2>The original work built for this site</h2>
        <ul>
          <li>Written copy: page text, explanations, labels, tooltips.</li>
          <li>
            The infographics card layouts — build, squad, recommendation and
            pull cards — and the images generated from them.
          </li>
          <li>
            Data compiled or derived here: the effect cross-reference matrix,
            effect tagging and grouping, key labelling, slugs, ordering and
            filter vocabularies, and the structured English kit text prepared
            for this site.
          </li>
          <li>The build and squad share-code format.</li>
        </ul>
        <p>Reusable for any fan purpose, on three conditions:</p>
        <ul>
          <li>
            <strong>Credit</strong> the Refitting Room visibly, linking{' '}
            <a href="https://refittingroom.app">refittingroom.app</a> where the
            medium allows.
          </li>
          <li>
            <strong>Carry the same declarations</strong> — unofficial fan use
            under fair use, and &ldquo;not affiliated with or endorsed by
            Sunborn&rdquo;.
          </li>
          <li>
            <strong>Non-commercial only.</strong> No sale, no paywall, no
            implied endorsement.
          </li>
        </ul>
      </section>

      <section>
        <h2>Community sources</h2>
        <ul>
          <li>
            <strong>Game data, text, art and audio</strong> — Sunborn Network
            Technology.
          </li>
          <li>
            <strong>
              Recommendation builds, and values the game client doesn&rsquo;t
              state
            </strong>{' '}
            — from the{' '}
            <a
              href="https://docs.google.com/spreadsheets/d/1DogyU3K7ZXw2qbhP1EhRXIAw5nCyIV5G5e-QWviBZME/edit?usp=sharing"
              target="_blank"
              rel="noreferrer"
            >
              GFL2 Official Release Info Compilation
            </a>
            , used with its maintainers&rsquo; permission.
          </li>
          <li>
            <strong>Class, phase, ammo and Imago factor icons</strong>, and
            other wiki-sourced material, from{' '}
            <a href="https://iopwiki.com/wiki" target="_blank" rel="noreferrer">
              IOP Wiki
            </a>{' '}
            — reusable under{' '}
            <a
              href="https://creativecommons.org/licenses/by-sa/3.0/"
              target="_blank"
              rel="noreferrer"
            >
              CC BY-SA 3.0
            </a>
            : attribute IOP Wiki, link the licence, share alike.
          </li>
          <li>
            <strong>Third-party names and marks</strong> — Discord Inc., and any
            other project or service named on this site.
          </li>
        </ul>
      </section>

      <section>
        <h2>Attribution wording</h2>
        <p className="usage-attribution">
          Data and layout from Refitting Room (refittingroom.app), an unofficial
          Girls&rsquo; Frontline 2: Exilium fan project. Game content is the
          property of Sunborn Network Technology and is used under fair use. Not
          affiliated with or endorsed by Sunborn.
        </p>
        <p>For the wiki icons, add:</p>
        <p className="usage-attribution">
          Class, phase and ammo icons from IOP Wiki (iopwiki.com), used under CC
          BY-SA 3.0.
        </p>
      </section>

      <section>
        <h2>Source code</h2>
        <p>
          Licensed under the{' '}
          <a
            href="https://polyformproject.org/licenses/noncommercial/1.0.0"
            target="_blank"
            rel="noreferrer"
          >
            PolyForm Noncommercial License 1.0.0
          </a>{' '}
          — fork, modify and self-host for any non-commercial purpose; no
          commercial use. Copies carry this notice:
        </p>
        <p className="usage-attribution">
          Required Notice: Copyright Maxwell Sutton — Refitting Room
          (https://refittingroom.app)
        </p>
        <p>
          Covers this project&rsquo;s code only. Mirrored game art, the IOP Wiki
          icons and the compiled game data are excluded.
        </p>
      </section>

      <section>
        <h2>Rights holders</h2>
        <p>
          For removal or different credit, contact the maintainer via{' '}
          <strong>Discord</strong> or open an issue on the project&rsquo;s
          GitHub repository.
        </p>
        <p className="muted">
          See also:{' '}
          <a
            href={hrefFor('credits')}
            onClick={onSpaLinkClick(hrefFor('credits'))}
          >
            Credits
          </a>{' '}
          and{' '}
          <a href={hrefFor('terms')} onClick={onSpaLinkClick(hrefFor('terms'))}>
            Terms
          </a>
          .
        </p>
      </section>
    </div>
  );
}
