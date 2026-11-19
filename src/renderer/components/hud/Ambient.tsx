import { useEffect, useRef, useState } from 'react';
import {
  dayPhase,
  isFestive,
  isFrosty,
  precipFor,
  sunsetGlow,
  tintFor,
  toC,
  type Precip,
} from '@shared/ambient';
import { useReducedMotion } from '@renderer/hooks/useReducedMotion';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { useWeatherStore } from '@renderer/stores/weatherStore';

/** Weather and seasons behind the HUD: rain or snow falling, frost on the edges when it's
 *  cold, a warm glow around sunset, and snow all through December. */
export function AmbientBack() {
  const on = useSettingsStore((s) => s.settings.ambient);
  const data = useWeatherStore((s) => s.data);
  const reduced = useReducedMotion();
  const ref = useRef<HTMLCanvasElement>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const weather: Precip = data ? precipFor(data.current.code) : 'none';
  const festive = isFestive(now);
  const fall: Precip = weather !== 'none' ? weather : festive ? 'snow' : 'none';
  const frost = festive || (data ? isFrosty(toC(data.current.temp, data.units.temp)) : false);
  const glow = data ? sunsetGlow(now, data.today.sunset) : 0;
  const heavy = data ? Math.min(1, 0.4 + data.current.precipitation / 4) : 0.5;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!on || reduced || fall === 'none') return;
    const dpr = window.devicePixelRatio || 1;
    const resize = (): void => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    resize();
    window.addEventListener('resize', resize);
    const n = fall === 'rain' ? Math.round(90 * heavy) : 70;
    const drops = Array.from({ length: n }, () => ({
      x: Math.random(),
      y: Math.random(),
      v: fall === 'rain' ? 0.012 + Math.random() * 0.01 : 0.0012 + Math.random() * 0.0015,
      len: 8 + Math.random() * 14,
      r: 0.8 + Math.random() * 1.8,
      sway: Math.random() * Math.PI * 2,
    }));
    let raf = 0;
    let last = 0;
    let t = 0;
    const draw = (ts: number): void => {
      raf = requestAnimationFrame(draw);
      if (document.hidden || ts - last < 33) return; // ~30 fps is plenty
      last = ts;
      t += 0.033;
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      for (const d of drops) {
        d.y += d.v;
        if (fall === 'snow') d.x += Math.sin(t + d.sway) * 0.0004;
        if (d.y > 1.02) {
          d.y = -0.02;
          d.x = Math.random();
        }
        const x = d.x * W;
        const y = d.y * H;
        if (fall === 'rain') {
          ctx.strokeStyle = 'rgba(150, 200, 255, 0.28)';
          ctx.lineWidth = dpr;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - 2 * dpr, y + d.len * dpr);
          ctx.stroke();
        } else {
          ctx.fillStyle = 'rgba(235, 245, 255, 0.55)';
          ctx.beginPath();
          ctx.arc(x, y, d.r * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [on, reduced, fall, heavy]);

  if (!on) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
      {frost && (
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 55%, rgba(200,230,255,0.10) 80%, rgba(225,242,255,0.22) 100%)',
          }}
        />
      )}
      {glow > 0 && (
        <div
          className="absolute inset-x-0 bottom-0 h-1/2"
          style={{
            background: `linear-gradient(to top, rgba(255,140,60,${0.16 * glow}), rgba(255,110,80,${0.05 * glow}) 60%, transparent)`,
          }}
        />
      )}
    </div>
  );
}

/** A soft colour cast over everything: cool mornings, warm amber evenings, dim nights,
 *  and an icy tint in December. */
export function AmbientTint() {
  const on = useSettingsStore((s) => s.settings.timeTint);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 5 * 60_000);
    return () => clearInterval(t);
  }, []);
  if (!on) return null;
  const tint = tintFor(dayPhase(now.getHours()));
  const icy = isFestive(now) && tint.alpha < 0.1;
  const color = icy ? '170 215 255' : tint.color;
  const alpha = icy ? 0.08 : tint.alpha;
  return (
    <div className="pointer-events-none fixed inset-0 z-[70]" aria-hidden>
      {alpha > 0 && (
        <div
          className="absolute inset-0 transition-colors duration-[3000ms]"
          style={{ background: `rgb(${color} / ${alpha})`, mixBlendMode: 'soft-light' }}
        />
      )}
      {tint.dim > 0 && (
        <div className="absolute inset-0" style={{ background: `rgb(0 0 0 / ${tint.dim})` }} />
      )}
    </div>
  );
}
