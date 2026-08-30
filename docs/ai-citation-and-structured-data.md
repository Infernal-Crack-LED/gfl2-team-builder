# Structured data and AI citation — a proposal

**Status: not implemented.** This is a written-up option, not a plan of record.
Nothing here is committed beyond this file.

The question behind it: what else can the site do to be a source that Google's
AI Overviews / AI Mode draws on and cites?

---

## First, what AI Mode is not

There is no separate index and no opt-in. **AI Overviews and AI Mode are
grounded in Google's ordinary search index** — the same crawl, the same ranking
signals, the same pages. A page that does not rank is not a candidate to be
cited.

Two things that get conflated with this, both of which the site already handles:

- **`Google-Extended`** in `robots.txt` governs whether content may be used to
  train Gemini. It does **not** control AI Overview inclusion, which uses
  ordinary Googlebot. The site allows both.
- **`llms.txt`** is read by some answer engines as a prose description of the
  site. Useful, already written, and unrelated to Google specifically.

So the bulk of the work that makes the site AI-citable is work that was already
done for ordinary SEO: server-rendered content, indexable URLs, honest metadata.
There is no separate channel to open.

What is left is narrower: making a page easy to **extract a specific answer
from**, and making the site's nature as a primary data source legible to a
machine rather than only to a reader.

---

## What the site already has

|                                                     |                                                                |
| --------------------------------------------------- | -------------------------------------------------------------- |
| Server-rendered bodies on every indexable page      | ✅ — the whole crawl surface, no JS required                   |
| Doll pages carry the community build recommendation | ✅ — weapons, keys, attachments, investment path               |
| `robots.txt` allows every AI crawler by name        | ✅ — GPTBot, ClaudeBot, PerplexityBot, CCBot, Google-Extended… |
| `llms.txt`                                          | ✅ — hand-written, describes the site as prose                 |
| Per-URL title / description / canonical             | ✅                                                             |
| `BreadcrumbList` JSON-LD                            | ✅ — server-side                                               |
| Per-entity structured data                          | ❌ — see gap 1                                                 |
| `Dataset` markup for the published JSON             | ❌ — see gap 2                                                 |

---

## Gap 1 — structured data is nearly empty, and one piece is invisible

Measured against the live site:

```
/characters/tololo          → WebApplication (the global one), BreadcrumbList
/characters/class/sentinel  → BreadcrumbList, ListItem ×3
```

A doll page says nothing machine-readable about the doll. A facet page says
nothing about being a collection.

**The facet case is a bug, not just an omission.** `FacetPage.tsx` does emit a
`CollectionPage` with its members — but from a `useEffect`, so it exists only
after React boots. That makes it invisible to exactly the crawlers the no-JS
bodies were written for. It is the same class of mistake as the original
empty-`<body>` problem, in a corner that got missed.

Why per-entity markup matters here specifically: for a question like _"what
weapon should Tololo use"_, an entity with named properties is far easier to
extract and attribute than the same facts inferred from prose. It does not make
the page rank; it makes the page's contents unambiguous once it does.

### What it would involve

- Move the facet `CollectionPage` into the server body, beside the breadcrumb
  (`src/server/pageMeta.ts` already has `injectBreadcrumbLd`, so there is a
  place for it)
- Add a per-doll and per-weapon entity to the server-injected head
- Keep it strictly to what the page actually shows — see "Risks" below

---

## Gap 2 — the site is a dataset publisher and never says so in machine-readable form

This is the most distinctive option, and the one nothing else in the niche does.

`schema.org/Dataset` exists precisely for what this repo already offers: the
committed JSON artifacts, free to copy, refreshed each patch. It feeds **Google
Dataset Search**, and it makes the "free GFL2 data, no permission needed" pitch
legible to a machine rather than only to a human reading the README.

It also reinforces the thing that makes the site worth citing at all: it is a
**primary source**, not a page summarising someone else's.

### What it would involve

`Dataset` markup on `/credits` (or a small dedicated `/data` page) with:

- `distribution` entries pointing at each committed JSON file
- `license` — matching the actual terms, including the two carve-outs
  (`recommendations-source.json`, `gfl2-icons/`) that are **not** freely reusable
- `creator`, and `temporalCoverage` / `dateModified` from `syncedAt`

The carve-outs matter. Declaring a blanket licence over data the project does
not own would be both wrong and self-defeating for a site whose whole position
is being the accurate, honest source.

---

## Gap 3 — the answer is not in an extractable span

The recommendation panel is structured as headings and lists. That reads well
and is correct, but passage retrieval favours a contiguous sentence.

A single generated lead line per doll page would give an AI a clean span to lift:

> The GFL2 Info Sheet recommends Planeta, Guerno or Golden Melody for Tololo,
> with Phase Strike attachments and ATK% > ATK > CRIT% > CRIT DMG% substats.

Built from the same hydrated data as the panel — no new writing, no new source
of truth, and it carries the attribution inline.

---

## Proposed shape, if it goes ahead

One branch, three commits:

1. **Move the facet `CollectionPage` JSON-LD server-side.** Fixes a real bug;
   smallest and most clearly correct of the three.
2. **Per-entity structured data** on doll and weapon pages, server-rendered.
3. **`Dataset` markup** for the published JSON, with accurate licensing.

Gap 3 could ride along with (2) or be dropped — it is the most speculative.

---

## Risks and limits

**Structured data that overstates a page is a manual-action risk.** Markup must
describe what is actually on the page. For a site whose position is being the
accurate primary source, getting caught inflating markup would cost more than
the markup gains.

**This is a multiplier, not a substitute.** AI Overviews draw mostly from
results that already rank. Structured data helps Google understand a page it has
already decided to consider; it does not get an unranked page considered. The
determinants of whether the site is in the candidate set at all remain
inbound links and time.

**Expected effect is modest and hard to attribute.** There is no report that
says "you were cited because of your JSON-LD". Treat this as tidying up a real
omission — the facet bug especially — rather than as a growth lever.

---

## Related, and currently stale

`docs/seo-operations.md` predates this session's work and now contains checks
that would fail and at least one "deliberate decision" that has since been
reversed:

- expects **325** sitemap URLs (now 344, with the 17 facet pages)
- expects the doll title `Alva — GFL2 Doll Kit & Stats` (now
  `Alva Build — GFL2 Weapons, Keys & Kit`)
- §4 recommends `npm run sync` (retired; use `npm run seed:datamine`)
- §5 lists "**No `lastmod`/`changefreq` in the sitemap**" as a deliberate
  decision — `lastmod` was since added on purpose, sourced from `syncedAt` and
  applied only to data-derived URLs. Left as-is, that line invites someone to
  remove it.
- §2 says IndexNow is "not wired up" — it is now (`npm run indexnow`)

That doc should be refreshed whether or not any of the above goes ahead.
