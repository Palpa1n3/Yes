/** Watches the clipboard (text only) and remembers recent copies, in memory only. */
import { MAX_CLIPS, looksSecret, type ClipItem } from '@shared/clipboard';

export interface ClipDeps {
  read(): string | Promise<string>;
  write(text: string): void;
  enabled(): boolean;
  onChange(list: ClipItem[]): void;
  now?: () => number;
}

export class ClipboardHistory {
  private items: ClipItem[] = [];
  private last = '';
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly now: () => number;

  constructor(private readonly d: ClipDeps) {
    this.now = d.now ?? Date.now;
  }

  list(): ClipItem[] {
    return this.items.map((i) => ({ ...i }));
  }

  /** Check the clipboard once (called on a timer). */
  async poll(): Promise<void> {
    if (!this.d.enabled()) return;
    let text: string;
    try {
      text = await this.d.read();
    } catch {
      return;
    }
    if (!text.trim() || text === this.last) return;
    this.last = text;
    const clipped = text.slice(0, 5000);
    this.items = [
      {
        id: `k${this.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        text: clipped,
        at: this.now(),
        sensitive: looksSecret(clipped),
      },
      ...this.items.filter((i) => i.text !== clipped),
    ].slice(0, MAX_CLIPS);
    this.d.onChange(this.list());
  }

  /** Put an earlier copy back on the clipboard. */
  copy(id: string): boolean {
    const it = this.items.find((i) => i.id === id);
    if (!it) return false;
    this.last = it.text; // don't record it again as new
    this.d.write(it.text);
    return true;
  }

  remove(id: string): void {
    this.items = this.items.filter((i) => i.id !== id);
    this.d.onChange(this.list());
  }

  clear(): void {
    this.items = [];
    this.d.onChange([]);
  }

  /** What Claude may see: recent, non-secret copies (optionally matching words). */
  forModel(query = ''): Array<{ copied: string; text: string }> {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return this.items
      .filter((i) => !i.sensitive)
      .filter((i) => words.every((w) => i.text.toLowerCase().includes(w)))
      .slice(0, 15)
      .map((i) => ({
        copied: new Date(i.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: i.text.slice(0, 1500),
      }));
  }

  async start(ms = 1200): Promise<void> {
    try {
      this.last = await this.d.read(); // what's already there when ARC starts isn't "new"
    } catch {
      /* ignore */
    }
    this.timer = setInterval(() => void this.poll(), ms);
    this.timer.unref?.();
  }

  stop(): void {
    clearInterval(this.timer);
  }
}
