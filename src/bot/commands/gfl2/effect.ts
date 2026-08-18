import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types.js';
import { loadGfl2Data } from '../../lib/gfl2/data.js';
import { respondEffectAutocomplete } from '../../lib/gfl2/nameCache.js';
import { parseEffectDetails } from '../../../share/html.js';
import { brandEmbed, iconAttachment } from '../../lib/gfl2/embedBrand.js';

/** Discord embed limits: 4096 for a description, 1024 for a field value. */
function clamp(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('effect')
    .setDescription('Look up a GFL2 effect or buff.')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Effect name (e.g. Absolute Defense)')
        .setRequired(true)
        .setAutocomplete(true)
    ),
  autocomplete: respondEffectAutocomplete,
  execute: async (interaction) => {
    const id = interaction.options.getString('name', true);
    const { effects, dolls } = await loadGfl2Data();
    const effect = effects.find((e) => e.id === id);
    if (!effect) {
      await interaction.reply({
        content: "I couldn't find that effect.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const embed = brandEmbed(
      new EmbedBuilder().setTitle(effect.effectName).setFooter({
        text: `Region: ${effect.regionTag?.toUpperCase() ?? 'EN'}`,
      })
    );

    if (effect.effectTags?.length) {
      embed.addFields({
        name: 'Tags',
        value: effect.effectTags.join(', '),
      });
    }

    // effectDetails is a JSON blob for some effects — parse it, or the embed
    // is a wall of `{"mainDetails":…}`.
    const details = parseEffectDetails(effect.effectDetails);
    if (details.main) {
      embed.setDescription(clamp(details.main, 800));
    }
    for (const upgrade of details.upgrades) {
      if (upgrade.details) {
        embed.addFields({
          name: upgrade.name ?? 'Upgrade',
          value: clamp(upgrade.details, 1024),
        });
      }
    }

    if (effect.dollId) {
      const owner = dolls.find((d) => d.id === effect.dollId);
      if (owner) {
        embed.addFields({ name: 'Exclusive to', value: owner.name });
      }
    }

    await interaction.reply({ embeds: [embed], files: [iconAttachment()] });
  },
};
