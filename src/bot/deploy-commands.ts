import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { loadCommands } from './lib/loaders.js';

/**
 * Registers slash commands with Discord.
 *
 *  - If DISCORD_GUILD_ID is set, commands are registered to that single guild
 *    and appear instantly (ideal for development).
 *  - Otherwise they are registered globally (can take up to ~1h to propagate).
 *
 * Run with: `npm run bot:deploy-commands`
 */
async function main(): Promise<void> {
  const commands = await loadCommands();
  const body = commands.map((c) => c.data.toJSON());

  const rest = new REST().setToken(config.token);

  if (config.guildId) {
    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body }
    );
    console.log(
      `✅ Registered ${body.length} guild commands to ${config.guildId}`
    );
  } else {
    await rest.put(Routes.applicationCommands(config.clientId), { body });
    console.log(`✅ Registered ${body.length} global commands`);
  }
}

main().catch((error) => {
  console.error('Failed to deploy commands', error);
  process.exit(1);
});
