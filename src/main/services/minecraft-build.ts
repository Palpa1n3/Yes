/** Minecraft (Java) building: Claude designs a build as setblock/fill commands, saved into the
 *  world as a datapack function. In game: /reload, then /function alton:<name> where you stand. */
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const MAX_BUILD_LINES = 20_000;
/** Only building commands: nothing that changes players, permissions or game rules. */
const ALLOWED = /^(setblock|fill|clone)\s/;

/** Clean up and check the commands. Returns the lines, or the problem. */
export function checkBuild(
  commands: unknown,
): { ok: true; lines: string[] } | { ok: false; error: string } {
  if (!Array.isArray(commands) || !commands.length)
    return { ok: false, error: 'No commands to build.' };
  const lines: string[] = [];
  for (const raw of commands) {
    if (typeof raw !== 'string') continue;
    for (const part of raw.split('\n')) {
      const l = part.trim().replace(/^\//, '');
      if (!l || l.startsWith('#')) continue;
      if (!ALLOWED.test(l))
        return {
          ok: false,
          error: `Only setblock, fill and clone are allowed in a build. Not allowed: “${l.slice(0, 60)}”.`,
        };
      if (!/[~^]/.test(l))
        return {
          ok: false,
          error: `Use relative coordinates (~ or ^) so it builds where the player stands: “${l.slice(0, 60)}”.`,
        };
      lines.push(l);
    }
  }
  if (!lines.length) return { ok: false, error: 'No commands to build.' };
  if (lines.length > MAX_BUILD_LINES)
    return {
      ok: false,
      error: `Too many commands (${lines.length}); keep it under ${MAX_BUILD_LINES}.`,
    };
  return { ok: true, lines };
}

/** "Big Castle!" → "big_castle". */
export const buildName = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'build';

/** Worlds in a saves folder, most recently played first. */
export function listWorlds(saves: string): string[] {
  if (!existsSync(saves)) return [];
  return readdirSync(saves)
    .filter((d) => existsSync(join(saves, d, 'level.dat')))
    .map((d) => ({ d, t: statSync(join(saves, d, 'level.dat')).mtimeMs }))
    .sort((a, b) => b.t - a.t)
    .map((x) => x.d);
}

/** Write the build into the world's "alton" datapack. Returns the in-game command. */
export function writeBuild(worldDir: string, name: string, lines: string[], about = ''): string {
  const pack = join(worldDir, 'datapacks', 'alton');
  writeFileSync(
    join((mkdirSync(pack, { recursive: true }), pack), 'pack.mcmeta'),
    JSON.stringify(
      {
        pack: {
          description: 'Builds made by Alton',
          pack_format: 48,
          supported_formats: { min_inclusive: 15, max_inclusive: 999 },
        },
      },
      null,
      2,
    ),
  );
  const body = `# ${about.replace(/\n/g, ' ').slice(0, 200) || name} (made by Alton)\n${lines.join('\n')}\n`;
  // 1.21+ reads "function", older versions "functions": write both.
  for (const folder of ['function', 'functions']) {
    const dir = join(pack, 'data', 'alton', folder);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${name}.mcfunction`), body);
  }
  return `/function alton:${name}`;
}
