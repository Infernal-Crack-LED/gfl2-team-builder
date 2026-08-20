import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  breadcrumbFor,
  injectBreadcrumbLd,
  injectPageMeta,
  redirectTargetFor,
  resolvePage,
} from './pageMeta';
import { noJsBodyFor } from './noJsBody';
import { escapeHtml, injectRootBody } from './htmlHead';
import { ROUTE_META, SITE, dollPageMeta } from '../share/pageMeta';
import {
  MIN_FACET_MEMBERS,
  facetHeading,
  facetSlug,
  introFor,
} from '../share/facets';
import { HOME_FEATURES, HOME_HERO } from '../share/homeContent';
import {
  RECOMMENDATION_CREDIT,
  hydrateRecommendation,
  type RecommendationSource,
} from '../share/recommendations';
import { recommendationFor } from './recommendations';
import { dev } from '../share/siteIdentity';
import { stripHtml } from '../share/html';
import {
  allDolls,
  allFacets,
  allKeys,
  allWeapons,
  facetMembers,
  facetsInGroup,
  fixedKeysForDoll,
  getDoll,
  getDollById,
  keyDisplayName,
  resolveMarkerText,
} from './gameData';
// The CLIENT resolver, imported deliberately: the same-source rule is a claim
// about these two producing the same words, and only comparing them proves it.
import { resolveEffectMarkers as clientResolve } from '../../web/src/data';

const INDEX_HTML = readFileSync(
  path.resolve('web', 'index.html'),
  'utf8'
).replace('<script type="module" src="/src/main.tsx"></script>', '');

const url = (p: string) => new URL(p, 'https://refittingroom.app');
const render = (p: string) => {
  const page = resolvePage(url(p));
  let html = injectPageMeta(INDEX_HTML, page);
  html = injectBreadcrumbLd(html, page);
  html = injectRootBody(html, noJsBodyFor(page));
  return { page, html };
};

describe('resolvePage', () => {
  it('maps the root to the home route', () => {
    const page = resolvePage(url('/'));
    expect(page).toMatchObject({
      kind: 'route',
      key: 'home',
      canonicalPath: '/',
      status: 200,
    });
  });

  it('maps every flat route key to itself', () => {
    for (const key of Object.keys(ROUTE_META)) {
      if (key === 'home' || key === 'infographics') {
        continue;
      }
      expect(resolvePage(url(`/${key}`))).toMatchObject({ key, status: 200 });
    }
  });

  it('resolves /tools/infographics but 404s other /tools children', () => {
    expect(resolvePage(url('/tools/infographics'))).toMatchObject({
      key: 'infographics',
      status: 200,
    });
    expect(resolvePage(url('/tools/nope')).status).toBe(404);
  });

  it('resolves a doll, a weapon and a builder URL to their entity', () => {
    const doll = allDolls()[0];
    const weapon = allWeapons()[0];
    expect(resolvePage(url(`/characters/${doll.slug}`))).toMatchObject({
      kind: 'doll',
      key: doll.slug,
      status: 200,
    });
    expect(resolvePage(url(`/weapons/${weapon.slug}`))).toMatchObject({
      kind: 'weapon',
      key: weapon.slug,
      status: 200,
    });
    expect(resolvePage(url(`/builder/${doll.slug}`))).toMatchObject({
      kind: 'builder',
      key: doll.slug,
      status: 200,
    });
  });

  it('404s unknown routes, unknown slugs and over-deep paths', () => {
    for (const p of [
      '/nope',
      '/characters/not-a-doll',
      '/weapons/not-a-weapon',
      '/builder/not-a-doll',
      '/characters/alva/extra',
    ]) {
      expect(resolvePage(url(p)).status, p).toBe(404);
    }
  });

  it('canonicalizes a 404 to the root so it nominates nothing', () => {
    expect(resolvePage(url('/nope')).canonicalPath).toBe('/');
  });

  it('never throws on a malformed percent-escape', () => {
    expect(resolvePage(url('/characters/%E0%A4%A')).status).toBe(404);
  });

  it('resolves a share URL by its path, ignoring the query', () => {
    const page = resolvePage(url('/team-builder?b=abc123'));
    expect(page).toMatchObject({ key: 'team-builder', status: 200 });
    expect(page.canonicalPath).toBe('/team-builder');
  });
});

