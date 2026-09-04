import { describe, expect, it } from 'vitest';
import { assignSlugs } from './writeData.js';

describe('assignSlugs', () => {
  it('derives slugs from names and disambiguates collisions by region', () => {
    const rows = assignSlugs([
      { name: 'Groza', regionTag: 'en' },
      { name: 'Groza', regionTag: 'cn' },
      { name: 'Groza', regionTag: 'cn' },
      { name: "Maid's Rules", regionTag: null },
    ]);
    expect(rows.map((r) => r.slug)).toEqual([
      'groza',
      'groza-cn',
      'groza-2',
      'maids-rules',
    ]);
  });

  it('falls back to the game id for a name without Latin letters', () => {
    // A CN-only record ships under its Chinese name until Global localises
    // it; slugify would strip that to "" or "36-" — a dead or colliding URL.
    const rows = assignSlugs([
      { name: '斯诺特拉', regionTag: 'cn', gunWeaponDataId: 10823 },
      { name: '格威尔36-康派科特', regionTag: 'cn', gunWeaponDataId: 10822 },
      {
        name: '旧式格威尔36-康派科特',
        regionTag: 'cn',
        gunWeaponDataId: 10821,
      },
      { name: '塞西莉亚', regionTag: 'cn', gunDataId: 1082 },
    ]);
    expect(rows.map((r) => r.slug)).toEqual([
      '10823',
      '10822',
      '10821',
      '1082',
    ]);
  });

  it('keeps a Latin name even when it carries digits or punctuation', () => {
    // "416" is a real weapon name and a live URL — digits alone must not
    // trigger the id fallback.
    const rows = assignSlugs([
      { name: 'OTs-14', regionTag: 'en', gunDataId: 1074 },
      { name: 'Nemesis: Gnosis', regionTag: 'en', gunDataId: 1075 },
      { name: '416', regionTag: 'en', gunWeaponDataId: 10522 },
    ]);
    expect(rows.map((r) => r.slug)).toEqual([
      'ots-14',
      'nemesis-gnosis',
      '416',
    ]);
  });
});
