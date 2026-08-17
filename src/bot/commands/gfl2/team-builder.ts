import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types.js';
import { getSiteUrl } from '../../lib/gfl2/data.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('team-builder')
    .setDescription('Open the GFL2 team builder.'),
  execute: async (interaction) => {
    const embed = new EmbedBuilder()
      .setColor(0x5b9dff)
      .setTitle('Refitting Room')
      .setDescription("Build and share squads for Girls' Frontline 2: Exilium.")
      .setURL(`${getSiteUrl()}/team-builder`);

    await interaction.reply({ embeds: [embed] });
  },
};
