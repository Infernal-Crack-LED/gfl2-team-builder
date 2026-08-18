/**
 * Refitting Room embed branding — icon + `brandEmbed` helper.
 *
 * Mirrors bakery-bot's `lib/nikkesim/card-reply.ts` pattern:
 *   - The site icon is uploaded as a file attachment so the embed's author
 *     line can reference it via `attachment://`.
 *   - `brandEmbed` sets the author line with "View on Refitting Room" (or a
 *     custom label) and the icon, replacing the old approach of putting the
 *     link in `.setURL()` on the title.
 *
 * Card images (rec cards, build cards, team cards) are sent as standalone
 * file attachments — NOT as embed images — because Discord renders
 * attachments at full message width while embed images are capped to the
 * embed column's narrower width.
 */

import { readFileSync } from 'node:fs';
import { AttachmentBuilder, EmbedBuilder } from 'discord.js';

const ICON_NAME = 'refittingroom-icon.png';
const iconPng = readFileSync(
  new URL('../../../infographics/assets/site-icon.png', import.meta.url)
);

/** Attachment for the Refitting Room icon — include in every branded reply. */
export function iconAttachment(): AttachmentBuilder {
  return new AttachmentBuilder(iconPng, { name: ICON_NAME });
}

/** `attachment://` URL for use in `setAuthor({ iconURL })`. */
export const ICON_URL = `attachment://${ICON_NAME}`;

/** Refitting Room's accent color. */
export const RR_COLOR = 0x5b9dff;

/**
 * Apply Refitting Room branding to an embed.
 *
 * Sets the color and the author line with the RR icon and an optional link.
 * When `link` is provided, the author text becomes the link label and the
 * author URL is the link target. When omitted, the author just shows
 * "Refitting Room" with no clickable URL.
 */
export function brandEmbed(
  embed: EmbedBuilder,
  link?: { name: string; url: string }
): EmbedBuilder {
  return embed.setColor(RR_COLOR).setAuthor({
    name: link?.name ?? 'Refitting Room',
    iconURL: ICON_URL,
    url: link?.url,
  });
}
