import { CheckCircle2, Download, KeyRound, Trash2, Volume2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  DEFAULT_FISH_VOICE,
  WHISPER_MODELS,
  type FishKeyResult,
  type FishModel,
  type VoiceEngine,
  type WhisperModel,
} from '@shared/voice';
import { useConversationStore } from '@renderer/stores/conversationStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { useVoiceStore } from '@renderer/stores/voiceStore';
import { webSpeechOutput, type VoiceInfo } from '@renderer/voice/providers';
import { Field, Section, Segmented, Select, TextField, Toggle } from './controls';

/** Who speaks (Windows voice or Fish Audio) and the local Whisper mic. */
export function VoiceSection() {
  const { settings: s, update } = useSettingsStore();
  const status = useVoiceStore((v) => v.status);
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FishKeyResult | null>(null);
  useEffect(() => {
    void webSpeechOutput.voices().then(setVoices);
  }, []);

  const saveKey = async (): Promise<void> => {
    setBusy(true);
    setResult(null);
    try {
      const r = await window.arc.voice.setFishKey(draft);
      setResult(r);
      if (r.ok) setDraft('');
    } finally {
      setBusy(false);
    }
  };

  const test = (): void => {
    const line = `Hello. This is ${s.assistantName}. How can I help?`;
    if (s.voiceEngine === 'fish' && status.fishKey) {
      // Goes through the normal speech path, so it's read in the Fish voice.
      useConversationStore.getState().pushAssistant(line);
      if (!s.speakReplies) void update({ speakReplies: true });
    } else {
      webSpeechOutput.speak(line, { voiceName: s.voiceName || undefined });
    }
  };

  const stt = status.stt;
  const sttText =
    stt.state === 'ready'
      ? 'Ready. Runs on this PC: your voice is never uploaded.'
      : stt.state === 'downloading'
        ? `Downloading… ${stt.progress ?? 0}%`
        : stt.state === 'loading'
          ? 'Loading…'
          : stt.state === 'error'
            ? (stt.error ?? 'Failed.')
            : `Downloads once (${WHISPER_MODELS[s.whisperModel].size}) the first time you use the mic.`;

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
        <Field label="Speak replies" hint="Reads ARC's replies out loud.">
          <Toggle
            label="Speak replies"
            checked={s.speakReplies}
            onChange={(v) => void update({ speakReplies: v })}
          />
        </Field>
        <Field
          label="Voice"
          hint={
            s.voiceEngine === 'fish'
              ? 'Your chosen Fish Audio voice. Reply text is sent to Fish Audio to be spoken.'
              : 'The voices built into Windows. Free and offline.'
          }
        >
          <Segmented<VoiceEngine>
            label="Voice engine"
            value={s.voiceEngine}
            onChange={(v) => void update({ voiceEngine: v })}
            options={[
              { value: 'system', label: 'Windows' },
              { value: 'fish', label: 'Fish Audio' },
            ]}
          />
        </Field>

        {s.voiceEngine === 'fish' ? (
          <>
            <Field
              label="Fish Audio API key"
              hint={
                status.fishKey
                  ? 'Saved, encrypted on this PC. It is never shown again.'
                  : 'fish.audio › your profile › API keys › Create. Paste it here, not in a chat.'
              }
              stacked
            >
              {status.fishKey ? (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 font-mono text-[12px] text-ok">
                    <CheckCircle2 size={13} /> Key saved
                  </span>
                  <button
                    type="button"
                    className="hud-button"
                    onClick={() => {
                      setResult(null);
                      void window.arc.voice.clearFishKey();
                    }}
                  >
                    <Trash2 size={12} strokeWidth={1.5} /> Remove
                  </button>
                </div>
              ) : (
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveKey();
                  }}
                >
                  <input
                    type="password"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    aria-label="Fish Audio API key"
                    placeholder="Paste your Fish Audio API key"
                    autoComplete="off"
                    spellCheck={false}
                    className="h-8 w-64 border border-line bg-panel-raised/80 px-2 font-mono text-[12px] text-text-primary placeholder:text-text-muted/70 focus:border-accent focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="hud-button"
                    disabled={busy || draft.trim().length < 16}
                  >
                    <KeyRound size={12} strokeWidth={1.5} /> {busy ? 'Checking…' : 'Save & test'}
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
              label="Voice ID"
              hint="The code from the voice's page on fish.audio (the end of its web address)."
            >
              <div className="flex items-center gap-2">
                <TextField
                  label="Fish Audio voice ID"
                  value={s.fishVoiceId}
                  onChange={(v) => void update({ fishVoiceId: v.trim() })}
                  maxLength={64}
                  width="w-60"
                />
                {s.fishVoiceId !== DEFAULT_FISH_VOICE && (
                  <button
                    type="button"
                    className="hud-button"
                    onClick={() => void update({ fishVoiceId: DEFAULT_FISH_VOICE })}
                  >
                    Reset
                  </button>
                )}
              </div>
            </Field>
            <Field
              label="Fish Audio model"
              hint="The free model costs nothing (fair use). Switch to Pro only if the free one stops working."
            >
              <Select<FishModel>
                label="Fish Audio model"
                value={s.fishModel}
                onChange={(v) => void update({ fishModel: v })}
                options={[
                  { value: 's2.1-pro-free', label: 'S2.1 Pro Free · free' },
                  { value: 's2.1-pro', label: 'S2.1 Pro · uses credit' },
                ]}
              />
            </Field>
          </>
        ) : (
          <Field label="Windows voice">
            <Select
              label="Windows voice"
              value={s.voiceName}
              onChange={(v) => void update({ voiceName: v })}
              options={[
                { value: '', label: 'System default' },
                ...voices.map((v) => ({ value: v.name, label: `${v.name} (${v.lang})` })),
              ]}
            />
          </Field>
        )}
        <Field label="Try it">
          <button
            type="button"
            className="hud-button"
            onClick={test}
            disabled={s.voiceEngine === 'fish' ? !status.fishKey : !webSpeechOutput.available}
          >
            <Volume2 size={12} strokeWidth={1.5} /> Test voice
          </button>
        </Field>
      </Section>

      <Section title="Voice input">
        <Field
          label="Microphone"
          hint="Click the mic (or press the voice shortcut, see Hotkeys) and speak; ARC sends it when you pause. Or hold the mic and let go. Esc cancels."
        >
          <Toggle
            label="Voice input"
            checked={s.voiceInput}
            onChange={(v) => void update({ voiceInput: v })}
          />
        </Field>
        <Field label="Accuracy" hint={sttText}>
          <div className="flex items-center gap-2">
            <Segmented<WhisperModel>
              label="Speech model"
              value={s.whisperModel}
              onChange={(v) => void update({ whisperModel: v })}
              options={(Object.keys(WHISPER_MODELS) as WhisperModel[]).map((k) => ({
                value: k,
                label: `${WHISPER_MODELS[k].label} ${WHISPER_MODELS[k].size}`,
              }))}
            />
            {(stt.state === 'idle' || stt.state === 'error') && (
              <button
                type="button"
                className="hud-button"
                onClick={() => window.arc.voice.prepare()}
              >
                <Download size={12} strokeWidth={1.5} />{' '}
                {stt.state === 'error' ? 'Retry' : 'Download now'}
              </button>
            )}
          </div>
        </Field>
        <Field
          label={`Wake word “${s.assistantName}”`}
          hint={`Start with the name: “${s.assistantName}, what's the time?” (or say “${s.assistantName}”, wait for the chime, then ask). “Hey” is optional. The mic stays on while this is on (Windows shows the mic icon); only speech is checked, on this PC. Music or TV nearby makes it work harder.`}
        >
          <Toggle
            label="Wake word"
            checked={s.wakeWord}
            onChange={(v) => void update({ wakeWord: v })}
            disabled={!s.voiceInput}
          />
        </Field>
        <Field
          label="Extra wake words"
          hint={`Other names that wake it as well as “${s.assistantName}”, separated by commas (e.g. Jarvis, Computer). Short or common words trigger by mistake more often.`}
          stacked
        >
          <input
            defaultValue={s.wakeWords.join(', ')}
            onBlur={(e) =>
              void update({
                wakeWords: e.target.value
                  .split(',')
                  .map((w) => w.trim())
                  .filter((w) => w.length >= 3)
                  .slice(0, 5),
              })
            }
            placeholder="Jarvis, Computer"
            aria-label="Extra wake words"
            className="h-7 w-full rounded-[5px] border border-line bg-panel-raised px-2 text-[12px] text-text-primary focus:border-accent focus:outline-none"
          />
        </Field>
        <Field
          label="Follow-up without the name"
          hint={`After ${s.assistantName} answers something you said, it listens for 8 more seconds so you can carry on (“and tomorrow?”) without saying its name again. Needs the wake word on.`}
        >
          <Toggle
            label="Follow-up"
            checked={s.followUp}
            onChange={(v) => void update({ followUp: v })}
            disabled={!s.voiceInput || !s.wakeWord}
          />
        </Field>
        <Field
          label="Whisper mode"
          hint={`Quieter, slower speech and no sound effects (late at night, or others nearby). Or say “whisper mode” / “speak normally”.`}
        >
          <Toggle
            label="Whisper mode"
            checked={s.whisper}
            onChange={(v) => void update({ whisper: v })}
          />
        </Field>
        <Field
          label="Open mic"
          hint={`Press the open-mic shortcut (Settings › Hotkeys, Ctrl+Alt+M by default) and everything you say goes to ${s.assistantName}, no name needed, until you press it again. A green MIC ON chip shows while it's listening.`}
        >
          <Select
            label="Open mic switches off after"
            value={String(s.openMicMinutes)}
            onChange={(v) => void update({ openMicMinutes: Number(v) })}
            options={[
              { value: '2', label: 'Off after 2 quiet min' },
              { value: '5', label: 'Off after 5 quiet min' },
              { value: '10', label: 'Off after 10 quiet min' },
              { value: '30', label: 'Off after 30 quiet min' },
            ]}
          />
        </Field>
      </Section>
    </>
  );
}
