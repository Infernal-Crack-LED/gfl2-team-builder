import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Show information about a user.')
    .addUserOption((option) =>
      option
        .setName('target')
        .setDescription('The user to inspect (defaults to you)')
    ),
  execute: async (interaction) => {
    const user = interaction.options.getUser('target') ?? interaction.user;
    const member = interaction.guild?.members.cache.get(user.id);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(user.username)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: 'User ID', value: user.id, inline: true },
        {
          name: 'Account created',
          value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`,
          inline: true,
        }
      );

    if (member?.joinedTimestamp) {
      embed.addFields({
        name: 'Joined server',
        value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`,
        inline: true,
      });
      const roles = member.roles.cache
        .filter((role) => role.id !== interaction.guild!.id)
        .map((role) => role.toString());
      if (roles.length > 0) {
        embed.addFields({
          name: `Roles (${roles.length})`,
          value: roles.join(' '),
        });
      }
    }

    await interaction.reply({ embeds: [embed] });
  },
};
