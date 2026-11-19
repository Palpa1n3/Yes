import { notifyUser } from '../holo';
import { app, clipboard } from 'electron';
import os from 'node:os';
import si from 'systeminformation';
import { HealthMonitor, type HealthSample } from '@shared/health';
import { IPC } from '@shared/ipc';
import type { MainContext } from '../context';
import { ClipboardHistory } from '../services/clipboard-history';
import { emit, handle } from './handle';

export function registerClipboardIpc(ctx: MainContext): ClipboardHistory {
  const clips = new ClipboardHistory({
    read: () => clipboard.readText(),
    write: (t) => clipboard.writeText(t),
    enabled: () => ctx.settings.get().clipboardHistory,
    onChange: (list) => emit(ctx.getWindow(), IPC.clipboard.onChange, list),
  });
  ctx.settings.subscribe((next, prev) => {
    if (prev.clipboardHistory && !next.clipboardHistory) clips.clear();
  });
  handle(IPC.clipboard.list, () => clips.list());
  handle(IPC.clipboard.read, async () =>
    String((await clipboard.readText()) ?? '').slice(0, 20_000),
  );
  handle(IPC.clipboard.copy, (id) => clips.copy(String(id)));
  handle(IPC.clipboard.remove, (id) => {
    clips.remove(String(id));
    return clips.list();
  });
  handle(IPC.clipboard.clear, () => {
    clips.clear();
    return clips.list();
  });
  void clips.start();
  app.on('will-quit', () => clips.stop());
  return clips;
}

/** Samples health every minute (independent of the HUD, which pauses when hidden). */
export function registerHealthIpc(ctx: MainContext): void {
  const monitor = new HealthMonitor();
  let disks: HealthSample['disks'] = [];
  let battery: HealthSample['battery'] = null;
  let tick = 0;
  const sample = async (): Promise<void> => {
    if (!ctx.settings.get().healthAlerts || ctx.timers.focusing()) return;
    tick++;
    const [temp, mem, gfx] = await Promise.all([
      si.cpuTemperature().catch(() => null),
      si.mem().catch(() => null),
      si.graphics().catch(() => null),
    ]);
    // Drives and battery change slowly: every 10 minutes.
    if (tick % 10 === 1) {
      const fs = await si.fsSize().catch(() => []);
      disks = fs
        .filter((d) => d.size > 0)
        .map((d) => ({ mount: d.mount, pct: (d.used / d.size) * 100 }));
      const b = await si.battery().catch(() => null);
      battery = b && b.hasBattery ? { percent: b.percent, charging: b.isCharging } : null;
    }
    const gpuTemps = (gfx?.controllers ?? [])
      .map((c) => c.temperatureGpu)
      .filter((t): t is number => typeof t === 'number' && t > 0);
    const s: HealthSample = {
      now: Date.now(),
      cpuTemp: temp && typeof temp.main === 'number' && temp.main > 0 ? temp.main : null,
      gpuTemp: gpuTemps.length ? Math.max(...gpuTemps) : null,
      memPct: mem && mem.total ? ((mem.total - mem.available) / mem.total) * 100 : null,
      disks,
      battery,
      uptimeSec: os.uptime(),
    };
    for (const a of monitor.check(s)) {
      notifyUser(`${ctx.settings.get().assistantName} · PC health`, a.text, 'warn');
      emit(ctx.getWindow(), IPC.clipboard.onHealth, a);
    }
  };
  const t = setInterval(() => void sample(), 60_000);
  t.unref?.();
  setTimeout(() => void sample(), 90_000).unref?.();
  app.on('will-quit', () => clearInterval(t));
}
