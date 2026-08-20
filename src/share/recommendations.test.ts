/**
 * Classification of the sheet's free-prose blocks.
 *
 * The parser (datamine side) separates milestone descriptions from free prose;
 * this is the second half of that split — deciding what a prose block IS, so a
 * one-line verdict does not render as a paragraph of rotation theory.
 *
 * Kept free of node imports: web/tsconfig.json compiles ../src/share/**, so a
 * test here that read data/*.json would drag node:fs into the web build. The
 * assertions against the live rows live in src/server/pageMeta.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { classifyExplanation, hydrateRecommendation } from './recommendations';

const NO_LOOKUPS = { weaponByName: () => null, keyByLabel: () => null };

describe('classifyExplanation', () => {
  it('reads a verdict and strips its label', () => {
    const got = classifyExplanation({ text: 'Recommendation: V0 > V3' });
    expect(got.kind).toBe('verdict');
    expect(got.text).toBe('V0 > V3');
  });

  it('tolerates the spellings the authors actually typed', () => {
    // Both variants appear in the live sheet; a mis-typed label must not
    // silently demote the block to an unlabelled note.
    expect(classifyExplanation({ text: 'Recomendation: V0' }).kind).toBe(
      'verdict'
    );
    expect(classifyExplanation({ text: 'Disclamer: it depends' }).kind).toBe(
      'caveat'
    );
    expect(classifyExplanation({ text: 'Disclaimer: it depends' }).kind).toBe(
      'caveat'
    );
  });

  it('reads tips case-insensitively', () => {
    expect(classifyExplanation({ text: 'TIP: rotation' }).kind).toBe('tip');
    expect(classifyExplanation({ text: 'Tip: rotation' }).kind).toBe('tip');
  });

  it('falls back to an unlabelled note rather than guessing', () => {
    const got = classifyExplanation({ text: 'Post key update: much better' });
    expect(got.kind).toBe('note');
    expect(got.text).toBe('Post key update: much better');
  });

  it('keeps the steps a block names', () => {
    expect(classifyExplanation({ text: 'x', refs: ['V3', 'V6'] }).refs).toEqual(
      ['V3', 'V6']
    );
    expect(classifyExplanation({ text: 'x' }).refs).toEqual([]);
  });
});

describe('hydrateRecommendation explanation handling', () => {
  it('keeps at most one verdict and demotes any extra to a note', () => {
    const rec = hydrateRecommendation(
      'x',
      {
        explanation: [
          { text: 'Recommendation: V0' },
          { text: 'Recommendation: V6' },
        ],
      },
      NO_LOOKUPS
    );
    expect(rec?.verdict?.text).toBe('V0');
    // The second is kept, not dropped — a shape change in the sheet should be
    // visible rather than silently swallowed.
    expect(rec?.notes).toHaveLength(1);
  });

  it('is not a panel when the sheet gave only empty prose', () => {
    expect(
      hydrateRecommendation('x', { explanation: [{ text: '  ' }] }, NO_LOOKUPS)
    ).toBeNull();
  });

  it('renders a panel for a doll that has prose but no path', () => {
    const rec = hydrateRecommendation(
      'x',
      { explanation: [{ text: 'TIP: still worth reading', refs: [] }] },
      NO_LOOKUPS
    );
    expect(rec?.path).toEqual([]);
    expect(rec?.notes).toHaveLength(1);
  });
});
