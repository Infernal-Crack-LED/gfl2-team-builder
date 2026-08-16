import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types.js';
import { loadGfl2Data } from '../../lib/gfl2/data.js';
import { searchEffects } from '../../lib/gfl2/search.js';

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
  autocomplete: async (interaction) => {
    const focused = interaction.options.getFocused();
    const { effects } = await loadGfl2Data();
    const results = searchEffects(effects, focused).slice(0, 25);
    await interaction.respond(
      results.map(({ item }) => ({
        name: item.effectName,
        value: item.id,
      }))
    );
  },
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

    const embed = new EmbedBuilder()
      .setColor(0x5b9dff)
      .setTitle(effect.effectName)
      .setFooter({
        text: `Region: ${effect.regionTag?.toUpperCase() ?? 'EN'}`,
      });

    if (effect.effectTags?.length) {
      embed.addFields({
        name: 'Tags',
        value: effect.effectTags.join(', '),
      });
    }

    if (effect.effectDetails) {
      const text =
        effect.effectDetails.length > 800
          ? `${effect.effectDetails.slice(0, 800)}…`
          : effect.effectDetails;
      embed.setDescription(text);
    }

    if (effect.dollId) {
      const owner = dolls.find((d) => d.id === effect.dollId);
      if (owner) {
        embed.addFields({ name: 'Exclusive to', value: owner.name });
      }
    }

    await interaction.reply({ embeds: [embed] });
  },
};
