import { useState, type KeyboardEvent } from 'react';

const MAC = navigator.userAgent.includes('Mac');

/** Display form: "CommandOrControl+Space" → "Ctrl + Space". */
export function prettyAccel(a: string): string {
  return a
    .replace(/CommandOrControl|CmdOrCtrl/g, MAC ? '⌘' : 'Ctrl')
    .replace(/Command|Cmd/g, '⌘')
    .split('+')
    .join(' + ');
}

/** Turn a keydown into an Electron accelerator, or null if it isn't a usable shortcut yet. */
export function toAccelerator(
  e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
): string | null {
  const mods: string[] = [];
  if (e.ctrlKey || e.metaKey) mods.push('CommandOrControl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  let key: string | null = null;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (/^F([1-9]|1\d|2[0-4])$/.test(e.code)) key = e.code;
  else if (e.code === 'Space') key = 'Space';
  else if (
    [
      'Backquote',
      'Minus',
      'Equal',
      'BracketLeft',
      'BracketRight',
      'Semicolon',
      'Quote',
      'Comma',
      'Period',
      'Slash',
      'Backslash',
    ].includes(e.code)
  ) {
    key =
      {
        Backquote: '`',
        Minus: '-',
        Equal: '=',
        BracketLeft: '[',
        BracketRight: ']',
        Semicolon: ';',
        Quote: "'",
        Comma: ',',
        Period: '.',
        Slash: '/',
        Backslash: '\\',
      }[e.code] ?? null;
  }
  if (!key) return null;
  // Global shortcuts need a modifier, except function keys.
  if (mods.length === 0 && !/^F\d+$/.test(key)) return null;
  return [...mods, key].join('+');
}

export function HotkeyRecorder({
  value,
  onChange,
}: {
  value: string;
  onChange(accel: string): void;
}) {
  const [recording, setRecording] = useState(false);
  const [hint, setHint] = useState('');
  return (
    <button
      type="button"
      aria-label={
        recording
          ? 'Press the new shortcut'
          : `Global shortcut: ${prettyAccel(value)}. Click to change`
      }
      onClick={() => {
        setRecording(true);
        setHint('');
      }}
      onBlur={() => setRecording(false)}
      onKeyDown={(e) => {
        if (!recording) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Escape') return setRecording(false);
        const accel = toAccelerator(e);
        if (accel) {
          onChange(accel);
          setRecording(false);
        } else if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
          setHint('Use a modifier (Ctrl, Alt, Shift) plus a key, or an F-key.');
        }
      }}
      className={`min-w-[11rem] border px-3 py-1.5 text-left font-mono text-[12px] transition-colors ${recording ? 'border-amber text-amber' : 'border-line text-text-primary hover:border-accent'}`}
    >
      {recording ? hint || 'Press keys… (Esc cancels)' : value ? prettyAccel(value) : 'Off'}
    </button>
  );
}
