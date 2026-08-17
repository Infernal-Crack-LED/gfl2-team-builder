/**
 * Tools index (/tools) — the top-level home for everything on the site that
 * builds something rather than just browsing data. Mirrors nikke-sim's Tools
 * section: one landing page, one tile per tool, each tile a real link so the
 * page is crawlable and every tool has a shareable URL.
 *
 * The infographics creator (/tools/infographics) is the tile that lives here
 * exclusively; the builders and the key catalogue also sit in the top nav,
 * and are repeated here so Tools is a complete index rather than a stub.
 */
import type { Route } from './router';
import { hrefFor, onSpaLinkClick } from './router';

interface Tool {
  route: Route;
  title: string;
  blurb: string;
  /** Marks the tool this section owns — rendered first, visually lifted. */
  featured?: boolean;
}

const TOOLS: Tool[] = [
  {
    route: 'infographics',
    title: 'Infographics Creator',
    blurb:
      'Compose a build card or a squad card from the live game data, preview it exactly as it will render, then download the PNG or mint a hosted image link that embeds in Discord.',
    featured: true,
  },
  {
    route: 'team-builder',
    title: 'Team Builder',
    blurb:
      'Stage a 4- or 5-doll squad from the filtered roster, see the effects the team shares, then save or share it.',
  },
  {
    route: 'builder',
    title: 'Character Builder',
    blurb:
      'Plan one doll in depth — weapon and refinement, fixed, expansion and common keys, vertebrae, and stat priorities.',
  },
  {
    route: 'keys',
    title: 'Key Catalogue',
    blurb:
      'Every fixed, expansion, and common key, filterable by type, stat, and the class or phase of the doll it comes from.',
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
        {TOOLS.map((tool) => {
          const href = hrefFor(tool.route);
          return (
            <a
              key={tool.route}
              className={'tool-tile' + (tool.featured ? ' featured' : '')}
              href={href}
              onClick={onSpaLinkClick(href)}
            >
              <h2 className="tool-tile-title">{tool.title}</h2>
              <p className="tool-tile-blurb">{tool.blurb}</p>
              <span className="tool-tile-cta" aria-hidden="true">
                Open →
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
