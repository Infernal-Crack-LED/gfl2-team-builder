// Editable site content — dev bio + social links. Ported from nikke-sim's
// site-data.ts so both sites present the same identity. Keep this
// human-readable; the Dev page and shared footer render straight from these
// values.

// each social is a rounded tile with the brand's official mark; `round` makes
// the tile a circle (Discord-style avatar) for a bot's profile picture.
export type SocialIcon =
  | { kind: 'brand'; name: 'discord' | 'x' | 'github' }
  | { kind: 'img'; src: string; round?: boolean };

export interface Social {
  label: string;
  href: string;
  brand: string; // tile background color
  icon: SocialIcon;
}

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
      'https://discord.com/oauth2/authorize?client_id=1538690317363191922',
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

// Social buttons — rendered as brand tiles in the shared site footer.
// Helen leads (this site's own bot), then the nikke-sim link set.
export const socials: Social[] = [
  {
    label: 'Helen',
    href: dev.helen.addToServer,
    brand: '#0b0e14',
    icon: { kind: 'img', src: '/helen.png', round: true },
  },
  {
    label: 'Maiden',
    href: dev.maiden.addToServer,
    brand: '#0b0e14',
    icon: { kind: 'img', src: '/maiden.gif', round: true },
  },
  // The sister site. Square tile (not round): this is a logo, not an avatar.
  {
    label: 'nikkesim.app',
    href: dev.nikkesim.url,
    brand: '#101216',
    icon: { kind: 'img', src: '/nikkesim-icon.png' },
  },
  {
    label: 'Discord',
    href: 'https://discord.com/users/177179150669316096',
    brand: '#5865f2',
    icon: { kind: 'brand', name: 'discord' },
  },
  {
    label: 'X',
    href: 'https://x.com/fourbrainstorms',
    brand: '#000000',
    icon: { kind: 'brand', name: 'x' },
  },
  {
    label: 'GitHub',
    href: 'https://github.com/Infernal-Crack-LED',
    brand: '#181717',
    icon: { kind: 'brand', name: 'github' },
  },
  {
    label: 'Blablalink',
    href: 'https://www.blablalink.com/user?openid=MjkwODAtMTczODk5ODEwMzMzMTgwOTYwMDc=',
    brand: '#000000',
    icon: { kind: 'img', src: '/blablalink.png' },
  },
];
