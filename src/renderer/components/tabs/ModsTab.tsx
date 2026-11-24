import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, FolderOpen, RefreshCw, Search, Download } from 'lucide-react';
import type { CpMod, UpdateState } from '@shared/cpmods';
import type {
  FixesState,
  LaunchCheck,
  LoadOrderReport,
  ModsStatus,
  OutdatedReport,
  RecReport,
  VortexSyncState,
} from '@shared/ipc';
import { Chip } from '@renderer/components/panels/Chip';
import { Panel } from '@renderer/components/panels/Panel';
import { Columns } from './Columns';

const ago = (t: number): string => {
  if (!t) return 'never';
  const m = Math.round((Date.now() - t) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};

const STATE_LABEL: Record<UpdateState, string> = {
  queued: 'Waiting its turn',
  sending: 'Getting the download…',
  downloading: 'Downloading…',
  'in-vortex': 'In Vortex: downloading and installing…',
  opened: 'Opened on Nexus: press “Mod manager download”',
  installed: 'Installed ✓',
  failed: 'Failed',
};

/** "Sending 12 of 140" with a bar, what's happening now, and how many Vortex has finished. */
function UpdateProgress({ st, premium }: { st: ModsStatus; premium: boolean }) {
  const c: Record<UpdateState, number> = {
    queued: 0,
    sending: 0,
    downloading: 0,
    'in-vortex': 0,
    opened: 0,
    installed: 0,
    failed: 0,
  };
  for (const j of st.jobs) c[j.state]++;
  const run = st.updating;
  const pct = run && run.total ? Math.round((run.done / run.total) * 100) : 100;
  const recent = st.jobs.filter((j) => j.state === 'installed').slice(0, 8);
  return (
    <div className="space-y-1.5 border border-accent/40 bg-[rgb(var(--accent)/0.06)] p-2 text-[12.5px]">
      {run ? (
        <>
          <div className="flex items-center gap-2">
            <span className="flex-1">
              {premium ? 'Sending' : 'Opening'} {run.done} of {run.total}
              {run.current ? `: ${run.current}` : ''}
            </span>
            <button
              type="button"
              className="hud-button"
              onClick={() => void window.arc.mods.cancel()}
            >
              Stop
            </button>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden bg-line/50"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Update progress"
          >
            <div
              className="h-full bg-accent transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </>
      ) : (
        <p>Updates this session</p>
      )}
      <p className="text-text-muted">
        {[
          c.queued && `${c.queued} waiting`,
          c.downloading && `${c.downloading} downloading`,
          c['in-vortex'] && `${c['in-vortex']} in Vortex`,
          c.opened && `${c.opened} opened on Nexus`,
          c.installed && `${c.installed} installed ✓`,
          c.failed && `${c.failed} failed`,
        ]
          .filter(Boolean)
          .join(' · ') || 'Starting…'}
      </p>
      {!!recent.length && (
        <ul className="micro-label normal-case text-ok">
          {recent.map((j) => (
            <li key={j.modId}>✓ {j.name}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Load order: archive clashes (first loaded wins), suggested moves, choose a winner, undo. */
function LoadOrderPanel() {
  const [r, setR] = useState<LoadOrderReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const run = (): void => {
    setBusy(true);
    void window.arc.mods
      .loadOrder()
      .then(setR)
      .finally(() => setBusy(false));
  };
  const change = (p: Promise<{ ok: boolean; message: string }>): void => {
    void p.then((x) => {
      setMsg(x.message);
      if (x.ok) run();
    });
  };
  const variantCount = r?.conflicts.filter((c) => c.variants).length ?? 0;
  return (
    <Panel
      code="MOD.06"
      title="Load order"
      chip={r ? <Chip>{r.conflicts.length} clashes</Chip> : undefined}
      className="flex-1"
      bodyClassName="flex flex-col gap-2 overflow-y-auto"
    >
      <p className="text-[12px] text-text-muted">
        Archive mods load in name order, and when two change the same game file the first one loaded
        wins. This finds the real clashes.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="hud-button" disabled={busy} onClick={run}>
          <RefreshCw size={13} className={busy ? 'animate-spin' : ''} />
          {busy ? 'Reading your archives…' : r ? 'Check again' : 'Check load order'}
        </button>
        {!!r?.moves.length && (
          <button
            type="button"
            className="hud-button"
            onClick={() => {
              if (
                window.confirm(
                  `Save the suggested order (${r.moves.length} move${r.moves.length === 1 ? '' : 's'})? You can undo it.`,
                )
              )
                change(window.arc.mods.setOrder({ kind: 'suggested' }));
            }}
          >
            Apply suggested order
          </button>
        )}
        {r?.modlist === 'alton' && (
          <button
            type="button"
            className="hud-button"
            onClick={() => change(window.arc.mods.resetOrder())}
          >
            Undo (back to name order)
          </button>
        )}
      </div>
      {msg && <p className="text-[12.5px] text-accent">{msg}</p>}
      {r?.error && <p className="text-[12.5px] text-alert">{r.error}</p>}
      {r?.redmod?.failed && (
        <p className="border border-alert/50 p-2 text-[12.5px] text-alert">{r.redmod.verdict}</p>
      )}
      {r && !r.error && (
        <>
          <p className="text-[12.5px]">
            {r.archives} archives ·{' '}
            {r.modlist === 'none'
              ? 'name order'
              : r.modlist === 'alton'
                ? 'Alton’s saved order'
                : 'an order saved by another tool'}{' '}
            · {r.conflicts.length} clash{r.conflicts.length === 1 ? '' : 'es'}
            {variantCount ? ` · ${variantCount} between alternative versions of one mod` : ''}
          </p>
          {r.moves.length ? (
            <div className="space-y-1">
              <div className="micro-label">Suggested</div>
              {r.moves.map((m) => (
                <p key={m.archive} className="text-[12px]">
                  Move <b>{m.archive}</b> before <b>{m.before}</b>.{' '}
                  <span className="text-text-muted">{m.reason}</span>
                </p>
              ))}
            </div>
          ) : (
            <p className="text-[12.5px] text-ok">
              Patches and fixes already load ahead of the mods they patch.
            </p>
          )}
          {!!r.conflicts.length && (
            <ul className="space-y-1">
              {r.conflicts.map((c) => (
                <li
                  key={`${c.winner}|${c.loser}`}
                  className="flex items-center gap-2 border-b border-line/30 py-1 text-[12px]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      <span className="text-ok">{c.winner}</span>
                      <span className="text-text-muted"> wins over </span>
                      {c.loser}
                    </span>
                    <span className="micro-label block normal-case">
                      {c.files} shared file{c.files === 1 ? '' : 's'}
                      {c.winnerMod || c.loserMod
                        ? ` · ${c.winnerMod || '?'} vs ${c.loserMod || '?'}`
                        : ''}
                      {c.variants ? ' · alternative versions: usually install just one' : ''}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="hud-button !px-1.5 text-[11px]"
                    title={`Load ${c.loser} first so its version is used`}
                    onClick={() => {
                      if (
                        window.confirm(`Make “${c.loser}” win over “${c.winner}”? You can undo it.`)
                      )
                        change(
                          window.arc.mods.setOrder({
                            kind: 'prefer',
                            archive: c.loser,
                            over: c.winner,
                          }),
                        );
                    }}
                  >
                    Make it win
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}

/** Vortex: what Alton changed in it (saved mods off, conflicts settled), and Sync now. */
function VortexPanel() {
  const [v, setV] = useState<VortexSyncState | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const load = (): void => {
    void window.arc.mods.vortexState().then(setV);
  };
  useEffect(load, []);
  return (
    <Panel
      code="MOD.09"
      title="Vortex"
      className="shrink-0"
      bodyClassName="space-y-1.5 text-[12px]"
    >
      <p className="text-text-muted">
        Alton keeps Vortex in step by itself whenever Vortex is closed: saved mods are switched off
        in Vortex (no more “external changes”), file conflicts get a winner (patches, then the newer
        mod), and Vortex installs and deploys updates by itself. While updating, Alton presses
        Continue on “already installed” (Replace).
      </p>
      {v && (
        <p>
          {v.vortexRunning ? 'Vortex is open' : 'Vortex is closed'}
          {v.waiting
            ? ` · ${v.waiting} change${v.waiting === 1 ? '' : 's'} waiting`
            : ' · nothing waiting'}
        </p>
      )}
      {v?.lastRun && (
        <p className={v.lastRun.ok ? 'text-ok' : 'text-alert'}>
          {new Date(v.lastRun.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}:{' '}
          {v.lastRun.message}
        </p>
      )}
      <button
        type="button"
        className="hud-button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void window.arc.mods
            .vortexSync()
            .then((r) => setMsg(r.message))
            .finally(() => {
              setBusy(false);
              load();
            });
        }}
      >
        {busy ? 'Updating Vortex…' : 'Sync now'}
      </button>
      {msg && <p className="text-accent">{msg}</p>}
      {!!v?.rulesAdded.length && (
        <details>
          <summary className="cursor-pointer text-text-muted">
            {v.rulesAdded.length} conflict rule{v.rulesAdded.length === 1 ? '' : 's'} added
          </summary>
          <ul className="micro-label normal-case">
            {v.rulesAdded.map((r) => (
              <li key={`${r.winner}|${r.loser}`}>
                {r.reason} → wins over {r.loser}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  );
}

/** Outdated mods: ones with evidence they don't work on this game version; remove / put back. */
function OutdatedPanel() {
  const [r, setR] = useState<OutdatedReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState('');
  const load = (): void => {
    setBusy(true);
    void window.arc.mods
      .outdated()
      .then((x) => {
        setR(x);
        // Tick them all only when the list is small enough to be believable.
        setPick(new Set(x.mods.length <= 12 && !x.warning ? x.mods.map((m) => m.folder) : []));
      })
      .finally(() => setBusy(false));
  };
  const run = (p: Promise<{ ok: boolean; message: string }>): void => {
    setBusy(true);
    void p.then((x) => {
      setMsg(x.message);
      load();
    });
  };
  const toggle = (f: string): void =>
    setPick((s) => {
      const n = new Set(s);
      if (n.has(f)) n.delete(f);
      else n.add(f);
      return n;
    });
  return (
    <Panel
      code="MOD.07"
      title="Outdated mods"
      chip={r ? <Chip>{r.mods.length} found</Chip> : undefined}
      className="max-h-[45%] shrink-0"
      bodyClassName="flex flex-col gap-2 overflow-y-auto"
    >
      <p className="text-[12px] text-text-muted">
        Mods with proof they don’t work on this game version: old RED4ext plugins, broken REDmod
        scripts, script errors and changes TweakXL rejects.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="hud-button" disabled={busy} onClick={load}>
          <RefreshCw size={13} className={busy ? 'animate-spin' : ''} />
          {busy ? 'Looking…' : r ? 'Check again' : 'Find outdated mods'}
        </button>
        {!!r?.mods.length && (
          <button
            type="button"
            className="hud-button"
            disabled={busy || !pick.size}
            onClick={() => {
              if (
                window.confirm(
                  `Remove ${pick.size} mod${pick.size === 1 ? '' : 's'} from the game? Their files are kept, and you can put them back here.`,
                )
              )
                run(window.arc.mods.remove([...pick]));
            }}
          >
            Remove {pick.size === r.mods.length ? 'all' : pick.size}
          </button>
        )}
      </div>
      {msg && <p className="text-[12.5px] text-accent">{msg}</p>}
      {r?.error && <p className="text-[12.5px] text-alert">{r.error}</p>}
      {r?.warning && (
        <p className="border border-alert/50 p-2 text-[12.5px] text-alert">{r.warning}</p>
      )}
      {r && !r.error && !r.mods.length && (
        <p className="text-[12.5px] text-ok">No outdated mods found.</p>
      )}
      {!!r?.mods.length && (
        <ul className="space-y-1">
          {r.mods.map((m) => (
            <li
              key={m.folder}
              className="flex items-start gap-2 border-b border-line/30 py-1 text-[12px]"
            >
              <input
                type="checkbox"
                className="mt-0.5"
                aria-label={`Remove ${m.name}`}
                checked={pick.has(m.folder)}
                onChange={() => toggle(m.folder)}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-text-primary">{m.name}</span>
                {m.reasons.map((x) => (
                  <span key={x} className="micro-label block normal-case">
                    {x}
                  </span>
                ))}
              </span>
              {m.hasUpdate && m.modId !== null && (
                <button
                  type="button"
                  className="hud-button !px-1.5 text-[11px]"
                  title="There’s a newer version: try updating instead"
                  onClick={() => run(window.arc.mods.update(m.modId ?? 0))}
                >
                  Update instead
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!!r?.removed.length && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="micro-label flex-1">
              Saved mods ({r.removed.length}): taken out, files kept
            </span>
            <button
              type="button"
              className="hud-button !px-1.5 text-[11px]"
              onClick={() => void window.arc.mods.open('removed').then(setMsg)}
            >
              Open folder
            </button>
          </div>
          {r.removed.map((m) => (
            <div key={m.folder} className="flex items-center gap-2 text-[12px]">
              <span className="min-w-0 flex-1 truncate text-text-muted">
                {m.name} · {m.files} file{m.files === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                className="hud-button !px-1.5 text-[11px]"
                onClick={() => run(window.arc.mods.restore([m.folder]))}
              >
                Put back
              </button>
            </div>
          ))}
          {r.removed.length > 1 && (
            <button
              type="button"
              className="hud-button"
              onClick={() => run(window.arc.mods.restore(r.removed.map((m) => m.folder)))}
            >
              Put them all back
            </button>
          )}
        </div>
      )}
    </Panel>
  );
}

/** Recommended: Nexus trending / updated / new and your tracked mods, ranked for you. */
function RecommendPanel() {
  const [r, setR] = useState<RecReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const load = (fresh = false): void => {
    setBusy(true);
    void window.arc.mods
      .recommend(fresh)
      .then(setR)
      .finally(() => setBusy(false));
  };
  return (
    <Panel
      code="MOD.08"
      title="Recommended"
      chip={r?.items.length ? <Chip>{r.items.length}</Chip> : undefined}
      className="min-h-0 flex-1"
      bodyClassName="flex flex-col gap-2 overflow-y-auto"
    >
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="hud-button" disabled={busy} onClick={() => load(!!r)}>
          <RefreshCw size={13} className={busy ? 'animate-spin' : ''} />
          {busy ? 'Asking Nexus…' : r ? 'Refresh' : 'Recommend mods'}
        </button>
        {r && (
          <label className="flex items-center gap-1.5 text-[12px] text-text-muted">
            <input
              type="checkbox"
              checked={r.showAdult}
              onChange={(e) =>
                void window.arc.mods.setShowAdult(e.target.checked).then(() => load(true))
              }
            />
            Include adult mods
          </label>
        )}
      </div>
      {!r && (
        <p className="text-[12px] text-text-muted">
          Trending, freshly updated and new mods on Nexus, plus ones you track, that you don’t have
          yet. Ranked by what you mod most and whether they’re updated for your game version.
        </p>
      )}
      {msg && <p className="text-[12.5px] text-accent">{msg}</p>}
      {r?.error && <p className="text-[12.5px] text-alert">{r.error}</p>}
      {r && !r.error && !r.items.length && (
        <p className="text-[12.5px] text-text-muted">Nothing new to recommend right now.</p>
      )}
      <ul className="grid grid-cols-1 gap-2 xl:grid-cols-2">
        {r?.items.map((m) => (
          <li key={m.modId} className="flex gap-2 border border-line/40 p-1.5 text-[12px]">
            {m.thumb ? (
              <img src={m.thumb} alt="" className="h-16 w-24 shrink-0 object-cover" />
            ) : (
              <span className="h-16 w-24 shrink-0 bg-panel-raised" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-text-primary" title={m.name}>
                {m.name}
              </span>
              <span className="micro-label block normal-case">
                {[m.category, m.author && `by ${m.author}`, m.version && `v${m.version}`]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              <span className="line-clamp-2 block text-text-muted">{m.summary}</span>
              {!!m.reasons.length && (
                <span className="block text-[11px] text-accent">{m.reasons.join(' · ')}</span>
              )}
              <span className="mt-1 flex flex-wrap gap-1">
                <button
                  type="button"
                  className="hud-button !px-1.5 text-[11px]"
                  onClick={() =>
                    void window.arc.mods.install(m.modId).then((x) => setMsg(x.message))
                  }
                >
                  Install
                </button>
                <button
                  type="button"
                  className="hud-button !px-1.5 text-[11px]"
                  onClick={() => void window.arc.mods.open('page', m.modId).then(setMsg)}
                >
                  Nexus page
                </button>
                <button
                  type="button"
                  className="hud-button !px-1.5 text-[11px]"
                  onClick={() =>
                    void window.arc.mods
                      .hideRec(m.modId)
                      .then(() =>
                        setR((x) =>
                          x ? { ...x, items: x.items.filter((i) => i.modId !== m.modId) } : x,
                        ),
                      )
                  }
                >
                  Not interested
                </button>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Mods tab: Cyberpunk 2077 mods from Vortex, updates from Nexus Mods. */
export function ModsTab() {
  const [st, setSt] = useState<ModsStatus | null>(null);
  const [mods, setMods] = useState<CpMod[]>([]);
  const [q, setQ] = useState('');
  const [key, setKey] = useState('');
  const [msg, setMsg] = useState('');
  const [diag, setDiag] = useState<LaunchCheck | null>(null);
  const [diagBusy, setDiagBusy] = useState(false);
  const [fx, setFx] = useState<FixesState | null>(null);
  const [fxMsg, setFxMsg] = useState('');
  useEffect(() => {
    void window.arc.mods.fixes().then(setFx);
  }, []);
  const load = (): void => {
    void window.arc.mods.status().then(setSt);
    void window.arc.mods.list().then(setMods);
  };
  useEffect(load, []);
  // While a check or updates run (or Vortex is still installing), keep the progress fresh.
  const waiting = !!st?.jobs.some((j) => j.state !== 'installed' && j.state !== 'failed');
  const busy = !!st?.checking || !!st?.updating;
  const installedCount = st?.jobs.filter((j) => j.state === 'installed').length ?? 0;
  useEffect(() => {
    if (!busy && !waiting) return;
    const t = setInterval(() => void window.arc.mods.status().then(setSt), busy ? 1000 : 3000);
    return () => clearInterval(t);
  }, [busy, waiting]);
  // A newly installed update shows up in the Installed list too.
  useEffect(() => {
    if (installedCount) void window.arc.mods.list().then(setMods);
  }, [installedCount]);

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return words.length
      ? mods.filter((m) => words.every((w) => m.name.toLowerCase().includes(w)))
      : mods;
  }, [mods, q]);

  const check = (): void => {
    setMsg('');
    setSt((s) => (s ? { ...s, checking: { done: 0, total: 0 } } : s));
    void window.arc.mods.check().then(setSt);
    setTimeout(() => void window.arc.mods.status().then(setSt), 800);
  };
  const act = (p: Promise<{ ok: boolean; message: string } | string>): void => {
    void p.then((r) => setMsg(typeof r === 'string' ? r : r.message));
  };

  const premium = st?.account?.premium === true;
  return (
    <Columns
      left={
        <>
          <Panel code="MOD.01" title="Cyberpunk 2077" className="shrink-0">
            {!st ? (
              <p className="text-[12px] text-text-muted">Looking…</p>
            ) : (
              <div className="space-y-2 text-[12.5px]">
                <p>
                  {st.game ? '✓ Game found' : '✗ Game not found'}
                  <br />
                  {st.vortex ? `✓ Vortex: ${st.mods} mods` : '✗ Vortex’s Cyberpunk mods not found'}
                </p>
                <p className="text-text-muted">
                  In the game folder: {st.files.archives} archives, {st.files.cet} CET mods,{' '}
                  {st.files.redscript} redscript, {st.files.tweaks} tweaks, {st.files.red4ext}{' '}
                  RED4ext plugins.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className="hud-button"
                    onClick={() => act(window.arc.mods.open('game'))}
                  >
                    <FolderOpen size={13} /> Game folder
                  </button>
                  <button
                    type="button"
                    className="hud-button"
                    onClick={() => act(window.arc.mods.open('vortex'))}
                  >
                    <FolderOpen size={13} /> Vortex mods
                  </button>
                </div>
              </div>
            )}
          </Panel>
          <Panel code="MOD.02" title="Nexus Mods" className="shrink-0">
            {st?.keySet ? (
              <div className="space-y-2 text-[12.5px]">
                <p>
                  Connected{st.account?.name ? ` as ${st.account.name}` : ''}
                  {premium ? ' (Premium)' : ''}.
                </p>
                <p className="text-text-muted">
                  {premium
                    ? 'Updates go straight to Vortex, which downloads and installs them.'
                    : 'Free account: Update opens the mod’s Files page. Press “Mod manager download” and Vortex installs it.'}
                </p>
                <button
                  type="button"
                  className="hud-button"
                  onClick={() => {
                    void window.arc.mods.clearKey().then(load);
                  }}
                >
                  Remove key
                </button>
              </div>
            ) : (
              <div className="space-y-2 text-[12.5px]">
                <p className="text-text-muted">
                  To check for updates, paste your personal API key from nexusmods.com › your
                  account › API keys. It’s stored encrypted on this PC and only sent to Nexus.
                </p>
                <input
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  type="password"
                  aria-label="Nexus Mods API key"
                  placeholder="Nexus Mods API key"
                  className="h-8 w-full border border-line bg-panel-raised/80 px-2 font-mono text-[12px] focus:border-accent focus:outline-none"
                />
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    className="hud-button"
                    disabled={!key.trim()}
                    onClick={() =>
                      void window.arc.mods.setKey(key).then((r) => {
                        setMsg(r.message);
                        if (r.ok) setKey('');
                        load();
                      })
                    }
                  >
                    Save key
                  </button>
                  <button
                    type="button"
                    className="hud-button"
                    onClick={() => void window.arc.mods.openKeyPage()}
                  >
                    <ExternalLink size={13} /> Get my key
                  </button>
                </div>
              </div>
            )}
          </Panel>
          <Panel code="MOD.05" title="Crashes & won’t start" className="shrink-0">
            <div className="space-y-2 text-[12.5px]">
              <p className="text-text-muted">
                Reads the game’s mod logs from your last launches and says what’s stopping it.
              </p>
              <button
                type="button"
                className="hud-button"
                disabled={diagBusy}
                onClick={() => {
                  setDiagBusy(true);
                  void window.arc.mods
                    .diagnose()
                    .then(setDiag)
                    .finally(() => setDiagBusy(false));
                }}
              >
                {diagBusy ? 'Reading the logs…' : 'Check why it won’t start'}
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="hud-button"
                  disabled={fx?.fixing}
                  onClick={() => {
                    setFxMsg('Fixing…');
                    void window.arc.mods.autofix().then((r) => {
                      setFxMsg(r.message);
                      setFx(r.state);
                      void window.arc.mods.diagnose().then(setDiag);
                    });
                  }}
                >
                  Fix it for me
                </button>
                <label className="flex items-center gap-1.5 text-[12px]">
                  <input
                    type="checkbox"
                    checked={fx?.auto ?? true}
                    onChange={(e) => void window.arc.mods.setAutoFix(e.target.checked).then(setFx)}
                  />
                  Fix launch problems by itself
                </label>
              </div>
              <p className="text-[11.5px] text-text-muted">
                After a failed start Alton switches off the plugin that crashed it (or sends its
                update to Vortex on Premium), deploys REDmod again without broken script mods and
                puts patches ahead of the mods they patch in the load order, then tells you. Nothing
                is deleted, and each fix can be undone.
              </p>
              {fxMsg && <p className="text-[12.5px] text-accent">{fxMsg}</p>}
              {!!fx?.fixes.length && (
                <ul className="space-y-1">
                  {fx.fixes.map((f) => (
                    <li key={f.id} className="flex items-start gap-2 text-[12px]">
                      <span
                        className={`min-w-0 flex-1 ${f.undone ? 'text-text-muted line-through' : ''}`}
                      >
                        {new Date(f.at).toLocaleString([], {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                        : {f.note}
                      </span>
                      {!f.undone && f.action.kind !== 'update' && (
                        <button
                          type="button"
                          className="hud-button !px-1.5 text-[11px]"
                          onClick={() =>
                            void window.arc.mods.undoFix(f.id).then((r) => {
                              setFxMsg(r.message);
                              void window.arc.mods.fixes().then(setFx);
                            })
                          }
                        >
                          Undo
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {diag && (
                <div className="space-y-1.5">
                  <p className="text-text-primary">{diag.verdict}</p>
                  {diag.vortexMod && (
                    <p className="text-text-muted">
                      In Vortex it’s “{diag.vortexMod.name}”
                      {diag.vortexMod.version ? ` (version ${diag.vortexMod.version})` : ''}.
                    </p>
                  )}
                  {diag.vortexMod?.modId != null && (
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className="hud-button"
                        onClick={() =>
                          act(window.arc.mods.open('page', diag.vortexMod?.modId ?? undefined))
                        }
                      >
                        <ExternalLink size={13} /> Its Nexus page
                      </button>
                      <button
                        type="button"
                        className="hud-button"
                        onClick={() =>
                          act(window.arc.mods.open('folder', diag.vortexMod?.modId ?? undefined))
                        }
                      >
                        <FolderOpen size={13} /> Its files
                      </button>
                    </div>
                  )}
                  {diag.crash && (
                    <div className="space-y-1 text-[12px]">
                      <p className="text-text-muted">
                        Last crash: {diag.crash.recent[diag.crash.recent.length - 1]?.where}
                        {diag.crash.recent[diag.crash.recent.length - 1]?.mods.length
                          ? ` · mods on it: ${diag.crash.recent[diag.crash.recent.length - 1]?.mods.join(', ')}`
                          : ''}
                        {diag.crash.context?.quest ? ` · quest ${diag.crash.context.quest}` : ''}
                      </p>
                      {!!diag.crash.tweakErrors.count && (
                        <details>
                          <summary className="cursor-pointer text-text-muted">
                            {diag.crash.tweakErrors.count} change
                            {diag.crash.tweakErrors.count === 1 ? '' : 's'} TweakXL rejected
                          </summary>
                          <ul className="micro-label normal-case">
                            {diag.crash.tweakErrors.examples.map((e) => (
                              <li key={e}>{e}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  )}
                  {!!diag.scriptErrors.length && (
                    <pre className="max-h-28 overflow-auto whitespace-pre-wrap border border-line/50 p-1.5 font-mono text-[10.5px] text-text-muted">
                      {diag.scriptErrors.join('\n')}
                    </pre>
                  )}
                  {!!diag.runs.length && (
                    <ul className="micro-label normal-case">
                      {diag.runs
                        .slice(-5)
                        .reverse()
                        .map((r) => (
                          <li key={r.at}>
                            {new Date(r.at).toLocaleString([], {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}{' '}
                            · {r.gameVersion} ·{' '}
                            {r.outcome === 'stopped-loading'
                              ? `stopped loading ${r.stoppedOn ?? 'a plugin'}`
                              : r.outcome === 'closed'
                                ? 'ran and closed'
                                : r.outcome === 'scripts-failed'
                                  ? 'scripts failed'
                                  : 'got past the plugins'}
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </Panel>
        </>
      }
      center={
        <>
          <Panel
            code="MOD.03"
            title="Updates"
            chip={st ? <Chip>{st.updates.length} available</Chip> : undefined}
            className="min-h-0 flex-1"
            bodyClassName="flex flex-col gap-2 overflow-y-auto"
          >
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="hud-button"
                disabled={!st?.keySet || !!st?.checking}
                onClick={check}
              >
                <RefreshCw size={13} className={st?.checking ? 'animate-spin' : ''} />
                {st?.checking
                  ? st.checking.total
                    ? `Checking ${st.checking.done} of ${st.checking.total}…`
                    : 'Checking…'
                  : 'Check for updates'}
              </button>
              {!!st?.updates.length && (
                <button
                  type="button"
                  className="hud-button"
                  onClick={() => {
                    const n = st.updates.filter((u) => !u.state || u.state === 'failed').length;
                    if (
                      window.confirm(
                        premium
                          ? `Send all ${n} update${n === 1 ? '' : 's'} to Vortex to download and install? You can watch each one here.`
                          : `Open the next ${Math.min(10, n)} updates on Nexus?`,
                      )
                    )
                      act(
                        window.arc.mods.updateAll().then((r) => {
                          void window.arc.mods.status().then(setSt);
                          return r;
                        }),
                      );
                  }}
                  disabled={!!st.updating}
                >
                  <Download size={13} /> {premium ? 'Update all' : 'Open next 10'}
                </button>
              )}
              <span className="text-[11.5px] text-text-muted">
                Last checked {ago(st?.lastCheck ?? 0)}
                {st && st.dailyLeft >= 0 ? ` · ${st.dailyLeft} Nexus requests left today` : ''}
              </span>
            </div>
            {msg && <p className="text-[12.5px] text-accent">{msg}</p>}
            {st?.error && <p className="text-[12.5px] text-alert">{st.error}</p>}
            {st && (st.updating || st.jobs.length > 0) && (
              <UpdateProgress st={st} premium={premium} />
            )}
            {!st?.keySet ? (
              <p className="text-[12.5px] text-text-muted">
                Add your Nexus Mods key to check for updates.
              </p>
            ) : !st.lastCheck ? (
              <p className="text-[12.5px] text-text-muted">
                Press Check for updates. The first check asks about every mod and takes about a
                minute; after that only mods that changed are checked.
              </p>
            ) : !st.updates.length ? (
              <p className="text-[12.5px] text-text-muted">Everything is up to date.</p>
            ) : (
              <ul className="space-y-1">
                {st.updates.map((u) => (
                  <li
                    key={u.modId}
                    className="flex items-center gap-2 border-b border-line/30 py-1.5 text-[12.5px]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-text-primary">{u.name}</span>
                      <span className="micro-label block normal-case">
                        {u.installed || '?'} → {u.latest || 'newer'} · updated {ago(u.updatedAt)}
                      </span>
                      {u.state && (
                        <span
                          className={`block text-[11.5px] ${u.state === 'failed' ? 'text-alert' : u.state === 'installed' ? 'text-ok' : 'text-accent'}`}
                        >
                          {STATE_LABEL[u.state]}
                          {u.state === 'downloading' && u.progress != null ? ` ${u.progress}%` : ''}
                          {u.state === 'failed' && u.error ? `: ${u.error}` : ''}
                        </span>
                      )}
                    </span>
                    {(!u.state || u.state === 'failed' || u.state === 'opened') && (
                      <button
                        type="button"
                        className="hud-button"
                        onClick={() =>
                          act(
                            window.arc.mods.update(u.modId).then((r) => {
                              void window.arc.mods.status().then(setSt);
                              return r;
                            }),
                          )
                        }
                      >
                        <Download size={13} /> {u.state === 'failed' ? 'Retry' : 'Update'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="hud-button"
                      aria-label={`Open ${u.name} on Nexus`}
                      onClick={() => act(window.arc.mods.open('page', u.modId))}
                    >
                      <ExternalLink size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <RecommendPanel />
          <LoadOrderPanel />
        </>
      }
      right={
        <>
          <VortexPanel />
          <OutdatedPanel />
          <Panel
            code="MOD.04"
            title="Installed"
            chip={<Chip>{mods.length}</Chip>}
            className="min-h-0 flex-1"
            bodyClassName="flex flex-col gap-2 min-h-0"
          >
            <label className="flex h-8 shrink-0 items-center gap-2 border border-line bg-panel-raised/80 px-2 focus-within:border-accent">
              <Search size={13} className="text-text-muted" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Find a mod…"
                aria-label="Find a mod"
                className="min-w-0 flex-1 bg-transparent font-mono text-[12px] focus:outline-none"
              />
            </label>
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {shown.map((m) => (
                <li
                  key={m.folder}
                  className="flex items-center gap-1.5 border-b border-line/30 py-1 text-[12px]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{m.name}</span>
                    <span className="micro-label block normal-case">
                      {m.version || '—'}
                      {m.installedAt ? ` · ${new Date(m.installedAt).toLocaleDateString()}` : ''}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="hud-button !px-1.5"
                    aria-label={`Open ${m.name}'s folder`}
                    title="Open its folder"
                    onClick={() =>
                      act(
                        m.modId
                          ? window.arc.mods.open('folder', m.modId)
                          : window.arc.mods.open('vortex'),
                      )
                    }
                  >
                    <FolderOpen size={12} />
                  </button>
                  {m.modId !== null && (
                    <button
                      type="button"
                      className="hud-button !px-1.5"
                      aria-label={`Open ${m.name} on Nexus`}
                      title="Open on Nexus"
                      onClick={() => act(window.arc.mods.open('page', m.modId ?? undefined))}
                    >
                      <ExternalLink size={12} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        </>
      }
    />
  );
}
