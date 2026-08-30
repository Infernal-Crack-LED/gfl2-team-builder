#!/usr/bin/env bash
set -euo pipefail

# dispatch-kimi.sh — dispatch a cross-family packet to Kimi via the CLI.
#
#   bash scripts/gates/dispatch-kimi.sh <packet.md> <model> <result-out.json>
#
# Kimi equivalent of dispatch-claude.sh, with the same two modes, selected by
# the packet's role heading in its first 10 lines:
#
#   BLIND (default — every packet that does not start with "# code-review"):
#     runs the blind agent profile (kimi-blind-agent.yaml, `tools: []`), which
#     leaves the model with no tools at all, and prepends the no-tools
#     preamble. Generic gates may override the profile with KIMI_AGENT_FILE —
#     the override must be a kimi-cli >= 1.x YAML agent spec.
#
#   CODE-REVIEW (packet starts with "# code-review"):
#     the sighted post-op review (.claude/skills/code-review). Runs the sighted
#     profile (kimi-code-review-agent.yaml: ReadFile/Glob/Grep/Shell) and omits
#     the no-tools preamble. Write/edit tools are NOT in the profile — the
#     reviewer stays findings-only (Shell is governed by the role body's "never
#     edit, never mutate" instruction). Detection WINS over KIMI_AGENT_FILE: a
#     code-review packet always gets the sighted profile even if the caller
#     still exports the old blind gate profile.
#
# Both modes prepend the subagent non-negotiables, pipe the full prompt to
# `kimi --print` on STDIN, extract the assistant text from the stream-json
# envelope, strip markdown fences, validate it parses as JSON, and write to
# <result-out.json>.
#
# The model field is injected into the result so the verdict can report provenance.
#
# Model names are ~/.kimi/config.toml aliases, e.g. `kimi-code/k3` (see
# .claude/skills/code-review/SKILL.md for the canonical routing).
#
# NOTE: long dispatches (a ~44KB packet) take minutes — carve this script out
# of any short STOP-DON'T-WAIT timeout, same as dispatch-claude.sh.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# A packet is the sighted code-review role iff its role heading appears in the
# first 10 lines: "# code-review ..." (the packet is the role body of
# .claude/agents/code-review.md + INTENT/DIFF/CONTEXT). Signature-stable; every
# other role heading stays blind.
detect_code_review() {
  local packet="$1"
  if head -n 10 "$packet" | grep -qE '^# code-review\b'; then
    return 0
  fi
  return 1
}

# Agent profile: selected by mode once the packet is known (see below) — the
# sighted kimi-code-review-agent.yaml for code-review packets, the blind
# profile (kimi-blind-agent.yaml) otherwise; generic gates may override the
# BLIND profile with KIMI_AGENT_FILE=<their own YAML agent spec>.

# Resolve the kimi binary: PATH first, then the default install location.
KIMI="$(command -v kimi || true)"
if [[ -z "$KIMI" && -x "$HOME/.kimi-code/bin/kimi" ]]; then
  KIMI="$HOME/.kimi-code/bin/kimi"
fi
if [[ -z "$KIMI" ]]; then
  echo "❌ kimi CLI not found (looked on PATH and ~/.kimi-code/bin/kimi)" >&2
  exit 1
fi

# Non-negotiables: prepended to every packet (this repo ships its own copy).
NON_NEG=""
if [[ -f "$ROOT/.claude/subagent-non-negotiables.md" ]]; then
  NON_NEG="$ROOT/.claude/subagent-non-negotiables.md"
fi

