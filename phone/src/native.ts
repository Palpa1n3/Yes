/** The Android app's native features, with the browser's own as the fallback, so the same
 *  phone app works both as a web page and inside the app (Capacitor). */
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/** True inside the Android app. */
export const isApp = Capacitor.isNativePlatform();

/* ── Speaking ── */
export interface VoiceInfo {
  name: string;
  lang: string;
}
let appVoices: VoiceInfo[] = [];
let talking = false;

export async function loadVoices(): Promise<void> {
  if (!isApp) return;
  try {
    appVoices = (await TextToSpeech.getSupportedVoices()).voices.map((v) => ({
      name: v.name,
      lang: v.lang,
    }));
  } catch {
    appVoices = [];
  }
}

export const canSpeak = (): boolean => isApp || 'speechSynthesis' in window;
export const isSpeaking = (): boolean =>
  isApp ? talking : 'speechSynthesis' in window && speechSynthesis.speaking;

export function voiceList(): VoiceInfo[] {
  if (isApp) return appVoices;
  return 'speechSynthesis' in window
    ? speechSynthesis.getVoices().map((v) => ({ name: v.name, lang: v.lang }))
    : [];
}

/** The chosen voice, else the best British (then any) English voice. */
export function chooseVoice<T extends VoiceInfo>(all: T[], name: string): T | null {
  return (
    all.find((v) => v.name === name) ??
    all.find((v) => /en[-_]GB/i.test(v.lang) && /google|natural|neural/i.test(v.name)) ??
    all.find((v) => /en[-_]GB/i.test(v.lang)) ??
    all.find((v) => /^en/i.test(v.lang)) ??
    null
  );
}

export function stopSpeaking(): void {
  if (isApp) {
    talking = false;
    void TextToSpeech.stop().catch(() => undefined);
  } else if ('speechSynthesis' in window) speechSynthesis.cancel();
}

export function speak(
  text: string,
  o: { rate?: number; voice?: string; onend?: () => void } = {},
): void {
  if (isApp) {
    const v = chooseVoice(appVoices, o.voice ?? '');
    const idx = v ? appVoices.indexOf(v) : -1;
    talking = true;
    TextToSpeech.speak({
      text,
      lang: v?.lang ?? 'en-GB',
      rate: o.rate ?? 1,
      volume: 1,
      category: 'playback',
      ...(idx >= 0 ? { voice: idx } : {}),
    })
      .catch(() => undefined)
      .finally(() => {
        talking = false;
        o.onend?.();
      });
    return;
  }
  if (!('speechSynthesis' in window)) return o.onend?.();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = o.rate ?? 1;
  const v = chooseVoice(speechSynthesis.getVoices(), o.voice ?? '');
  if (v) u.voice = v;
  if (o.onend) {
    const done = o.onend;
    u.onend = () => done();
    u.onerror = () => done();
  }
  speechSynthesis.speak(u);
}

/* ── Listening: the app's speech recogniser, shaped like the browser's ── */
type ResultEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
};
class AppRecognition {
  lang = 'en-GB';
  interimResults = false;
  onresult: ((e: ResultEvent) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  start(): void {
    void (async () => {
      try {
        let p = await SpeechRecognition.checkPermissions();
        if (p.speechRecognition !== 'granted') p = await SpeechRecognition.requestPermissions();
        if (p.speechRecognition !== 'granted') {
          this.onerror?.({ error: 'not-allowed' });
          return;
        }
        const r = await SpeechRecognition.start({
          language: this.lang,
          maxResults: 1,
          partialResults: false,
          popup: false,
        });
        const t = r.matches?.[0] ?? '';
        if (t) {
          const alt = Object.assign([{ transcript: t }], { isFinal: true });
          this.onresult?.({ results: [alt] });
        }
      } catch (e) {
        const m = String((e as Error)?.message ?? e);
        this.onerror?.({ error: /permission/i.test(m) ? 'not-allowed' : 'no-speech' });
      } finally {
        this.onend?.();
      }
    })();
  }
  stop(): void {
    void SpeechRecognition.stop().catch(() => undefined);
  }
  abort(): void {
    this.stop();
  }
}

/** Inside the app, `window.SpeechRecognition` is the native recogniser. */
export function installSpeechShim(): void {
  if (!isApp) return;
  (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = AppRecognition;
}

/* ── Reminders that buzz even when the app is closed ── */
export async function scheduleReminders(list: Array<{ what: string; at: number }>): Promise<void> {
  if (!isApp) return;
  try {
    let p = await LocalNotifications.checkPermissions();
    if (p.display !== 'granted') p = await LocalNotifications.requestPermissions();
    if (p.display !== 'granted') return;
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length)
      await LocalNotifications.cancel({
        notifications: pending.notifications.map((n) => ({ id: n.id })),
      });
    const future = list.filter((r) => r.at > Date.now() + 5000).slice(0, 60);
    if (!future.length) return;
    await LocalNotifications.schedule({
      notifications: future.map((r, i) => ({
        id: ((Math.floor(r.at / 60_000) % 200_000_000) * 10 + (i % 10)) % 2_000_000_000,
        title: `Alton · ${r.what}`,
        body: 'Reminder',
        schedule: { at: new Date(r.at), allowWhileIdle: true },
      })),
    });
  } catch {
    /* notifications unavailable: the in-app ping still works while open */
  }
}

/* ── Sharing and files ── */
/** Share text (WhatsApp, notes, email…). False when nothing could share it. */
export async function shareText(title: string, text: string): Promise<boolean> {
  try {
    if (isApp) {
      await Share.share({ title, text, dialogTitle: title });
      return true;
    }
    if (navigator.share) {
      await navigator.share({ title, text });
      return true;
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError' || /cancel/i.test(String(e))) return true;
  }
  return false;
}

/** In the app: hand a file to the share sheet (Calendar, Drive, My Files…). */
export async function shareFile(name: string, text: string, title: string): Promise<boolean> {
  if (!isApp) return false;
  try {
    const w = await Filesystem.writeFile({
      path: name,
      data: text,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title, files: [w.uri], dialogTitle: title });
    return true;
  } catch (e) {
    return /cancel/i.test(String(e));
  }
}
