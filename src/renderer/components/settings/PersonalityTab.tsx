import {
  PRESETS,
  buildSystemPrompt,
  pickGreeting,
  pickPhrase,
  resolveTitle,
  type ConfirmMode,
  type Personality,
  type Tone,
} from '@shared/personalities';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { Field, Section, Select, Slider, TextField } from './controls';

const TONES: Array<{ value: Tone; label: string }> = [
  { value: 'formal', label: 'Formal' },
  { value: 'dry-wit', label: 'Dry wit' },
  { value: 'warm', label: 'Warm' },
  { value: 'concise', label: 'Concise' },
  { value: 'playful', label: 'Playful' },
];
const CONFIRM: Array<{ value: ConfirmMode; label: string }> = [
  { value: 'always', label: 'Always ask' },
  { value: 'destructive-only', label: 'Only risky actions' },
  { value: 'never', label: 'Never ask' },
];
const TITLE_CHIPS = [
  { value: 'sir', label: 'Sir' },
  { value: 'boss', label: 'Boss' },
  { value: '{name}', label: 'First name' },
  { value: '', label: 'Nothing' },
];

/** What the personality would say, mirroring the mock provider's rules. */
function Preview({ p, title }: { p: Personality; title: string }) {
  const hour = new Date().getHours();
  const ack = pickPhrase(p.acknowledgements, title, 0);
  const launch =
    p.verbosity <= 1
      ? 'Launching Spotify.'
      : p.verbosity >= 5
        ? `${ack} I'll look up Spotify in your app list, falling back to the Start menu, then launch it.`
        : `${ack} Launching Spotify.`;
  const joke =
    p.humour === 0 ? 'Humour disabled.' : 'I would tell you a UDP joke, but you might not get it.';
  const lines: Array<[string, string]> = [
    ['Greeting', pickGreeting(p, title, hour, 0)],
    ['Acknowledge', launch],
    [
      'Error',
      `${pickPhrase(p.errorPhrases, title, 0)} I couldn't find “nonexistent app” installed.`,
    ],
    ['Joke', joke],
  ];
  return (
    <div
      className="space-y-1.5 border border-accent/30 bg-panel-raised/60 p-3"
      aria-live="polite"
      aria-label="Live preview"
    >
      {lines.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[5.5rem_1fr] gap-2 text-[12px]">
          <span className="micro-label pt-0.5">{k}</span>
          <span className="text-text-primary">
            <span className="mr-1.5 font-mono text-accent">›</span>
            {v}
          </span>
        </div>
      ))}
    </div>
  );
}

export function PersonalityTab() {
  const { settings, update } = useSettingsStore();
  const p = settings.personality;
  const title = resolveTitle(p.userTitle, settings.userName);

  /** Any edit turns the active personality into a custom copy. */
  const edit = (patch: Partial<Personality>): void => {
    const next = {
      ...p,
      ...patch,
      id: 'custom',
      name: p.id === 'custom' ? p.name : `Custom (${p.name})`,
    };
    void update({
      personality: { ...next, systemPrompt: buildSystemPrompt(next, settings.userName) },
    });
  };

  return (
    <>
      <Section title="Presets">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Personality presets">
          {PRESETS.map((preset) => {
            const active = p.id === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() =>
                  void update({ personality: { ...preset, assistantName: settings.assistantName } })
                }
                className={`border p-2.5 text-left transition-[border-color,box-shadow] ${active ? 'border-accent bg-accent/10 shadow-glow-sm' : 'border-line hover:border-accent'}`}
              >
                <div
                  className={`font-mono text-[11px] uppercase tracking-[0.14em] ${active ? 'text-accent' : 'text-text-primary'}`}
                >
                  {preset.name}
                </div>
                <div className="mt-1 text-[11px] leading-snug text-text-muted">
                  {TONES.find((t) => t.value === preset.tone)?.label} · verbosity {preset.verbosity}{' '}
                  · humour {preset.humour}
                </div>
              </button>
            );
          })}
        </div>
        {p.id === 'custom' && (
          <p className="mt-2 text-[12px] text-text-muted">
            Editing a custom personality. Pick a preset to start over.
          </p>
        )}
      </Section>

      <Section title="Live preview">
        <Preview p={p} title={title} />
      </Section>

      <Section title="Identity">
        <Field label="Assistant name" hint="What it's called everywhere in the app.">
          <TextField
            label="Assistant name"
            value={settings.assistantName}
            onChange={(v) => void update({ assistantName: v.toUpperCase() })}
            maxLength={24}
          />
        </Field>
        <Field
          label="How it addresses you"
          hint={
            p.userTitle === '{name}'
              ? `Uses your first name (${settings.userName || 'set it in General'}).`
              : undefined
          }
          stacked
        >
          <div className="flex flex-wrap gap-1.5">
            {TITLE_CHIPS.map((c) => (
              <button
                key={c.label}
                type="button"
                aria-pressed={p.userTitle === c.value}
                onClick={() => edit({ userTitle: c.value })}
                className={`hud-button ${p.userTitle === c.value ? '!border-accent !text-accent' : ''}`}
              >
                {c.label}
              </button>
            ))}
            <TextField
              label="Custom title"
              value={TITLE_CHIPS.some((c) => c.value === p.userTitle) ? '' : p.userTitle}
              onChange={(v) => edit({ userTitle: v })}
              placeholder="Custom…"
              width="w-28"
              maxLength={24}
            />
          </div>
        </Field>
        <Field label="Tone">
          <Select label="Tone" value={p.tone} options={TONES} onChange={(tone) => edit({ tone })} />
        </Field>
      </Section>

      <Section title="Behaviour">
        <div className="space-y-4 py-2">
          <Slider
            label="Verbosity"
            value={p.verbosity}
            min={1}
            max={5}
            labels={['Terse', 'Brief', 'Normal', 'Detailed', 'Explains all']}
            onChange={(v) => edit({ verbosity: v as Personality['verbosity'] })}
          />
          <Slider
            label="Humour"
            value={p.humour}
            min={0}
            max={3}
            labels={['None', 'Light', 'Dry', 'Frequent']}
            onChange={(v) => edit({ humour: v as Personality['humour'] })}
          />
          <Slider
            label="Proactivity"
            value={p.proactivity}
            min={0}
            max={2}
            labels={['Only responds', 'Sometimes suggests', 'Suggests often']}
            onChange={(v) => edit({ proactivity: v as Personality['proactivity'] })}
          />
        </div>
        <Field
          label="Confirm before actions"
          hint="Shows Approve / Cancel before running commands."
        >
          <Select
            label="Confirm before actions"
            value={p.confirmBeforeActions}
            options={CONFIRM}
            onChange={(confirmBeforeActions) => edit({ confirmBeforeActions })}
          />
        </Field>
      </Section>
    </>
  );
}
