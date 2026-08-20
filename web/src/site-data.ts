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

// The dev bio and the companion-project blurbs live in src/share because the
// server renders them into the crawlable landing-page body too (see
// src/share/siteIdentity.ts). Re-exported here so this module stays the one
// import site the web app reaches for.
export { dev } from '../../src/share/siteIdentity';
import { dev } from '../../src/share/siteIdentity';

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
