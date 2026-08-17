# SEO operations — the manual steps

> **Class: OPERATIONAL.** Everything an agent or CI can do is already done and
> lives in code ([scaffolding-plan.md §12](scaffolding-plan.md) describes the
> per-URL embed system). This doc is only the parts that need **you** — a
> dashboard login, a DNS record, a human eyeball on an unfurl.
>
> Deploy/infra steps (Railway, Cloudflare DNS, Umami env vars) live in
> [deployment-guide.md](deployment-guide.md); §7 there points here.
>
> Canonical host: `https://refittingroom.app` (one constant, `SITE` in
> `src/share/pageMeta.ts`).

---

## 0. Pre-flight — verify the deploy before submitting anything anywhere

Do this FIRST. Submitting a sitemap for a site whose server injection didn't
ship just teaches Google the wrong thing, and re-crawls are slow. Every check
is one command against production; each expected value is what the code
guarantees.

```bash
SITE=https://refittingroom.app

# 1. The three crawl files exist and are the generated versions
curl -s $SITE/robots.txt | tail -3           # ends with the Sitemap: line
curl -s $SITE/sitemap.xml | grep -c "<url>"  # expect 325 (grows with each sync)
curl -s $SITE/llms.txt | head -1             # "# Refitting Room"

# 2. A doll page carries ITS OWN title/canonical/portrait embed image
curl -s $SITE/characters/alva \
  | grep -E "<title>|rel=\"canonical\"|og:image|twitter:card"
#   → <title>Alva — GFL2 Doll Kit &amp; Stats</title>
#   → canonical .../characters/alva
#   → og:image .../game-assets/dolls/<hash>.webp   (NOT og.png)
#   → twitter:card = summary                       (portrait, not a 1200x630 banner)

# 3. The no-JS body is really in the HTML (this is what a JS-less crawler indexes)
curl -s $SITE/characters | grep -c 'href="/characters/'   # expect 64+
curl -s $SITE/characters/alva | grep -o 'unit-skill-desc' | head -1

# 4. Unknown URLs are HARD 404s, not soft-200 shells
curl -o /dev/null -s -w '%{http_code}\n' $SITE/nope                    # 404
curl -o /dev/null -s -w '%{http_code}\n' $SITE/characters/not-a-doll   # 404

# 5. Non-canonical spellings 301 to the canonical URL
for p in /teambuilder /index.html /characters/ /Characters; do
  curl -o /dev/null -s -w "$p → %{http_code} %{redirect_url}\n" $SITE$p
done

# 6. Static assets revalidate cheaply (304), hashed bundles are immutable
ETAG=$(curl -sI $SITE/og.png | tr -d '\r' | awk '/[Ee]tag/{print $2}')
curl -o /dev/null -s -w 'revalidated: %{http_code}\n' -H "If-None-Match: $ETAG" $SITE/og.png  # 304
```

If any of these disagree, stop and fix the deploy — the rest of this doc is
downstream of them.

**Cloudflare caveats** (the proxy sits in front of all of this):

- Leave **Rocket Loader off** and **Auto Minify off** for HTML. Both rewrite
  markup, and the injected `<head>` tags are the product here.
- Don't add a page rule that caches HTML. The per-URL HTML is `no-cache` by
  design — it's built per request and varies by URL and share query.
- Don't add a trailing-slash or lowercase redirect rule at the edge. The origin
  already 301s those (idempotently); two layers doing it invites a loop.

---

## 1. Google Search Console

1. **Add the property** at <https://search.google.com/search-console> — choose
   the **Domain** property (`refittingroom.app`), not the URL-prefix one, so
   `www`/`http` variants are covered by one property.
2. **Verify** with the DNS TXT record it gives you (Cloudflare → DNS → Add
   record). Verification can take a few minutes to propagate.
3. **Submit the sitemap**: Sitemaps → enter `sitemap.xml` → Submit. Expect
   "Success" and a discovered-URL count matching the `<url>` count from §0.
4. **URL Inspection on a doll page** (`/characters/alva`) → _Test live URL_ →
   **View tested page → HTML**. Confirm you can see the doll's name, its skill
   text, and `<title>Alva — …</title>` in the _raw_ HTML. This is the single
   check that proves the whole system works from Google's side: if the raw HTML
   is an empty `#root`, the server injection isn't running.
5. **Request indexing** for the hubs, once each: `/`, `/characters`, `/weapons`,
   `/keys`, `/team-builder`. Don't bother doing this for all 325 URLs — the
   sitemap plus the crawlable grids handle the rest.

### Reports to watch, and what "normal" looks like here

| Report / status                               | Expectation                                                                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Soft 404**                                  | **Zero.** Unknown paths return a real 404 now. Any entry here is a regression — check `resolvePage`.                                 |
| **Alternate page with proper canonical**      | Expected and fine for share URLs (`?b=`, `?id=`) — their canonical points at the clean URL, which is the whole point.                |
| **Crawled — currently not indexed**           | Normal for a chunk of the 185 weapon pages early on; thin-but-real pages queue for a while. Not an error to chase.                   |
| **Duplicate without user-selected canonical** | Should be zero. If it appears, two URLs are serving the same content without a canonical — that's a `resolvePage`/redirect bug.      |
| **Enhancements → Breadcrumbs**                | Should populate within a few weeks (server-injected `BreadcrumbList`). Zero items after a month = the JSON-LD isn't reaching Google. |
| **Page indexing → Excluded by 'noindex'**     | Expect exactly `/saved` (and any future `NOINDEX_KEYS` entry). Anything else is a mistake.                                           |

