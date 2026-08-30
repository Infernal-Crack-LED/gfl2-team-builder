/**
 * Builds and syncs a platoon's roster sheet.
 *
 * Layout (one tab, ROSTER_TAB): row 1 is the header — Player ID, Username,
 * then one column per GL doll (alphabetical). One row per member, keyed by
 * Discord ID under the hood; cells hold the doll's vertebrae level (0-6),
 * blank when the player hasn't submitted that doll.
 */

import { eq, inArray } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import {
  platoonMembers,
  rosterDolls,
  rosterPlayers,
} from '../../../db/schema.js';
import { loadGfl2Data } from './data.js';
import { writeRosterValues } from './googleSheets.js';

export interface SheetMember {
  discordId: string;
  username: string | null;
  playerId: string | null;
  /** dollSlug -> vertebrae (null = badge unreadable, shown as '?') */
  vertebrae: Map<string, number | null>;
}

/** GL dolls (CN-only releases excluded), alphabetical — the sheet columns. */
export async function sheetDollColumns(): Promise<
  { name: string; slug: string }[]
> {
  const { dolls } = await loadGfl2Data();
  return dolls
    .filter((d) => d.regionTag !== 'cn')
    .map((d) => ({ name: d.name, slug: d.slug }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Pure values builder — exported for tests. */
export function buildSheetValues(
  columns: { name: string; slug: string }[],
  members: SheetMember[]
): string[][] {
  const header = ['Player ID', 'Username', ...columns.map((c) => c.name)];
  const rows = [...members]
    .sort((a, b) =>
      (a.username ?? a.discordId).localeCompare(b.username ?? b.discordId)
    )
    .map((m) => [
      m.playerId ?? '',
      m.username ?? '',
      ...columns.map((c) => {
        if (!m.vertebrae.has(c.slug)) {
          return '';
        }
        const v = m.vertebrae.get(c.slug);
        return v === null || v === undefined ? '?' : String(v);
      }),
    ]);
  return [header, ...rows];
}

/** Rebuild one platoon's sheet from the DB. */
export async function syncPlatoonSheet(
  platoonId: string,
  sheetId: string
): Promise<void> {
  const members = await db
    .select()
    .from(platoonMembers)
    .where(eq(platoonMembers.platoonId, platoonId));
  const ids = members.map((m) => m.discordId);

  const [players, dollsRows] = ids.length
    ? await Promise.all([
        db
          .select()
          .from(rosterPlayers)
          .where(inArray(rosterPlayers.discordId, ids)),
        db
          .select()
          .from(rosterDolls)
          .where(inArray(rosterDolls.discordId, ids)),
      ])
    : [[], []];

  const playerById = new Map(players.map((p) => [p.discordId, p]));
  const vertById = new Map<string, Map<string, number | null>>();
  for (const row of dollsRows) {
    let m = vertById.get(row.discordId);
    if (!m) {
      m = new Map();
      vertById.set(row.discordId, m);
    }
    m.set(row.dollSlug, row.vertebrae);
  }

  const sheetMembers: SheetMember[] = ids.map((id) => ({
    discordId: id,
    username: playerById.get(id)?.username ?? null,
    playerId: playerById.get(id)?.playerId ?? null,
    vertebrae: vertById.get(id) ?? new Map(),
  }));

  const columns = await sheetDollColumns();
  await writeRosterValues(sheetId, buildSheetValues(columns, sheetMembers));
}
