import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Battery,
  BatteryCharging,
  Bell,
  CalendarClock,
  Mic,
  MessageSquare,
  Music2,
  Pause,
  Play,
  ShoppingCart,
  SkipBack,
  SkipForward,
  Timer,
} from 'lucide-react';
import {
  clockLeft,
  countdown,
  fullestDisk,
  paydayIn,
  tilesForSize,
  type DeskSettings,
  type DeskSnapshot,
  type TileId,
} from '@shared/desk';
import type { SystemStats, ThemeId } from '@shared/types';
import { applyTheme, THEMES } from '@renderer/themes/themes';
import { WeatherIcon } from '@renderer/components/weather/WeatherIcon';
import { useClock } from '@renderer/hooks/useClock';

/* ── Pieces ── */

/** A progress ring (0–1) with a value in the middle. */
function Ring({
  value,
  label,
  sub,
  tone = 'ok',
  size = 54,
}: {
  value: number;
  label: string;
  sub?: string;
  tone?: 'ok' | 'amber' | 'red';
  size?: number;
}) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const col =
    tone === 'red'
      ? 'rgb(var(--alert))'
      : tone === 'amber'
        ? 'rgb(var(--amber))'
        : 'rgb(var(--accent))';
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="rgb(255 255 255 / 0.1)"
            strokeWidth={4}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={col}
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - Math.min(1, Math.max(0, value)))}
            style={{
              transition: 'stroke-dashoffset .6s ease',
              filter: `drop-shadow(0 0 3px ${col})`,
            }}
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-[12px] font-medium text-white">
          {label}
        </span>
      </div>
      {sub && <span className="text-[10.5px] text-white/60">{sub}</span>}
    </div>
  );
}

const tone = (v: number, amber: number, red: number): 'ok' | 'amber' | 'red' =>
  v >= red ? 'red' : v >= amber ? 'amber' : 'ok';

/** One floating tile. Hovering makes the window take clicks (so buttons work). */
function Tile({
  hud,
  title,
  icon,
  children,
  interactive,
  preview,
}: {
  hud: boolean;
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
  interactive?: boolean;
  preview?: boolean;
}) {
  const hover = (on: boolean) => () => {
    if (interactive && !preview) window.arc.desk.hover(on);
  };
  return (
    <section
      onMouseEnter={hover(true)}
      onMouseLeave={hover(false)}
      className={
        hud
          ? 'rounded-[16px] border border-accent/35 bg-[rgb(var(--bg-void)/0.72)] px-4 py-3 shadow-glow-sm'
          : 'rounded-[16px] bg-[rgb(14_18_26/0.58)] px-4 py-3.5 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl'
      }
    >
      {title && (
        <h3
          className={
            hud
              ? 'mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-accent'
              : 'mb-2 flex items-center gap-1.5 text-[11.5px] font-medium text-white/55'
          }
        >
          {icon}
          {title}
        </h3>
      )}
      {children}
    </section>
  );
}

const btn =
  'grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white transition hover:bg-[rgb(var(--accent)/0.35)]';

/* ── Tiles ── */

function AltonTile({ s, hud, preview }: { s: DeskSnapshot; hud: boolean; preview?: boolean }) {
  const st = s.assistant;
  const word =
    st === 'listening'
      ? 'Listening…'
      : st === 'thinking' || st === 'executing'
        ? 'Thinking…'
        : st === 'speaking'
          ? 'Speaking'
          : 'Tap to talk';
  return (
    <Tile hud={hud} interactive preview={preview}>
      <button
        type="button"
        className="flex w-full items-center gap-3 text-left"
        onClick={() => !preview && window.arc.desk.action('talk')}
      >
        <span className="relative grid h-11 w-11 place-items-center">
          <span
            className={`absolute inset-0 rounded-full ${st === 'listening' ? 'animate-ping bg-[rgb(var(--ok)/0.35)]' : st === 'thinking' || st === 'executing' ? 'animate-spin border-2 border-transparent border-t-[rgb(var(--accent))]' : ''}`}
          />
          <span
            className="h-9 w-9 rounded-full"
            style={{
              background:
                'radial-gradient(circle at 35% 30%, rgb(var(--ice)), rgb(var(--accent)) 45%, rgb(var(--bg-panel)) 100%)',
              boxShadow: `0 0 ${st === 'idle' ? 10 : 22}px rgb(var(--accent) / 0.7)`,
            }}
          />
          {st === 'speaking' && (
            <span className="absolute -bottom-1 left-1/2 h-1 w-6 -translate-x-1/2 animate-pulse rounded bg-[rgb(var(--accent))]" />
          )}
        </span>
        <span>
          <span className="block text-[15px] font-medium text-white">{s.name}</span>
          <span className="flex items-center gap-1 text-[12px] text-white/60">
            <Mic size={12} /> {word}
          </span>
        </span>
      </button>
    </Tile>
  );
}

