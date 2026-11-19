import { useEffect } from 'react';
import { useAssistantStore } from '@renderer/stores/assistantStore';
import { useConversationStore } from '@renderer/stores/conversationStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { useVoiceStore } from '@renderer/stores/voiceStore';
import { useGamingStore } from '@renderer/stores/gamingStore';
import { playSfx } from './sfx';
import { isListening, toggleListening } from './useSpeechInput';
import { stopSpeaking } from './useSpeechOutput';
import { isPhantom, matchWake, startWakeListener } from './wakeWord';

/** The first wake name that matches (the assistant's name or an extra wake word). */
function matchAnyWake(text: string, names: string[]): string | null {
  for (const n of names) {
    if (!n.trim()) continue;
    const r = matchWake(text, n.trim());
    if (r !== null) return r;
  }
  return null;
}

/** Ignore the mic briefly after ARC stops talking, so it doesn't hear itself. */
const ECHO_MS = 1200;

let lastHeard = 0;
/** When the last spoken request was made, and until when a follow-up needs no name. */
let lastVoice = 0;
let followUntil = 0;
const FOLLOW_MS = 8000;

/** A request was just spoken (push-to-talk counts too). */
export function noteVoiceRequest(): void {
  lastVoice = performance.now();
}

/** Alton just finished answering: if that was a spoken request, listen briefly for more. */
function armFollowUp(): void {
  const now = performance.now();
  if (useSettingsStore.getState().settings.followUp && now - lastVoice < 120_000)
    followUntil = now + FOLLOW_MS;
}

/** Turn open mic on or off (the shortcut, the chip, or "open mic off"). */
export function setOpenMic(on: boolean): void {
  const s = useSettingsStore.getState().settings;
  if (on && !s.voiceInput) {
    useConversationStore
      .getState()
      .pushSystem('Voice input is off. Turn it on in Settings › Voice.');
    return;
  }
  if (useVoiceStore.getState().openMic === on) return;
  lastHeard = performance.now();
  useVoiceStore.setState({ openMic: on });
  playSfx(on ? 'open' : 'send', true);
  useAssistantStore.getState().logActivity({
    kind: 'msg',
    label: on ? 'Open mic on: talk normally' : 'Open mic off',
    status: 'success',
  });
}

export const toggleOpenMic = (): void => setOpenMic(!useVoiceStore.getState().openMic);

/** Always-on listening: the wake word ("Alton, what's the time?") and/or open mic
 *  (everything said goes to the assistant). Only stretches of speech are transcribed. */
export function useWakeWord(): void {
  const quiet =
    useGamingStore((g) => g.active) &&
    useSettingsStore.getState().settings.gamingQuiet &&
    !useSettingsStore.getState().settings.gamingVoice;
  const wake = useSettingsStore((s) => s.settings.wakeWord && s.settings.voiceInput);
  const openMic = useVoiceStore((v) => v.openMic);
  const on = (wake || openMic) && !quiet;

  // Open mic switches itself off after a few quiet minutes.
  useEffect(() => {
    if (!openMic) return;
    const t = setInterval(() => {
      const mins = useSettingsStore.getState().settings.openMicMinutes;
      if (performance.now() - lastHeard > mins * 60_000) {
        setOpenMic(false);
        useConversationStore
          .getState()
          .pushSystem(`Open mic switched off after ${mins} quiet minutes.`);
      }
    }, 15_000);
    return () => clearInterval(t);
  }, [openMic]);

  useEffect(() => {
    if (!on) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    let busy = false;
    let quietSince = 0;
    window.arc.voice.prepare();

    const unsubSpeech = useAssistantStore.subscribe((s, prev) => {
      if (prev.speechActive && !s.speechActive) {
        quietSince = performance.now();
        armFollowUp();
      }
    });
    // Replies that aren't read aloud arm the follow-up when they finish.
    const unsubReply = useConversationStore.subscribe((s, prev) => {
      if (
        prev.activeResponseId &&
        !s.activeResponseId &&
        !useAssistantStore.getState().speechActive
      )
        armFollowUp();
    });

    let lastRetry = 0;
    const onUtterance = async (audio: Float32Array): Promise<void> => {
      const a = useAssistantStore.getState();
      const stt = useVoiceStore.getState().status.stt.state;
      if (stt === 'idle' || stt === 'error') {
        // The model isn't loaded (or its download failed): try again now and then.
        if (performance.now() - lastRetry > 60_000) {
          lastRetry = performance.now();
          window.arc.voice.prepare();
        }
        return;
      }
      if (
        busy ||
        stt !== 'ready' ||
        isListening() ||
        (!a.speechActive && performance.now() - quietSince < ECHO_MS)
      )
        return;
      const speaking = a.speechActive;
      busy = true;
      try {
        const text = (await window.arc.voice.transcribe(audio)).trim();
        if (!text || isPhantom(text)) return;
        const { assistantName, wakeWords } = useSettingsStore.getState().settings;
        const rest = matchAnyWake(text, [assistantName, ...wakeWords]);
        // Interrupting: while Alton talks, only "stop" (or the name + a new request) counts,
        // so its own voice coming back through the mic is ignored.
        if (speaking) {
          const t = (rest ?? text)
            .toLowerCase()
            .replace(/[.!,]+/g, '')
            .trim();
          if (
            /^(stop|quiet|shush|enough|ok stop|stop talking|be quiet|shut up|that's enough|cancel)$/.test(
              t,
            )
          ) {
            stopSpeaking();
            return;
          }
          if (rest === null || rest.split(/\s+/).filter(Boolean).length < 2) return;
          stopSpeaking();
          lastVoice = performance.now();
          await useConversationStore.getState().send(rest);
          return;
        }
        const following = performance.now() < followUntil;
        const open = useVoiceStore.getState().openMic || following;
        if (open) {
          // Everything counts; a leading name is simply dropped.
          const request = rest ?? text;
          if (request.split(/\s+/).filter(Boolean).length < 2 && rest === null && !following)
            return;
          lastHeard = performance.now();
          lastVoice = lastHeard;
          followUntil = 0;
          stopSpeaking();
          window.arc.window.peek();
          if (request) await useConversationStore.getState().send(request);
          else toggleListening();
          return;
        }
        if (rest === null) return;
        lastVoice = performance.now();
        window.arc.window.peek();
        playSfx('open', true);
        stopSpeaking();
        if (rest.split(' ').filter(Boolean).length >= 2)
          await useConversationStore.getState().send(rest);
        else toggleListening(); // "Alton" … then the request
      } catch {
        /* a failed transcription just means we missed one; keep listening */
      } finally {
        busy = false;
      }
    };

    startWakeListener((u) => void onUtterance(u))
      .then((s) => {
        if (cancelled) s();
        else stop = s;
      })
      .catch(() => {
        useConversationStore
          .getState()
          .pushSystem(
            `Listening needs the microphone. Check Windows Settings › Privacy & security › Microphone.`,
            'error',
          );
        if (useVoiceStore.getState().openMic) useVoiceStore.setState({ openMic: false });
      });

    return () => {
      cancelled = true;
      unsubSpeech();
      unsubReply();
      stop?.();
    };
  }, [on]);
}
