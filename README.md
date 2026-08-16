# gfl2-team-builder

Discord bot + team-building website for **Girls' Frontline 2: Exilium**.

Data sourced from [dandegate.net](https://dandegate.net) — see
[investigation-dandegate-sync.md](./investigation-dandegate-sync.md) for the
API investigation and design notes.

## Setup

```bash
npm install
cp .env.example .env   # set DATABASE_URL
npm run db:push         # push schema to Postgres
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

| Command | Description |
|---|---|
| `npm run sync` | Run the dandegate data sync |
| `npm run derive` | Rebuild `data/effect-matrix.json` from the JSON artifacts |
| `npm run derive:report` | Rebuild the matrix and print the QA classification report |
| `npm run db:push` | Push schema to Postgres (no migration) |
| `npm run db:generate` | Generate a Drizzle migration |
| `npm run db:migrate` | Run pending migrations |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run typecheck` | Type-check without emitting |
| `npm run lint` | Run ESLint |
| `npm run format` | Run Prettier |
