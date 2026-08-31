import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { eq, inArray } from 'drizzle-orm';
import type { Command } from '../../types.js';
import { db } from '../../../db/index.js';
import { platoonMembers, platoons, rosterPlayers } from '../../../db/schema.js';
import { sheetsConfigured } from '../../lib/gfl2/googleSheets.js';
import { syncPlatoonSheet } from '../../lib/gfl2/rosterSheet.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('username')
    .setDescription(
      'Tie your Discord account to your in-game name and player ID.'
    )
    .addStringOption((option) =>
      option
        .setName('username')
        .setDescription('Your in-game username')
        .setRequired(true)
        .setMaxLength(50)
    )
    .addStringOption((option) =>
      option
        .setName('player_id')
        .setDescription('Your in-game player ID')
        .setRequired(true)
        .setMaxLength(30)
    ),
  execute: async (interaction) => {
    const username = interaction.options.getString('username', true).trim();
    const playerId = interaction.options.getString('player_id', true).trim();

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    await db
      .insert(rosterPlayers)
      .values({ discordId: interaction.user.id, username, playerId })
      .onConflictDoUpdate({
        target: rosterPlayers.discordId,
        set: { username, playerId, updatedAt: new Date() },
      });

    // Refresh any platoon sheets this player is already on, so the new
    // name/ID shows up without waiting for their next /roster.
    let refreshed = 0;
    if (sheetsConfigured()) {
      const memberships = await db
        .select()
        .from(platoonMembers)
        .where(eq(platoonMembers.discordId, interaction.user.id));
      if (memberships.length > 0) {
        const rows = await db
          .select()
          .from(platoons)
          .where(
            inArray(
              platoons.id,
              memberships.map((m) => m.platoonId)
            )
          );
        for (const platoon of rows) {
          try {
            await syncPlatoonSheet(platoon.id, platoon.sheetId);
            refreshed++;
          } catch (error) {
            console.error(
              `[username] sheet sync failed for platoon ${platoon.name}`,
              error
            );
          }
        }
      }
    }

    await interaction.editReply(
      `✅ Saved: **${username}** (ID \`${playerId}\`).` +
        (refreshed > 0
          ? ` Updated ${refreshed} platoon sheet${refreshed === 1 ? '' : 's'}.`
          : '')
    );
  },
};
