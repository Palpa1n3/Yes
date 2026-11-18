import { CheckCircle2, KeyRound, Trash2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AiModel, AiProvider, AiStatus, AiTestResult } from '@shared/types';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { Field, Segmented, Select } from './controls';

const MODELS: Array<{ value: AiModel; label: string; hint: string }> = [
  {
    value: 'claude-haiku-5-5',
    label: 'Haiku 5.5 · fastest, cheapest',
    hint: 'Fast and inexpensive: great for everyday commands and chat.',
  },
  {
    value: 'claude-sonnet-5-5',
    label: 'Sonnet 5.5 · smarter (~20× cost)',
    hint: 'Better at tricky questions and multi-step requests. Roughly 20× Haiku per message.',
  },
  {
    value: 'claude-opus-5-5',
    label: 'Opus 5.5 · smartest (~40× cost)',
    hint: 'The most capable. Roughly 40× Haiku per message.',
  },
];

/** Provider, model and API key. The key is sent once to main, which validates it,
 *  encrypts it with the OS and never sends it back. */
export function AiSection() {
  const { settings: s, update } = useSettingsStore();
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AiTestResult | null>(null);

  useEffect(() => {
    void window.arc.ai.status().then(setStatus);
  }, []);

  const save = async (): Promise<void> => {
    setBusy(true);
    setResult(null);
    try {
      const r = await window.arc.ai.setKey(draft);
      setResult(r);
      if (r.ok) {
        setDraft('');
        setStatus(await window.arc.ai.status());
        void update({ provider: 'anthropic' });
      }
    } finally {
      setBusy(false);
    }
  };

  const test = async (): Promise<void> => {
    setBusy(true);
    setResult(null);
    try {
      setResult(await window.arc.ai.test());
    } finally {
      setBusy(false);
    }
  };

  const remove = async (): Promise<void> => {
    setStatus(await window.arc.ai.clearKey());
    setResult(null);
    void update({ provider: 'mock' });
  };

  const model = MODELS.find((m) => m.value === s.model) ?? MODELS[0];

  return (
    <>
      <Field
        label="AI"
        hint={
          s.provider === 'mock'
            ? 'Offline mock: free canned replies, a few fixed commands.'
            : 'Claude: real conversation and actions, billed to your Anthropic credit.'
        }
      >
        <Segmented<AiProvider>
          label="AI provider"
          value={s.provider}
          onChange={(v) => void update({ provider: v })}
          options={[
            { value: 'mock', label: 'Offline' },
            { value: 'anthropic', label: 'Claude' },
          ]}
        />
      </Field>

      {s.provider === 'anthropic' && (
        <Field label="Model" hint={model?.hint} stacked>
          <Select<AiModel>
            label="Claude model"
            value={s.model}
            onChange={(v) => void update({ model: v })}
            options={MODELS}
          />
        </Field>
      )}
      {s.provider === 'anthropic' && (
        <Field
          label="Research model"
          hint="Used for chats in research mode, which search the web and write fuller answers with sources. Web searches cost about 1p each on top of the usual message cost."
          stacked
        >
          <Select<AiModel>
            label="Research model"
            value={s.researchModel}
            onChange={(v) => void update({ researchModel: v })}
            options={MODELS}
          />
        </Field>
      )}

      <Field
        label="Anthropic API key"
        hint={
          status === null
            ? 'Checking…'
            : status.hasKey
              ? 'Saved on this PC, encrypted by Windows. It is never shown again or sent anywhere except Anthropic.'
              : status.encryptionAvailable
                ? 'Create one at console.anthropic.com › API Keys, then paste it here. Tip: set a monthly limit under Limits.'
                : "This system can't encrypt secrets, so a key can't be stored safely."
        }
        stacked
      >
        {status?.hasKey ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 font-mono text-[12px] text-ok">
              <KeyRound size={13} strokeWidth={1.5} /> Key saved
            </span>
            <button
              type="button"
              className="hud-button"
              onClick={() => void test()}
              disabled={busy}
            >
              {busy ? 'Testing…' : 'Test'}
            </button>
            <button
              type="button"
              className="hud-button"
              onClick={() => void remove()}
              aria-label="Remove API key"
            >
              <Trash2 size={12} strokeWidth={1.5} /> Remove
            </button>
          </div>
        ) : (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) void save();
            }}
          >
            <input
              type="password"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="sk-ant-…"
              aria-label="Anthropic API key"
              autoComplete="off"
              spellCheck={false}
              disabled={!status?.encryptionAvailable}
              className="h-8 min-w-0 flex-1 border border-line bg-panel-raised/80 px-2 font-mono text-[12px] text-text-primary placeholder:text-text-muted/70 focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              className="hud-button"
              disabled={busy || !draft.trim() || !status?.encryptionAvailable}
            >
              {busy ? 'Checking…' : 'Save & test'}
            </button>
          </form>
        )}
        {result && (
          <p
            role="status"
            className={`mt-2 flex items-start gap-1.5 text-[12px] ${result.ok ? 'text-ok' : 'text-alert'}`}
          >
            {result.ok ? (
              <CheckCircle2 size={13} strokeWidth={1.5} className="mt-0.5 shrink-0" />
            ) : (
              <XCircle size={13} strokeWidth={1.5} className="mt-0.5 shrink-0" />
            )}
            {result.message}
          </p>
        )}
      </Field>
    </>
  );
}
