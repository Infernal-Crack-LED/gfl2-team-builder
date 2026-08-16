import { ActivityType, Events } from 'discord.js';
import type { Event } from '../types.js';

export const event: Event<Events.ClientReady> = {
  name: Events.ClientReady,
  once: true,
  execute: (client) => {
    console.log(`[ready] logged in as ${client.user.tag}`);
    client.user.setActivity('GFL2 squad builds', {
      type: ActivityType.Watching,
    });
  },
};