describe('redirectTargetFor', () => {
  it('301s the legacy alias and index.html', () => {
    expect(redirectTargetFor('/teambuilder')).toBe('/team-builder');
    expect(redirectTargetFor('/index.html')).toBe('/');
  });

  it('301s non-canonical spellings', () => {
    expect(redirectTargetFor('/characters/')).toBe('/characters');
    expect(redirectTargetFor('/Characters')).toBe('/characters');
    expect(redirectTargetFor('//characters//alva/')).toBe('/characters/alva');
  });

  it('leaves canonical paths alone', () => {
    expect(redirectTargetFor('/')).toBeNull();
    expect(redirectTargetFor('/characters/alva')).toBeNull();
  });

  it('never rewrites the case of a static asset path', () => {
    // Vite emits mixed-case hashed names and the file system is what it is —
    // a lowercasing 301 here would turn every bundle into a 404.
    expect(redirectTargetFor('/assets/DollPage-A1b2C3d4.js')).toBeNull();
    expect(redirectTargetFor('/game-assets/dolls/AbC123.webp')).toBeNull();
    // …but the alias table still applies to extension-ful paths.
    expect(redirectTargetFor('/index.html')).toBe('/');
  });

  it('is idempotent — a redirect target never redirects again', () => {
    for (const p of ['/teambuilder', '/Characters/', '//tools//infographics']) {
      const once = redirectTargetFor(p);
      expect(once).not.toBeNull();
      expect(redirectTargetFor(once as string)).toBeNull();
    }
  });
});

describe('injectPageMeta', () => {
  it('rewrites title, description, canonical and the OG/Twitter pair', () => {
    const { html } = render('/characters');
    const m = ROUTE_META.characters;
    expect(html).toContain(`<title>${escapeHtml(m.title)}</title>`);
    expect(html).toContain(
      `<link rel="canonical" href="https://refittingroom.app/characters" />`
    );
    expect(html).toContain(
      '<meta property="og:url" content="https://refittingroom.app/characters" />'
    );
    expect(html).toContain(escapeHtml(m.description));
  });

  it('gives a doll page its own title, canonical and portrait image', () => {
    const doll = allDolls().find((d) => d.avatarUrl !== null);
    expect(doll).toBeDefined();
    const { html } = render(`/characters/${doll!.slug}`);
    expect(html).toContain(
      `<title>${escapeHtml(
        dollPageMeta(doll!, {
          hasRecommendation: recommendationFor(doll!) !== null,
        }).title
      )}</title>`
    );
    expect(html).toContain(
      `<link rel="canonical" href="https://refittingroom.app/characters/${doll!.slug}" />`
    );
    // Portrait tiles are not 1200×630 — the baked dimensions must be gone and
    // the card downgraded from summary_large_image.
    expect(html).toContain('/game-assets/dolls/');
    expect(html).not.toContain('og:image:width');
    expect(html).toContain('<meta name="twitter:card" content="summary" />');
  });

  it('keeps the generic 1200×630 card on pages with no entity image', () => {
    const { html } = render('/team-builder');
    expect(html).toContain(
      '<meta property="og:image" content="https://refittingroom.app/og.png" />'
    );
    expect(html).toContain('og:image:width');
    expect(html).toContain(
      '<meta name="twitter:card" content="summary_large_image" />'
    );
  });

  it('noindexes the 404 shell and the signed-in saved page', () => {
    expect(render('/nope').html).toContain(
      '<meta name="robots" content="noindex, follow" />'
    );
    expect(render('/saved').html).toContain('name="robots"');
    expect(render('/characters').html).not.toContain('name="robots"');
  });

  it('leaves exactly one of each tag it rewrites', () => {
    const { html } = render('/weapons');
    for (const tag of [
      '<title>',
      'rel="canonical"',
      'property="og:title"',
      'property="og:url"',
      'name="description"',
      'name="twitter:title"',
    ]) {
      expect(html.split(tag).length - 1, tag).toBe(1);
    }
  });
});

