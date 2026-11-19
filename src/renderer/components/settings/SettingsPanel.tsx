import { AnimatePresence, motion } from 'framer-motion';
import {
  Bot,
  Brain,
  Gamepad2,
  Keyboard,
  Mic,
  Palette,
  Plug,
  Search,
  Settings2,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useReducedMotion } from '@renderer/hooks/useReducedMotion';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { SETTINGS_TABS, useUiStore, type SettingsTab } from '@renderer/stores/uiStore';
import { SettingsSearch } from './controls';
import {
  AdvancedTab,
  AiTab,
  AppearanceTab,
  ConnectionsTab,
  GeneralTab,
  HotkeysTab,
  SmartTab,
  VoiceTab,
} from './OtherTabs';
import { PersonalityTab } from './PersonalityTab';
import { GamingTab } from './GamingTab';
import { PrivacyTab } from './PrivacyTab';

interface Page {
  label: string;
  blurb: string;
  Icon: LucideIcon;
  View: ComponentType;
}

const PAGES: Record<SettingsTab, Page> = {
  general: {
    label: 'General',
    blurb: 'You, weather, window and chats',
    Icon: SlidersHorizontal,
    View: GeneralTab,
  },
  ai: { label: 'AI', blurb: 'Claude, models, offline AI', Icon: Sparkles, View: AiTab },
  smart: {
    label: 'Smart features',
    blurb: 'Screen, memory, suggestions, Agent Mode',
    Icon: Brain,
    View: SmartTab,
  },
  connections: {
    label: 'Connections',
    blurb: 'Phone, calendar, email, Discord',
    Icon: Plug,
    View: ConnectionsTab,
  },
  personality: {
    label: 'Personality',
    blurb: 'How it talks and behaves',
    Icon: Bot,
    View: PersonalityTab,
  },
  appearance: {
    label: 'Appearance',
    blurb: 'Theme, dashboard, face',
    Icon: Palette,
    View: AppearanceTab,
  },
  voice: { label: 'Voice', blurb: 'Speaking, listening, wake words', Icon: Mic, View: VoiceTab },
  gaming: {
    label: 'Gaming',
    blurb: 'Gaming mode, profiles, saves',
    Icon: Gamepad2,
    View: GamingTab,
  },
  hotkeys: { label: 'Hotkeys', blurb: 'Keyboard shortcuts', Icon: Keyboard, View: HotkeysTab },
  privacy: {
    label: 'Privacy & safety',
    blurb: 'Permissions, history, backups',
    Icon: Shield,
    View: PrivacyTab,
  },
  advanced: {
    label: 'Advanced',
    blurb: 'Updates, plugins, data, debugging',
    Icon: Wrench,
    View: AdvancedTab,
  },
};

/** Settings window: a page list on the left (with search across every setting), the page on
 *  the right. Esc or the backdrop closes it; focus stays inside. Changes save as you go. */
