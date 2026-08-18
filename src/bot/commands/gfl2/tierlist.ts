import {
  AttachmentBuilder,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import type { Command } from '../../types.js';
import { getInfographicUrls } from '../../lib/gfl2/taptapScraper.js';

const TAPTAP_USER_URL = 'https://www.taptap.cn/user/674589071';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('tierlist')
    .setDescription("Share ReTempest's latest GFL2 tier list from TapTap.")
    .addStringOption((o) =>
      o
        .setName('tier')
        .setDescription('Which tier list to show (default: V6)')
        .setRequired(false)
        .addChoices(
          { name: 'V6 (max vertebrae)', value: 'v6' },
          { name: 'V0 (zero vertebrae)', value: 'v0' }
        )
    ),
  execute: async (interaction) => {
    const tier = (interaction.options.getString('tier') as 'v6' | 'v0') ?? 'v6';

    await interaction.deferReply();

    try {
      const urls = await getInfographicUrls();
      const imageUrl = tier === 'v6' ? urls.v6TierList : urls.v0TierList;
      const momentId = urls.tierListMomentId;

      if (!imageUrl) {
        await interaction.editReply({
          content: `Couldn't find the latest ${tier.toUpperCase()} tier list. Check [ReTempest's TapTap page](${TAPTAP_USER_URL}) directly.`,
        });
        return;
      }

      const momentUrl = momentId
        ? `https://www.taptap.cn/moment/${momentId}`
        : TAPTAP_USER_URL;

      const label = tier === 'v6' ? 'V6 Tier List' : 'V0 Tier List';

      const embed = new EmbedBuilder()
        .setColor(0x5b9dff)
        .setTitle(`${label} — ReTempest`)
        .setDescription(`Latest ${tier.toUpperCase()} tier list by ReTempest`)
        .setURL(momentUrl)
        .setImage(imageUrl);

      try {
        await interaction.editReply({
          embeds: [embed],
          files: [
            new AttachmentBuilder(imageUrl, {
              name: `retempest-${tier}-tierlist.png`,
            }).setDescription(`${label} by ReTempest`),
          ],
        });
      } catch {
        await interaction.editReply({ embeds: [embed] });
      }
    } catch {
      await interaction.editReply({
        content: `Failed to fetch tier list data. Try again later or check [ReTempest's TapTap page](${TAPTAP_USER_URL}).`,
      });
    }
  },
};
