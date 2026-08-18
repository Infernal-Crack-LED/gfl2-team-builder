/**
 * Shared autocomplete cache for doll, weapon, and effect name options.
 *
 * Discord fires autocomplete on every keystroke and gives the bot ~3s to
 * answer. The data lives in static JSON files (loaded once by loadGfl2Data),
 * so the search itself is fast — but the FIRST keystroke after startup still
 * pays file I/O. Preloading on `ready` (events/ready.ts) makes even that
 * first keystroke instant.
 *
 * Pattern mirrors nikke-sim's nameCache.ts: the data is loaded once and
 * cached permanently (JSON files don't change at runtime), with a preload
 * hook for the ready event.
 */

import type { AutocompleteInteraction } from 'discord.js';
import { loadGfl2Data } from './data.js';
import { searchDolls, searchWeapons, searchEffects } from './search.js';

/** Pre-load all data files so the first autocomplete is instant. */
export async function preloadNameCache(): Promise<void> {
  await loadGfl2Data();
}

/** Autocomplete handler for doll name options. */
export async function respondDollAutocomplete(
  interaction: AutocompleteInteraction
): Promise<void> {
  const focused = interaction.options.getFocused();
  const { dolls } = await loadGfl2Data();
  const results = searchDolls(dolls, focused).slice(0, 25);
  await interaction.respond(
    results.map(({ item }) => ({ name: item.name, value: item.id }))
  );
}

/** Autocomplete handler for weapon name options. */
export async function respondWeaponAutocomplete(
  interaction: AutocompleteInteraction
): Promise<void> {
  const focused = interaction.options.getFocused();
  const { weapons } = await loadGfl2Data();
  const results = searchWeapons(weapons, focused).slice(0, 25);
  await interaction.respond(
    results.map(({ item }) => ({ name: item.name, value: item.id }))
  );
}

/** Autocomplete handler for effect name options. */
export async function respondEffectAutocomplete(
  interaction: AutocompleteInteraction
): Promise<void> {
  const focused = interaction.options.getFocused();
  const { effects } = await loadGfl2Data();
  const results = searchEffects(effects, focused).slice(0, 25);
  await interaction.respond(
    results.map(({ item }) => ({ name: item.effectName, value: item.id }))
  );
}
