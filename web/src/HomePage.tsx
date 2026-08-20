/**
 * Home page — redesigned landing with a clear CTA, feature overview, and a
 * Helen bot callout. The goal is to explain what the site does and nudge new
 * visitors toward the team builder instead of mirroring the top nav.
 */
import { hrefFor, onSpaLinkClick } from './router';
import { dev } from './site-data';
// Hero + feature copy lives in src/share so the no-JS crawler body
// (src/server/noJsBody.ts) renders the same words this page does.
import {
  GAME_NAME,
  HOME_FEATURES,
  HOME_HERO_AFTER,
  HOME_HERO_BEFORE,
  HOME_SECTION_TITLE,
  type HomeFeature,
} from '../../src/share/homeContent';

function FeatureCard({ route, title, blurb, cta }: HomeFeature) {
  const href = hrefFor(route);
  return (
    <a href={href} onClick={onSpaLinkClick(href)} className="home-feature">
      <h2>{title}</h2>
      <p>{blurb}</p>
      <span className="home-feature-cta" aria-hidden="true">
        {cta} →
      </span>
    </a>
  );
}

export function HomePage() {
  return (
    <div className="app home-page">
      <section className="home-hero">
        <img
          className="home-hero-logo"
          src="/site-icon.png"
          alt=""
          width={56}
          height={56}
        />
        <h1>Refitting Room</h1>
        <p>
          {HOME_HERO_BEFORE}
          <strong>{GAME_NAME}</strong>
          {HOME_HERO_AFTER}
        </p>
        <div className="home-cta-row">
          <a
            href={hrefFor('team-builder')}
            className="btn-solid"
            onClick={onSpaLinkClick(hrefFor('team-builder'))}
          >
            Build a Team
          </a>
          <a
            href={hrefFor('characters')}
            className="btn-outline"
            onClick={onSpaLinkClick(hrefFor('characters'))}
          >
            Browse Characters
          </a>
        </div>
      </section>

      <section className="home-section">
        <h2 className="home-section-title">{HOME_SECTION_TITLE}</h2>
        <div className="home-feature-grid">
          {HOME_FEATURES.map((feature) => (
            <FeatureCard key={feature.route} {...feature} />
          ))}
        </div>
      </section>

      <section className="home-callout">
        <img
          className="home-callout-avatar"
          src="/helen.png"
          alt=""
          width={72}
          height={72}
        />
        <div className="home-callout-body">
          <h2>Meet {dev.helen.name}</h2>
          <p>{dev.helen.blurb}</p>
          <a
            className="btn-primary discord"
            href={dev.helen.addToServer}
            target="_blank"
            rel="noreferrer"
          >
            Add {dev.helen.name} to your server
          </a>
        </div>
      </section>

      <section className="home-callout">
        <img
          className="home-callout-avatar square"
          src="/nikkesim-icon.png"
          alt=""
          width={72}
          height={72}
        />
        <div className="home-callout-body">
          <h2>{dev.nikkesim.name}</h2>
          <p>{dev.nikkesim.blurb}</p>
          <a
            className="btn-outline"
            href={dev.nikkesim.url}
            target="_blank"
            rel="noreferrer"
          >
            Visit {dev.nikkesim.name}
          </a>
        </div>
      </section>
    </div>
  );
}
