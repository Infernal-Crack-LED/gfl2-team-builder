#!/usr/bin/env bash
set -euo pipefail

# dispatch-qwen.sh — dispatch a cross-family packet to Qwen via the CLI.
#
#   bash scripts/gates/dispatch-qwen.sh <packet.md> <model> <result-out.json>
#
# The Qwen leg of the same bridge contract as dispatch-claude.sh /
# dispatch-kimi.sh: same argv, same two modes selected by the packet's role
# heading, same result JSON (model provenance injected, `verdict` required).
#
#   BLIND (default — every packet that does not start with "# code-review"):
#     prepends the no-tools preamble and runs with `--approval-mode plan`, the
#     qwen CLI's most restrictive mode, so a role that must not see the repo
#     cannot read it.
#
#   CODE-REVIEW (packet starts with "# code-review"):
#     the sighted post-op review (.claude/skills/code-review). Runs with
#     `--approval-mode default`, which in a headless run is the read-only
#     profile: read_file/grep/glob need no confirmation, while write_file/edit/
#     run_shell_command can't be confirmed by anyone and are auto-denied
#     (verified 2026-08-16 — the model reports DENIED and no file appears).
#     That is the same findings-only contract the other two bridges enforce
#     through their tool allow-lists.
#
# Both modes pass --safe-mode so the review is the packet and the repo, not
# this machine's qwen extensions, skills, hooks and MCP servers.
#
# Model names are settings.json provider ids (~/.qwen/settings.json), e.g.
# `qwen3.7-max` — the bridge passes the string straight through to `qwen -m`.

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
  echo "usage: dispatch-qwen.sh <packet.md> <model> <result-out.json>" >&2
  exit 1
fi

PACKET="$1"
MODEL="$2"
OUT="$3"

if [[ ! -f "$PACKET" ]]; then
  echo "❌ packet not found: $PACKET" >&2
  exit 1
fi

# Resolve the qwen binary: PATH first, then the default homebrew location.
QWEN="$(command -v qwen || true)"
if [[ -z "$QWEN" && -x /opt/homebrew/bin/qwen ]]; then
  QWEN="/opt/homebrew/bin/qwen"
fi
if [[ -z "$QWEN" ]]; then
  echo "❌ qwen CLI not found (looked on PATH and /opt/homebrew/bin/qwen)" >&2
  exit 1
fi

if detect_code_review "$PACKET"; then
  MODE="code-review"
  APPROVAL="default"
else
  MODE="blind"
  APPROVAL="plan"
fi

# Build the full prompt: mode preamble + non-negotiables + the packet.
if [[ "$MODE" == "code-review" ]]; then
  PROMPT="IMPORTANT: You have READ-ONLY repository access — use your read/grep/glob tools to verify assumptions against the code, and read-only shell checks (typecheck, tests) if they are offered to you. NEVER edit, write, commit, or run anything that mutates state; you are a findings-only reviewer, and mutating tools are denied in this run. Return your JSON object as your FINAL message, with no markdown fences and no prose around it.

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

# The prompt goes in on stdin: a large packet as an argv string risks E2BIG,
# and `qwen -p` appends its prompt argument to stdin, so an empty -p is the
# documented way to send stdin-only. -o json wraps the run in an event array
# whose final {"type":"result"} element carries the model's text.
RAW="$(printf '%s' "$PROMPT" | QWEN_CODE_SUPPRESS_YOLO_WARNING=1 "$QWEN" \
  -m "$MODEL" \
  -p "" \
  --approval-mode "$APPROVAL" \
  --safe-mode \
  -o json \
  2>/dev/null)" || true

RESULT_TEXT="$(printf '%s' "$RAW" | jq -r '[.[] | select(.type == "result") | .result // empty] | last // empty' 2>/dev/null)" || true
if [[ -z "$RESULT_TEXT" ]]; then
  echo "❌ qwen returned no result event" >&2
  printf '%s' "$RAW" | head -c 1000 >&2 || true
  echo >&2
  exit 1
fi

# Strip markdown code fences, then extract the first parseable JSON object with
# a REAL parser (json.raw_decode) — a hand-rolled brace matcher desyncs on
# embedded code full of escaped quotes and braces.
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
  echo "❌ could not extract a JSON object from the model response" >&2
  echo "   raw reply saved: ${OUT%.json}.raw.txt" >&2
  exit 1
}
CLEANED="$EXTRACTED"

# Validate: must parse as JSON. Persist the reviewer's actual work on failure —
# a cross-family dispatch is minutes of work and must never be lost to a
# formatting slip.
if ! printf '%s' "$CLEANED" | jq empty 2>/dev/null; then
  mkdir -p "$(dirname "$OUT")"
  printf '%s' "$RESULT_TEXT" > "${OUT%.json}.raw.txt"
  printf '%s' "$CLEANED" > "${OUT%.json}.cleaned.txt"
  echo "❌ model response is not valid JSON" >&2
  echo "   raw reply saved:      ${OUT%.json}.raw.txt" >&2
  echo "   extracted candidate:  ${OUT%.json}.cleaned.txt" >&2
  echo "   rescue: python3 scripts/extract-review-json.py ${OUT%.json}.raw.txt $OUT --model $MODEL" >&2
  exit 1
fi

# Shape check: a valid-JSON reply without a `verdict` is not a review.
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
