/**
 * No-JS page bodies for the crawl surfaces.
 *
 * A crawler that does not execute JS sees `<div id="root"></div>` and nothing
 * else — the entire site is one empty shell to it. These functions render the
 * content of every page that exists to BE indexed — the landing page, the three
 * catalogues (characters, weapons, keys) and the three detail pages (doll,
 * weapon, builder) — as plain server HTML, so the doll names, kits, weapon
 * traits and key effects are in the response body.
 *
 * Google renders JS on a second, budgeted pass; Bing and most AI crawlers
 * largely do not. Everything indexable therefore ships in the first response.
 *
 * Same-source rule: every string here comes from the same committed
 * `data/*.json` rows the React pages import (via gameData.ts), so the crawler
 * can never index text the visitor doesn't see. React replaces this markup
 * wholesale on boot (createRoot, not hydrateRoot), so it only has to be valid
 * and crawlable — not a match for the React tree. Class names mirror the real
 * pages' so it is styled while it is on screen.
 *
 * Degrades, never vanishes: a missing field drops its row, never the section.
 */
import { stripHtml } from '../share/html.js';
import {
  HOME_FEATURES,
  HOME_HERO,
  HOME_SECTION_TITLE,
} from '../share/homeContent.js';
import { dev } from '../share/siteIdentity.js';
import { facetHeading, introFor, type Facet } from '../share/facets.js';
import {
  allDolls,
  allKeys,
  allWeapons,
  facetMembers,
  facetsInGroup,
  fixedKeysForDoll,
  getDollById,
  getWeapon,
  keyDisplayName,
  resolveMarkerText,
  type DollEntry,
  type KeyEntry,
  type WeaponEntry,
} from './gameData.js';
import { escapeHtml } from './htmlHead.js';
import type { ResolvedPage } from './pageMeta.js';

/**
 * Game text → escaped plain text: HTML stripped, every `[<kind>:<id>]` marker
 * resolved to the same name the React page shows (share/markers.ts grammar).
 */
function text(raw: string | null | undefined): string | null {
  const stripped = stripHtml(raw);
  if (stripped === null) {
    return null;
  }
  const resolved = resolveMarkerText(stripped).replace(/\s+/g, ' ').trim();
  return resolved === '' ? null : escapeHtml(resolved);
}

function idents(values: (string | number | null | undefined)[]): string {
  const pills = values
    .filter(
      (v): v is string | number => v !== null && v !== undefined && v !== ''
    )
    .map((v) => `<span class="unit-ident">${escapeHtml(String(v))}</span>`)
    .join('');
  return pills ? `<div class="unit-idents">${pills}</div>` : '';
}

function section(heading: string, inner: string): string {
  return inner
    ? `<section class="unit-section unit-panel"><h2>${heading}</h2>${inner}</section>`
    : '';
}

function crumbs(
  links: { href: string; label: string }[],
  leaf: string
): string {
  const trail = links
    .map((l) => `<a href="${l.href}">${escapeHtml(l.label)}</a> › `)
    .join('');
  return `<nav class="unit-crumbs">${trail}<span>${escapeHtml(leaf)}</span></nav>`;
}

const TOOLS_LINKS =
  '<section class="unit-section"><h2>Tools</h2><div class="unit-tools">' +
  '<a href="/characters">All characters</a>' +
  '<a href="/weapons">All weapons</a>' +
  '<a href="/keys">Key database</a>' +
  '<a href="/team-builder">Team builder</a>' +
  '</div></section>';

/**
 * `/` — the hero line and the six feature cards, from the same
 * `share/homeContent.ts` the React landing page renders. The landing page is
 * the site's authority page for brand and "gfl2 team builder" queries, and it
 * is also the top of the internal link graph: these six links are how a crawler
 * that starts at the root reaches the two catalogues at all.
 */