6. **Rich Results Test** (<https://search.google.com/test/rich-results>) on
   `/characters/alva`: the `BreadcrumbList` must be detected. Note the
   `WebPage`/`CollectionPage`/`WebApplication` blocks are client-rendered —
   Googlebot executes JS so it sees them, but simpler crawlers won't. Only the
   breadcrumb is server-side today.

---

## 2. Bing (and everything downstream of it)

1. <https://www.bing.com/webmasters> → **Import from Google Search Console**
   (carries over verification and the sitemap in one step). Otherwise verify by
   DNS and submit `https://refittingroom.app/sitemap.xml` manually.
2. Bing's index also feeds DuckDuckGo and ChatGPT's web search, so this is worth
   the five minutes.
3. Optional: **IndexNow** for instant push on new dolls. Not wired up — if you
   want it, it's an API key file at the site root plus one POST per changed URL;
   file it as a follow-up rather than doing it by hand.

---

## 3. Social + chat embeds — check by eye, once

Nothing to submit; these crawlers read the page on demand. Paste each URL and
look at the unfurl:

| URL                        | Expected embed                                                     |
| -------------------------- | ------------------------------------------------------------------ |
| `/` or `/team-builder`     | 1200×630 `og.png` banner, site title/description                   |
| `/characters/alva`         | "Alva — GFL2 Doll Kit & Stats" + her **portrait** as a small thumb |
| `/weapons/6p33`            | "6P33 — GFL2 Weapon Stats & Trait" + the weapon art                |
| `/builder/<slug>?b=<code>` | The **rendered build card** (share meta wins over the page image)  |
| `/team-builder?b=<code>`   | The rendered squad card                                            |

Where to check:

- **Discord** — paste into any private channel. This is the highest-traffic
  unfurl for this project, so check it first. Discord caches aggressively by
  URL: if you fix an embed, test with a fresh URL (add `?x=1`) rather than
  waiting on its cache.
- **Facebook Sharing Debugger** — <https://developers.facebook.com/tools/debug/>
  ("Scrape Again" forces a refresh; the only validator with a working cache
  buster).
- **LinkedIn Post Inspector** — <https://www.linkedin.com/post-inspector/>.
- **X/Twitter** — the standalone Card Validator is retired; draft a post and
  look at the preview.
- **Slack** — paste in a DM to yourself.

---

## 4. After every data sync — the recurring loop

`npm run sync` adds dolls/weapons, which adds pages. Three commands, then commit:

```bash
npm run sync        # rewrites data/*.json
npm run icons       # mirrors new art → new pages get a real embed image, not og.png
npm run sitemap     # regenerates web/public/sitemap.xml (also runs inside vite:build)
npm test            # the sitemap drift test fails if you skip the line above
```

Commit `data/*.json` **and** `web/public/sitemap.xml` together. No resubmission
in Search Console is needed — Google re-reads the sitemap on its own schedule;
the submission from §1 is one-time. If a new doll is time-sensitive (a release
day), URL-Inspect that one page and hit _Request indexing_.

Also worth doing on a release day: add the new doll to `web/public/llms.txt` if
it changes what the site covers. That file is hand-written on purpose — it is a
description of the site, not a generated index, and answer engines read it as
prose.

---

## 5. Deliberate decisions, so nobody "fixes" them later

- **No `lastmod`/`changefreq` in the sitemap.** Google ignores `changefreq` and
  distrusts `lastmod` unless it is truthful per-URL; we have no per-entity
  modification date worth publishing. `priority` alone is enough.
- **`/saved` is `noindex, follow`** — it renders one visitor's own saved builds
  behind a Discord session. It is also the one route deliberately absent from
  the sitemap.
- **Share URLs (`?b=`, `?id=`) are crawlable on purpose.** robots.txt allows
  them so crawlers can read the `<link rel="canonical">` that consolidates them
  onto the clean URL. Blocking them would strand that signal.
- **Doll/weapon embed images are portrait tiles, not banners** — so those pages
  set `twitter:card: summary` and drop `og:image:width/height`. Replacing them
  with rendered 1200×630 cards is a filed follow-up
  ([scaffolding-plan.md §Phase 2.1](scaffolding-plan.md)).
- **`llms.txt` has no submission mechanism.** It is discovered by crawl. Don't
  go looking for a dashboard.

---

## 6. Troubleshooting

| Symptom                                                 | Likely cause                                                                                   | Check                                                                         |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Every URL unfurls as the home page                      | Server injection not running — traffic is being served by something other than the Hono server | `curl -s $SITE/characters/alva \| grep "<title>"`                             |
| Doll page unfurls with `og.png` instead of the portrait | The mirrored art file is missing for that doll (the code degrades on purpose)                  | `npm run icons`, redeploy; `ls web/public/game-assets/dolls \| wc -l`         |
| GSC reports soft 404s                                   | A route the client accepts but `resolvePage` doesn't 200 — or vice versa                       | `src/server/pageMeta.ts` `resolvePage` vs `web/src/router.ts` `routeFromPath` |
| Sitemap "couldn't fetch"                                | Submitted before the deploy landed, or Cloudflare returned an error page                       | `curl -I $SITE/sitemap.xml`                                                   |
| Sitemap URL count is stale                              | `npm run sitemap` wasn't run after a sync                                                      | `npm test` — the drift test fails loudly                                      |
| Breadcrumbs never appear in GSC                         | The `BreadcrumbList` block isn't in the served HTML                                            | `curl -s $SITE/characters/alva \| grep BreadcrumbList`                        |
| Embed changed but Discord shows the old one             | Discord's per-URL cache                                                                        | Test with `?x=1` appended                                                     |
