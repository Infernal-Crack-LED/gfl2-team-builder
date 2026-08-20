/**
 * Privacy Policy page — rendered from the same content as PRIVACY.md.
 */
export function PrivacyPage() {
  return (
    <div className="app legal-page">
      <header>
        <h1>Privacy Policy</h1>
        <p className="muted">Last updated: 2026-08-16</p>
      </header>

      <section>
        <p>
          This Privacy Policy explains what information the{' '}
          <strong>Helen</strong> Discord bot (&ldquo;Helen&rdquo;, &ldquo;the
          Bot&rdquo;) and the <strong>Refitting Room</strong> website
          (&ldquo;the Site&rdquo;, refittingroom.app) collect, how it is used,
          and your choices. By adding Helen to a server, using her commands, or
          signing in to the Site, you agree to this policy.
        </p>
        <p>
          Helen and the Site are community tools for the game{' '}
          <strong>Girls&rsquo; Frontline 2: Exilium</strong>. They are{' '}
          <strong>not affiliated with, endorsed by, or sponsored by</strong>{' '}
          Discord Inc., Sunborn Network Technology, or the operators of any
          third-party data source.
        </p>
      </section>

      <section>
        <h2>Information we collect</h2>
        <p>
          Helen and the Site only store the minimum needed to work.
          Specifically:
        </p>
        <ul>
          <li>
            <strong>Discord identifiers</strong> &mdash; server (guild) IDs,
            channel IDs, and user IDs. These are how Discord identifies servers,
            channels, and people.
          </li>
          <li>
            <strong>Website profiles</strong> &mdash; when you sign in to the
            Site with Discord, we store your Discord user ID, display name, and
            avatar hash, along with any team builds or doll builds you save.
            Saved builds are identified by a name you choose and an encoded
            build string.
          </li>
          <li>
            <strong>Public share links</strong> &mdash; builds you choose to
            make public are stored with a unique ID so they can be shared via a
            link. Public builds are readable by anyone with the link.
          </li>
        </ul>
        <p>
          We also store non-personal <strong>game data</strong> (doll stats,
          weapon data, keys, and effects) fetched from public sources; this
          contains no information about you.
        </p>
      </section>

      <section>
        <h2>Information we do not collect</h2>
        <ul>
          <li>
            <strong>We do not read or store your Discord messages.</strong>{' '}
            Helen processes slash command interactions only.
          </li>
          <li>
            We do not store direct messages, message history, voice data, or
            advertising trackers.
          </li>
          <li>We do not sell or rent your data to anyone.</li>
          <li>
            The Site uses privacy-friendly analytics (Umami) that do not set
            cookies or collect personal data.
          </li>
        </ul>
      </section>

      <section>
        <h2>How we use information</h2>
        <p>
          Collected information is used solely to operate Helen&rsquo;s features
          and the Site &mdash; delivering command responses, remembering your
          saved builds, and providing shareable links.
        </p>
      </section>

      <section>
        <h2>Third parties</h2>
        <ul>
          <li>
            <strong>Hosting</strong> &mdash; Helen, the Site, and the database
            run on cloud infrastructure (Railway); data is stored in a
            PostgreSQL database there.
          </li>
          <li>
            <strong>Game data sources</strong> &mdash; GFL2 game data and art
            are compiled ahead of time and shipped with the Site, and the images
            are served from our own origin. Browsing the Site therefore sends{' '}
            <strong>nothing about you to any game-data source</strong>: those
            requests happen on the maintainer&rsquo;s machine, not in your
            browser. Where the data comes from, and who owns it, is set out on{' '}
            <a href="/credits">Credits</a> and{' '}
            <a href="/usage">Usage &amp; Permissions</a>.
          </li>
          <li>
            <strong>Discord</strong> &mdash; the Site uses Discord&rsquo;s
            OAuth2 for sign-in. Discord&rsquo;s use of your data is governed by
            their{' '}
            <a
              href="https://discord.com/privacy"
              target="_blank"
              rel="noreferrer"
            >
              Privacy Policy
            </a>
            .
          </li>
        </ul>
      </section>

      <section>
        <h2>Data retention</h2>
        <p>
          We keep the data above for as long as you use the service. You can
          delete your saved builds at any time through the Site. Removing Helen
          from a server stops all further processing for that server. To request
          deletion of all data associated with your Discord user ID, contact the
          maintainer (see &ldquo;Contact&rdquo;).
        </p>
      </section>

      <section>
        <h2>Your choices and rights</h2>
        <ul>
          <li>
            <strong>Saved builds</strong> can be viewed, renamed, or deleted at
            any time on the Site.
          </li>
          <li>
            <strong>Public share links</strong> can be removed by deleting the
            associated build.
          </li>
          <li>
            <strong>Removing the Bot</strong> from a server stops all further
            processing for that server.
          </li>
          <li>
            <strong>Deletion requests</strong> &mdash; to request deletion of
            data associated with your Discord user ID, contact the maintainer.
          </li>
        </ul>
      </section>

      <section>
        <h2>Children</h2>
        <p>
          Helen and the Site are not directed to children. You must meet
          Discord&rsquo;s minimum age requirement (at least 13, or older where
          required by local law) to use Discord and these services.
        </p>
      </section>

      <section>
        <h2>Changes to this policy</h2>
        <p>
          We may update this policy from time to time. Material changes will be
          reflected by updating the &ldquo;Last updated&rdquo; date above.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          For privacy questions or deletion requests, contact the maintainer via{' '}
          <strong>Discord</strong> or by opening an issue on the project&rsquo;s
          GitHub repository.
        </p>
      </section>
    </div>
  );
}
