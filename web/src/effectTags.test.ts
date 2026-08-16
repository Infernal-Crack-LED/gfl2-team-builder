/**
 * Integration tests for the effect-tag index against the real committed data
 * (`data/effect-tags.json` + `data/effect-matrix.json`). If the derive rules
 * change, regenerate with `npm run derive` and update expectations here.
 */

import { describe, expect, it } from 'vitest';
import { allEffects } from './data';
import {
  effectTagLabel,
  effectsWithTag,
  effectTagsByGroup,
  getEffectTags,
  sourcesForTag,
} from './effectTags';

function effectIdByName(name: string): string {
  const found = allEffects.find((e) => e.effectName === name);
  if (!found) {
    throw new Error(`effect not found in data: ${name}`);
  }
  return found.id;
}

describe('getEffectTags', () => {
  it('tags Defense Down II as defense-down + debuff', () => {
    const tags = getEffectTags(effectIdByName('Defense Down II'));
    expect(tags).toContain('defense-down');
    expect(tags).toContain('debuff');
  });

  it('tags Countershock despite empty upstream tags', () => {
    const countershock = allEffects.find(
      (e) => e.effectName === 'Countershock'
    );
    expect(countershock?.effectTags ?? []).toHaveLength(0);
    expect(getEffectTags(effectIdByName('Countershock'))).toContain(
      'defense-down'
    );
  });

  it('tags Suomi-shaped healing effects as healing', () => {
    expect(getEffectTags(effectIdByName('Continuous Healing I'))).toEqual(
      expect.arrayContaining(['healing', 'buff'])
    );
  });

  it('returns an empty array for unknown ids', () => {
    expect(getEffectTags('not-a-real-id')).toEqual([]);
  });
});

describe('effectsWithTag', () => {
  it('returns only effects carrying the tag', () => {
    const effects = effectsWithTag('defense-down');
    expect(effects.length).toBeGreaterThan(20);
    for (const effect of effects) {
      expect(getEffectTags(effect.effectId)).toContain('defense-down');
    }
    expect(effects.map((e) => e.effectName)).toContain('Defense Down II');
  });
});

describe('sourcesForTag ("all sources of defense down")', () => {
  it('returns source edges for every tagged effect', () => {
    const sources = sourcesForTag('defense-down');
    expect(sources.length).toBeGreaterThan(0);
    for (const { effect, source } of sources) {
      expect(getEffectTags(effect.effectId)).toContain('defense-down');
      expect(['applies', 'gains']).toContain(source.relation);
    }
  });

  it('includes doll skill sources', () => {
    const sources = sourcesForTag('defense-down');
    expect(sources.some((s) => s.source.kind === 'skill')).toBe(true);
  });
});

describe('vocabulary', () => {
  it('labels every tag and groups them', () => {
    expect(effectTagLabel('defense-down')).toBe('Defense Down');
    expect(effectTagLabel('no-such-tag')).toBe('no-such-tag');
    const groups = effectTagsByGroup();
    expect(groups.map((g) => g.group)).toEqual(
      expect.arrayContaining([
        'Polarity',
        'Buffs',
        'Debuffs',
        'Elements',
        'Meta',
      ])
    );
    for (const { tags } of groups) {
      for (const tag of tags) {
        expect(tag.label).toBe(effectTagLabel(tag.id));
      }
    }
  });
});
