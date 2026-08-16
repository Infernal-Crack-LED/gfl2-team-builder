import { describe, expect, it } from 'vitest';
import { allDolls } from './data';
import { computeTeamEffects } from './effectMatrix';

function dollByName(name: string) {
  const doll = allDolls.find((d) => d.name === name);
  if (!doll) {
    throw new Error(`doll not found in data: ${name}`);
  }
  return doll;
}

describe('computeTeamEffects', () => {
  it('returns nothing for an empty squad', () => {
    expect(computeTeamEffects([])).toEqual([]);
  });

  it('shows Frost Barrier sourced from Helen Skill 2 and affecting Makiatto via Alert', () => {
    const helen = dollByName('Helen');
    const makiatto = dollByName('Makiatto');
    const entries = computeTeamEffects([helen, makiatto]);

    const frostBarrier = entries.find((e) => e.effectName === 'Frost Barrier');
    expect(frostBarrier).toBeDefined();

    // Source: Helen applies it with Skill 2
    const helenSource = frostBarrier!.sources.find(
      (s) => s.member.id === helen.id && s.relation === 'applies'
    );
    expect(helenSource).toBeDefined();
    expect(helenSource!.label).toContain('Skill 2');

    // Makiatto gains it herself with Skill 3
    const makGains = frostBarrier!.sources.find(
      (s) => s.member.id === makiatto.id && s.relation === 'gains'
    );
    expect(makGains).toBeDefined();

    // Affected: Makiatto's Alert references Frost Barrier
    const makAffected = frostBarrier!.affected.find(
      (a) => a.member.id === makiatto.id && a.relation === 'conditional'
    );
    expect(makAffected).toBeDefined();
    expect(makAffected!.viaEffectName).toBe('Alert');
  });

  it('includes weapon and key surfaces as sources', () => {
    // Suomi's keys reference Frost Barrier (verified in the QA report)
    const suomi = dollByName('Suomi');
    const entries = computeTeamEffects([suomi]);
    const frostBarrier = entries.find((e) => e.effectName === 'Frost Barrier');
    expect(frostBarrier).toBeDefined();
    expect(frostBarrier!.sources.some((s) => s.label.startsWith('Key —'))).toBe(
      true
    );
  });

  it('follows effect→effect conferral chains', () => {
    // Frost Barrier's own text applies Frigid when destroyed — a team that
    // provides Frost Barrier must also show Frigid, attributed via it.
    const helen = dollByName('Helen');
    const entries = computeTeamEffects([helen]);
    const frigid = entries.find((e) => e.effectName === 'Frigid');
    expect(frigid).toBeDefined();
    expect(
      frigid!.sources.some((s) => s.viaEffectName === 'Frost Barrier')
    ).toBe(true);
  });
});

// Marker resolution is covered in data.test.ts.
