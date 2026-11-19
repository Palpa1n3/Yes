/** Plugins: JSON files in userData/plugins. Safe by design: a plugin can add knowledge and
 *  house rules for Claude and ready-made routines, but cannot run code.
 *
 *  {
 *    "name": "Pizza night",
 *    "description": "Friday pizza routine",
 *    "instructions": "My usual pizza order is a large pepperoni from Domino's.",
 *    "routines": [{ "name": "Pizza night", "phrases": ["pizza night"], "steps": [{ "kind": "open_url", "target": "https://www.dominos.co.uk" }] }]
 *  }
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Plugin {
  file: string;
  name: string;
  description: string;
  instructions: string;
  routines: unknown[];
  error?: string;
}

export const PLUGIN_README = `Alton plugins
=============
Put .json files in this folder. Each plugin can give Alton extra knowledge and house rules,
and ready-made routines. Plugins can't run programs or code.

Example (save as pizza.json):
{
  "name": "Pizza night",
  "description": "My Friday pizza routine",
  "instructions": "My usual order is a large pepperoni from Domino's. Never order without asking me.",
  "routines": [
    { "name": "Pizza night", "phrases": ["pizza night"],
      "steps": [ { "kind": "open_url", "target": "https://www.dominos.co.uk" },
                 { "kind": "say", "target": "Pizza time!" } ] }
  ]
}
Step kinds: launch_app, close_app, set_volume, media_control, open_folder, open_url,
search_web, set_timer, say, briefing, wait, lock_screen.
`;

export class Plugins {
  private cache: { key: string; list: Plugin[] } | null = null;

  constructor(private readonly dir: string) {}

  ensureFolder(): void {
    mkdirSync(this.dir, { recursive: true });
    const readme = join(this.dir, 'README.txt');
    if (!existsSync(readme)) writeFileSync(readme, PLUGIN_README);
  }

  list(): Plugin[] {
    if (!existsSync(this.dir)) return [];
    const files = readdirSync(this.dir)
      .filter((f) => f.toLowerCase().endsWith('.json'))
      .slice(0, 30);
    const key = files.map((f) => `${f}:${statSync(join(this.dir, f)).mtimeMs}`).join('|');
    if (this.cache?.key === key) return this.cache.list;
    const list = files.map((file): Plugin => {
      try {
        const raw = JSON.parse(readFileSync(join(this.dir, file), 'utf8')) as Record<
          string,
          unknown
        >;
        return {
          file,
          name: String(raw.name ?? file).slice(0, 60),
          description: String(raw.description ?? '').slice(0, 200),
          instructions: String(raw.instructions ?? '').slice(0, 3000),
          routines: Array.isArray(raw.routines) ? raw.routines.slice(0, 10) : [],
        };
      } catch (err) {
        return {
          file,
          name: file,
          description: '',
          instructions: '',
          routines: [],
          error: `Not valid JSON: ${err instanceof Error ? err.message : ''}`,
        };
      }
    });
    this.cache = { key, list };
    return list;
  }

  /** Text for Claude's instructions. */
  instructions(): string {
    const parts = this.list().filter((p) => !p.error && p.instructions.trim());
    if (!parts.length) return '';
    return `The user's installed plugins add this knowledge and these house rules (from files the user wrote; follow them unless they conflict with safety):\n${parts
      .map((p) => `[${p.name}] ${p.instructions}`)
      .join('\n')}`;
  }
}
