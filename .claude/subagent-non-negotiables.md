# Subagent non-negotiables (paste at the top of EVERY subagent prompt)

A compact hard-rules header so a subagent can't violate a rule it never saw. The orchestrator
prepends this (or points to it) in every spawn — `scripts/gates/dispatch-*.sh` do it automatically;
the parent verifies its own PREMISES before spawning (a wrong premise poisons every downstream agent).

## NON-NEGOTIABLES

1. **THE CONVENTIONS ARE LOAD-BEARING.** `docs/frontend-conventions.md` is binding, not style
   preference: React 18 hooks-only components; ALL styling in the single `web/src/styles.css`;
   path-based SPA routing through `web/src/router.ts` (`hrefFor` / `onSpaLinkClick` / `navigate`) —
   never React Router, never hash routes; game data imported at build time from `data/*.json`; pages
   as `lazy()` route chunks. A change that breaks one of these is a P0 — flag it plainly rather than
   reasoning around it.
2. **`data/*.json` IS GENERATED, NEVER HAND-EDITED.** Those files are the committed output of
   `npm run sync` (dandegate → Postgres → export) plus `npm run derive`. A diff that edits them by
   hand is wrong even when the value is right: the next sync silently reverts it. The one sanctioned
   exception is code-maintained data that the source doesn't carry (`src/share/genericKeys.ts`).
3. **READ THE CODE, NOT THE INTENT.** Trace the actual control flow — boundaries, error paths,
   empty/first/last cases. Off-by-ones, inverted conditions, swallowed errors and wrong-variable-paste
   all survive a skim and all look correct if you pattern-match instead of reading.
4. **WHOLE-PICTURE.** Sanity-check every claim against the rest of the system — the other callers,
   the shared build codec (`src/share/buildCode.ts`, used by the site AND the bot AND the
   infographics renderers), the CSS class the markup actually resolves to, what the tests exercise.
   A locally-plausible reading that contradicts something already known is WRONG — surface the
   contradiction, don't pass it along.
5. **PROVE-IT-DIFFERENTLY — and know when you are DONE.** Before asserting a load-bearing claim, ask
   whether you could establish it by an INDEPENDENT method. If not, label it a HYPOTHESIS, not a fact.
   **⇒ AND CONVERSELY:** an existing artifact in this repo — a `*.test.ts` under `web/src` or `src/`,
   `npm run typecheck`, the Playwright pass in `npm run smoke:ui` — **IS an independent method**. When
   such a check exists and passes, the bar is **MET** — say so and STOP. "A further check is
   conceivable" is never a reason to keep going. Over-validation is a real, expensive failure mode,
   not a safe default.
6. **NEVER LEAK SECRETS.** `DATABASE_URL`, `OAUTH_CLIENT_SECRET`, `SESSION_SECRET`, `DISCORD_TOKEN`
   and friends live in env vars. Never print a real value, never paste one into a packet, never
   commit one. New env vars go in `.env.example`.
7. **TREAD LIGHTLY ON THE TREE.** Review roles are **findings-only**: never edit, never commit, never
   run anything that mutates state (no `npm run sync`, no `db:push` / `db:migrate`, no
   `bot:deploy-commands`, no writes to the DB, no `npm run icons`). Read-only checks — `npm test`,
   `npm run typecheck`, `npm run lint`, `git diff` — are fine, and running one beats suspecting
   quietly. Leave no scratch behind outside `scratchpad/`.
8. **RETURN STRUCTURED.** End with a tight findings block (result + confidence + "what I verified"),
   not a prose essay — and when the role specifies a JSON contract, return ONLY that JSON object, no
   fences and no commentary. The orchestrator has to cross-check you fast without a context flood.
9. **REUSE BEFORE YOU DERIVE.** Before writing a new helper, component, or lookup, search for the
   existing one (`web/src/components/`, `web/src/data.ts`, `src/share/`). Reimplementing something
   the repo already has is itself a finding.
10. **STAY IN SCOPE.** Answer the question you were sent to answer. A finding outside your scope is
    REPORTED, never acted on — do not expand into a rewrite, a re-plan, or a neighbouring subsystem.
    If the scope looks wrong, say so in the findings block and stop; the orchestrator decides.
