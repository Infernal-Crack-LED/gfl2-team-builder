import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { and, eq } from 'drizzle-orm';
import type { Command } from '../../types.js';
import { db } from '../../../db/index.js';
import { platoons } from '../../../db/schema.js';
import {
  createRosterSpreadsheet,
  sheetsConfigured,
  spreadsheetUrl,
} from '../../lib/gfl2/googleSheets.js';
import { syncPlatoonSheet } from '../../lib/gfl2/rosterSheet.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('sheet')
    .setDescription(
      'Link the Google Sheet for a platoon roster — creates one if none exists.'
    )
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Platoon name (a server can have several platoons)')
        .setRequired(true)
        .setMaxLength(80)
    ),
  execute: async (interaction) => {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: 'Platoon sheets live in a server — run this in one.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!sheetsConfigured()) {
      await interaction.reply({
        content:
          'Google Sheets is not configured on this bot (missing service account).',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const name = interaction.options.getString('name', true).trim();
    if (!name) {
      await interaction.reply({
        content: 'The platoon needs a name.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const existing = await db.query.platoons.findFirst({
      where: and(
        eq(platoons.guildId, interaction.guildId),
        eq(platoons.name, name)
      ),
    });
    if (existing) {
      await interaction.reply(
        `📋 Roster sheet for **${name}**: ${spreadsheetUrl(existing.sheetId)}`
      );
      return;
    }

    await interaction.deferReply();
    const sheetId = await createRosterSpreadsheet(
      `GFL2 Platoon Roster — ${name}`
    );
    const [row] = await db
      .insert(platoons)
      .values({
        guildId: interaction.guildId,
        name,
        sheetId,
        createdBy: interaction.user.id,
      })
      .onConflictDoNothing()
      .returning();

    // A concurrent /sheet with the same name may have won the insert; use
    // whichever row is in the DB so both callers get the same link.
    const platoon =
      row ??
      (await db.query.platoons.findFirst({
        where: and(
          eq(platoons.guildId, interaction.guildId),
          eq(platoons.name, name)
        ),
      }));
    if (!platoon) {
      throw new Error('platoon insert raced and lookup failed');
    }

    if (platoon.sheetId === sheetId) {
      await syncPlatoonSheet(platoon.id, platoon.sheetId); // write the header row
    }
    await interaction.editReply(
      `📋 Created roster sheet for **${name}**: ${spreadsheetUrl(platoon.sheetId)}\n` +
        'Players: set your identity with `/username`, then submit screenshots with `/roster`.'
    );
  },
};
