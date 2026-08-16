import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Doll {
  id: string;
  name: string;
  class: string;
  phase: string;
  rarity: string;
  ammoTypes: string[];
  weaponImprintType: string | null;
  weaponImprint: { name: string } | null;
  avatarUrl: string | null;
  searchTags: string[] | null;
  regionTag: string | null;
  preview: boolean;
  movement: number | null;
  stabilityGauge: number | null;
  slug: string;
  bio: string | null;
  skills: Array<{
    name: string;
    description: string | null;
    skillTags: string[] | null;
  }>;
}

export interface Weapon {
  id: string;
  name: string;
  rarity: string;
  weaponType: string;
  primaryAttribute: string;
  primaryAttributeStat: number;
  secondaryAttribute: string | null;
  secondaryAttributeStat: string | null;
  trait: string | null;
  effect: string | null;
  imprintDollId: string | null;
  imprintDescription: string | null;
  imageUrl: string | null;
  eliteCounterpart: { name: string } | null;
  standardCounterpart: { name: string } | null;
  retiredCounterpart: { name: string } | null;
  slug: string;
  regionTag: string | null;
}

export interface Effect {
  id: string;
  effectName: string;
  effectDetails: string | null;
  effectTags: string[] | null;
  dollId: string | null;
  regionTag: string | null;
  preview: boolean;
}

interface DataStore {
  dolls: Doll[];
  weapons: Weapon[];
  effects: Effect[];
}

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', '..', '..', '..', '..', 'data');

async function loadJson<T>(name: string): Promise<T> {
  const raw = await readFile(join(dataDir, name), 'utf-8');
  return JSON.parse(raw) as T;
}

let cache: DataStore | null = null;

export async function loadGfl2Data(): Promise<DataStore> {
  if (cache) {
    return cache;
  }

  const [{ dolls }, { weapons }, { effects }] = await Promise.all([
    loadJson<{ dolls: Doll[] }>('dolls.json'),
    loadJson<{ weapons: Weapon[] }>('weapons.json'),
    loadJson<{ effects: Effect[] }>('effects.json'),
  ]);

  cache = { dolls, weapons, effects };
  return cache;
}

export function getSiteUrl(): string {
  return process.env.SITE_URL?.replace(/\/$/, '') ?? 'http://localhost:5173';
}
