import { app, net, safeStorage } from 'electron';
import { join } from 'node:path';
import { IPC } from '@shared/ipc';
import { WHISPER_MODELS, type VoiceStatus } from '@shared/voice';
import { existsSync } from 'node:fs';
import type { MainContext } from '../context';
import { FishTts } from '../services/fish-tts';
import { SecretStore } from '../services/secret-store';
import { WhisperService, transformersLoader } from '../services/whisper';
import { emit, handle, on } from './handle';

export function registerVoiceIpc(ctx: MainContext): void {
  const key = new SecretStore(join(app.getPath('userData'), 'fish-key.bin'), safeStorage);
  const fish = new FishTts({
    fetch: (url, init) => net.fetch(url, init),
    getKey: () => key.get(),
    config: () => {
      const s = ctx.settings.get();
      return { voiceId: s.fishVoiceId, model: s.fishModel };
    },
  });
  const status = (): VoiceStatus => ({ fishKey: key.has(), stt: whisper.getStatus() });
  const push = (): void => emit(ctx.getWindow(), IPC.voice.onStatus, status());
  const modelsDir = join(app.getPath('userData'), 'models');
  const whisper = new WhisperService({
    load: transformersLoader(modelsDir),
    model: () => ctx.settings.get().whisperModel,
    onStatus: push,
  });
  ctx.settings.subscribe((next, prev) => {
    if (next.whisperModel !== prev.whisperModel) push();
  });

  // Already downloaded? Load it in the background so the first mic click is quick.
  setTimeout(() => {
    const s = ctx.settings.get();
    if (s.voiceInput && existsSync(join(modelsDir, WHISPER_MODELS[s.whisperModel].id, 'onnx')))
      void whisper.prepare().catch(() => undefined);
  }, 8000).unref();

  handle(IPC.voice.status, () => status());

  handle(IPC.voice.setFishKey, async (raw) => {
    const k = typeof raw === 'string' ? raw.trim() : '';
    if (!/^\S{16,200}$/.test(k))
      return { ok: false, message: "That doesn't look like a Fish Audio API key." };
    try {
      // Prove the key and voice work (a one-word clip) before saving anything.
      await fish.speak('Hello.', k);
      await key.set(k);
      ctx.updateSettings({ voiceEngine: 'fish', speakReplies: true });
      push();
      return { ok: true, message: 'Key saved. ARC will now speak with your Fish Audio voice.' };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'The key could not be checked.',
      };
    }
  });

  handle(IPC.voice.clearFishKey, () => {
    key.clear();
    ctx.updateSettings({ voiceEngine: 'system' });
    push();
    return status();
  });

  handle(IPC.voice.speak, (text) => fish.speak(String(text).slice(0, 1000)));

  handle(IPC.voice.transcribe, (samples) => {
    if (!(samples instanceof Float32Array)) throw new Error('Expected audio samples.');
    return whisper.transcribe(samples);
  });

  on(IPC.voice.prepare, () => void whisper.prepare().catch(() => undefined), ctx.getWindow);
}
