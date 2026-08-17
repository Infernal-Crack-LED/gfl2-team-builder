/**
 * No-JS page bodies for the crawl surfaces.
 *
 * A crawler that does not execute JS sees `<div id="root"></div>` and nothing
 * else — the entire site is one empty shell to it. These functions render the
 * content of the four pages that exist to BE indexed (the two catalogues and
 * the two detail pages) as plain server HTML, so the doll names, kits and
 * weapon traits are in the response body.
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
  allDolls,
  allWeapons,
  getDollById,
  resolveMarkerText,
  type DollEntry,
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

/** `/characters` — every doll as a real link. THIS is the crawl hub. */
function charactersBody(): string {
  const cards = [...allDolls()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((d) => {
      const tags = [d.class, d.phase, d.rarity].filter(Boolean).join(' · ');
      return (
        `<a class="dollcard" href="/characters/${encodeURIComponent(d.slug)}">` +
        '<div class="dollcard-body">' +
        `<div class="dollcard-name">${escapeHtml(d.name)}</div>` +
        (tags ? `<div class="dollcard-meta">${escapeHtml(tags)}</div>` : '') +
        '</div></a>'
      );
    })
    .join('');
  return (
    '<div class="app characters-page"><header><h1>Characters</h1>' +
    '<p class="muted">Browse every doll. Filter by class, phase, weapon type, and more.</p>' +
    `</header><div class="dollgrid">${cards}</div></div>`
  );
}

/** `/weapons` — every weapon as a real link. */
function weaponsBody(): string {
  const cards = [...allWeapons()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((w) => {
      const tags = [w.weaponType, w.rarity].filter(Boolean).join(' · ');
      return (
        `<a class="weaponcard" href="/weapons/${encodeURIComponent(w.slug)}">` +
        '<div class="dollcard-body">' +
        `<div class="dollcard-name">${escapeHtml(w.name)}</div>` +
        (tags ? `<div class="dollcard-meta">${escapeHtml(tags)}</div>` : '') +
        '</div></a>'
      );
    })
    .join('');
  return (
    '<div class="app weapons-page"><header><h1>Weapons</h1>' +
    '<p class="muted">Browse every weapon. Filter by rarity, type, and primary attribute.</p>' +
    `</header><div class="dollgrid">${cards}</div></div>`
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
 * The no-JS body for a resolved page, or '' when that page has none (tools,
 * legal pages, 404s — nothing there is a crawl target that JS-off changes).
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
  if (page.kind === 'route' && page.key === 'characters') {
    return charactersBody();
  }
  if (page.kind === 'route' && page.key === 'weapons') {
    return weaponsBody();
  }
  return '';
}
