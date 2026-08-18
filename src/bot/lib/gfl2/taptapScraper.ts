/**
 * TapTap moment page scraper for ReTempest infographics.
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
 *
 * CACHING:
 *   Results are cached with a 1-hour TTL. TapTap posts don't change after
 *   publishing (images are immutable), so the cache only needs to cover the
 *   case where ReTempest publishes a new post and we need to discover it.
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

const CACHE_TTL_MS = 60 * 60 * 1000;
const RETRY_MS = 60 * 1000;

interface InfographicUrls {
  /** Original-quality image URLs. */
  team: string | null;
  v6TierList: string | null;
  v0TierList: string | null;
  /** Moment IDs that were actually fetched (may differ from seeds). */
  teamMomentId: string | null;
  tierListMomentId: string | null;
}

let cachedUrls: InfographicUrls | null = null;
let cachedAt = 0;
let inflight: Promise<InfographicUrls> | null = null;

// ---------------------------------------------------------------------------
// NUXT_DATA parser
// ---------------------------------------------------------------------------

/**
 * Resolve a value from the dehydrated array. Numbers are indices into the
 * array; everything else is returned as-is.
 */
function resolve(data: unknown[], ref: unknown): unknown {
  if (typeof ref === 'number' && ref >= 0 && ref < data.length) {
    return data[ref];
  }
  return ref;
}

/** Extract the NUXT_DATA array from the HTML. */
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

/**
 * Parse a TapTap moment page's NUXT_DATA into structured data.
 * The dehydrated format is a flat array where objects reference other
 * entries by index. We walk the structure starting from the root.
 */
function parseMomentPage(html: string): ParsedMoment {
  const data = extractNuxtData(html);

  // Root structure: { data: 2 } → { <routeKey>: idx, ... }
  // The route map has multiple entries (sidebar data, moment data, etc.).
  // We need the one whose resolved value is a dict containing a 'moment' key.
  // The value may be a dict directly OR an array whose first element is a dict.
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

  // Moment ID
  const id = String(resolve(data, moment.id_str));

  // Topic (contains title, images, summary)
  const topic = data[moment.topic as number] as Record<string, unknown>;
  const title = String(resolve(data, topic.title));

  // Images array
  const imagesRef = topic.images as number;
  const imageRefs = data[imagesRef] as number[];
  const images: MomentImage[] = imageRefs
    .filter((ref) => ref !== -1)
    .map((ref) => {
      const img = data[ref] as Record<string, unknown>;
      const originalUrl = String(resolve(data, img.original_url));
      return { originalUrl };
    });

  // Rich text content blocks (from first_post.contents.json)
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
          // Paragraph or other text block
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

  // Related moments (from the page's related posts section)
  const relatedMoments: {
    id: string;
    title: string;
    authorName: string;
  }[] = [];

  // Scan the data array for moment-like objects with author info
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

/**
 * Get the first image URL from a team guide post.
 */
function extractTeamImage(moment: ParsedMoment): string | null {
  return moment.images[0]?.originalUrl ?? null;
}

/**
 * Find the image immediately after a heading in the rich text content.
 */
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
      // Next block should be an image
      if (next.type === 'image' && next.imageUrl) {
        return next.imageUrl;
      }
    }
  }
  return null;
}

/**
 * Find the latest moment ID matching a title pattern from the related posts
 * on a given moment page. Falls back to the seed ID if no newer match is found.
 */
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

  // Moment IDs are snowflake-style — higher = newer
  matches.sort((a, b) => (BigInt(b.id) - BigInt(a.id) > 0n ? 1 : -1));
  return matches[0]!.id;
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

async function fetchMomentHtml(momentId: string): Promise<string> {
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
 * Discover and fetch the latest infographics from ReTempest.
 *
 * Strategy:
 * 1. Fetch seed moment pages for each post type
 * 2. Check their related posts for newer posts matching the title patterns
 * 3. If a newer post is found, fetch that instead
 * 4. Extract the specific images we need from the final post
 */
async function fetchAllInfographics(): Promise<InfographicUrls> {
  const result: InfographicUrls = {
    team: null,
    v6TierList: null,
    v0TierList: null,
    teamMomentId: null,
    tierListMomentId: null,
  };

  // --- Team infographic ---
  try {
    const teamHtml = await fetchMomentHtml(SEED_MOMENTS.teamGuide);
    const teamMoment = parseMomentPage(teamHtml);

    // Check if there's a newer team guide in related posts
    const newerTeamId = findLatestMatchingMoment(
      teamMoment,
      TITLE_PATTERNS.teamGuide
    );
    const finalTeamMoment =
      newerTeamId && newerTeamId !== teamMoment.id
        ? parseMomentPage(await fetchMomentHtml(newerTeamId))
        : teamMoment;

    result.team = extractTeamImage(finalTeamMoment);
    result.teamMomentId = finalTeamMoment.id;
  } catch (err) {
    console.warn('[taptapScraper] Failed to fetch team infographic:', err);
  }

  // --- Tier list infographic ---
  try {
    const tierHtml = await fetchMomentHtml(SEED_MOMENTS.tierList);
    const tierMoment = parseMomentPage(tierHtml);

    // Check if there's a newer tier list in related posts
    const newerTierId = findLatestMatchingMoment(
      tierMoment,
      TITLE_PATTERNS.tierList
    );
    const finalTierMoment =
      newerTierId && newerTierId !== tierMoment.id
        ? parseMomentPage(await fetchMomentHtml(newerTierId))
        : tierMoment;

    result.v6TierList = extractImageAfterHeading(
      finalTierMoment,
      TIER_HEADINGS.v6
    );
    result.v0TierList = extractImageAfterHeading(
      finalTierMoment,
      TIER_HEADINGS.v0
    );
    result.tierListMomentId = finalTierMoment.id;
  } catch (err) {
    console.warn('[taptapScraper] Failed to fetch tier list infographic:', err);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the latest infographic URLs from ReTempest's TapTap.
 * Cached for CACHE_TTL_MS with single-flight and stale-on-error.
 */
export async function getInfographicUrls(): Promise<InfographicUrls> {
  if (cachedUrls && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedUrls;
  }
  if (inflight) {
    return inflight;
  }
  inflight = (async () => {
    try {
      const urls = await fetchAllInfographics();
      cachedUrls = urls;
      cachedAt = Date.now();
      console.log(
        `[taptapScraper] cached infographics — team: ${urls.teamMomentId}, tierList: ${urls.tierListMomentId}`
      );
      return urls;
    } catch (err) {
      if (cachedUrls) {
        console.warn('[taptapScraper] refresh failed; serving stale:', err);
        cachedAt = Date.now() - CACHE_TTL_MS + RETRY_MS;
        return cachedUrls;
      }
      throw err;
    }
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/** Preload the infographic cache at bot startup. */
export async function preloadInfographicCache(): Promise<void> {
  await getInfographicUrls();
}
