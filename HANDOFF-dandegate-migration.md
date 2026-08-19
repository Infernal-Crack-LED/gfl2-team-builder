# Handoff: migrating off dandegate.net

**Status: NOT STARTED. Do not execute this plan unless dandegate.net asks us to
change data source.** Everything below is a contingency worked out in advance so
the switch is a day of execution rather than a week of investigation.

Current state is unchanged: `src/sync/` still pulls from `api.dandegate.net`, and
`web/src/CreditsPage.tsx` credits dandegate.net, IOP Wiki (CC BY-SA 3.0) and the
GFL2 Info Sheet.

## Why this exists

Dandegate reached out about our use of their data. We reviewed their site and
found **no robots.txt or Terms restriction** on what we do — their robots.txt
allows `User-agent: *` and blocks only named AI-training crawlers, and their
`/terms-privacy` page has no anti-scraping, no-automated-access, or
commercial-use clause. They also explicitly disclaim ownership of the game data
("All game assets ... are the exclusive property of Sunborn Network Technologies
and MICA Team").

So this migration is **courtesy, not obligation**. Two things worth knowing
before any conversation with them:

- Their images are pixel-identical to IOP Wiki's for the overlapping icons, but
  that reflects **common origin** (both extract from the game client), not
  copying. Dandegate has 345 skill icons; IOP has 7. They run their own
  extraction pipeline — their filenames preserve raw Unity asset names
  (`Summon_Whole_NikketaSSR01Dog`).
- **The GFL2 Info Sheet credits "Dandegate team for help with data."** Switching
  to the sheet does not produce Dandegate-free data. There is no clean-room path;
  the whole GFL2 data community is one graph. Switching buys clearer licensing,
  not independence.

## Replacement sources

| Source                                                  | Access                                                           | License                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------- |
| **GFL2 Info Sheet** (official Discord spreadsheet team) | `1DogyU3K7ZXw2qbhP1EhRXIAw5nCyIV5G5e-QWviBZME`, gviz CSV per tab | none stated; community resource we already credit |
| **IOP Wiki**                                            | MediaWiki API (`iopwiki.com/api.php`), `Crawl-Delay: 20`         | **CC BY-SA 3.0** (attribution + share-alike)      |

We already have a working sheet importer: **`src/bin/import-recommendations.ts`**.
It solves the hard parts — gviz CSV by tab name, tab titles scraped from the edit
page (many carry a trailing space), a `looksLikeHomeTab()` guard against gviz
silently serving the first tab, fuzzy doll-name matching, and `--dry-run` /
`--doll` / `--force` flags. **Extend it; do not start over.**

## Per-dataset plan

| Dataset                                                                | Plan                       | Notes                                                                                                                                    |
| ---------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Dolls (64)                                                             | **Sheet**                  | 64 character tabs, exact roster match                                                                                                    |
| Base stats                                                             | **Sheet — gain**           | HP/ATK/DEF, `movement`, `stabilityGauge`. Dandegate never exposed HP/ATK/DEF at all                                                      |
| Skills                                                                 | **Sheet**                  | stability damage, cooldown, confectance, range, area, scaling arrays                                                                     |
| Vertebrae                                                              | **Sheet**                  | Vertebrae Upgrade 1–6                                                                                                                    |
| Fixed keys (384)                                                       | **Sheet**                  | exactly 64 dolls × 6                                                                                                                     |
| Common/Affinity/Expansion keys                                         | **Sheet**                  | present per-doll on the character tabs                                                                                                   |
| Weapons (185)                                                          | **Sheet — gain**           | Weapons tab has 187 (3★/4★/5★ ↔ Retired/Standard/Elite)                                                                                  |
| Summons                                                                | **Sheet**                  | present on character tabs                                                                                                                |
| Images                                                                 | **Sheet + IOP**            | sheet ships 1268 embedded PNGs; weapons at 1024×512 vs our 256×128. Only portraits are lower-res — take those from IOP (up to 2048×2048) |
| Effects                                                                | **Sheet + IOP, with gaps** | see below                                                                                                                                |
| `bio`                                                                  | **DROPPED**                | decision                                                                                                                                 |
| `remoldingPattern.statBoosts`                                          | **DROPPED**                | decision — no source found on sheet or IOP                                                                                               |
| Generic (non-doll-specific) keys                                       | **DROPPED**                | decision                                                                                                                                 |
| `artifact-recovery` effect tag                                         | **DROPPED**                | Confectus is a game mode we don't support                                                                                                |
| `rangeMap`, `cooldownLevel`, `stabilityDamageLevel`, `confectanceCost` | **DROP**                   | 0 usages in the codebase — verified                                                                                                      |
| `gunDataId`                                                            | **DROP**                   | appears only in schema/sync/type decl, never consumed                                                                                    |

### Derivations required

Three fields stop being copied and start being derived:

1. **`regionTag`** — the sheet's **Quick Links** tab tracks the latest EN release
   (currently **Sextans**, typo'd as "Sextants"). Everything ordered after it on
   the sheet is CN. `preview` follows from the same signal.
2. **Skill levels** (`descriptionLevel2/3/4`) — count the **Vertebrae Upgrades
   listed under each skill**: one upgrade → skill goes to Lv2, two → Lv3, etc.
3. **`effectTags`** — already derived by `src/derive/effectTags.ts` from details
   text; upstream tags are only a seed. See the caveats section.

## Known gap: 38 effects

`scratchpad/dandegate-sheet-effect-map.json` holds the finished analysis:

- **87 confirmed renames** (Dandegate name → sheet name). These are cross-TL
  differences, not missing data — e.g. `Rigor Sanguis` → `Coagulation`,
  `Antivirus Program` → `Kill Process`, `Priority Progress` → `Alpha Process`,
  `Convergence Resonance` → `Fitting Resonance`, `Extra Movement` →
  `Additional Movement`, `Stealth` → `Concealed`.
- **2 pseudo-effects** (`Hunter's Instinct`, `Justice`) — Dandegate container
  records that alias skills, not real in-game effects. Skip on import.
- **38 genuinely missing and referenced**, concentrated in Florence (3),
  Tololo (4), OTs-14 (6, where the sheet uses one umbrella `Cell Reconstruction`
  instead of enumerating variants), plus 21 shared effects with no exclusive doll.

Narrative and per-effect detail: `scratchpad/missing-effects-sheet-migration.md`.

Coverage lands at **~73% of 561 by exact name + confirmed rename**. The 38 close
by eyeball — roughly an hour with a side-by-side dump.

## The reconciliation matcher (the actual work)

**This is the piece that matters. A naive importer will silently corrupt data.**

Key on **normalized description, not name**. 87 effects have different names
across sources; a name-keyed sync creates 87 duplicate records and fails quietly
— duplicate rows, not an error.

Lessons paid for the hard way, in priority order:

1. **Scope candidates to the doll's own sheet tab.** Within ~7 effects, scoring
   discriminates cleanly. The identical matcher against the full 499-entry corpus
   produced **112 false positives** — generic short descriptions all share "10%".
   This single choice is the difference between reliable and useless.
2. **`JSON.parse(effectDetails)` fails on all 136 JSON records** with
   `Invalid control character` (raw newlines). Use `strict: false` (or the
   `mainDetails` regex fallback that `normalizeDetails()` already has). A silent
   `catch` here means you're matching JSON-with-UUIDs against prose.
3. **Resolve `[effect:UUID]`, `[dollSkill:UUID]`, `[summon:UUID]` placeholders**
   to names first — 157 of 566 effects contain them.
4. **Iterate to a fixpoint.** Resolving `[effect:X]` needs the mapping you're
   computing (`Priority Progress` only matches `Alpha Process` once you know
   `Antivirus Program` = `Kill Process`).
5. **Stem tokens.** `skill`/`skills` and `attack`/`attacks` blocked
   `Regression` → `Retrograde`, which scores 1.00 once stemmed.
6. **Apply a synonym table.** The corpora systematically differ:
   `cleansed`↔`dispelled` (Dandegate 315/8, sheet 82/114 — near-inverted),
   `stat values`↔`attribute values`, `ally`↔`unit`, `fatal`↔`lethal`,
   `personal mark`↔`exclusive mark`.
7. **Use containment (`|A∩B|/min|A|,|B|`), not Jaccard** — sheet entries bundle
   extra detail, so union inflates and Jaccard collapses under full containment.
   Keep a margin check; containment alone produced a false positive
   (`Joint Immortality` → `Flawless Blaze` instead of `Symbiotic Dance`).
8. **Suppress boilerplate attractors** — any candidate winning for 3+ different
   queries (`Sleep Aid Kit`, `Penetrating Seal`, `Aid Accord`, `Damage Reduction I`)
   is matching templated text, not the effect.
9. **Guard roman-numeral tiers** so `Damage Reduction II` can't absorb `III`.
10. **Skip effects whose body contains `[dollSkill:`** — internal aliases that
    would import as phantom records.

Also to rebuild: `effect-matrix.json`'s `sources` cross-links (`kind`/`relation`/
`snippet`). The sheet gives doll↔effect association for free via the per-doll
Effects block, but key/skill↔effect with a relation must be re-extracted from
skill and key prose.

## effectTags caveats

Measured by substituting sheet text and stripping upstream tags, over the 352
effects with a sheet counterpart:

- tagged today: **312/352 (89%)** → post-migration: **301/352 (86%)**
- **identical tag sets: only 58%** — churn in both directions, not one-way loss

The rules are tuned to Dandegate's vocabulary. Budget **half a day** to make the
~28 rules in `src/derive/effectTags.ts` vocabulary-agnostic, validated by
re-running `npm run derive` against sheet-substituted text.

Three known defects in that file (all latent today — upstream tags mask them;
**verified zero effect on current Dandegate-sourced output**, which is why the
fix was not applied):

- `CONSIDERED_BUFF_RE` / `CONSIDERED_DEBUFF_RE` / `consideredElement()` require
  `considered (?:a|an)` and therefore never match **"considered _as a_ buff"**.
  Costs ~30 buff / ~16 debuff / ~27 element tags on sheet text. Fix:

  ```js
  /\bconsidered\s+(?:as\s+)?(?:a|an)\b[^.\n]*\bbuff\b|\bthis buff\b/i;
  ```

  and the same `\\s+(?:as\\s+)?` insertion in `consideredElement()`.

- `physical` and `weakness` are **upstream-only with no text fallback** — they go
  to zero without Dandegate. 9 effects. `physical` has no lexical signal in
  either corpus (physical is the unmarked default); `weakness` is recoverable
  from phrasing like "Inflicts Corrosion weakness".
- `artifact-recovery` tests `/\bconfectus\b/` but both corpora say
  **"Confectance"** — 0 occurrences of "Confectus" in the sheet. Moot; dropping.

## Effort estimate

| Task                                                                | Estimate |
| ------------------------------------------------------------------- | -------- |
| Extend sheet importer for dolls/stats/skills/vertebrae/keys/weapons | 1–2 days |
| Reconciliation matcher (per the lessons above)                      | 1 day    |
| IOP fetch path (portraits, and anything else kept)                  | half day |
| `regionTag`/`preview` + skill-level derivations                     | half day |
| effectTags rule pass                                                | half day |
| Backfill/triage the 38 effects                                      | 1 hour   |
| Rebuild effect-matrix `sources` extraction                          | 1 day    |

Roughly **a week**. Not a blocker, but not a repoint-the-URL change either.

## What NOT to do

- **Don't key reconciliation on effect names.** See above.
- **Don't run the matcher against the global effect corpus.** Doll-scope it.
- **Don't datamine the game client.** Assets are encrypted; decryption is DMCA
  §1201 territory and a materially worse legal position than anything we're
  doing now. The published dumps are all stale (Dimbreath archived 2021,
  PotRooms 2024-12). The sheet already has what a datamine would give us.
- **Don't drop the IOP Wiki attribution.** CC BY-SA requires it, and we're
  already compliant on the credits page.
- **Don't assume this removes Dandegate from the lineage** — the sheet credits
  their team. Worth saying plainly to them if it comes up.

## Reference artifacts

- `scratchpad/dandegate-sheet-effect-map.json` — 87 renames, 2 pseudo-effects, 38 gaps
- `scratchpad/missing-effects-sheet-migration.md` — narrative + per-effect detail
- `investigation-dandegate-sync.md` — the original Dandegate API investigation
- Sheet contact: **Dr.Brom** on the official Discord (per the sheet's Home tab)