function homeBody(): string {
  const features = HOME_FEATURES.map(
    (f) =>
      `<a class="home-feature" href="${f.href}">` +
      `<h2>${escapeHtml(f.title)}</h2>` +
      `<p>${escapeHtml(f.blurb)}</p>` +
      `<span class="home-feature-cta">${escapeHtml(f.cta)} →</span>` +
      '</a>'
  ).join('');
  return (
    '<div class="app home-page">' +
    '<section class="home-hero"><h1>Refitting Room</h1>' +
    `<p>${escapeHtml(HOME_HERO)}</p>` +
    '<div class="home-cta-row">' +
    '<a class="btn-solid" href="/team-builder">Build a Team</a>' +
    '<a class="btn-outline" href="/characters">Browse Characters</a>' +
    '</div></section>' +
    '<section class="home-section">' +
    `<h2 class="home-section-title">${escapeHtml(HOME_SECTION_TITLE)}</h2>` +
    `<div class="home-feature-grid">${features}</div>` +
    '</section>' +
    // The two callouts, and specifically the nikkesim.app one: that is half of
    // a reciprocal link between two sites the same person runs, and the other
    // half is already in nikkesim's own server-rendered body. A link only the
    // React tree emits is a link no crawler ever counts.
    callout('Meet ' + dev.helen.name, dev.helen.blurb, {
      href: dev.helen.addToServer,
      label: `Add ${dev.helen.name} to your server`,
    }) +
    callout(dev.nikkesim.name, dev.nikkesim.blurb, {
      href: dev.nikkesim.url,
      label: `Visit ${dev.nikkesim.name}`,
    }) +
    '</div>'
  );
}

/** One `.home-callout` block — heading, blurb, and its outbound link. */
function callout(
  heading: string,
  blurb: string,
  link: { href: string; label: string }
): string {
  return (
    '<section class="home-callout"><div class="home-callout-body">' +
    `<h2>${escapeHtml(heading)}</h2>` +
    `<p>${escapeHtml(blurb)}</p>` +
    `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>` +
    '</div></section>'
  );
}

/**
 * A key's stat lines, in the same `.keycard-attrs` shape KeyCard.tsx renders so
 * the body is styled for the moment it is on screen before React boots.
 */
function keyAttributes(key: KeyEntry): string {
  const rows = (key.attributes ?? [])
    .filter((a) => a.name && a.value !== null && a.value !== undefined)
    .map(
      (a) =>
        `<span class="keycard-attr-name">${escapeHtml(a.name ?? '')}</span>` +
        `<span class="keycard-attr-value">${escapeHtml(String(a.value))}</span>`
    )
    .join('');
  return rows ? `<div class="keycard-attrs">${rows}</div>` : '';
}

/**
 * `/keys` — all three key pools with their stats and effect text.
 *
 * The keys page carries a whole database (590 rows) that a crawler could not
 * see at all: it is the one catalogue with no per-row page of its own, so this
 * body is the ONLY indexable copy. Fixed keys link back to the doll that owns
 * them, which also makes this page a second crawl path into /characters/<slug>.
 */
function keysBody(): string {
  const order = ['Fixed Key', 'Expansion Key', 'Common Key'];
  const byType = new Map<string, KeyEntry[]>();
  for (const key of allKeys()) {
    const type = key.keyType ?? 'Key';
    const bucket = byType.get(type);
    if (bucket) {
      bucket.push(key);
    } else {
      byType.set(type, [key]);
    }
  }

  const groups = order
    .filter((type) => byType.has(type))
    .map((type) => {
      const rows = (byType.get(type) ?? [])
        .map((key) => {
          const owner = getDollById(key.dollId ?? null);
          const effect = text(key.effect);
          return (
            '<div class="keycard">' +
            `<div class="keycard-head"><h3>${escapeHtml(keyDisplayName(key))}</h3>` +
            (key.level
              ? `<span class="keycard-level">Slot ${key.level}</span>`
              : '') +
            '</div>' +
            (owner
              ? `<p class="muted"><a href="/characters/${encodeURIComponent(owner.slug)}">${escapeHtml(owner.name)}</a></p>`
              : '') +
            keyAttributes(key) +
            (effect ? `<p class="keycard-effect">${effect}</p>` : '') +
            '</div>'
          );
        })
        .join('');
      return `<h2>${escapeHtml(type)}s</h2><div class="keygrid">${rows}</div>`;
    })
    .join('');

  return (
    '<div class="app keys-page"><header><h1>Keys</h1>' +
    '<p class="muted">Every fixed, expansion, and common key, with its stats and effects.</p>' +
    `</header>${groups}</div>`
  );
}

