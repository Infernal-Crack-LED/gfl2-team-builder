/**
 * GFL2 filter/pill icon sourcing from iopwiki.
 *
 * iopwiki covers BOTH Girls' Frontline 1 and 2, and the two games share
 * neither art nor naming. GFL1's icons live under `Icon Skill *`, `Icon
 * T-doll *` etc. and outnumber GFL2's by two orders of magnitude, so this
 * module never searches or globs — every icon is an explicit `File:` title
 * taken from the GFL2-only templates (`Template:GFL2WeakIcon`,
 * `Template:GFL2Doll`). Adding an icon means adding a catalog entry, which
 * makes GFL1 contamination impossible by construction.
 *
 * What iopwiki does NOT have, and why nothing here covers them:
 * - Per-skill icons. GFL2 doll pages render `File:Skill backup.png` (a shared
 *   placeholder) for nearly every skill; only ~10 real skill icons have ever
 *   been uploaded. Skill icons come from the Dandegate CDN instead, which has
 *   all of them (see `skill.imageUrl` in data/dolls.json).
 * - Key icons. iopwiki has no per-key art for GFL2 at all. Same story: the
 *   Dandegate CDN carries all of them via `key.imageUrl`.
 *
 * Content is CC BY-SA 3.0 — the credits page carries the attribution.
 *
 * Run with `npm run icons`.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const API_URL = 'https://iopwiki.com/api.php';
const USER_AGENT = 'GFL2TeamBuilder/1.0 (https://github.com/; icon sync)';

/** Where the downloaded icons land — served as /gfl2-icons/<name>.png. */
export const ICON_DIR = path.resolve(process.cwd(), 'web/public/gfl2-icons');

export const LICENSE = {
  source: 'https://iopwiki.com/wiki/IOP_Wiki',
  license: 'CC BY-SA 3.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
} as const;

export interface IconSpec {
  /** Output basename, written as `<name>.png`. */
  name: string;
  /** Exact iopwiki File: title. GFL2 only — see module header. */
  file: string;
}

/**
 * The GFL2 icon catalog.
 *
 * Class icons are the sidebar role icons (`GFL2 Icon *`); the Imago factor
 * variants (`GF2 * Imago`) are a separate set. The wiki uses the former for a
 * doll's identity row and its Remolding Core slots, and the latter for the
 * per-class Imago factor costs — the remolding pages here do the same.
 *
 * Phase and ammo icons come straight out of Template:GFL2WeakIcon. Weapon
 * types are deliberately absent: that template aliases every weapon type onto
 * an ammo icon (AR→medium, SMG/HG→light, RF/MG→heavy, SG→shotgun, BLD→melee)
 * because GFL2 has no distinct weapon-type art. The web layer reuses the ammo
 * icons for the weapon row the same way.
 */
export const ICON_CATALOG: IconSpec[] = [
  // Class — identity pills, filter row, and Remolding Core slots
  { name: 'class-bulwark', file: 'File:GFL2 Icon Bulwark.png' },
  { name: 'class-vanguard', file: 'File:GFL2 Icon Vanguard.png' },
  { name: 'class-support', file: 'File:GFL2 Icon Support.png' },
  { name: 'class-sentinel', file: 'File:GFL2 Icon Sentinel.png' },

  // Imago factors — the per-class remolding currency
  { name: 'imago-bulwark', file: 'File:GF2 Bulwark Imago.png' },
  { name: 'imago-vanguard', file: 'File:GF2 Vanguard Imago.png' },
  { name: 'imago-support', file: 'File:GF2 Support Imago.png' },
  { name: 'imago-sentinel', file: 'File:GF2 Sentinel Imago.png' },

  // Phase
  { name: 'phase-physical', file: 'File:GF2 physical icon.png' },
  { name: 'phase-burn', file: 'File:GF2 burn icon.png' },
  { name: 'phase-hydro', file: 'File:GF2 hydro icon.png' },
  { name: 'phase-electric', file: 'File:GF2 electric icon.png' },
  { name: 'phase-freeze', file: 'File:GF2 freeze icon.png' },
  { name: 'phase-corrosion', file: 'File:GF2 corrosion icon.png' },
  { name: 'phase-omni', file: 'File:GF2 omni icon.png' },

  // Ammo (also reused for the weapon-type row)
  { name: 'ammo-light', file: 'File:GF2 light icon.png' },
  { name: 'ammo-medium', file: 'File:GF2 medium icon.png' },
  { name: 'ammo-heavy', file: 'File:GF2 heavy icon.png' },
  { name: 'ammo-shotgun', file: 'File:GF2 shotgun icon.png' },
  { name: 'ammo-melee', file: 'File:GF2 melee icon.png' },
];

