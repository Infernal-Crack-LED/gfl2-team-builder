import {
  ActionRowBuilder,
  AttachmentBuilder,
  ComponentType,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import { and, desc, eq } from 'drizzle-orm';
import type { Command } from '../../types.js';
import { db } from '../../../db/index.js';
import { userProfiles } from '../../../db/schema.js';
import { decodeTeamBuild } from '../../../share/buildCode.js';
import { getSiteUrl, loadGfl2Data } from '../../lib/gfl2/data.js';
import { brandEmbed, iconAttachment } from '../../lib/gfl2/embedBrand.js';
import { teamShortLink } from '../../lib/gfl2/shareLink.js';

/** Kind used by the web client's team builder save. */
const TEAM_KIND = 'gfl2-team';

interface SavedTeam {
  id: string;
  name: string;
  code: string;
  /** Doll names in the squad slots, for the select menu label. */
  memberNames: string[];
}

/** Load the user's saved team builds, resolved to doll names. */
async function loadSavedTeams(discordId: string): Promise<SavedTeam[]> {
  const rows = await db
    .select({
      id: userProfiles.id,
      name: userProfiles.name,
      code: userProfiles.code,
    })
    .from(userProfiles)
    .where(
      and(
        eq(userProfiles.discordId, discordId),
        eq(userProfiles.kind, TEAM_KIND)
      )
    )
    .orderBy(desc(userProfiles.updatedAt));

  const { dolls } = await loadGfl2Data();
  const dollBySlug = new Map(dolls.map((d) => [d.slug, d.name]));

  const teams: SavedTeam[] = [];
  for (const row of rows) {
    const decoded = decodeTeamBuild(row.code);
    if (!decoded) {
      continue;
    }
    const members = decoded.s
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .map((s) => dollBySlug.get(s.d) ?? s.d);
    teams.push({
      id: row.id,
      name: row.name,
      code: row.code,
      memberNames: members,
    });
  }
  return teams;
}

/** Team card image URL from the server's image API. */
function teamCardUrl(code: string): string {
  return `${getSiteUrl()}/api/v1/img/team.png?b=${encodeURIComponent(code)}`;
}

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('shareteam')
    .setDescription('Share one of your saved squads from refittingroom.app.')
    .addStringOption((o) =>
      o
        .setName('name')
        .setDescription('Team name to share directly (skips the list)')
        .setRequired(false)
    ),
  execute: async (interaction) => {
    const teams = await loadSavedTeams(interaction.user.id);

    if (teams.length === 0) {
      await interaction.reply({
        content: `You have no saved squads. Connect your Discord to [refittingroom.app/team-builder](${getSiteUrl()}/team-builder) and save a squad first.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const nameFilter = interaction.options.getString('name');

    // Direct name lookup path.
    if (nameFilter) {
      const match = teams.find(
        (t) => t.name.toLowerCase() === nameFilter.toLowerCase()
      );
      if (!match) {
        const names = teams.map((t) => t.name).join(', ');
        await interaction.reply({
          content: `No squad named **${nameFilter}**. Your squads: ${names}`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await interaction.deferReply();
      const shortUrl = await teamShortLink(match.code);
      const embed = brandEmbed(new EmbedBuilder(), {
        name: 'View on Refitting Room',
        url: shortUrl,
      });
      try {
        await interaction.editReply({
          embeds: [embed],
          files: [
            new AttachmentBuilder(teamCardUrl(match.code), {
              name: 'squad-card.png',
            }).setDescription(`${match.name} squad card`),
            iconAttachment(),
          ],
        });
      } catch {
        await interaction.editReply({
          embeds: [embed],
          files: [iconAttachment()],
        });
      }
      return;
    }

    // Select-menu path.
    const menu = new StringSelectMenuBuilder()
      .setCustomId('shareteam-pick')
      .setPlaceholder('Pick a squad…')
      .addOptions(
        teams.slice(0, 25).map((t, i) => ({
          label: `${i + 1}. ${t.name}`.slice(0, 100),
          description: t.memberNames.slice(0, 5).join(', ').slice(0, 100),
          value: t.id,
        }))
      );

    const reply = await interaction.reply({
      content: `You have **${teams.length}** saved squad${teams.length === 1 ? '' : 's'}:`,
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
      ],
      flags: MessageFlags.Ephemeral,
    });

    let selected;
    try {
      selected = await reply.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: 60_000,
      });
    } catch {
      await interaction.editReply({
        content: 'Timed out — run `/shareteam` again.',
        components: [],
      });
      return;
    }

    const picked = teams.find((t) => t.id === selected.values[0]);
    if (!picked) {
      await selected.update({ content: 'Squad not found.', components: [] });
      return;
    }

    await selected.update({ content: 'Loading…', components: [] });

    const shortUrl = await teamShortLink(picked.code);
    const embed = brandEmbed(new EmbedBuilder(), {
      name: 'View on Refitting Room',
      url: shortUrl,
    });

    // Post the result publicly so the whole channel can see it.
    try {
      await interaction.followUp({
        embeds: [embed],
        files: [
          new AttachmentBuilder(teamCardUrl(picked.code), {
            name: 'squad-card.png',
          }).setDescription(`${picked.name} squad card`),
          iconAttachment(),
        ],
      });
    } catch {
      await interaction.followUp({
        embeds: [embed],
        files: [iconAttachment()],
      });
    }
    // Clean up the ephemeral "Loading…" message.
    await interaction.deleteReply().catch(() => null);
  },
};
