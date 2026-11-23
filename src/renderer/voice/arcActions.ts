import { useSettingsStore } from '@renderer/stores/settingsStore';
import type { ArcCommand, ArcTab } from '@shared/arcCommands';
import { matches } from '@shared/notes';
import { primeCleanupScan } from '@renderer/components/panels/CleanupPanel';
import { fmtBytes } from '@renderer/lib/format';
import { useChatsStore } from '@renderer/stores/chatsStore';
import { useConversationStore } from '@renderer/stores/conversationStore';
import { useGamingStore } from '@renderer/stores/gamingStore';
import { setOpenMic } from './useWakeWord';
import { SETTINGS_TABS, useUiStore, type SettingsTab } from '@renderer/stores/uiStore';

const TAB_NAMES: Record<ArcTab, string> = {
  overview: 'the Overview',
  chat: 'your chats',
  notes: 'your notes and lists',
  system: 'the System tab',
  tasks: 'the Task Manager',
  apps: 'your apps',
  network: 'the Network tab',
  storage: 'Storage',
  routines: 'your routines',
  mods: 'your Cyberpunk mods',
};

export interface ArcResult {
  ok: boolean;
  message: string;
}

/** Carry out a command for ARC itself; the message is what ARC says back. */
export async function runArcCommand(c: ArcCommand): Promise<ArcResult> {
  const ui = useUiStore.getState();
  const conv = useConversationStore.getState();
  const chats = useChatsStore.getState();
  const current = chats.chats.find((x) => x.id === conv.chatId);
  const done = (message: string): ArcResult => ({ ok: true, message });
  const fail = (message: string): ArcResult => ({ ok: false, message });

  switch (c.action) {
    case 'open_tab': {
      const tab = (c.value ?? 'overview') as ArcTab;
      if (!(tab in TAB_NAMES)) return fail("I don't have a tab called that.");
      ui.setTab(tab);
      return done(`Here's ${TAB_NAMES[tab]}.`);
    }
    case 'open_settings': {
      const sub = (SETTINGS_TABS as readonly string[]).includes(c.value ?? '')
        ? (c.value as SettingsTab)
        : undefined;
      ui.openSettings(sub);
      return done(sub ? `Opening ${sub} settings.` : 'Opening settings.');
    }
    case 'new_chat':
      await conv.newChat(false);
      return done('New chat started. What would you like to talk about?');
    case 'research': {
      await conv.newChat(true);
      ui.setTab('chat');
      if (c.value) {
        // The topic becomes the first question in the new research chat.
        setTimeout(() => void useConversationStore.getState().send(c.value ?? ''), 0);
        return done(''); // the topic itself is the next message
      }
      return done('Research chat ready. What should I look into?');
    }
    case 'research_on':
    case 'research_off': {
      if (!current) return fail('No chat is open.');
      const on = c.action === 'research_on';
      useChatsStore.setState(await window.arc.chats.setResearch(current.id, on));
      return done(
        on
          ? 'Research mode is on for this chat: I’ll search the web and cite sources.'
          : 'Research mode is off.',
      );
    }
    case 'switch_chat': {
      const q = c.value ?? '';
      const hit =
        chats.chats.find((x) => x.title.toLowerCase() === q.toLowerCase()) ??
        chats.chats.find((x) => matches(x.title, q));
      if (!hit)
        return fail(`I couldn't find a chat called “${q}”. Your chats are in the Chat tab.`);
      await conv.openChat(hit.id);
      ui.setTab('chat');
      return done(`Opened “${hit.title}”.`);
    }
    case 'export_chat': {
      if (!current) return fail('No chat is open.');
      const r = await window.arc.chats.exportMd(current.id);
      return r.ok ? done(r.message) : fail(r.message);
    }
    case 'pin_chat':
      if (!current) return fail('No chat is open.');
      useChatsStore.setState(await window.arc.chats.setPinned(current.id, true));
      return done('Pinned. It stays at the top of your chats.');
    case 'rename_chat': {
      if (!current || !c.value) return fail('What should I call it?');
      useChatsStore.setState(await window.arc.chats.rename(current.id, c.value));
      return done(`Renamed to “${c.value}”.`);
    }
    case 'scan_space': {
      const scan = await window.arc.cleanup.scan();
      primeCleanupScan(scan);
      ui.setTab('storage');
      const recommended = scan.items.filter((i) => i.recommended && i.bytes > 0);
      const total = recommended.reduce((n, i) => n + i.bytes, 0);
      const all =
        scan.items.reduce((n, i) => n + i.bytes, 0) +
        scan.downloads.reduce((n, f) => n + f.size, 0);
      if (!all)
        return done("I couldn't find much to clear. Your temp files and caches are already small.");
      const top = [...scan.items].sort((a, b) => b.bytes - a.bytes)[0];
      return done(
        `You could free about ${fmtBytes(total)} safely${all > total ? ` (up to ${fmtBytes(all)} including the Recycle Bin, shader caches and big downloads)` : ''}. The biggest is ${top?.label.toLowerCase()} at ${fmtBytes(top?.bytes ?? 0)}. I've ticked the safe ones in the Storage tab; press Clear when you're ready.`,
      );
    }
    case 'gaming_on':
      useGamingStore.setState(await window.arc.gaming.start());
      return done('Gaming mode on. I’ll keep quiet until you end it.');
    case 'open_mic_on':
      setOpenMic(true);
      return done('Open mic on. Just talk; I’m listening.');
    case 'open_mic_off':
      setOpenMic(false);
      return done('Open mic off.');
    case 'whisper_on':
      await useSettingsStore.getState().update({ whisper: true });
      return done('Whisper mode on. I’ll keep my voice down.');
    case 'whisper_off':
      await useSettingsStore.getState().update({ whisper: false });
      return done('Back to my normal voice.');
    case 'gaming_off':
      useGamingStore.setState(await window.arc.gaming.stop());
      return done('Gaming mode off; everything is back to normal.');
  }
}
