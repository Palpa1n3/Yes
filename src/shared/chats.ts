/** Saved conversations ("chats"), like ChatGPT's sidebar. */
import type { StoredMessage } from './types';

export interface ChatMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  /** Research mode: web search, a smarter model, fuller answers with sources. */
  research: boolean;
  /** Started in the phone app (its id there), so later syncs add to the same chat. */
  phoneId?: string;
}

export interface ChatsState {
  activeId: string;
  /** Newest first. */
  chats: ChatMeta[];
}

export const NEW_CHAT_TITLE = 'New chat';
export const MAX_CHAT_MESSAGES = 1000;

export interface Source {
  url: string;
  title: string;
}

/** A short title from the first thing the user asked. */
export function titleFrom(text: string): string {
  const t = text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[?.!]+$/, '');
  if (!t) return NEW_CHAT_TITLE;
  if (t.length <= 48) return t.charAt(0).toUpperCase() + t.slice(1);
  const cut = t.slice(0, 48);
  const at = cut.lastIndexOf(' ');
  return `${(at > 24 ? cut.slice(0, at) : cut).replace(/[,;:]$/, '')}…`.replace(/^./, (c) =>
    c.toUpperCase(),
  );
}

export type ChatGroup = 'Pinned' | 'Today' | 'Yesterday' | 'Previous 7 days' | 'Older';

export function chatGroup(c: ChatMeta, now: number): ChatGroup {
  if (c.pinned) return 'Pinned';
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const day = 86_400_000;
  if (c.updatedAt >= start.getTime()) return 'Today';
  if (c.updatedAt >= start.getTime() - day) return 'Yesterday';
  if (c.updatedAt >= start.getTime() - 7 * day) return 'Previous 7 days';
  return 'Older';
}

/** A chat as Markdown, for export. */
export function chatToMarkdown(
  meta: ChatMeta,
  messages: StoredMessage[],
  assistantName: string,
): string {
  const lines = [`# ${meta.title}`, '', `_${new Date(meta.createdAt).toLocaleString()}_`, ''];
  for (const m of messages) {
    if (m.role === 'user') lines.push(`**You:** ${m.text}`, '');
    else if (m.role === 'assistant') {
      lines.push(`**${assistantName}:**`, '', m.text, '');
      if (m.sources?.length) {
        lines.push('Sources:', ...m.sources.map((s) => `- [${s.title || s.url}](${s.url})`), '');
      }
    } else if (m.role === 'command')
      lines.push(
        `> ${m.command.cmd.action} ${m.command.cmd.target ?? ''} — ${m.command.status}`,
        '',
      );
  }
  return lines.join('\n').trim() + '\n';
}
