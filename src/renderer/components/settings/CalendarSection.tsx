import { CheckCircle2, Link2, Trash2, XCircle } from 'lucide-react';
import { useState } from 'react';
import type { CalendarUrlResult } from '@shared/calendar';
import { useCalendarStore } from '@renderer/stores/calendarStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { Field, Section, Select, Toggle } from './controls';

/** Connect a calendar by its private iCal address (stored encrypted in main). */
export function CalendarSection() {
  const { settings: s, update } = useSettingsStore();
  const { configured, events, error } = useCalendarStore();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CalendarUrlResult | null>(null);

  const save = async (): Promise<void> => {
    setBusy(true);
    setResult(null);
    try {
      const r = await window.arc.calendar.setUrl(draft);
      setResult(r);
      if (r.ok) setDraft('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Calendar">
      <Field
        label="Google Calendar"
        hint={
          configured
            ? `Connected${error ? ` · ${error}` : ` · ${events.length} upcoming event${events.length === 1 ? '' : 's'}`}. Read-only; refreshes every 10 minutes.`
            : 'In Google Calendar on the web: ⚙ Settings › click your calendar under “Settings for my calendars” › Integrate calendar › copy “Secret address in iCal format”. Treat it like a password.'
        }
        stacked
      >
        {configured ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 font-mono text-[12px] text-ok">
              <CheckCircle2 size={13} /> Calendar connected
            </span>
            <button
              type="button"
              className="hud-button"
              onClick={() => {
                setResult(null);
                void window.arc.calendar.clearUrl();
              }}
            >
              <Trash2 size={12} strokeWidth={1.5} /> Disconnect
            </button>
          </div>
        ) : (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <input
              type="password"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Secret address in iCal format"
              placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
              autoComplete="off"
              spellCheck={false}
              className="h-8 w-72 border border-line bg-panel-raised/80 px-2 font-mono text-[12px] text-text-primary placeholder:text-text-muted/70 focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              className="hud-button"
              disabled={busy || draft.trim().length < 20}
            >
              <Link2 size={12} strokeWidth={1.5} /> {busy ? 'Checking…' : 'Connect'}
            </button>
          </form>
        )}
        {result && (
          <p
            className={`mt-1.5 flex items-center gap-1.5 text-[12px] ${result.ok ? 'text-ok' : 'text-alert'}`}
          >
            {result.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
            {result.message}
          </p>
        )}
      </Field>
      <Field
        label="Heads-up before events"
        hint="A notification, and ARC says it, before timed events."
      >
        <Select
          label="Heads-up before events"
          value={String(s.calendarReminder)}
          onChange={(v) => void update({ calendarReminder: Number(v) })}
          options={[
            { value: '0', label: 'Off' },
            { value: '5', label: '5 minutes before' },
            { value: '10', label: '10 minutes before' },
            { value: '15', label: '15 minutes before' },
            { value: '30', label: '30 minutes before' },
          ]}
        />
      </Field>
      <Field
        label="Leave-by reminders"
        hint="For events with a location: works out the drive from home and tells you when to set off (10 minutes before). No live traffic, so it adds a margin."
      >
        <Toggle
          label="Leave-by reminders"
          checked={s.leaveReminders}
          onChange={(v) => void update({ leaveReminders: v })}
        />
      </Field>
      <Field
        label="Home address or postcode"
        hint="Where journeys start (only this is sent to OpenStreetMap to find it on the map). Blank = your weather town."
        stacked
      >
        <input
          className="h-8 w-full rounded-[6px] border border-line bg-panel-raised/80 px-2 text-[12px] text-text-primary placeholder:text-text-muted/70 focus:border-accent focus:outline-none"
          aria-label="Home address or postcode"
          placeholder="e.g. LS1 4AP"
          defaultValue={s.homeAddress}
          maxLength={200}
          onBlur={(e) => void update({ homeAddress: e.target.value.trim() })}
        />
      </Field>
    </Section>
  );
}
