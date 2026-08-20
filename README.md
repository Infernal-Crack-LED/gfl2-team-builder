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
