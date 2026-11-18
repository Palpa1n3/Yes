import { create } from 'zustand';
import type { ChatMeta, ChatsState } from '@shared/chats';

/** The saved-chats list (main owns it; this mirrors it). */
export const useChatsStore = create<ChatsState>(() => ({ activeId: '', chats: [] }));

export const activeChat = (): ChatMeta | undefined => {
  const { activeId, chats } = useChatsStore.getState();
  return chats.find((c) => c.id === activeId);
};

export function bindChats(): () => void {
  void window.arc.chats.state().then((s) => useChatsStore.setState(s));
  return window.arc.chats.onChange((s) => useChatsStore.setState(s));
}
