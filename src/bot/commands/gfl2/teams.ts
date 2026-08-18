import {
  AttachmentBuilder,
  MessageFlags,
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

      await interaction.editReply({
        content: `Team Guide — ReTempest · [TapTap](${momentUrl})`,
        flags: MessageFlags.SuppressEmbeds,
        files: [
          new AttachmentBuilder(row.imageUrl, {
            name: 'retempest-teams.png',
          }).setDescription('Team guide by ReTempest'),
        ],
      });
    } catch {
      await interaction.editReply({
        content: `Failed to fetch team guide data. Try again later or check [ReTempest's TapTap page](${TAPTAP_USER_URL}).`,
      });
    }
  },
};
