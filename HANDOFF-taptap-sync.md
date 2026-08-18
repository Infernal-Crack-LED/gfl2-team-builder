# Handoff: TapTap Infographic Sync

This document is for the agent building the daily sync script. It describes the TapTap infographic sync that was just added to the existing pipeline, so you don't duplicate or conflict with it.

## What was done

The bot used to scrape TapTap on every `/tierlist` and `/teams` command. That's been replaced with a DB-backed approach:

1. **New `infographics` table** in `src/db/schema.ts` — stores image URLs keyed by stable slug (`team`, `tierlist-v6`, `tierlist-v0`).
2. **Scraper moved to `src/sync/taptap.ts`** — pure scraping module with no bot dependencies. Exports `fetchTapTapInfographics()` which returns `InfographicRow[]`.
3. **Sync pipeline updated** — `src/sync/run.ts` already calls `fetchTapTapInfographics()` and upserts into the `infographics` table on every `npm run sync` run.
4. **Bot reads from DB** — `src/bot/lib/gfl2/taptapScraper.ts` is now a thin DB reader (`getInfographic(id)`). Bot commands import from it.

## What you DON'T need to do

- **Don't write TapTap scraping code** — it's already in `src/sync/taptap.ts` and integrated into `src/sync/run.ts`.
- **Don't modify `src/bot/`** — the bot side is done. It reads from DB only.
- **Don't add an `infographics` table or migration** — `drizzle/0004_dry_moon_knight.sql` already creates it.

## What the daily sync script needs to do

If your daily sync script wraps `npm run sync`, TapTap infographics are already covered — nothing extra needed.

If your daily sync script is a **separate** entry point (e.g., a standalone cron job that only syncs TapTap), import and call:

```typescript
import { fetchTapTapInfographics } from './src/sync/taptap.js';
import { db } from './src/db/index.js';
import { infographics } from './src/db/schema.js';
import { sql } from 'drizzle-orm';

const rows = await fetchTapTapInfographics();
for (const row of rows) {
  await db
    .insert(infographics)
    .values(row)
    .onConflictDoUpdate({
      target: infographics.id,
      set: {
        imageUrl: sql`excluded.image_url`,
        momentId: sql`excluded.moment_id`,
        title: sql`excluded.title`,
        updatedAt: sql`now()`,
      },
    });
}
```

## File boundaries

| File                                | Owner   | Notes                                              |
| ----------------------------------- | ------- | -------------------------------------------------- |
| `src/sync/taptap.ts`                | ✅ Done | Scraper module. Re-export if needed.               |
| `src/sync/run.ts`                   | ✅ Done | Already calls TapTap scraper in the main pipeline. |
| `src/db/schema.ts`                  | ✅ Done | `infographics` table defined.                      |
| `src/bin/sync.ts`                   | ✅ Done | CLI entry point.                                   |
| `src/bot/lib/gfl2/taptapScraper.ts` | ✅ Done | Bot DB reader — don't touch.                       |
| `src/bot/commands/gfl2/tierlist.ts` | ✅ Done | Reads from DB — don't touch.                       |
| `src/bot/commands/gfl2/teams.ts`    | ✅ Done | Reads from DB — don't touch.                       |
| `src/bot/events/ready.ts`           | ✅ Done | TapTap preload removed — don't touch.              |

## DB migration

The migration `drizzle/0004_dry_moon_knight.sql` creates the table. Run `npm run db:migrate` (or `db:push`) before deploying. On Railway this may need to be run manually or as a pre-deploy step.

## Infographic row IDs

| ID            | Description                   | Source                             |
| ------------- | ----------------------------- | ---------------------------------- |
| `team`        | Team composition guide image  | First image in the team guide post |
| `tierlist-v6` | V6 (max vertebrae) tier list  | Image after "满椎强度榜" heading   |
| `tierlist-v0` | V0 (zero vertebrae) tier list | Image after "0椎强度榜" heading    |

## How the scraper works

1. Fetches seed moment pages from TapTap (ReTempest author)
2. Parses the `__NUXT_DATA__` dehydrated array from the HTML
3. Checks "related posts" for newer posts matching known title patterns
4. If a newer post exists, fetches it instead of the seed
5. Extracts specific images by position (team) or heading proximity (tier lists)
6. Returns `InfographicRow[]` ready for DB upsert

Seed moment IDs are hardcoded in `src/sync/taptap.ts` (`SEED_MOMENTS`). When ReTempest posts genuinely new content (not just an updated version of the same post), these seeds may need updating — but the related-posts discovery handles most cases automatically.
