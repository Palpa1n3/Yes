/** Open shifts and trades (e.g. the shift app's "Shift Trade" tab): does one fit around the
 *  saved rota? Checks for clashes, the 11 hours' rest between shifts, a long week, and says
 *  what it would pay and on which payday. Pure, for the phone's check_shift_fit tool. */
import {
  cleanShifts,
  paidHours,
  payPeriod,
  paydays,
  weekHours,
  type PayCycle,
  type Shift,
} from './shifts';

export interface FitOptions {
  rate: number;
  unpaidBreak: number;
  breakOver: number;
  minRest: number;
  /** Hours in a week before it counts as a long week (UK: 48). */
  maxWeek: number;
  payNext: string;
  payCycle: PayCycle;
  payLag: number;
}

export interface Fit {
  shift: Shift;
  verdict: 'clash' | 'short_rest' | 'long_week' | 'ok';
  note: string;
  hours: number;
  pay: number;
  payday: string;
}

const t = (s: string): number => new Date(s).getTime();
const hm = (s: string): string => s.slice(11, 16);
const day = (s: string): string =>
  new Date(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

/** Which payday pays for a shift starting on `date` ("2026-11-24"). */
export function paydayFor(date: string, known: string, cycle: PayCycle, lag: number): string {
  if (!known) return '';
  const d = new Date(`${date}T12:00`);
  const from = new Date(d.getTime() - 3 * 86_400_000);
  const to = new Date(d.getTime() + 70 * 86_400_000);
  return (
    paydays(known, cycle, from, to).find((p) => {
      const per = payPeriod(p, cycle, lag);
      return !!per && date >= per.start && date < per.end;
    }) ?? ''
  );
}

export function fitShift(c: Shift, saved: Shift[], o: FitOptions): Fit {
  const a = t(c.start);
  const b = t(c.end);
  const hours = Math.round(paidHours(c, o.unpaidBreak, o.breakOver) * 100) / 100;
  const pay = o.rate > 0 ? Math.round(hours * o.rate * 100) / 100 : 0;
  const payday = paydayFor(c.start.slice(0, 10), o.payNext, o.payCycle, o.payLag);
  const base = { shift: c, hours, pay, payday };
  const others = saved.filter((s) => !(s.start === c.start && s.end === c.end));
  const clash = others.find((s) => t(s.start) < b && t(s.end) > a);
  if (clash)
    return {
      ...base,
      verdict: 'clash',
      note: `Clashes with your ${hm(clash.start)}–${hm(clash.end)} shift on ${day(clash.start)}.`,
    };
  let worst: { hours: number; s: Shift; before: boolean } | null = null;
  for (const s of others) {
    const gapAfter = (a - t(s.end)) / 3_600_000; // s ends, then c starts
    const gapBefore = (t(s.start) - b) / 3_600_000; // c ends, then s starts
    for (const [g, before] of [
      [gapAfter, false],
      [gapBefore, true],
    ] as const)
      if (g >= 0 && g < o.minRest && (!worst || g < worst.hours)) worst = { hours: g, s, before };
  }
  if (worst)
    return {
      ...base,
      verdict: 'short_rest',
      note: `Only ${Math.round(worst.hours * 10) / 10} h ${worst.before ? 'before' : 'after'} your ${hm(worst.s.start)}–${hm(worst.s.end)} shift on ${day(worst.s.start)}.`,
    };
  const week = weekHours([...others, c], new Date(c.start));
  if (week > o.maxWeek)
    return {
      ...base,
      verdict: 'long_week',
      note: `That week would be ${Math.round(week * 10) / 10} h.`,
    };
  return {
    ...base,
    verdict: 'ok',
    note: `Fits: that week would be ${Math.round(week * 10) / 10} h.`,
  };
}

/** Check each candidate (as Claude read them) against the rota; one line each for Claude. */
export function fitReport(raw: unknown, saved: Shift[], o: FitOptions): string {
  const list = cleanShifts(raw, 'Open shift');
  if (!list.length) return 'No shifts to check (need start and end times).';
  const money = (n: number): string => `£${n.toFixed(2)}`;
  return list
    .map((c) => fitShift(c, saved, o))
    .map(
      (f) =>
        `${day(f.shift.start)} ${hm(f.shift.start)}–${hm(f.shift.end)} ${f.shift.title}: ${f.verdict.toUpperCase()}. ${f.note}${f.pay ? ` Pays about ${money(f.pay)} (${f.hours} h)` : ` ${f.hours} h`}${f.payday ? `, on the ${f.payday} payday` : ''}.`,
    )
    .join('\n');
}
