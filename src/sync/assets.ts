/**
 * Mirrors the Dandegate CDN art referenced by data/*.json into
 * web/public/game-assets/ so the site serves its own icons.
 *
 * Scans the committed JSON rather than taking a hardcoded list: the sync
 * pipeline is what decides which art the site references, so re-running this
 * after `npm run sync` always picks up new dolls and keys.
 *
 * Art that arrives larger than its category's cap is re-encoded down: key
 * icons ship at 256px/~45KB and portraits at 512px, several times what the UI
 * renders, which would put tens of MB in the repo. Skill and summon icons
 * already ship at their cap and are copied byte-for-byte.
 *
 * Run with `npm run assets`.
 */

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { parseRemoteAsset, type RemoteAsset } from '../share/assets.js';
import { DATA_DIR } from './export.js';

const PUBLIC_DIR = path.resolve(process.cwd(), 'web/public');
const USER_AGENT = 'GFL2TeamBuilder/1.0';

/** Data files scanned for CDN URLs. */
const SOURCE_FILES = ['dolls.json', 'keys.json', 'weapons.json'];

/** Concurrent downloads. Polite to the CDN, still ~20x faster than serial. */
const CONCURRENCY = 8;

export interface AssetSummary {
  found: number;
  downloaded: number;
  skipped: number;
  bytes: number;
  errors: string[];
}

/** Every string in a JSON blob, depth-first. */
function* walkStrings(value: unknown): Generator<string> {
  if (typeof value === 'string') {
    yield value;
  } else if (Array.isArray(value)) {
    for (const item of value) {
      yield* walkStrings(item);
    }
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) {
      yield* walkStrings(item);
    }
  }
}

/**
 * Collect the distinct mirrorable assets referenced by the data files.
 *
 * Matches URLs anywhere in the blob, not just at known keys: the same icon is
 * reachable through several shapes (a doll's own skills, the upgraded copies
 * nested under vertebrae, summon skills), and a key-path allowlist would keep
 * silently missing new ones.
 */
export async function collectAssets(): Promise<RemoteAsset[]> {
  const byUrl = new Map<string, RemoteAsset>();

  for (const file of SOURCE_FILES) {
    const raw = await readFile(path.join(DATA_DIR, file), 'utf8');
    const json: unknown = JSON.parse(raw);
    for (const str of walkStrings(json)) {
      if (!str.startsWith('https://')) {
        continue;
      }
      const asset = parseRemoteAsset(str);
      if (asset && !byUrl.has(asset.url)) {
        byUrl.set(asset.url, asset);
      }
    }
  }

  return [...byUrl.values()];
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Download one asset, re-encoding when it exceeds its category's cap. Returns
 * the bytes written, or null when the file was already mirrored.
 */
async function mirrorOne(
  asset: RemoteAsset,
  force: boolean
): Promise<number | null> {
  const dest = path.join(PUBLIC_DIR, asset.localPath);
  if (!force && (await exists(dest))) {
    return null;
  }

  const res = await fetch(asset.url, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }

  let body = Buffer.from(await res.arrayBuffer());

  const image = sharp(body);
  const meta = await image.metadata();
  if (Math.max(meta.width ?? 0, meta.height ?? 0) > asset.maxEdge) {
    body = await image
      .resize(asset.maxEdge, asset.maxEdge, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();
  }

  await writeFile(dest, body);
  return body.byteLength;
}

/** Mirror every referenced asset. Existing files are left alone unless forced. */
export async function mirrorAssets(force = false): Promise<AssetSummary> {
  const assets = await collectAssets();

  const dirs = new Set(assets.map((a) => path.dirname(a.localPath)));
  for (const dir of dirs) {
    await mkdir(path.join(PUBLIC_DIR, dir), { recursive: true });
  }

  const summary: AssetSummary = {
    found: assets.length,
    downloaded: 0,
    skipped: 0,
    bytes: 0,
    errors: [],
  };

  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(CONCURRENCY, assets.length) },
    async () => {
      while (cursor < assets.length) {
        const asset = assets[cursor++];
        if (!asset) {
          return;
        }
        try {
          const bytes = await mirrorOne(asset, force);
          if (bytes == null) {
            summary.skipped++;
          } else {
            summary.downloaded++;
            summary.bytes += bytes;
          }
        } catch (err) {
          summary.errors.push(
            `${asset.url}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }
  );

  await Promise.all(workers);
  return summary;
}
