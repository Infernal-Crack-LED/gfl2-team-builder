#!/usr/bin/env python3
"""Rescue the verdict JSON out of a cross-family dispatch log.

The `/code-review` and `/logic-gate` bridges (scripts/gates/dispatch-*.sh) normally
write a clean result JSON. When a dispatch instead leaves only a raw session log — the
model narrated its tool calls around the verdict, or the bridge died after the model
answered — this pulls the verdict back out instead of re-spending the dispatch.

Two input shapes are accepted, because both occur:
  * a session log — a JSON envelope with a `result` string holding the model's full output
    (tool call/result blocks, then the final JSON verdict, usually inside a ```json fence);
  * that output text on its own — what dispatch-*.sh saves as `<out>.raw.txt` when its own
    jq validation rejects the extracted candidate.

    python3 scripts/extract-review-json.py <log-path> <out-path> [--model NAME]

<log-path>   the dispatch session log (e.g. ~/.kimi-code/sessions/<wd>/<session>/agents/
             main/tasks/<task>/output.log), a bridge-saved `<out>.raw.txt`, or `-` for stdin
<out-path>   where to write the extracted verdict, e.g.
             scratchpad/gates/<date>-<topic>/result.json
--model      stamp `model` on the verdict. The bridges inject this themselves; set it only
             when rescuing a log the bridge never stamped, and use the CANONICAL name from
             .claude/skills/code-review/SKILL.md — an off-protocol `model` voids
             the review.
"""

import argparse
import json
import re
import sys


def extract(text: str) -> dict:
    """Return the first parseable JSON object in the model's output."""
    # The output interleaves tool calls with their results; the verdict is what
    # survives once those blocks are dropped.
    text = re.sub(
        r'\n\*\*Tool:.*?\*\*.*?\*\*Tool Result:\*\*.*?````?json.*?````?',
        '',
        text,
        flags=re.DOTALL,
    )
    text = re.sub(
        r'\n\*\*Tool:.*?\*\*.*?\*\*Tool Result:\*\*.*?```json.*?```',
        '',
        text,
        flags=re.DOTALL,
    )
    # Strip markdown fences around the final JSON block.
    text = re.sub(r'^```json\n', '', text)
    text = re.sub(r'\n```$', '', text)

    dec = json.JSONDecoder()
    start = 0
    while True:
        idx = text.find('{', start)
        if idx < 0:
            raise ValueError('no parseable JSON object in the log')
        try:
            obj, _end = dec.raw_decode(text[idx:])
            return obj
        except json.JSONDecodeError:
            start = idx + 1


def main() -> int:
    ap = argparse.ArgumentParser(
        description='Extract a cross-family review verdict from a dispatch log.'
    )
    ap.add_argument('log_path', help="dispatch session log, or '-' for stdin")
    ap.add_argument('out_path', help='where to write the extracted verdict JSON')
    ap.add_argument(
        '--model',
        default=None,
        help='stamp `model` on the verdict (canonical name — see .claude/skills/code-review/SKILL.md)',
    )
    args = ap.parse_args()

    raw = sys.stdin.read() if args.log_path == '-' else open(args.log_path).read()
    # Two input shapes, both real:
    #   1. a dispatch SESSION LOG — a JSON envelope whose `result` string holds the model's output.
    #   2. the model's output text ITSELF — what dispatch-*.sh now saves as `<out>.raw.txt` when jq
    #      rejects the extracted candidate. Before 2026-08-13 this path crashed on `json.loads`
    #      (plain text) or exited on the missing `result` field (text that happened to be pure JSON),
    #      so the rescue command the bridge printed could never work in the one case it existed for.
    try:
        envelope = json.loads(raw)
    except json.JSONDecodeError:
        envelope = None
    source = (
        envelope['result']
        if isinstance(envelope, dict) and isinstance(envelope.get('result'), str)
        else raw
    )

    try:
        obj = extract(source)
        # An envelope with trailing garbage (a stray brace, a concatenated log) fails the strict
        # json.loads above, falls through to `source = raw`, and then extract()'s raw_decode happily
        # returns the ENVELOPE itself — it ignores trailing garbage. Unwrap that case rather than
        # writing session metadata to disk as if it were a verdict.
        if (
            isinstance(obj, dict)
            and isinstance(obj.get('result'), str)
            and 'verdict' not in obj
        ):
            obj = extract(obj['result'])
    except ValueError as e:
        print(f'{args.log_path}: {e}', file=sys.stderr)
        return 1

    # Shape check — the point of this tool is rescuing a VERDICT, so refuse loudly rather than write
    # whatever JSON happened to appear first. Without this, any valid-JSON input that is not a
    # dispatch envelope is copied out verbatim and reported as a successful rescue: a silent wrong
    # file, which on a recovery tool is worse than the crash it replaced.
    if not isinstance(obj, dict) or 'verdict' not in obj:
        keys = ', '.join(sorted(obj)[:8]) if isinstance(obj, dict) else type(obj).__name__
        print(
            f'{args.log_path}: extracted JSON has no `verdict` field (got: {keys}) — '
            'this is not a review/gate result; nothing written',
            file=sys.stderr,
        )
        return 1

    if args.model:
        obj['model'] = args.model
    with open(args.out_path, 'w') as f:
        json.dump(obj, f, indent=2)
    print(f'wrote {args.out_path} ({len(json.dumps(obj))} bytes)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
