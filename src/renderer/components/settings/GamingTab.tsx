import { Gamepad2, X } from 'lucide-react';
import { useState } from 'react';
import { useGamingStore } from '@renderer/stores/gamingStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { Field, Section, Toggle } from './controls';

const SUGGESTED = ['Chrome', 'Edge', 'OneDrive', 'Teams', 'Spotify'];

function NameList({
  label,
  values,
  placeholder,
  suggestions = [],
  onChange,
}: {
  label: string;
  values: string[];
  placeholder: string;
  suggestions?: string[];
  onChange(v: string[]): void;
}) {
  const [draft, setDraft] = useState('');
  const add = (n: string): void => {
    const t = n.trim();
    if (t && /^[\w .-]{1,60}$/.test(t) && !values.some((v) => v.toLowerCase() === t.toLowerCase()))
      onChange([...values, t].slice(0, 20));
    setDraft('');
  };
  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5" aria-label={label}>
        {values.map((v) => (
          <span
            key={v}
            className="flex items-center gap-1 border border-accent/50 bg-accent/5 px-2 py-0.5 text-[12px] text-ice"
          >
            {v}
            <button
              type="button"
              aria-label={`Remove ${v}`}
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="text-text-muted hover:text-alert"
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {suggestions
          .filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()))
          .map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="border border-dashed border-line px-2 py-0.5 text-[12px] text-text-muted hover:border-accent hover:text-accent"
            >
              + {s}
            </button>
          ))}
      </div>
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          add(draft);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
          maxLength={60}
          className="h-8 min-w-0 flex-1 border border-line bg-panel-raised/80 px-2 font-mono text-[12px] text-text-primary placeholder:text-text-muted/70 focus:border-accent focus:outline-none"
        />
        <button type="submit" className="hud-button" disabled={!draft.trim()}>
          Add
        </button>
      </form>
    </div>
  );
}

export function GamingTab() {
  const { settings: s, update } = useSettingsStore();
  const status = useGamingStore();
  return (
    <>
      <Section title="Gaming mode">
        <Field
          label="Turn on automatically"
          hint="ARC checks every 20 seconds for a game: popular titles, and anything running from Steam, Epic, Xbox, Battle.net, Riot, EA, Ubisoft, GOG or CurseForge/Minecraft folders. Launchers on their own don't count."
        >
          <Toggle
            label="Gaming mode"
            checked={s.gamingMode}
            onChange={(v) => void update({ gamingMode: v })}
          />
        </Field>
        <Field
          label={status.active ? `On${status.game ? ` · ${status.game}` : ''}` : 'Right now'}
          hint={
            status.active
              ? status.actions.join(' · ') || 'Nothing to change.'
              : 'Try it without starting a game.'
          }
        >
          <button
            type="button"
            className={`hud-button ${status.active ? '!text-accent' : ''}`}
            onClick={() =>
              void (status.active ? window.arc.gaming.stop() : window.arc.gaming.start()).then(
                (st) => useGamingStore.setState(st),
              )
            }
          >
            <Gamepad2 size={12} strokeWidth={1.5} />{' '}
            {status.active ? 'End gaming mode' : 'Start now'}
          </button>
        </Field>
      </Section>
      <Section title="While gaming">
        <Field
          label="High performance power plan"
          hint="Switched back to your usual plan afterwards."
        >
          <Toggle
            label="High performance power plan"
            checked={s.gamingPowerPlan}
            onChange={(v) => void update({ gamingPowerPlan: v })}
          />
        </Field>
        <Field
          label="Keep ARC quiet"
          hint="No speaking, sounds or wake word. Timer alarms still ring."
        >
          <Toggle
            label="Keep ARC quiet"
            checked={s.gamingQuiet}
            onChange={(v) => void update({ gamingQuiet: v })}
          />
        </Field>
        <Field
          label="Close these apps"
          hint="Closed politely (they can still ask to save), then reopened when you stop playing."
          stacked
        >
          <NameList
            label="Apps to close while gaming"
            values={s.gamingCloseApps}
            placeholder="App name, e.g. Chrome"
            suggestions={SUGGESTED}
            onChange={(v) => void update({ gamingCloseApps: v })}
          />
        </Field>
        <Field
          label="Extra games"
          hint="If a game isn't spotted, add its process name (as shown in the Tasks tab), e.g. MyGame."
          stacked
        >
          <NameList
            label="Extra game names"
            values={s.gamingGames}
            placeholder="Process name"
            onChange={(v) => void update({ gamingGames: v })}
          />
        </Field>
        <Field
          label="Windows notifications"
          hint="Windows can hide notifications while you play: Settings › System › Notifications › Turn on do not disturb automatically › When playing a game."
        >
          <span />
        </Field>
        <Field
          label="Voice help in game"
          hint={`Keep listening for “${s.assistantName}” while gaming (even with quiet mode on), so you can ask for help mid-game.`}
        >
          <Toggle
            label="Voice help in game"
            checked={s.gamingVoice}
            onChange={(v) => void update({ gamingVoice: v })}
          />
        </Field>
        <Field
          label="Back up game saves"
          hint="After each gaming session, save files that changed (Saved Games, Documents › My Games, AppData › LocalLow, Minecraft worlds) are copied to ARC's save-backups folder. The last 5 per game are kept."
        >
          <span className="flex items-center gap-2">
            <button
              type="button"
              className="hud-button"
              onClick={() => window.arc.app.openPath('saveBackups')}
            >
              Open
            </button>
            <Toggle
              label="Back up game saves"
              checked={s.saveBackups}
              onChange={(v) => void update({ saveBackups: v })}
            />
          </span>
        </Field>
      </Section>
      <ProfilesSection />
    </>
  );
}

