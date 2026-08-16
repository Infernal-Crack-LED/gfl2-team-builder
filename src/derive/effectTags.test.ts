import { describe, expect, it } from 'vitest';
import {
  buildEffectTags,
  normalizeDetails,
  EFFECT_TAG_DEFS,
} from './effectTags.js';

let nextId = 0;
function effect(
  effectName: string,
  effectDetails: string,
  effectTags: string[] = []
): Record<string, unknown> {
  nextId += 1;
  return {
    id: `00000000-0000-0000-0000-${String(nextId).padStart(12, '0')}`,
    effectName,
    effectDetails,
    effectTags,
  };
}

function tagsFor(row: Record<string, unknown>): string[] {
  const { file } = buildEffectTags([row]);
  return file.tags[String(row.id)] ?? [];
}

describe('normalizeDetails', () => {
  it('passes plain text through', () => {
    expect(normalizeDetails('Reduce defense by 20%.')).toBe(
      'Reduce defense by 20%.'
    );
  });

  it('extracts text from a JSON-string payload', () => {
    const raw = JSON.stringify({
      mainDetails: 'Defense is increased by 10%.',
      upgrades: [{ id: 'abc', description: 'Attack is increased by 5%.' }],
    });
    const text = normalizeDetails(raw);
    expect(text).toContain('Defense is increased by 10%.');
    expect(text).toContain('Attack is increased by 5%.');
  });

  it('falls back to lenient extraction when the JSON is malformed', () => {
    // raw newline inside the string value makes JSON.parse fail
    const raw = '{"mainDetails":"Line one.\nLine two: defense is reduced."}';
    expect(normalizeDetails(raw)).toContain('defense is reduced');
  });
});

describe('buildEffectTags polarity', () => {
  it('derives buff/debuff from upstream tags', () => {
    expect(tagsFor(effect('A', 'Something.', ['Buff']))).toContain('buff');
    expect(tagsFor(effect('A', 'Something.', ['Debuff']))).toContain('debuff');
  });

  it('derives polarity from the "considered a" sentence', () => {
    expect(
      tagsFor(
        effect('A', 'Increase defense by 10%. This is considered a buff.')
      )
    ).toContain('buff');
    expect(
      tagsFor(
        effect('A', 'Reduce defense by 20%. Considered a defense debuff.')
      )
    ).toContain('debuff');
    expect(
      tagsFor(
        effect(
          'A',
          'Damage taken is increased. Considered a neutral status effect.'
        )
      )
    ).toContain('neutral');
  });

  it('treats "this buff/debuff" phrasing as polarity', () => {
    expect(
      tagsFor(effect('A', 'It does things. This buff cannot be cleansed.'))
    ).toContain('buff');
  });
});

describe('buildEffectTags stat direction', () => {
  it('tags defense reduction as defense-down even with no upstream tags', () => {
    // Countershock-shaped: upstream tags are empty
    const tags = tagsFor(
      effect(
        'Countershock',
        'Defense is reduced by 10%. Maximum of 3 stacks. Considered a debuff, cannot be cleansed.'
      )
    );
    expect(tags).toContain('defense-down');
    expect(tags).toContain('debuff');
    expect(tags).toContain('uncleansable');
    expect(tags).not.toContain('defense-up');
  });

  it('tags defense increase as defense-up', () => {
    const tags = tagsFor(
      effect(
        'Defense Boost',
        'Defense is increased by 30%. Defense-type buff, cannot be cleansed.'
      )
    );
    expect(tags).toContain('defense-up');
    expect(tags).toContain('buff');
    expect(tags).not.toContain('defense-down');
  });

  it('upstream Defense+Debuff alone implies defense-down', () => {
    expect(
      tagsFor(
        effect('Mystery', 'No directional wording here.', ['Defense', 'Debuff'])
      )
    ).toContain('defense-down');
  });

  it('distinguishes attack-up from attack-down', () => {
    expect(
      tagsFor(effect('A', 'Attack is increased by 10%. Considered a buff.'))
    ).toContain('attack-up');
    expect(
      tagsFor(
        effect(
          'Feeble',
          'Attack is reduced by 30%. Considered an attack debuff.'
        )
      )
    ).toContain('attack-down');
  });

  it('does not tag "damage taken is increased" as damage-up', () => {
    const tags = tagsFor(
      effect('A', 'Damage taken is increased by 15%. Considered a debuff.')
    );
    expect(tags).toContain('damage-taken-up');
    expect(tags).not.toContain('damage-up');
  });

  it('tags ignore-defense separately from defense-down', () => {
    const tags = tagsFor(
      effect(
        'A',
        "When attacking, ignores 20% of the target's defense. Considered a buff."
      )
    );
    expect(tags).toContain('ignore-defense');
    expect(tags).not.toContain('defense-down');
  });

  it('tags anti-heal without tagging healing', () => {
    const tags = tagsFor(
      effect('Congestion', 'Cannot be healed. Considered a Hydro debuff.')
    );
    expect(tags).toContain('anti-heal');
    expect(tags).toContain('hydro');
    expect(tags).toContain('debuff');
    expect(tags).not.toContain('healing');
  });

  it('tags movement prevention as movement-down', () => {
    expect(
      tagsFor(
        effect(
          'Frigid',
          'Unable to move and cannot be actively displaced. Considered a Freeze movement debuff.'
        )
      )
    ).toEqual(expect.arrayContaining(['movement-down', 'freeze', 'debuff']));
  });

  it('tags control effects', () => {
    expect(
      tagsFor(
        effect(
          'Iced',
          'Command Prohibition. Unable to act. Removed after taking damage.'
        )
      )
    ).toContain('control');
  });

  it('tags shields but not mere shield mentions', () => {
    expect(
      tagsFor(
        effect(
          'Forcefield',
          'Generates a shield with HP equal to 10% of max HP.'
        )
      )
    ).toContain('shield');
    expect(
      tagsFor(
        effect(
          'Initial Damage',
          'Damage before shield protection and cover damage reduction.'
        )
      )
    ).not.toContain('shield');
  });

  it('tags damage-over-time', () => {
    expect(
      tagsFor(
        effect(
          'Corrosive Slime',
          "At the start of this unit's turn, it takes fixed damage equal to 30% of attack."
        )
      )
    ).toContain('dot');
  });
});

describe('buildEffectTags file shape', () => {
  it('produces a deterministic, sorted sidecar map', () => {
    const rows = [
      effect('B', 'Defense is reduced by 20%. Considered a defense debuff.'),
      effect('A', 'Attack is increased by 10%. Considered a buff.'),
    ];
    // reverse input order; output must not depend on it
    const { file } = buildEffectTags([...rows].reverse());
    const ids = Object.keys(file.tags);
    expect(ids).toEqual([...ids].sort());
    for (const tags of Object.values(file.tags)) {
      expect(tags).toEqual([...tags].sort());
    }
  });

  it('omits effects that earn no tags and lists them in stats', () => {
    const tagged = effect(
      'A',
      'Defense is reduced by 20%. Considered a debuff.'
    );
    const untaggedRow = effect('B', 'A purely cosmetic aura.');
    const { file, stats } = buildEffectTags([tagged, untaggedRow]);
    expect(Object.keys(file.tags)).toHaveLength(1);
    expect(stats.effectsTagged).toBe(1);
    expect(stats.untagged).toEqual(['B']);
  });

  it('vocabulary covers every defined tag', () => {
    const { file } = buildEffectTags([]);
    expect(Object.keys(file.vocabulary).sort()).toEqual(
      EFFECT_TAG_DEFS.map((d) => d.id).sort()
    );
  });
});
