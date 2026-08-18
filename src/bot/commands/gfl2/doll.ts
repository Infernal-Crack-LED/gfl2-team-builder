import {
  AttachmentBuilder,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import type { Command } from '../../types.js';
import { getSiteUrl, loadGfl2Data } from '../../lib/gfl2/data.js';
import { respondDollAutocomplete } from '../../lib/gfl2/nameCache.js';
import { getRecCardImageUrl } from '../../lib/gfl2/imageCache.js';
import { brandEmbed, iconAttachment } from '../../lib/gfl2/embedBrand.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('doll')
    .setDescription('Look up a GFL2 doll.')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Doll name (e.g. Alva, Groza)')
        .setRequired(true)
        .setAutocomplete(true)
    ),
  autocomplete: respondDollAutocomplete,
  execute: async (interaction) => {
    const id = interaction.options.getString('name', true);
    const { dolls } = await loadGfl2Data();
    const doll = dolls.find((d) => d.id === id);
    if (!doll) {
      await interaction.reply({
        content: "I couldn't find that doll.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply();

    // Try the pre-warmed recommendation card first. The image is already
    // rendered on the server (pre-warmed at startup), so discord.js fetching
    // the URL for the attachment upload is a fast cache hit.
    const recImageUrl = await getRecCardImageUrl(doll.slug);
    if (recImageUrl) {
      try {
        const embed = brandEmbed(new EmbedBuilder(), {
          name: 'View on Refitting Room',
          url: `${getSiteUrl()}/characters/${doll.slug}`,
        });
        await interaction.editReply({
          embeds: [embed],
          files: [
            new AttachmentBuilder(recImageUrl, {
              name: `${doll.slug}-recommendation.png`,
            }).setDescription(
              `${doll.name} — recommended investment, weapons, keys, and stats`
            ),
            iconAttachment(),
          ],
        });
        return;
      } catch {
        // Image unreachable — fall through to the text embed.
      }
    }

    // Fallback: branded embed with link only (no rec card available).
    const embed = brandEmbed(new EmbedBuilder(), {
      name: 'View on Refitting Room',
      url: `${getSiteUrl()}/characters/${doll.slug}`,
    });

    if (doll.avatarUrl) {
      embed.setThumbnail(doll.avatarUrl);
    }

    await interaction.editReply({ embeds: [embed], files: [iconAttachment()] });
  },
};
