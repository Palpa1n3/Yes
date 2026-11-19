import { Mic } from 'lucide-react';
import { useVoiceStore } from '@renderer/stores/voiceStore';
import { setOpenMic } from '@renderer/voice/useWakeWord';

/** "MIC ON" in the top bar while open mic is listening; click to switch it off. */
export function OpenMicChip() {
  const on = useVoiceStore((v) => v.openMic);
  if (!on) return null;
  return (
    <button
      type="button"
      onClick={() => setOpenMic(false)}
      title="Open mic: everything you say goes to the assistant. Click (or press the shortcut) to switch off."
      aria-label="Open mic on. Switch off"
      className="no-drag flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap border border-ok bg-ok/10 px-2 font-mono text-[11px] uppercase tracking-[0.12em] text-ok"
    >
      <Mic size={13} strokeWidth={1.5} className="animate-pulse" /> Mic on
    </button>
  );
}
