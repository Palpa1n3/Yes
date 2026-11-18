import { resolveTitle, type Personality } from '@shared/personalities';
import { useSettingsStore } from '@renderer/stores/settingsStore';

/** The active personality plus how it addresses you ("sir", your first name, or nothing). */
export function usePersona(): { personality: Personality; title: string; assistantName: string } {
  const { personality, userName, assistantName } = useSettingsStore((s) => s.settings);
  return { personality, title: resolveTitle(personality.userTitle, userName), assistantName };
}
