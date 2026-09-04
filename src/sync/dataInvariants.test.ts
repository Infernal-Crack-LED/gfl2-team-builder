/**
 * Two maintainer invariants on the committed dataset (rulings of 2026-09-04).
 * Both failures are SILENT — the JSON stays well-formed, the pages still
 * render — so nothing catches them except an explicit assertion.
 *
 * 1. No Chinese reaches the site. The audience is English-speaking. Where
 *    Global ships no official English yet, the datamine's registry
 *    (gfl2dm/translations*.py) supplies our own, keyed on the exact emitted
 *    string so it self-retires the day Global localises the text. A CJK
 *    string here is a bug, never "just untranslated data".
 *
 * 2. Every doll, weapon, key and skill has art, and the file is on disk. If a
 *    character is in the game files then their art is in the bundles —
 *    always. A null URL therefore never means "the game doesn't have it", it
 *    means the asset pipeline was not re-run (`gfl2dm.assets decrypt` then
 *    `scan`, `extract`, `webp`; both the decrypt and the scan skip on bundle
 *    NAME, and a patch rewrites bundles under their existing names, so a
 *    resumed pass can silently describe the previous version).
 *
 * Reads the committed files straight off disk rather than through
 * `web/src/data.ts`: the invariant is about the artifacts the site is built
 * from, and the fixes live in the datamine, not in the app.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = join(import.meta.dirname, '..', '..');
const DATA_DIR = join(REPO, 'data');
const PUBLIC_DIR = join(REPO, 'web', 'public');

/** CJK ideographs — the block the game's Chinese text actually uses. */
const CJK = /[一-鿿]/;

interface Skill {
  name: string | null;
  imageUrl: string | null;
}
interface Doll {
  name: string;
  avatarUrl: string | null;
  skills: Skill[];
}
interface Weapon {
  name: string;
  imageUrl: string | null;
}
interface Key {
  displayTitle: string | null;
  keyTitle: string | null;
  imageUrl: string | null;
}

function load<T>(file: string, key: string): T[] {
  const payload = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf-8'));
  return payload[key] as T[];
}

const dolls = load<Doll>('dolls.json', 'dolls');
const weapons = load<Weapon>('weapons.json', 'weapons');
const keys = load<Key>('keys.json', 'keys');

describe('committed dataset invariants', () => {
  it('ships no Chinese in any data file', () => {
    const offenders: string[] = [];
    for (const file of readdirSync(DATA_DIR)) {
      if (!file.endsWith('.json')) {
        continue;
      }
      const text = readFileSync(join(DATA_DIR, file), 'utf-8');
      if (!CJK.test(text)) {
        continue;
      }
      // Name the carrying lines, not the whole file, so the failure points at
      // the records that need translating.
      const lines = text
        .split('\n')
        .filter((line: string) => CJK.test(line))
        .slice(0, 5)
        .map((line: string) => line.trim().slice(0, 120));
      offenders.push(`${file}:\n    ${lines.join('\n    ')}`);
    }
    expect(
      offenders,
      'Untranslated Chinese in the committed data. Add the EXACT emitted ' +
        'string to gfl2dm/translations*.py, then re-run appformat and ' +
        'export:datamine — do not patch the app around it.'
    ).toEqual([]);
  });

  it('gives every doll, weapon, key and skill art that exists on disk', () => {
    const missingUrl: string[] = [];
    const missingFile: string[] = [];

    const check = (label: string, url: string | null) => {
      if (!url) {
        missingUrl.push(label);
      } else if (!existsSync(join(PUBLIC_DIR, url))) {
        missingFile.push(`${label} -> ${url}`);
      }
    };

    for (const doll of dolls) {
      check(`doll ${doll.name}`, doll.avatarUrl);
      for (const skill of doll.skills) {
        check(`skill ${doll.name}/${skill.name}`, skill.imageUrl);
      }
    }
    for (const weapon of weapons) {
      check(`weapon ${weapon.name}`, weapon.imageUrl);
    }
    for (const key of keys) {
      check(`key ${key.displayTitle ?? key.keyTitle}`, key.imageUrl);
    }

    const hint =
      ' Art is never legitimately absent: re-run the datamine art pipeline ' +
      '(assets decrypt --index, scan, extract, webp).';
    expect(missingUrl, `Records with no art URL.${hint}`).toEqual([]);
    expect(missingFile, `Art URLs with no file behind them.${hint}`).toEqual(
      []
    );
  });

  it('names every art file after the record it belongs to', () => {
    // The extractor slugs the file from the record's name, so a stem that no
    // longer matches means the art was extracted BEFORE the name was and the
    // file is stale. That is how Cecilia's keys and skills shipped as
    // `<id>-unnamed`, and how her two G36 variants — both slugging to "36"
    // while still Chinese — collided on one file and overwrote each other's
    // art. Comparing against the name rather than against a "looks Chinese"
    // heuristic also lets a legitimately numeric name like "416" through.
    const slugify = (name: string): string =>
      name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/^-+|-+$/g, '') || 'unnamed';

    /**
     * The file stem, minus the `<gameId>-` prefix that ONLY key and skill
     * files carry. Stripping a leading number unconditionally would eat the
     * name of every weapon called ".50 Nemesis" or ".408 Sniper Rifle".
     */
    const nameOf = (url: string, idPrefixed: boolean): string => {
      const stem = (url.split('/').pop() ?? '').replace(/\.\w+$/, '');
      return idPrefixed ? stem.replace(/^\d+-/, '') : stem;
    };

    const stale: string[] = [];
    const check = (
      url: string | null,
      name: string | null,
      idPrefixed = false
    ) => {
      if (!url || !name) {
        return; // absence is the previous test's finding, not this one's
      }
      if (nameOf(url, idPrefixed) !== slugify(name)) {
        stale.push(`${name}: ${url} (expected .../${slugify(name)})`);
      }
    };

    for (const doll of dolls) {
      check(doll.avatarUrl, doll.name);
      for (const skill of doll.skills) {
        check(skill.imageUrl, skill.name, true);
      }
    }
    for (const weapon of weapons) {
      check(weapon.imageUrl, weapon.name);
    }
    for (const key of keys) {
      check(key.imageUrl, key.displayTitle ?? key.keyTitle, true);
    }

    expect(
      stale,
      'Art filenames disagree with their record name — the art predates the ' +
        'name. Re-run the datamine extract and webp after translating.'
    ).toEqual([]);
  });
});
