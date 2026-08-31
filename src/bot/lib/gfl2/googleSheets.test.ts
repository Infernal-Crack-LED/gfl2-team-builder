import { describe, expect, it } from 'vitest';
import { extractSpreadsheetId } from './googleSheets.js';

describe('extractSpreadsheetId', () => {
  const id = '1mpRt7qmF69FE3XKI2EPy5IvDSeuDiKsZabcd';

  it('parses a full docs.google.com URL, with or without suffixes', () => {
    expect(
      extractSpreadsheetId(
        `https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`
      )
    ).toBe(id);
    expect(
      extractSpreadsheetId(
        `https://docs.google.com/spreadsheets/d/${id}?usp=sharing`
      )
    ).toBe(id);
  });

  it('passes a bare spreadsheet ID through', () => {
    expect(extractSpreadsheetId(` ${id} `)).toBe(id);
  });

  it('rejects non-sheet URLs and junk', () => {
    expect(
      extractSpreadsheetId(
        'https://drive.google.com/drive/folders/1mpRt7qmF69FE3XKI2EPy5IvDSeuDiKsZ'
      )
    ).toBeNull();
    expect(extractSpreadsheetId('not a link')).toBeNull();
    expect(extractSpreadsheetId('')).toBeNull();
  });
});
