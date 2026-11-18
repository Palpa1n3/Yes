import { FolderOpen, FileJson, RotateCcw, Volume2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { buildSystemPrompt } from '@shared/personalities';
import type { AppInfo, ReduceMotion, ThemeId } from '@shared/types';
import { useConversationStore } from '@renderer/stores/conversationStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { THEMES, THEME_TOKENS } from '@renderer/themes/themes';
import { unavailableSpeechInput, webSpeechOutput, type VoiceInfo } from '@renderer/voice/providers';
import { playSfx } from '@renderer/voice/sfx';
import { playChime } from '@renderer/voice/alarm';
import { Field, Section, Segmented, Select, Slider, TextField, Toggle } from './controls';
import { AiSection } from './AiSection';
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
          label="Remember conversation"
          hint="Keeps the transcript between restarts, stored only on this PC."
        >
          <Toggle
            label="Remember conversation"
            checked={s.persistHistory}
            onChange={(v) => void update({ persistHistory: v })}
          />
        </Field>
        <Field label="Clear conversation" hint="Also erases the saved copy.">
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
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  useEffect(() => {
    void webSpeechOutput.voices().then(setVoices);
  }, []);
  return (
    <>
      <Section title="Speech">
        <Field label="Mute voice" hint="Silences speech everywhere (also in the tray menu).">
          <Toggle
            label="Mute voice"
            checked={s.voiceMuted}
            onChange={(v) => void update({ voiceMuted: v })}
          />
        </Field>
        <Field
          label="Speak replies"
          hint={
            webSpeechOutput.available
              ? 'Reads replies aloud with a system voice.'
              : 'No speech engine available.'
          }
        >
          <Toggle
            label="Speak replies"
            checked={s.speakReplies}
            onChange={(v) => void update({ speakReplies: v })}
            disabled={!webSpeechOutput.available}
          />
        </Field>
        <Field label="Voice" stacked>
          <div className="flex items-center gap-2">
            <Select
              label="Voice"
              value={s.voiceName}
              onChange={(v) => void update({ voiceName: v })}
              options={[
                { value: '', label: 'System default' },
                ...voices.map((v) => ({ value: v.name, label: `${v.name} (${v.lang})` })),
              ]}
            />
            <button
              type="button"
              className="hud-button"
              onClick={() =>
                webSpeechOutput.speak(`Hello. This is ${s.assistantName}.`, {
                  voiceName: s.voiceName || undefined,
                })
              }
              disabled={!webSpeechOutput.available}
            >
              <Volume2 size={12} strokeWidth={1.5} /> Test
            </button>
          </div>
        </Field>
        <Field label="Voice input" hint={unavailableSpeechInput.unavailableReason}>
          <Toggle label="Voice input" checked={false} onChange={() => undefined} disabled />
        </Field>
        <Field
          label={`Wake word “Hey ${s.assistantName}”`}
          hint="Placeholder; listening for a wake word arrives with voice input."
        >
          <Toggle
            label="Wake word"
            checked={s.wakeWord}
            onChange={(v) => void update({ wakeWord: v })}
            disabled
          />
        </Field>
      </Section>
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
  const info = useAppInfo([s.globalHotkey]);
  const fallback = info?.activeHotkey && info.activeHotkey !== s.globalHotkey;
  const keys: Array<[string, string]> = [
    ['Ctrl + 1…6', 'Switch tabs'],
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
  const { settings: s } = useSettingsStore();
  const info = useAppInfo();
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <>
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
