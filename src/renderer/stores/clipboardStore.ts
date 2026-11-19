import { create } from 'zustand';
import type { ClipItem } from '@shared/clipboard';

export const useClipboardStore = create<{ items: ClipItem[] }>(() => ({ items: [] }));

/** `alert(text)`: a PC health heads-up, shown (and spoken) as the assistant's line. */
export function bindClipboard(alert: (text: string) => void): () => void {
  void window.arc.clipboard.list().then((items) => useClipboardStore.setState({ items }));
  const off1 = window.arc.clipboard.onChange((items) => useClipboardStore.setState({ items }));
  const off2 = window.arc.clipboard.onHealth((a) => alert(a.text));
  return () => {
    off1();
    off2();
  };
}
