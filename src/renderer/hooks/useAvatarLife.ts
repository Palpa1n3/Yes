import { useEffect } from 'react';
import { AVATAR_STEPS } from '@shared/types';
import { setAvatarMotion, setMood, soundsConfused } from '@renderer/components/core/avatarKit';
import { startMusicLevel, stopMusicLevel } from '@renderer/voice/musicLevel';
import { useAgentStore } from '@renderer/stores/agentStore';
import { useConversationStore } from '@renderer/stores/conversationStore';
import { useMediaStore } from '@renderer/stores/mediaStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';

/** Keeps the avatars alive: movement setting, music pulsing (only while music plays), and
 *  moods: pleased when an action or Agent Mode task works, confused when it didn't follow. */
export function useAvatarLife(): void {
  const motion = useSettingsStore((s) => s.settings.avatarMotion);
  const music = useSettingsStore((s) => s.settings.musicReactive);
  const playing = useMediaStore((s) => s.now?.playing === true);

  useEffect(() => setAvatarMotion(AVATAR_STEPS.motion[motion - 1] ?? 1), [motion]);

  useEffect(() => {
    if (music && playing) void startMusicLevel();
    else stopMusicLevel();
  }, [music, playing]);
  useEffect(() => () => stopMusicLevel(), []);

  useEffect(() => {
    const seen = new Set<string>();
    const unsubChat = useConversationStore.subscribe((s) => {
      const last = s.messages[s.messages.length - 1];
      if (!last) return;
      if (last.role === 'command' && last.command.status === 'success') {
        const k = `c:${last.id}`;
        if (!seen.has(k)) {
          seen.add(k);
          setMood('pleased');
        }
      }
      if (last.role === 'assistant' && soundsConfused(last.text)) {
        const k = `a:${last.id}`;
        if (!seen.has(k)) {
          seen.add(k);
          setMood('confused');
        }
      }
    });
    const unsubAgent = useAgentStore.subscribe((s, prev) => {
      if (s.state === 'done' && prev.state !== 'done') setMood('pleased');
    });
    return () => {
      unsubChat();
      unsubAgent();
    };
  }, []);
}
