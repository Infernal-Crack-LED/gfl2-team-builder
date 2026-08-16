#!/usr/bin/env node
/**
 * Weighted pattern analysis over the effect matrix's unclassified "mentions"
 * edges. Reads the already-derived `data/effect-matrix.json` (no DB), masks
 * effect markers and numbers, and groups the remaining text three ways so
 * recurring phrasings surface by weight:
 *
 *   lead-in    — the words immediately BEFORE the effect marker
 *                (what the classifier keys on — most actionable)
 *   follow-up  — the words immediately AFTER the marker
 *                (what the sentence does to the effect)
 *   skeleton   — the full masked sentence (exact recurring phrasings)
 *
 * Re-run after a sync to check whether new data introduced new patterns:
 *   npm run analyze:mentions [-- <topN>]
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DATA_DIR = join(import.meta.dirname, '..', '..', 'data');

interface Edge {
  relation: string;
  snippet: string;
  kind: string;
  dollName?: string;
  weaponName?: string;
  effectName?: string;
  keyTitle?: string;
  skillName?: string;
  [key: string]: unknown;
}

interface MatrixEntry {
  effectId: string;
  effectName: string | null;
  interactions: Edge[];
}

interface MatrixFile {
  effects: MatrixEntry[];
}

// Distinct placeholders so markers/numbers merge but stay locatable. The
// non-effect marker types ([summon:], [dollskill:], ...) are masked too, or
// the number pass would mangle their hex UUIDs.
const EFFECT = '⟦E⟧';
const OTHER = '⟦X⟧';
const NUM = '⟦N⟧';
const EFFECT_LC = EFFECT.toLowerCase();

/** Mask markers and numbers so near-duplicate phrasings merge. */
function mask(text: string): string {
  return text
    .replace(/\[effect:[^\]]+\]/gi, EFFECT)
    .replace(/\[[a-z]+:[^\]]+\]/gi, OTHER)
    .replace(/\d+(?:[.,]\d+)?%?/g, NUM)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(masked: string): string[] {
  return masked.split(' ').filter(Boolean);
}

interface Group {
  count: number;
  effects: Set<string>;
  example: string;
}

function bump(
  map: Map<string, Group>,
  key: string,
  effectName: string,
  example: string
): void {
  if (!key.trim()) {
    return;
  }
  let g = map.get(key);
  if (!g) {
    g = { count: 0, effects: new Set(), example };
    map.set(key, g);
  }
  g.count++;
  g.effects.add(effectName);
}

async function main(): Promise<void> {
  const topN = Number(process.argv[2]) || 30;
  const windowSize = 6;

  const raw = await readFile(join(DATA_DIR, 'effect-matrix.json'), 'utf8');
  const matrix = JSON.parse(raw) as MatrixFile;

  const leadIn = new Map<string, Group>();
  const followUp = new Map<string, Group>();
  const skeleton = new Map<string, Group>();
  let total = 0;

  for (const entry of matrix.effects) {
    const effectName = entry.effectName ?? entry.effectId;
    for (const edge of entry.interactions) {
      if (edge.relation !== 'mentions') {
        continue;
      }
      total++;
      const masked = mask(edge.snippet);
      const toks = tokens(masked);
      const idx = toks.indexOf(EFFECT_LC);
      if (idx === -1) {
        // No marker survived masking — group under the whole masked text
        bump(skeleton, masked, effectName, edge.snippet);
        continue;
      }
      const lead = toks.slice(Math.max(0, idx - windowSize), idx).join(' ');
      const follow = toks.slice(idx + 1, idx + 1 + windowSize).join(' ');
      bump(leadIn, lead, effectName, edge.snippet);
      bump(followUp, follow, effectName, edge.snippet);
      bump(skeleton, masked, effectName, edge.snippet);
    }
  }

  const print = (title: string, map: Map<string, Group>): void => {
    const rows = [...map.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, topN);
    console.log(`\n=== ${title} (top ${rows.length}) ===`);
    for (const [key, g] of rows) {
      console.log(`  ${String(g.count).padStart(3)}× ${g.effects.size}eff  ${key || '(sentence starts with marker)'}`);
      console.log(`        e.g. ${g.example.slice(0, 120)}`);
    }
  };

  console.log(`Unclassified "mentions" edges: ${total}`);
  print('LEAD-IN — words before the marker (classifier patterns)', leadIn);
  print('FOLLOW-UP — words after the marker', followUp);
  print('FULL SENTENCE SKELETONS', skeleton);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