function MusicTile({
  s,
  hud,
  preview,
  now,
}: {
  s: DeskSnapshot;
  hud: boolean;
  preview?: boolean;
  now: number;
}) {
  const m = s.music;
  if (!m) return null;
  const pos =
    m.position !== null
      ? Math.min(m.duration ?? 0, m.position + (m.playing ? (now - m.at) / 1000 : 0))
      : null;
  const act = (a: 'previous' | 'play_pause' | 'next') => () =>
    !preview && window.arc.desk.action(a);
  return (
    <Tile
      hud={hud}
      title={`Now playing · ${m.app}`}
      icon={<Music2 size={12} />}
      interactive
      preview={preview}
    >
      <div className="flex items-center gap-3">
        {m.art ? (
          <img src={m.art} alt="" className="h-12 w-12 rounded-lg object-cover" />
        ) : (
          <span className="grid h-12 w-12 place-items-center rounded-lg bg-white/10 text-white/60">
            <Music2 size={20} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium text-white">{m.title}</div>
          <div className="truncate text-[12px] text-white/60">{m.artist || ' '}</div>
        </div>
      </div>
      {pos !== null && m.duration ? (
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[rgb(var(--accent))]"
            style={{ width: `${(pos / m.duration) * 100}%` }}
          />
        </div>
      ) : null}
      <div className="mt-2.5 flex justify-center gap-3">
        <button type="button" className={btn} onClick={act('previous')} aria-label="Previous">
          <SkipBack size={15} />
        </button>
        <button
          type="button"
          className={btn}
          onClick={act('play_pause')}
          aria-label={m.playing ? 'Pause' : 'Play'}
        >
          {m.playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button type="button" className={btn} onClick={act('next')} aria-label="Next">
          <SkipForward size={15} />
        </button>
      </div>
    </Tile>
  );
}

function WorkTile({ s, hud, now }: { s: DeskSnapshot; hud: boolean; now: number }) {
  const sh = s.shift;
  if (!sh && !s.payday) return null;
  const during = sh && sh.start <= now && now < sh.end;
  const hm = (t: number) =>
    new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const day = (t: number) =>
    new Date(t).toLocaleDateString([], { weekday: 'short', day: 'numeric' });
  return (
    <Tile hud={hud} title="Work" icon={<CalendarClock size={12} />}>
      {sh && (
        <div className="flex items-center gap-3">
          <Ring
            value={
              during
                ? (now - sh.start) / (sh.end - sh.start)
                : Math.max(0, 1 - (sh.start - now) / 86_400_000)
            }
            label={during ? '●' : countdown(sh.start - now).replace('in ', '')}
            size={50}
          />
          <div>
            <div className="text-[14px] font-medium text-white">
              {during
                ? `At work · ends ${countdown(sh.end - now)}`
                : `Next shift ${countdown(sh.start - now)}`}
            </div>
            <div className="text-[12px] text-white/60">
              {day(sh.start)} · {hm(sh.start)}–{hm(sh.end)} · {sh.title}
            </div>
          </div>
        </div>
      )}
      {s.payday && (
        <div className="mt-2 text-[13px] text-white/80">
          💷 {paydayIn(s.payday.date)}
          {s.payday.net > 0 && (
            <span className="text-white/60"> · ≈ £{Math.round(s.payday.net)}</span>
          )}
        </div>
      )}
    </Tile>
  );
}

function HealthTile({ stats, hud }: { stats: SystemStats | null; hud: boolean }) {
  if (!stats?.timestamp) return null;
  const cpu = Math.round(stats.cpu.load);
  const ram = Math.round((stats.memory.used / Math.max(1, stats.memory.total)) * 100);
  const gpuT = stats.gpu?.temp ?? null;
  const disk = fullestDisk(stats.disks);
  return (
    <Tile hud={hud} title="PC">
      <div className="flex justify-between">
        <Ring value={cpu / 100} label={`${cpu}%`} sub="CPU" tone={tone(cpu, 75, 92)} />
        <Ring value={ram / 100} label={`${ram}%`} sub="RAM" tone={tone(ram, 80, 92)} />
        {gpuT !== null ? (
          <Ring
            value={gpuT / 100}
            label={`${Math.round(gpuT)}°`}
            sub="GPU"
            tone={tone(gpuT, 75, 88)}
          />
        ) : (
          stats.cpu.temp !== null && (
            <Ring
              value={stats.cpu.temp / 100}
              label={`${Math.round(stats.cpu.temp)}°`}
              sub="CPU temp"
              tone={tone(stats.cpu.temp, 75, 90)}
            />
          )
        )}
      </div>
      {disk && (
        <div
          className={`mt-2 text-[12px] ${disk.pct >= 95 ? 'text-[rgb(var(--alert))]' : disk.pct >= 85 ? 'text-[rgb(var(--amber))]' : 'text-white/60'}`}
        >
          {disk.mount} {Math.round(disk.free / 1e9)} GB free ({disk.pct}% full)
        </div>
      )}
    </Tile>
  );
}

function WeatherTile({ s, hud }: { s: DeskSnapshot; hud: boolean }) {
  const w = s.weather;
  if (!w) return null;
  return (
    <Tile hud={hud}>
      <div className="flex items-center gap-3">
        <WeatherIcon
          code={w.code}
          isDay={w.isDay}
          size={36}
          className="text-[rgb(var(--accent))]"
        />
        <div>
          <div className="text-[26px] font-light leading-none text-white">
            {w.temp}
            {w.unit}
          </div>
          <div className="mt-1 text-[12px] text-white/60">
            {w.label} · {w.next}
          </div>
        </div>
      </div>
    </Tile>
  );
}

function TodayTile({ s, hud, now }: { s: DeskSnapshot; hud: boolean; now: number }) {
  if (!s.timers.length && !s.reminders.length && !s.list) return null;
  return (
    <Tile hud={hud} title="Today">
      <ul className="space-y-1.5 text-[13px] text-white/85">
        {s.timers.map((t) => (
          <li key={t.id} className="flex items-center gap-2">
            <Timer
              size={14}
              className={
                t.ringing ? 'animate-pulse text-[rgb(var(--amber))]' : 'text-[rgb(var(--accent))]'
              }
            />
            <span className="flex-1 truncate">{t.label || 'Timer'}</span>
            <span className="font-medium tabular-nums text-white">
              {t.ringing ? 'now' : clockLeft(t.dueAt - now)}
            </span>
          </li>
        ))}
        {s.reminders.map((r) => (
          <li key={`${r.at}${r.what}`} className="flex items-center gap-2">
            <Bell size={14} className="text-[rgb(var(--accent))]" />
            <span className="flex-1 truncate">{r.what}</span>
            <span className="text-white/60">
              {new Date(r.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </li>
        ))}
        {s.list && (
          <li className="flex items-start gap-2">
            <ShoppingCart size={14} className="mt-0.5 text-[rgb(var(--accent))]" />
            <span className="text-white/80">{s.list.items.join(', ')}</span>
          </li>
        )}
      </ul>
    </Tile>
  );
}

function PhoneTile({ s, hud }: { s: DeskSnapshot; hud: boolean }) {
  const p = s.phone;
  if (!p) return null;
  return (
    <Tile hud={hud}>
      <div className="flex items-center gap-4 text-[13px] text-white/85">
        <span className="flex items-center gap-1.5">
          {p.charging ? (
            <BatteryCharging size={16} className="text-[rgb(var(--ok))]" />
          ) : (
            <Battery
              size={16}
              className={
                p.battery !== null && p.battery <= 20
                  ? 'text-[rgb(var(--alert))]'
                  : 'text-[rgb(var(--accent))]'
              }
            />
          )}
          Phone {p.battery !== null ? `${p.battery}%` : ''}
        </span>
        <span className="flex items-center gap-1.5">
          <MessageSquare size={15} className="text-[rgb(var(--accent))]" />
          {p.unread ? `${p.unread} unread` : 'No new messages'}
        </span>
      </div>
    </Tile>
  );
}

/* ── The whole widget (also the live preview in Settings) ── */

export function DeskView({
  snap,
  stats,
  desk,
  preview,
}: {
  snap: DeskSnapshot;
  stats: SystemStats | null;
  desk: DeskSettings;
  preview?: boolean;
}) {
  const now = useClock(1000);
  const t = now.getTime();
  const hud = desk.style === 'hud';
  const tiles = tilesForSize(desk);
  const render: Record<TileId, () => ReactNode> = {
    alton: () => <AltonTile s={snap} hud={hud} preview={preview} />,
    music: () => <MusicTile s={snap} hud={hud} preview={preview} now={t} />,
    work: () => <WorkTile s={snap} hud={hud} now={t} />,
    health: () => <HealthTile stats={stats} hud={hud} />,
    weather: () => <WeatherTile s={snap} hud={hud} />,
    today: () => <TodayTile s={snap} hud={hud} now={t} />,
    phone: () => <PhoneTile s={snap} hud={hud} />,
  };
  return (
    <div className="flex w-[300px] select-none flex-col gap-2">
      <Tile hud={hud} interactive={!desk.locked} preview={preview}>
        {/* Unlocked: drag the clock to move the widget (it snaps to the nearest corner). */}
        <div
          style={
            !desk.locked && !preview
              ? ({ WebkitAppRegion: 'drag' } as React.CSSProperties)
              : undefined
          }
        >
          <div
            className={
              hud
                ? 'numeric font-display text-[42px] font-light leading-none text-ice text-glow-md'
                : 'text-[48px] font-extralight leading-none tracking-tight text-white'
            }
            style={
              hud
                ? undefined
                : { fontFamily: "'Inter', 'Segoe UI Variable Display', 'Segoe UI', sans-serif" }
            }
          >
            {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div
            className={
              hud
                ? 'mt-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted'
                : 'mt-1.5 text-[14px] text-white/65'
            }
          >
            {now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
      </Tile>
      {tiles.map((id) => {
        const n = render[id]();
        return n ? <div key={id}>{n}</div> : null;
      })}
    </div>
  );
}

/** Data for the widget and strip windows: the snapshot pushed from main, CPU every 3 s. */
function useDeskData(): { snap: DeskSnapshot | null; stats: SystemStats | null } {
  const [snap, setSnap] = useState<DeskSnapshot | null>(null);
  const [stats, setStats] = useState<SystemStats | null>(null);
  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    void window.arc.desk.get().then(setSnap);
    const off = window.arc.desk.onSnapshot(setSnap);
    const load = (): void =>
      void Promise.resolve(window.arc.system.getStats())
        .then((x) => x && setStats(x))
        .catch(() => undefined);
    load();
    const t = setInterval(load, 3000);
    return () => {
      off();
      clearInterval(t);
    };
  }, []);
  useEffect(() => {
    if (snap && snap.look.theme in THEMES) applyTheme(snap.look.theme as ThemeId);
  }, [snap?.look.theme]); // eslint-disable-line react-hooks/exhaustive-deps
  return { snap, stats };
}

/** The desktop widget window (#widget): see-through, clicks pass through except on tiles. */
export function DesktopWidget() {
  const { snap, stats } = useDeskData();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => window.arc.desk.resize(el.scrollHeight + 4));
    ro.observe(el);
    return () => ro.disconnect();
  }, [snap === null]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!snap) return null;
  return (
    <div ref={ref} className="p-0.5">
      <DeskView snap={snap} stats={stats} desk={snap.look.desk} />
    </div>
  );
}

/** The taskbar strip window (#strip): one thin row above the taskbar. */
export function TaskbarStrip() {
  const { snap, stats } = useDeskData();
  const now = useClock(1000).getTime();
  if (!snap) return null;
  const desk = snap.look.desk;
  const hud = desk.style === 'hud';
  const m = snap.music;
  const sh = snap.shift;
  const items = desk.strip.items;
  const bit = 'flex min-w-0 items-center gap-1.5 whitespace-nowrap';
  return (
    <div
      className={`flex h-[34px] items-center gap-4 rounded-full px-4 text-[12.5px] text-white ${hud ? 'border border-accent/40 bg-[rgb(var(--bg-void)/0.8)] font-mono text-ice' : 'bg-[rgb(14_18_26/0.62)] shadow-[0_6px_20px_rgba(0,0,0,0.35)]'}`}
    >
      {items.includes('music') && m && (
        <span
          className={bit}
          onMouseEnter={() => window.arc.desk.hover(true)}
          onMouseLeave={() => window.arc.desk.hover(false)}
        >
          <button
            type="button"
            className="grid h-6 w-6 place-items-center rounded-full bg-white/10 hover:bg-[rgb(var(--accent)/0.4)]"
            onClick={() => window.arc.desk.action('play_pause')}
            aria-label={m.playing ? 'Pause' : 'Play'}
          >
            {m.playing ? <Pause size={12} /> : <Play size={12} />}
          </button>
          <span className="max-w-[150px] truncate">{m.title}</span>
        </span>
      )}
      {items.includes('shift') && sh && (
        <span className={bit}>
          <CalendarClock size={13} className="text-[rgb(var(--accent))]" />
          {sh.start <= now && now < sh.end
            ? `Ends ${countdown(sh.end - now)}`
            : `Shift ${countdown(sh.start - now)}`}
        </span>
      )}
      {items.includes('cpu') && stats?.timestamp ? (
        <span className={bit}>CPU {Math.round(stats.cpu.load)}%</span>
      ) : null}
      {items.includes('weather') && snap.weather && (
        <span className={bit}>
          <WeatherIcon code={snap.weather.code} isDay={snap.weather.isDay} size={14} />
          {snap.weather.temp}
          {snap.weather.unit}
        </span>
      )}
    </div>
  );
}