/**
 * `/builder/<slug>` — the doll's fixed keys and signature weapon.
 *
 * Deliberately NOT a copy of the doll page: that one words her skills and bio,
 * this one words her keys and imprint. 63 builder URLs that differed only by a
 * name in the title were thin near-duplicates; giving each one the content its
 * own title promises is what makes them worth indexing.
 */
function builderBody(doll: DollEntry): string {
  const keys = fixedKeysForDoll(doll.id)
    .map((key) => {
      const effect = text(key.effect);
      return (
        '<div class="keycard">' +
        `<div class="keycard-head"><h3>${escapeHtml(keyDisplayName(key))}</h3>` +
        (key.level
          ? `<span class="keycard-level">Slot ${key.level}</span>`
          : '') +
        '</div>' +
        keyAttributes(key) +
        (effect ? `<p class="keycard-effect">${effect}</p>` : '') +
        '</div>'
      );
    })
    .join('');

  const imprint = doll.weaponImprint ?? null;
  // By id, never by slugifying the name: the weapon rows are the same dataset,
  // so a real join cannot drift the way a reconstructed slug would.
  const imprintWeapon = imprint ? getWeapon(imprint.id) : undefined;
  const imprintInner = imprint?.name
    ? `<h3>${
        imprintWeapon
          ? `<a href="/weapons/${encodeURIComponent(imprintWeapon.slug)}">${escapeHtml(imprint.name)}</a>`
          : escapeHtml(imprint.name)
      }</h3>` +
      (imprint.trait
        ? `<p class="muted">${escapeHtml(imprint.trait)}</p>`
        : '') +
      (text(imprint.effect) ? `<p>${text(imprint.effect)}</p>` : '')
    : '';

  return (
    '<div class="app dollbuilder-page">' +
    crumbs(
      [
        { href: '/tools', label: 'Tools' },
        { href: '/builder', label: 'Doll Builder' },
      ],
      `${doll.name} Builder`
    ) +
    `<div class="unit-header"><div class="unit-meta"><h1>${escapeHtml(doll.name)} Builder</h1>` +
    `<p class="muted">Plan ${escapeHtml(doll.name)}'s weapon, keys, attachment sets and vertebra segments.</p>` +
    idents([doll.class, doll.phase, doll.weaponImprintType, doll.rarity]) +
    '</div></div>' +
    section('Fixed keys', keys) +
    section('Signature weapon', imprintInner) +
    `<section class="unit-section"><h2>Full profile</h2><div class="unit-tools">` +
    `<a href="/characters/${encodeURIComponent(doll.slug)}">${escapeHtml(doll.name)}'s kit and stats</a>` +
    '</div></section>' +
    TOOLS_LINKS +
    '</div>'
  );
}

/** One doll's card, as a real link. Shared by /characters and its facets. */
function dollCard(d: DollEntry): string {
  const tags = [d.class, d.phase, d.rarity].filter(Boolean).join(' · ');
  return (
    `<a class="dollcard" href="/characters/${encodeURIComponent(d.slug)}">` +
    '<div class="dollcard-body">' +
    `<div class="dollcard-name">${escapeHtml(d.name)}</div>` +
    (tags ? `<div class="dollcard-meta">${escapeHtml(tags)}</div>` : '') +
    '</div></a>'
  );
}

/** One weapon's card. Shared by /weapons and its facets. */
function weaponCard(w: WeaponEntry): string {
  const tags = [w.weaponType, w.rarity].filter(Boolean).join(' · ');
  return (
    `<a class="weaponcard" href="/weapons/${encodeURIComponent(w.slug)}">` +
    '<div class="dollcard-body">' +
    `<div class="dollcard-name">${escapeHtml(w.name)}</div>` +
    (tags ? `<div class="dollcard-meta">${escapeHtml(tags)}</div>` : '') +
    '</div></a>'
  );
}

