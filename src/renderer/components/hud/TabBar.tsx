import { useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { TABS } from '@renderer/components/tabs/registry';
import { useUiStore } from '@renderer/stores/uiStore';

/** Ctrl/Cmd+1…9 jumps to a section from anywhere. */
export function useSectionShortcuts(): void {
  const setTab = useUiStore((s) => s.setTab);
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
}

/** The section you're in; opens Settings › Sections, where every part of Alton is listed
 *  (one place that fits any window size, instead of a row of tabs). */
export function SectionButton() {
  const tab = useUiStore((s) => s.tab);
  useSectionShortcuts();
  const t = TABS.find((x) => x.id === tab) ?? TABS[0];
  if (!t) return null;
  const Icon = t.icon;
  return (
    <button
      type="button"
      aria-label={`Section: ${t.label}. Open the list of sections`}
      title="All sections (Settings › Sections)"
      onClick={() => useUiStore.getState().openSettings('sections')}
      className="no-drag group flex h-full items-center gap-2 px-3 font-mono text-[11px] uppercase tracking-[0.18em] text-ice transition-colors hover:bg-accent/[0.06]"
    >
      <Icon size={15} strokeWidth={1.5} className="text-accent" />
      <span className="max-w-[160px] truncate">{t.label}</span>
      <ChevronDown
        size={13}
        className="text-text-muted transition-colors group-hover:text-accent"
      />
    </button>
  );
}
