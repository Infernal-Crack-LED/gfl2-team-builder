# Website scaffolding plan — gfl2-team-builder

> Status: PLAN (2026-08-15). Upstream playbook:
> `~/nikke-sim/docs/frontend-conventions.md` (read fully before implementing).
> Site conventions for THIS repo: [frontend-conventions.md](frontend-conventions.md).

## 1. Scope (as requested)

- `/characters` — browsable doll grid, modeled on nikke-sim `/characters`
- `/characters/<slug>` — per-doll page, modeled on nikke-sim `/unit/<slug>`
- `/weapons` — browsable weapon grid (same pattern as `/characters`)
- `/weapons/<slug>` — per-weapon page (same pattern as per-doll)
- `/team-builder` — squad-building page with the filter system
- Same color scheme, styles, and site logo as nikke-sim
- **Deferred:** image assets (filter icons, portraits) — placement planned, files
  not sourced yet; infographics/share-cards — not started

## 2. What carries over from nikke-sim (unchanged in spirit)

| Pattern          | nikke-sim                                                                                                | gfl2                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Stack            | React 18 + Vite 5 + TS strict                                                                            | same                                                                                            |
| Styling          | one `styles.css`, design tokens                                                                          | same tokens, verbatim (§6)                                                                      |
| Routing          | custom path router, `pushState`, real `<a href>` interception                                            | same, new route set (§4)                                                                        |
| Code splitting   | every page `lazy()`                                                                                      | same                                                                                            |
| Data             | JSON imported at build time; no runtime fetch for game data                                              | same — DB → committed `data/*.json` at sync time (§3)                                           |
| Filter system    | `useCharacterFilter` + `CharacterFilters` + `CharacterCards`, shared by `/characters` and `/teambuilder` | `useDollFilter` + `DollFilters` + `DollCards`, shared by `/characters` and `/team-builder` (§5) |
| Per-entity pages | everything derived from artifacts; **degrades, never vanishes**                                          | same (§7)                                                                                       |
| Chrome           | `SiteChrome.tsx` nav + footer, mobile dropdown at ≤640px                                                 | same, same logo (§8)                                                                            |

## 3. Data flow — DB to build-time JSON

nikke-sim's rule (§8.1): _never fetch sim or game data at runtime_. GFL2 keeps
the rule with one extra hop: the game data lives in Postgres (dandegate sync),
so **the sync step also exports committed JSON artifacts** that the web app
imports at build time — exactly how nikke-sim's `src/data/sync.ts` writes
`data/characters.json`.

```
dandegate API → npm run sync → Postgres (source of truth)
                             → data/dolls.json      (committed)
                             → data/weapons.json    (committed)
                             → data/keys.json       (committed)
                             → data/effects.json    (committed)
web build imports data/*.json → client-side app, zero data fetches
```

### Export shapes (new step in `src/sync/run.ts` after the upserts)

- `data/dolls.json` — `{ syncedAt, dolls: Doll[] }`. One entry per doll row
  (both `en` and `cn` rows, `regionTag` kept). Includes skills (plain text,
  per-level variants), remolding pattern, vertebrae, movement/stability,
  searchTags, avatarUrl, weapon imprint id. Doll list is already enriched from
  the detail fetch, so no extra API calls.
- `data/weapons.json` — `{ syncedAt, weapons: Weapon[] }` incl. trait/effect
  text (stripped), stat pairs, imprint doll id, counterpart ids.
- `data/keys.json` — `{ syncedAt, keys: Key[] }` incl. attribute arrays,
  materials, dollId.
- `data/effects.json` — `{ syncedAt, effects: Effect[] }` — the id→name
  dictionary the pages need to resolve `[effect:<uuid>]` markers in skill and
  weapon text into names/links.
- IDs stay dandegate UUIDs everywhere; slugs are derived at export time (§4.3).

