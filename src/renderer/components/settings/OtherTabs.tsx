import { PromptsSection } from './PromptsSection';
import { useUiStore } from '@renderer/stores/uiStore';
import { SETUP_EVENT } from '@renderer/components/hud/SetupGuide';
import { FolderOpen, FileJson, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { buildSystemPrompt } from '@shared/personalities';
import type { AppInfo, ReduceMotion, ThemeId } from '@shared/types';
import { useConversationStore } from '@renderer/stores/conversationStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { THEMES, THEME_TOKENS } from '@renderer/themes/themes';
import { playSfx } from '@renderer/voice/sfx';
import { playChime } from '@renderer/voice/alarm';
import { Field, Section, Segmented, Select, Slider, TextField, Toggle } from './controls';

const HOURS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`,
}));
import { AiSection } from './AiSection';
import { VoiceSection } from './VoiceSection';
import { CalendarSection } from './CalendarSection';
import { EmailSection } from './EmailSection';
import { DiscordSection } from './DiscordSection';
import { PhoneAppSection, PhoneSection } from './PrivacyTab';
import { SpendingSection } from './SpendingSection';
import { OVERVIEW_PANELS } from '@renderer/components/tabs/OverviewTab';
import type { PluginInfo } from '@shared/ipc';
import { UpdatesSection } from './UpdatesSection';
import { PlaceSearch } from '@renderer/components/weather/PlaceSearch';
import { placeLabel } from '@shared/weather';
import { HotkeyRecorder, prettyAccel } from './HotkeyRecorder';

function useAppInfo(deps: unknown[] = []): AppInfo | null {
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    void window.arc.app.getInfo().then(setInfo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return info;
}

export function GeneralTab() {
  const { settings: s, update } = useSettingsStore();
  const info = useAppInfo();
  const clear = useConversationStore((c) => c.clear);
  const isWin = info?.platform === 'win32';
  return (
    <>
      <Section title="You">
        <Field label="Your first name" hint="Used by personalities that address you by name.">
          <TextField
            label="Your first name"
            value={s.userName}
            onChange={(v) => void update({ userName: v })}
          />
        </Field>
        <Field label="Assistant name">
          <TextField
            label="Assistant name"
            value={s.assistantName}
            onChange={(v) => void update({ assistantName: v.toUpperCase() })}
            maxLength={24}
          />
        </Field>
      </Section>
      <Section title="Weather">
        <Field
          label="Location"
          hint={
            s.weatherPlace
              ? `${placeLabel(s.weatherPlace)}. Only its map position is sent to Open-Meteo (free, no account).`
              : 'Search for your town. Only its map position is sent to Open-Meteo (free, no account).'
          }
        >
          <div className="flex w-64 shrink-0 flex-col gap-1.5">
            <PlaceSearch />
            {s.weatherPlace && (
              <button
                type="button"
                className="hud-button self-start"
                onClick={() => void update({ weatherPlace: null })}
              >
                Turn weather off
              </button>
            )}
          </div>
        </Field>
        <Field label="Temperature">
          <Segmented
            label="Temperature unit"
            value={s.tempUnit}
            onChange={(v) => void update({ tempUnit: v })}
            options={[
              { value: 'c', label: '°C' },
              { value: 'f', label: '°F' },
            ]}
          />
        </Field>
        <Field label="Wind speed">
          <Segmented
            label="Wind speed unit"
            value={s.windUnit}
            onChange={(v) => void update({ windUnit: v })}
            options={[
              { value: 'mph', label: 'mph' },
              { value: 'kmh', label: 'km/h' },
            ]}
          />
        </Field>
      </Section>
      <Section title="Window">
        <Field
          label="Close to tray"
          hint={
            info?.platform === 'linux'
              ? 'Not available on Linux; closing quits.'
              : 'Closing the window keeps ARC running in the tray.'
          }
        >
          <Toggle
            label="Close to tray"
            checked={s.closeToTray}
            onChange={(v) => void update({ closeToTray: v })}
            disabled={info?.platform === 'linux'}
          />
        </Field>
        <Field
          label="Launch at login"
          hint={
            isWin || info?.platform === 'darwin'
              ? 'Starts quietly in the tray. Applies to the installed app (not npm run dev).'
              : 'Not supported on this platform.'
          }
        >
          <Toggle
            label="Launch at login"
            checked={s.launchAtLogin}
            onChange={(v) => void update({ launchAtLogin: v })}
            disabled={!(isWin || info?.platform === 'darwin')}
          />
        </Field>
        <Field label="Always on top">
          <Toggle
            label="Always on top"
            checked={s.alwaysOnTop}
            onChange={(v) => void update({ alwaysOnTop: v })}
          />
        </Field>
      </Section>
      <Section title="Conversation">
        <Field
          label="Remember chats"
          hint="Keeps your chats between restarts, stored only on this PC. Turning this off deletes the saved copies."
        >
          <Toggle
            label="Remember chats"
            checked={s.persistHistory}
            onChange={(v) => void update({ persistHistory: v })}
          />
        </Field>
        <Field
          label="Clear this chat"
          hint="Empties the chat that's open (other chats are kept; delete those from the Chat tab)."
        >
          <button type="button" className="hud-button" onClick={clear}>
            Clear
          </button>
        </Field>
      </Section>
    </>
  );
}

export function AppearanceTab() {
  const { settings: s, update } = useSettingsStore();
  return (
    <>
      <Section title="Theme">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Theme">
          {(Object.keys(THEMES) as ThemeId[]).map((id) => {
            const t = THEMES[id];
            const active = s.theme === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => void update({ theme: id })}
                className={`border p-2 text-left transition-[border-color,box-shadow] ${active ? 'border-accent shadow-glow-sm' : 'border-line hover:border-accent'}`}
                style={{ background: t.colors['bg-void'] }}
              >
                <div className="mb-2 flex gap-1" aria-hidden>
                  {THEME_TOKENS.filter((k) =>
                    ['accent', 'ice', 'line', 'amber', 'ok'].includes(k),
                  ).map((k) => (
                    <span key={k} className="h-3 flex-1" style={{ background: t.colors[k] }} />
                  ))}
                </div>
                <span
                  className="font-mono text-[11px] uppercase tracking-[0.14em]"
                  style={{ color: t.colors.accent }}
                >
                  {t.name}
                </span>
              </button>
            );
          })}
        </div>
      </Section>
      <Section title="Dashboard">
        <p className="py-1 text-[12px] text-text-muted">Choose the panels on the Overview.</p>
        <div className="grid grid-cols-2 gap-x-4">
          {OVERVIEW_PANELS.map((p) => (
            <Field key={p.id} label={p.label}>
              <Toggle
                label={p.label}
                checked={!s.hiddenPanels.includes(p.id)}
                onChange={(v) =>
                  void update({
                    hiddenPanels: v
                      ? s.hiddenPanels.filter((x) => x !== p.id)
                      : [...s.hiddenPanels, p.id],
                  })
                }
              />
            </Field>
          ))}
        </div>
      </Section>
      <Section title="Avatar">
        <Field
          label="Centre display"
          hint="An animated face that looks around, reacts and talks; a code ring of turning, self-rewriting code that storms while thinking and pulses as it speaks; or the classic rings."
        >
          <Segmented<'face' | 'code' | 'rings'>
            label="Centre display"
            value={s.avatar}
            onChange={(v) => void update({ avatar: v })}
            options={[
              { value: 'face', label: 'Face' },
              { value: 'code', label: 'Code ring' },
              { value: 'rings', label: 'Rings' },
            ]}
          />
        </Field>
      </Section>
      <Section title="Effects">
        <Field label="Background particles">
          <Toggle
            label="Background particles"
            checked={s.particles}
            onChange={(v) => void update({ particles: v })}
          />
        </Field>
        <Field label="Scanlines" hint="Faint CRT lines over everything.">
          <Toggle
            label="Scanlines"
            checked={s.scanlines}
            onChange={(v) => void update({ scanlines: v })}
          />
        </Field>
        <Field label="Boot sequence" hint="The short start-up animation.">
          <Toggle
            label="Boot sequence"
            checked={s.bootSequence}
            onChange={(v) => void update({ bootSequence: v })}
          />
        </Field>
        <Field label="Reduce motion" hint="System follows your Windows animation setting.">
          <Segmented<ReduceMotion>
            label="Reduce motion"
            value={s.reduceMotion}
            onChange={(v) => void update({ reduceMotion: v })}
            options={[
              { value: 'system', label: 'System' },
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ]}
          />
        </Field>
      </Section>
    </>
  );
}

export function VoiceTab() {
  const { settings: s, update } = useSettingsStore();
  return (
    <>
      <VoiceSection />
      <Section title="Timer alarm">
        <Field
          label="Alarm sound"
          hint="Plays a repeating chime when a timer ends, until you dismiss it (up to 2 minutes). Windows also shows a notification."
        >
          <Toggle
            label="Alarm sound"
            checked={s.alarmSound}
            onChange={(v) => void update({ alarmSound: v })}
          />
        </Field>
        <div className="flex items-end gap-3 py-3">
          <Slider
            label="Alarm volume"
            value={Math.round(s.alarmVolume * 10)}
            min={0}
            max={10}
            labels={Array.from({ length: 11 }, (_, i) => `${i * 10}%`)}
            onChange={(v) => void update({ alarmVolume: v / 10 })}
          />
          <button type="button" className="hud-button mb-4" onClick={() => playChime(true)}>
            Test
          </button>
        </div>
      </Section>
      <Section title="Sound effects">
        <Field label="Sound effects" hint="Soft cues on send, success, error and start-up.">
          <Toggle label="Sound effects" checked={s.sfx} onChange={(v) => void update({ sfx: v })} />
        </Field>
        <div className="flex items-end gap-3 py-3">
          <Slider
            label="Volume"
            value={Math.round(s.sfxVolume * 10)}
            min={0}
            max={10}
            labels={Array.from({ length: 11 }, (_, i) => `${i * 10}%`)}
            onChange={(v) => void update({ sfxVolume: v / 10 })}
          />
          <button
            type="button"
            className="hud-button mb-4"
            onClick={() => playSfx('success', true)}
          >
            Test
          </button>
        </div>
      </Section>
    </>
  );
}

export function HotkeysTab() {
  const { settings: s, update } = useSettingsStore();
  const info = useAppInfo([s.globalHotkey, s.voiceHotkey, s.openMicHotkey, s.clipboardHotkey]);
  const fallback = info?.activeHotkey && info.activeHotkey !== s.globalHotkey;
  const keys: Array<[string, string]> = [
    ['Ctrl + 1…7', 'Switch tabs'],
    ['/', 'Command palette (from anywhere)'],
    ['↑ / ↓', 'Recall earlier messages'],
    ['Esc', 'Clear input, stop a reply, or close panels'],
    ['Enter / Esc', 'Approve / cancel a command card'],
    ['Ctrl + ,', 'Open settings'],
  ];
  return (
    <>
      <Section title="Global">
        <Field
          label="Show / hide ARC"
          hint={
            info?.activeHotkey === null
              ? 'Could not register any shortcut; another app may be using it.'
              : fallback
                ? `That shortcut was taken, so ${prettyAccel(info?.activeHotkey ?? '')} is active instead.`
                : 'Works from any app. Click, then press the new combination.'
          }
          stacked
        >
          <div className="flex items-center gap-2">
            <HotkeyRecorder
              value={s.globalHotkey}
              onChange={(v) => void update({ globalHotkey: v })}
            />
            {s.globalHotkey !== 'CommandOrControl+Space' && (
              <button
                type="button"
                className="hud-button"
                onClick={() => void update({ globalHotkey: 'CommandOrControl+Space' })}
              >
                Reset
              </button>
            )}
          </div>
        </Field>
        <Field
          label="Talk to ARC"
          hint={
            !s.voiceHotkey
              ? 'Off.'
              : info?.activeVoiceHotkey === null
                ? 'Could not register it; another app may be using it.'
                : info?.activeVoiceHotkey && info.activeVoiceHotkey !== s.voiceHotkey
                  ? `That shortcut was taken, so ${prettyAccel(info.activeVoiceHotkey)} is active instead.`
                  : 'Works from any app: press once and speak; ARC sends when you pause. Press again to send straight away.'
          }
          stacked
        >
          <div className="flex items-center gap-2">
            <HotkeyRecorder
              value={s.voiceHotkey}
              onChange={(v) => void update({ voiceHotkey: v })}
            />
            {s.voiceHotkey !== 'CommandOrControl+Alt+Space' && (
              <button
                type="button"
                className="hud-button"
                onClick={() => void update({ voiceHotkey: 'CommandOrControl+Alt+Space' })}
              >
                Reset
              </button>
            )}
            {s.voiceHotkey && (
              <button
                type="button"
                className="hud-button"
                onClick={() => void update({ voiceHotkey: '' })}
              >
                Turn off
              </button>
            )}
          </div>
        </Field>
        <Field
          label="Open mic on / off"
          hint={
            !s.openMicHotkey
              ? 'Off.'
              : info?.activeOpenMicHotkey === null
                ? 'Could not register it; another app may be using it.'
                : info?.activeOpenMicHotkey && info.activeOpenMicHotkey !== s.openMicHotkey
                  ? `That shortcut was taken, so ${prettyAccel(info.activeOpenMicHotkey)} is active instead.`
                  : 'Works from any app: while on, everything you say goes to the assistant (no name needed).'
          }
          stacked
        >
          <div className="flex items-center gap-2">
            <HotkeyRecorder
              value={s.openMicHotkey}
              onChange={(v) => void update({ openMicHotkey: v })}
            />
            {s.openMicHotkey !== 'CommandOrControl+Alt+M' && (
              <button
                type="button"
                className="hud-button"
                onClick={() => void update({ openMicHotkey: 'CommandOrControl+Alt+M' })}
              >
                Reset
              </button>
            )}
            {s.openMicHotkey && (
              <button
                type="button"
                className="hud-button"
                onClick={() => void update({ openMicHotkey: '' })}
              >
                Turn off
              </button>
            )}
          </div>
        </Field>
        <Field
          label="Clipboard actions"
          hint={
            !s.clipboardHotkey
              ? 'Off.'
              : info?.activeClipboardHotkey === null
                ? 'Could not register it; another app may be using it.'
                : info?.activeClipboardHotkey && info.activeClipboardHotkey !== s.clipboardHotkey
                  ? `That shortcut was taken, so ${prettyAccel(info.activeClipboardHotkey)} is active instead.`
                  : 'Copy some text in any app, press this, and pick a saved prompt (fix, summarise, translate, reply…).'
          }
          stacked
        >
          <div className="flex items-center gap-2">
            <HotkeyRecorder
              value={s.clipboardHotkey}
              onChange={(v) => void update({ clipboardHotkey: v })}
            />
            {s.clipboardHotkey !== 'CommandOrControl+Alt+C' && (
              <button
                type="button"
                className="hud-button"
                onClick={() => void update({ clipboardHotkey: 'CommandOrControl+Alt+C' })}
              >
                Reset
              </button>
            )}
            {s.clipboardHotkey && (
              <button
                type="button"
                className="hud-button"
                onClick={() => void update({ clipboardHotkey: '' })}
              >
                Turn off
              </button>
            )}
          </div>
        </Field>
      </Section>
      <Section title="In the app">
        <dl className="py-1">
          {keys.map(([k, v]) => (
            <div
              key={k}
              className="flex justify-between border-b border-line/30 py-2 text-[12px] last:border-0"
            >
              <dt className="font-mono text-accent">{k}</dt>
              <dd className="text-text-muted">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </>
  );
}

export function AdvancedTab() {
  const { settings: s, update } = useSettingsStore();
  const info = useAppInfo();
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <>
      <UpdatesSection />
      <Section title="Data">
        <Field label="Data folder" hint={info?.userDataPath}>
          <button
            type="button"
            className="hud-button"
            onClick={() => window.arc.app.openPath('userData')}
          >
            <FolderOpen size={12} strokeWidth={1.5} /> Open
          </button>
        </Field>
        <Field
          label="App list (apps.json)"
          hint="Add apps, paths and trigger phrases. Changes apply immediately."
        >
          <button
            type="button"
            className="hud-button"
            onClick={() => window.arc.app.openPath('appsJson')}
          >
            <FileJson size={12} strokeWidth={1.5} /> Edit
          </button>
        </Field>
        <Field
          label="Self-debugging: source folder"
          hint={
            s.sourceDir
              ? `${s.assistantName} can read (never change) its own code in ${s.sourceDir} to explain bugs and suggest fixes. Ask “why isn't X working?”.`
              : `${s.assistantName} already reads (never changes) the copy of its code that comes with the app: ask “why isn't X working?” or “how does the code ring work?”. Choose your project folder (the “arc” folder with package.json) if you edit the code, so it sees your latest changes and can run its tests.`
          }
          stacked
        >
          <span className="flex gap-1.5">
            <button
              type="button"
              className="hud-button"
              onClick={() => void window.arc.app.pickSourceDir()}
            >
              <FolderOpen size={12} strokeWidth={1.5} /> {s.sourceDir ? 'Change' : 'Choose'}
            </button>
            {s.sourceDir && (
              <button
                type="button"
                className="hud-button"
                onClick={() => void update({ sourceDir: '' })}
              >
                Forget
              </button>
            )}
          </span>
        </Field>
        <Field
          label="Setup guide"
          hint="The five-step first-run setup (name, Claude, voice, smart features, phone)."
        >
          <button
            type="button"
            className="hud-button"
            onClick={() => {
              useUiStore.getState().closeSettings();
              window.dispatchEvent(new Event(SETUP_EVENT));
            }}
          >
            Run setup again
          </button>
        </Field>
        <PluginsField />
        <Field
          label="Error log"
          hint={`Errors and warnings, kept on this PC. ${s.assistantName} reads it when you ask it to work out what went wrong.`}
        >
          <button
            type="button"
            className="hud-button"
            onClick={() => window.arc.app.openPath('logs')}
          >
            <FolderOpen size={12} strokeWidth={1.5} /> Open
          </button>
        </Field>
        <Field
          label="Reset all settings"
          hint="Restores defaults. Your apps list and conversation are kept."
        >
          {confirmReset ? (
            <span className="flex gap-1.5">
              <button
                type="button"
                className="hud-button !border-alert/70 !text-alert"
                onClick={() => {
                  void window.arc.app
                    .resetSettings()
                    .then((next) => useSettingsStore.setState({ settings: next }));
                  setConfirmReset(false);
                }}
              >
                Confirm reset
              </button>
              <button type="button" className="hud-button" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button type="button" className="hud-button" onClick={() => setConfirmReset(true)}>
              <RotateCcw size={12} strokeWidth={1.5} /> Reset
            </button>
          )}
        </Field>
      </Section>
      <Section title="About">
        <dl className="py-1 text-[12px]">
          {[
            ['Version', info?.version ?? '—'],
            ['Electron', info?.electron ?? '—'],
            ['Platform', info?.platform ?? '—'],
          ].map(([k, v]) => (
            <div
              key={k}
              className="flex justify-between border-b border-line/30 py-1.5 last:border-0"
            >
              <dt className="micro-label">{k}</dt>
              <dd className="numeric text-text-primary">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </>
  );
}

function PluginsField() {
  const [list, setList] = useState<PluginInfo[] | null>(null);
  const load = (): void => void window.arc.app.plugins().then(setList);
  useEffect(load, []);
  return (
    <Field
      label="Plugins"
      hint="Add .json files to the plugins folder to teach Alton extra knowledge and house rules, or add ready-made routines (the folder has a README with an example). Plugins can't run code."
      stacked
    >
      <span className="flex gap-1.5">
        <button
          type="button"
          className="hud-button"
          onClick={() => window.arc.app.openPath('plugins')}
        >
          <FolderOpen size={12} strokeWidth={1.5} /> Open folder
        </button>
        <button type="button" className="hud-button" onClick={load}>
          Reload
        </button>
      </span>
      <ul className="mt-1 space-y-0.5 text-[12px]">
        {list?.map((p) => (
          <li key={p.file} className={p.error ? 'text-alert' : 'text-text-primary'}>
            {p.name}
            <span className="text-text-muted">
              {p.error
                ? ` · ${p.error}`
                : `${p.description ? ` · ${p.description}` : ''}${p.routines ? ` · ${p.routines} routine(s)` : ''}`}
            </span>
          </li>
        ))}
        {list && !list.length && <li className="text-text-muted">No plugins yet.</li>}
      </ul>
    </Field>
  );
}

/** Screen, clipboard and health awareness; initiative, learning and Agent Mode. */
export function SmartTab() {
  const { settings: s, update } = useSettingsStore();
  return (
    <>
      <PromptsSection />
      <Section title="Awareness">
        <Field
          label={`Let ${s.assistantName} see your screen`}
          hint="Keeps one picture of the screen you're using (never ARC itself), refreshed every few seconds, on this PC only. It's sent to Claude only when a question needs it, like “what's this error?”. Paused during gaming mode."
        >
          <Toggle
            label="Screen awareness"
            checked={s.screenAware}
            onChange={(v) => void update({ screenAware: v })}
          />
        </Field>
        <Field
          label="Clipboard history"
          hint="Remembers your last 50 copies (text only) so you can copy them again or ask about them. Memory only: cleared when ARC quits. Anything that looks like a password is hidden from Claude."
        >
          <Toggle
            label="Clipboard history"
            checked={s.clipboardHistory}
            onChange={(v) => void update({ clipboardHistory: v })}
          />
        </Field>
        <Field
          label="PC health alerts"
          hint="A heads-up (notification and spoken) when the processor or graphics card runs hot, memory or a drive is nearly full, the battery is low, or the PC hasn't restarted in a week."
        >
          <Toggle
            label="PC health alerts"
            checked={s.healthAlerts}
            onChange={(v) => void update({ healthAlerts: v })}
          />
        </Field>
      </Section>
      <Section title="Initiative & memory">
        <Field
          label="Agent Mode"
          hint={`Say or type “${s.assistantName}, handle this for me” (optionally with the task, like “handle this for me: sort my desktop into folders”) and ${s.assistantName} uses the mouse and keyboard to do it. A red banner shows while it works; press Esc or say “stop” to take over. It always asks before paying, sending, deleting or changing settings, and never types passwords or card numbers. Needs Claude.`}
        >
          <Toggle
            label="Agent Mode"
            checked={s.agentMode}
            onChange={(v) => void update({ agentMode: v })}
          />
        </Field>
        <Field
          label="Learn about me automatically"
          hint={`After a chat, ${s.assistantName} notes lasting facts you mention (your job, people's names, preferences) in Notes › Memory, where you can check or delete them. Needs Claude.`}
        >
          <Toggle
            label="Learn automatically"
            checked={s.autoMemory}
            onChange={(v) => void update({ autoMemory: v })}
          />
        </Field>
        <Field
          label="Offer help unprompted"
          hint={`${s.assistantName} speaks up now and then: an app hogging memory, rain before an event, an important email, an evening wind-down. Never during gaming or quiet hours.`}
        >
          <Toggle
            label="Suggestions"
            checked={s.initiative}
            onChange={(v) => void update({ initiative: v })}
          />
        </Field>
        {s.initiative && (
          <Field label="Quiet hours" hint="No suggestions between these times.">
            <span className="flex items-center gap-2 text-[12px] text-text-muted">
              <Select<string>
                label="Quiet from"
                value={String(s.quietStart)}
                onChange={(v) => void update({ quietStart: Number(v) })}
                options={HOURS}
              />
              to
              <Select<string>
                label="Quiet until"
                value={String(s.quietEnd)}
                onChange={(v) => void update({ quietEnd: Number(v) })}
                options={HOURS}
              />
            </span>
          </Field>
        )}
      </Section>
    </>
  );
}

/** Calendar, email, Discord. */
export function ConnectionsTab() {
  return (
    <>
      <PhoneSection />
      <PhoneAppSection />
      <CalendarSection />
      <EmailSection />
      <DiscordSection />
    </>
  );
}

/** Which AI answers, its model and key, and the generated instructions. */
export function AiTab() {
  const { settings: s } = useSettingsStore();
  return (
    <>
      <SpendingSection />
      <Section title="AI model">
        <AiSection />
        <Field
          label="System prompt"
          hint="Generated from the personality; sent to a real model."
          stacked
        >
          <pre
            tabIndex={0}
            aria-label="Generated system prompt"
            className="max-h-40 overflow-auto whitespace-pre-wrap border border-line/60 bg-panel-raised/60 p-2 font-mono text-[11px] text-text-muted"
          >
            {buildSystemPrompt({ ...s.personality, assistantName: s.assistantName }, s.userName)}
          </pre>
        </Field>
      </Section>
    </>
  );
}