describe('breadcrumbs', () => {
  it('nests a doll under Characters and a builder under Tools', () => {
    const doll = allDolls()[0];
    expect(
      breadcrumbFor(resolvePage(url(`/characters/${doll.slug}`)))?.map(
        (c) => c.name
      )
    ).toEqual(['Home', 'Characters', doll.name]);
    expect(
      breadcrumbFor(resolvePage(url(`/builder/${doll.slug}`)))?.map(
        (c) => c.name
      )
    ).toEqual(['Home', 'Tools', 'Doll Builder', `${doll.name} Builder`]);
  });

  it('collapses a trail whose ancestor IS the leaf', () => {
    const crumbs = breadcrumbFor(resolvePage(url('/tools')));
    expect(crumbs?.map((c) => c.name)).toEqual(['Home', 'Tools']);
    const items = crumbs?.map((c) => c.item) ?? [];
    expect(new Set(items).size).toBe(items.length);
  });

  it('emits no crumbs for the root or a 404, and never doubles up', () => {
    expect(breadcrumbFor(resolvePage(url('/')))).toBeNull();
    expect(breadcrumbFor(resolvePage(url('/nope')))).toBeNull();
    const once = injectBreadcrumbLd(
      INDEX_HTML,
      resolvePage(url('/characters'))
    );
    const twice = injectBreadcrumbLd(once, resolvePage(url('/characters')));
    expect(twice).toBe(once);
    expect(once).toContain('"@type":"BreadcrumbList"');
  });
});

