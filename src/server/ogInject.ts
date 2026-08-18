/**
 * OG/Twitter meta injection for share URLs.
 *
 * When the SPA fallback serves index.html for a shareable builder URL
 * (/builder/<slug>?b=…|?id=…, /team-builder?b=…|?id=…, or a rec-card link
 * /tools/infographics?card=rec&b=…) with a WELL-FORMED
 * payload, the generic head tags are replaced with share-specific ones —
 * og:image pointing at the content-addressed image API — so Discord/Twitter
 * crawlers (which run no JS) embed the rendered card. EVERYONE gets the
 * enriched HTML (no user-agent sniffing); junk params get the default tags.
 *
 * DECISION RECORD — ?id= links: imgApi implements ?id= expansion, so ?id=
 * share URLs DO get an og:image override (`/api/v1/img/<kind>.png?id=…`),
 * with the kind resolved from the stored code. (Had id expansion not been
 * implemented, ?id= would keep the default /og.png.)
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { userProfiles } from '../db/schema.js';
import {
  decodeAnyBuild,
  decodeDollBuild,
  decodeRecBuild,
  decodeTeamBuild,
} from '../share/buildCode.js';
import { SITE_NAME } from '../infographics/core/theme.js';
import { weaponPageMeta } from '../share/pageMeta.js';
import { getDoll, getWeaponBySlug } from './gameData.js';
import { removeMetaTag, setMetaTag } from './htmlHead.js';
import { PUBLIC_KINDS, PUBLIC_PROFILE_ID_RE } from './publicShare.js';

const BUILDER_PATH_RE = /^\/builder\/([a-z0-9-]+)$/;
const WEAPON_PATH_RE = /^\/weapons\/([a-z0-9-]+)$/;
const MAX_CODE_LEN = 4096; // same cap as the image API

interface ShareMeta {
  title: string;
  imagePath: string; // absolute path+query on this origin
}

/**
 * Compute the share meta for a builder URL, or null when the URL is not a
 * well-formed share link (→ caller serves the default head).
 */
export async function shareMetaForUrl(url: URL): Promise<ShareMeta | null> {
  const weaponMatch = WEAPON_PATH_RE.exec(url.pathname);
  if (weaponMatch) {
    const slug = weaponMatch[1];
    if (!slug) {
      return null;
    }
    const weapon = getWeaponBySlug(slug);
    if (!weapon) {
      return null;
    }
    return {
      title: weaponPageMeta(weapon).title,
      imagePath: `/api/v1/img/weapon.png?slug=${encodeURIComponent(slug)}`,
    };
  }

  const b = url.searchParams.get('b');
  const id = url.searchParams.get('id');
  if ((b === null && id === null) || (b !== null && id !== null)) {
    return null;
  }
  const builderMatch = BUILDER_PATH_RE.exec(url.pathname);
  const isBuilder = builderMatch !== null;
  const isTeam = url.pathname === '/team-builder';
  // The rec card's editor IS the infographics page, so its share links point
  // there (?card=rec&b=…) and get the same og treatment as the builders.
  const isInfog = url.pathname === '/tools/infographics';
  if (!isBuilder && !isTeam && !isInfog) {
    return null;
  }

  if (b !== null) {
    if (b.length === 0 || b.length > MAX_CODE_LEN) {
      return null;
    }
    if (isBuilder) {
      const build = decodeDollBuild(b);
      if (!build) {
        return null;
      }
      const doll = getDoll(build.doll);
      if (!doll) {
        return null;
      }
      return {
        title: `${doll.name} build — ${SITE_NAME}`,
        imagePath: `/api/v1/img/build.png?b=${encodeURIComponent(b)}`,
      };
    }
    if (isInfog) {
      const rec = decodeRecBuild(b);
      if (!rec) {
        return null;
      }
      const doll = getDoll(rec.doll);
      if (!doll) {
        return null;
      }
      return {
        title: `${doll.name} recommendation — ${SITE_NAME}`,
        imagePath: `/api/v1/img/rec.png?b=${encodeURIComponent(b)}`,
      };
    }
    const team = decodeTeamBuild(b);
    if (!team || team.s.every((s) => s === null)) {
      return null;
    }
    return {
      title: `Squad — ${SITE_NAME}`,
      imagePath: `/api/v1/img/team.png?b=${encodeURIComponent(b)}`,
    };
  }

  // ?id=<uuid> — expand the public profile row (same visibility rules as
  // /api/profiles/:id/public) and decide the card kind from its code.
  if (!id || !PUBLIC_PROFILE_ID_RE.test(id)) {
    return null;
  }
  const [row] = await db
    .select({ kind: userProfiles.kind, code: userProfiles.code })
    .from(userProfiles)
    .where(and(eq(userProfiles.id, id), eq(userProfiles.kind, PUBLIC_KINDS[0])))
    .limit(1);
  if (
    !row ||
    !PUBLIC_KINDS.includes(row.kind as (typeof PUBLIC_KINDS)[number])
  ) {
    return null;
  }
  const decoded = decodeAnyBuild(row.code);
  if (!decoded) {
    return null;
  }
  if (decoded.kind === 'build' || decoded.kind === 'rec') {
    const doll = getDoll(decoded.build.doll);
    if (!doll) {
      return null;
    }
    const noun = decoded.kind === 'build' ? 'build' : 'recommendation';
    return {
      title: `${doll.name} ${noun} — ${SITE_NAME}`,
      imagePath: `/api/v1/img/${decoded.kind}.png?id=${encodeURIComponent(id)}`,
    };
  }
  return {
    title: `Squad — ${SITE_NAME}`,
    imagePath: `/api/v1/img/team.png?id=${encodeURIComponent(id)}`,
  };
}

/**
 * Serve index.html with share-specific head tags when the URL warrants it.
 * Runs AFTER the per-URL page meta (pageMeta.ts), so a share code's card image
 * wins over the page's own portrait image — a link to someone's build must
 * unfurl as that build, not as the doll.
 */
export async function injectShareMeta(html: string, url: URL): Promise<string> {
  const meta = await shareMetaForUrl(url).catch(() => null);
  if (!meta) {
    return html;
  }
  const imageUrl = `${url.origin}${meta.imagePath}`;
  let out = html;
  out = setMetaTag(out, 'property', 'og:title', meta.title);
  out = setMetaTag(out, 'property', 'og:image', imageUrl);
  out = setMetaTag(out, 'property', 'og:image:alt', meta.title);
  out = setMetaTag(out, 'name', 'twitter:title', meta.title);
  out = setMetaTag(out, 'name', 'twitter:image', imageUrl);
  out = setMetaTag(out, 'name', 'twitter:card', 'summary_large_image');
  // Cards are 1200 wide but NOT all 630 tall (a team card grows with each
  // filled slot), and the baked dimensions describe og.png — drop them rather
  // than assert a height this card may not have.
  out = removeMetaTag(out, 'property', 'og:image:width');
  out = removeMetaTag(out, 'property', 'og:image:height');
  return out;
}