if [[ $# -lt 3 ]]; then
  echo "usage: dispatch-kimi.sh <packet.md> <model> <result-out.json>" >&2
  exit 1
fi

PACKET="$1"
MODEL="$2"
OUT="$3"

if [[ ! -f "$PACKET" ]]; then
  echo "❌ packet not found: $PACKET" >&2
  exit 1
fi

# Mode selection: a packet whose role heading (first 10 lines) is "# code-review"
# is the sighted code-review skill and runs with read-only tools; everything
# else stays blind (no tools) — the blindness boundary is the whole point of
# the audit/gate roles. Detection wins over KIMI_AGENT_FILE so a stale caller
# export cannot force a code review back onto the blind profile.
if detect_code_review "$PACKET"; then
  MODE="code-review"
  # kimi-cli >= 1.x parses agent specs as pure YAML; the old .md
  # frontmatter profile no longer loads. Same read-only contract.
  AGENT_FILE="$SCRIPT_DIR/kimi-code-review-agent.yaml"
else
  MODE="blind"
  AGENT_FILE="${KIMI_AGENT_FILE:-$SCRIPT_DIR/kimi-blind-agent.yaml}"
fi

# Build the full prompt: mode preamble + non-negotiables + the packet.
# BLIND: the agent profile already removes the tools, but the preamble keeps
# the instruction unambiguous (the role templates say "Save to <path>", which
# the model must instead return as text).
# CODE-REVIEW: tools are ON (sighted profile); the preamble instead pins the
# read-only contract and that the FINAL message must be the JSON object
# (multi-turn tool use otherwise tends to end on a prose summary).
if [[ "$MODE" == "code-review" ]]; then
  PROMPT="IMPORTANT: You have READ-ONLY repository access via the Read, Grep, Glob and Bash tools — use them to verify assumptions against the code and to run fast read-only checks (typecheck, tests). NEVER edit, write, commit, or run anything that mutates state; you are a findings-only reviewer. Return your JSON object as your FINAL message, with no markdown fences and no prose around it.

"
else
  PROMPT="IMPORTANT: You have NO tools available. Do NOT attempt to use any tools (no file writes, no reads, no shell commands). Return your complete JSON response directly in your response text.

"
fi
if [[ -n "$NON_NEG" ]]; then
  PROMPT+="$(cat "$NON_NEG")

---

"
fi
PROMPT+="$(cat "$PACKET")"

echo "→ dispatching $(basename "$PACKET") to $MODEL ($MODE mode) …" >&2

# Dispatch: the tool set is bounded by the agent PROFILE, not a permission flag —
#   blind       — tools: [] (the model has no tools at all).
#   code-review — ReadFile/Glob/Grep/Shell (write tools never exist).
# --print is non-interactive and auto-approves the profile's tools on its own.
# stream-json gives one JSON object per line on stdout; the model's reply is
# the assistant message(s). stderr carries thinking + progress (discarded).
# kimi-cli >= 1.x: -p alone is no longer non-interactive; --print is required
# for headless runs and is what --output-format needs. The prompt goes in on
# STDIN (--input-format text), not as -p: a packet-sized argv blows past the
# ~32K CreateProcess limit on Windows and the dispatch dies with no message.
# PYTHONUTF8: on Windows the CLI otherwise decodes stdin as the console
# codepage (cp1252) and multibyte UTF-8 in the packet becomes lone
# surrogates that kill the request at serialization time.
RAW="$(printf '%s' "$PROMPT" | KIMI_CODE_EXPERIMENTAL_FLAG=1 PYTHONUTF8=1 "$KIMI" --print \
  --input-format text \
  --model "$MODEL" \
  --agent-file "$AGENT_FILE" \
  --output-format stream-json \
  2>/dev/null)" || true

# Extract the assistant text from the JSONL envelope (last assistant message
# wins — the final answer). Verified against a live sighted envelope
# (2026-08-02): a tool-call turn is {"role":"assistant","tool_calls":[...]}
# with NO .content field, so `.content // empty` drops it; tool results are
# role=="tool" (also dropped); the final answer is {"role":"assistant",
# "content":"<json string>"} — a plain string, so `last` yields the JSON. No
# block-array content was observed, so this extraction needs no code-review
# special-casing.
# kimi-cli >= 1.x wraps assistant content in a block array
# ([{type:"think",...},{type:"text","text":...}]); older CLIs sent a plain
# string. Handle both: join the text blocks, pass strings through.
RESULT_TEXT="$(printf '%s\n' "$RAW" | jq -rs '[.[] | select(.role == "assistant") | .content // empty
  | if type == "array" then (map(select(.type? == "text") | .text) | join("")) else . end
  | select(length > 0)] | last // empty' 2>/dev/null)" || true
if [[ -z "$RESULT_TEXT" ]]; then
  echo "❌ kimi returned no assistant message" >&2
  printf '%s\n' "$RAW" | head -c 1000 >&2 || true
  exit 1
fi

# Strip markdown code fences (```json ... ``` or ``` ... ```) if present, then extract the
# JSON object. Extraction uses Python's json.raw_decode — a REAL JSON parser — scanning for
# the first parseable object, the same as the other two bridges. The hand-rolled brace-matcher
# this replaces tracked string/escape state itself and desynced on a payload full of escaped
# quotes and braces (an `issue` string quoting code), truncating a verdict that had already
# cost a full dispatch.
CLEANED="$(printf '%s' "$RESULT_TEXT" | sed -e '/^```[a-zA-Z]*$/d' -e '/^```$/d')"
EXTRACTED="$(printf '%s' "$CLEANED" | python3 -c "
import sys, json
text = sys.stdin.read()
dec = json.JSONDecoder()
start = 0
while True:
    idx = text.find('{', start)
    if idx < 0:
        sys.exit(1)
    try:
        _, end = dec.raw_decode(text[idx:])
        break
    except json.JSONDecodeError:
        start = idx + 1
sys.stdout.write(text[idx:idx + end])
")" || {
  mkdir -p "$(dirname "$OUT")"
  printf '%s' "$RESULT_TEXT" > "${OUT%.json}.raw.txt"
  printf '%s' "$CLEANED" > "${OUT%.json}.cleaned.txt"
  echo "❌ could not extract a JSON object from the model response" >&2
  echo "   raw reply saved:      ${OUT%.json}.raw.txt" >&2
  echo "   extracted candidate:  ${OUT%.json}.cleaned.txt" >&2
  echo "   rescue: python3 scripts/extract-review-json.py ${OUT%.json}.raw.txt $OUT --model $MODEL" >&2
  exit 1
}
CLEANED="$EXTRACTED"

# Validate: must parse as JSON. On failure the reviewer's ACTUAL WORK must survive — before
# 2026-08-13 it did not: the assistant text lived only in this shell variable, so an unparseable
# reply (a real one: a multi-line `issue` string with raw newlines, which jq rejects) cost a full
# 12-minute cross-family dispatch and left a 500-char preview as the only trace. Persist both the
# raw assistant text and the brace-extracted candidate next to $OUT so the reply can be rescued
# (scripts/extract-review-json.py) or read by hand instead of re-spent.
if ! printf '%s' "$CLEANED" | jq empty 2>/dev/null; then
  mkdir -p "$(dirname "$OUT")"
  printf '%s' "$RESULT_TEXT" > "${OUT%.json}.raw.txt"
  printf '%s' "$CLEANED" > "${OUT%.json}.cleaned.txt"
  echo "❌ model response is not valid JSON" >&2
  echo "   raw reply saved:      ${OUT%.json}.raw.txt" >&2
  echo "   extracted candidate:  ${OUT%.json}.cleaned.txt" >&2
  echo "   rescue: python3 scripts/extract-review-json.py ${OUT%.json}.raw.txt $OUT --model $MODEL" >&2
  echo "--- first 500 chars ---" >&2
  printf '%s' "$CLEANED" | head -c 500 >&2
  echo >&2
  exit 1
fi

# Shape check: must carry a `verdict` key (the rescue path already enforces this — the bridges
# did not, so a valid-JSON non-verdict reply was written as $OUT with a ✓). Without this, any
# {"foo":"bar"} that parses clean gets model-stamped and lands indistinguishable from a real verdict.
if ! printf '%s' "$CLEANED" | jq -e 'has("verdict")' >/dev/null 2>&1; then
  mkdir -p "$(dirname "$OUT")"
  printf '%s' "$RESULT_TEXT" > "${OUT%.json}.raw.txt"
  printf '%s' "$CLEANED" > "${OUT%.json}.cleaned.txt"
  KEYS="$(printf '%s' "$CLEANED" | jq -r 'keys | join(", ")' 2>/dev/null || echo 'not an object')"
  echo "❌ model response is valid JSON but has no \`verdict\` field (keys: $KEYS)" >&2
  echo "   raw reply saved:      ${OUT%.json}.raw.txt" >&2
  echo "   extracted candidate:  ${OUT%.json}.cleaned.txt" >&2
  echo "   rescue: python3 scripts/extract-review-json.py ${OUT%.json}.raw.txt $OUT --model $MODEL" >&2
  exit 1
fi

# Inject the model provenance field.
FINAL="$(printf '%s' "$CLEANED" | jq --arg m "$MODEL" '. + {model: $m}')"

mkdir -p "$(dirname "$OUT")"
printf '%s\n' "$FINAL" > "$OUT"
echo "✓ $(basename "$OUT")  ($(printf '%s' "$FINAL" | wc -c | tr -d ' ') bytes, model=$MODEL)" >&2
