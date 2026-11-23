import { describe, expect, it } from 'vitest';
import { motionPlan } from '@renderer/components/core/bgMotion';
import { DEFAULT_UI_STYLE, cleanUiStyle } from '@shared/ui-style';

const area = 1920 * 1080;

describe('moving backgrounds', () => {
  it('gives each space scene its own effect, placed on the painting', () => {
    expect(motionPlan('horizon', 'calm', { shooting: true, area })).toMatchObject({
      effect: 'disc',
      cx: 0.5,
      cy: 0.24,
    });
    expect(motionPlan('wormhole', 'calm', { shooting: true, area })?.effect).toBe('infall');
    expect(motionPlan('ringed', 'calm', { shooting: true, area })?.effect).toBe('rings');
    expect(motionPlan('sun', 'calm', { shooting: true, area })).toMatchObject({
      effect: 'flare',
      cx: 0.2,
    });
    expect(motionPlan('orbit', 'calm', { shooting: true, area })?.effect).toBe('satellites');
    expect(motionPlan('nebula', 'calm', { shooting: true, area })?.effect).toBe('glow');
  });
  it('does nothing when still, for your own picture or with no background', () => {
    expect(motionPlan('horizon', 'off', { shooting: true, area })).toBeNull();
    expect(motionPlan('photo', 'lively', { shooting: true, area })).toBeNull();
    expect(motionPlan('none', 'calm', { shooting: true, area })).toBeNull();
  });
  it('lively has more stars, more shooting stars and moves faster; stars scale with the screen', () => {
    const calm = motionPlan('deepfield', 'calm', { shooting: true, area });
    const lively = motionPlan('deepfield', 'lively', { shooting: true, area });
    expect(lively!.stars).toBeGreaterThan(calm!.stars);
    expect(lively!.shootEvery).toBeLessThan(calm!.shootEvery);
    expect(lively!.speed).toBeGreaterThan(calm!.speed);
    expect(motionPlan('deepfield', 'calm', { shooting: false, area })?.shootEvery).toBe(0);
    const phone = motionPlan('deepfield', 'calm', { shooting: true, area: 400 * 860 });
    expect(phone!.stars).toBeLessThan(calm!.stars);
    expect(phone!.fps).toBeLessThanOrEqual(30);
  });
  it('the new interface options are cleaned and default to calm motion', () => {
    expect(DEFAULT_UI_STYLE.bgMotion).toBe('calm');
    const s = cleanUiStyle({
      bgMotion: 'wild',
      chatSize: 300,
      border: 'pulse',
      enter: 'pop',
      lift: 1,
    });
    expect(s.bgMotion).toBe('calm');
    expect(s.chatSize).toBe(130);
    expect(s.border).toBe('pulse');
    expect(s.enter).toBe('pop');
    expect(s.lift).toBe(false);
  });
});
