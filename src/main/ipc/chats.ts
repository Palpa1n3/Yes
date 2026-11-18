import { app, dialog, shell } from 'electron';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chatToMarkdown } from '@shared/chats';
import { IPC } from '@shared/ipc';
import type { MainContext } from '../context';
import { ChatStore } from '../services/chat-store';
import { toWebUrl } from '../services/command-executor';
import { emit, handle, on } from './handle';

export function registerChatsIpc(ctx: MainContext): ChatStore {
  const userData = app.getPath('userData');
  const store = new ChatStore({
    dir: join(userData, 'chats'),
    legacyHistory: join(userData, 'history.json'),
    persist: () => ctx.settings.get().persistHistory,
    onChange: (s) => emit(ctx.getWindow(), IPC.chats.onChange, s),
  });
  store.load();
  // Turning "Remember conversations" off also forgets what was stored.
  ctx.settings.subscribe((next, prev) => {
    if (prev.persistHistory && !next.persistHistory) store.wipeDisk();
  });

  const id = (v: unknown): string => String(v).slice(0, 40);
  handle(IPC.chats.state, () => store.state());
  handle(IPC.chats.open, (v) => store.open(id(v)));
  handle(IPC.chats.create, (research) => store.create(research === true));
  on(
    IPC.chats.save,
    (_w, v, messages) => Array.isArray(messages) && store.save(id(v), messages),
    ctx.getWindow,
  );
  handle(IPC.chats.rename, (v, title) => {
    store.rename(id(v), String(title));
    return store.state();
  });
  handle(IPC.chats.setPinned, (v, p) => {
    store.setPinned(id(v), p === true);
    return store.state();
  });
  handle(IPC.chats.setResearch, (v, r) => {
    store.setResearch(id(v), r === true);
    return store.state();
  });
  handle(IPC.chats.remove, (v) => store.remove(id(v)));
  handle(IPC.chats.search, (q) => store.search(String(q).slice(0, 200)));
  handle(IPC.chats.exportMd, async (v) => {
    const meta = store.get(id(v));
    if (!meta) return { ok: false, message: 'That chat no longer exists.' };
    const safe =
      meta.title
        .replace(/[\\/:*?"<>|]+/g, '')
        .slice(0, 60)
        .trim() || 'Chat';
    const win = ctx.getWindow();
    const opts = {
      title: 'Export chat',
      defaultPath: join(app.getPath('documents'), `${safe}.md`),
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    };
    const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
    if (r.canceled || !r.filePath) return { ok: false, message: 'Export cancelled.' };
    writeFileSync(
      r.filePath,
      chatToMarkdown(meta, store.messages(meta.id), ctx.settings.get().assistantName),
    );
    shell.showItemInFolder(r.filePath);
    return { ok: true, message: `Saved to ${r.filePath}` };
  });

  // Links in answers (research sources): http(s) only, opened in the default browser.
  on(
    IPC.app.openUrl,
    (_w, url) => {
      const safe = toWebUrl(String(url));
      if (safe && /^https?:\/\//i.test(String(url).trim())) void shell.openExternal(safe);
    },
    ctx.getWindow,
  );
  return store;
}
