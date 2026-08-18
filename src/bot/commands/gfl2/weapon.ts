import {
  AttachmentBuilder,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import type { Command } from '../../types.js';
import { getSiteUrl, loadGfl2Data, type Weapon } from '../../lib/gfl2/data.js';
import { respondWeaponAutocomplete } from '../../lib/gfl2/nameCache.js';
import { brandEmbed, iconAttachment } from '../../lib/gfl2/embedBrand.js';

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

    await interaction.deferReply();

    const embed = brandEmbed(new EmbedBuilder(), {
      name: 'View on Refitting Room',
      url: `${getSiteUrl()}/weapons/${weapon.slug}`,
    });

    const imageUrl = `${getSiteUrl()}/api/v1/img/weapon.png?slug=${encodeURIComponent(weapon.slug)}`;
    try {
      await interaction.editReply({
        embeds: [embed],
        files: [
          new AttachmentBuilder(imageUrl, {
            name: `${weapon.slug}-weapon.png`,
          }).setDescription(`${weapon.name} — weapon stats, trait and effect`),
          iconAttachment(),
        ],
      });
    } catch {
      // Image unreachable — fall back to a text embed.
      const fallback = brandEmbed(
        new EmbedBuilder()
          .setTitle(weapon.name)
          .setURL(`${getSiteUrl()}/weapons/${weapon.slug}`)
          .setDescription(formatWeaponDescription(weapon))
          .setFooter({
            text: `Region: ${weapon.regionTag?.toUpperCase() ?? 'EN'}`,
          }),
        {
          name: 'View on Refitting Room',
          url: `${getSiteUrl()}/weapons/${weapon.slug}`,
        }
      );
      if (weapon.imageUrl) {
        fallback.setThumbnail(weapon.imageUrl);
      }
      await interaction.editReply({
        embeds: [fallback],
        files: [iconAttachment()],
      });
    }
  },
};

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
