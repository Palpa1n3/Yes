/** Phone health check: the readings from the Android app, turned into plain words and the
 *  things worth fixing (with how). Pure, so it's tested. */

export interface PhoneHealth {
  device?: string;
  android?: string;
  uptimeHours?: number;
  battery?: { percent: number; tempC: number; charging: boolean; health: string; cycles?: number };
  memory?: { totalGb: number; freeGb: number; low: boolean };
  storage?: { totalGb: number; freeGb: number };
  powerSaving?: boolean;
  thermal?: string;
  network?: { type: string; internet?: boolean; downMbps?: number };
  animationScale?: number;
  keyboard?: { name: string; version: string; updated: number; cacheMb?: number; dataMb?: number };
  screenTimeToday?: string;
  topApps?: string;
}

export interface HealthReport {
  /** One line per reading. */
  lines: string[];
  /** Problems, worst first, each with a fix. */
  issues: Array<{ what: string; fix: string }>;
}

const r1 = (n: number): string => (Math.round(n * 10) / 10).toString();

export function healthReport(h: PhoneHealth, now = Date.now()): HealthReport {
  const lines: string[] = [];
  const issues: HealthReport['issues'] = [];
  if (h.device) lines.push(`Phone: ${h.device}, Android ${h.android ?? '?'}`);
  if (h.uptimeHours !== undefined) {
    const d = h.uptimeHours / 24;
    lines.push(
      `Since last restart: ${d >= 1 ? `${r1(d)} days` : `${Math.round(h.uptimeHours)} hours`}`,
    );
    if (d >= 4)
      issues.push({
        what: `Not restarted for ${Math.round(d)} days`,
        fix: 'Restart the phone (hold the side key and volume down › Restart). It clears memory and often fixes a slow keyboard. Settings › Device care › Auto optimisation can do it weekly.',
      });
  }
  if (h.memory) {
    const pct = (h.memory.freeGb / Math.max(0.1, h.memory.totalGb)) * 100;
    lines.push(`Memory: ${r1(h.memory.freeGb)} of ${r1(h.memory.totalGb)} GB free`);
    if (h.memory.low || pct < 12)
      issues.push({
        what: 'Memory is nearly full, so Android closes apps (the keyboard too) and has to reload them',
        fix: 'Close apps you’re not using (Recents › Close all), restart the phone, and turn off RAM Plus if it’s on (Settings › Device care › Memory).',
      });
  }
  if (h.storage) {
    const pct = (h.storage.freeGb / Math.max(0.1, h.storage.totalGb)) * 100;
    lines.push(`Storage: ${r1(h.storage.freeGb)} of ${Math.round(h.storage.totalGb)} GB free`);
    if (pct < 10 || h.storage.freeGb < 5)
      issues.push({
        what: `Storage is nearly full (${Math.round(pct)}% free)`,
        fix: 'Free some space: Settings › Device care › Storage, delete big videos you’ve backed up, and clear app caches. Phones slow right down when storage is almost full.',
      });
  }
  if (h.battery) {
    const b = h.battery;
    lines.push(
      `Battery: ${b.percent}%${b.charging ? ' (charging)' : ''}, ${r1(b.tempC)}°C, health ${b.health}${b.cycles !== undefined ? `, ${b.cycles} charge cycles` : ''}`,
    );
    if (b.tempC >= 40)
      issues.push({
        what: `The battery is hot (${r1(b.tempC)}°C), so the phone slows itself down`,
        fix: 'Let it cool: take it off charge, out of a case or the sun, and close games or the camera for a few minutes.',
      });
    if (b.health !== 'good' && b.health !== 'unknown')
      issues.push({
        what: `Battery health: ${b.health}`,
        fix: 'Check Settings › Battery › Battery information; a worn battery can slow the phone and may need replacing.',
      });
  }
  if (h.thermal && h.thermal !== 'normal') {
    lines.push(`Temperature: ${h.thermal}`);
    if (!/^warm/.test(h.thermal))
      issues.push({
        what: `The phone is ${h.thermal}`,
        fix: 'Let it cool down before judging its speed.',
      });
  }
  if (h.powerSaving) {
    lines.push('Power saving: on');
    issues.push({
      what: 'Power saving is on, which slows the processor',
      fix: 'Turn it off when you don’t need it (swipe down › Power saving).',
    });
  }
  if (h.animationScale !== undefined && h.animationScale > 1)
    issues.push({
      what: `Animations are set to ${h.animationScale}× (slower than normal)`,
      fix: 'Settings › Developer options › Animator duration scale › 1× (or 0.5× to feel snappier).',
    });
  if (h.keyboard) {
    const k = h.keyboard;
    const days = k.updated ? Math.round((now - k.updated) / 86_400_000) : -1;
    lines.push(
      `Keyboard: ${k.name} ${k.version}${days >= 0 ? `, updated ${days} days ago` : ''}${k.cacheMb !== undefined ? `, cache ${Math.round(k.cacheMb)} MB, data ${Math.round(k.dataMb ?? 0)} MB` : ''}`,
    );
    if ((k.cacheMb ?? 0) > 150 || (k.dataMb ?? 0) > 400)
      issues.push({
        what: `${k.name} has built up a lot of stored data (${Math.round((k.cacheMb ?? 0) + (k.dataMb ?? 0))} MB)`,
        fix: `Settings › Apps › ${k.name} › Storage › Clear cache. If it's still slow: ${k.name} settings › Reset to default settings (keeps your phone's data; you may lose learned words).`,
      });
    if (days > 120)
      issues.push({
        what: `${k.name} hasn't been updated for ${days} days`,
        fix: 'Update it in the Galaxy Store / Play Store (search its name).',
      });
  }
  if (h.network)
    lines.push(
      `Network: ${h.network.type}${h.network.internet === false ? ' (no internet)' : ''}${h.network.downMbps ? `, about ${Math.round(h.network.downMbps)} Mbps` : ''}`,
    );
  if (h.screenTimeToday)
    lines.push(`Screen time today: ${h.screenTimeToday}${h.topApps ? ` (${h.topApps})` : ''}`);
  return { lines, issues };
}
