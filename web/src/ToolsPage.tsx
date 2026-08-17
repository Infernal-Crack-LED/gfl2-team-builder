/**
 * Tools index (/tools) — the landing page for the infographics creator, whose
 * card types each get their own tile and their own crawlable URL
 * (`?card=build` / `?card=team` / `?card=rec` / `?card=pull`, read by
 * InfographicsPage on mount).
 *
 * The builders and the key catalogue used to be repeated here; they live in
 * the top nav, so this page is the one place that owns the card maker rather
 * than a second copy of the nav.
 */
import { hrefFor, onSpaLinkClick } from './router';

interface Tool {
  href: string;
  title: string;
  blurb: string;
}

const TOOLS: Tool[] = [
  {
    href: `${hrefFor('infographics')}?card=build`,
    title: 'Build Card Creator',
    blurb:
      "Compose one doll's card — weapon and refinement, keys, vertebra and stat priorities — preview it exactly as it will render, then download the PNG or mint a hosted image link that embeds in Discord.",
  },
  {
    href: `${hrefFor('infographics')}?card=team`,
    title: 'Squad Card Creator',
    blurb:
      'Compose a squad card from up to five dolls and their full builds, preview it live, then download the PNG or mint a hosted image link that embeds in Discord.',
  },
  {
    href: `${hrefFor('infographics')}?card=rec`,
    title: 'Recommendation Card Creator',
    blurb:
      'Publish investment advice for one doll: the V/R breakpoint order, an optimal stopping point, ranked weapons and attachment sets, key priorities and your own notes.',
  },
  {
    href: `${hrefFor('infographics')}?card=pull`,
    title: 'Pull Calculator',
    blurb:
      'Work out what a pull budget is worth on either banner: the chance of landing the featured unit, the odds of every dupe tier above it, and the worst case — from your current pity, with the 50/50 accounted for. Download the card or post it in Discord with /pulls.',
  },
];

export function ToolsPage() {
  return (
    <div className="app tools-page">
      <header>
        <h1>Tools</h1>
        <p className="muted">
          Everything on the site that builds something. Pick a tool to get
          started.
        </p>
      </header>

      <div className="tools-grid">
        {TOOLS.map((tool) => (
          <a
            key={tool.href}
            className="tool-tile featured"
            href={tool.href}
            onClick={onSpaLinkClick(tool.href)}
          >
            <h2 className="tool-tile-title">{tool.title}</h2>
            <p className="tool-tile-blurb">{tool.blurb}</p>
            <span className="tool-tile-cta" aria-hidden="true">
              Open →
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
