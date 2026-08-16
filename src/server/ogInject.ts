/**
 * OG/Twitter meta injection for share URLs.
 *
 * When the SPA fallback serves index.html for a shareable builder URL
 * (/builder/<slug>?b=…|?id=…, /team-builder?b=…|?id=…) with a WELL-FORMED
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
  decodeTeamBuild,
} from '../share/buildCode.js';
import { SITE_NAME } from '../infographics/core/theme.js';
import { getDoll } from './gameData.js';
import { PUBLIC_KINDS, PUBLIC_PROFILE_ID_RE } from './publicShare.js';

const BUILDER_PATH_RE = /^\/builder\/([a-z0-9-]+)$/;
const MAX_CODE_LEN = 4096; // same cap as the image API

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Replace (or, if absent, insert before </head>) a single <meta> tag.
 * Regex-based and tolerant of multi-line tag formatting in index.html. */
function setMeta(html: string, attr: 'property' | 'name', key: string, content: string): string {
  const re = new RegExp(`<meta\\s[^>]*${attr}=["']${key}["'][^>]*>`, 'i');
  const tag = `<meta ${attr}="${key}" content="${escapeHtml(content)}" />`;
  if (re.test(html)) {
    return html.replace(re, tag);
  }
  return html.replace('</head>', `    ${tag}\n  </head>`);
}

interface ShareMeta {
  title: string;
  imagePath: string; // absolute path+query on this origin
}

/**
 * Compute the share meta for a builder URL, or null when the URL is not a
 * well-formed share link (→ caller serves the default head).
 */
export async function shareMetaForUrl(url: URL): Promise<ShareMeta | null> {
  const b = url.searchParams.get('b');
  const id = url.searchParams.get('id');
  if ((b === null && id === null) || (b !== null && id !== null)) {
    return null;
  }
  const builderMatch = BUILDER_PATH_RE.exec(url.pathname);
  const isBuilder = builderMatch !== null;
  const isTeam = url.pathname === '/team-builder';
  if (!isBuilder && !isTeam) {
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
  if (!row || !PUBLIC_KINDS.includes(row.kind as (typeof PUBLIC_KINDS)[number])) {
    return null;
  }
  const decoded = decodeAnyBuild(row.code);
  if (!decoded) {
    return null;
  }
  if (decoded.kind === 'build') {
    const doll = getDoll(decoded.build.doll);
    if (!doll) {
      return null;
    }
    return {
      title: `${doll.name} build — ${SITE_NAME}`,
      imagePath: `/api/v1/img/build.png?id=${encodeURIComponent(id)}`,
    };
  }
  return {
    title: `Squad — ${SITE_NAME}`,
    imagePath: `/api/v1/img/team.png?id=${encodeURIComponent(id)}`,
  };
}

/** Serve index.html with share-specific head tags when the URL warrants it. */
export async function injectShareMeta(html: string, url: URL): Promise<string> {
  const meta = await shareMetaForUrl(url).catch(() => null);
  if (!meta) {
    return html;
  }
  const imageUrl = `${url.origin}${meta.imagePath}`;
  let out = html;
  out = setMeta(out, 'property', 'og:title', meta.title);
  out = setMeta(out, 'property', 'og:image', imageUrl);
  out = setMeta(out, 'name', 'twitter:title', meta.title);
  out = setMeta(out, 'name', 'twitter:image', imageUrl);
  out = setMeta(out, 'name', 'twitter:card', 'summary_large_image');
  return out;
}
