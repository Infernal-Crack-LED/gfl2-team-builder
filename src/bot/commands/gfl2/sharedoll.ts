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
import { decodeDollBuild } from '../../../share/buildCode.js';
import { getSiteUrl, loadGfl2Data } from '../../lib/gfl2/data.js';

/** Kind used by the web client's per-doll builder save. */
const BUILD_KIND = 'gfl2-build';

interface SavedBuild {
  id: string;
  name: string;
  code: string;
  dollSlug: string;
  dollName: string;
}

/** Load the user's saved doll builds, resolved to doll names. */
async function loadSavedBuilds(discordId: string): Promise<SavedBuild[]> {
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
        eq(userProfiles.kind, BUILD_KIND)
      )
    )
    .orderBy(desc(userProfiles.updatedAt));

  const { dolls } = await loadGfl2Data();
  const dollBySlug = new Map(dolls.map((d) => [d.slug, d.name]));

  const builds: SavedBuild[] = [];
  for (const row of rows) {
    const decoded = decodeDollBuild(row.code);
    if (!decoded) {
      continue;
    }
    builds.push({
      id: row.id,
      name: row.name,
      code: row.code,
      dollSlug: decoded.doll,
      dollName: dollBySlug.get(decoded.doll) ?? decoded.doll,
    });
  }
  return builds;
}

/** Build card image URL from the server's image API. */
function buildCardUrl(code: string): string {
  return `${getSiteUrl()}/api/v1/img/build.png?b=${encodeURIComponent(code)}`;
}

/** Link to open the build on refittingroom.app. */
function buildPageUrl(slug: string, code: string): string {
  return `${getSiteUrl()}/builder/${encodeURIComponent(slug)}?b=${encodeURIComponent(code)}`;
}

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('sharedoll')
    .setDescription(
      'Share one of your saved doll builds from refittingroom.app.'
    )
    .addStringOption((o) =>
      o
        .setName('name')
        .setDescription('Build name to share directly (skips the list)')
        .setRequired(false)
    ),
  execute: async (interaction) => {
    const builds = await loadSavedBuilds(interaction.user.id);

    if (builds.length === 0) {
      await interaction.reply({
        content: `You have no saved doll builds. Connect your Discord to [refittingroom.app](${getSiteUrl()}) and save a build first.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const nameFilter = interaction.options.getString('name');

    // Direct name lookup path.
    if (nameFilter) {
      const match = builds.find(
        (b) => b.name.toLowerCase() === nameFilter.toLowerCase()
      );
      if (!match) {
        const names = builds.map((b) => b.name).join(', ');
        await interaction.reply({
          content: `No build named **${nameFilter}**. Your builds: ${names}`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await interaction.deferReply();
      const embed = new EmbedBuilder()
        .setColor(0x5b9dff)
        .setTitle(`${match.dollName} — ${match.name}`)
        .setURL(buildPageUrl(match.dollSlug, match.code));
      try {
        await interaction.editReply({
          embeds: [embed],
          files: [
            new AttachmentBuilder(buildCardUrl(match.code), {
              name: `${match.dollSlug}-build.png`,
            }).setDescription(`${match.dollName} build card`),
          ],
        });
      } catch {
        // Image unreachable — fall back to embed only.
        await interaction.editReply({ embeds: [embed] });
      }
      return;
    }

    // Select-menu path.
    const menu = new StringSelectMenuBuilder()
      .setCustomId('sharedoll-pick')
      .setPlaceholder('Pick a build…')
      .addOptions(
        builds.slice(0, 25).map((b, i) => ({
          label: `${i + 1}. ${b.name} (${b.dollName})`.slice(0, 100),
          value: b.id,
        }))
      );

    const reply = await interaction.reply({
      content: `You have **${builds.length}** saved build${builds.length === 1 ? '' : 's'}:`,
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
        content: 'Timed out — run `/sharedoll` again.',
        components: [],
      });
      return;
    }

    const picked = builds.find((b) => b.id === selected.values[0]);
    if (!picked) {
      await selected.update({ content: 'Build not found.', components: [] });
      return;
    }

    await selected.update({ content: 'Loading…', components: [] });

    const embed = new EmbedBuilder()
      .setColor(0x5b9dff)
      .setTitle(`${picked.dollName} — ${picked.name}`)
      .setURL(buildPageUrl(picked.dollSlug, picked.code));

    // Post the result publicly so the whole channel can see it.
    try {
      await interaction.followUp({
        embeds: [embed],
        files: [
          new AttachmentBuilder(buildCardUrl(picked.code), {
            name: `${picked.dollSlug}-build.png`,
          }).setDescription(`${picked.dollName} build card`),
        ],
      });
    } catch {
      await interaction.followUp({ embeds: [embed] });
    }
    // Clean up the ephemeral "Loading…" message.
    await interaction.deleteReply().catch(() => null);
  },
};
