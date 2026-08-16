/**
 * Terms of Service page — rendered from the same content as TERMS.md.
 */
export function TermsPage() {
  return (
    <div className="app legal-page">
      <header>
        <h1>Terms of Service</h1>
        <p className="muted">Last updated: 2026-08-16</p>
      </header>

      <section>
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your use of the{' '}
          <strong>Helen</strong> Discord bot (&ldquo;Helen&rdquo;, &ldquo;the
          Bot&rdquo;) and the <strong>Refitting Room</strong> website
          (&ldquo;the Site&rdquo;, refittingroom.app). By adding Helen to a
          server, using her commands, or accessing the Site, you agree to these
          Terms. If you do not agree, do not use the services.
        </p>
      </section>

      <section>
        <h2>The service</h2>
        <p>
          Helen and the Site are free, community-run tools for players of
          Girls&rsquo; Frontline 2: Exilium. Helen provides doll and weapon
          lookups, team-building assistance, and game resource links. The Site
          provides a visual team builder, doll and weapon browser, and build
          sharing. Both are provided{' '}
          <strong>
            as a hobby project, at no charge, and &ldquo;as is.&rdquo;
          </strong>
        </p>
        <p>
          Helen and the Site are{' '}
          <strong>not affiliated with, endorsed by, or sponsored by</strong>{' '}
          Discord Inc., Sunborn Network Technology, or any third-party data
          source. &ldquo;Girls&rsquo; Frontline 2: Exilium&rdquo; and related
          names are trademarks of their respective owners.
        </p>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <p>When using Helen or the Site, you agree to:</p>
        <ul>
          <li>
            Follow{' '}
            <a
              href="https://discord.com/terms"
              target="_blank"
              rel="noreferrer"
            >
              Discord&rsquo;s Terms of Service
            </a>{' '}
            and{' '}
            <a
              href="https://discord.com/guidelines"
              target="_blank"
              rel="noreferrer"
            >
              Community Guidelines
            </a>{' '}
            at all times.
          </li>
          <li>
            Not abuse, spam, overload, reverse-engineer, or attempt to disrupt
            or gain unauthorized access to the services or their infrastructure.
          </li>
          <li>
            Not use the services for any unlawful purpose or to harass others.
          </li>
        </ul>
        <p>
          Server administrators are responsible for how Helen is configured and
          used within their servers.
        </p>
      </section>

      <section>
        <h2>Third-party data</h2>
        <p>
          Helen and the Site display game information aggregated from public
          third-party sources (primarily{' '}
          <a href="https://dandegate.net" target="_blank" rel="noreferrer">
            dandegate.net
          </a>
          ). This information is provided for convenience and{' '}
          <strong>may be inaccurate, incomplete, or out of date</strong>. It is
          not official, and we make no guarantees about it. All game names,
          data, and imagery belong to their respective owners.
        </p>
      </section>

      <section>
        <h2>Availability</h2>
        <p>
          The services are offered without any guarantee of availability,
          uptime, or continued operation. We may modify, suspend, or discontinue
          them (in whole or in part) at any time, without notice or liability.
        </p>
      </section>

      <section>
        <h2>Disclaimer of warranties</h2>
        <p className="legal-caps">
          THE SERVICES ARE PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS
          AVAILABLE,&rdquo; WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR
          IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY,
          FITNESS FOR A PARTICULAR PURPOSE, ACCURACY, AND NON-INFRINGEMENT.
        </p>
      </section>

      <section>
        <h2>Limitation of liability</h2>
        <p className="legal-caps">
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE MAINTAINER SHALL NOT BE
          LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
          PUNITIVE DAMAGES, OR ANY LOSS OF DATA, PROFITS, OR GOODWILL, ARISING
          FROM OR RELATED TO YOUR USE OF (OR INABILITY TO USE) THE SERVICES.
          BECAUSE THE SERVICES ARE PROVIDED FREE OF CHARGE, THE
          MAINTAINER&rsquo;S TOTAL LIABILITY FOR ANY CLAIM IS LIMITED TO ZERO.
        </p>
      </section>

      <section>
        <h2>Privacy</h2>
        <p>
          Your use of Helen and the Site is also governed by our{' '}
          <a href="/privacy">Privacy Policy</a>, which explains what data the
          services process.
        </p>
      </section>

      <section>
        <h2>Changes to these Terms</h2>
        <p>
          We may update these Terms from time to time. Material changes will be
          reflected by updating the &ldquo;Last updated&rdquo; date above.
          Continued use of the services after a change constitutes acceptance of
          the updated Terms.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Questions about these Terms? Contact the maintainer via{' '}
          <strong>Discord</strong> or by opening an issue on the project&rsquo;s
          GitHub repository.
        </p>
      </section>
    </div>
  );
}
