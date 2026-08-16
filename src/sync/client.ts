/**
 * Dandegate API client — wraps fetch with the required Origin header and
 * pagination handling. The API returns 403 without the Origin header.
 */

const BASE_URL = 'https://api.dandegate.net/api';
const HEADERS = {
  Origin: 'https://dandegate.net',
  'User-Agent': 'GFL2TeamBuilder/1.0',
  Accept: 'application/json',
} as const;

interface ApiResponse<T> {
  success: boolean;
  data: T;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  statusCode?: number;
  message?: string;
}

async function request<T>(
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status} ${path}: ${body}`);
  }

  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success) {
    throw new Error(`API error ${path}: ${json.message ?? 'unknown'}`);
  }
  return json.data;
}

/** Fetch all paginated results from an endpoint (walks hasNext). */
async function requestAll<T>(path: string, limit = 1000): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  let hasNext = true;

  while (hasNext) {
    const res = await fetch(`${BASE_URL}${path}?page=${page}&limit=${limit}`, {
      headers: HEADERS,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API ${res.status} ${path}: ${body}`);
    }

    const json = (await res.json()) as ApiResponse<T[]>;
    if (!json.success) {
      throw new Error(`API error ${path}: ${json.message ?? 'unknown'}`);
    }

    all.push(...json.data);
    hasNext = json.pagination?.hasNext ?? false;
    page++;
  }

  return all;
}

export interface DollListEntry {
  id: string;
  name: string;
  class: string;
  phase: string;
  rarity: string;
  ammoTypes: string;
  avatarUrl: string;
  regionTag: string;
  preview: boolean;
  gunDataId: number;
  searchTags: string[];
  dollImages: unknown[];
  weaponImprint: unknown;
  weaponImprintType: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DollDetail extends DollListEntry {
  skills: unknown[];
  vertebrae: unknown[];
  remoldingPattern: unknown;
  movement: number;
  stabilityGauge: number;
  summons: unknown[];
  keys: unknown[];
  dollEffects: unknown[];
  effects: string;
}

export interface WeaponEntry {
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
  imprintCharacterId: string | null;
  imprintDescription: string | null;
  imageUrl: string | null;
  eliteCounterpart: unknown;
  standardCounterpart: unknown;
  retiredCounterpart: unknown;
  gunWeaponDataId: number | null;
  regionTag: string;
  preview: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KeyEntry {
  id: string;
  keyTitle: string;
  displayTitle: string | null;
  keyType: string;
  level: string | number | null;
  attributeName1: string | null;
  attributeValue1: string | null;
  attributeName2: string | null;
  attributeValue2: string | null;
  attributeName3: string | null;
  attributeValue3: string | null;
  effect: string | null;
  materialsType: string | null;
  materialsData: unknown;
  dollId: string | null;
  imageUrl: string | null;
  regionTag: string;
  searchTags: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface EffectEntry {
  id: string;
  effectName: string;
  effectDetails: string | null;
  effectTags: string[] | null;
  dollId: string | null;
  regionTag: string;
  preview: boolean;
  createdAt: string;
  updatedAt: string;
}

export const client = {
  fetchDolls: () => request<DollListEntry[]>('/dolls'),
  fetchDollDetail: (name: string) =>
    request<DollDetail>(`/dolls/${encodeURIComponent(name)}`),
  fetchWeapons: () => request<WeaponEntry[]>('/weapons'),
  fetchKeys: () => request<KeyEntry[]>('/keys'),
  fetchEffects: () => requestAll<EffectEntry>('/effects', 1000),
};
