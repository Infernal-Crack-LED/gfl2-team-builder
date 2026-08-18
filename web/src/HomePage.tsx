/**
 * Home page — redesigned landing with a clear CTA, feature overview, and a
 * Helen bot callout. The goal is to explain what the site does and nudge new
 * visitors toward the team builder instead of mirroring the top nav.
 */
import type { Route } from './router';
import { hrefFor, onSpaLinkClick } from './router';
import { dev } from './site-data';

interface Feature {
  route: Route;
  title: string;
  blurb: string;
  cta: string;
}

const FEATURES: Feature[] = [
  {
    route: 'team-builder',
    title: 'Team Builder',
    blurb:
      'Assemble up to five dolls and see team effects, elemental synergies, and damage-type coverage at a glance.',
    cta: 'Build a team',
  },
  {
    route: 'builder',
    title: 'Character Builder',
    blurb:
      'Pick a doll, set their weapon, refinement, keys, vertebra, and stats, then share the build as a card or short link.',
    cta: 'Build a character',
  },
  {
    route: 'characters',
    title: 'Character Catalog',
    blurb:
      'Browse every doll with full kits, key recommendations, weapons, attachment sets, and community build cards.',
    cta: 'Browse characters',
  },
  {
    route: 'weapons',
    title: 'Weapon Catalog',
    blurb:
      'Compare all weapons, their stats, effects, imprints, and which dolls want them most.',
    cta: 'Browse weapons',
  },
  {
    route: 'keys',
    title: 'Key Catalogue',
    blurb:
      'Read every key in the game, filter by effect tags, and find the best fits for your squad.',
    cta: 'Browse keys',
  },
  {
    route: 'tools',
    title: 'Card Tools',
    blurb:
      'Download or host shareable infographics for builds, squads, weapons, recommendations, and pull odds.',
    cta: 'Open tools',
  },
];

function FeatureCard({ route, title, blurb, cta }: Feature) {
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
          Plan, build, and share{' '}
          <strong>Girls&apos; Frontline 2: Exilium</strong> squads. Browse every
          doll and weapon, assemble teams, craft build cards, and compare key
          effects — all in one place.
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
        <h2 className="home-section-title">
          Everything you need to plan a squad
        </h2>
        <div className="home-feature-grid">
          {FEATURES.map((feature) => (
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
