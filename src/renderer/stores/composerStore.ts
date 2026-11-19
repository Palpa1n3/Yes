import { create } from 'zustand';
import { MAX_ATTACHMENTS } from '@shared/attachments';
import { prepareFile, type Prepared } from '@renderer/lib/attachments';
import { useConversationStore } from './conversationStore';

interface Composer {
  items: Prepared[];
  adding: boolean;
  add(files: File[]): Promise<void>;
  remove(i: number): void;
  clear(): void;
}

/** Files and pictures waiting to be sent with the next message. */
export const useComposerStore = create<Composer>((set, get) => ({
  items: [],
  adding: false,
  async add(files) {
    set({ adding: true });
    for (const f of files) {
      if (get().items.length >= MAX_ATTACHMENTS) {
        useConversationStore
          .getState()
          .pushSystem(`Up to ${MAX_ATTACHMENTS} files per message.`, 'error');
        break;
      }
      const r = await prepareFile(f);
      if ('error' in r) useConversationStore.getState().pushSystem(r.error, 'error');
      else set((s) => ({ items: [...s.items, r] }));
    }
    set({ adding: false });
  },
  remove: (i) => set((s) => ({ items: s.items.filter((_, j) => j !== i) })),
  clear: () => set({ items: [] }),
}));
