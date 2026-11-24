import { useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, Search, Wrench } from 'lucide-react';
import type { McChange, McProfile, McReport } from '@shared/ipc';
import type { McProblemKind } from '@shared/mcmods';
import { Chip } from '@renderer/components/panels/Chip';
import { Panel } from '@renderer/components/panels/Panel';
import { Columns } from './Columns';

const KIND: Record<McProblemKind, string> = {
  'wrong-version': 'Wrong Minecraft version',
  missing: 'Missing required mod',
  duplicate: 'Installed twice',
  breaks: 'Doesn’t work with another mod',
  crash: 'Blamed by the last crash',
  log: 'Warning from the game log',
};

/** Minecraft tab: Lunar Client / .minecraft mods, problems, Modrinth updates and fixes. */
export function MinecraftTab() {
  const [profiles, setProfiles] = useState<McProfile[]>([]);
  const [pid, setPid] = useState('');
  const [r, setR] = useState<McReport | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [hist, setHist] = useState<McChange[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    void window.arc.minecraft.profiles().then((p) => {
      setProfiles(p);
      setPid((cur) => cur || p[0]?.id || '');
    });
    void window.arc.minecraft.history().then(setHist);
  }, []);
  useEffect(() => {
    if (!pid) return;
    setBusy('Reading your mods…');
    void window.arc.minecraft
      .scan(pid)
      .then(setR)
      .finally(() => setBusy(''));
  }, [pid]);

  const refresh = (check = false): void => {
    setBusy(check ? 'Asking Modrinth…' : 'Reading your mods…');
    void (check ? window.arc.minecraft.checkUpdates(pid) : window.arc.minecraft.scan(pid))
      .then(setR)
      .finally(() => setBusy(''));
    void window.arc.minecraft.history().then(setHist);
  };
  const act = (label: string, p: Promise<{ ok: boolean; message: string }>): void => {
    setBusy(label);
    void p.then((x) => setMsg(x.message)).finally(() => refresh(!!r?.updates.length));
  };

  const mods = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const own = (r?.mods ?? []).filter((m) => !m.library);
    return words.length
      ? own.filter((m) => words.every((w) => `${m.name} ${m.id}`.toLowerCase().includes(w)))
      : own;
  }, [r, q]);
  const profile = profiles.find((p) => p.id === pid);
  const fixable = (r?.problems ?? []).filter((p) =>
    ['wrong-version', 'missing', 'duplicate'].includes(p.kind),
  ).length;

  return (
    <Columns
      left={
        <>
          <Panel code="MC.01" title="Profiles" className="shrink-0">
            {!profiles.length ? (
              <p className="text-[12.5px] text-text-muted">
                No Minecraft profiles with mods found (Lunar Client or .minecraft).
              </p>
            ) : (
              <ul className="space-y-1">
                {profiles.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setPid(p.id)}
                      aria-pressed={p.id === pid}
                      className={`hud-row w-full border px-2 py-1.5 text-left text-[12.5px] ${p.id === pid ? 'border-accent' : 'border-line/40'}`}
                    >
                      <span className="block truncate text-text-primary">
                        {p.name}
                        {p.current ? ' · selected in Lunar' : ''}
                      </span>
                      <span className="micro-label block normal-case">
                        {p.launcher} · {p.mods} mods · Minecraft {p.gameVersion || '?'} · {p.loader}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel
            code="MC.02"
            title="Changes"
            className="min-h-0 flex-1"
            bodyClassName="overflow-y-auto"
          >
            {!hist.length ? (
              <p className="text-[12px] text-text-muted">
                Fixes and updates Alton makes show here, with Undo.
              </p>
            ) : (
              <ul className="space-y-1">
                {hist.map((c) => (
                  <li key={c.id} className="flex items-start gap-2 text-[12px]">
                    <span
                      className={`min-w-0 flex-1 ${c.undone ? 'text-text-muted line-through' : ''}`}
                    >
                      {new Date(c.at).toLocaleString([], {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                      : {c.note}
                    </span>
                    {!c.undone && (
                      <button
                        type="button"
                        className="hud-button !px-1.5 text-[11px]"
                        onClick={() => act('Undoing…', window.arc.minecraft.undo(c.id))}
                      >
                        Undo
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      }
      center={
        <Panel
          code="MC.03"
          title={profile ? `Problems · ${profile.name}` : 'Problems'}
          chip={r ? <Chip>{r.problems.length}</Chip> : undefined}
          className="flex-1"
          bodyClassName="flex flex-col gap-2 overflow-y-auto"
        >
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="hud-button"
              disabled={!pid || !!busy || !fixable}
              onClick={() => {
                if (
                  window.confirm(
                    'Fix these mods? Alton switches off duplicate copies, adds missing required mods from Modrinth and updates (or switches off) mods made for another Minecraft version. Every change can be undone.',
                  )
                )
                  act('Fixing…', window.arc.minecraft.fixAll(pid));
              }}
            >
              <Wrench size={13} /> Fix my mods{fixable ? ` (${fixable})` : ''}
            </button>
            <button
              type="button"
              className="hud-button"
              disabled={!pid || !!busy}
              onClick={() => refresh(true)}
            >
              <RefreshCw size={13} className={busy ? 'animate-spin' : ''} /> Check for updates
            </button>
            {!!r?.updates.length && (
              <button
                type="button"
                className="hud-button"
                disabled={!!busy}
                onClick={() => {
                  if (
                    window.confirm(
                      `Update ${r.updates.length} mods from Modrinth? Old versions are kept as backups.`,
                    )
                  )
                    act('Updating…', window.arc.minecraft.updateAll(pid));
                }}
              >
                <Download size={13} /> Update all ({r.updates.length})
              </button>
            )}
            {busy && <span className="text-[12px] text-text-muted">{busy}</span>}
          </div>
          <p className="text-[11.5px] text-text-muted">
            Close Minecraft before fixing: Windows won’t let Alton change mods while the game is
            open.
          </p>
          {msg && <p className="text-[12.5px] text-accent">{msg}</p>}
          {r?.error && <p className="text-[12.5px] text-alert">{r.error}</p>}
          {r?.crash && (
            <p className="border border-alert/50 p-2 text-[12.5px]">
              Last crash (
              {new Date(r.crash.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
              ): {r.crash.description || 'no description'}
              {r.crash.suspects.length ? ` · blames ${r.crash.suspects.join(', ')}` : ''}
            </p>
          )}
          {r && !r.problems.length && (
            <p className="text-[12.5px] text-ok">No problems found in this profile’s mods.</p>
          )}
          <ul className="space-y-1">
            {r?.problems.map((p, i) => (
              <li
                key={`${p.kind}${p.file}${p.needs ?? ''}${i}`}
                className="flex items-start gap-2 border-b border-line/30 py-1 text-[12px]"
              >
                <span className="min-w-0 flex-1">
                  <span className="micro-label block">{KIND[p.kind]}</span>
                  <span className="block">{p.text}</span>
                </span>
                {p.kind === 'missing' && p.needs && (
                  <button
                    type="button"
                    className="hud-button !px-1.5 text-[11px]"
                    onClick={() =>
                      act('Adding…', window.arc.minecraft.addMissing(pid, p.needs ?? ''))
                    }
                  >
                    Add it
                  </button>
                )}
                {p.file && p.kind !== 'missing' && (
                  <button
                    type="button"
                    className="hud-button !px-1.5 text-[11px]"
                    onClick={() =>
                      act('Switching off…', window.arc.minecraft.setEnabled(pid, p.file, false))
                    }
                  >
                    Switch off
                  </button>
                )}
              </li>
            ))}
          </ul>
          {!!r?.updates.length && (
            <div className="space-y-1">
              <div className="micro-label">Updates on Modrinth</div>
              {r.updates.map((u) => (
                <div key={u.file} className="flex items-center gap-2 text-[12px]">
                  <span className="min-w-0 flex-1 truncate">
                    {u.name}: {u.from} → {u.to}
                  </span>
                  <button
                    type="button"
                    className="hud-button !px-1.5 text-[11px]"
                    onClick={() => act('Updating…', window.arc.minecraft.update(pid, u.file))}
                  >
                    Update
                  </button>
                </div>
              ))}
            </div>
          )}
        </Panel>
      }
      right={
        <Panel
          code="MC.04"
          title="Mods"
          chip={<Chip>{mods.length}</Chip>}
          className="flex-1"
          bodyClassName="flex min-h-0 flex-col gap-2"
        >
          <label className="flex h-8 shrink-0 items-center gap-2 border border-line bg-panel-raised/80 px-2 focus-within:border-accent">
            <Search size={13} className="text-text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Find a mod…"
              aria-label="Find a Minecraft mod"
              className="min-w-0 flex-1 bg-transparent font-mono text-[12px] focus:outline-none"
            />
          </label>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {mods.map((m) => (
              <li
                key={m.file}
                className="flex items-center gap-2 border-b border-line/30 py-1 text-[12px]"
              >
                <span className={`min-w-0 flex-1 ${m.enabled ? '' : 'text-text-muted'}`}>
                  <span className="block truncate">{m.name}</span>
                  <span className="micro-label block normal-case">
                    {m.version || '—'}
                    {m.enabled ? '' : ' · off'}
                  </span>
                </span>
                <label className="flex items-center gap-1 text-[11px]">
                  <input
                    type="checkbox"
                    checked={m.enabled}
                    aria-label={`${m.name} on`}
                    onChange={(e) =>
                      act(
                        e.target.checked ? 'Switching on…' : 'Switching off…',
                        window.arc.minecraft.setEnabled(pid, m.file, e.target.checked),
                      )
                    }
                  />
                  On
                </label>
              </li>
            ))}
          </ul>
        </Panel>
      }
    />
  );
}
