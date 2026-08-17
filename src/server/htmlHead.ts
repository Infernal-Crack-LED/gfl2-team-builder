/**
 * <head> tag rewriting for the served index.html — the primitive both embed
 * layers share: per-URL page meta (pageMeta.ts) and per-share-code card meta
 * (ogInject.ts).
 *
 * Every helper is regex-based and whole-tag: dist/index.html is NOT minified by
 * vite, so Prettier's multi-line attribute wrapping survives into the served
 * file and a literal-space matcher would silently no-op on every wrapped tag
 * (the title, description and every OG/Twitter tag are wrapped there today).
 */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Escape `<` as the \\u003c sequence so a JSON-LD payload can never contain
 * the literal `</script>` and break out of its script block. Mirror of
 * web/src/jsonLd.ts.
 */
export function escapeJsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

/** Replace a <meta> tag's content, inserting the tag when it is absent. */
export function setMetaTag(
  html: string,
  attr: 'property' | 'name',
  key: string,
  content: string
): string {
  const re = new RegExp(`<meta\\s[^>]*${attr}=["']${key}["'][^>]*>`, 'i');
  const tag = `<meta ${attr}="${key}" content="${escapeHtml(content)}" />`;
  if (re.test(html)) {
    return html.replace(re, tag);
  }
  return html.replace('</head>', `    ${tag}\n  </head>`);
}

/** Drop a <meta> tag entirely (e.g. og:image:width for a non-1200×630 image). */
export function removeMetaTag(
  html: string,
  attr: 'property' | 'name',
  key: string
): string {
  const re = new RegExp(`\\s*<meta\\s[^>]*${attr}=["']${key}["'][^>]*>`, 'gi');
  return html.replace(re, '');
}

/** Replace a <link rel="…"> href, inserting the tag when it is absent. */
export function setLinkHref(html: string, rel: string, href: string): string {
  const re = new RegExp(`<link\\s[^>]*rel=["']${rel}["'][^>]*>`, 'i');
  const tag = `<link rel="${rel}" href="${escapeHtml(href)}" />`;
  if (re.test(html)) {
    return html.replace(re, tag);
  }
  return html.replace('</head>', `    ${tag}\n  </head>`);
}

export function setTitle(html: string, title: string): string {
  const tag = `<title>${escapeHtml(title)}</title>`;
  if (/<title>[^<]*<\/title>/i.test(html)) {
    return html.replace(/<title>[^<]*<\/title>/i, tag);
  }
  return html.replace('</head>', `    ${tag}\n  </head>`);
}

/** Append a JSON-LD block just before </head>. */
export function appendJsonLd(html: string, payload: unknown): string {
  const tag = `  <script type="application/ld+json">${escapeJsonLd(payload)}</script>\n  </head>`;
  return html.replace('</head>', tag);
}

/**
 * Put a no-JS body into #root. React later replaces it wholesale (createRoot,
 * not hydrateRoot — see web/src/main.tsx), so this markup only has to be valid
 * and crawlable, never a match for what React renders.
 */
export function injectRootBody(html: string, content: string): string {
  if (!content) {
    return html;
  }
  if (html.includes('<div id="root"></div>')) {
    return html.replace(
      '<div id="root"></div>',
      `<div id="root">${content}</div>`
    );
  }
  return html.replace('<body>', `<body>${content}`);
}
