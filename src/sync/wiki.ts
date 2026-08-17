/**
 * Wiki scraper for iopwiki.com — currently only fetches attachment set
 * bonuses from the GFL2 Weapon Accessories page.
 */

const WIKI_URL = 'https://iopwiki.com/wiki/GFL2_Weapon_Accessories';

export interface WikiAttachmentSet {
  name: string;
  piecesRequired: number;
  description: string;
}

function decodeHtmlEntities(text: string): string {
  // `&amp;` must decode last — decoding it first double-decodes sequences
  // like `&amp;lt;` (the escaped text "&lt;") into a real `<`.
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

/**
 * Parse the "Set Effects List" section from the wiki HTML.
 * The section is a <ul> immediately following <h2 id="Set_Effects_List">.
 * Each <li> reads `Name - Description`.
 *
 * The name is taken by SPLITTING THE STRIPPED TEXT on the first " - ", not by
 * reading a <strong>: the page used to bold the names and silently stopped,
 * which made a <strong>-anchored parse return zero sets rather than fail. The
 * split handles both, since stripping tags turns the bold form into the plain
 * one. All current sets require 3 pieces (Assembled activates the set skill).
 */
function parseSetEffects(html: string): WikiAttachmentSet[] {
  const headingIdx = html.indexOf('id="Set_Effects_List"');
  if (headingIdx === -1) {
    throw new Error('Could not find Set Effects List section on wiki page');
  }

  const afterHeading = html.slice(headingIdx);
  const ulStart = afterHeading.indexOf('<ul>');
  if (ulStart === -1) {
    throw new Error('Could not find <ul> after Set Effects List heading');
  }

  const ulEnd = afterHeading.indexOf('</ul>', ulStart);
  if (ulEnd === -1) {
    throw new Error('Could not find closing </ul>');
  }

  const ulContent = afterHeading.slice(ulStart, ulEnd);
  const results: WikiAttachmentSet[] = [];
  const liRegex = /<li>([\s\S]*?)<\/li>/gi;
  let match: RegExpExecArray | null;

  while ((match = liRegex.exec(ulContent)) !== null) {
    const inner = match[1];
    if (!inner) {
      continue;
    }

    const text = decodeHtmlEntities(stripTags(inner))
      .replace(/\s+/g, ' ')
      .trim();
    const dashIdx = text.indexOf(' - ');
    if (dashIdx === -1) {
      continue;
    }
    const name = text.slice(0, dashIdx).trim();
    const description = text.slice(dashIdx + 3).trim();
    if (name === '' || description === '') {
      continue;
    }

    results.push({
      name,
      piecesRequired: 3,
      description,
    });
  }

  if (results.length === 0) {
    // A structural change upstream must fail loudly — a silent empty list
    // would wipe the set dropdown on the next sync.
    throw new Error(
      'Set Effects List parsed to zero sets — wiki format changed'
    );
  }

  return results;
}

export async function fetchAttachmentSets(): Promise<WikiAttachmentSet[]> {
  const res = await fetch(WIKI_URL, {
    headers: {
      'User-Agent': 'GFL2TeamBuilder/1.0',
      Accept: 'text/html',
    },
  });

  if (!res.ok) {
    throw new Error(`Wiki fetch failed: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  return parseSetEffects(html);
}
