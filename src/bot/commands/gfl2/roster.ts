import {
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type Attachment,
} from 'discord.js';
import { eq, sql } from 'drizzle-orm';
import type { Command } from '../../types.js';
import { db } from '../../../db/index.js';
import {
  platoonMembers,
  platoons,
  rosterDolls,
  rosterPlayers,
} from '../../../db/schema.js';
import { matchDollName } from '../../lib/gfl2/dollMatch.js';
import { spreadsheetUrl } from '../../lib/gfl2/googleSheets.js';
import {
  extractRosterImages,
  ocrConfigured,
  type OcrDoll,
} from '../../lib/gfl2/ocrClient.js';
import { syncPlatoonSheet } from '../../lib/gfl2/rosterSheet.js';

/** The screenshot option names: one required, four more optional. */
const SCREENSHOT_OPTIONS = [
  'screenshot',
  'screenshot2',
  'screenshot3',
  'screenshot4',
  'screenshot5',
] as const;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

type Platoon = typeof platoons.$inferSelect;

/**
 * Which platoon does this submission belong to? An explicit option always
 * wins; otherwise a player who is a member of exactly one platoon in the
 * guild resubmits to it, and a guild with only one platoon needs no choice
 * at all. Anything else needs the option spelled out.
 */
async function resolvePlatoon(
  guildId: string,
  discordId: string,
  requested: string | null
): Promise<{ platoon: Platoon } | { error: string }> {
  const guildPlatoons = await db
    .select()
    .from(platoons)
    .where(eq(platoons.guildId, guildId));
  if (guildPlatoons.length === 0) {
    return {
      error:
        'This server has no platoon yet — create one with `/sheet <name>` first.',
    };
  }
  if (requested !== null) {
    const wanted = requested.trim().toLowerCase();
    const found = guildPlatoons.find((p) => p.name.toLowerCase() === wanted);
    return found
      ? { platoon: found }
      : {
          error: `No platoon named **${requested}** here. Existing: ${guildPlatoons
            .map((p) => p.name)
            .join(', ')}`,
        };
  }
  const [only] = guildPlatoons;
  if (guildPlatoons.length === 1 && only) {
    return { platoon: only };
  }
  const memberships = await db
    .select()
    .from(platoonMembers)
    .where(eq(platoonMembers.discordId, discordId));
  const mine = guildPlatoons.filter((p) =>
    memberships.some((m) => m.platoonId === p.id)
  );
  const [onlyMine] = mine;
  if (mine.length === 1 && onlyMine) {
    return { platoon: onlyMine };
  }
  return {
    error: `This server has several platoons (${guildPlatoons
      .map((p) => p.name)
      .join(', ')}) — pass one in the \`platoon\` option.`,
  };
}

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('roster')
    .setDescription(
      'Submit roster screenshots — reads doll names, vertebrae and power, updates the platoon sheet.'
    )
    .addAttachmentOption((option) =>
      option
        .setName('screenshot')
        .setDescription('Roster screenshot (doll cards with the blue V badge)')
        .setRequired(true)
    )
    .addAttachmentOption((option) =>
      option.setName('screenshot2').setDescription('Another screenshot')
    )
    .addAttachmentOption((option) =>
      option.setName('screenshot3').setDescription('Another screenshot')
    )
    .addAttachmentOption((option) =>
      option.setName('screenshot4').setDescription('Another screenshot')
    )
    .addAttachmentOption((option) =>
      option.setName('screenshot5').setDescription('Another screenshot')
    )
    .addStringOption((option) =>
      option
        .setName('platoon')
        .setDescription(
          'Platoon to file this under (needed only when the server has several)'
        )
        .setAutocomplete(true)
    ),
  autocomplete: async (interaction) => {
    if (!interaction.inGuild()) {
      await interaction.respond([]);
      return;
    }
    const focused = interaction.options.getFocused().toLowerCase();
    const rows = await db
      .select()
      .from(platoons)
      .where(eq(platoons.guildId, interaction.guildId));
    await interaction.respond(
      rows
        .filter((p) => p.name.toLowerCase().includes(focused))
        .slice(0, 25)
        .map((p) => ({ name: p.name, value: p.name }))
    );
  },
  execute: async (interaction) => {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: 'Roster submissions go to a platoon — run this in a server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!ocrConfigured()) {
      await interaction.reply({
        content:
          'The screenshot reader is not configured on this bot (missing OCR service URL).',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const attachments: Attachment[] = [];
    for (const name of SCREENSHOT_OPTIONS) {
      const att = interaction.options.getAttachment(name);
      if (att) {
        attachments.push(att);
      }
    }
    const bad = attachments.find(
      (a) => !a.contentType?.startsWith('image/') || a.size > MAX_IMAGE_BYTES
    );
    if (bad) {
      await interaction.reply({
        content: `**${bad.name}** isn't an image I can read (PNG/JPEG up to 10 MB).`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const resolved = await resolvePlatoon(
      interaction.guildId,
      interaction.user.id,
      interaction.options.getString('platoon')
    );
    if ('error' in resolved) {
      await interaction.reply({
        content: resolved.error,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const { platoon } = resolved;

    await interaction.deferReply();

    const images = await Promise.all(
      attachments.map(async (att) => {
        const res = await fetch(att.url);
        if (!res.ok) {
          throw new Error(`failed to download ${att.name}: ${res.status}`);
        }
        return {
          name: att.name,
          data: await res.arrayBuffer(),
          contentType: att.contentType ?? 'image/png',
        };
      })
    );

    const ocrResults = await extractRosterImages(images);

    const warnings: string[] = [];
    // slug -> best reading. A later duplicate replaces an earlier one only
    // if it actually read the badge (vertebrae !== null).
    const bySlug = new Map<string, { name: string; doll: OcrDoll }>();
    for (const [i, result] of ocrResults.entries()) {
      const imageName = attachments[i]?.name ?? `screenshot ${i + 1}`;
      if (result.error) {
        warnings.push(`**${imageName}**: ${result.error}`);
        continue;
      }
      if (result.dolls.length === 0) {
        warnings.push(
          `**${imageName}**: no doll cards found — is it a roster screenshot?`
        );
        continue;
      }
      for (const doll of result.dolls) {
        const matched = await matchDollName(doll.name);
        if (!matched) {
          warnings.push(`Couldn't match doll name “${doll.name}” — skipped.`);
          continue;
        }
        const existing = bySlug.get(matched.slug);
        if (!existing || doll.vertebrae !== null) {
          bySlug.set(matched.slug, { name: matched.name, doll });
        }
      }
    }
    // Warn only for dolls whose SURVIVING reading has no badge — a duplicate
    // card that did read fine (or a value already in the DB, which the upsert
    // coalesces to) makes the bad reading harmless.
    for (const { name, doll } of bySlug.values()) {
      if (doll.vertebrae === null) {
        warnings.push(
          `Couldn't read the vertebrae badge for **${name}** — kept your previously stored level, if any.`
        );
      }
    }

    if (bySlug.size === 0) {
      await interaction.editReply(
        `I couldn't read any dolls out of ${attachments.length === 1 ? 'that screenshot' : 'those screenshots'}.` +
          (warnings.length ? `\n${warnings.join('\n')}` : '')
      );
      return;
    }

    const now = new Date();
    for (const [slug, { doll }] of bySlug) {
      await db
        .insert(rosterDolls)
        .values({
          discordId: interaction.user.id,
          dollSlug: slug,
          vertebrae: doll.vertebrae,
          power: doll.power,
          level: doll.level,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [rosterDolls.discordId, rosterDolls.dollSlug],
          // Coalesce: a null reading (unreadable badge, missed power/level)
          // is strictly worse information than whatever is already stored —
          // never regress a known value to null across submissions.
          set: {
            vertebrae: sql`coalesce(excluded.vertebrae, ${rosterDolls.vertebrae})`,
            power: sql`coalesce(excluded.power, ${rosterDolls.power})`,
            level: sql`coalesce(excluded.level, ${rosterDolls.level})`,
            updatedAt: now,
          },
        });
    }

    await db
      .insert(platoonMembers)
      .values({ platoonId: platoon.id, discordId: interaction.user.id })
      .onConflictDoNothing();

    let sheetLine = `Sheet updated: ${spreadsheetUrl(platoon.sheetId)}`;
    try {
      await syncPlatoonSheet(platoon.id, platoon.sheetId);
    } catch (error) {
      console.error('[roster] sheet sync failed', error);
      sheetLine =
        '⚠️ Your data is saved, but updating the Google Sheet failed — it will catch up on the next submission.';
    }

    const identity = await db.query.rosterPlayers.findFirst({
      where: eq(rosterPlayers.discordId, interaction.user.id),
    });
    if (!identity) {
      warnings.push(
        "You haven't set your in-game identity yet — run `/username` so the sheet can show who you are."
      );
    }

    const lines = [...bySlug.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(
        ({ name, doll }) =>
          `**${name}** — V${doll.vertebrae ?? '?'}${doll.power !== null ? ` · ${doll.power}` : ''}`
      );

    const embed = new EmbedBuilder()
      .setColor(0x4a90d9)
      .setTitle(`📋 Roster updated — ${platoon.name}`)
      .setDescription(lines.join('\n').slice(0, 4000))
      .setFooter({
        text: `${bySlug.size} doll${bySlug.size === 1 ? '' : 's'} from ${attachments.length} screenshot${attachments.length === 1 ? '' : 's'}`,
      });
    if (warnings.length) {
      embed.addFields({
        name: '⚠️ Warnings',
        value: warnings.join('\n').slice(0, 1024),
      });
    }

    await interaction.editReply({ content: sheetLine, embeds: [embed] });
  },
};
