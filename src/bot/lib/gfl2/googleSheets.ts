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

/** The one tab every roster spreadsheet has. */
export const ROSTER_TAB = 'Vertebrae';

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
 */
export async function createRosterSpreadsheet(title: string): Promise<string> {
  const created = (await googleFetch(
    'https://sheets.googleapis.com/v4/spreadsheets',
    {
      method: 'POST',
      body: JSON.stringify({
        properties: { title },
        sheets: [{ properties: { title: ROSTER_TAB } }],
      }),
    }
  )) as { spreadsheetId: string };

  await googleFetch(
    `https://www.googleapis.com/drive/v3/files/${created.spreadsheetId}/permissions`,
    {
      method: 'POST',
      body: JSON.stringify({ type: 'anyone', role: 'writer' }),
    }
  );

  return created.spreadsheetId;
}

/** Replace the roster tab's contents with `values` (row-major strings). */
export async function writeRosterValues(
  spreadsheetId: string,
  values: string[][]
): Promise<void> {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values`;
  // Clear first so rows removed from the roster don't linger.
  await googleFetch(`${base}/${encodeURIComponent(ROSTER_TAB)}:clear`, {
    method: 'POST',
    body: '{}',
  });
  await googleFetch(
    `${base}/${encodeURIComponent(`${ROSTER_TAB}!A1`)}?valueInputOption=RAW`,
    {
      method: 'PUT',
      body: JSON.stringify({ values }),
    }
  );
}

export function spreadsheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
}