export function SettingsPanel() {
  const { settingsOpen, settingsTab, closeSettings, setSettingsTab } = useUiStore();
  const name = useSettingsStore((s) => s.settings.assistantName);
  const reduced = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<Element | null>(null);
  const [query, setQuery] = useState('');
  const searching = query.trim().length >= 2;

  useEffect(() => {
    if (!settingsOpen) return;
    returnFocus.current = document.activeElement;
    setQuery('');
    requestAnimationFrame(() =>
      panelRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus(),
    );
    return () => {
      (returnFocus.current as HTMLElement | null)?.focus?.();
    };
  }, [settingsOpen]);

  // A new page starts at the top.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [settingsTab]);

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (query) setQuery('');
      else closeSettings();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      panelRef.current?.querySelector<HTMLInputElement>('#settings-search')?.focus();
      return;
    }
    // Keep Tab focus within the panel.
    if (e.key === 'Tab' && panelRef.current) {
      const els = [
        ...panelRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
        ),
      ].filter((el) => el.offsetParent !== null);
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  };

  const page = PAGES[settingsTab];
  const dur = reduced ? 0 : 0.2;

  return (
    <AnimatePresence>
      {settingsOpen && (
        <>
          <motion.div
            key="scrim"
            className="no-drag absolute inset-0 top-14 z-30 bg-void/70 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: dur }}
            onClick={closeSettings}
            aria-hidden
          />
          <motion.div
            key="panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
            onKeyDown={onKeyDown}
            className="hud-panel no-drag absolute inset-x-0 bottom-8 top-[72px] z-40 mx-auto flex w-[min(1100px,calc(100%-48px))] flex-col overflow-hidden !rounded-[14px] !bg-panel/97"
            initial={{ opacity: 0, y: 14, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.985 }}
            transition={{ duration: dur, ease: 'easeOut' }}
          >
            {/* Header */}
            <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line/60 bg-gradient-to-b from-panel-raised/60 to-transparent px-5">
              <Settings2 size={16} className="text-accent" strokeWidth={1.5} />
              <h2 className="font-display text-[14px] uppercase tracking-[0.24em] text-ice">
                Settings
              </h2>
              <span className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted md:inline">
                · {name} · changes save automatically
              </span>
              <label className="relative ml-auto flex w-72 items-center">
                <Search
                  size={13}
                  className="pointer-events-none absolute left-2.5 text-text-muted"
                />
                <input
                  id="settings-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search settings (Ctrl+F)"
                  aria-label="Search settings"
                  spellCheck={false}
                  className="h-8 w-full rounded-[8px] border border-line bg-panel-raised/80 pl-8 pr-7 text-[12px] text-text-primary placeholder:text-text-muted/70 focus:border-accent focus:outline-none"
                />
                {query && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setQuery('')}
                    className="absolute right-2 text-text-muted hover:text-accent"
                  >
                    <X size={12} />
                  </button>
                )}
              </label>
              <button
                type="button"
                aria-label="Close settings"
                title="Close (Esc)"
                onClick={closeSettings}
                className="rounded-[6px] p-1.5 text-text-muted transition-colors hover:bg-accent/10 hover:text-accent"
              >
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>

            <div className="flex min-h-0 flex-1">
              {/* Page list */}
              <nav
                role="tablist"
                aria-orientation="vertical"
                aria-label="Settings sections"
                className="flex w-60 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-line/60 bg-void/30 p-2"
                onKeyDown={(e) => {
                  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
                  e.preventDefault();
                  const i = SETTINGS_TABS.indexOf(settingsTab);
                  const next =
                    SETTINGS_TABS[
                      (i + (e.key === 'ArrowDown' ? 1 : SETTINGS_TABS.length - 1)) %
                        SETTINGS_TABS.length
                    ];
                  if (next) {
                    setQuery('');
                    setSettingsTab(next);
                    requestAnimationFrame(() =>
                      panelRef.current?.querySelector<HTMLElement>(`#stab-${next}`)?.focus(),
                    );
                  }
                }}
              >
                {SETTINGS_TABS.map((t) => {
                  const p = PAGES[t];
                  const active = settingsTab === t && !searching;
                  return (
                    <button
                      key={t}
                      id={`stab-${t}`}
                      type="button"
                      role="tab"
                      aria-selected={settingsTab === t}
                      aria-controls="settings-body"
                      tabIndex={settingsTab === t ? 0 : -1}
                      onClick={() => {
                        setQuery('');
                        setSettingsTab(t);
                      }}
                      className={`group relative flex items-center gap-3 rounded-[8px] px-3 py-2 text-left transition-colors ${
                        active
                          ? 'bg-gradient-to-r from-accent/[0.16] to-accent/[0.03] text-ice shadow-[inset_0_0_0_1px_rgb(var(--accent)/0.35)]'
                          : 'text-text-muted hover:bg-accent/[0.05] hover:text-text-primary'
                      }`}
                    >
                      {active && (
                        <span
                          className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-accent shadow-glow-sm"
                          aria-hidden
                        />
                      )}
                      <p.Icon
                        size={16}
                        strokeWidth={1.5}
                        className={active ? 'text-accent' : 'group-hover:text-accent'}
                      />
                      <span className="min-w-0">
                        <span className="block text-[13px] leading-tight">{p.label}</span>
                        <span className="block truncate text-[10.5px] leading-tight text-text-muted">
                          {p.blurb}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </nav>

              {/* Page (or search results across every page) */}
              <div
                id="settings-body"
                ref={bodyRef}
                role="tabpanel"
                aria-labelledby={`stab-${settingsTab}`}
                className="min-h-0 flex-1 overflow-y-auto px-7 py-5"
              >
                <div className="mx-auto max-w-[720px]">
                  {searching ? (
                    <SettingsSearch.Provider value={query}>
                      <div className="settings-results">
                        <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
                          Settings matching “{query.trim()}”
                        </p>
                        {SETTINGS_TABS.map((t) => {
                          const P = PAGES[t];
                          return (
                            <div key={t} className="settings-page mb-2" data-searching="true">
                              <button
                                type="button"
                                onClick={() => {
                                  setQuery('');
                                  setSettingsTab(t);
                                }}
                                className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-accent hover:underline"
                              >
                                <P.Icon size={13} /> {P.label}
                              </button>
                              <P.View />
                            </div>
                          );
                        })}
                        <p className="settings-empty hidden py-10 text-center text-[13px] text-text-muted">
                          No settings match. Try another word (e.g. “voice”, “calendar”, “theme”).
                        </p>
                      </div>
                    </SettingsSearch.Provider>
                  ) : (
                    <>
                      <header className="mb-5 flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-accent/40 bg-accent/10 text-accent shadow-glow-sm">
                          <page.Icon size={18} strokeWidth={1.5} />
                        </span>
                        <div>
                          <h3 className="font-display text-[18px] font-light text-ice">
                            {page.label}
                          </h3>
                          <p className="text-[12px] text-text-muted">{page.blurb}</p>
                        </div>
                      </header>
                      <page.View />
                    </>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
