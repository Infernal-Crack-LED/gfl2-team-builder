import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types.js';

const RESOURCES = [
  {
    name: 'dandegate.net',
    value: 'https://dandegate.net — database, dolls, weapons, and more',
  },
  {
    name: 'GFL2 Subreddit',
    value: 'https://reddit.com/r/GirlsFrontline2/ — community discussions',
  },
  {
    name: 'Official Discord',
    value: 'https://discord.gg/girlsfrontline2 — official GFL2 server',
  },
];

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('guides')
    .setDescription('Curated GFL2 resources and guides.'),
  execute: async (interaction) => {
    const embed = new EmbedBuilder()
      .setColor(0x5b9dff)
      .setTitle('GFL2 Resources')
      .setDescription('A starter list of community resources.')
      .addFields(RESOURCES);

    await interaction.reply({ embeds: [embed] });
  },
};
