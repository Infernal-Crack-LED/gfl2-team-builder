import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types.js';

/**
 * Curated resources, grouped so the list stays scannable as it grows. Each
 * entry is a markdown link: the community sheets are Google Docs URLs that
 * would otherwise take a whole line each and bury the names they belong to.
 */
const GROUPS: {
  name: string;
  links: { label: string; url: string; note: string }[];
}[] = [
  {
    name: '🔧 Databases & tools',
    links: [
      {
        label: 'dandegate.net',
        url: 'https://dandegate.net',
        note: 'database, dolls, weapons, and more',
      },
    ],
  },
  {
    name: '📊 Community sheets & guides',
    links: [
      {
        label: 'GFL2 Official Release Info Compilation',
        url: 'https://docs.google.com/spreadsheets/d/1DogyU3K7ZXw2qbhP1EhRXIAw5nCyIV5G5e-QWviBZME/edit?usp=sharing',
        note: 'official announcements, banners and patch info in one place',
      },
      {
        label: 'GFL2 Guide Sheet',
        url: 'https://docs.google.com/spreadsheets/d/120bCy6VwSFuCqEC_nQpQ_nDcULFTfw31VZ4NvTeFbqM/edit?usp=sharing',
        note: 'general new-player and progression guidance',
      },
      {
        label: 'COOKED OR COOKING (C.o.C) T-Doll GF2 Analytics',
        url: 'https://docs.google.com/spreadsheets/d/1BWMA6dQWHxfpmk7_gWn3ubeNQlCkqMETXEqIYXQW_D8/edit?usp=sharing',
        note: 'doll analytics and investment takes',
      },
      {
        label: 'GFL2 DORK TIPS',
        url: 'https://docs.google.com/document/d/134CEb77HGtEsa81UQWK9wyTm4KwoKFZxs7-cdM0bTO0/edit?usp=sharing',
        note: 'collected combat and account tips',
      },
    ],
  },
  {
    name: '💬 Communities',
    links: [
      {
        label: 'GFL2 Subreddit',
        url: 'https://reddit.com/r/GirlsFrontline2/',
        note: 'community discussions',
      },
      {
        label: 'Official Discord',
        url: 'https://discord.gg/girlsfrontline2',
        note: 'official GFL2 server',
      },
    ],
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
      .setDescription('Community-maintained resources worth bookmarking.')
      .addFields(
        GROUPS.map((group) => ({
          name: group.name,
          value: group.links
            .map((l) => `[${l.label}](${l.url}) — ${l.note}`)
            .join('\n'),
        }))
      )
      .setFooter({
        text: 'Sheets are community-run — check their own notes for how current they are.',
      });

    await interaction.reply({ embeds: [embed] });
  },
};
