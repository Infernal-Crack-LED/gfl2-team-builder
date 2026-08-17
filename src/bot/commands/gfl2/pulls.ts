import {
  AttachmentBuilder,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { Command } from '../../types.js';
import {
  BANNERS,
  copiesForTier,
  copyTierLabel,
  meanPullsToFeatured,
  overallEliteRate,
  parseCopyTarget,
  summarizePulls,
  worstCasePullsToFeatured,
  type BannerConfig,
  type PullsSummary,
} from '../../../share/gacha.js';
import {
  bannerEmbedColor,
  buildPullCardData,
  pct0,
  pct1,
  ratePct,
} from '../../../share/pullDisplay.js';

/** One line describing where the plan starts from: pity and 50/50 state. */
function startingStateLine(
  banner: BannerConfig,
  state: { pity: number; guaranteed: boolean }
): string {
  const next = state.guaranteed
    ? '**guaranteed featured** on your next Elite'
    : `**${pct0(banner.featuredChance)}** featured on your next Elite`;
  return `Starting pity **${state.pity}** · ${next}`;
}

/**
 * Render the odds card and reply with it. The image REPLACES the embed when a
 * budget is all that was asked for — the card carries every figure the embed
 * did — but a render failure (missing fonts, a canvas that won't load in this
 * environment) must never cost the user their answer, so the embed is the
 * fallback rather than an error message.
 *
 * The renderer is imported lazily: it pulls in @napi-rs/canvas and registers
 * fonts at module load, and the command loader imports every command at boot.
 * A static import would make a font problem a bot-wide startup crash instead
 * of one degraded reply.
 */
async function replyWithCard(
  interaction: ChatInputCommandInteraction,
  summary: PullsSummary,
  /** Shown above the card (target mode) and alone if rendering fails. */
  embeds: EmbedBuilder[],
  fallback: EmbedBuilder
): Promise<void> {
  await interaction.deferReply();
  try {
    const { renderPullCardPng } =
      await import('../../../infographics/node/render.js');
    const data = buildPullCardData(summary);
    const png = await renderPullCardPng(data);
    const file = new AttachmentBuilder(png, {
      name: 'pull-odds.png',
    }).setDescription(`${data.title} — ${data.subtitle}`);
    await interaction.editReply({ embeds, files: [file] });
  } catch (err) {
    console.warn('[pulls] card render failed, falling back to embed:', err);
    await interaction.editReply({ embeds: [fallback] });
  }
}

/**
 * Build the odds embed: an "any Elite" headline, then the featured unit's
 * expected copies and cumulative dupe-tier odds. Odds are cumulative ("V2"
 * includes V3+), and each tier is tagged with its community name.
 */
function buildPullsEmbed(s: PullsSummary): EmbedBuilder {
  const { banner } = s;
  const tierStrs = s.featuredAtLeast.map(
    (p, i) => `${copyTierLabel(banner, i + 1)} **${pct0(p)}**`
  );
  // Two dupe tiers per line so the field stays compact.
  const tierRows: string[] = [];
  for (let i = 0; i < tierStrs.length; i += 2) {
    tierRows.push(tierStrs.slice(i, i + 2).join(' · '));
  }

  return new EmbedBuilder()
    .setColor(bannerEmbedColor(banner))
    .setTitle(`🎲 ${s.pulls} pull${s.pulls === 1 ? '' : 's'} — ${banner.label}`)
    .setDescription(
      startingStateLine(banner, { pity: s.pity, guaranteed: s.guaranteed })
    )
    .addFields(
      {
        name: `✨ Any ${banner.eliteLabel} — ${ratePct(banner.baseRate)} base`,
        value: `Expected **${s.expectedElites.toFixed(1)}** · chance of ≥1: **${pct1(s.eliteAtLeastOne)}**`,
      },
      {
        name: `🎯 Featured — ${pct0(banner.featuredChance)} per ${banner.eliteLabel}`,
        value: `Expected **${s.expectedFeatured.toFixed(1)}** copies\n${tierRows.join('\n')}`,
      },
      {
        name: '🛡️ Worst case',
        value: `**${s.worstCaseFeatured}** pulls always lands the featured ${banner.key}.`,
        inline: true,
      },
      {
        name: '📈 Soft pity',
        value: `Ramps from pull **${banner.softPityStart}**, guaranteed at **${banner.hardPity}**.`,
        inline: true,
      }
    )
    .setFooter({
      text:
        `Tiers are cumulative — ${copyTierLabel(banner, 2)} includes higher. ` +
        `Overall Elite rate incl. guarantees: ${(overallEliteRate(banner) * 100).toFixed(2)}%.`,
    });
}

/** The "how many pulls do I need" answer for a dupe target like V6 / R3. */
function buildTargetEmbed(
  banner: BannerConfig,
  copies: number,
  state: { pity: number; guaranteed: boolean },
  plannedPulls: number | null
): EmbedBuilder {
  const tier = copyTierLabel(banner, copies);
  const average = meanPullsToFeatured(banner, copies, state);
  const worst = worstCasePullsToFeatured(banner, copies, state);

  const embed = new EmbedBuilder()
    .setColor(bannerEmbedColor(banner))
    .setTitle(`🎯 ${tier} — ${banner.label}`)
    .setDescription(
      `${copies} featured cop${copies === 1 ? 'y' : 'ies'} · ${startingStateLine(banner, state)}`
    )
    .addFields(
      {
        name: '📊 Average',
        value: `**${Math.round(average)}** pulls`,
        inline: true,
      },
      {
        name: '🛡️ Worst case',
        value: `**${worst}** pulls`,
        inline: true,
      }
    );

  if (plannedPulls !== null) {
    const s = summarizePulls(plannedPulls, { banner, ...state });
    const chance = s.featuredAtLeast[copies - 1] ?? 0;
    embed.addFields({
      name: `🎲 With ${plannedPulls} pulls`,
      value: `Chance of reaching ${tier}: **${pct1(chance)}**`,
    });
  }

  return embed.setFooter({
    text:
      `Average is the mean pulls to get there, not a guarantee — luck swings hard either way. ` +
      `Worst case assumes every Elite arrives at hard pity and every ${pct0(1 - banner.featuredChance)} roll goes off-banner.`,
  });
}

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('pulls')
    .setDescription(
      'GFL2 pull odds: chances for a planned budget, or pulls needed for a V/R target.'
    )
    .addIntegerOption((option) =>
      option
        .setName('pulls')
        .setDescription('How many pulls you plan to do')
        .setMinValue(1)
        .setMaxValue(5000)
    )
    .addStringOption((option) =>
      option
        .setName('target')
        .setDescription(
          'Dupe target, e.g. V6 or R3 — returns average and max pulls to reach it'
        )
    )
    .addStringOption((option) =>
      option
        .setName('banner')
        .setDescription('Which banner to use (default: doll)')
        .addChoices(
          { name: 'Doll — 0.6% base, 50/50, pity 80', value: 'doll' },
          { name: 'Weapon — 0.7% base, 75/25, pity 70', value: 'weapon' }
        )
    )
    .addIntegerOption((option) =>
      option
        .setName('pity')
        .setDescription('Pulls since your last Elite (default: 0)')
        .setMinValue(0)
        .setMaxValue(79)
    )
    .addBooleanOption((option) =>
      option
        .setName('guaranteed')
        .setDescription(
          'Your last Elite was off-banner, so the next is featured'
        )
    ),
  execute: async (interaction) => {
    const pulls = interaction.options.getInteger('pulls');
    const rawTarget = interaction.options.getString('target');
    const bannerChoice = interaction.options.getString('banner') as
      BannerConfig['key'] | null;
    const pity = interaction.options.getInteger('pity') ?? 0;
    const guaranteed = interaction.options.getBoolean('guaranteed') ?? false;

    const deny = async (content: string): Promise<void> => {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    };

    if (pulls === null && rawTarget === null) {
      await deny(
        'Give me a `pulls` budget, a `target` like `V6`, or both — otherwise there is nothing to work out.'
      );
      return;
    }

    const target = rawTarget === null ? null : parseCopyTarget(rawTarget);
    if (rawTarget !== null && target === null) {
      await deny(
        `I couldn't read \`${rawTarget}\` as a dupe target. Use something like \`V6\` for dolls or \`R3\` for weapons.`
      );
      return;
    }

    // An unambiguous V/R prefix picks the banner on its own, so `/pulls
    // target:r6` just works — but never silently override an explicit choice.
    const banner =
      BANNERS[bannerChoice ?? (target?.prefix === 'R' ? 'weapon' : 'doll')];
    if (target?.prefix && bannerChoice) {
      const prefixBanner = target.prefix === 'R' ? 'weapon' : 'doll';
      if (prefixBanner !== bannerChoice) {
        await deny(
          `\`${rawTarget}\` is a ${prefixBanner} target, but you picked the ${banner.label.toLowerCase()}. Drop one of the two.`
        );
        return;
      }
    }

    // The option range has to cover the doll banner's 80-pull pity, so the
    // weapon banner needs its own tighter check rather than silently clamping.
    if (pity >= banner.hardPity) {
      await deny(
        `Pity on the ${banner.label.toLowerCase()} resets at ${banner.hardPity}, so it can be at most ${banner.hardPity - 1}.`
      );
      return;
    }

    if (target !== null) {
      const copies = copiesForTier(banner, target.tier);
      if (copies === null) {
        const lowest = copyTierLabel(banner, 1);
        const highest = copyTierLabel(banner, banner.maxCopies);
        await deny(
          `${banner.label}s go from ${lowest} to ${highest}, so \`${rawTarget}\` isn't a tier I can reach.`
        );
        return;
      }
      const targetEmbed = buildTargetEmbed(
        banner,
        copies,
        { pity, guaranteed },
        pulls
      );
      // A target on its own is a "how many pulls do I need" question, which
      // the card doesn't answer — it charts a BUDGET. So the card only comes
      // along when a budget was named too, under the target's own answer.
      if (pulls === null) {
        await interaction.reply({ embeds: [targetEmbed] });
        return;
      }
      const budget = summarizePulls(pulls, { banner, pity, guaranteed });
      await replyWithCard(interaction, budget, [targetEmbed], targetEmbed);
      return;
    }

    const summary = summarizePulls(pulls ?? 0, { banner, pity, guaranteed });
    await replyWithCard(interaction, summary, [], buildPullsEmbed(summary));
  },
};
