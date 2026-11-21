/** The Android app's native features, with the browser's own as the fallback, so the same
 *  phone app works both as a web page and inside the app (Capacitor). */
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
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
  talking || (!isApp && 'speechSynthesis' in window && speechSynthesis.speaking);

/* A recorded-voice source (the PC's Fish Audio voice): MP3 per chunk, or null to use the phone. */
let audioVoice: ((text: string) => Promise<Blob | null>) | null = null;
export const setAudioVoice = (fn: ((text: string) => Promise<Blob | null>) | null): void => {
  audioVoice = fn;
};
let player: HTMLAudioElement | null = null;
let playToken = 0;
function chunks(text: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (const s of text.match(/[^.!?\n]+[.!?]*\s*/g) ?? [text]) {
    if ((cur + s).length > 900 && cur) {
      out.push(cur.trim());
      cur = '';
    }
    cur += s.slice(0, 900);
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function play(blob: Blob, token: number): Promise<void> {
  return new Promise((resolve) => {
    if (token !== playToken) return resolve();
    const url = URL.createObjectURL(blob);
    player = new Audio(url);
    const done = (): void => {
      URL.revokeObjectURL(url);
      resolve();
    };
    player.onended = done;
    player.onerror = done;
    void player.play().catch(done);
  });
}
/** Speaks with the recorded voice; false if it isn't available (then the phone voice is used). */
async function speakAudio(text: string, onend?: () => void): Promise<boolean> {
  if (!audioVoice) return false;
  const token = ++playToken;
  const parts = chunks(text);
  let next: Promise<Blob | null> = audioVoice(parts[0] ?? text).catch(() => null);
  const first = await next;
  if (!first) return false;
  for (let i = 0; i < parts.length; i++) {
    const blob = i === 0 ? first : await next;
    if (token !== playToken || !blob) break;
    if (i + 1 < parts.length) next = audioVoice(parts[i + 1] as string).catch(() => null);
    await play(blob, token);
  }
  if (token === playToken) {
    talking = false;
    onend?.();
  }
  return true;
}

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
  playToken++;
  player?.pause();
  player = null;
  if (isApp) {
    talking = false;
    void TextToSpeech.stop().catch(() => undefined);
  } else if ('speechSynthesis' in window) speechSynthesis.cancel();
}

export function speak(
  text: string,
  o: { rate?: number; voice?: string; onend?: () => void } = {},
): void {
  if (audioVoice) {
    talking = true;
    void speakAudio(text, o.onend).then((ok) => {
      if (!ok) {
        talking = false;
        speakDevice(text, o);
      }
    });
    return;
  }
  speakDevice(text, o);
}
function speakDevice(text: string, o: { rate?: number; voice?: string; onend?: () => void }): void {
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
/** Replaces everything Alton has scheduled with this list (reminders and watch heads-ups). */
export async function scheduleNotes(
  list: Array<{ id: number; title: string; body: string; at: number }>,
): Promise<void> {
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
      notifications: future.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
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

/* ── Phone powers (Android app only): messages, alarms, calendar, contacts, shift app ── */
export interface AppMessage {
  id: string;
  app: string;
  from: string;
  text: string;
  at: number;
  canReply: boolean;
}
export interface CalEvent {
  id: number;
  repeats: boolean;
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  location: string;
}
export interface PowerStatus {
  messages: boolean;
  screenReader: boolean;
  calendar: boolean;
  contacts: boolean;
  usage?: boolean;
  bluetooth?: boolean;
}
interface AltonNativePlugin {
  status(): Promise<PowerStatus>;
  openSettings(o: {
    which: 'messages' | 'screenReader' | 'app' | 'assistant' | 'usage';
  }): Promise<void>;
  requestAccess(o: { which: 'calendar' | 'contacts' | 'bluetooth' }): Promise<{ granted: boolean }>;
  getMessages(): Promise<{ messages: AppMessage[] }>;
  setWallpaper(o: {
    position: string;
    variant: string;
    size: string;
    clock: boolean;
    lockOnly: boolean;
    calm: boolean;
  }): Promise<void>;
  setWallpaperImage(o: { data: string }): Promise<void>;
  alexaType(o: { text: string }): Promise<void>;
  diagnostics(): Promise<import('@shared/diagnostics').PhoneHealth>;
  openWallpaper(): Promise<void>;
  setAnnounce(o: {
    mode: 'off' | 'headphones' | 'always';
    quietFrom: number;
    quietTo: number;
    rate: number;
  }): Promise<void>;
  replyMessage(o: { id: string; text: string }): Promise<void>;
  setAlarm(o: { hour: number; minute: number; label: string }): Promise<void>;
  calendarEvents(o: { from: number; to: number }): Promise<{ events: CalEvent[] }>;
  addEvents(o: {
    events: Array<{
      title: string;
      start: number;
      end: number;
      location?: string;
      notes?: string;
      remindMinutes?: number;
    }>;
  }): Promise<{ added: number }>;
  updateEvent(o: {
    id: number;
    title?: string;
    start?: number;
    end?: number;
    location?: string;
    notes?: string;
  }): Promise<{ updated: number }>;
  deleteEvent(o: { id: number }): Promise<{ deleted: number }>;
  findContacts(o: { name: string }): Promise<{ contacts: Array<{ name: string; phone: string }> }>;
  listApps(): Promise<{ apps: Array<{ name: string; package: string }> }>;
  readApp(o: {
    package: string;
    tap?: string;
  }): Promise<{ text: string; front: string; lines: number }>;
  snapSend(o: { name: string; text: string }): Promise<void>;
  takeAssist(): Promise<{ assist: boolean; mode: 'drive' | 'talk' }>;
  setWidget(o: {
    title: string;
    line1: string;
    line2: string;
    line3: string;
    shift?: string;
    user?: string;
    place?: string;
    lat?: number;
    lon?: number;
  }): Promise<void>;
  keepScreenOn(o: { on: boolean }): Promise<void>;
  media(o: {
    action: 'next' | 'previous' | 'pause' | 'play' | 'play_pause' | 'volume_up' | 'volume_down';
  }): Promise<void>;
  sendSms(o: { to: string; text: string }): Promise<void>;
  pickContact(): Promise<{ name: string; phone: string }>;
  addListener(
    event: 'assist',
    fn: (d: { mode?: 'drive' | 'talk' }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(event: 'message', fn: (m: AppMessage) => void): Promise<PluginListenerHandle>;
}
/** The app's own native code (android/app/src/main/java/com/alton/phone/AltonNativePlugin.java). */
export const Native = registerPlugin<AltonNativePlugin>('AltonNative');

export async function powerStatus(): Promise<PowerStatus | null> {
  if (!isApp) return null;
  try {
    return await Native.status();
  } catch {
    return null;
  }
}
