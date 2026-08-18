import { ActivityType, Events } from 'discord.js';
import type { Event } from '../types.js';
import { preloadNameCache } from '../lib/gfl2/nameCache.js';
import { preloadImageCache } from '../lib/gfl2/imageCache.js';

export const event: Event<Events.ClientReady> = {
  name: Events.ClientReady,
  once: true,
  execute: (client) => {
    console.log(`[ready] logged in as ${client.user.tag}`);
    client.user.setActivity('GFL2 squad builds', {
      type: ActivityType.Watching,
    });

    // Preload the doll/weapon/effect name cache so the first autocomplete
    // keystroke on /doll, /weapon, or /effect doesn't pay file I/O.
    preloadNameCache()
      .then(() => console.log('[ready] name cache preloaded'))
      .catch((e) =>
        console.warn(
          '[ready] name cache preload failed (will retry on first use):',
          e
        )
      );

    // Preload recommendation card images so the first /doll command resolves
    // its image instantly. Fetches rec-defaults codes for every doll and
    // pre-warms the server's render cache (same pattern as nikke-sim's
    // build-time pre-generation).
    preloadImageCache()
      .then(() => console.log('[ready] rec card images pre-warmed'))
      .catch((e) =>
        console.warn(
          '[ready] rec card preload failed (will retry on first use):',
          e
        )
      );
  },
};
