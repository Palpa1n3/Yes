/** Pure validation for stored settings: unknown keys dropped, wrong types replaced by
 *  defaults, so a hand-edited or corrupted settings.json can't break the app. */
import { sanitizePersonality } from './personalities';
import { sanitizePrompts } from './prompts';
import type { WeatherPlace } from './weather';
import { FISH_MODELS, type FishModel } from './voice';
import {
  AI_MODELS,
  DEFAULT_SETTINGS,
  PERMISSION_KEYS,
  type AiModel,
  type Permission,
  type ReduceMotion,
  type Settings,
  type ThemeId,
} from './types';

const THEMES: ThemeId[] = ['arc-cyan', 'solar-gold', 'crimson', 'sentinel', 'violet', 'mono'];
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

/** A short list of app/process names (letters, digits, spaces, . _ -). */
function names(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [
    ...new Set(
      v
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.trim())
        .filter((x) => /^[\w .-]{1,60}$/.test(x)),
    ),
  ].slice(0, 20);
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
  const hour = (k: keyof Settings): number => {
    const v = r[k];
    return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 23 ? v : (d[k] as number);
  };
  const name = str('assistantName', 24).trim();
  const profiles = (v: unknown): Settings['gamingProfiles'] => {
    if (!v || typeof v !== 'object') return {};
    const out: Settings['gamingProfiles'] = {};
    for (const [k, p] of Object.entries(v as Record<string, unknown>).slice(0, 30)) {
      if (!p || typeof p !== 'object') continue;
      const o = p as Record<string, unknown>;
      out[k.slice(0, 60)] = {
        closeApps: names(o['closeApps']),
        highPerformance: o['highPerformance'] === true,
        ...(typeof o['note'] === 'string' && o['note'].trim()
          ? { note: o['note'].slice(0, 200) }
          : {}),
      };
    }
    return out;
  };
  const step = (k: string): number => {
    const n = Number(r[k]);
    return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 3;
  };
  const perms = (v: unknown, def: Settings['permissions']): Settings['permissions'] => {
    const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
    const out = { ...def };
    for (const k of PERMISSION_KEYS)
      if (o[k] === 'allow' || o[k] === 'ask' || o[k] === 'block') out[k] = o[k] as Permission;
    return out;
  };
  return {
    assistantName: name || d.assistantName,
    userName: str('userName', 40).trim(),
    closeToTray: bool('closeToTray'),
    launchAtLogin: bool('launchAtLogin'),
    persistHistory: bool('persistHistory'),
    weatherPlace: validPlace(r['weatherPlace']),
    tempUnit: r['tempUnit'] === 'f' ? 'f' : r['tempUnit'] === 'c' ? 'c' : d.tempUnit,
    windUnit: r['windUnit'] === 'mph' ? 'mph' : r['windUnit'] === 'kmh' ? 'kmh' : d.windUnit,
    calendarReminder: [0, 5, 10, 15, 30].includes(r['calendarReminder'] as number)
      ? (r['calendarReminder'] as number)
      : d.calendarReminder,
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
    whisperModel:
      r['whisperModel'] === 'small' || r['whisperModel'] === 'medium' ? r['whisperModel'] : 'base',
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
    voiceHotkey: str('voiceHotkey', 60).trim(),
    openMicHotkey: str('openMicHotkey', 60).trim(),
    clipboardHotkey:
      typeof r['clipboardHotkey'] === 'string'
        ? r['clipboardHotkey'].trim().slice(0, 60)
        : d.clipboardHotkey,
    prompts: sanitizePrompts(r['prompts']),
    openMicMinutes: [2, 5, 10, 30].includes(r['openMicMinutes'] as number)
      ? (r['openMicMinutes'] as number)
      : d.openMicMinutes,
    screenAware: bool('screenAware'),
    phoneControl: bool('phoneControl'),
    clipboardHistory: bool('clipboardHistory'),
    healthAlerts: bool('healthAlerts'),
    gamingMode: bool('gamingMode'),
    gamingPowerPlan: bool('gamingPowerPlan'),
    gamingQuiet: bool('gamingQuiet'),
    gamingCloseApps: names(r['gamingCloseApps']),
    gamingGames: names(r['gamingGames']),
    provider: r['provider'] === 'anthropic' ? 'anthropic' : 'mock',
    model: (AI_MODELS as readonly string[]).includes(r['model'] as string)
      ? (r['model'] as AiModel)
      : d.model,
    researchModel: (AI_MODELS as readonly string[]).includes(r['researchModel'] as string)
      ? (r['researchModel'] as AiModel)
      : d.researchModel,
    agentMode: bool('agentMode'),
    agentModel: (AI_MODELS as readonly string[]).includes(r['agentModel'] as string)
      ? (r['agentModel'] as AiModel)
      : d.agentModel,
    autoMemory: bool('autoMemory'),
    initiative: bool('initiative'),
    quietStart: hour('quietStart'),
    quietEnd: hour('quietEnd'),
    avatar: (
      ['face', 'rings', 'code', 'sphere', 'cloud', 'wave', 'swarm', 'orb', 'head'] as const
    ).includes(r['avatar'] as 'face')
      ? (r['avatar'] as Settings['avatar'])
      : d.avatar,
    sourceDir: str('sourceDir', 400).trim(),
    projectDir: str('projectDir', 400).trim(),
    whisper: bool('whisper'),
    phoneAccess: bool('phoneAccess'),
    onboarded: typeof r['onboarded'] === 'boolean' ? r['onboarded'] : true,
    monthlyBudget:
      typeof r['monthlyBudget'] === 'number' &&
      r['monthlyBudget'] >= 0 &&
      r['monthlyBudget'] <= 10_000
        ? Math.round(r['monthlyBudget'])
        : d.monthlyBudget,
    phoneAppUrl: /^https:\/\/[\w.-]+(\/[\w./~-]*)?$/.test(String(r['phoneAppUrl'] ?? ''))
      ? String(r['phoneAppUrl'])
      : d.phoneAppUrl,
    wakeWords: names(r['wakeWords']).slice(0, 5),
    gamingVoice: bool('gamingVoice'),
    saveBackups: bool('saveBackups'),
    gamingProfiles: profiles(r['gamingProfiles']),
    permissions: perms(r['permissions'], d.permissions),
    hiddenPanels: names(r['hiddenPanels']).slice(0, 20),
    localModel: /^[\w.:/-]{0,80}$/.test(String(r['localModel'] ?? ''))
      ? String(r['localModel'] ?? '')
      : '',
    followUp: bool('followUp'),
    saver: bool('saver'),
    musicReactive: bool('musicReactive'),
    agentPip: bool('agentPip'),
    desktopWidget: bool('desktopWidget'),
    holoNotifications: bool('holoNotifications'),
    avatarColor: /^#[0-9a-f]{6}$/i.test(String(r['avatarColor'] ?? ''))
      ? String(r['avatarColor'])
      : '',
    avatarSize: step('avatarSize'),
    avatarGlow: step('avatarGlow'),
    avatarMotion: step('avatarMotion'),
    accent: str('accent', 40).trim(),
    voiceWords: names(r['voiceWords']).slice(0, 60),
    voiceFixes: (Array.isArray(r['voiceFixes']) ? r['voiceFixes'] : [])
      .filter(
        (f): f is { heard: string; meant: string } =>
          !!f &&
          typeof (f as { heard?: unknown }).heard === 'string' &&
          typeof (f as { meant?: unknown }).meant === 'string',
      )
      .map((f) => ({ heard: f.heard.slice(0, 80), meant: f.meant.slice(0, 80) }))
      .filter((f) => f.heard.trim() && f.meant.trim())
      .slice(0, 100),
    leaveReminders: bool('leaveReminders'),
    ambient: bool('ambient'),
    timeTint: bool('timeTint'),
    screensaverMinutes: [0, 5, 10, 20, 30, 60].includes(r['screensaverMinutes'] as number)
      ? (r['screensaverMinutes'] as number)
      : d.screensaverMinutes,
    homeAddress: str('homeAddress', 200).trim(),
  };
}
