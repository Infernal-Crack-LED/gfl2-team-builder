import { describe, expect, it } from 'vitest';
import {
  buildEffectMatrix,
  classifyRelation,
  extractRefs,
  extractSentence,
  type DeriveInput,
  type Relation,
} from './effectMatrix.js';

const UUID_A = '00000000-0000-0000-0000-00000000000a';
const UUID_B = '00000000-0000-0000-0000-00000000000b';
const UUID_C = '00000000-0000-0000-0000-00000000000c';
const UUID_D = '00000000-0000-0000-0000-00000000000d';
const UUID_MISSING = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

describe('extractRefs', () => {
  it('extracts plain markers with positions', () => {
    const text = `deals damage and applies [effect:${UUID_A}] for 2 turns`;
    const refs = extractRefs(text);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.effectId).toBe(UUID_A);
    expect(refs[0]!.dollSlug).toBeNull();
    expect(text.slice(refs[0]!.start, refs[0]!.end)).toBe(`[effect:${UUID_A}]`);
  });

  it('extracts pipe-form markers with the doll slug', () => {
    const refs = extractRefs(`applies [effect:${UUID_A}|doll:helen] to it`);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.effectId).toBe(UUID_A);
    expect(refs[0]!.dollSlug).toBe('helen');
  });

  it('normalizes uppercase hex in markers', () => {
    const refs = extractRefs(`applies [effect:${UUID_A.toUpperCase()}]`);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.effectId).toBe(UUID_A);
  });

  it('extracts multiple markers', () => {
    const refs = extractRefs(`[effect:${UUID_A}] and [effect:${UUID_B}]`);
    expect(refs.map((r) => r.effectId)).toEqual([UUID_A, UUID_B]);
  });
});

describe('extractSentence', () => {
  it('bounds the snippet at sentence boundaries', () => {
    const text = `First sentence. Applies [effect:${UUID_A}] here. Next one.`;
    const markerStart = text.indexOf('[effect:');
    const markerEnd = markerStart + `[effect:${UUID_A}]`.length;
    const { sentence, prefix } = extractSentence(text, markerStart, markerEnd);
    expect(sentence).toBe(`Applies [effect:${UUID_A}] here`);
    // prefix starts right after the sentence boundary (leading space kept —
    // classification splits on whitespace anyway)
    expect(prefix).toBe(' Applies ');
  });

  it('handles a marker at the start of the text', () => {
    const text = `[effect:${UUID_A}] gains a new effect`;
    const { sentence, prefix } = extractSentence(
      text,
      0,
      `[effect:${UUID_A}]`.length
    );
    expect(sentence).toBe(`[effect:${UUID_A}] gains a new effect`);
    expect(prefix).toBe('');
  });
});