/**
 * The facet links for a catalogue page — "Browse by class: Sentinel, Support…".
 *
 * This is what keeps the 17 facet pages from being orphans that only the
 * sitemap knows about: a crawler reaching /characters finds every one of them
 * as a real link, and the facet pages link back. Nothing depends on the
 * sitemap alone for discovery.
 */
function facetLinks(groups: string[]): string {
  return groups
    .map((key) => {
      const facets = facetsInGroup(key);
      if (facets.length === 0) {
        return '';
      }
      const label = key === 'type' ? 'weapon type' : key;
      const links = facets
        .map(
          (f) =>
            `<a href="${f.path}">${escapeHtml(f.value)} <span class="facet-count">${f.count}</span></a>`
        )
        .join('');
      return (
        `<div class="facet-row"><span class="facet-row-label">Browse by ${escapeHtml(label)}</span>` +
        `<div class="facet-links">${links}</div></div>`
      );
    })
    .join('');
}

/** `/characters` — every doll as a real link. THIS is the crawl hub. */
function charactersBody(): string {
  const cards = [...allDolls()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(dollCard)
    .join('');
  return (
    '<div class="app characters-page"><header><h1>Characters</h1>' +
    '<p class="muted">Browse every doll. Filter by class, phase, weapon type, and more.</p>' +
    `</header>${facetLinks(['class', 'phase'])}<div class="dollgrid">${cards}</div></div>`
  );
}

/**
 * `/characters/class/<slug>` and friends — the complete membership of one
 * facet. The list IS the content: the guide sites answer these queries with
 * three examples inside a tier list, and this answers with all of them.
 */
function facetBody(facet: Facet): string {
  const members = facetMembers(facet);
  const cards = members
    .map((m) =>
      facet.group.entity === 'doll'
        ? dollCard(m as DollEntry)
        : weaponCard(m as WeaponEntry)
    )
    .join('');
  const parentLabel = facet.group.entity === 'doll' ? 'Characters' : 'Weapons';
  const siblings = facetsInGroup(facet.group.key).filter(
    (f) => f.slug !== facet.slug
  );
  const related = siblings.length
    ? '<section class="unit-section"><h2>Related</h2><div class="unit-tools">' +
      siblings
        .map((f) => `<a href="${f.path}">${escapeHtml(facetHeading(f))}</a>`)
        .join('') +
      `<a href="${facet.group.base}">All ${escapeHtml(parentLabel.toLowerCase())}</a>` +
      '</div></section>'
    : '';

  return (
    '<div class="app characters-page">' +
    crumbs(
      [{ href: facet.group.base, label: parentLabel }],
      facetHeading(facet)
    ) +
    `<header><h1>${escapeHtml(facetHeading(facet))}</h1>` +
    `<p class="muted">${escapeHtml(introFor(facet))}</p>` +
    `<p class="muted">${members.length} ${escapeHtml(facet.group.noun)}.</p>` +
    `</header><div class="dollgrid">${cards}</div>${related}</div>`
  );
}

/** `/weapons` — every weapon as a real link. */
function weaponsBody(): string {
  const cards = [...allWeapons()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(weaponCard)
    .join('');
  return (
    '<div class="app weapons-page"><header><h1>Weapons</h1>' +
    '<p class="muted">Browse every weapon. Filter by rarity, type, and primary attribute.</p>' +
    `</header>${facetLinks(['type'])}<div class="dollgrid">${cards}</div></div>`
  );
}

/**
 * `/characters/<slug>` — the kit text is the unique writing on this page (no
 * other site words a skill description the same way), so it is the part a
 * crawler most needs to see.
 */
function dollBody(doll: DollEntry): string {
  const skills = (doll.skills ?? [])
    .map((s) => {
      const desc = text(s.description);
      const name = s.name ? escapeHtml(s.name) : null;
      if (!name && !desc) {
        return '';
      }
      const label = s.skillType ? escapeHtml(s.skillType) : 'Skill';
      const tags = (s.skillTags ?? []).filter(Boolean).join(' · ');
      return (
        '<div class="unit-skill">' +
        `<h3>${name ?? label}</h3>` +
        `<p class="muted">${label}${tags ? ` · ${escapeHtml(tags)}` : ''}</p>` +
        (desc ? `<p class="unit-skill-desc">${desc}</p>` : '') +
        '</div>'
      );
    })
    .join('');

  const imprint = doll.weaponImprintType ? `${doll.weaponImprintType}` : null;
  const bio = text(doll.bio);

  return (
    '<div class="app dollpage">' +
    crumbs([{ href: '/characters', label: 'Characters' }], doll.name) +
    '<div class="unit-header"><div class="unit-meta">' +
    `<h1>${escapeHtml(doll.name)}</h1>` +
    idents([
      doll.class,
      doll.phase,
      imprint,
      ...(doll.ammoTypes ?? []),
      doll.rarity,
      doll.movement === null ? null : `Move: ${doll.movement}`,
      doll.stabilityGauge === null ? null : `Stability: ${doll.stabilityGauge}`,
      doll.regionTag === 'cn' ? 'CN' : null,
      doll.preview ? 'Unreleased' : null,
    ]) +
    '</div></div>' +
    section('Skills', skills) +
    section('Bio', bio ? `<p>${bio}</p>` : '') +
    `<section class="unit-section"><h2>Build</h2><div class="unit-tools">` +
    `<a href="/builder/${encodeURIComponent(doll.slug)}">${escapeHtml(doll.name)} builder</a>` +
    '</div></section>' +
    TOOLS_LINKS +
    '</div>'
  );
}

/** `/weapons/<slug>` — trait and effect text plus the imprint cross-link. */
function weaponBody(weapon: WeaponEntry): string {
  const trait = text(weapon.trait);
  const effect = text(weapon.effect);
  const imprintDoll = getDollById(weapon.imprintDollId);
  const stat = (attr: string | null, value: number | string | null) =>
    attr && value !== null ? `${attr} ${value}` : null;

  return (
    '<div class="app weaponpage">' +
    crumbs([{ href: '/weapons', label: 'Weapons' }], weapon.name) +
    '<div class="weaponpage-header"><div class="weaponpage-info">' +
    `<h1>${escapeHtml(weapon.name)}</h1>` +
    idents([
      weapon.rarity,
      weapon.weaponType,
      stat(weapon.primaryAttribute, weapon.primaryAttributeStat),
      stat(weapon.secondaryAttribute, weapon.secondaryAttributeStat),
      weapon.regionTag === 'cn' ? 'CN' : null,
      weapon.preview ? 'Unreleased' : null,
    ]) +
    '</div></div>' +
    section('Trait', trait ? `<p>${trait}</p>` : '') +
    section('Effect', effect ? `<p>${effect}</p>` : '') +
    section(
      'Imprint doll',
      imprintDoll
        ? `<a href="/characters/${encodeURIComponent(imprintDoll.slug)}">${escapeHtml(imprintDoll.name)}</a>`
        : ''
    ) +
    TOOLS_LINKS +
    '</div>'
  );
}

/**
 * The no-JS body for a resolved page, or '' when that page has none — the
 * remaining routes are interactive tools (/team-builder, /tools/infographics)
 * and legal/credits pages whose text is short enough that Google's render pass
 * covers them, plus 404s. Nothing there is a ranking target.
 */
export function noJsBodyFor(page: ResolvedPage): string {
  if (page.status !== 200) {
    return '';
  }
  if (page.kind === 'doll' && page.doll) {
    return dollBody(page.doll);
  }
  if (page.kind === 'weapon' && page.weapon) {
    return weaponBody(page.weapon);
  }
  if (page.kind === 'builder' && page.doll) {
    return builderBody(page.doll);
  }
  if (page.kind === 'facet' && page.facet) {
    return facetBody(page.facet);
  }
  if (page.kind === 'route' && page.key === 'characters') {
    return charactersBody();
  }
  if (page.kind === 'route' && page.key === 'weapons') {
    return weaponsBody();
  }
  if (page.kind === 'route' && page.key === 'keys') {
    return keysBody();
  }
  if (page.kind === 'route' && page.key === 'home') {
    return homeBody();
  }
  return '';
}
