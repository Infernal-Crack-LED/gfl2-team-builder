import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types.js';
import { getSiteUrl, loadGfl2Data, type Doll } from '../../lib/gfl2/data.js';
import { searchDolls } from '../../lib/gfl2/search.js';

function formatDollDescription(doll: Doll): string {
  const parts = [
    `**Class:** ${doll.class}`,
    `**Phase:** ${doll.phase}`,
    `**Rarity:** ${doll.rarity}`,
  ];
  if (doll.weaponImprintType) {
    parts.push(`**Weapon:** ${doll.weaponImprintType}`);
  }
  if (doll.ammoTypes?.length) {
    parts.push(`**Ammo:** ${doll.ammoTypes.join(', ')}`);
  }
  if (doll.movement != null) {
    parts.push(`**Movement:** ${doll.movement}`);
  }
  if (doll.stabilityGauge != null) {
    parts.push(`**Stability:** ${doll.stabilityGauge}`);
  }
  if (doll.regionTag) {
    parts.push(`**Region:** ${doll.regionTag.toUpperCase()}`);
  }
  return parts.join('\n');
}

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
  autocomplete: async (interaction) => {
    const focused = interaction.options.getFocused();
    const { dolls } = await loadGfl2Data();
    const results = searchDolls(dolls, focused).slice(0, 25);
    await interaction.respond(
      results.map(({ item }) => ({
        name: item.name,
        value: item.id,
      }))
    );
  },
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

    const embed = new EmbedBuilder()
      .setColor(0x5b9dff)
      .setTitle(doll.name)
      .setURL(`${getSiteUrl()}/characters/${doll.slug}`)
      .setDescription(formatDollDescription(doll))
      .setFooter({ text: `Region: ${doll.regionTag?.toUpperCase() ?? 'EN'}` });

    if (doll.avatarUrl) {
      embed.setThumbnail(doll.avatarUrl);
    }

    if (doll.bio) {
      embed.addFields({
        name: 'Profile',
        value: doll.bio.length > 300 ? `${doll.bio.slice(0, 300)}…` : doll.bio,
      });
    }

    await interaction.reply({ embeds: [embed] });
  },
};
