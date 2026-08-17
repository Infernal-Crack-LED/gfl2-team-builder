#!/usr/bin/env bash
set -euo pipefail

# dispatch-claude.sh — dispatch a cross-family packet to Claude via the CLI.
#
#   bash scripts/gates/dispatch-claude.sh <packet.md> <model> <result-out.json>
#
# Two modes, selected by the packet's role heading in its first 10 lines:
#
#   BLIND (default — every packet that does not start with "# code-review"):
#     any gate role that must not see the repo. Prepends the
#     no-tools preamble and dispatches with tools DISABLED (--allowedTools
#     "DISABLED"), preserving the blindness boundary — the role cannot read the
#     driver's artifacts or the repo; the packet is all it sees.
#
#   CODE-REVIEW (packet starts with "# code-review"):
#     the sighted post-op review (.claude/skills/code-review). Omits the
#     no-tools preamble and dispatches with READ-ONLY repo access
#     (--allowedTools "Read,Grep,Glob,Bash", --max-turns 12 so the reviewer can
#     actually read callers and run typecheck/tests). Write/Edit are NOT on the
#     allow-list — the reviewer stays findings-only (Bash is governed by the
#     role body's "never edit, never mutate" instruction).
#
# Both modes prepend the subagent non-negotiables, pipe the full prompt to
# `claude -p`, extract the model's JSON from the CLI envelope, strip markdown
# fences, validate it parses as JSON, and write to <result-out.json>.
#
# The model field is injected into the result so the verdict can report provenance.

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

# Non-negotiables: prepended to every packet (this repo ships its own copy).
NON_NEG=""
if [[ -f "$ROOT/.claude/subagent-non-negotiables.md" ]]; then
  NON_NEG="$ROOT/.claude/subagent-non-negotiables.md"
fi

if [[ $# -lt 3 ]]; then
  echo "usage: dispatch-claude.sh <packet.md> <model> <result-out.json>" >&2
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
# the audit/gate roles.
if detect_code_review "$PACKET"; then
  MODE="code-review"
else
  MODE="blind"
fi

# Build the full prompt: mode preamble + non-negotiables + the packet.
# BLIND: the no-tools preamble is required — the templates say "Save to <path>"
# which triggers tool-use attempts; with tools disabled + --max-turns 1 the
# model burns its one turn on a denied tool call and never returns JSON. The
# preamble + the extra turns give it a clear instruction and a recovery path.
# CODE-REVIEW: tools are available, so the preamble instead pins the read-only
# contract and that the FINAL message must be the JSON object (multi-turn tool
# use otherwise tends to end on a prose summary).
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

# Dispatch flags by mode (JSON envelope in both):
#   blind       — tools DISABLED (--allowedTools "DISABLED" — a non-matching
#                 name; the empty string "" is treated as "no filter" by the
#                 CLI). The blind role must return JSON in its text response,
#                 not use tools to write files — this preserves the blindness
#                 boundary (it cannot read the driver's artifacts from the
#                 repo) and gives us the JSON on stdout to validate.
#                 --max-turns 3 gives recovery room if a tool attempt slips
#                 through.
#   code-review — READ-ONLY tools (Read,Grep,Glob,Bash; Write/Edit excluded)
#                 and --max-turns 12 so the reviewer can read callers and run
#                 typecheck/tests before answering.
# NOTE: --bare breaks OAuth/keychain auth, so we don't use it.
CLAUDE_ARGS=(--model "$MODEL" --output-format json)
if [[ "$MODE" == "code-review" ]]; then
  CLAUDE_ARGS+=(--max-turns 12 --allowedTools "Read,Grep,Glob,Bash")
else
  CLAUDE_ARGS+=(--max-turns 3 --allowedTools "DISABLED")
fi
RAW="$(printf '%s' "$PROMPT" | claude -p "${CLAUDE_ARGS[@]}" \
  2>/dev/null)" || true

# Extract the model's text response from the CLI JSON envelope.
RESULT_TEXT="$(printf '%s' "$RAW" | jq -r '.result // empty' 2>/dev/null)" || true
if [[ -z "$RESULT_TEXT" ]]; then
  echo "❌ claude returned no .result field" >&2
  printf '%s' "$RAW" | jq '{is_error, stop_reason, terminal_reason, result}' >&2 2>/dev/null || true
  exit 1
fi

# Strip markdown code fences (```json ... ``` or ``` ... ```) if present, then extract the
# JSON object. Extraction uses Python's json.raw_decode — a REAL JSON parser — scanning for
# the first parseable object. This replaces the old hand-rolled brace-matcher, which tracked
# string/escape state manually and desynced on large embedded-code payloads (a testSource
# field full of escaped quotes + braces), truncating the response (dorothy-serendipity,
# 2026-07-25). raw_decode handles arbitrary embedded code correctly and ignores any preamble
# before / commentary after the JSON object.
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
  echo "❌ could not extract a JSON object from the model response" >&2
  echo "--- first 500 chars ---" >&2
  printf '%s' "$CLEANED" | head -c 500 >&2
  echo >&2
  exit 1
}
CLEANED="$EXTRACTED"

# Validate: must parse as JSON.
if ! printf '%s' "$CLEANED" | jq empty 2>/dev/null; then
  echo "❌ model response is not valid JSON" >&2
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
