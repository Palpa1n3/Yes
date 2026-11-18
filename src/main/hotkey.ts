import { globalShortcut } from 'electron';

/** Fallbacks if the configured shortcut is taken (e.g. by an input-method switcher). */
const FALLBACKS = ['CommandOrControl+Shift+Space', 'Alt+Shift+Space'];

/** Registers the show/hide shortcut. Returns the accelerator actually in use, or null. */
export class Hotkey {
  private current: string | null = null;

  constructor(
    private readonly onTrigger: () => void,
    private readonly fallbacks: readonly string[] = FALLBACKS,
  ) {}

  get active(): string | null {
    return this.current;
  }

  register(preferred: string): { active: string | null; fellBack: boolean } {
    this.unregister();
    if (!preferred) return { active: null, fellBack: false }; // turned off
    for (const accel of [preferred, ...this.fallbacks.filter((f) => f !== preferred)]) {
      try {
        if (globalShortcut.register(accel, this.onTrigger)) {
          this.current = accel;
          return { active: accel, fellBack: accel !== preferred };
        }
      } catch {
        /* invalid accelerator string: try the next one */
      }
    }
    return { active: null, fellBack: true };
  }

  unregister(): void {
    if (this.current) globalShortcut.unregister(this.current);
    this.current = null;
  }
}

/** "CommandOrControl+Space" → "Ctrl+Space" (or "⌘+Space" on macOS) for display. */
export function prettyAccelerator(accel: string): string {
  const mac = process.platform === 'darwin';
  return accel
    .replace(/CommandOrControl|CmdOrCtrl/g, mac ? '⌘' : 'Ctrl')
    .replace(/Command|Cmd/g, '⌘')
    .replace(/Option/g, 'Alt');
}
