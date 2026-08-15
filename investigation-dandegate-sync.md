# Dandegate.net data investigation — GFL2 sync (2026-08-15)

Goal: figure out how to pull dolls / weapons / keys / effects data from
dandegate.net for the GFL2 team-builder, mirroring the nikke-sync approach in
bakery-bot.

## TL;DR

dandegate.net has a **clean, public JSON REST API** — no scraping required.
The website is a fully client-rendered Vite/React SPA; all data comes from
`https://api.dandegate.net/api`. Every entity list is fetchable in one request
(with one pagination caveat for effects), all rows carry `updatedAt`
timestamps (incremental sync possible), and entities are cross-linked by UUID.
The only quirk: **requests without an `Origin: https://dandegate.net` header
get `403 Forbidden`.**

## Site architecture

- Frontend: Vite + React + Mantine SPA. `/dolls` etc. serve an empty `#root`
  shell — zero data in the HTML. No `__NEXT_DATA__`, no RSC payload.
- API: `https://api.dandegate.net/api` (a separate auth host exists at
  `/api/auth` but is not needed for read access).
- Images/assets: `https://cdn.dandegate.net/...` (webp, hotlinking worked from
  curl without special headers).
- Response envelope: `{ "success": true, "data": ... , "pagination"?: {...} }`
  Errors: `{ "success": false, "statusCode": 404, "message": "...", ... }`

### Required headers

Plain curl → `403 Forbidden`. With `Origin: https://dandegate.net` (+ a
browser-ish User-Agent, sent in testing) → `200`. The sync client must send:

```
Origin: https://dandegate.net
User-Agent: <browser-ish UA>
```

## Endpoints

### The four requested

| Endpoint | Rows (2026-08-15) | Notes |
|---|---|---|
| `GET /dolls` | 64 | full list, no pagination needed |
| `GET /weapons` | 185 | full list |
| `GET /keys` | 560 | full list |
| `GET /effects` | 566 (456 en / 110 cn) | **paginated, default limit 24** — must pass `?limit=1000` or walk pages |

### Detail routes (verified)

| Endpoint | Keyed by | Payload |
|---|---|---|
| `GET /dolls/{name}` | **doll name** (URL-encoded), NOT uuid — uuid 404s | ~90 KB: everything below |
| `GET /weapons/{uuid}` | uuid | single weapon row |
| `GET /effects/{slug}` | lowercase-hyphen slug (e.g. `absolute-defense`) | single effect row |

### Pagination

`?page=N&limit=M` supported; response carries
`pagination: {page, limit, total, totalPages, hasNext, hasPrev}`. Dolls /
weapons / keys return everything without params; **effects does not** (default
limit 24). There is a `?region=` param but it behaved inconsistently in
testing — safer to fetch all and filter client-side by `regionTag`.

### Bonus endpoints discovered (same API, for later phases)

`/items`, `/enemies`, `/banners` (+`/banners/upcoming`, `/banners/past`),
`/gunsmoke-rankings/seasons`, `/gunsmoke/seasons`, `/gunsmoke/buffs`,
`/notices`, `/redemption-codes`, `/starwish/seasons`, `/skills-qa/{id}`,
`/enemy-skills/{id}`, `/search/`, plus per-doll
`/dolls/{name}/recommendations` and `/dolls/{name}/breakpoint-recommendations`
(community build data). Also an admin surface (`/admin/...`,
`/effects/upload-csv`, reconciliation endpoints) we should never touch.

## Data dictionary

### Dolls (list)

`id` (uuid) · `name` · `class` (`Bulwark`/`Vanguard`/`Support`/`Sentinel`) ·
`phase` (`Physical`/`Burn`/`Hydro`/`Electric`/`Freeze`/`Corrosion`/`Omni`) ·
`rarity` (`Elite`/`Standard`) · `ammoTypes` (**stringified JSON array**, e.g.
`"[\"Medium Ammo\"]"` — parse twice) · `weaponImprintType` (one of 7 weapon
types) · `weaponImprint` (embedded weapon object) · `avatarUrl` (CDN webp) ·
`dollImages` (array: `Card` / `Skin` (with `skinTitle`) / `Chibi`) ·
`searchTags` (aliases, e.g. `["OTs-14"]` — free name-dictionary!) ·
`gunDataId` (int, gunsmoke link) · `regionTag` (`en`/`cn`) · `preview`
(unreleased flag) · `createdAt` / `updatedAt`.

### Doll detail (`/dolls/{name}`) — the rich payload

Everything in the list plus:

- `skills[]` — 5 per doll (`Basic Attack`, `Passive`, `Skill 1..3`). Each has
  per-level variants `description`/`descriptionLevel2..4`, cooldowns,
  confectance cost, stability damage, phase, ammo types, `skillTags`,
  `keyUpgradesData` (stringified JSON), and a `rangeMap`
  (`{rangeValue: "8", effectiveArea: "Target", imageUrl}` — range geometry for
  the team-builder board!).
- `vertebrae[]` — vertebrae (dupe) upgrades: `segment`, `level`,
  `vertebraeName`, `effect` HTML.
- `remoldingPattern` — `{coreSlots: {bulwark, support, sentinel, vanguard},
  statBoosts: {"60": {hp, atk, def}}, dollCore}`.
