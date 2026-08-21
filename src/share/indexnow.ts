/**
 * IndexNow — the open "this URL changed" protocol.
 *
 * WHO LISTENS: Bing, Yandex, Naver and Seznam. NOT Google, which has never
 * adopted it and still schedules its own crawling; the only sanctioned nudge
 * there is Search Console's URL Inspection, and the Indexing API is restricted
 * to JobPosting and BroadcastEvent pages regardless of what the SEO blogs say.
 *
 * WHY IT IS WORTH IT HERE ANYWAY: Bing does not execute JavaScript, so it is
 * the engine that gains most from the server-rendered crawl bodies — and it is
 * the one that has to be told to come and look. The site's doll, weapon and key
 * pages change their text on every `seed:datamine`, which is precisely the
 * update-notification case the protocol exists for.
 *
 * THE KEY IS NOT A SECRET. It is published at `/<key>.txt` on this origin, and
 * that is the whole verification mechanism: submitting URLs for a host proves
 * nothing unless the host serves the matching key. So it is committed, and the
 * key file is a real static asset rather than something injected at deploy.
 */

/** 8–128 hex characters. Rotating it means replacing the public key file too. */
export const INDEXNOW_KEY = '5ac32f20c2ff900a967d801892094876';

export const INDEXNOW_KEY_FILE = `${INDEXNOW_KEY}.txt`;

/** The shared endpoint; participating engines forward between themselves. */
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

/** One submission may carry at most this many URLs. */
export const INDEXNOW_MAX_URLS = 10_000;

export interface IndexNowPayload {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}

/**
 * Build the submission body for a set of absolute URLs on `site`.
 *
 * Throws on a URL that is not on `site`: IndexNow rejects a mixed-host batch
 * outright (422), and a silently dropped URL would be one this site thinks it
 * announced and never did.
 */
export function indexNowPayload(site: string, urls: string[]): IndexNowPayload {
  const origin = new URL(site).origin;
  const host = new URL(site).host;

  const seen = new Set<string>();
  for (const url of urls) {
    if (!url.startsWith(`${origin}/`) && url !== origin) {
      throw new Error(`IndexNow: ${url} is not on ${origin}`);
    }
    seen.add(url);
  }
  if (seen.size > INDEXNOW_MAX_URLS) {
    throw new Error(
      `IndexNow: ${seen.size} URLs exceeds the ${INDEXNOW_MAX_URLS} per-request cap`
    );
  }

  return {
    host,
    key: INDEXNOW_KEY,
    keyLocation: `${origin}/${INDEXNOW_KEY_FILE}`,
    urlList: [...seen],
  };
}

/**
 * How to read the endpoint's answer. 202 is a success: it means the batch was
 * accepted while the key is still being fetched and validated, which is what a
 * first submission from a new key file gets.
 */
export function describeIndexNowStatus(status: number): {
  ok: boolean;
  message: string;
} {
  switch (status) {
    case 200:
      return { ok: true, message: 'accepted' };
    case 202:
      return { ok: true, message: 'accepted — key validation pending' };
    case 400:
      return { ok: false, message: 'bad request (malformed payload)' };
    case 403:
      return {
        ok: false,
        message: `key not valid — is ${INDEXNOW_KEY_FILE} deployed and served as text/plain?`,
      };
    case 422:
      return { ok: false, message: 'a URL does not belong to the host' };
    case 429:
      return { ok: false, message: 'rate limited — try again later' };
    default:
      return { ok: false, message: `unexpected status ${status}` };
  }
}
