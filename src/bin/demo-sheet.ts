/**
 * Create a SAMPLE platoon roster spreadsheet from mocked data — ~40 fake
 * Discord users covering every GL doll at varying vertebrae levels — so the
 * sheet layout (element bands, colors, protected Analysis tab) can be seen
 * and tweaked without a real platoon submitting screenshots.
 *
 *   npm run demo:sheet                    # create the Google Sheet (needs
 *                                         # GOOGLE_SERVICE_ACCOUNT_JSON)
 *   npm run demo:sheet -- --json <path>   # also dump the tab values + colors
 *                                         # as JSON (for local previews)
 *
 * Without GOOGLE_SERVICE_ACCOUNT_JSON the script still runs --json and just
 * skips the Google half. Mock data is seeded, so runs are reproducible.
 */
import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { PHASE_COLORS } from '../infographics/core/theme.js';
import {
  createRosterSpreadsheet,
  extractSpreadsheetId,
  prepareLinkedSpreadsheet,
  sheetsConfigured,
  spreadsheetUrl,
} from '../bot/lib/gfl2/googleSheets.js';
import {
  buildAnalysisValues,
  buildSheetValues,
  sheetDollColumns,
  writePlatoonSpreadsheet,
  type SheetMember,
} from '../bot/lib/gfl2/rosterSheet.js';

/** mulberry32 — tiny seeded PRNG so the demo roster is reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  'Croque',
  'Papasha',
  'Klukai',
  'Springfield',
  'Mosin',
  'Groza',
  'Vector',
  'Makiatto',
  'Suomi',
  'Tololo',
  'Dazzle',
  'Frost',
  'Ember',
  'Static',
  'Hydra',
  'Onyx',
  'Vega',
  'Nyx',
  'Rook',
  'Talon',
];
const SECOND = [
  'Enjoyer',
  'Main',
  'Fan',
  'Hunter',
  'Whale',
  'Sniper',
  'Cmdr',
  'Prime',
  'Zero',
  'Actual',
  'Gaming',
  'TV',
  'HQ',
  'Dev',
  'Ops',
];

interface Profile {
  /** Fraction of the roster this player owns. */
  coverage: [number, number];
  /** Weight toward high vertebrae on owned dolls. */
  v6Chance: number;
}

// A believable platoon mix: a few whales, a veteran core, mids, fresh joins.
const PROFILES: [Profile, number][] = [
  [{ coverage: [0.85, 1.0], v6Chance: 0.35 }, 6], // whales
  [{ coverage: [0.6, 0.9], v6Chance: 0.15 }, 14], // veterans
  [{ coverage: [0.35, 0.65], v6Chance: 0.06 }, 12], // mid
  [{ coverage: [0.15, 0.4], v6Chance: 0.02 }, 8], // newer players
];

function rollVertebrae(rand: () => number, v6Chance: number): number {
  const r = rand();
  if (r < v6Chance) {
    return 6;
  }
  // The rest skews hard toward V0-V2, like real rosters do.
  const r2 = rand();
  if (r2 < 0.45) {
    return 0;
  }
  if (r2 < 0.65) {
    return 1;
  }
  if (r2 < 0.78) {
    return 2;
  }
  if (r2 < 0.87) {
    return 3;
  }
  if (r2 < 0.94) {
    return 4;
  }
  return 5;
}

export function buildMockMembers(
  slugs: string[],
  count = 40,
  seed = 20260830
): SheetMember[] {
  const rand = rng(seed);
  const members: SheetMember[] = [];
  const profiles = PROFILES.flatMap(([p, n]) => Array<Profile>(n).fill(p));
  const usedNames = new Set<string>();

  for (let i = 0; i < count; i++) {
    const profile = profiles[i % profiles.length] ?? {
      coverage: [0.3, 0.6],
      v6Chance: 0.05,
    };
    let username: string;
    do {
      const a = FIRST[Math.floor(rand() * FIRST.length)] ?? 'Cmdr';
      const b = SECOND[Math.floor(rand() * SECOND.length)] ?? 'Main';
      const num = rand() < 0.5 ? String(Math.floor(rand() * 99)) : '';
      username = `${a}${b}${num}`;
    } while (usedNames.has(username));
    usedNames.add(username);

    const [lo, hi] = profile.coverage;
    const coverage = lo + rand() * (hi - lo);
    const vertebrae = new Map<string, number | null>();
    for (const slug of slugs) {
      if (rand() > coverage) {
        continue;
      }
      // A sprinkle of unreadable-badge readings so the '?' rendering shows.
      vertebrae.set(
        slug,
        rand() < 0.01 ? null : rollVertebrae(rand, profile.v6Chance)
      );
    }

    members.push({
      discordId: String(
        100000000000000000n + BigInt(Math.floor(rand() * 1e15))
      ),
      // One member who never ran /username, to show the blank-identity row.
      username: i === count - 1 ? null : username,
      playerId:
        i === count - 1
          ? null
          : String(10000000 + Math.floor(rand() * 89999999)),
      vertebrae,
    });
  }
  return members;
}

async function main(): Promise<void> {
  const jsonFlag = process.argv.indexOf('--json');
  const jsonPath = jsonFlag !== -1 ? process.argv[jsonFlag + 1] : null;

  const columns = await sheetDollColumns();
  const members = buildMockMembers(columns.map((c) => c.slug));

  if (jsonPath) {
    const analysis = buildAnalysisValues(columns, members);
    await writeFile(
      jsonPath,
      JSON.stringify(
        {
          columns,
          phaseColors: PHASE_COLORS,
          vertebrae: buildSheetValues(columns, members),
          analysis,
        },
        null,
        2
      )
    );
    console.log(`wrote ${jsonPath}`);
  }

  if (!sheetsConfigured()) {
    console.log(
      'GOOGLE_SERVICE_ACCOUNT_JSON not set — skipped creating the Google Sheet.'
    );
    return;
  }

  // --sheet <url|id>: write into a human-created spreadsheet shared with the
  // service account (the plain-service-account path, mirroring /sheet's url
  // option). Without it the script tries to create one, which needs an
  // identity that can own Drive files.
  const sheetFlag = process.argv.indexOf('--sheet');
  let sheetId: string;
  if (sheetFlag !== -1) {
    const parsed = extractSpreadsheetId(process.argv[sheetFlag + 1] ?? '');
    if (!parsed) {
      throw new Error('--sheet needs a Google Sheets URL or spreadsheet ID');
    }
    await prepareLinkedSpreadsheet(parsed);
    sheetId = parsed;
  } else {
    sheetId = await createRosterSpreadsheet(
      'GFL2 Platoon Roster — SAMPLE (mock data)'
    );
  }
  await writePlatoonSpreadsheet(sheetId, members);
  console.log(`sample sheet: ${spreadsheetUrl(sheetId)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
