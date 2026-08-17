---
name: code-review
description: Cross-family POST-OP code review — the diff gets reviewed by a DIFFERENT model family than the one that wrote it, before commit/merge. Claude-authored code → kimi-code/k3 via scripts/gates/dispatch-kimi.sh or qwen3.7-max via scripts/gates/dispatch-qwen.sh; Kimi/Qwen-authored code → claude-opus-5 via scripts/gates/dispatch-claude.sh. Invoke ONLY when the owner explicitly requests it (typically for higher-risk changes, after `npm test` / `npm run typecheck` / `npm run lint` are green) — never automatically.
---

# code-review — the author never reviews their own diff

Post-op code review, ported from nikke-sim's cross-family protocol. The rule is one sentence:
**the reviewer is always a different model family than the author**, because same-family review
shares the author's priors and re-derives the same reasoning instead of reading the code.

**Scope:** ordinary engineering changes — new pages/components, data-pipeline changes, refactors,
fixes. Trivial edits (typos, one-liners, a doc tweak) may skip.

## Routing (reviewer = opposite family of the AUTHOR)

The author is whoever wrote the code — normally you, the driver.

| Author / driver       | Reviewer                        | Bridge                                                                                 |
| --------------------- | ------------------------------- | -------------------------------------------------------------------------------------- |
| **Claude** (any tier) | `kimi-code/k3` or `qwen3.7-max` | `bash scripts/gates/dispatch-kimi.sh` / `dispatch-qwen.sh <packet> <model> <out.json>` |
| **Kimi** or **Qwen**  | `claude-opus-5`                 | `bash scripts/gates/dispatch-claude.sh <packet> claude-opus-5 <out.json>`              |

- **Model names are literal, not aliases.** The bridges pass the string straight to the target CLI:
  `claude-opus-4-8` is NOT `claude-opus-5`; `kimi-code/kimi-for-coding` is NOT `kimi-code/k3`;
  `qwen3.7-max` is NOT `qwen3.8-max-preview`. Qwen names are the provider ids in
  `~/.qwen/settings.json`. The bridge injects the `model` field into the result JSON; an
  off-protocol `model` voids the review — re-dispatch. Change the canonical names by editing THIS
  file only.
- **Which of the two non-Claude reviewers** — either satisfies the cross-family rule; the owner may
  name one (they have, e.g. "point it at qwen3.7-max"), and an explicit choice always wins. Running
  BOTH is the elevated option for a high-stakes diff: two families that must converge.
- The role body lives in `.claude/agents/code-review.md` (pinned to Opus). The packet = role body +
  materials; the bridges prepend `.claude/subagent-non-negotiables.md` themselves.
