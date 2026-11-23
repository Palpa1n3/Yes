import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, FolderOpen, RefreshCw, Search, Download } from 'lucide-react';
import type { CpMod, UpdateState } from '@shared/cpmods';
import type { LaunchCheck, ModsStatus } from '@shared/ipc';
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
  sending: 'Sending to Vortex…',
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

/** Mods tab: Cyberpunk 2077 mods from Vortex, updates from Nexus Mods. */
export function ModsTab() {
  const [st, setSt] = useState<ModsStatus | null>(null);
  const [mods, setMods] = useState<CpMod[]>([]);
  const [q, setQ] = useState('');
  const [key, setKey] = useState('');
  const [msg, setMsg] = useState('');
  const [diag, setDiag] = useState<LaunchCheck | null>(null);
  const [diagBusy, setDiagBusy] = useState(false);
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
          <Panel code="MOD.05" title="Won’t start?" className="shrink-0">
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
        <Panel
          code="MOD.03"
          title="Updates"
          chip={st ? <Chip>{st.updates.length} available</Chip> : undefined}
          className="flex-1"
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
      }
      right={
        <Panel
          code="MOD.04"
          title="Installed"
          chip={<Chip>{mods.length}</Chip>}
          className="flex-1"
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
      }
    />
  );
}
