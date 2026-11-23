import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import {
  STRIP_ITEMS,
  TILE_LABELS,
  cleanDesk,
  type DeskSettings,
  type DeskSnapshot,
  type StripItem,
} from '@shared/desk';
import type { SystemStats } from '@shared/types';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { DeskView } from '@renderer/components/hud/DesktopWidget';
import { Field, Section, Segmented, Select, Toggle } from './controls';

const STRIP_LABELS: Record<StripItem, string> = {
  music: 'Now playing',
  shift: 'Next shift',
  cpu: 'CPU',
  weather: 'Weather',
};

/** Settings › Appearance › Desktop & taskbar: the widget (with a live preview) and the
 *  taskbar features. */
export function DeskSection() {
  const { settings: s, update } = useSettingsStore();
  const d = s.desk;
  const set = (ch: Partial<DeskSettings>): void =>
    void update({ desk: cleanDesk({ ...d, ...ch }) });
  const [snap, setSnap] = useState<DeskSnapshot | null>(null);
  const [screens, setScreens] = useState<Array<{ id: number; label: string; primary: boolean }>>(
    [],
  );
  useEffect(() => {
    void window.arc.desk
      .displays()
      .then(setScreens)
      .catch(() => undefined);
  }, []);
  const [stats, setStats] = useState<SystemStats | null>(null);
  useEffect(() => {
    const load = (): void => {
      void Promise.resolve(window.arc.desk.get())
        .then((x) => x && setSnap(x))
        .catch(() => undefined);
      void Promise.resolve(window.arc.system.getStats())
        .then((x) => x && setStats(x))
        .catch(() => undefined);
    };
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);
  const move = (i: number, by: number): void => {
    const tiles = [...d.tiles];
    const j = i + by;
    if (j < 0 || j >= tiles.length) return;
    [tiles[i], tiles[j]] = [tiles[j] as (typeof tiles)[number], tiles[i] as (typeof tiles)[number]];
    set({ tiles });
  };
  return (
    <>
      <Section title="Desktop widget">
        <Field
          label="Desktop widget"
          hint="Floating tiles on your desktop: clock, Alton, music, work, PC, weather, today and your phone. Clicks go through it except on its buttons, and it never takes focus."
        >
          <Toggle
            label="Desktop widget"
            checked={s.desktopWidget}
            onChange={(v) => void update({ desktopWidget: v })}
          />
        </Field>
        {snap && (
          <div
            className="my-2 flex justify-center rounded-[10px] p-4"
            style={{ background: 'linear-gradient(135deg,#1d2b44,#3b2a4d 55%,#14202e)' }}
            aria-label="Preview of the desktop widget"
          >
            <DeskView snap={snap} stats={stats} desk={d} preview />
          </div>
        )}
        <Field label="Style">
          <Segmented
            label="Style"
            value={d.style}
            onChange={(v) => set({ style: v })}
            options={[
              { value: 'glass', label: 'Clean glass' },
              { value: 'hud', label: 'HUD' },
            ]}
          />
        </Field>
        <Field
          label="Size"
          hint="Small: just the clock. Medium: the clock and your first two tiles. Large: every tile that's on."
        >
          <Segmented
            label="Size"
            value={d.size}
            onChange={(v) => set({ size: v })}
            options={[
              { value: 'small', label: 'Small' },
              { value: 'medium', label: 'Medium' },
              { value: 'large', label: 'Large' },
            ]}
          />
        </Field>
        <Field label="Tiles" hint="Tick the ones you want and move them up or down." stacked>
          <ul className="space-y-1">
            {d.tiles.map((t, i) => (
              <li
                key={t.id}
                className="flex items-center gap-2 rounded-[6px] bg-panel-raised/50 px-2 py-1"
              >
                <Toggle
                  label={TILE_LABELS[t.id]}
                  checked={t.on}
                  onChange={(on) =>
                    set({ tiles: d.tiles.map((x) => (x.id === t.id ? { ...x, on } : x)) })
                  }
                />
                <span className="flex-1 text-[13px]">{TILE_LABELS[t.id]}</span>
                <button
                  type="button"
                  className="hud-button"
                  aria-label="Move up"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  type="button"
                  className="hud-button"
                  aria-label="Move down"
                  onClick={() => move(i, 1)}
                  disabled={i === d.tiles.length - 1}
                >
                  <ArrowDown size={12} />
                </button>
              </li>
            ))}
          </ul>
        </Field>
        {screens.length > 1 && (
          <Field label="Screen" hint="Which monitor the widget sits on.">
            <Select
              label="Screen"
              value={String(
                screens.some((x) => x.id === d.display)
                  ? d.display
                  : (screens.find((x) => x.primary)?.id ?? ''),
              )}
              onChange={(v) => set({ display: Number(v) })}
              options={screens.map((x) => ({ value: String(x.id), label: x.label }))}
            />
          </Field>
        )}
        <Field
          label="Corner"
          hint="Or drag the clock (when not locked): it snaps to the nearest corner of whichever screen you drop it on."
        >
          <Select
            label="Corner"
            value={d.corner}
            onChange={(v) => set({ corner: v })}
            options={[
              { value: 'top-right', label: 'Top right' },
              { value: 'top-left', label: 'Top left' },
              { value: 'bottom-right', label: 'Bottom right' },
              { value: 'bottom-left', label: 'Bottom left' },
            ]}
          />
        </Field>
        <Field label="Lock position">
          <Toggle label="Lock position" checked={d.locked} onChange={(v) => set({ locked: v })} />
        </Field>
        <Field label="Opacity" stacked>
          <div className="flex items-center gap-2">
            <input
              type="range"
              aria-label="Opacity"
              min={30}
              max={100}
              step={5}
              value={d.opacity}
              onChange={(e) => set({ opacity: Number(e.target.value) })}
              className="hud-range w-full"
            />
            <span className="w-10 text-right font-mono text-[11px] text-accent">{d.opacity}%</span>
          </div>
        </Field>
        <Field label="Hide while gaming or full-screen">
          <Toggle
            label="Hide while gaming or full-screen"
            checked={d.autoHide}
            onChange={(v) => set({ autoHide: v })}
          />
        </Field>
      </Section>
      <Section title="Taskbar">
        {(
          [
            [
              'thumbar',
              'Buttons on the taskbar preview',
              'Talk, previous, play/pause, next and new chat when you hover Alton on the taskbar.',
            ],
            [
              'jumpList',
              'Right-click menu (jump list)',
              'Talk, new chat, Agent Mode, lock, sleep, the widget and phone settings.',
            ],
            [
              'overlay',
              'Status badge',
              'Green listening, blue thinking, amber when Agent Mode needs you, red for a PC warning.',
            ],
            [
              'progress',
              'Progress on the taskbar button',
              'A running timer, an update downloading, or how far through your shift you are.',
            ],
            [
              'trayLive',
              'Live tray tooltip',
              'Next shift, payday and CPU when you hover the tray icon.',
            ],
          ] as const
        ).map(([key, label, hint]) => (
          <Field key={key} label={label} hint={hint}>
            <Toggle label={label} checked={d[key]} onChange={(v) => set({ [key]: v })} />
          </Field>
        ))}
        <Field
          label="Taskbar strip"
          hint="A thin bar just above the taskbar with the things you choose. Clicks go through it except its buttons."
        >
          <Toggle
            label="Taskbar strip"
            checked={d.strip.on}
            onChange={(v) => set({ strip: { ...d.strip, on: v } })}
          />
        </Field>
        {d.strip.on && (
          <>
            <Field label="Strip position">
              <Segmented
                label="Strip position"
                value={d.strip.place}
                onChange={(v) => set({ strip: { ...d.strip, place: v } })}
                options={[
                  { value: 'left', label: 'Left' },
                  { value: 'centre', label: 'Centre' },
                  { value: 'right', label: 'Right' },
                ]}
              />
            </Field>
            <Field label="Strip shows" stacked>
              <div className="flex flex-wrap gap-3">
                {STRIP_ITEMS.map((it) => (
                  <label key={it} className="flex items-center gap-1.5 text-[13px]">
                    <Toggle
                      label={STRIP_LABELS[it]}
                      checked={d.strip.items.includes(it)}
                      onChange={(on) =>
                        set({
                          strip: {
                            ...d.strip,
                            items: on
                              ? STRIP_ITEMS.filter((x) => x === it || d.strip.items.includes(x))
                              : d.strip.items.filter((x) => x !== it),
                          },
                        })
                      }
                    />
                    {STRIP_LABELS[it]}
                  </label>
                ))}
              </div>
            </Field>
          </>
        )}
      </Section>
    </>
  );
}
