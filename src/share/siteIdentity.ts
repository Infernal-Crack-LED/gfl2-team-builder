/**
 * Who runs this site and what else they build — the dev bio plus the two
 * companion projects the landing page and /dev both introduce.
 *
 * Shared, not web-local, for the same reason homeContent.ts is: the landing
 * page's callouts are a crawl surface. The nikkesim.app link in particular is
 * one half of a reciprocal link between two sites the same person runs, and a
 * link a crawler cannot see is not a link at all — so `noJsBody.ts` renders
 * these strings server-side and has to read them from the same place
 * `web/src/site-data.ts` does.
 *
 * Keep this human-readable: it is edited as copy, not as config.
 */
export const dev = {
  name: 'Max',
  greeting: "Hi, I'm Max",
  bio: 'I’m an independent developer who builds self-hosted AI systems and tools, along with some passion projects for games I like.',
  // this site's companion bot
  helen: {
    name: 'Helen',
    blurb:
      'A Girls’ Frontline 2: Exilium info & team-building Discord bot that serves up doll kits, weapon data, and shareable squad cards on demand. Works in any GFL2-oriented server.',
    addToServer:
      'https://discord.com/discovery/applications/1538690317363191922',
  },
  // the sister site — the two share a brand mark, so they cross-link
  nikkesim: {
    name: 'NIKKE Solo Raid Sim',
    url: 'https://nikkesim.app',
    blurb:
      'My other game tool: a frame-tick damage simulator for NIKKE: Goddess of Victory solo raids. Per-unit DPS prediction, an overload optimizer, team and roster generators, unit rankings, and a sourced mechanics reference — all running in the browser.',
  },
  // the NIKKE-side flagship project, kept here so both sites cross-link
  maiden: {
    name: 'Maiden',
    blurb:
      'A NIKKE: Goddess of Victory info & strategy Discord bot that serves up character data on demand. Built for my union cluster, Maiden’s Bakery, but it works in any Nikke-oriented server.',
    botUrl: 'https://github.com/Infernal-Crack-LED/bakery-bot',
    discordInvite: 'https://discord.gg/3Yx4pHB88R',
    addToServer:
      'https://discord.com/discovery/applications/1523719703950790946',
  },
} as const;
