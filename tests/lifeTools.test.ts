import { describe, expect, it } from 'vitest';
import { nextSleep, planFor, shortGaps, sleepLine, type SleepOptions } from '@shared/sleep';
import { planHeadsUps } from '@shared/headsups';
import { parsePayment, paymentsFrom, spendSummary } from '@shared/spending';
import {
  commandFor,
  matchByName,
  needsConfirm,
  parseDevices,
  smartHome,
  type StFetch,
} from '@shared/smartthings';
import { fitReport, fitShift, paydayFor, type FitOptions } from '@shared/shiftFit';
import { featuresText, findFeatures } from '@shared/features';

const so: SleepOptions = { hours: 8, windDown: 45, alarmRules: [], alarmLead: 75, travel: 25 };
const early = { title: 'Tesco', start: '2026-11-23T07:00', end: '2026-11-23T15:00' };

describe('sleep planner', () => {
  it('works back from the alarm to bed and wind-down', () => {
    const p = planFor(early, so, new Date(2026, 10, 22, 12));
    expect(p?.kind).toBe('bed');
    expect(p?.wake.getHours()).toBe(5);
    expect(p?.wake.getMinutes()).toBe(45);
    expect(p?.bed.getHours()).toBe(21);
    expect(p?.bed.getMinutes()).toBe(45);
    expect(p?.windDownAt.getHours()).toBe(21);
    expect(p?.windDownAt.getMinutes()).toBe(0);
    expect(sleepLine(p!, new Date(2026, 10, 22, 12))).toBe(
      'Alarm 05:45 tomorrow: in bed by 21:45, wind down from 21:00.',
    );
  });
  it('says "go to bed now" once bedtime has passed', () => {
    const now = new Date(2026, 10, 22, 23, 45);
    const p = nextSleep([early], so, now);
    expect(sleepLine(p!, now)).toBe('Alarm 05:45: go to bed now for about 6 h of sleep.');
  });
  it('uses an alarm rule and suggests a nap before nights', () => {
    const p = planFor(early, { ...so, alarmRules: [{ start: '07:00', alarm: '05:00' }] });
    expect(p?.bed.getHours()).toBe(21);
    const night = { title: 'Nights', start: '2026-11-23T22:00', end: '2026-11-24T06:00' };
    const n = planFor(night, so);
    expect(n?.kind).toBe('nap');
    expect(sleepLine(n!, new Date(2026, 10, 23, 9))).toBe('Night shift at 22:00: nap 19:05–20:35.');
  });
  it('finds less than 11 hours between shifts', () => {
    const late = { title: 'Tesco', start: '2026-11-22T14:00', end: '2026-11-22T22:00' };
    const g = shortGaps([early, late], 11, new Date(2026, 10, 22, 8));
    expect(g).toHaveLength(1);
    expect(g[0]?.hours).toBe(9);
  });
  it('adds wind-down and short-gap notifications', () => {
    const late = { title: 'Tesco', start: '2026-11-22T14:00', end: '2026-11-22T22:00' };
    const ups = planHeadsUps(
      [late, early],
      {
        shiftEve: false,
        eveHour: 20,
        leave: false,
        travel: 25,
        morning: false,
        morningHour: 7,
        alarmRules: [],
        alarmLead: 75,
        sleep: { hours: 8, windDown: 45 },
      },
      new Date(2026, 10, 22, 8),
    );
    expect(ups.map((u) => u.title)).toContain('Only 9 h before your next shift');
    // The early's bedtime (21:45) is during the late shift, so the nudge is still planned.
    expect(ups.some((u) => u.title === 'Wind down: bed by 21:45')).toBe(true);
  });
});

describe('spending from bank notifications', () => {
  const at = new Date(2026, 10, 20, 12).getTime();
  it('reads common bank formats', () => {
    expect(parsePayment({ app: 'Monzo', title: 'Tesco', text: '£4.20', at })).toMatchObject({
      amount: 4.2,
      merchant: 'Tesco',
      kind: 'spend',
    });
    expect(
      parsePayment({
        app: 'Barclays',
        title: 'Payment alert',
        text: 'You spent £12.50 at COSTA COFFEE on your card ending 1234. Balance £240.10',
        at,
      }),
    ).toMatchObject({ amount: 12.5, merchant: 'COSTA COFFEE' });
    expect(
      parsePayment({ app: 'Monzo', title: 'Payment received', text: 'Sam sent you £20.00', at }),
    ).toMatchObject({ kind: 'in', amount: 20 });
    expect(
      parsePayment({ app: 'Monzo', title: 'Refund', text: '£9.99 from Amazon', at })?.kind,
    ).toBe('refund');
    expect(
      parsePayment({ app: 'HSBC', title: 'Balance', text: 'Your balance is £1,240.00', at }),
    ).toBeNull();
    expect(
      parsePayment({
        app: 'Monzo',
        title: 'Declined',
        text: 'Payment of £5 at Shell declined',
        at,
      }),
    ).toBeNull();
  });
  it('counts a payment shown twice once and sums since payday', () => {
    const list = paymentsFrom([
      { app: 'Google Wallet', title: 'Tesco', text: '£4.20 with Visa', at },
      { app: 'Monzo', title: 'Tesco', text: '£4.20', at: at + 30_000 },
      { app: 'Monzo', title: 'Greggs', text: '£3.10', at: at + 3_600_000 },
      { app: 'Monzo', title: 'Tesco', text: '£10.00', at: at + 86_400_000 },
    ]);
    expect(list).toHaveLength(3);
    const s = spendSummary(list, at - 1, at + 2 * 86_400_000);
    expect(s.spent).toBe(17.3);
    expect(s.top[0]).toEqual({ merchant: 'Tesco', total: 14.2, count: 2 });
  });
});

