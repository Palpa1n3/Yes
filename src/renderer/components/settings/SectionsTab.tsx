import { TABS } from '@renderer/components/tabs/registry';
import { useUiStore } from '@renderer/stores/uiStore';

const ABOUT: Record<string, string> = {
  overview: 'Your dashboard: weather, agenda, PC health',
  chat: 'Talk to Alton and your past chats',
  notes: 'Notes, lists and memories',
  system: 'CPU, memory, temperatures',
  tasks: 'What’s running, and closing things',
  apps: 'Folders and quick launch',
  network: 'Connection, speed and devices',
  storage: 'Drives and tidying up',
  routines: 'Automations',
  mods: 'Cyberpunk 2077 mods, updates and fixes',
  minecraft: 'Minecraft mods (Lunar Client) and fixes',
};

/** Settings › Sections: every part of Alton, one tap away at any window size. */
export function SectionsTab() {
  const tab = useUiStore((s) => s.tab);
  const go = (id: (typeof TABS)[number]['id']): void => {
    useUiStore.getState().setTab(id);
    useUiStore.getState().closeSettings();
  };
  return (
    <div>
      <p className="mb-4 text-[12.5px] text-text-muted">
        Every part of Alton. Ctrl+1 to Ctrl+9 jump straight to the first nine.
      </p>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {TABS.map((t, i) => {
          const Icon = t.icon;
          const active = t.id === tab;
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => go(t.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex w-full items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left transition-colors ${
                  active
                    ? 'border-accent bg-accent/[0.08]'
                    : 'border-line/60 hover:border-accent/60 hover:bg-accent/[0.04]'
                }`}
              >
                <Icon size={18} strokeWidth={1.5} className="shrink-0 text-accent" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-text-primary">{t.label}</span>
                  <span className="block truncate text-[11px] text-text-muted">
                    {ABOUT[t.id] ?? ''}
                  </span>
                </span>
                {i < 9 && (
                  <span className="font-mono text-[10px] text-text-muted">Ctrl+{i + 1}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
