import { create } from 'zustand';
import type { EmailState } from '@shared/email';

export const useEmailStore = create<EmailState>(() => ({
  configured: false,
  address: null,
  unread: 0,
  recent: [],
  fetchedAt: null,
  error: null,
}));

export function bindEmail(): () => void {
  void window.arc.email.state().then((s) => useEmailStore.setState(s));
  return window.arc.email.onChange((s) => useEmailStore.setState(s));
}
