import { useSettingsStore } from '@renderer/stores/settingsStore';
import { Field, Section, Toggle } from './controls';

/** Settings › Connections › Phone messages: reading the phone's messages aloud on the PC. */
export function PhoneMsgsSection() {
  const { settings: s, update } = useSettingsStore();
  const pm = s.phoneMsgs;
  const set = (ch: Partial<typeof pm>): void => void update({ phoneMsgs: { ...pm, ...ch } });
  const hour = (v: string, d: number): number => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= 0 && n <= 23 ? n : d;
  };
  const input =
    'h-7 w-14 rounded-[5px] border border-line bg-panel-raised px-2 text-[12px] text-text-primary focus:border-accent focus:outline-none';
  return (
    <Section title="Phone messages">
      <Field
        label="Read my phone messages aloud"
        hint="When the phone app sends them (Phone › Settings › Messages › Send messages to my PC): favourites word for word, everyone else in a short summary at most every 10 minutes. While gaming or full-screen they only show as a notification and on the desktop widget. Say “reply: …” to answer."
      >
        <Toggle
          label="Read my phone messages aloud"
          checked={pm.speak}
          onChange={(v) => set({ speak: v })}
        />
      </Field>
      <Field label="Quiet hours" hint="No reading aloud between these hours (24-hour clock).">
        <span className="flex items-center gap-1.5 text-[12px]">
          <input
            aria-label="Quiet from"
            className={input}
            type="number"
            min={0}
            max={23}
            value={pm.quietFrom}
            onChange={(e) => set({ quietFrom: hour(e.target.value, pm.quietFrom) })}
          />
          to
          <input
            aria-label="Quiet until"
            className={input}
            type="number"
            min={0}
            max={23}
            value={pm.quietTo}
            onChange={(e) => set({ quietTo: hour(e.target.value, pm.quietTo) })}
          />
        </span>
      </Field>
      <Field
        label="“While you were away”"
        hint="When the PC starts, wakes or you unlock it after 15+ minutes: a short spoken catch-up (messages, reminders that went off, rota changes, payday soon) and a card in the chat."
      >
        <Toggle
          label="While you were away"
          checked={pm.catchup}
          onChange={(v) => set({ catchup: v })}
        />
      </Field>
    </Section>
  );
}
