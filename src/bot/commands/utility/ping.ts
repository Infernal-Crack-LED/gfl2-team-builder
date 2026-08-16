import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription("Check the bot's latency."),
  execute: async (interaction) => {
    const sent = await interaction.reply({
      content: 'Pinging…',
      withResponse: true,
    });
    const roundtrip =
      (sent.resource?.message?.createdTimestamp ?? Date.now()) -
      interaction.createdTimestamp;
    await interaction.editReply(
      `🏓 Pong! Roundtrip: **${roundtrip}ms** · WebSocket: **${interaction.client.ws.ping}ms**`
    );
  },
};