A fresh checkout must work without a DB: the JSONs are committed, so the site
builds from them alone (same as nikke-sim's committed artifacts).

## 4. Routes

### 4.1 Route model (`web/src/router.ts`)

```ts
type Route =
  | 'home' // '/' — landing, content TBD (for now: hero + links)
  | 'characters' // '/characters'
  | 'character' // '/characters/<slug>'   (parameterized — excluded from ROUTES)
  | 'weapons' // '/weapons'
  | 'weapon' // '/weapons/<slug>'      (parameterized — excluded from ROUTES)
  | 'team-builder' // '/team-builder'
  | 'credits'; // '/credits'
```

Same mechanics as nikke-sim's router: `routeFromPath` maps the first segment,
detail routes are detected by a present second segment and excluded from the
flat `ROUTES` list (no dead `hrefFor` targets); `navigate()` = pushState +
synthetic popstate; `useRouteAndSlug()` single subscription; scroll-to-top
only on route change; `onSpaLinkClick` for real-anchor interception.

### 4.2 Nav

`Characters · Weapons · Team Builder` (+ hamburger for Credits etc.). Mobile
(≤640px) collapses to the TabDropdown pattern.

### 4.3 Slugs

- Dolls: `slugify(name)` — lowercase, spaces→hyphens (dandegate's own link
  builder does exactly this). Currently 64 unique names; if a future sync
  introduces a collision, disambiguate `<slug>-<regionTag>` at export time.
- Weapons: names can repeat across `en`/`cn` region rows and across
  elite/standard counterparts — the exporter guarantees uniqueness
  (`<slug>` if free, else `<slug>-<regionTag>`), and the JSON carries
  `slug → id` so pages resolve detail by slug.

## 5. Filter system (`web/src/components/DollGrid.tsx`)

One module, three exports — the exact split nikke-sim's `CharacterGrid.tsx`
uses, so `/characters` and `/team-builder` share one filter vocabulary and can
never drift:

- `useDollFilter({ exclude, restrict })` — owns all filter/search state + the
  derived doll list. OR-within-a-row, AND-across-rows (nikke-sim semantics).
- `DollFilters` — collapsible `<details>` panel + search box + "showing N of M"
  count + Clear all. `defaultOpen` prop: open on `/team-builder` (filtering IS
  the task), closed on `/characters` (the grid is the content).
- `DollCards` — the grid. Two modes, same as nikke-sim: **navigation mode**
  (`linkFor` → whole card is a real `<a href="/characters/<slug>">`,
  crawlable) and **badge mode** (team builder: click = place in slot, corner
  link to the profile).

### Filter axes (from dandegate's own filter vocabulary)

| Row         | Values                                                         | Source field                                                             |
| ----------- | -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Class       | Bulwark · Vanguard · Support · Sentinel                        | `class`                                                                  |
| Phase       | Physical · Burn · Hydro · Electric · Freeze · Corrosion · Omni | `phase`                                                                  |
| Ammo        | Light · Medium · Heavy · Shotgun · Melee                       | `ammoTypes` (array — a doll passes if ANY of its ammo types is selected) |
| Weapon type | AR · SMG · SG · MG · RF · HG · Blade                           | `weaponImprintType`                                                      |
| Rarity      | Elite · Standard                                               | `rarity` (text pills — no icons needed)                                  |
| Search      | name + `searchTags` aliases (e.g. "OTs-14" → Groza)            | free text                                                                |

### Icons vs pills — asset-ready from day one

No filter icons exist yet. Each filter option is defined as
`{ id, label, icon?: string }`; the row renders an **icon button when the
icon file exists, otherwise a text pill** with identical toggle semantics.
Dropping assets into `web/public/gfl2-icons/` later is then a zero-code
change (§9). This is the one structural divergence from nikke-sim's current
icon-only rows, and it resolves itself once assets land.

### Weapons grid filters

Smaller axis set: rarity (Elite/Standard/Retired), weapon type, primary
attribute (Attack/HP), imprint doll search. Same module shape
(`useWeaponFilter` etc.) — can live in `WeaponGrid.tsx`.

## 6. Styling

Copy nikke-sim's tokens verbatim into `web/src/styles.css` — user decision:
same palette as nikke-sim:

```css
:root {
  color-scheme: dark;
  --bg: #101216;
  --panel: #181b22;
  --panel2: #1f232d;
  --border: #2a2f3b;
  --text: #e7eaf0;
  --muted: #8b93a3;
  --accent: #5b9dff;
  --warn: #e0b04b;
}
```

Carry over with the tokens: focus-visible + reduced-motion baselines, the
spacing/radius/shadow tables, the three button voices, the responsive
breakpoints (900/760/720/640), utility classes. Fonts: system stack for now —
the Roboto subset pipeline exists in nikke-sim for canvas parity (§9 of that
doc); GFL2 has no infographics yet, so **no font files until infographics
start**. Add `PHASE_COLORS` (GFL2's analog of `ELEMENT_COLORS`) as a TS
const when first needed by card tinting — proposed starting values, to be
eyeballed against game UI:

```ts
export const PHASE_COLORS: Record<string, string> = {
  Physical: '#b0b7c3',
  Burn: '#d92d38',
  Hydro: '#0075f8',
  Electric: '#bc1eb1',
  Freeze: '#00c8e0',
  Corrosion: '#00e554',
  Omni: '#e0b04b',
};
```

## 7. Page designs

### 7.1 `/characters` (model: nikke-sim CharactersPage)

`<div className="app characters-page">` + header + `DollFilters`
(defaultOpen=false) + `DollCards` in navigation mode. JSON-LD
`CollectionPage`. This page is the crawl hub: every card a real link.
Optional later: "New dolls" release row (nikke-sim's `useReleaseRow`
pattern) — not day one.

### 7.2 `/characters/<slug>` (model: nikke-sim UnitPage)

Everything derived from `data/dolls.json` (+ keys/effects/weapons for the
cross-links). Sections, in order:

1. **Breadcrumb** — Characters › Name
2. **Header** — portrait (`avatarUrl`, lazy thumb pipeline when it exists),
   h1 name, ident icon/label row: Phase · Class · Weapon type · Ammo ·
   Rarity · Movement · Stability gauge. Region badge when `regionTag=cn`.
   `preview` flag → "Unreleased" badge.
3. **Skills** — the 5 kit slots (Basic Attack, Passive, Skill 1–3): name,
   skillTags, description text, stability damage, cooldown, range
   (rangeValue + effectiveArea). Per-level variants (Level2–4 fields) behind
   a tab or disclosure per skill — same `unit-tabs` pattern.
4. **Keys** — that doll's keys from `keys.json` (match `dollId`): key type,
   attribute bonuses, materials. One card per key.
5. **Exclusive effects** — from `effects.json` where `dollId` matches.
6. **Weapon imprint** — the imprint weapon's stats + link to its page.
7. **Remolding pattern** — core-slot table (bulwark/support/sentinel/vanguard)
   - stat boosts.
8. **Vertebrae** — segment/level upgrade list.
9. **Bio** — the lore text (doll detail `effects` field — misnamed upstream).
10. **Tools** — links to /team-builder, /characters, /weapons.

Every section **degrades, never vanishes**: missing data → one muted line.
`[effect:<uuid>]` markers in any text resolve to effect names via
`effects.json` (rendered as `<span title>` today, links tomorrow). Head sync
(title/description/canonical/OG) per-page via the UnitPage `setMeta` pattern.
JSON-LD `WebPage` with `about`.

### 7.3 `/weapons` + `/weapons/<slug>`

Grid: weapon cards (image, name, rarity, type, primary/secondary stats),
navigation mode. Detail page sections: breadcrumb, header (image + name +
ident row: rarity · weapon type · primary attr + stat · secondary attr +
stat), **Trait**, **Effect** (per-imprint values stay in the text as-is),
**Imprint doll** (portrait link to `/characters/<slug>`), **Counterparts**
(elite/standard/retired links), Tools links.

### 7.4 `/team-builder` (model: nikke-sim TeamBuilderPage)

- **Squad strip** — switchable **4 or 5 slots** (owner-confirmed 2026-08-15:
  GFL2 squads are either size). A pill toggle (`4 | 5`) beside the strip sets
  the slot count; shrinking 5→4 slices the extra slot, dropping a filled
  fifth doll back into the grid (nikke-sim's `collapseToTeam` shape).
  Click-to-toggle from the grid, remove-per-slot, Clear. Drag support is
  phase-2 — click-first works without it.
- Placed dolls are `exclude`d from the grid below (nikke-sim behavior).
- `DollFilters` (defaultOpen=true) above the strip, `DollCards` in badge
  mode below.
- No save/share yet (that needs a backend); the strip is session state only.
  The page still earns its place as a filter-driven squad staging area.

## 8. Chrome + logo

- Copy `~/nikke-sim/web/public/nikkesim-icon.png` → `web/public/site-icon.png`
  (user decision: same logo). Wire as favicon + nav brand mark.
- `SiteChrome.tsx`: SiteNav (nav links + hamburger) + SiteFooter ("made by
  Max · Credits · GFL2 Team Builder"). No Discord login on day one — no
  user-data backend yet (nikke-sim §8.2 pattern stays available for later;
  bakery-bot's profiles API was designed for cross-project reuse).
- `index.html` baseline from day one: title/description/canonical/OG set
  (generic `og.png` placeholder until one is drawn), twitter card,
  `theme-color: #5b9dff`, `WebApplication` JSON-LD.

## 9. Image placement plan (assets deferred)

```
web/public/
  site-icon.png                 # copied from nikke-sim now
  og.png                        # placeholder → replaced when designed
  gfl2-icons/                   # filter + card mini icons (NOT sourced yet)
    class_{bulwark,vanguard,support,sentinel}.{png,webp}
    phase_{physical,burn,hydro,electric,freeze,corrosion,omni}.svg  # colored badges
    ammo_{light,medium,heavy,shotgun,melee}.png
    weapon_{ar,smg,sg,mg,rf,hg,blade}.png
    rarity_{elite,standard}.png
  img/portraits/                # build-time thumb tiers (phase 2)
```

Until assets exist: filter rows render text pills (§5); card portraits use
the CDN `avatarUrl`/`imageUrl` directly with `loading="lazy"` and the
`?` placeholder block when missing (nikke-sim's
`.teambuilder-portrait-empty`). The stepped-halving downscale pipeline
(nikke-sim §10) is NOT ported until real art lands — it exists to fix
aliasing on large reductions, and placeholder URLs have nothing to alias.

## 10. Phases

**Phase 1 — scaffold (this effort)**

1. `package.json` + `vite.config.ts` + `web/tsconfig.json` (root `web/`,
   outDir repo-root `dist/`, react manualChunk)
2. Sync export step → `data/*.json` (committed); type module for the shapes
3. `styles.css` (tokens + baselines + grid/filter/card/page styles)
4. `router.ts`, `main.tsx`, `SiteChrome.tsx`, `useDocumentHead.ts`,
   `jsonLd.ts`, `index.html`
5. `DollGrid.tsx` filter system (pill fallback for icons)
6. Pages: Characters, Doll detail, Weapons, Weapon detail, Team Builder,
   minimal Home, Credits stub
7. `npm run typecheck` covers both tsconfigs; smoke: `vite build` + load
   every route

**Phase 2 — assets + SEO surface**

- Filter/card icon set; portrait thumb tiers + manifest (nikke-sim §10)
- Hono static server: per-route meta injection, no-JS bodies for
  `/characters` + detail pages (same-source rule), 404/cache policy,
  robots.txt + generated sitemap + llms.txt (nikke-sim §6–7)

**Phase 3 — deferred by owner**

- Infographics/share cards (unknown approach — owner decision pending)
- Squad save/share (needs the user-data backend decision)
- Discord bot integration

## 11. Open questions

1. Doll grid: show both region rows when a doll exists in en + cn, or one
   card per doll (region badge)? Export currently keeps both rows; the grid
   likely wants dedupe-by-name with a region badge. Decide at implementation.
2. Domain/canonical host — needed before the SEO phase; unknown today.
3. Do we want the dandegate `recommendations` data later? Excluded from sync
   by owner decision; re-ask if the team builder wants community builds.

Resolved: squad size — 4 or 5, user-selectable on `/team-builder`
(2026-08-15).
