/**
 * Escape '<' as \u003c so a JSON-LD script block can never contain the literal
 * sequence '</script>', which would prematurely close the surrounding <script>.
 */
export function escapeJsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}
