import {
  Check,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Mic,
  Smartphone,
  Sparkles,
  User,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { RemoteInfo } from '@shared/ipc';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { Toggle } from '@renderer/components/settings/controls';
import { QrCode } from '@renderer/components/settings/QrCode';

const STEPS = ['You', 'Claude', 'Voice', 'Smart features', 'Phone'] as const;

/** Settings › Advanced › Run setup again. */
export const SETUP_EVENT = 'arc:setup';

function Row({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4 border-b border-line/40 py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-text-primary">{label}</div>
        <div className="text-[12px] text-text-muted">{hint}</div>
      </div>
      {children}
    </div>
  );
}

/** First-run setup: five short steps; every choice can be changed later in Settings. */
export function SetupGuide({ onClose }: { onClose(): void }) {
  const { settings: s, update } = useSettingsStore();
  const [step, setStep] = useState(0);
  const [key, setKey] = useState('');
  const [keyMsg, setKeyMsg] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [remote, setRemote] = useState<RemoteInfo | null>(null);

  useEffect(() => void window.arc.ai.status().then((a) => setHasKey(a.hasKey)), []);
  useEffect(() => {
    if (step !== 4 || !s.phoneAccess) return;
    const load = (): void => void window.arc.remote.status().then(setRemote);
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [step, s.phoneAccess]);

  const finish = (): void => {
    void update({ onboarded: true });
    onClose();
  };
  const Icon = [User, KeyRound, Mic, Sparkles, Smartphone][step] ?? User;
  const input =
    'h-9 w-full rounded-[8px] border border-line bg-panel-raised px-3 text-[13px] text-text-primary focus:border-accent focus:outline-none';

  return (
    <div className="no-drag absolute inset-0 z-[60] flex items-center justify-center bg-void/80 backdrop-blur-[3px]">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Set up Alton"
        className="hud-panel w-[min(640px,calc(100%-40px))] !rounded-[16px] !bg-panel/97 p-7"
      >
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-[12px] border border-accent/40 bg-accent/10 text-accent shadow-glow-sm">
            <Icon size={20} strokeWidth={1.5} />
          </span>
          <div className="flex-1">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
              Setup · step {step + 1} of {STEPS.length}
            </div>
            <h2 className="font-display text-[20px] font-light text-ice">
              {
                [
                  `Welcome to ${s.assistantName}`,
                  'Connect Claude',
                  'Voice',
                  'Smart features',
                  'Use it from your phone',
                ][step]
              }
            </h2>
          </div>
          <button
            type="button"
            onClick={finish}
            className="font-mono text-[11px] uppercase text-text-muted hover:text-accent"
          >
            Skip setup
          </button>
        </div>
        <div className="mb-5 flex gap-1.5" aria-hidden>
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-accent shadow-glow-sm' : 'bg-line'}`}
            />
          ))}
        </div>

        <div className="min-h-[230px]">
          {step === 0 && (
            <div className="space-y-4">
              <p className="text-[13px] text-text-muted">
                A few quick choices and you're ready. You can change any of them later in Settings.
              </p>
              <label className="block">
                <span className="text-[12px] text-text-muted">Your first name</span>
                <input
                  className={input}
                  defaultValue={s.userName}
                  onBlur={(e) => void update({ userName: e.target.value.trim().slice(0, 40) })}
                />
              </label>
              <label className="block">
                <span className="text-[12px] text-text-muted">
                  What should the assistant be called? (also the wake word)
                </span>
                <input
                  className={input}
                  defaultValue={s.assistantName}
                  onBlur={(e) => {
                    const v = e.target.value.trim().slice(0, 24);
                    if (v) void update({ assistantName: v });
                  }}
                />
              </label>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-3 text-[13px]">
              <p className="text-text-muted">
                Claude is the brain: real conversation, actions on the PC, research and Agent Mode.
                You need an Anthropic API key (console.anthropic.com › API Keys). It's stored
                encrypted on this PC and only ever sent to Anthropic. Tip: set a monthly limit in
                the console.
              </p>
              {hasKey ? (
                <p className="flex items-center gap-2 text-ok">
                  <Check size={14} /> Claude is connected.
                </p>
              ) : (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setKeyMsg('Checking…');
                    void window.arc.ai.setKey(key.trim()).then((r) => {
                      setKeyMsg(r.message);
                      if (r.ok) {
                        setHasKey(true);
                        setKey('');
                        void update({ provider: 'anthropic' });
                      }
                    });
                  }}
                >
                  <input
                    type="password"
                    className={input}
                    placeholder="sk-ant-…"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    aria-label="Anthropic API key"
                  />
                  <button type="submit" className="hud-button !px-4" disabled={!key.trim()}>
                    Connect
                  </button>
                </form>
              )}
              {keyMsg && <p className="text-[12px] text-text-muted">{keyMsg}</p>}
              <p className="text-[12px] text-text-muted">
                No key yet? Skip this: {s.assistantName} still works offline with simple replies,
                and a free local AI (Ollama) can be added in Settings › AI.
              </p>
            </div>
          )}
          {step === 2 && (
            <div>
              <Row
                label="Read replies aloud"
                hint="Alton speaks its answers (you can pick a voice in Settings › Voice)."
              >
                <Toggle
                  label="Read replies aloud"
                  checked={s.speakReplies}
                  onChange={(v) => void update({ speakReplies: v })}
                />
              </Row>
              <Row
                label={`Wake word “${s.assistantName}”`}
                hint={`Say “${s.assistantName}, what's the time?” from anywhere. The mic listens on this PC only.`}
              >
                <Toggle
                  label="Wake word"
                  checked={s.wakeWord}
                  onChange={(v) => void update({ wakeWord: v, voiceInput: v || s.voiceInput })}
                />
              </Row>
              <Row
                label="Follow-up without the name"
                hint="After an answer, keep talking for 8 seconds without saying the name again."
              >
                <Toggle
                  label="Follow-up"
                  checked={s.followUp}
                  onChange={(v) => void update({ followUp: v })}
                />
              </Row>
            </div>
          )}
          {step === 3 && (
            <div>
              <Row
                label="See your screen"
                hint="So you can ask “what's this error?”. One picture, kept on this PC, sent only when needed."
              >
                <Toggle
                  label="See your screen"
                  checked={s.screenAware}
                  onChange={(v) => void update({ screenAware: v })}
                />
              </Row>
              <Row
                label="Learn about me"
                hint="Remembers lasting facts you mention (shown in Notes, where you can edit them)."
              >
                <Toggle
                  label="Learn about me"
                  checked={s.autoMemory}
                  onChange={(v) => void update({ autoMemory: v })}
                />
              </Row>
              <Row
                label="Offer help unprompted"
                hint="Now and then: memory hogs, rain before events, urgent emails. Never at night or while gaming."
              >
                <Toggle
                  label="Offer help"
                  checked={s.initiative}
                  onChange={(v) => void update({ initiative: v })}
                />
              </Row>
              <Row
                label="Agent Mode"
                hint="“Handle this for me” lets Alton use the mouse and keyboard. It always asks before anything risky."
              >
                <Toggle
                  label="Agent Mode"
                  checked={s.agentMode}
                  onChange={(v) => void update({ agentMode: v })}
                />
              </Row>
            </div>
          )}
          {step === 4 && (
            <div className="space-y-3">
              <Row
                label="Phone companion"
                hint="Use the full Alton from your phone on your home Wi-Fi (chats, PC controls, screen view)."
              >
                <Toggle
                  label="Phone companion"
                  checked={s.phoneAccess}
                  onChange={(v) => void update({ phoneAccess: v })}
                />
              </Row>
              {s.phoneAccess && remote?.running && remote.urls[0] && (
                <div className="flex items-center gap-4">
                  <QrCode
                    text={`${remote.urls.find((u) => u.includes('//192.168.')) ?? remote.urls[0]}/#pair=${remote.code}`}
                    size={140}
                    label="Scan to pair your phone"
                  />
                  <p className="text-[13px] text-text-muted">
                    Point your phone camera at the code and tap the link.{' '}
                    {remote.paired ? <b className="text-ok">Phone paired ✓</b> : ''}
                  </p>
                </div>
              )}
              <p className="text-[12px] text-text-muted">
                There's also a phone-only version that works with the PC off: see Settings ›
                Connections.
              </p>
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            className="hud-button"
            disabled={step === 0}
            onClick={() => setStep((n) => n - 1)}
          >
            <ChevronLeft size={12} /> Back
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              className="hud-button !border-accent !text-accent"
              onClick={() => setStep((n) => n + 1)}
            >
              Next <ChevronRight size={12} />
            </button>
          ) : (
            <button
              type="button"
              className="hud-button !border-accent !text-accent"
              onClick={finish}
            >
              <Check size={12} /> Finish
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
