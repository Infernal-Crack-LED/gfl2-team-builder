import 'dotenv/config';
import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import { config } from './config.js';
import { loadCommands, loadEvents } from './lib/loaders.js';

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

  await client.login(config.token);
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
