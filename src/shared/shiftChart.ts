/** Shift charts as SVG markup (shared by the PC and the phone app): a week timeline with each
 *  shift as a bar, and hours (and pay) per week. One series, so one colour (the theme accent);
 *  every bar has a hover tooltip; text uses text colours, never the bar colour. */
import { describeShift, paidHours, shiftHours, type Shift } from './shifts';

export interface ChartColors {
  bar: string;
  text: string;
  muted: string;
  grid: string;
  /** Today's row highlight. */
  today: string;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const p2 = (n: number): string => String(n).padStart(2, '0');
const ymd = (d: Date): string => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Monday 00:00 of the week containing `d`, plus `weeks` weeks. */
export function mondayOf(d: Date, weeks = 0): Date {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  m.setDate(m.getDate() + weeks * 7);
  return m;
}

/** Bars for one week: [dayIndex, startMinute, endMinute, shift]; overnight shifts split. */
export function weekBars(shifts: Shift[], monday: Date): Array<[number, number, number, Shift]> {
  const out: Array<[number, number, number, Shift]> = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const key = ymd(day);
    for (const s of shifts) {
      const sd = s.start.slice(0, 10);
      const ed = s.end.slice(0, 10);
      const sm = Number(s.start.slice(11, 13)) * 60 + Number(s.start.slice(14, 16));
      const em = Number(s.end.slice(11, 13)) * 60 + Number(s.end.slice(14, 16));
      if (sd === key) out.push([i, sm, ed === sd ? em : 1440, s]);
      else if (ed === key && sd < key && em > 0) out.push([i, 0, em, s]);
    }
  }
  return out;
}

/** The week timeline: Mon–Sun rows, 00–24h across. */
export function weekSvg(shifts: Shift[], monday: Date, c: ChartColors, today = new Date()): string {
  const W = 560;
  const L = 40;
  const T = 20;
  const ROW = 26;
  const H = T + ROW * 7 + 4;
  const x = (min: number): number => L + ((W - L - 8) * min) / 1440;
  const parts: string[] = [
    `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Shifts this week" xmlns="http://www.w3.org/2000/svg" style="font-family:inherit">`,
  ];
  for (const h of [0, 6, 12, 18, 24]) {
    parts.push(
      `<line x1="${x(h * 60)}" y1="${T - 4}" x2="${x(h * 60)}" y2="${H - 4}" style="stroke:${c.grid}" stroke-width="1"/>`,
      `<text x="${x(h * 60)}" y="${T - 8}" style="fill:${c.muted}" font-size="10" text-anchor="${h === 0 ? 'start' : h === 24 ? 'end' : 'middle'}">${p2(h)}:00</text>`,
    );
  }
  const todayKey = ymd(today);
  DAYS.forEach((d, i) => {
    const day = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const y = T + i * ROW;
    if (ymd(day) === todayKey)
      parts.push(`<rect x="0" y="${y}" width="${W}" height="${ROW}" style="fill:${c.today}"/>`);
    parts.push(
      `<text x="4" y="${y + ROW / 2 + 4}" fill="${ymd(day) === todayKey ? c.text : c.muted}" font-size="11">${d} ${day.getDate()}</text>`,
    );
  });
  for (const [i, a, b, s] of weekBars(shifts, monday)) {
    const y = T + i * ROW + 5;
    const w = Math.max(4, x(b) - x(a) - 2);
    parts.push(
      `<g><title>${esc(`${describeShift(s)} ${s.title}`)}</title><rect x="${x(a) + 1}" y="${y}" width="${w}" height="${ROW - 10}" rx="4" style="fill:${c.bar}"/>` +
        (w > 70
          ? `<text x="${x(a) + 7}" y="${y + ROW / 2 - 1}" fill="#04131c" font-size="10.5" font-weight="600">${esc(`${s.start.slice(11, 16)}–${s.end.slice(11, 16)}`)}</text>`
          : '') +
        `</g>`,
    );
  }
  parts.push('</svg>');
  return parts.join('');
}

/** Hours (and pay) for the last week, this week and the next two. */
export function weeksSummary(
  shifts: Shift[],
  today = new Date(),
  rate = 0,
  unpaidBreak = 0,
  breakOver = 6,
): Array<{ label: string; hours: number; pay: number }> {
  const labels = ['Last week', 'This week', 'Next week', 'Week after'];
  return labels.map((label, k) => {
    const mon = mondayOf(today, k - 1);
    const next = mondayOf(today, k);
    const inWeek = shifts.filter((s) => {
      const d = new Date(s.start);
      return d >= mon && d < next;
    });
    const hours = Math.round(inWeek.reduce((n, s) => n + shiftHours(s), 0) * 10) / 10;
    const pay =
      rate > 0
        ? Math.round(inWeek.reduce((n, s) => n + paidHours(s, unpaidBreak, breakOver) * rate, 0))
        : 0;
    return { label, hours, pay };
  });
}

/** Bar chart of hours per week (values labelled above each bar; pay underneath if known). */
export function hoursSvg(
  rows: Array<{ label: string; hours: number; pay: number }>,
  c: ChartColors,
  money: (n: number) => string = (n) => `£${n}`,
): string {
  const W = 560;
  const H = 150;
  const base = 112;
  const max = Math.max(10, ...rows.map((r) => r.hours));
  const bw = 64;
  const gap = (W - bw * rows.length) / (rows.length + 1);
  const parts = [
    `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Hours per week" xmlns="http://www.w3.org/2000/svg" style="font-family:inherit">`,
    `<line x1="0" y1="${base}" x2="${W}" y2="${base}" style="stroke:${c.grid}"/>`,
  ];
  rows.forEach((r, i) => {
    const x = gap + i * (bw + gap);
    const h = (r.hours / max) * 84;
    parts.push(
      `<g><title>${esc(`${r.label}: ${r.hours} hours${r.pay ? `, about ${money(r.pay)}` : ''}`)}</title>`,
      h > 0
        ? `<path d="M${x},${base} v${-h + 4} q0,-4 4,-4 h${bw - 8} q4,0 4,4 v${h - 4} z" style="fill:${c.bar}" opacity="${r.label === 'This week' ? 1 : 0.55}"/>`
        : '',
      `<text x="${x + bw / 2}" y="${base - h - 6}" style="fill:${c.text}" font-size="12" text-anchor="middle">${r.hours}h</text>`,
      `<text x="${x + bw / 2}" y="${base + 15}" style="fill:${c.muted}" font-size="10.5" text-anchor="middle">${esc(r.label)}</text>`,
      r.pay
        ? `<text x="${x + bw / 2}" y="${base + 30}" style="fill:${c.text}" font-size="11" text-anchor="middle">${esc(money(r.pay))}</text>`
        : '',
      `</g>`,
    );
  });
  parts.push('</svg>');
  return parts.join('');
}
