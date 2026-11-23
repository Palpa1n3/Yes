/** The phone's latest status (battery, unread messages, next payday), from its sync. Kept in
 *  memory only; shown on the desktop widget and in the tray tooltip. */
import type { PhoneStatus } from '@shared/desk';

let latest: PhoneStatus | null = null;

export function setPhoneStatus(raw: unknown): void {
  if (!raw || typeof raw !== 'object') return;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  const pd =
    o.payday && typeof o.payday === 'object' ? (o.payday as Record<string, unknown>) : null;
  latest = {
    battery:
      num(o.battery) === null ? null : Math.max(0, Math.min(100, Math.round(num(o.battery) ?? 0))),
    charging: o.charging === true,
    autoSend: o.autoSend === true,
    unread: Math.max(0, Math.min(999, Math.round(num(o.unread) ?? 0))),
    payday:
      pd && typeof pd.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(pd.date)
        ? { date: pd.date, net: Math.max(0, num(pd.net) ?? 0) }
        : null,
    at: Date.now(),
  };
}

/** The status, if the phone synced in the last 20 minutes. */
export function phoneStatus(): PhoneStatus | null {
  return latest && Date.now() - latest.at < 20 * 60_000 ? latest : null;
}

/** The last payday the phone told us about (kept even when the phone is away). */
export function lastPayday(): PhoneStatus['payday'] {
  return latest?.payday ?? null;
}
