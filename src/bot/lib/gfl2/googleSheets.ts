/**
 * Minimal Google Sheets/Drive client for the platoon roster sheets.
 *
 * Auth is a service account (GOOGLE_SERVICE_ACCOUNT_JSON env var: the full
 * key-file JSON). The JWT is signed with node:crypto, so this adds no
 * dependencies — the three REST calls we need (create spreadsheet, share it,
 * write values) don't justify the googleapis package.
 */

import { createSign } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES =
  'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive';

/** The member-facing tab every roster spreadsheet has. */
export const ROSTER_TAB = 'Vertebrae';

/** The protected analysis tab (bot-written aggregates for platoon leads). */
export const ANALYSIS_TAB = 'Analysis';

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

export function sheetsConfigured(): boolean {
  return !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
}

function serviceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
  }
  const parsed = JSON.parse(raw) as ServiceAccount;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email/private_key'
    );
  }
  return {
    client_email: parsed.client_email,
    // Railway env editors often store the key with literal \n sequences.
    private_key: parsed.private_key.replace(/\\n/g, '\n'),
  };
}

const b64url = (data: string | Buffer): string =>
  Buffer.from(data).toString('base64url');

let cachedToken: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }
  const sa = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: SCOPES,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  );
  const signature = createSign('RSA-SHA256')
    .update(`${header}.${claims}`)
    .sign(sa.private_key);
  const assertion = `${header}.${claims}.${b64url(signature)}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${await res.text()}`);
  }
  const body = (await res.json()) as { access_token: string };
  cachedToken = {
    token: body.access_token,
    expiresAt: Date.now() + 3600_000,
  };
  return cachedToken.token;
}

async function googleFetch(url: string, init: RequestInit): Promise<unknown> {
  const token = await accessToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`Google API ${init.method} ${url}: ${await res.text()}`);
  }
  return res.json();
}

/**
 * Create a roster spreadsheet and make it editable by anyone with the link,
 * so platoon leads can annotate it. The bot's syncs clear and rewrite the
 * whole roster tab, so manual notes belong on other tabs.
 * Returns the spreadsheet ID.
 *
 * Service accounts have had ZERO Drive storage since April 2025, so the
 * account cannot own files: a bare spreadsheets.create fails with
 * storageQuotaExceeded. The sheet is therefore created INSIDE a folder a
 * human shared with the service account (GOOGLE_DRIVE_FOLDER_ID) — items
 * created in a shared My Drive folder are owned by the folder's owner, whose
 * quota they use. The folder owner must share it with the service account as
 * an editor.
 */
export async function createRosterSpreadsheet(title: string): Promise<string> {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  let spreadsheetId: string;

  if (folderId) {
    // Drive create (Sheets API cannot set a parent), then shape the tabs.
    const created = (await googleFetch(
      'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true',
      {
        method: 'POST',
        body: JSON.stringify({
          name: title,
          mimeType: 'application/vnd.google-apps.spreadsheet',
          parents: [folderId],
        }),
      }
    )) as { id: string };
    spreadsheetId = created.id;
    // A Drive-created spreadsheet has one default tab ("Sheet1" or a locale
    // variant) — rename it by ID rather than by title.
    const tabs = await getSheetTabs(spreadsheetId);
    const first = tabs[0];
    if (!first) {
      throw new Error(`new spreadsheet ${spreadsheetId} has no tabs`);
    }
    await batchUpdateSheet(spreadsheetId, [
      {
        updateSheetProperties: {
          properties: { sheetId: first.sheetId, title: ROSTER_TAB },
          fields: 'title',
        },
      },
      { addSheet: { properties: { title: ANALYSIS_TAB } } },
    ]);
  } else {
    // Direct create — only works for identities that can own files (a user
    // OAuth token, or a service account writing into a Workspace shared
    // drive world). Kept for those setups.
    const created = (await googleFetch(
      'https://sheets.googleapis.com/v4/spreadsheets',
      {
        method: 'POST',
        body: JSON.stringify({
          properties: { title },
          sheets: [
            { properties: { title: ROSTER_TAB } },
            { properties: { title: ANALYSIS_TAB } },
          ],
        }),
      }
    )) as { spreadsheetId: string };
    spreadsheetId = created.spreadsheetId;
  }

  await googleFetch(
    `https://www.googleapis.com/drive/v3/files/${spreadsheetId}/permissions?supportsAllDrives=true`,
    {
      method: 'POST',
      body: JSON.stringify({ type: 'anyone', role: 'writer' }),
    }
  );

  return spreadsheetId;
}

/** Replace one tab's contents with `values` (row-major strings). */
export async function writeTabValues(
  spreadsheetId: string,
  tab: string,
  values: string[][]
): Promise<void> {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values`;
  // Clear first so rows removed from the roster don't linger.
  await googleFetch(`${base}/${encodeURIComponent(tab)}:clear`, {
    method: 'POST',
    body: '{}',
  });
  await googleFetch(
    `${base}/${encodeURIComponent(`${tab}!A1`)}?valueInputOption=RAW`,
    {
      method: 'PUT',
      body: JSON.stringify({ values }),
    }
  );
}

export interface SheetTabMeta {
  sheetId: number;
  title: string;
  protected: boolean;
}

/** Tab ids/titles and whether each already carries a protected range. */
export async function getSheetTabs(
  spreadsheetId: string
): Promise<SheetTabMeta[]> {
  const meta = (await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title),protectedRanges(protectedRangeId))`,
    { method: 'GET' }
  )) as {
    sheets?: {
      properties: { sheetId: number; title: string };
      protectedRanges?: { protectedRangeId: number }[];
    }[];
  };
  return (meta.sheets ?? []).map((s) => ({
    sheetId: s.properties.sheetId,
    title: s.properties.title,
    protected: (s.protectedRanges ?? []).length > 0,
  }));
}

/** Raw spreadsheets.batchUpdate — formatting, merges, new tabs, protection. */
export async function batchUpdateSheet(
  spreadsheetId: string,
  requests: unknown[]
): Promise<void> {
  if (requests.length === 0) {
    return;
  }
  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      body: JSON.stringify({ requests }),
    }
  );
}

/** The service account's own identity — the sole editor of protected ranges. */
export function serviceAccountEmail(): string {
  return serviceAccount().client_email;
}

export function spreadsheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
}
