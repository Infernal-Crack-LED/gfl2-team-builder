/**
 * Guards the two things that used to leak raw data onto the detail pages:
 * unresolved `[<kind>:<uuid>]` markers, and the vertebrae / remolding-pattern
 * blobs that the sync pipeline stores verbatim.
 */
import { describe, expect, it } from 'vitest';
import {
  allDolls,
  allEffects,
  allKeys,
  allWeapons,
  getEffectDetails,
  getRemoldingPattern,
  getVertebraeForDoll,
  resolveEffectMarkers,
} from './data';

/** Every game-text field that reaches a page, across the whole dataset. */
function allGameText(): string[] {
  const texts: string[] = [];
  for (const doll of allDolls) {
    for (const skill of doll.skills) {
      texts.push(
        skill.description ?? '',
        skill.descriptionLevel2 ?? '',
        skill.descriptionLevel3 ?? '',
        skill.descriptionLevel4 ?? ''
      );
    }
    for (const vert of getVertebraeForDoll(doll)) {
      texts.push(vert.effect ?? '');
    }
    for (const form of getRemoldingPattern(doll)?.imagoforms ?? []) {
      texts.push(form.effect ?? '');
    }
    texts.push(doll.bio ?? '');
  }
  for (const key of allKeys) {
    texts.push(key.effect ?? '');
  }
  for (const weapon of allWeapons) {
    texts.push(weapon.trait ?? '', weapon.effect ?? '');
    texts.push(weapon.imprintDescription ?? '');
  }
  for (const effect of allEffects) {
    const details = getEffectDetails(effect);
    texts.push(details.main ?? '');
    for (const upgrade of details.upgrades) {
      texts.push(upgrade.details ?? '');
    }
  }
  return texts.filter((t) => t !== '');
}

describe('resolveEffectMarkers', () => {
  it('leaves no raw marker anywhere in the dataset', () => {
    const unresolved = new Set<string>();
    for (const text of allGameText()) {
      for (const seg of resolveEffectMarkers(text)) {
        if (typeof seg !== 'string') {
          continue;
        }
        for (const m of seg.matchAll(/\[[a-z]+:[^\]]+\]/gi)) {
          unresolved.add(m[0]);
        }
      }
    }
    expect([...unresolved]).toEqual([]);
  });

  it('resolves each marker kind the data actually uses', () => {
    const kinds = new Set<string>();
    for (const text of allGameText()) {
      for (const seg of resolveEffectMarkers(text)) {
        if (typeof seg !== 'string' && seg.resolved) {
          kinds.add(seg.kind);
        }
      }
    }
    expect(kinds).toEqual(
      new Set(['effect', 'summon', 'dollSkill', 'skillsummon', 'key'])
    );
  });

  it('resolves pipe-form markers (UUID|doll:slug) by UUID', () => {
    const text = allGameText().find(
      (t) => t.includes('|doll:') && !t.includes('[effect:humiliation-mark')
    );
    expect(text).toBeDefined();
    const segments = resolveEffectMarkers(text!);
    expect(
      segments.some((seg) => typeof seg !== 'string' && seg.resolved)
    ).toBe(true);
  });

  it('names a slug-form marker from its slug when the id is unknown', () => {
    const [seg] = resolveEffectMarkers(
      '[effect:humiliation-mark|doll:florence]'
    );
    expect(seg).toEqual({
      kind: 'effect',
      id: 'humiliation-mark',
      name: 'Humiliation Mark',
      resolved: false,
    });
  });

  it('degrades an unknown UUID to a readable noun, never the raw id', () => {
    const [seg] = resolveEffectMarkers(
      'gains [summon:00000000-0000-4000-8000-000000000000]'
    );
    expect(seg).toBe('gains ');
    expect(
      resolveEffectMarkers('[summon:00000000-0000-4000-8000-000000000000]')[0]
    ).toEqual({
      kind: 'summon',
      id: '00000000-0000-4000-8000-000000000000',
      name: 'unlisted summon',
      resolved: false,
    });
  });
});

describe('getEffectDetails', () => {
  it('never surfaces a serialized blob as prose', () => {
    for (const text of allGameText()) {
      expect(text).not.toMatch(/"(mainDetails|upgradeDetails|upgradeName)"/);
      expect(text.trimStart().startsWith('{')).toBe(false);
    }
  });

  it('splits the JSON form into base text plus V-level upgrades', () => {
    const brumal = allEffects.find((e) => e.effectName === 'Brumal Barrier');
    expect(brumal).toBeDefined();
    const { main, upgrades } = getEffectDetails(brumal!);

    expect(main).toContain('Considered a Shield');
    expect(main).not.toContain('mainDetails');
    expect(upgrades.map((u) => u.name)).toEqual(['V3', 'V6']);
    for (const upgrade of upgrades) {
      expect(upgrade.details).toContain('Considered a Shield');
    }
  });

  it('passes plain-text details straight through', () => {
    const plain = allEffects.find(
      (e) => e.effectDetails && !e.effectDetails.trimStart().startsWith('{')
    );
    expect(plain).toBeDefined();
    const { main, upgrades } = getEffectDetails(plain!);
    expect(main).toBe(plain!.effectDetails);
    expect(upgrades).toEqual([]);
  });
});

describe('getVertebraeForDoll', () => {
  it('returns segments in order with the HTML stripped', () => {
    for (const doll of allDolls) {
      const verts = getVertebraeForDoll(doll);
      const segments = verts.map((v) => v.segment);
      expect(segments).toEqual([...segments].sort((a, b) => a - b));
      for (const vert of verts) {
        expect(vert.effect ?? '').not.toMatch(/<[a-z/]/i);
        expect(vert.name).toBeTruthy();
      }
    }
  });
});

describe('getRemoldingPattern', () => {
  it('distills core, slots, stat boosts, and imago stages', () => {
    for (const doll of allDolls) {
      const pattern = getRemoldingPattern(doll);
      if (!pattern) {
        continue;
      }
      // Slots cover all four classes; factors list only the non-zero ones.
      expect(pattern.coreSlots).toHaveLength(4);
      expect(pattern.coreSlots.some((s) => s.value > 0)).toBe(true);
      for (const boost of pattern.statBoosts) {
        expect(Number.isFinite(boost.level)).toBe(true);
        expect(boost.stats.length).toBeGreaterThan(0);
      }
      const levels = pattern.imagoforms.map((f) => f.coreLevel ?? 0);
      expect(levels).toEqual([...levels].sort((a, b) => a - b));
      for (const form of pattern.imagoforms) {
        expect(form.effect ?? '').not.toMatch(/<[a-z/]/i);
        expect(form.factors.every((f) => f.value > 0)).toBe(true);
      }
    }
  });
});