describe('no-JS bodies', () => {
  it('links every doll from /characters and every weapon from /weapons', () => {
    const chars = noJsBodyFor(resolvePage(url('/characters')));
    for (const d of allDolls()) {
      expect(chars).toContain(`href="/characters/${d.slug}"`);
    }
    const weapons = noJsBodyFor(resolvePage(url('/weapons')));
    for (const w of allWeapons()) {
      expect(weapons).toContain(`href="/weapons/${w.slug}"`);
    }
  });

  it('renders a doll kit as plain text, markers resolved', () => {
    const doll = getDoll('alva');
    expect(doll).toBeDefined();
    const body = noJsBodyFor(resolvePage(url('/characters/alva')));
    expect(body).toContain('<h1>Alva</h1>');
    expect(body).toContain('Freeze');
    for (const skill of doll!.skills ?? []) {
      if (skill.name) {
        expect(body).toContain(skill.name);
      }
    }
    expect(body).not.toContain('[effect:');
    expect(body).not.toContain('<p><span style=');
  });

  it('leaves NO raw marker of any kind in any doll or weapon body', () => {
    // The data carries five marker kinds and 47 `|doll:<slug>` variants; a
    // resolver that knows only bare `[effect:<uuid>]` emits the rest verbatim
    // into text no visitor ever sees. Sweep every page rather than sampling —
    // that sampling is exactly what let this ship once.
    const raw = /\[(?:effect|summon|dollSkill|skillsummon|key):/i;
    for (const d of allDolls()) {
      const body = noJsBodyFor(resolvePage(url(`/characters/${d.slug}`)));
      expect(raw.test(body), `${d.slug} leaked a raw marker`).toBe(false);
    }
    for (const w of allWeapons()) {
      const body = noJsBodyFor(resolvePage(url(`/weapons/${w.slug}`)));
      expect(raw.test(body), `${w.slug} leaked a raw marker`).toBe(false);
    }
  });

  it('resolves markers to the SAME names the client renders', () => {
    // Same-source rule: server text must equal the client's resolved segments
    // joined — not merely "no raw markers left", which a resolver that dropped
    // or misnamed every marker would also satisfy. Sweep EVERY doll skill (all
    // four level variants) and EVERY weapon trait/effect/imprint line that
    // carries a marker, so both the exotic kinds and the `|doll:` variants are
    // covered wherever they live, not just where a sample happened to look.
    const parity = (raw: string | null | undefined, label: string) => {
      const stripped = stripHtml(raw);
      if (stripped === null || !/\[[a-zA-Z]+:/.test(stripped)) {
        return 0;
      }
      const client = clientResolve(stripped)
        .map((s) => (typeof s === 'string' ? s : s.name))
        .join('');
      expect(resolveMarkerText(stripped), label).toBe(client);
      expect(resolveMarkerText(stripped), label).not.toMatch(/\[[a-zA-Z]+:/);
      return 1;
    };

    let compared = 0;
    for (const doll of allDolls()) {
      for (const skill of doll.skills ?? []) {
        const s = skill as unknown as Record<string, unknown>;
        for (const field of [
          'description',
          'descriptionLevel2',
          'descriptionLevel3',
          'descriptionLevel4',
        ]) {
          compared += parity(
            s[field] as string | null,
            `${doll.slug}/${skill.name}/${field}`
          );
        }
      }
      compared += parity(doll.bio, `${doll.slug}/bio`);
    }
    for (const w of allWeapons()) {
      compared += parity(w.trait, `${w.slug}/trait`);
      compared += parity(w.effect, `${w.slug}/effect`);
    }
    // Guard against the loop silently comparing nothing.
    expect(compared).toBeGreaterThan(200);
  });

  it('renders a weapon trait and its imprint cross-link', () => {
    const weapon = allWeapons().find(
      (w) => w.trait !== null && w.imprintDollId !== null
    );
    expect(weapon).toBeDefined();
    const body = noJsBodyFor(resolvePage(url(`/weapons/${weapon!.slug}`)));
    expect(body).toContain('<h2>Trait</h2>');
    expect(body).toContain('href="/characters/');
  });

  it('lands inside #root so React can replace it', () => {
    const { html } = render('/characters');
    expect(html).toContain('<div id="root"><div class="app characters-page">');
    expect(html).not.toContain('<div id="root"></div>');
  });

  it('has no body for pages that are not crawl surfaces', () => {
    for (const p of ['/tools', '/saved', '/nope', '/team-builder']) {
      expect(noJsBodyFor(resolvePage(url(p))), p).toBe('');
    }
  });

  it('renders the landing page hero and every feature link', () => {
    const body = noJsBodyFor(resolvePage(url('/')));
    expect(body).toContain('<h1>Refitting Room</h1>');
    expect(body).toContain(escapeHtml(HOME_HERO));
    // The root is the top of the internal link graph: a crawler that only ever
    // fetches "/" has to be able to reach both catalogues from it.
    for (const f of HOME_FEATURES) {
      expect(body, f.route).toContain(`href="${f.href}"`);
    }
    expect(body).toContain('href="/characters"');
  });

  it('puts the nikkesim.app cross-link in the crawlable body', () => {
    // nikkesim.app server-renders its link back to this site, so this half has
    // to be server-rendered too or the pair is only ever one-directional to a
    // crawler. Both are plain follow links — no rel="nofollow".
    const body = noJsBodyFor(resolvePage(url('/')));
    expect(body).toContain(`href="${dev.nikkesim.url}"`);
    expect(body).toContain(escapeHtml(dev.nikkesim.blurb));
    expect(body).toContain(`href="${dev.helen.addToServer}"`);
    expect(body).not.toContain('nofollow');
  });

  it('renders every key on /keys, with fixed keys linking to their doll', () => {
    const body = noJsBodyFor(resolvePage(url('/keys')));
    expect(body).toContain('<h1>Keys</h1>');
    for (const type of ['Fixed Key', 'Expansion Key', 'Common Key']) {
      expect(body, type).toContain(`<h2>${type}s</h2>`);
    }
    // Every row is present — this body is the only indexable copy of the key
    // database, so a dropped row is a row that exists nowhere a crawler looks.
    for (const key of allKeys()) {
      expect(body, key.id).toContain(escapeHtml(keyDisplayName(key)));
    }
    const owned = allKeys().find(
      (k) => k.keyType === 'Fixed Key' && k.dollId !== null
    );
    expect(owned).toBeDefined();
    const doll = getDollById(owned!.dollId);
    expect(body).toContain(`href="/characters/${doll!.slug}"`);
  });

  it('serves a facet page with its full membership and no orphans', () => {
    const facet = facetsInGroup('class').find((f) => f.slug === 'sentinel');
    expect(facet).toBeDefined();
    const body = noJsBodyFor(resolvePage(url(facet!.path)));

    expect(body).toContain(`<h1>${escapeHtml(facetHeading(facet!))}</h1>`);
    expect(body).toContain(escapeHtml(introFor(facet!)));
    // The complete membership is the page's whole value proposition — a
    // dropped member is a doll this category silently claims not to have.
    for (const m of facetMembers(facet!)) {
      expect(body, m.name).toContain(`href="/characters/${m.slug}"`);
    }
    // ...and it links to its siblings, so no facet is reachable only from the
    // sitemap.
    for (const sib of facetsInGroup('class').filter((f) => f !== facet)) {
      expect(body, sib.path).toContain(`href="${sib.path}"`);
    }
  });

  it('links every facet from its parent catalogue', () => {
    const characters = noJsBodyFor(resolvePage(url('/characters')));
    for (const f of [...facetsInGroup('class'), ...facetsInGroup('phase')]) {
      expect(characters, f.path).toContain(`href="${f.path}"`);
    }
    const weapons = noJsBodyFor(resolvePage(url('/weapons')));
    for (const f of facetsInGroup('type')) {
      expect(weapons, f.path).toContain(`href="${f.path}"`);
    }
  });

  it('builds every facet from the data, with no stale or thin categories', () => {
    for (const f of allFacets()) {
      // Declared count matches the rows, so a value that changes upstream
      // cannot leave a page behind claiming a membership it no longer has.
      expect(facetMembers(f).length, f.path).toBe(f.count);
      expect(f.count, f.path).toBeGreaterThanOrEqual(MIN_FACET_MEMBERS);
      expect(facetSlug(f.value), f.path).toBe(f.slug);
      expect(f.path.replace(/^\//, '').split('/'), f.path).toHaveLength(3);
    }
    // Resonance is one doll today: she must NOT get a category page, because
    // it would duplicate her own.
    expect(allDolls().some((d) => d.phase === 'Resonance')).toBe(true);
    expect(facetsInGroup('phase').map((f) => f.slug)).not.toContain(
      'resonance'
    );
  });

  it('gives every facet a distinct, written intro', () => {
    const intros = allFacets().map((f) => introFor(f));
    for (const [i, f] of allFacets().entries()) {
      const intro = intros[i]!;
      // Long enough to be a sentence, and specific enough to name itself —
      // the generic fallback wording would fail the second check for most.
      expect(intro.length, `${f.path} intro too short`).toBeGreaterThan(60);
      expect(intro, f.path).toContain(f.value);
      expect(facetHeading(f), f.path).toContain(f.value);
    }
    expect(new Set(intros).size, 'duplicate intros').toBe(intros.length);
  });

  it('404s a facet value that has no page', () => {
    // Resonance is under MIN_FACET_MEMBERS, so it is a hard 404 rather than an
    // empty-but-200 category page.
    for (const p of [
      '/characters/phase/resonance',
      '/characters/class/nonsense',
      '/weapons/type/nonsense',
      '/characters/class',
    ]) {
      expect(resolvePage(url(p)).status, p).toBe(404);
    }
  });

  it('canonicalizes and titles each facet distinctly', () => {
    const titles = new Set<string>();
    for (const f of allFacets()) {
      const page = resolvePage(url(f.path));
      expect(page.status, f.path).toBe(200);
      expect(SITE + page.canonicalPath, f.path).toBe(SITE + f.path);
      titles.add(page.meta.title);
    }
    // Duplicate titles across 17 pages would be the classic faceted-nav SEO
    // failure — every category claiming to be the same page.
    expect(titles.size).toBe(allFacets().length);
  });

  it('gives a builder page its own content, not the doll page again', () => {
    const doll = allDolls().find((d) => fixedKeysForDoll(d.id).length > 0);
    expect(doll).toBeDefined();
    const builder = noJsBodyFor(resolvePage(url(`/builder/${doll!.slug}`)));
    const profile = noJsBodyFor(resolvePage(url(`/characters/${doll!.slug}`)));

    expect(builder).toContain(`<h1>${escapeHtml(doll!.name)} Builder</h1>`);
    expect(builder).toContain('<h2>Fixed keys</h2>');
    // The two pages must not be near-duplicates: the profile words her kit,
    // the builder words her keys. Thin duplicate URLs were the reason the
    // builder pages had no body worth serving in the first place.
    expect(builder).not.toBe(profile);
    expect(profile).not.toContain('<h2>Fixed keys</h2>');
    for (const key of fixedKeysForDoll(doll!.id)) {
      expect(builder, key.id).toContain(escapeHtml(keyDisplayName(key)));
    }
    // ...and it links back to the profile rather than restating it.
    expect(builder).toContain(`href="/characters/${doll!.slug}"`);
  });
});

describe('community recommendations', () => {
  it('routes every prose block in the live data, losing none', () => {
    // The panel shows verdict / caveats / notes; a block that matched no
    // bucket would silently vanish, taking the maintainers' writing with it.
    const source = JSON.parse(
      readFileSync(path.resolve('data', 'recommendations-source.json'), 'utf8')
    ) as Record<string, RecommendationSource>;
    const noLookups = { weaponByName: () => null, keyByLabel: () => null };

    let blocks = 0;
    let routed = 0;
    for (const [slug, row] of Object.entries(source)) {
      blocks += (row.explanation ?? []).length;
      const rec = hydrateRecommendation(slug, row, noLookups);
      if (rec) {
        routed +=
          (rec.verdict ? 1 : 0) +
          (rec.noPath ? 1 : 0) +
          rec.caveats.length +
          rec.notes.length;
      }
    }
    expect(blocks).toBeGreaterThan(30);
    expect(routed).toBe(blocks);
  });

  it('puts the recommendation in the crawlable doll body', () => {
    // The reason this work exists: "<doll> build" is the query these pages
    // answer, and until the panel was server-rendered the whole answer was
    // JS-only — visible to a visitor, invisible to Bing and to AI crawlers.
    const doll = allDolls().find((d) => recommendationFor(d) !== null);
    expect(doll).toBeDefined();
    const rec = recommendationFor(doll!)!;
    const body = noJsBodyFor(resolvePage(url(`/characters/${doll!.slug}`)));

    expect(body).toContain('Recommended build');
    // The credit is not optional and not deferred to a footer.
    expect(body).toContain(escapeHtml(RECOMMENDATION_CREDIT.lead));
    expect(body).toContain(RECOMMENDATION_CREDIT.sheetUrl);
    for (const w of rec.weapons) {
      expect(body, w.label).toContain(escapeHtml(w.label));
    }
    for (const k of rec.keys.primary) {
      expect(body, k.label).toContain(escapeHtml(k.label));
    }
  });

  it('never leaks a raw marker into the recommendation body', () => {
    // Effect text is resolved through the same marker table the React panel
    // uses; an unresolved `[effect:<uuid>]` in the indexed copy would be text
    // the visitor never sees.
    for (const doll of allDolls()) {
      if (!recommendationFor(doll)) {
        continue;
      }
      const body = noJsBodyFor(resolvePage(url(`/characters/${doll.slug}`)));
      expect(body, doll.slug).not.toMatch(/\[(effect|key|dollSkill|summon):/);
    }
  });

  it('renders the same steps the panel would — explanation wins', () => {
    // A marker with no explanation is not a step description, so it must not
    // appear as one in the indexed copy either.
    const doll = allDolls().find((d) => {
      const r = recommendationFor(d);
      return r && r.markerSteps.length > 0 && r.explainedSteps.length > 0;
    });
    expect(
      doll,
      'no doll has both explained and marker-only steps'
    ).toBeDefined();
    const rec = recommendationFor(doll!)!;
    const body = noJsBodyFor(resolvePage(url(`/characters/${doll!.slug}`)));
    for (const s of rec.explainedSteps) {
      expect(body, s.step).toContain(escapeHtml(s.note ?? ''));
    }
    expect(body).toContain('listed without an explanation');
  });

  it('covers the dolls the sheet has rows for, and no others', () => {
    const source = JSON.parse(
      readFileSync(path.resolve('data', 'recommendations-source.json'), 'utf8')
    ) as Record<string, unknown>;
    const slugs = new Set(allDolls().map((d) => d.slug));
    for (const slug of Object.keys(source)) {
      expect(slugs.has(slug), `${slug} is not a doll`).toBe(true);
    }
  });
});

describe('doll page meta', () => {
  it('advertises the build only on pages that carry one', () => {
    // "<doll> build" is the highest-intent query these pages can win, but
    // promising it where the sheet has no recommendation is a mismatch that
    // costs more in bounce than the keyword gains.
    const withRec = allDolls().find((d) => recommendationFor(d) !== null);
    const withoutRec = allDolls().find((d) => recommendationFor(d) === null);
    expect(withRec).toBeDefined();
    expect(withoutRec, 'every doll has a recommendation now').toBeDefined();

    const a = resolvePage(url(`/characters/${withRec!.slug}`)).meta;
    expect(a.title).toContain('Build');
    expect(a.description).toContain('Recommended build');

    const b = resolvePage(url(`/characters/${withoutRec!.slug}`)).meta;
    expect(b.title).not.toContain('Build');
  });

  it('keeps every doll title distinct and within a sane length', () => {
    const titles = new Set<string>();
    for (const doll of allDolls()) {
      const { title } = resolvePage(url(`/characters/${doll.slug}`)).meta;
      titles.add(title);
      // Google truncates around 60; this keeps the doll name and "Build"
      // — the parts that matter — inside the visible window.
      expect(title.length, `${doll.slug}: "${title}"`).toBeLessThanOrEqual(60);
    }
    expect(titles.size).toBe(allDolls().length);
  });
});