describe('classifyRelation', () => {
  const cases: [string, string][] = [
    ['Selects one allied unit and applies ', 'applies'],
    ['apply ', 'applies'],
    ['the target is inflicted with ', 'applies'],
    ['Gains ', 'gains'],
    ['she gains ', 'gains'],
    ['Generates 2 stacks of ', 'gains'],
    ['she enters ', 'gains'],
    ['launches ', 'gains'],
    ['summons ', 'gains'],
    ['performs ', 'gains'],
    ['is replaced with ', 'gains'],
    ['changes to ', 'gains'],
    ['and removes ', 'removes'],
    ['cleanses ', 'removes'],
    ['consumes 3 stacks of ', 'removes'],
    ['When attacking a target with ', 'conditional'],
    ['attempts to attack this unit with ', 'conditional'],
    ['If they have a ', 'conditional'],
    ['While this unit has ', 'conditional'],
    ['while in ', 'conditional'],
    ['Upon being afflicted with ', 'conditional'],
    ['immune to ', 'conditional'],
    ['before ', 'conditional'],
    ['Increases the effect of ', 'enhances'],
    ['The effectiveness of ', 'enhances'],
    ['Damage multiplier of ', 'enhances'],
    ['the duration of ', 'enhances'],
    ['For each stack of ', 'conditional'],
    ['If Alva has 3 stacks of ', 'conditional'],
    ['the number of ', 'conditional'],
    ['', 'mentions'],
    // includes — category membership
    ['Includes ', 'includes'],
    ['Shield include ', 'includes'],
    ['including damage dealt by ', 'includes'],
    // considered — action classification
    ['This attack is considered a ', 'considered'],
    ['is considered an ', 'considered'],
    // immunity — including list forms where "immune to" is not adjacent
    ['Immune to all damage types and ', 'conditional'],
    ['become immune to ', 'conditional'],
    // trigger / count conditionals
    ['Each time ', 'conditional'],
    ['Every 2 times ', 'conditional'],
    ['If 4 or more instances of ', 'conditional'],
    ['For each turn ', 'conditional'],
    ['The first time ', 'conditional'],
    // clause lead-ins between the keyword and the marker
    ['when casting ', 'conditional'],
    ['when the target that ', 'conditional'],
    ['If the selected tile is either ', 'conditional'],
    // change-of-state base forms
    ['Can switch to ', 'gains'],
    ['it transforms into ', 'gains'],
    ['is upgraded to ', 'gains'],
    ['is accumulated into ', 'gains'],
    ['Basti leaves ', 'applies'],
    ['resets its ', 'removes'],
    // enhances nouns / prepositions
    ['The damage muliplier of ', 'enhances'],
    ['The maximum activations of ', 'enhances'],
    ['The defense reduction for ', 'enhances'],
    ['Damage dealt by this unit\u2019s ', 'enhances'],
    ['The range of the ', 'enhances'],
    ['Increase stability damage of ', 'enhances'],
    ['All multipliers for attacks by ', 'enhances'],
    // before/after clause lead-ins
    ['Before a ', 'conditional'],
    ['Before Basti or a ', 'conditional'],
    ['After launching ', 'conditional'],
    ['for every 10 points of ', 'conditional'],
  ];

  for (const [prefix, expected] of cases) {
    it(`classifies "${prefix.trim() || '(empty)'}..." as ${expected}`, () => {
      expect(classifyRelation(prefix)).toBe(expected);
    });
  }

  it('classifies stacked markers from the shared lead-in', () => {
    const prefix = `When afflicted with [effect:${UUID_A}], [effect:${UUID_B}], `;
    expect(classifyRelation(prefix)).toBe('conditional');
  });

  it('lets a nearby verb win over a distant clause', () => {
    expect(classifyRelation('gains 2 stacks of ')).toBe('gains');
  });

  it('classifies a second stacked ref after a comma + determiner', () => {
    const prefix = `If Nemesis has [effect:${UUID_A}], the `;
    expect(classifyRelation(prefix)).toBe('conditional');
  });

  // --- Suffix-based (subject-position) classification ---

  const suffixCases: [string, string, Relation][] = [
    ['', ' is enhanced: Attack is increased by 15%', 'enhances'],
    ['', ' gains a new effect: when the bearer dies', 'enhances'],
    ['', ' is no longer removed', 'enhances'],
    ['', ' is no longer expended', 'enhances'],
    ['', ' is upgraded to something else', 'enhances'],
    // stacked subjects — leading junctions/masked markers are dropped
    ['', ' , and are enhanced: hydro damage is increased', 'enhances'],
    // non-enhancement subjects stay unclassified
    ['', ' cannot co-exist', 'mentions'],
    ['', ' can be triggered one additional time', 'mentions'],
  ];

  for (const [prefix, suffix, expected] of suffixCases) {
    it(`classifies subject-marker suffix "${suffix.trim()}" as ${expected}`, () => {
      expect(classifyRelation(prefix, suffix)).toBe(expected);
    });
  }
});

function findEffect(file: { effects: { effectId: string }[] }, id: string) {
  return file.effects.find((e) => e.effectId === id);
}

