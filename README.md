# gfl2-team-builder

Discord bot + team-building website for **Girls' Frontline 2: Exilium**.

Game data and art are extracted directly from the game client by the
companion datamine pipeline (see `../CUTOVER.md` in the parent workspace).
The former Dandegate sync (`npm run sync`) is retired; content updates flow
through `npm run seed:datamine`.

## Setup

```bash
npm install
cp .env.example .env   # set DATABASE_URL; OAuth vars for the auth server
npm run db:push         # push schema to Postgres
```

### Auth / profiles server

The site has one runtime API (Discord login + per-user saved builds), a Hono
server in `src/server/`. It needs these env vars (see `.env.example`):
`OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `SESSION_SECRET`, and optionally
`OAUTH_REDIRECT_URI`, `ALLOWED_ORIGINS`, `PORT`. Create a Discord app at
<https://discord.com/developers/applications> and add
`<origin>/auth/discord/callback` as a redirect URI.

```bash
npm run dev          # vite dev server (proxies /auth + /api to :4173)
npm run dev:server   # Hono API/static server on :4173
npm run serve        # build dist/ then serve it with the API (prod shape)
```

## Sync

Pull the latest data from dandegate:

```bash
npm run sync
```

The sync fetches dolls (list + per-doll detail), weapons, keys, and effects,
strips HTML to plain text, and upserts into Postgres. Every run is recorded in
`gfl2_sync_runs`.

After the JSON export, sync derives `data/effect-matrix.json` — a cross-reference
of every `[effect:<uuid>]` marker in skills, weapons, keys, and effect text,
classified by relation (applies / gains / removes / conditional / enhances /
mentions). This powers the team builder's "who applies / who is affected" view.
Rebuild it standalone with `npm run derive` (add `--report` for a QA breakdown).

## Icons

The site serves every image it renders — no hotlinking. Run this after a sync
that adds dolls or keys:

```bash
npm run icons
```

Two stages, both committed to the repo:

1. **UI icons** (class, phase, ammo, Imago factor) are fetched from
   [iopwiki](https://iopwiki.com/wiki) into `web/public/gfl2-icons/`. The
   catalog in `src/sync/wikiIcons.ts` names every file explicitly — iopwiki
   covers GFL1 as well, so nothing is discovered by search or prefix. Content
   there is CC BY-SA 3.0, credited on `/credits`.
2. **Game art** (skill, summon and key icons; portraits and weapon art) is
   mirrored off the Dandegate CDN into `web/public/game-assets/`, downscaled to
   the cap its category declares in `src/share/assets.ts`. That same module's
   `localAssetUrl` is what rewrites a CDN URL to its local copy, so the mapping
   the mirror writes and the one the app reads can't drift.

Existing files are skipped; pass `--force` to re-download everything.

Note that `data/*.json` keeps the original CDN URLs — the Discord bot and the
server-side card renderer need absolute ones. Only the web layer rewrites, at
render time.

## Scripts

| Command                       | Description                                                     |
| ----------------------------- | --------------------------------------------------------------- |
| `npm run sync`                | Run the dandegate data sync                                     |
| `npm run icons`               | Fetch wiki UI icons and mirror CDN game art (`--force` to redo) |
| `npm run derive`              | Rebuild `data/effect-matrix.json` from the JSON artifacts       |
| `npm run derive:report`       | Rebuild the matrix and print the QA classification report       |
| `npm run db:push`             | Push schema to Postgres (no migration)                          |
| `npm run db:generate`         | Generate a Drizzle migration                                    |
| `npm run db:migrate`          | Run pending migrations                                          |
| `npm run db:studio`           | Open Drizzle Studio                                             |
| `npm run dev:server`          | Run the Hono auth/profiles server (watch mode, :4173)           |
| `npm run serve`               | Build dist/ and serve it with the API server                    |
| `npm run dev:bot`             | Run the Discord bot (watch mode)                                |
| `npm run bot:deploy-commands` | Register the bot's slash commands with Discord                  |
| `npm run build:web`           | Build the server (`dist-server/`) and the Vite web bundle       |
| `npm run build:bot`           | Build the bot into `dist-server/`                               |
| `npm run start:web`           | Start the built web service (Railway `gfl2-team-builder-web`)   |
| `npm run start:bot`           | Start the built bot service (Railway `gfl2-team-builder-bot`)   |
| `npm run typecheck`           | Type-check without emitting                                     |
| `npm run lint`                | Run ESLint                                                      |
| `npm run format`              | Run Prettier                                                    |

## Content ownership and reuse

The site's public statement lives at [`/usage`](https://refittingroom.app/usage)
(`web/src/UsagePage.tsx`) — that page is the canonical wording; this section is
the short version for anyone reading the repo.

- **Game data, text and art** (doll and weapon names, portraits, weapon art,
  skill/key icons, skill text, stat values) are the property of **Sunborn
  Network Technology**. They are shown for identification, commentary and
  reference in a free, non-commercial fan tool, under **fair use** — not under a
  licence, and not sublicensable by this project.
- **IOP Wiki material** (`web/public/gfl2-icons/`, catalogued in
  `src/sync/wikiIcons.ts`) is CC BY-SA 3.0. Anyone may reuse it on those terms;
  attribution to IOP Wiki and the licence link are mandatory, credited on
  `/credits` and `/usage`.
- **The community compilation spreadsheet** (default recommendation builds, plus
  values the client doesn't state) is used **with its maintainers' permission,
  granted to this project**. That permission does not travel with the data — ask
  them, not us.
- **Original work built here** — site copy, the infographics card layouts
  (`src/infographics/`), the derived datasets (`data/effect-matrix.json`, effect
  tagging/grouping, slugs, orderings) and the share-code format — may be reused
  for non-commercial fan purposes with visible credit to the Refitting Room and
  the same fair-use / non-affiliation statements carried along.
- **The compilation itself is unrestricted.** Copy `data/*.json` and
  `web/public/game-assets/` and use them in any fan project — no permission
  request, no attribution condition. Serve your own copy rather than requesting
  assets from refittingroom.app, whose paths are rewritten on every content sync.
  Excluded: `data/recommendations-source.json` (spreadsheet) and
  `web/public/gfl2-icons/` (IOP Wiki, CC BY-SA 3.0).

Rights holders who want something removed or credited differently: open an issue
and it happens.

## License

The source code is licensed under the
[PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0)
— free to read, fork, modify, and self-host for any noncommercial purpose;
commercial use is not permitted. If you use this code, the license requires you
to carry this notice with it:

> Required Notice: Copyright Maxwell Sutton — Refitting Room (https://refittingroom.app)

The license covers this project's own code only. Mirrored game art
(`web/public/game-assets/`), IOP Wiki icons (`web/public/gfl2-icons/`, CC BY-SA
3.0) and the compiled game data (`data/`) belong to their respective owners and
are excluded — see [LICENSE](./LICENSE) for the full scope and attributions, and
[`/usage`](https://refittingroom.app/usage) for the site-facing version.

Use of the hosted bot and site is governed separately by [TERMS.md](./TERMS.md)
and [PRIVACY.md](./PRIVACY.md).