- `keys[]` — that doll's keys (full key rows).
- `dollEffects[]` — the doll's exclusive effects (full effect rows).
- `movement` (int), `stabilityGauge` (int).
- `effects` — **misnamed**: it's the doll's bio/lore text (string).
- `summons[]` — summon objects for summoner dolls.

### Weapons

`id` · `name` · `rarity` (`Elite`/`Standard`/`Retired`) · `weaponType` (7
types) · `primaryAttribute` (`Attack`/`HP`) + `primaryAttributeStat` (int) ·
`secondaryAttribute` (e.g. `Crit DMG`) + `secondaryAttributeStat` (string,
e.g. `"25%"`) · `trait` (HTML) · `effect` (HTML, contains per-imp values like
`10%/12%/14%/16%/18%/20%`) · `imprintDollId`/`imprintDoll` +
`imprintDescription` (HTML) · `eliteCounterpart` / `standardCounterpart` /
`retiredCounterpart` (linked weapon rows) · `imageUrl` · `gunWeaponDataId` ·
`regionTag` · `preview` · timestamps.

### Keys

`id` · `keyTitle` · `displayTitle` · `keyType` (`Affinity Key`/`Common
Key`/`Expansion Key`/`Fixed Key`) · `level` (`1`/`20`/`30`/`40`/`60`/`None`) ·
up to 3 attribute pairs `attributeName1..3` + `attributeValue1..3` (e.g.
`Crit DMG` / `3%`) · `effect` (HTML for Expansion keys) · `materialsType`
(`text` | `items`) + `materialsData` (HTML or item list) · `dollId`/`doll`
(embedded doll) · `imageUrl` · `regionTag` · `searchTags` · timestamps.

### Effects

`id` · `effectName` · `effectDetails` (HTML) · `effectTags` (e.g.
`["Buff","Defense"]`) · `dollId`/`doll` (present on 292/566 — exclusive
effects; null = generic) · `buffLinks` · `regionTag` · `preview` · timestamps.

## Quirks the sync script must handle

1. **Origin header** — `Origin: https://dandegate.net` required or 403.
2. **Effects pagination** — default limit 24; fetch with `limit=1000` or walk
   `hasNext`.
3. **Double-encoded JSON** — `ammoTypes`, `keyUpgradesData` are JSON strings
   inside JSON.
4. **HTML-in-JSON** — `trait`/`effect`/`description`/`materialsData` are
   Tiptap HTML (`<p>` + inline `color` spans). Sync should store raw HTML and
   strip-to-text at render time (nikke already does something similar).
5. **`[effect:<uuid>]` inline markers** — skill/weapon text references effects
   by uuid; resolvable against the effects table for cross-linking in the
   team-builder.
6. **Regions mixed in one list** — every entity carries `regionTag`
   (`en`/`cn`); dolls appear in both. Decide canonical region (probably `en`,
   fall back to `cn`) and keep the other as an alias source.
7. **Doll detail is name-keyed**, weapon/effect detail are uuid/slug-keyed.
8. **`preview` flag** — unreleased units; filter or flag like nikke's
   treasure handling.
9. Sitemap counts (625 effect URLs) exceed API totals (566) — sitemap has
   dupes/stale entries; treat the API as source of truth.

## Proposed sync shape (mirroring nikke-sync)

- Single authoritative source (unlike nikke's multi-source reconciliation), so
  the match/override machinery is mostly unnecessary — dandegate UUIDs are the
  canonical IDs.
- One run = 4 list fetches + 64 doll-detail fetches (~70 requests). Small
  delay between detail fetches; no rate limits observed but be polite.
- Store: dolls, weapons, keys, effects tables (+ doll skills / vertebrae /
  remolding as JSON columns or child tables), raw JSON snapshot per row for
  debugging (like nikke's `role_meta`), `updatedAt` from the API for change
  detection.
- Audit: a `gfl2_sync_runs` table in the style of `nikke_sync_runs`
  (startedAt/finishedAt/status/trigger/sources counts + errors).
- HTML → text conversion and `[effect:uuid]` resolution can be deferred to
  read-time; sync just stores what the API gives.

## Decisions (2026-08-15)

1. **Both EN and CN**, keeping `regionTag` on every row — no canonical pick.
2. **Fresh repo** at `~/gfl2-team-builder`.
3. **No recommendations endpoints** — just the four core sources.
4. **Strip HTML at sync time** to plain text (nikke keeps raw because colored
   spans carry semantic in-game values for Discord embeds; GFL2 team-builder
   has no comparable need). Keep `[effect:<uuid>]` markers as-is — they're not
   HTML so they survive stripping. Raw HTML lives only in sync-run logs for
   debugging.
5. **Postgres + Drizzle**; schema includes `gfl2_sync_runs` audit table.
6. **Full refresh MVP** — every row has `updatedAt` so incremental sync can be
   added later.

## Verified artifacts (this investigation)

Raw payloads saved under `/tmp/` (transient): `gfl2_api_dolls.json`,
`gfl2_api_weapons.json`, `gfl2_api_keys.json`, `gfl2_api_effects_all.json`,
`gfl2_api_doll_detail.json` (Alva), `gfl2_api_effect_detail.json`,
`gfl2_index.js` (site JS bundle with the full route inventory).
