/**
 * TapTap moment page scraper for ReTempest infographics.
 *
 * This module lives in src/sync/ because it is called by the sync script
 * (`npm run sync`), NOT by the bot process at request time. The bot reads
 * pre-scraped URLs from the `infographics` DB table instead.
 *
 * TapTap renders moment pages with Nuxt 3 — the server-side HTML includes a
 * `<script id="__NUXT_DATA__">` tag containing a flat dehydrated array. Each
 * entry is either a primitive value (string, number, boolean) or an object
 * whose values are indices back into the same array (references). This module
 * fetches that HTML, extracts the array, resolves references, and pulls out
 * the image URLs and rich text structure we need.
 *
 * DISCOVERY:
 *   Individual moment pages work but the user profile page is WAF-blocked.
 *   However, each moment page includes a "related posts" section that lists
 *   other posts by the same author. We use this to discover the latest posts
 *   matching known title patterns without needing a profile page scrape.
 */

const TAPTAP_AUTHOR_NAME = 'Re Tempest';

/** Title patterns ReTempest uses reliably for each post type. */
const TITLE_PATTERNS = {
  tierList: '【少前2强度榜】',
  teamGuide: '【尘烟前线攻略】',
} as const;

/** Heading text that precedes each tier list image in the rich content. */
const TIER_HEADINGS = {
  v6: '满椎强度榜',
  v0: '0椎强度榜',
} as const;

/** Seed moment IDs — updated when ReTempest posts new content. */
const SEED_MOMENTS = {
  teamGuide: '837019803922203839',
  tierList: '836687941676828172',
} as const;

/**
 * Row shape for the `infographics` table. The sync script upserts these;
 * the bot reads them.
 */
export interface InfographicRow {
  id: string;
  imageUrl: string;
  momentId: string | null;
  title: string | null;
}

// ---------------------------------------------------------------------------
// NUXT_DATA parser
// ---------------------------------------------------------------------------

function resolve(data: unknown[], ref: unknown): unknown {
  if (typeof ref === 'number' && ref >= 0 && ref < data.length) {
    return data[ref];
  }
  return ref;
}

function extractNuxtData(html: string): unknown[] {
  const match = html.match(
    /<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]+?)<\/script>/
  );
  if (!match?.[1]) {
    throw new Error('No __NUXT_DATA__ found in page');
  }
  return JSON.parse(match[1].trim()) as unknown[];
}

// ---------------------------------------------------------------------------
// Moment page parsing
// ---------------------------------------------------------------------------

interface MomentImage {
  originalUrl: string;
}

interface ContentBlock {
  type: 'image' | 'paragraph' | string;
  text: string;
  imageUrl?: string;
}

interface ParsedMoment {
  id: string;
  title: string;
  images: MomentImage[];
  contentBlocks: ContentBlock[];
  relatedMoments: { id: string; title: string; authorName: string }[];
}

export function parseMomentPage(html: string): ParsedMoment {
  const data = extractNuxtData(html);

  const root = data[1] as Record<string, unknown>;
  const dataRef = root.data as number;
  const routeMap = data[dataRef] as Record<string, unknown>;

  let momentWrapper: Record<string, unknown> | null = null;
  for (const routeIdx of Object.values(routeMap)) {
    if (typeof routeIdx !== 'number') {
      continue;
    }
    const resolved = data[routeIdx];
    if (
      resolved &&
      typeof resolved === 'object' &&
      !Array.isArray(resolved) &&
      'moment' in resolved
    ) {
      momentWrapper = resolved as Record<string, unknown>;
      break;
    }
    if (Array.isArray(resolved)) {
      for (const ref of resolved) {
        if (typeof ref === 'number' && ref >= 0) {
          const item = data[ref];
          if (
            item &&
            typeof item === 'object' &&
            !Array.isArray(item) &&
            'moment' in (item as Record<string, unknown>)
          ) {
            momentWrapper = item as Record<string, unknown>;
            break;
          }
        }
      }
      if (momentWrapper) {
        break;
      }
    }
  }
  if (!momentWrapper) {
    throw new Error('No moment wrapper found in NUXT_DATA');
  }

  const momentIdx = momentWrapper.moment as number;
  const moment = data[momentIdx] as Record<string, unknown>;

  const id = String(resolve(data, moment.id_str));

  const topic = data[moment.topic as number] as Record<string, unknown>;
  const title = String(resolve(data, topic.title));

  const imagesRef = topic.images as number;
  const imageRefs = data[imagesRef] as number[];
  const images: MomentImage[] = imageRefs
    .filter((ref) => ref !== -1)
    .map((ref) => {
      const img = data[ref] as Record<string, unknown>;
      const originalUrl = String(resolve(data, img.original_url));
      return { originalUrl };
    });

  const contentBlocks: ContentBlock[] = [];
  const firstPostIdx = momentWrapper.first_post as number;
  if (firstPostIdx !== undefined) {
    const firstPost = data[firstPostIdx] as Record<string, unknown>;
    const contents = data[firstPost.contents as number] as Record<
      string,
      unknown
    >;
    const jsonRef = contents.json as number;
    if (jsonRef !== undefined) {
      const blockRefs = data[jsonRef] as number[];
      for (const blockRef of blockRefs) {
        const block = data[blockRef] as Record<string, unknown>;
        const blockType = String(resolve(data, block.type));

        if (blockType === 'image' && block.info !== undefined) {
          const info = data[block.info as number] as Record<string, unknown>;
          const imgUrl = String(resolve(data, info.img_url));
          contentBlocks.push({ type: 'image', text: '', imageUrl: imgUrl });
        } else {
          const childrenRef = block.children;
          let text = '';
          if (childrenRef !== undefined) {
            const children =
              typeof childrenRef === 'number'
                ? (data[childrenRef] as number[])
                : (childrenRef as number[]);
            if (Array.isArray(children)) {
              for (const childRef of children) {
                if (typeof childRef === 'number' && childRef < data.length) {
                  const child = data[childRef] as Record<string, unknown>;
                  if (child.text !== undefined) {
                    const t = resolve(data, child.text);
                    if (typeof t === 'string') {
                      text += t;
                    }
                  }
                }
              }
            }
          }
          contentBlocks.push({ type: blockType, text });
        }
      }
    }
  }

  const relatedMoments: { id: string; title: string; authorName: string }[] =
    [];
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    if (
      item &&
      typeof item === 'object' &&
      !Array.isArray(item) &&
      'id_str' in item &&
      'author' in item &&
      'topic' in item
    ) {
      const obj = item as Record<string, unknown>;
      const momentId = String(resolve(data, obj.id_str));
      if (momentId === id) {
        continue;
      }

      const topicObj = data[obj.topic as number] as Record<string, unknown>;
      if (!topicObj || !('title' in topicObj)) {
        continue;
      }
      const relTitle = String(resolve(data, topicObj.title));

      const authorObj = data[obj.author as number] as Record<string, unknown>;
      if (!authorObj || !('user' in authorObj)) {
        continue;
      }
      const userObj = data[authorObj.user as number] as Record<string, unknown>;
      if (!userObj || !('name' in userObj)) {
        continue;
      }
      const authorName = String(resolve(data, userObj.name));

      if (authorName === TAPTAP_AUTHOR_NAME) {
        relatedMoments.push({ id: momentId, title: relTitle, authorName });
      }
    }
  }

  return { id, title, images, contentBlocks, relatedMoments };
}

