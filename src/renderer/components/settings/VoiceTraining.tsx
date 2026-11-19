import { Check, Mic, Plus, Square, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { addFix, learnFix } from '@shared/vocab';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { startMic, type MicSession } from '@renderer/voice/mic';
import { Field, Section } from './controls';

const STARTERS = [
  'Open Lunar Client',
  "What's the weather like today?",
  'Set a timer for ten minutes',
  'Play some music on Spotify',
  'Turn the volume down',
  'Add milk to my shopping list',
  'What time do I finish work tomorrow?',
  'Open Steam',
];

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Voice training: read phrases out loud; whatever the speech model gets wrong is learnt as a
 *  correction ("necklion" → "Lunar Client") and fixed in everything you say from then on. */
export function VoiceTraining() {
  const { settings: s, update } = useSettingsStore();
  const [phrases, setPhrases] = useState<string[]>([
    `${s.assistantName}, open Discord`,
    ...STARTERS,
    ...s.voiceWords.slice(0, 4).map((w) => `Open ${w}`),
  ]);
  const [result, setResult] = useState<Record<string, { heard: string; note: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [mine, setMine] = useState('');
  const session = useRef<MicSession | null>(null);

  const record = async (phrase: string): Promise<void> => {
    if (busy) {
      // Second press: stop now.
      const ses = session.current;
      session.current = null;
      if (ses) void finish(phrase, ses);
      return;
    }
    setBusy(phrase);
    setResult((r) => ({ ...r, [phrase]: { heard: '', note: 'Listening… say it now' } }));
    try {
      const ses = await startMic({
        onLevel: () => undefined,
        onAutoStop: () => {
          const cur = session.current;
          session.current = null;
          if (cur) void finish(phrase, cur);
        },
      });
      session.current = ses;
    } catch {
      setBusy(null);
      setResult((r) => ({ ...r, [phrase]: { heard: '', note: "Couldn't use the microphone." } }));
    }
  };

  const finish = async (phrase: string, ses: MicSession): Promise<void> => {
    if (!ses.heardSpeech()) {
      ses.cancel();
      setBusy(null);
      setResult((r) => ({
        ...r,
        [phrase]: { heard: '', note: "Didn't hear anything. Try again." },
      }));
      return;
    }
    const audio = ses.stop();
    setResult((r) => ({ ...r, [phrase]: { heard: '', note: 'Working out what it heard…' } }));
    try {
      const heard = await window.arc.voice.transcribe(audio, true);
      const fix = learnFix(heard, phrase);
      if (norm(heard) === norm(phrase))
        setResult((r) => ({ ...r, [phrase]: { heard, note: 'Heard perfectly.' } }));
      else if (fix) {
        await update({ voiceFixes: addFix(useSettingsStore.getState().settings.voiceFixes, fix) });
        setResult((r) => ({
          ...r,
          [phrase]: { heard, note: `Learnt: “${fix.heard}” means “${fix.meant}”.` },
        }));
      } else
        setResult((r) => ({
          ...r,
          [phrase]: { heard, note: 'Too different to learn from; try saying it again.' },
        }));
    } catch {
      setResult((r) => ({
        ...r,
        [phrase]: { heard: '', note: "The speech model isn't ready yet." },
      }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section title="Train Alton on your voice">
      <Field
        label="Words Alton should know"
        hint="Names of people, places, games and apps you say (comma-separated). The speech model is told to expect them, and your installed apps and games are added automatically."
        stacked
      >
        <input
          className="h-8 w-full rounded-[6px] border border-line bg-panel-raised/80 px-2 text-[12px] text-text-primary placeholder:text-text-muted/70 focus:border-accent focus:outline-none"
          aria-label="Words Alton should know"
          placeholder="e.g. Lunar Client, Tesco, Cardiff, Palpatine"
          defaultValue={s.voiceWords.join(', ')}
          onBlur={(e) =>
            void update({
              voiceWords: [
                ...new Set(
                  e.target.value
                    .split(',')
                    .map((w) => w.trim())
                    .filter(Boolean),
                ),
              ].slice(0, 60),
            })
          }
        />
      </Field>
      <Field
        label="Say these out loud"
        hint="Press the mic, say the phrase normally, and stop talking. Whatever comes out wrong is learnt and fixed from then on. Do the ones it struggles with two or three times. Add your own phrases at the bottom."
        stacked
      >
        <ul className="space-y-1.5">
          {phrases.map((p) => {
            const r = result[p];
            return (
              <li key={p} className="rounded-[6px] border border-line/50 px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={`hud-button !px-2 ${busy === p ? '!border-alert !text-alert' : ''}`}
                    disabled={!!busy && busy !== p}
                    aria-label={busy === p ? 'Stop' : `Say “${p}”`}
                    onClick={() => void record(p)}
                  >
                    {busy === p ? <Square size={12} /> : <Mic size={12} />}
                  </button>
                  <span className="flex-1 text-[13px] text-ice">{p}</span>
                  {r?.note === 'Heard perfectly.' && <Check size={14} className="text-ok" />}
                </div>
                {r && (
                  <div className="mt-1 pl-9 text-[12px] text-text-muted">
                    {r.heard && (
                      <>
                        Heard: <span className="text-text-primary">“{r.heard}”</span> ·{' '}
                      </>
                    )}
                    {r.note}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const t = mine.trim();
            if (t && !phrases.includes(t)) setPhrases((x) => [...x, t]);
            setMine('');
          }}
        >
          <input
            className="h-8 flex-1 rounded-[6px] border border-line bg-panel-raised/80 px-2 text-[12px] text-text-primary placeholder:text-text-muted/70 focus:border-accent focus:outline-none"
            aria-label="Your own phrase"
            placeholder="Your own phrase, e.g. Open Lunar Client and join Hypixel"
            value={mine}
            onChange={(e) => setMine(e.target.value)}
          />
          <button type="submit" className="hud-button">
            <Plus size={12} /> Add
          </button>
        </form>
      </Field>
      {s.voiceFixes.length > 0 && (
        <Field label="What it has learnt" hint="Remove any that are wrong." stacked>
          <ul className="space-y-1">
            {s.voiceFixes.map((f) => (
              <li key={f.heard} className="flex items-center gap-2 text-[12px]">
                <span className="flex-1 text-text-muted">
                  “{f.heard}” → <span className="text-ice">{f.meant}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Forget “${f.heard}”`}
                  className="text-text-muted hover:text-alert"
                  onClick={() =>
                    void update({ voiceFixes: s.voiceFixes.filter((x) => x.heard !== f.heard) })
                  }
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        </Field>
      )}
    </Section>
  );
}
