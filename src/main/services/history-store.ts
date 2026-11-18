/** Conversation history in userData/history.json (last 200 messages). */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { StoredMessage } from '@shared/types';

export const MAX_HISTORY = 200;

const ROLES = new Set(['user', 'assistant', 'command', 'system']);

function valid(m: unknown): m is StoredMessage {
  if (!m || typeof m !== 'object') return false;
  const r = m as Record<string, unknown>;
  if (
    typeof r['id'] !== 'string' ||
    typeof r['timestamp'] !== 'number' ||
    !ROLES.has(r['role'] as string)
  )
    return false;
  return r['role'] === 'command'
    ? typeof r['command'] === 'object' && r['command'] !== null
    : typeof r['text'] === 'string';
}

export class HistoryStore {
  constructor(private readonly file: string) {}

  load(): StoredMessage[] {
    try {
      if (!existsSync(this.file)) return [];
      const raw: unknown = JSON.parse(readFileSync(this.file, 'utf8'));
      return Array.isArray(raw) ? raw.filter(valid).slice(-MAX_HISTORY) : [];
    } catch {
      return [];
    }
  }

  save(messages: StoredMessage[]): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      // Nothing is mid-stream or awaiting approval once it's on disk.
      const settled = messages
        .filter(valid)
        .slice(-MAX_HISTORY)
        .map((m): StoredMessage => {
          if (m.role === 'assistant') return { ...m, streaming: false, revealed: true };
          if (
            m.role === 'command' &&
            (m.command.status === 'pending' || m.command.status === 'awaiting')
          ) {
            return { ...m, command: { ...m.command, status: 'cancelled' } };
          }
          return m;
        });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(settled));
      renameSync(tmp, this.file);
    } catch {
      /* non-fatal */
    }
  }

  clear(): void {
    try {
      rmSync(this.file, { force: true });
    } catch {
      /* ignore */
    }
  }
}
