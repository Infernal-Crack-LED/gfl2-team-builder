import type { Doll, Effect, Weapon } from './data.js';

export interface SearchResult<T> {
  item: T;
  score: number;
}

function normalize(input: string): string {
  return input.toLowerCase().trim();
}

function matchesName(input: string, name: string): number {
  const q = normalize(input);
  const n = normalize(name);
  if (n === q) {
    return 0;
  }
  if (n.startsWith(q)) {
    return 1;
  }
  if (n.includes(q)) {
    return 2;
  }
  return -1;
}

export function searchDolls(
  dolls: Doll[],
  query: string
): SearchResult<Doll>[] {
  const q = normalize(query);
  const results: SearchResult<Doll>[] = [];
  for (const doll of dolls) {
    let score = matchesName(q, doll.name);
    if (score === -1 && doll.searchTags) {
      for (const tag of doll.searchTags) {
        const tagScore = matchesName(q, tag);
        if (tagScore !== -1 && (score === -1 || tagScore < score)) {
          score = tagScore;
        }
      }
    }
    if (score !== -1) {
      results.push({ item: doll, score });
    }
  }
  return results.sort((a, b) => a.score - b.score);
}

export function searchWeapons(
  weapons: Weapon[],
  query: string
): SearchResult<Weapon>[] {
  const q = normalize(query);
  const results: SearchResult<Weapon>[] = [];
  for (const weapon of weapons) {
    const score = matchesName(q, weapon.name);
    if (score !== -1) {
      results.push({ item: weapon, score });
    }
  }
  return results.sort((a, b) => a.score - b.score);
}

export function searchEffects(
  effects: Effect[],
  query: string
): SearchResult<Effect>[] {
  const q = normalize(query);
  const results: SearchResult<Effect>[] = [];
  for (const effect of effects) {
    const score = matchesName(q, effect.effectName);
    if (score !== -1) {
      results.push({ item: effect, score });
    }
  }
  return results.sort((a, b) => a.score - b.score);
}
