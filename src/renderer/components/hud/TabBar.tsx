import { useEffect, useRef, type KeyboardEvent } from 'react';
import { TABS } from '@renderer/components/tabs/registry';
import { useUiStore } from '@renderer/stores/uiStore';

/** Top navigation. Arrow keys move between tabs; Ctrl/Cmd+1…7 jumps from anywhere. */
export function TabBar() {
  const { tab, setTab } = useUiStore();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = TABS[Number(e.key) - 1];
      if (t) {
        e.preventDefault();
        setTab(t.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setTab]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = TABS.findIndex((t) => t.id === tab);
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    if (!next) return;
    setTab(next.id);
    refs.current[TABS.indexOf(next)]?.focus();
  };

  return (
    <nav role="tablist" aria-label="Sections" className="no-drag flex h-full" onKeyDown={onKeyDown}>
      {TABS.map((t, i) => {
        const active = t.id === tab;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active}
            aria-controls="tab-panel"
            tabIndex={active ? 0 : -1}
            title={`${t.label} (Ctrl+${i + 1})`}
            onClick={() => setTab(t.id)}
            className={`group relative flex h-full items-center gap-2 px-2.5 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors duration-150 full:px-4 ${
              active
                ? 'bg-gradient-to-t from-accent/[0.14] to-transparent text-ice'
                : 'text-text-muted hover:bg-accent/[0.04] hover:text-accent'
            }`}
          >
            <Icon size={15} strokeWidth={1.5} className={active ? 'text-accent' : ''} />
            {/* Names for every tab only on wide screens; otherwise just the open one. */}
            <span className={active ? 'hidden hud:inline' : 'hidden full:inline'}>{t.label}</span>
            <span
              className={`absolute inset-x-3 bottom-0 h-[2px] transition-opacity duration-150 ${
                active
                  ? 'bg-accent opacity-100 shadow-glow-sm'
                  : 'bg-accent opacity-0 group-hover:opacity-40'
              }`}
            />
          </button>
        );
      })}
    </nav>
  );
}
