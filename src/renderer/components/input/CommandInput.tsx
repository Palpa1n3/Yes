import { CornerDownLeft, FileText, LoaderCircle, Mic, Paperclip, Square, X } from 'lucide-react';
import { useComposerStore } from '@renderer/stores/composerStore';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useConversationStore } from '@renderer/stores/conversationStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { useVoiceStore } from '@renderer/stores/voiceStore';
import { cancelListening, useSpeechInput } from '@renderer/voice/useSpeechInput';
import { FOCUS_INPUT_EVENT } from '@renderer/hooks/useAppCommands';
import { PREFILL_EVENT } from '@renderer/components/transcript/Transcript';
import { SlashPalette } from './SlashPalette';
import { allCommands, matchSlash, matchWithArgs, type SlashCommand } from './slashCommands';

/** Clipboard shortcut: show the saved prompts for the copied text (detail = the text). */
export const CLIP_ACTIONS_EVENT = 'arc:clip-actions';

/** Command line: ›_ prompt, ↑/↓ history, Esc clear/stop, / palette, push-to-talk mic. */
interface Props {
  assistantName: string;
  /** Compact pill: no room for a dropdown, so the palette becomes an inline hint. */
  compact?: boolean;
  autoFocus?: boolean;
}

export function CommandInput({ assistantName, compact = false, autoFocus = false }: Props) {
  const { send, cancel, inputHistory, activeResponseId } = useConversationStore();
  const [value, setValue] = useState('');
  const [histIdx, setHistIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [active, setActive] = useState(0);
  const [paletteDismissed, setPaletteDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const attached = useComposerStore((c) => c.items);

  const prompts = useSettingsStore((s) => s.settings.prompts);
  /** Text from the clipboard shortcut: the palette then shows only saved prompts for it. */
  const [clip, setClip] = useState<string | null>(null);
  const items = paletteDismissed
    ? []
    : clip !== null
      ? allCommands(prompts, clip)
          .filter((c) => c.prompt)
          .filter((c) => value === '/' || c.name.startsWith(value.toLowerCase().trim()))
      : matchSlash(value, prompts);
  const paletteOpen = items.length > 0;
  const busy = activeResponseId !== null;

  // Global hotkey / tray: focus the input.
  useEffect(() => {
    const focus = (): void => inputRef.current?.focus();
    window.addEventListener(FOCUS_INPUT_EVENT, focus);
    if (autoFocus) focus();
    return () => window.removeEventListener(FOCUS_INPUT_EVENT, focus);
  }, [autoFocus]);

  // "Edit" on the last message puts its text back here.
  useEffect(() => {
    const fill = (e: Event): void => {
      const text = (e as CustomEvent<string>).detail;
      if (typeof text !== 'string') return;
      setValue(text);
      requestAnimationFrame(() => inputRef.current?.focus());
    };
    window.addEventListener(PREFILL_EVENT, fill);
    return () => window.removeEventListener(PREFILL_EVENT, fill);
  }, []);

  // Clipboard shortcut (Ctrl+Alt+C): pick what to do with the copied text.
  useEffect(() => {
    const open = (e: Event): void => {
      const text = String((e as CustomEvent<string>).detail ?? '').trim();
      if (!text) {
        useConversationStore
          .getState()
          .pushSystem('Copy some text first, then press the clipboard shortcut.');
        return;
      }
      setClip(text);
      setValue('/');
      setActive(0);
      setPaletteDismissed(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    };
    window.addEventListener(CLIP_ACTIONS_EVENT, open);
    return () => window.removeEventListener(CLIP_ACTIONS_EVENT, open);
  }, []);

  // "/" from anywhere (outside other inputs) jumps here and opens the palette.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent): void => {
      const el = document.activeElement;
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      setValue('/');
      setPaletteDismissed(false);
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const reset = (): void => {
    setValue('');
    setHistIdx(null);
    setActive(0);
    setPaletteDismissed(false);
    setClip(null);
  };

  const runSlash = (c: SlashCommand, rest?: string): void => {
    reset();
    c.run(rest);
  };

  const submit = (): void => {
    const text = value.trim();
    const files = useComposerStore.getState().items;
    if (!text && !files.length) return;
    const exact = files.length
      ? undefined
      : matchSlash(text, prompts).find((c) => c.name === text.toLowerCase());
    if (exact) return runSlash(exact);
    const withArgs = files.length ? null : matchWithArgs(text, prompts);
    if (withArgs) return runSlash(withArgs.cmd, withArgs.rest);
    reset();
    useComposerStore.getState().clear();
    void send(text, files);
  };

  const recall = (dir: -1 | 1): void => {
    if (inputHistory.length === 0) return;
    if (histIdx === null) {
      if (dir === 1) return;
      setDraft(value);
      const i = inputHistory.length - 1;
      setHistIdx(i);
      setValue(inputHistory[i] ?? '');
      return;
    }
    const i = histIdx + dir;
    if (i >= inputHistory.length) {
      setHistIdx(null);
      setValue(draft);
    } else if (i >= 0) {
      setHistIdx(i);
      setValue(inputHistory[i] ?? '');
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    switch (e.key) {
      case 'Enter': {
        e.preventDefault();
        const pick = paletteOpen ? items[active] : undefined;
        if (pick && value.trim().toLowerCase() !== pick.name) runSlash(pick);
        else submit();
        break;
      }
      case 'Tab':
        if (paletteOpen) {
          e.preventDefault();
          setValue(items[active]?.name ?? value);
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (paletteOpen) setActive((a) => (a - 1 + items.length) % items.length);
        else recall(-1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (paletteOpen) setActive((a) => (a + 1) % items.length);
        else recall(1);
        break;
      case 'Escape':
        e.preventDefault();
        if (cancelListening()) break;
        if (paletteOpen) {
          setPaletteDismissed(true);
          if (clip !== null) reset();
        } else if (value) reset();
        else if (busy) cancel();
        break;
    }
  };

  // Voice: click to talk (stops when you pause), or hold and release.
  const { press: talkStart, release: talkEnd } = useSpeechInput();
  const mic = useVoiceStore((s) => s.mic);
  const wake = useSettingsStore((s) => s.settings.wakeWord && s.settings.voiceInput);
  const stt = useVoiceStore((s) => s.status.stt);
  const micTitle =
    mic === 'listening'
      ? 'Listening… pause to send, or click again'
      : mic === 'transcribing'
        ? 'Working out what you said…'
        : stt.state === 'downloading'
          ? `Downloading the speech model ${stt.progress ?? 0}%`
          : `Click to talk (sends when you pause), or hold${wake ? ` · or say “${assistantName}, …”` : ''}`;

  return (
    <div className={`flex shrink-0 flex-col gap-1.5 ${compact ? '' : ''}`}>
      {attached.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Files to send">
          {attached.map((a, i) => (
            <li
              key={`${a.info.name}-${i}`}
              className="flex items-center gap-1.5 border border-accent/50 bg-accent/5 py-0.5 pl-0.5 pr-1.5 text-[11px] text-ice"
            >
              {a.info.thumb ? (
                <img src={a.info.thumb} alt="" className="h-6 w-6 object-cover" />
              ) : (
                <FileText size={14} className="ml-1 text-accent" />
              )}
              <span className="max-w-[10rem] truncate">{a.info.name}</span>
              <button
                type="button"
                aria-label={`Remove ${a.info.name}`}
                onClick={() => useComposerStore.getState().remove(i)}
                className="text-text-muted hover:text-alert"
              >
                <X size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className={`sweep-border relative flex ${compact ? 'h-9' : 'h-10'} shrink-0 items-center gap-2 rounded-[8px] border border-line bg-panel-raised/80 px-3 transition-[border-color,box-shadow] duration-150 focus-within:border-accent/40 focus-within:shadow-glow-sm`}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {paletteOpen && !compact && (
          <SlashPalette
            heading={
              clip !== null
                ? `With what you copied: “${clip.replace(/\s+/g, ' ').slice(0, 60)}${clip.length > 60 ? '…' : ''}”`
                : undefined
            }
            items={items}
            active={Math.min(active, items.length - 1)}
            onPick={runSlash}
            onHover={setActive}
          />
        )}
        {paletteOpen && compact && (
          <span
            className="pointer-events-none absolute -top-5 left-2 whitespace-nowrap font-mono text-[10px] text-text-muted"
            role="status"
          >
            ⇥ <span className="text-accent">{items[Math.min(active, items.length - 1)]?.name}</span>{' '}
            · {items[Math.min(active, items.length - 1)]?.hint}
            {items.length > 1 && ` (+${items.length - 1}, ↑/↓)`}
          </span>
        )}
        <span className="font-mono text-[13px] text-accent" aria-hidden>
          ›_
        </span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setHistIdx(null);
            setActive(0);
            setPaletteDismissed(false);
          }}
          onKeyDown={onKeyDown}
          onPaste={(e) => {
            // Pasted screenshots/files become attachments.
            const files = [...e.clipboardData.files];
            if (files.length) {
              e.preventDefault();
              void useComposerStore.getState().add(files);
            }
          }}
          placeholder={`Ask ${assistantName} anything…`}
          aria-label={`Message ${assistantName}`}
          aria-autocomplete="list"
          aria-controls={paletteOpen ? 'slash-palette' : undefined}
          aria-activedescendant={paletteOpen ? `slash-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          className="caret-block min-w-0 flex-1 bg-transparent font-mono text-[13px] text-text-primary placeholder:text-text-muted/80 focus:outline-none focus-visible:!shadow-none focus-visible:!outline-none"
          style={{ caretColor: 'rgb(var(--accent))' }}
        />
        {!compact && (
          <>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              accept="image/*,.pdf,.txt,.md,.csv,.json,.log,.xml,.yml,.yaml,.ini,.html,.css,.js,.ts,.py,.java,.c,.cpp,.cs,.sql,.srt"
              onChange={(e) => {
                void useComposerStore.getState().add([...(e.target.files ?? [])]);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              aria-label="Add files or pictures"
              title="Add files or pictures (or drag them here, or paste a screenshot)"
              onClick={() => fileRef.current?.click()}
              className="text-text-muted transition-colors hover:text-accent"
            >
              <Paperclip size={15} strokeWidth={1.5} />
            </button>
          </>
        )}
        <button
          type="button"
          aria-label={mic === 'listening' ? 'Stop listening' : 'Talk to ARC'}
          aria-pressed={mic !== 'idle'}
          title={micTitle}
          disabled={mic === 'transcribing'}
          onPointerDown={talkStart}
          onPointerUp={talkEnd}
          onPointerLeave={talkEnd}
          onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && talkStart()}
          onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && talkEnd()}
          className={`relative transition-colors hover:text-accent ${
            mic === 'listening'
              ? 'animate-pulse text-accent drop-shadow-[0_0_6px_currentColor]'
              : mic === 'transcribing'
                ? 'text-amber'
                : 'text-text-muted'
          }`}
        >
          {wake && mic === 'idle' && (
            <span
              className="pointer-events-none absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-ok shadow-[0_0_4px_currentColor]"
              aria-hidden
            />
          )}
          {mic === 'transcribing' ? (
            <LoaderCircle size={16} strokeWidth={1.5} className="animate-spin" />
          ) : (
            <Mic size={16} strokeWidth={1.5} />
          )}
        </button>
        {busy && !value ? (
          <button
            type="button"
            aria-label="Stop response"
            title="Stop (Esc)"
            onClick={cancel}
            className="text-amber transition-colors hover:text-alert"
          >
            <Square size={14} strokeWidth={1.5} />
          </button>
        ) : (
          <button
            type="submit"
            aria-label="Send"
            disabled={!value.trim() && !attached.length}
            className="text-text-muted transition-colors hover:text-accent disabled:opacity-40 disabled:hover:text-text-muted"
          >
            <CornerDownLeft size={16} strokeWidth={1.5} />
          </button>
        )}
      </form>
    </div>
  );
}
