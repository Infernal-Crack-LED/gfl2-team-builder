import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Command, Event } from '../types.js';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, '..');

/**
 * Recursively collect every module under a directory. Accepts `.ts` (dev via
 * tsx) and `.js` (compiled output), while skipping declaration/source-map files.
 */
async function collectModules(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectModules(full)));
    } else if (
      (entry.name.endsWith('.js') || entry.name.endsWith('.ts')) &&
      !entry.name.endsWith('.d.ts')
    ) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Load every command module under `commands/`. Each module must
 * `export const command: Command`.
 */
export async function loadCommands(): Promise<Command[]> {
  const files = await collectModules(join(srcRoot, 'commands'));
  const commands: Command[] = [];
  for (const file of files) {
    const mod = (await import(pathToFileURL(file).href)) as {
      command?: Command;
    };
    if (mod.command?.data && typeof mod.command.execute === 'function') {
      commands.push(mod.command);
    } else {
      console.warn(`[loader] ${file} is missing a valid \`command\` export`);
    }
  }
  return commands;
}

/**
 * Load every event module under `events/`. Each module must
 * `export const event: Event`.
 */
export async function loadEvents(): Promise<Event[]> {
  const files = await collectModules(join(srcRoot, 'events'));
  const events: Event[] = [];
  for (const file of files) {
    const mod = (await import(pathToFileURL(file).href)) as { event?: Event };
    if (mod.event?.name && typeof mod.event.execute === 'function') {
      events.push(mod.event);
    } else {
      console.warn(`[loader] ${file} is missing a valid \`event\` export`);
    }
  }
  return events;
}
