import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types.js';
import { getSiteUrl } from '../../lib/gfl2/data.js';
import { brandEmbed, iconAttachment } from '../../lib/gfl2/embedBrand.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('team-builder')
    .setDescription('Open the GFL2 team builder.'),
  execute: async (interaction) => {
    const embed = brandEmbed(
      new EmbedBuilder().setDescription(
        "Build and share squads for Girls' Frontline 2: Exilium."
      ),
      { name: 'View on Refitting Room', url: `${getSiteUrl()}/team-builder` }
    );

    await interaction.reply({ embeds: [embed], files: [iconAttachment()] });
  },
};
