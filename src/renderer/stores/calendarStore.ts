import { create } from 'zustand';
import type { CalendarState } from '@shared/calendar';

export const useCalendarStore = create<
  CalendarState & { loading: boolean; refresh(): Promise<void> }
>((set) => ({
  configured: false,
  events: [],
  fetchedAt: null,
  error: null,
  loading: false,
  async refresh() {
    set({ loading: true });
    try {
      set({ ...(await window.arc.calendar.refresh()), loading: false });
    } catch {
      set({ loading: false });
    }
  },
}));

/** `remind(text)`: a heads-up before an event (shown and spoken like ARC's other lines). */
export function bindCalendar(remind: (text: string) => void): () => void {
  void window.arc.calendar.get().then((s) => useCalendarStore.setState(s));
  const offChange = window.arc.calendar.onChange((s) =>
    useCalendarStore.setState({ ...s, loading: false }),
  );
  const offReminder = window.arc.calendar.onReminder(({ event, minutes }) =>
    remind(
      minutes <= 0
        ? `${event.title} is starting now${event.location ? `, at ${event.location}` : ''}.`
        : `Heads up: ${event.title} starts in ${minutes} minute${minutes === 1 ? '' : 's'}${event.location ? `, at ${event.location}` : ''}.`,
    ),
  );
  return () => {
    offChange();
    offReminder();
  };
}