describe('buildEffectMatrix', () => {
  const input: DeriveInput = {
    dolls: [
      {
        id: 'doll-1',
        name: 'Test Doll',
        skills: [
          {
            id: 'skill-1',
            name: 'Test Skill',
            skillType: 'Skill 2',
            description: `Selects an ally and applies [effect:${UUID_A}] to it for 2 turns.`,
            descriptionLevel2: `Selects an ally and applies [effect:${UUID_A}] to it for 3 turns. Also gains [effect:${UUID_B}].`,
          },
        ],
        vertebrae: [
          {
            id: 'vert-1',
            level: 2,
            segment: 1,
            effect: `<p>The effectiveness of [effect:${UUID_A}] is increased.</p>`,
          },
        ],
        weaponImprint: {
          name: 'Test Weapon',
          effect: `<p>If they have a [effect:${UUID_C}], damage is increased. Also applies [effect:${UUID_D}].</p>`,
        },
        remoldingPattern: {
          imagoforms: [
            {
              stage: 'Embryo',
              effect: `<p>Applies [effect:${UUID_D}] to the target.</p>`,
            },
          ],
        },
      },
    ],
    weapons: [
      {
        id: 'weapon-1',
        name: 'Test Weapon',
        imprintDollId: 'doll-1',
        effect: `If they have a [effect:${UUID_C}], damage is increased.`,
        imprintDescription: null,
      },
    ],
    keys: [
      {
        id: 'key-1',
        keyTitle: 'Test Key',
        keyType: 'Fixed Key',
        level: 1,
        dollId: 'doll-1',
        effect: `While this unit has [effect:${UUID_A}], damage dealt is increased.`,
      },
    ],
    effects: [
      {
        id: UUID_A,
        effectName: 'Barrier',
        effectDetails: `When [effect:${UUID_B}] is destroyed, apply [effect:${UUID_MISSING}] for 1 turn.`,
        effectTags: ['Buff', 'Defense'],
        dollId: null,
      },
      {
        id: UUID_B,
        effectName: 'Alert',
        effectDetails: null,
        effectTags: ['Buff'],
        dollId: 'doll-1',
      },
      {
        id: UUID_C,
        effectName: 'Shield',
        effectDetails: null,
        effectTags: ['Buff'],
        dollId: null,
      },
      {
        id: UUID_D,
        effectName: 'Imprint Only',
        effectDetails: null,
        effectTags: [],
        dollId: null,
      },
    ],
  };

  const { file, stats } = buildEffectMatrix(input);

  it('splits applies/gains into sources and the rest into interactions', () => {
    const barrier = findEffect(file, UUID_A)!;
    expect(
      barrier.sources.some(
        (e) =>
          e.kind === 'skill' &&
          e.relation === 'applies' &&
          e.skillType === 'Skill 2'
      )
    ).toBe(true);
    expect(
      barrier.interactions.some(
        (e) => e.kind === 'key' && e.relation === 'conditional'
      )
    ).toBe(true);
    expect(
      barrier.interactions.some(
        (e) => e.kind === 'vertebrae' && e.relation === 'enhances'
      )
    ).toBe(true);
  });

  it('merges skill levels across description variants', () => {
    const barrier = findEffect(file, UUID_A)!;
    const skillEdge = barrier.sources.find((e) => e.kind === 'skill')!;
    expect(skillEdge.levels).toEqual([1, 2]);
  });

  it('classifies a self-gain from a level-2 description', () => {
    const alert = findEffect(file, UUID_B)!;
    expect(
      alert.sources.some(
        (e) =>
          e.kind === 'skill' && e.relation === 'gains' && e.levels.includes(2)
      )
    ).toBe(true);
    // exclusive ownership is denormalized
    expect(alert.exclusiveDollId).toBe('doll-1');
    expect(alert.exclusiveDollName).toBe('Test Doll');
  });

  it('records effect→effect interactions', () => {
    const alert = findEffect(file, UUID_B)!;
    expect(
      alert.interactions.some(
        (e) =>
          e.kind === 'effect' &&
          e.effectId === UUID_A &&
          e.relation === 'conditional'
      )
    ).toBe(true);
  });

  it('dedupes weaponImprint refs already covered by the weapons table', () => {
    const shield = findEffect(file, UUID_C)!;
    // "If they have a [Shield]" is a condition — weapon edge in interactions
    const shieldEdges = [...shield.sources, ...shield.interactions];
    expect(shieldEdges.some((e) => e.kind === 'weapon')).toBe(true);
    // covered by the weapons row — no duplicate doll weapon-imprint edge
    expect(shieldEdges.some((e) => e.kind === 'weapon-imprint')).toBe(false);
    // UUID_D only exists on the doll weaponImprint — it must still be captured
    const imprintOnly = findEffect(file, UUID_D)!;
    expect(
      imprintOnly.sources.some(
        (e) => e.kind === 'weapon-imprint' && e.dollId === 'doll-1'
      )
    ).toBe(true);
  });

  it('extracts the imagoform stage name for remolding edges', () => {
    const imprintOnly = findEffect(file, UUID_D)!;
    expect(
      imprintOnly.sources.some(
        (e) => e.kind === 'remolding' && e.stage === 'Embryo'
      )
    ).toBe(true);
  });

  it('collects unresolved refs instead of crashing', () => {
    expect(
      file.unresolvedRefs.some(
        (r) => r.effectId === UUID_MISSING && r.foundIn.includes('Barrier')
      )
    ).toBe(true);
    expect(findEffect(file, UUID_MISSING)).toBeUndefined();
  });

  it('counts edges by relation', () => {
    expect(stats.edgesByRelation.applies).toBeGreaterThan(0);
    expect(stats.edgesByRelation.gains).toBeGreaterThan(0);
  });
});
