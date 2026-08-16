# gfl2-team-builder

Discord bot + team-building website for **Girls' Frontline 2: Exilium**.

Data sourced from [dandegate.net](https://dandegate.net) — see
[investigation-dandegate-sync.md](./investigation-dandegate-sync.md) for the
API investigation and design notes.

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

## Scripts

| Command                       | Description                                                   |
| ----------------------------- | ------------------------------------------------------------- |
| `npm run sync`                | Run the dandegate data sync                                   |
| `npm run derive`              | Rebuild `data/effect-matrix.json` from the JSON artifacts     |
| `npm run derive:report`       | Rebuild the matrix and print the QA classification report     |
| `npm run db:push`             | Push schema to Postgres (no migration)                        |
| `npm run db:generate`         | Generate a Drizzle migration                                  |
| `npm run db:migrate`          | Run pending migrations                                        |
| `npm run db:studio`           | Open Drizzle Studio                                           |
| `npm run dev:server`          | Run the Hono auth/profiles server (watch mode, :4173)         |
| `npm run serve`               | Build dist/ and serve it with the API server                  |
| `npm run dev:bot`             | Run the Discord bot (watch mode)                              |
| `npm run bot:deploy-commands` | Register the bot's slash commands with Discord                |
| `npm run build:web`           | Build the server (`dist-server/`) and the Vite web bundle     |
| `npm run build:bot`           | Build the bot into `dist-server/`                             |
| `npm run start:web`           | Start the built web service (Railway `gfl2-team-builder-web`) |
| `npm run start:bot`           | Start the built bot service (Railway `gfl2-team-builder-bot`) |
| `npm run typecheck`           | Type-check without emitting                                   |
| `npm run lint`                | Run ESLint                                                    |
| `npm run format`              | Run Prettier                                                  |