/** Per-game extras: more apps to close, and High performance just for that game. */
function ProfilesSection() {
  const { settings: s, update } = useSettingsStore();
  const [game, setGame] = useState('');
  const entries = Object.entries(s.gamingProfiles);
  const put = (name: string, p: (typeof s.gamingProfiles)[string] | null): void => {
    const next = Object.fromEntries(Object.entries(s.gamingProfiles).filter(([k]) => k !== name));
    void update({ gamingProfiles: p ? { ...next, [name]: p } : next });
  };
  return (
    <Section title="Game profiles">
      <p className="py-1 text-[12px] text-text-muted">
        Extra settings for one game, used when gaming mode spots it (matched by name).
      </p>
      {entries.map(([name, p]) => (
        <div key={name} className="mb-2 rounded-[6px] border border-line/60 p-2">
          <div className="mb-1 flex items-center gap-2 text-[13px] text-ice">
            <Gamepad2 size={13} className="text-accent" />
            <span className="flex-1">{name}</span>
            <button
              type="button"
              aria-label={`Remove profile ${name}`}
              onClick={() => put(name, null)}
              className="text-text-muted hover:text-alert"
            >
              <X size={12} />
            </button>
          </div>
          <Field label="High performance for this game">
            <Toggle
              label={`High performance for ${name}`}
              checked={p.highPerformance}
              onChange={(v) => put(name, { ...p, highPerformance: v })}
            />
          </Field>
          <Field label="Also close" stacked>
            <NameList
              label={`Apps to close for ${name}`}
              values={p.closeApps}
              placeholder="App name"
              onChange={(v) => put(name, { ...p, closeApps: v })}
            />
          </Field>
        </div>
      ))}
      <form
        className="flex gap-1.5 py-1"
        onSubmit={(e) => {
          e.preventDefault();
          const n = game.trim();
          if (n && !s.gamingProfiles[n]) put(n, { closeApps: [], highPerformance: true });
          setGame('');
        }}
      >
        <input
          value={game}
          onChange={(e) => setGame(e.target.value)}
          placeholder="Game name, e.g. Fortnite"
          aria-label="New game profile"
          className="h-7 min-w-0 flex-1 rounded-[5px] border border-line bg-panel-raised px-2 text-[12px] text-text-primary focus:border-accent focus:outline-none"
        />
        <button type="submit" className="hud-button" disabled={!game.trim()}>
          Add profile
        </button>
      </form>
    </Section>
  );
}
