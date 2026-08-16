// These live in share/ so the web bundle can reuse them (see share/html.ts).
export { stripHtml, stripDetailsHtml } from '../share/html.js';

/**
 * Parse a field that may be a stringified JSON array, a real array, or null.
 * Returns the parsed array, or the original value if it's not an array.
 */
export function parseJsonField<T>(value: unknown): T[] | T | null {
  if (value == null) {
    return null;
  }
  if (Array.isArray(value)) {
    return value as T[];
  }
  if (typeof value === 'string' && value.startsWith('[')) {
    try {
      return JSON.parse(value) as T[];
    } catch {
      return null;
    }
  }
  return value as T;
}

/**
 * Parse an integer-or-null from a field that may be a string, number, or the
 * literal string "None".
 */
export function parseOptionalInt(
  value: string | number | null | undefined
): number | null {
  if (value == null || value === '' || value === 'None') {
    return null;
  }
  const n = typeof value === 'number' ? value : parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}