describe('SmartThings', () => {
  const devicesJson = {
    items: [
      {
        deviceId: 'd1',
        label: 'Lamp',
        roomId: 'r1',
        components: [{ capabilities: [{ id: 'switch' }, { id: 'switchLevel' }] }],
      },
      { deviceId: 'd2', label: 'Front Door', components: [{ capabilities: [{ id: 'lock' }] }] },
    ],
  };
  const devices = parseDevices(devicesJson, { r1: 'Living Room' });
  it('matches spoken names and builds commands', () => {
    expect(matchByName(devices, 'living room lamp')?.id).toBe('d1');
    expect(matchByName(devices, 'the front door')?.id).toBe('d2');
    expect(commandFor(devices[0]!, 'set_level', 140)).toEqual({
      capability: 'switchLevel',
      command: 'setLevel',
      arguments: [100],
    });
    expect(typeof commandFor(devices[1]!, 'on')).toBe('string');
    expect(needsConfirm(devices[1]!, 'unlock')).toBe(true);
    expect(needsConfirm(devices[1]!, 'lock')).toBe(false);
  });
  it('sends the command, and asks before unlocking', async () => {
    const sent: unknown[] = [];
    const f: StFetch = async (method, path, body) => {
      if (method === 'POST') sent.push({ path, body });
      if (path === '/devices') return { status: 200, json: devicesJson };
      if (path === '/locations') return { status: 200, json: { items: [] } };
      return { status: 200, json: {} };
    };
    expect(await smartHome(f, { action: 'off', device: 'lamp' }, async () => true)).toBe(
      'Lamp switched off.',
    );
    expect(sent).toHaveLength(1);
    const no = await smartHome(f, { action: 'unlock', device: 'front door' }, async () => false);
    expect(no).toContain('said no');
    expect(sent).toHaveLength(1);
  });
});

describe('open shifts and trades', () => {
  const o: FitOptions = {
    rate: 12,
    unpaidBreak: 15,
    breakOver: 0,
    minRest: 11,
    maxWeek: 48,
    payNext: '2026-11-28',
    payCycle: 28,
    payLag: 0,
  };
  const rota = [{ title: 'Work', start: '2026-11-24T14:00', end: '2026-11-24T22:00' }];
  it('flags clashes and short rest, and prices the ones that fit', () => {
    expect(
      fitShift({ title: 'Open', start: '2026-11-24T16:00', end: '2026-11-24T20:00' }, rota, o)
        .verdict,
    ).toBe('clash');
    expect(
      fitShift({ title: 'Open', start: '2026-11-25T06:00', end: '2026-11-25T14:00' }, rota, o)
        .verdict,
    ).toBe('short_rest');
    const ok = fitShift(
      { title: 'Open', start: '2026-11-26T09:00', end: '2026-11-26T17:00' },
      rota,
      o,
    );
    expect(ok.verdict).toBe('ok');
    expect(ok.pay).toBe(93);
    expect(ok.payday).toBe('2026-11-28');
    expect(paydayFor('2026-11-27', '2026-11-28', 28, 0)).toBe('2026-11-28');
    expect(fitReport([{ start: '2026-11-26T09:00', end: '2026-11-26T17:00' }], rota, o)).toContain(
      'OK',
    );
  });
});

describe('feature finder', () => {
  it('finds features by everyday words', () => {
    expect(findFeatures('bedtime')[0]?.name).toBe('Sleep planner');
    expect(findFeatures('lights')[0]?.name).toBe('Smart home (SmartThings)');
    expect(findFeatures('how much have I spent')[0]?.name).toBe('Spending since payday');
    expect(featuresText('swap')).toContain('Open shifts and trades');
  });
});