// ---------------------------------------------------------------------------
// Image extraction helpers
// ---------------------------------------------------------------------------

function extractTeamImage(moment: ParsedMoment): string | null {
  return moment.images[0]?.originalUrl ?? null;
}

function extractImageAfterHeading(
  moment: ParsedMoment,
  heading: string
): string | null {
  const blocks = moment.contentBlocks;
  for (let i = 0; i < blocks.length - 1; i++) {
    const current = blocks[i];
    const next = blocks[i + 1];
    if (!current || !next) {
      continue;
    }
    if (current.type === 'paragraph' && current.text.includes(heading)) {
      if (next.type === 'image' && next.imageUrl) {
        return next.imageUrl;
      }
    }
  }
  return null;
}

function findLatestMatchingMoment(
  moment: ParsedMoment,
  pattern: string
): string | null {
  const matches = moment.relatedMoments.filter((r) =>
    r.title.includes(pattern)
  );
  if (matches.length === 0) {
    return null;
  }
  matches.sort((a, b) => (BigInt(b.id) - BigInt(a.id) > 0n ? 1 : -1));
  return matches[0]!.id;
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

export async function fetchMomentHtml(momentId: string): Promise<string> {
  const url = `https://www.taptap.cn/moment/${momentId}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  });
  if (!res.ok) {
    throw new Error(`TapTap fetch failed: ${res.status} for ${url}`);
  }
  return res.text();
}

/**
 * Discover and fetch the latest infographics from ReTempest on TapTap.
 *
 * Strategy:
 * 1. Fetch seed moment pages for each post type
 * 2. Check their related posts for newer posts matching the title patterns
 * 3. If a newer post is found, fetch that instead
 * 4. Extract the specific images we need from the final post
 *
 * Returns rows ready for upsert into the `infographics` table.
 */
export async function fetchTapTapInfographics(): Promise<InfographicRow[]> {
  const rows: InfographicRow[] = [];

  // --- Team infographic ---
  try {
    const teamHtml = await fetchMomentHtml(SEED_MOMENTS.teamGuide);
    const teamMoment = parseMomentPage(teamHtml);

    const newerTeamId = findLatestMatchingMoment(
      teamMoment,
      TITLE_PATTERNS.teamGuide
    );
    const finalTeamMoment =
      newerTeamId && newerTeamId !== teamMoment.id
        ? parseMomentPage(await fetchMomentHtml(newerTeamId))
        : teamMoment;

    const teamUrl = extractTeamImage(finalTeamMoment);
    if (teamUrl) {
      rows.push({
        id: 'team',
        imageUrl: teamUrl,
        momentId: finalTeamMoment.id,
        title: finalTeamMoment.title,
      });
    }
  } catch (err) {
    console.warn('[taptap] Failed to fetch team infographic:', err);
  }

  // --- Tier list infographic ---
  try {
    const tierHtml = await fetchMomentHtml(SEED_MOMENTS.tierList);
    const tierMoment = parseMomentPage(tierHtml);

    const newerTierId = findLatestMatchingMoment(
      tierMoment,
      TITLE_PATTERNS.tierList
    );
    const finalTierMoment =
      newerTierId && newerTierId !== tierMoment.id
        ? parseMomentPage(await fetchMomentHtml(newerTierId))
        : tierMoment;

    const v6Url = extractImageAfterHeading(finalTierMoment, TIER_HEADINGS.v6);
    const v0Url = extractImageAfterHeading(finalTierMoment, TIER_HEADINGS.v0);

    if (v6Url) {
      rows.push({
        id: 'tierlist-v6',
        imageUrl: v6Url,
        momentId: finalTierMoment.id,
        title: finalTierMoment.title,
      });
    }
    if (v0Url) {
      rows.push({
        id: 'tierlist-v0',
        imageUrl: v0Url,
        momentId: finalTierMoment.id,
        title: finalTierMoment.title,
      });
    }
  } catch (err) {
    console.warn('[taptap] Failed to fetch tier list infographic:', err);
  }

  return rows;
}