interface ImageInfo {
  url: string;
  thumburl?: string;
  sha1: string;
  mime: string;
  width: number;
  height: number;
  descriptionurl: string;
}

interface ImageInfoPage {
  title: string;
  missing?: boolean;
  imageinfo?: ImageInfo[];
}

/** One resolved icon, ready to download. */
export interface ResolvedIcon extends IconSpec {
  url: string;
  sha1: string;
  descriptionUrl: string;
}

export interface IconManifestEntry {
  name: string;
  path: string;
  sourceFile: string;
  descriptionUrl: string;
  sha1: string;
  bytes: number;
}

export interface IconManifest {
  syncedAt: string;
  source: string;
  license: string;
  licenseUrl: string;
  icons: IconManifestEntry[];
}

/**
 * Resolve File: titles to download URLs in one API round trip.
 *
 * `iiurlwidth` asks for a 64px-wide render so every icon lands at a uniform
 * size; MediaWiki omits `thumburl` when the original is already narrower than
 * the request, hence the fallback to `url`.
 */
export async function resolveIcons(
  specs: IconSpec[] = ICON_CATALOG
): Promise<ResolvedIcon[]> {
  const url = new URL(API_URL);
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url|sha1|mime|size');
  url.searchParams.set('iiurlwidth', '64');
  url.searchParams.set('titles', specs.map((s) => s.file).join('|'));

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(
      `iopwiki imageinfo failed: ${res.status} ${res.statusText}`
    );
  }

  const json = (await res.json()) as {
    query?: { pages?: ImageInfoPage[] };
  };
  const pages = json.query?.pages ?? [];

  // MediaWiki normalizes underscores/spaces and returns pages in arbitrary
  // order, so match on the normalized title rather than on position.
  const byTitle = new Map<string, ImageInfoPage>();
  for (const page of pages) {
    byTitle.set(page.title.replace(/_/g, ' '), page);
  }

  const resolved: ResolvedIcon[] = [];
  const missing: string[] = [];

  for (const spec of specs) {
    const page = byTitle.get(spec.file.replace(/_/g, ' '));
    const info = page?.imageinfo?.[0];
    if (!page || page.missing || !info) {
      missing.push(spec.file);
      continue;
    }
    resolved.push({
      ...spec,
      url: info.thumburl ?? info.url,
      sha1: info.sha1,
      descriptionUrl: info.descriptionurl,
    });
  }

  if (missing.length > 0) {
    throw new Error(
      `iopwiki is missing ${missing.length} catalog file(s): ${missing.join(', ')}`
    );
  }

  return resolved;
}

async function download(icon: ResolvedIcon): Promise<Buffer> {
  const res = await fetch(icon.url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) {
    throw new Error(
      `Download failed for ${icon.file}: ${res.status} ${res.statusText}`
    );
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Fetch the whole catalog into ICON_DIR and write manifest.json beside it.
 * Idempotent — files are overwritten with identical bytes on a re-run.
 */
export async function fetchIcons(
  specs: IconSpec[] = ICON_CATALOG
): Promise<IconManifest> {
  const resolved = await resolveIcons(specs);
  await mkdir(ICON_DIR, { recursive: true });

  const entries: IconManifestEntry[] = [];
  for (const icon of resolved) {
    const bytes = await download(icon);
    const filename = `${icon.name}.png`;
    await writeFile(path.join(ICON_DIR, filename), bytes);
    entries.push({
      name: icon.name,
      path: `/gfl2-icons/${filename}`,
      sourceFile: icon.file,
      descriptionUrl: icon.descriptionUrl,
      sha1: icon.sha1,
      bytes: bytes.byteLength,
    });
  }

  const manifest: IconManifest = {
    syncedAt: new Date().toISOString(),
    source: LICENSE.source,
    license: LICENSE.license,
    licenseUrl: LICENSE.licenseUrl,
    icons: entries,
  };

  await writeFile(
    path.join(ICON_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );

  return manifest;
}
