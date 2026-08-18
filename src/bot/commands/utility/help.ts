import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types.js';
import { brandEmbed, iconAttachment } from '../../lib/gfl2/embedBrand.js';

/**
 * Build the help embed from the LOADED commands rather than a hand-kept list,
 * so it stays in sync automatically as commands are added or removed.
 */
export function buildHelpEmbed(commands: Iterable<Command>): EmbedBuilder {
  const lines = [...commands]
    .map((c) => c.data)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((d) => `**/${d.name}** — ${d.description}`);

  return brandEmbed(
    new EmbedBuilder()
      .setDescription(lines.join('\n') || 'No commands available yet.')
      .setFooter({ text: 'Type / in any channel to use a command.' })
  );
}

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Get a DM listing every command and what it does.'),
  execute: async (interaction) => {
    const embed = buildHelpEmbed(interaction.client.commands.values());

    // DM the list so it doesn't clog the channel. user.send throws (commonly
    // 50007 "Cannot send messages to this user") when DMs are closed/blocked.
    try {
      await interaction.user.send({
        embeds: [embed],
        files: [iconAttachment()],
      });
      await interaction.reply({
        content: '📬 Check your DMs — I sent you the full command list!',
        flags: MessageFlags.Ephemeral,
      });
    } catch {
      await interaction.reply({
        content:
          "I couldn't DM you. Enable **Direct Messages** from server members (Server menu → Privacy Settings) and try `/help` again.",
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
