import { CornerDownLeft, LoaderCircle, Mic, Square } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useConversationStore } from '@renderer/stores/conversationStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { useVoiceStore } from '@renderer/stores/voiceStore';
import { cancelListening, useSpeechInput } from '@renderer/voice/useSpeechInput';
import { FOCUS_INPUT_EVENT } from '@renderer/hooks/useAppCommands';
import { SlashPalette } from './SlashPalette';
import { matchSlash, type SlashCommand } from './slashCommands';

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

  const items = paletteDismissed ? [] : matchSlash(value);
  const paletteOpen = items.length > 0;
  const busy = activeResponseId !== null;

  // Global hotkey / tray: focus the input.
  useEffect(() => {
    const focus = (): void => inputRef.current?.focus();
    window.addEventListener(FOCUS_INPUT_EVENT, focus);
    if (autoFocus) focus();
    return () => window.removeEventListener(FOCUS_INPUT_EVENT, focus);
  }, [autoFocus]);

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
  };

  const runSlash = (c: SlashCommand): void => {
    reset();
    c.run();
  };

  const submit = (): void => {
    const text = value.trim();
    if (!text) return;
    const exact = matchSlash(text).find((c) => c.name === text.toLowerCase());
    if (exact) return runSlash(exact);
    reset();
    void send(text);
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
        if (paletteOpen) setPaletteDismissed(true);
        else if (value) reset();
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
          : `Click to talk (sends when you pause), or hold${wake ? ` · or say “Hey ${assistantName}”` : ''}`;

  return (
    <form
      className={`sweep-border relative flex ${compact ? 'h-9' : 'h-10'} shrink-0 items-center gap-2 rounded-[2px] border border-line bg-panel-raised/80 px-3 transition-[border-color,box-shadow] duration-150 focus-within:border-accent/40 focus-within:shadow-glow-sm`}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {paletteOpen && !compact && (
        <SlashPalette
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
          ⇥ <span className="text-accent">{items[Math.min(active, items.length - 1)]?.name}</span> ·{' '}
          {items[Math.min(active, items.length - 1)]?.hint}
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
          disabled={!value.trim()}
          className="text-text-muted transition-colors hover:text-accent disabled:opacity-40 disabled:hover:text-text-muted"
        >
          <CornerDownLeft size={16} strokeWidth={1.5} />
        </button>
      )}
    </form>
  );
}
