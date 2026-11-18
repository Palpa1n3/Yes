import { FolderOpen, Plus, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { AppEntry, FolderInfo, InstalledApp } from '@shared/types';
import { Chip } from '@renderer/components/panels/Chip';
import { Icon } from '@renderer/components/panels/Icon';
import { Panel } from '@renderer/components/panels/Panel';
import { KeyValue } from '@renderer/components/panels/Stat';
import { useAppsStore } from '@renderer/stores/appsStore';
import { useAssistantStore } from '@renderer/stores/assistantStore';
import { Columns } from './Columns';

/** Dispatches launch_app through the same pipeline as chat. */
function useLaunch(): (app: AppEntry) => void {
  const log = useAssistantStore((s) => s.logActivity);
  const note = useAppsStore((s) => s.noteLaunched);
  return (app) => {
    void window.arc.commands
      .execute({ id: crypto.randomUUID(), action: 'launch_app', target: app.id, risk: 'safe' })
      .then((r) => {
        log({ kind: 'app', label: `Launch ${app.name}: ${r.message}`, status: r.status });
        if (r.status === 'success') note(app.id);
      });
  };
}

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function AppTile({
  app,
  selected,
  onSelect,
  onLaunch,
}: {
  app: AppEntry;
  selected: boolean;
  onSelect(): void;
  onLaunch(): void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={onLaunch}
      onKeyDown={(e) => e.key === 'Enter' && e.ctrlKey && onLaunch()}
      aria-pressed={selected}
      title={`${app.name}. Double-click (or Ctrl+Enter) to launch`}
      className={`group relative flex aspect-square flex-col items-center justify-center gap-2 border transition-[border-color,box-shadow,color] duration-150 [clip-path:polygon(12px_0,100%_0,100%_calc(100%-12px),calc(100%-12px)_100%,0_100%,0_12px)] ${
        selected
          ? 'border-accent bg-accent/10 text-accent shadow-glow-sm'
          : 'border-line bg-panel-raised/50 text-text-primary hover:border-accent hover:text-accent'
      }`}
    >
      <Icon name={app.icon} size={26} />
      <span className="max-w-full truncate px-1 font-mono text-[10px] uppercase tracking-[0.12em]">
        {app.name}
      </span>
    </button>
  );
}

/** Searchable list of installed apps to add to apps.json. */
function AddPicker({ onClose }: { onClose(): void }) {
  const { apps, save } = useAppsStore();
  const [installed, setInstalled] = useState<InstalledApp[] | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    void window.arc.apps.installed().then(setInstalled);
  }, []);
  const have = new Set(apps.map((a) => (a.startMenu ?? a.name).toLowerCase()));
  const list = (installed ?? [])
    .filter(
      (a) =>
        !/uninstall|readme|help|documentation/i.test(a.name) &&
        a.name.toLowerCase().includes(q.toLowerCase()),
    )
    .slice(0, 200);

  return (
    <Panel
      code="APP.05"
      title="Add an installed app"
      chip={<Chip tone="muted">{installed ? `${installed.length} found` : 'Scanning…'}</Chip>}
      className="flex-1"
      bodyClassName="flex flex-col gap-2"
    >
      <div className="flex gap-2">
        <label className="flex h-8 flex-1 items-center gap-2 border border-line bg-panel-raised/80 px-2 focus-within:border-accent">
          <Search size={13} strokeWidth={1.5} className="text-text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search installed apps…"
            aria-label="Search installed apps"
            className="min-w-0 flex-1 bg-transparent font-mono text-[12px] focus:outline-none"
          />
        </label>
        <button type="button" aria-label="Close" className="hud-button" onClick={onClose}>
          <X size={12} strokeWidth={1.5} />
        </button>
      </div>
      {installed && installed.length === 0 && (
        <p className="text-[12px] text-text-muted">
          No installed-app list on this system. Add apps by editing apps.json (Settings › Advanced).
        </p>
      )}
      <ul className="min-h-0 flex-1 overflow-y-auto" tabIndex={0} aria-label="Installed apps">
        {list.map((a) => {
          const added = have.has(a.name.toLowerCase());
          return (
            <li
              key={a.appId}
              className="hud-row flex items-center gap-2 border-b border-line/30 py-1.5 last:border-0"
            >
              <span className="min-w-0 flex-1 truncate text-[13px]">{a.name}</span>
              <button
                type="button"
                disabled={added}
                className="hud-button"
                onClick={() =>
                  void save({
                    id: slug(a.name),
                    name: a.name,
                    startMenu: a.name,
                    intents: [a.name.toLowerCase()],
                  })
                }
              >
                {added ? (
                  'Added'
                ) : (
                  <>
                    <Plus size={11} strokeWidth={1.75} /> Add
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function Details({ app, onLaunch }: { app: AppEntry; onLaunch(): void }) {
  const { save, remove } = useAppsStore();
  const [phrase, setPhrase] = useState('');
  const [confirm, setConfirm] = useState(false);
  const how = app.path
    ? { k: 'Path', v: app.path }
    : app.startMenu
      ? { k: 'Start menu', v: app.startMenu }
      : app.uri
        ? { k: 'Link', v: app.uri }
        : null;
  return (
    <Panel
      code="APP.04"
      title={app.name}
      chip={<Chip tone="muted">apps.json</Chip>}
      className="flex-1"
      bodyClassName="flex flex-col gap-3 overflow-y-auto"
    >
      <div className="flex items-center gap-3">
        <span className="grid h-14 w-14 place-items-center border border-accent/60 text-accent shadow-glow-sm">
          <Icon name={app.icon} size={28} />
        </span>
        <button type="button" className="hud-button" onClick={onLaunch}>
          Launch
        </button>
        {confirm ? (
          <button
            type="button"
            className="hud-button !border-alert/70 !text-alert"
            onClick={() => void remove(app.id)}
          >
            Confirm remove
          </button>
        ) : (
          <button
            type="button"
            className="hud-button"
            onClick={() => setConfirm(true)}
            aria-label={`Remove ${app.name}`}
          >
            <Trash2 size={12} strokeWidth={1.5} />
          </button>
        )}
      </div>
      <div>
        <KeyValue k="ID" v={app.id} />
        {how && <KeyValue k={how.k} v={<span title={how.v}>{how.v}</span>} />}
        {app.uri && how?.k !== 'Link' && <KeyValue k="Fallback link" v={app.uri} />}
      </div>
      <div>
        <div className="micro-label mb-1.5">Responds to</div>
        <ul className="flex flex-wrap gap-1.5">
          {app.intents.map((i) => (
            <li
              key={i}
              className="flex items-center gap-1 border border-line/70 px-1.5 py-0.5 font-mono text-[11px] text-accent"
            >
              “{i}”
              <button
                type="button"
                aria-label={`Remove phrase ${i}`}
                className="text-text-muted hover:text-alert"
                onClick={() => void save({ ...app, intents: app.intents.filter((x) => x !== i) })}
              >
                <X size={10} strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-2 flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (phrase.trim()) void save({ ...app, intents: [...app.intents, phrase.trim()] });
            setPhrase('');
          }}
        >
          <input
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder="Add a phrase, e.g. “play music”"
            aria-label="New phrase"
            className="h-7 min-w-0 flex-1 border border-line bg-panel-raised/80 px-2 font-mono text-[11px] focus:border-accent focus:outline-none"
          />
          <button type="submit" className="hud-button">
            Add
          </button>
        </form>
        <p className="mt-2 text-[11px] text-text-muted">
          Say “open {app.intents[0] ?? app.name.toLowerCase()}” in the console to launch it.
        </p>
      </div>
    </Panel>
  );
}

export function AppsTab() {
  const { apps, loaded, recent, load } = useAppsStore();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [folders, setFolders] = useState<FolderInfo[]>([]);
  const launch = useLaunch();

  useEffect(() => {
    void load();
    void window.arc.apps.folders().then(setFolders);
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? apps.filter((a) => a.name.toLowerCase().includes(q) || a.intents.some((i) => i.includes(q)))
      : apps;
  }, [apps, query]);
  const selected = apps.find((a) => a.id === selectedId) ?? apps[0];

  return (
    <Columns
      left={
        <>
          <Panel
            code="DIR.01"
            title="Folders"
            className="flex-1"
            bodyClassName="!py-1 overflow-y-auto"
          >
            <ul>
              {folders.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    disabled={!f.exists}
                    onClick={() => window.arc.apps.openFolder(f.id)}
                    className="hud-row flex w-full items-center gap-3 border-b border-line/30 py-2 text-left disabled:opacity-40"
                    title={`Open ${f.path}`}
                  >
                    <FolderOpen size={16} strokeWidth={1.5} className="shrink-0 text-accent" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-text-primary">{f.name}</span>
                      <span className="micro-label block truncate normal-case">{f.path}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel code="RCT.02" title="Recently used" className="shrink-0">
            {recent.length === 0 ? (
              <p className="text-[12px] text-text-muted">
                Apps you launch this session appear here.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {recent.slice(0, 5).map((id, i) => {
                  const a = apps.find((x) => x.id === id);
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        className="hud-row flex w-full items-center gap-3 text-left text-[13px]"
                        onClick={() => a && launch(a)}
                        disabled={!a}
                      >
                        <span className="numeric w-4 text-[11px] text-text-muted">{i + 1}</span>
                        <span className="text-accent">
                          <Icon name={a?.icon} size={15} />
                        </span>
                        <span className="flex-1 truncate">{a?.name ?? id}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </>
      }
      center={
        <Panel
          code="APP.03"
          title="Quick launch"
          chip={<Chip>{apps.length} in apps.json</Chip>}
          className="flex-1"
          bodyClassName="flex flex-col gap-3"
        >
          <label className="flex h-9 shrink-0 items-center gap-2 border border-line bg-panel-raised/80 px-3 transition-[border-color,box-shadow] focus-within:border-accent focus-within:shadow-glow-sm">
            <Search size={14} strokeWidth={1.5} className="text-text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by name or phrase (“play music”)…"
              aria-label="Filter apps"
              className="min-w-0 flex-1 bg-transparent font-mono text-[12px] focus:outline-none"
            />
          </label>
          <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-4 gap-3 overflow-y-auto p-0.5">
            {filtered.map((a) => (
              <AppTile
                key={a.id}
                app={a}
                selected={a.id === selected?.id && !adding}
                onSelect={() => {
                  setSelectedId(a.id);
                  setAdding(false);
                }}
                onLaunch={() => launch(a)}
              />
            ))}
            {!query && (
              <button
                type="button"
                onClick={() => setAdding(true)}
                aria-pressed={adding}
                className={`flex aspect-square flex-col items-center justify-center gap-2 border border-dashed transition-colors ${adding ? 'border-accent text-accent' : 'border-line text-text-muted hover:border-accent hover:text-accent'}`}
              >
                <Plus size={24} strokeWidth={1.5} />
                <span className="font-mono text-[10px] uppercase tracking-[0.12em]">Add app</span>
              </button>
            )}
            {loaded && filtered.length === 0 && query && (
              <p className="col-span-4 text-[13px] text-text-muted">No app matches “{query}”.</p>
            )}
          </div>
        </Panel>
      }
      right={
        adding ? (
          <AddPicker onClose={() => setAdding(false)} />
        ) : selected ? (
          <Details app={selected} onLaunch={() => launch(selected)} />
        ) : null
      }
    />
  );
}
