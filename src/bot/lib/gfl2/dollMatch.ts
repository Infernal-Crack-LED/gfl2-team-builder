/**
 * Match an OCR'd doll name to a doll slug. OCR on these screenshots is very
 * clean, so exact match (after normalization) almost always lands; a
 * Levenshtein distance of 1 covers the occasional dropped diacritic or
 * confused glyph without letting "Vector" match "Vepley".
 */

import { loadGfl2Data } from './data.js';

function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9]/g, '');
}

function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) {
    return 2; // caller only cares about <= 1
  }
  const prev = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) {
    prev[j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0] ?? 0;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const next = Math.min(
        (prev[j] ?? 0) + 1,
        (prev[j - 1] ?? 0) + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diag = prev[j] ?? 0;
      prev[j] = next;
    }
  }
  return prev[b.length] ?? 2;
}

let lookup: Map<string, { name: string; slug: string }> | null = null;

async function nameLookup(): Promise<
  Map<string, { name: string; slug: string }>
> {
  if (lookup) {
    return lookup;
  }
  const { dolls } = await loadGfl2Data();
  lookup = new Map();
  for (const doll of dolls) {
    lookup.set(normalize(doll.name), { name: doll.name, slug: doll.slug });
  }
  return lookup;
}

/** Returns the matched doll, or null when nothing is close enough. */
export async function matchDollName(
  ocrName: string
): Promise<{ name: string; slug: string } | null> {
  const map = await nameLookup();
  const q = normalize(ocrName);
  if (!q) {
    return null;
  }
  const exact = map.get(q);
  if (exact) {
    return exact;
  }
  let best: { name: string; slug: string } | null = null;
  for (const [key, doll] of map) {
    if (levenshtein(q, key) <= 1) {
      if (best) {
        return null; // ambiguous — safer to report unmatched
      }
      best = doll;
    }
  }
  return best;
}
