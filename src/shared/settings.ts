/** Pure validation for stored settings: unknown keys dropped, wrong types replaced by
 *  defaults, so a hand-edited or corrupted settings.json can't break the app. */
import { sanitizePersonality } from './personalities';
import type { WeatherPlace } from './weather';
import { FISH_MODELS, type FishModel } from './voice';
import {
  AI_MODELS,
  DEFAULT_SETTINGS,
  type AiModel,
  type ReduceMotion,
  type Settings,
  type ThemeId,
} from './types';

const THEMES: ThemeId[] = ['arc-cyan', 'solar-gold', 'crimson', 'mono'];
const MOTION: ReduceMotion[] = ['system', 'on', 'off'];

function validPlace(v: unknown): WeatherPlace | null {
  if (!v || typeof v !== 'object') return null;
  const p = v as Record<string, unknown>;
  const lat = p['lat'];
  const lon = p['lon'];
  if (typeof p['name'] !== 'string' || typeof lat !== 'number' || typeof lon !== 'number')
    return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const str = (k: string): string | undefined =>
    typeof p[k] === 'string' ? (p[k] as string).slice(0, 80) : undefined;
  return {
    name: (p['name'] as string).slice(0, 80),
    region: str('region'),
    country: str('country'),
    lat,
    lon,
  };
}

export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const str = (k: keyof Settings, max = 80): string => {
    const v = r[k];
    return typeof v === 'string' ? v.slice(0, max) : (d[k] as string);
  };
  const bool = (k: keyof Settings): boolean =>
    typeof r[k] === 'boolean' ? (r[k] as boolean) : (d[k] as boolean);
  const name = str('assistantName', 24).trim();
  return {
    assistantName: name || d.assistantName,
    userName: str('userName', 40).trim(),
    closeToTray: bool('closeToTray'),
    launchAtLogin: bool('launchAtLogin'),
    persistHistory: bool('persistHistory'),
    weatherPlace: validPlace(r['weatherPlace']),
    tempUnit: r['tempUnit'] === 'f' ? 'f' : r['tempUnit'] === 'c' ? 'c' : d.tempUnit,
    windUnit: r['windUnit'] === 'mph' ? 'mph' : r['windUnit'] === 'kmh' ? 'kmh' : d.windUnit,
    personality: {
      ...sanitizePersonality(r['personality']),
      assistantName: name || d.assistantName,
    },
    theme: THEMES.includes(r['theme'] as ThemeId) ? (r['theme'] as ThemeId) : d.theme,
    scanlines: bool('scanlines'),
    particles: bool('particles'),
    reduceMotion: MOTION.includes(r['reduceMotion'] as ReduceMotion)
      ? (r['reduceMotion'] as ReduceMotion)
      : d.reduceMotion,
    alwaysOnTop: bool('alwaysOnTop'),
    bootSequence: bool('bootSequence'),
    voiceMuted: bool('voiceMuted'),
    speakReplies: bool('speakReplies'),
    voiceName: str('voiceName', 200),
    voiceEngine: r['voiceEngine'] === 'fish' ? 'fish' : 'system',
    fishVoiceId: /^[A-Za-z0-9_-]{6,64}$/.test(String(r['fishVoiceId'] ?? ''))
      ? String(r['fishVoiceId'])
      : d.fishVoiceId,
    fishModel: (FISH_MODELS as readonly string[]).includes(r['fishModel'] as string)
      ? (r['fishModel'] as FishModel)
      : d.fishModel,
    voiceInput: bool('voiceInput'),
    whisperModel: r['whisperModel'] === 'small' ? 'small' : 'base',
    sfx: bool('sfx'),
    sfxVolume:
      typeof r['sfxVolume'] === 'number' && r['sfxVolume'] >= 0 && r['sfxVolume'] <= 1
        ? r['sfxVolume']
        : d.sfxVolume,
    wakeWord: bool('wakeWord'),
    alarmSound: bool('alarmSound'),
    alarmVolume:
      typeof r['alarmVolume'] === 'number' && r['alarmVolume'] >= 0 && r['alarmVolume'] <= 1
        ? r['alarmVolume']
        : d.alarmVolume,
    globalHotkey: str('globalHotkey', 60).trim() || d.globalHotkey,
    provider: r['provider'] === 'anthropic' ? 'anthropic' : 'mock',
    model: (AI_MODELS as readonly string[]).includes(r['model'] as string)
      ? (r['model'] as AiModel)
      : d.model,
  };
}
