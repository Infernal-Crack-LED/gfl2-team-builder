import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types.js';
import { getSiteUrl, loadGfl2Data, type Weapon } from '../../lib/gfl2/data.js';
import { respondWeaponAutocomplete } from '../../lib/gfl2/nameCache.js';

function formatWeaponDescription(weapon: Weapon): string {
  const parts = [
    `**Type:** ${weapon.weaponType}`,
    `**Rarity:** ${weapon.rarity}`,
    `**Primary:** ${weapon.primaryAttribute} ${weapon.primaryAttributeStat}`,
  ];
  if (weapon.secondaryAttribute && weapon.secondaryAttributeStat) {
    parts.push(
      `**Secondary:** ${weapon.secondaryAttribute} ${weapon.secondaryAttributeStat}`
    );
  }
  if (weapon.imprintDescription) {
    parts.push(`**Imprint:** ${weapon.imprintDescription}`);
  }
  return parts.join('\n');
}

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('weapon')
    .setDescription('Look up a GFL2 weapon.')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Weapon name (e.g. 6P33)')
        .setRequired(true)
        .setAutocomplete(true)
    ),
  autocomplete: respondWeaponAutocomplete,
  execute: async (interaction) => {
    const id = interaction.options.getString('name', true);
    const { weapons } = await loadGfl2Data();
    const weapon = weapons.find((w) => w.id === id);
    if (!weapon) {
      await interaction.reply({
        content: "I couldn't find that weapon.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5b9dff)
      .setTitle(weapon.name)
      .setURL(`${getSiteUrl()}/weapons/${weapon.slug}`)
      .setDescription(formatWeaponDescription(weapon))
      .setFooter({
        text: `Region: ${weapon.regionTag?.toUpperCase() ?? 'EN'}`,
      });

    if (weapon.imageUrl) {
      embed.setThumbnail(weapon.imageUrl);
    }

    if (weapon.effect) {
      const text =
        weapon.effect.length > 400
          ? `${weapon.effect.slice(0, 400)}…`
          : weapon.effect;
      embed.addFields({ name: 'Effect', value: text });
    }

    await interaction.reply({ embeds: [embed] });
  },
};
