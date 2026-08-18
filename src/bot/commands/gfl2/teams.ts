import {
  AttachmentBuilder,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import type { Command } from '../../types.js';
import { getInfographic } from '../../lib/gfl2/taptapScraper.js';

const TAPTAP_USER_URL = 'https://www.taptap.cn/user/674589071';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('teams')
    .setDescription(
      "Share ReTempest's latest team composition guide from TapTap."
    ),
  execute: async (interaction) => {
    await interaction.deferReply();

    try {
      const row = await getInfographic('team');

      if (!row) {
        await interaction.editReply({
          content: `Couldn't find the latest team guide. Check [ReTempest's TapTap page](${TAPTAP_USER_URL}) directly.`,
        });
        return;
      }

      const momentUrl = row.momentId
        ? `https://www.taptap.cn/moment/${row.momentId}`
        : TAPTAP_USER_URL;

      const embed = new EmbedBuilder()
        .setColor(0x5b9dff)
        .setTitle('Team Guide — ReTempest')
        .setDescription('Latest team composition guide by ReTempest')
        .setURL(momentUrl)
        .setImage(row.imageUrl);

      try {
        await interaction.editReply({
          embeds: [embed],
          files: [
            new AttachmentBuilder(row.imageUrl, {
              name: 'retempest-teams.png',
            }).setDescription('Team guide by ReTempest'),
          ],
        });
      } catch {
        await interaction.editReply({ embeds: [embed] });
      }
    } catch {
      await interaction.editReply({
        content: `Failed to fetch team guide data. Try again later or check [ReTempest's TapTap page](${TAPTAP_USER_URL}).`,
      });
    }
  },
};