- All three bridges auto-detect the `# code-review` packet heading and run the reviewer SIGHTED with
  read-only repo access — Kimi via the `scripts/gates/kimi-code-review-agent.md` profile, Claude via
  `--allowedTools "Read,Grep,Glob,Bash"`, Qwen via `--approval-mode default` (headless: reads need no
  confirmation, writes/shell can't be confirmed and are auto-denied). Detection wins over a stale
  `KIMI_AGENT_FILE`, so a code review can never be forced back onto a blind profile.
- **Fallback (label it):** if the cross-family bridge is genuinely unavailable, run
  `Agent(subagent_type:'code-review')` natively and mark the review **"same-family only"** — weaker
  evidence, visible to the owner. Never silently substitute.

## Procedure

1. **Gate order.** Run the cheap local gates first — `npm test`, `npm run typecheck`,
   `npm run lint` green, and `npm run smoke:ui` for a front-end diff. Do not spend a cross-family
   dispatch on code that fails locally.
2. **Build the packet** at `scratchpad/code-review/<date>-<topic>/review-packet.md`:
   - the FULL role body of `.claude/agents/code-review.md` (minus its frontmatter), then
   - `## INTENT` — 2–4 sentences: what the change does and why, in plain terms,
   - `## DIFF` — the full `git diff` (uncommitted work, or `<base>..HEAD` for a range),
   - `## CONTEXT` — only the anchors the reviewer cannot derive from the diff. The reviewer is
     sighted with READ-ONLY repo access, so you need not paste surrounding code — but NAME the
     callers and anchors worth checking when the diff touches a shared interface (`src/share/`,
     `web/src/data.ts`, `web/src/router.ts`, `web/src/styles.css` classes used by more than one
     page), and say which gates you ran and what they do NOT cover.
   - **Keep the packet lean.** The lever on runtime is packet SIZE, not the timeout. EXCLUDE
     regenerated artifacts from the pasted diff
     (`git diff <base>..HEAD -- . ':(exclude)data/*.json'`) and instead NAME them in `## CONTEXT`
     with the command that regenerates them — the reviewer can open them itself, and hundreds of
     lines of mechanical JSON buy nothing but latency.
3. **Dispatch** per the routing table. A real review takes **2–15 minutes** and scales with packet
   size; a 60s abort manufactures a fake timeout and pushes you to the weaker same-family fallback,
   so suspect impatience before suspecting the bridge. **How you launch it depends on whether the
   session is headless — check FIRST:**

   ```bash
   echo $CLAUDE_CODE_ENTRYPOINT   # sdk-cli (or any non-interactive entrypoint) …
   tty                            # … plus "not a tty"  ⇒ HEADLESS
   ```

   - **Interactive session:** a foreground `Bash` call with `timeout: 600000` (10 min — the tool's
     MAXIMUM, not a target you can raise). If the review needs longer, use the headless pattern.
   - **HEADLESS session — launch DETACHED, then poll.** Do NOT rely on `run_in_background` or on the
     auto-background that fires when a foreground call exceeds its timeout: in headless mode the
     harness can kill backgrounded shells silently, leaving an empty output file and a state
     indistinguishable from "still running". Put the dispatch outside the agent's process group:

     ```python
     # python3 - <<'PY'   — NOT `nohup setsid …`: setsid is a Linux binary that does not exist on
     # macOS. start_new_session=True calls the setsid(2) SYSCALL, which macOS does have.
     import subprocess, pathlib
     d = pathlib.Path('<abs-gate-dir>')
     log = open(d/'dispatch.log', 'wb')
     p = subprocess.Popen(
         ['bash', '<abs-repo>/scripts/gates/dispatch-qwen.sh',
          str(d/'review-packet.md'), 'qwen3.7-max', str(d/'result.json')],
         stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
         start_new_session=True, cwd='<abs-repo>')
     (d/'dispatch.pid').write_text(str(p.pid))
     PY
     ```

     Then poll with short foreground calls (each returns in milliseconds):

     ```bash
     kill -0 $(cat <gate-dir>/dispatch.pid) 2>/dev/null && echo ALIVE || echo EXITED
     ls -la <gate-dir>/result.json 2>/dev/null; tail -5 <gate-dir>/dispatch.log
     ```

     Use ABSOLUTE paths (the detached process does not inherit your cwd) and keep `dispatch.log` —
     it is the rescue input if the bridge answers but dies before writing the JSON.

     ⚠ **Check liveness by PID, never `pgrep -f dispatch-*.sh`** — `pgrep -f` matches its own command
     line and the shell wrapping it, so it reports a dead dispatch as alive.

     ⚠ **Aborting a stale dispatch: inspect BEFORE you clean.** Check for a non-empty `result.json`
     before the kill AND again after it, and never bundle `rm` of the result path into the kill —
     the review can complete in the race window, and a written verdict is the product.

   - **If the bridge leaves only a raw reply** (`result.raw.txt` / a session log), rescue the verdict
     instead of re-spending the dispatch:
     `python3 scripts/extract-review-json.py <raw-path> <out.json> --model <name>` (add `--model`
     only when the bridge never stamped one, and use the canonical name).
   - **One dispatch at a time, and ~200 KB per packet on qwen.** Reviewing a multi-commit range
     means SPLITTING it into coherent slices with one packet each, run sequentially — a 313 KB
     packet came back empty, and the same content in three slices (170/94/70 KB) all reviewed
     cleanly (2026-08-16). Give every slice the same INTENT and a line naming which slice it is and
     where the rest lives, so a reviewer that follows a thread out of its slice knows it has left
     home. Findings then merge across slices.

4. **Read the result JSON:**
   - `CLEAN` → land it. A cross-family CLEAN is real evidence.
   - `FIX-BEFORE-MERGE` → resolve every `FIX` finding, then re-review the new diff (full loop —
     fixes introduce their own defects).
   - `BLOCKED` → stop. Resolve the BLOCKERs or take the review to the owner. Do not commit over a
     BLOCKER because you disagree with it — disagreement goes to the owner with both rationales.
5. **Disputes:** if you believe a finding is wrong, verify it concretely (run the code, read the
   caller, add a test) — and if it still looks wrong, that's an owner decision, not a silent
   override. Record the dispute next to the result JSON.

## Notes

- `FOLLOW-UP` findings: file them (a TODO in the relevant doc / an issue) rather than blocking; say
  where you filed them.
- Keep packets + result JSONs under `scratchpad/code-review/` until the change lands — they are the
  audit trail, and re-reviews rebuild from them. `scratchpad/` is gitignored.
- A reviewer that reports a finding about generated `data/*.json` content is usually pointing at the
  sync pipeline, not the diff — check `src/sync/` before "fixing" the artifact.
- **"No result event" is a bridge symptom, not a model refusal.** `dispatch-qwen.sh` keeps the CLI's
  stdout (`result.stream.json`) and stderr (`result.stderr.txt`) precisely so this is diagnosable:
  read them before re-dispatching. A stream that ends at exactly 65536 bytes is the pipe-capture
  truncation that bridge was rewritten to avoid — if it reappears, the run is being captured through
  a pipe somewhere again.
- **A reviewer's suggested fix is a hypothesis too.** Two of this harness's first findings were real
  bugs with wrong prescriptions (a CSS offset that ignored a 6px stripe; an extension rename that
  would have broken the asset-URL mapping). Verify the DEFECT, then decide the fix yourself.
