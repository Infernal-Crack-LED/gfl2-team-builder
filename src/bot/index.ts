import 'dotenv/config';
import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import cron from 'node-cron';
import { desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { gfl2SyncRuns } from '../db/schema.js';
import { config } from './config.js';
import { loadCommands, loadEvents } from './lib/loaders.js';
import { runSync } from '../sync/run.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.GuildMember, Partials.User],
});

client.commands = new Collection();

const hasDatabase = (): boolean =>
  !!process.env.DATABASE_URL || !!process.env.PROD_DATABASE_URL;

async function main(): Promise<void> {
  const commands = await loadCommands();
  for (const command of commands) {
    client.commands.set(command.data.name, command);
  }
  console.log(`[startup] loaded ${commands.length} commands`);

  const events = await loadEvents();
  for (const event of events) {
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }
  }
  console.log(`[startup] registered ${events.length} events`);

  scheduleGfl2Sync();

  await client.login(config.token);

  // Post-deploy data load: refresh in the background only if the DB is stale.
  // Non-blocking so a source outage never delays or breaks startup.
  void runStartupSyncIfStale();
}

/**
 * Refresh GFL2 data once a day. Skipped when there's no database configured.
 * Run it on demand with `npm run sync` or `npm run sync -- --force`.
 */
function scheduleGfl2Sync(): void {
  if (!hasDatabase()) {
    console.warn('[gfl2] no database configured — skipping scheduled sync');
    return;
  }
  cron.schedule('0 4 * * *', () => {
    console.log('[gfl2] starting scheduled sync');
    runSync({ trigger: 'cron' })
      .then((summary) => console.log('[gfl2] sync finished', summary))
      .catch((error) => console.error('[gfl2] sync failed', error));
  });
  console.log('[gfl2] scheduled daily sync at 04:00');
}

/**
 * After the bot starts, refresh GFL2 data in the background — but only if it
 * hasn't synced in the last few hours. This bootstraps a fresh database on
 * first deploy and picks up new data on later deploys, without re-syncing on
 * every crash-restart. Fail-soft: a source outage is logged and ignored.
 */
async function runStartupSyncIfStale(): Promise<void> {
  if (!hasDatabase()) {
    return;
  }
  try {
    const last = await db.query.gfl2SyncRuns.findFirst({
      orderBy: desc(gfl2SyncRuns.startedAt),
    });
    const fourHoursMs = 4 * 60 * 60 * 1000;
    if (
      last?.finishedAt &&
      Date.now() - last.finishedAt.getTime() < fourHoursMs
    ) {
      console.log('[gfl2] recent sync found — skipping startup sync');
      return;
    }
    console.log('[gfl2] running startup sync');
    const summary = await runSync({ trigger: 'startup' });
    console.log('[gfl2] startup sync finished', summary);
  } catch (error) {
    console.error('[gfl2] startup sync failed', error);
  }
}

main().catch((error) => {
  console.error('[fatal] failed to start bot', error);
  process.exit(1);
});

// Graceful shutdown so Railway restarts/deploys don't leave a zombie session.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`[shutdown] received ${signal}, destroying client`);
    void client.destroy();
    process.exit(0);
  });
}
