import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useRef, type ComponentType } from 'react';
import { useReducedMotion } from '@renderer/hooks/useReducedMotion';
import { SETTINGS_TABS, useUiStore, type SettingsTab } from '@renderer/stores/uiStore';
import { AdvancedTab, AppearanceTab, GeneralTab, HotkeysTab, VoiceTab } from './OtherTabs';
import { PersonalityTab } from './PersonalityTab';

const TABS: Record<SettingsTab, { label: string; View: ComponentType }> = {
  general: { label: 'General', View: GeneralTab },
  personality: { label: 'Personality', View: PersonalityTab },
  appearance: { label: 'Appearance', View: AppearanceTab },
  voice: { label: 'Voice', View: VoiceTab },
  hotkeys: { label: 'Hotkeys', View: HotkeysTab },
  advanced: { label: 'Advanced', View: AdvancedTab },
};

/** 420px slide-over from the right. Esc or the backdrop closes it; focus stays inside. */
export function SettingsPanel() {
  const { settingsOpen, settingsTab, closeSettings, setSettingsTab } = useUiStore();
  const reduced = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<Element | null>(null);

  useEffect(() => {
    if (!settingsOpen) return;
    returnFocus.current = document.activeElement;
    requestAnimationFrame(() =>
      panelRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus(),
    );
    return () => {
      (returnFocus.current as HTMLElement | null)?.focus?.();
    };
  }, [settingsOpen]);

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeSettings();
      return;
    }
    // Keep Tab focus within the panel.
    if (e.key === 'Tab' && panelRef.current) {
      const els = [
        ...panelRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
        ),
      ];
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

  const View = TABS[settingsTab].View;
  const dur = reduced ? 0 : 0.22;

  return (
    <AnimatePresence>
      {settingsOpen && (
        <>
          <motion.div
            key="scrim"
            className="no-drag absolute inset-0 top-14 z-30 bg-void/50"
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
            className="hud-panel no-drag absolute bottom-6 right-0 top-14 z-40 flex w-[420px] max-w-full flex-col !rounded-none !border-r-0 !bg-panel/95"
            initial={{ x: 440 }}
            animate={{ x: 0 }}
            exit={{ x: 440 }}
            transition={{ duration: dur, ease: 'easeOut' }}
          >
            <div className="flex h-11 shrink-0 items-center gap-3 border-b border-line/60 px-4">
              <span className="panel-title text-accent">CFG.00</span>
              <h2 className="panel-title flex-1 text-ice">Settings</h2>
              <button
                type="button"
                aria-label="Close settings"
                onClick={closeSettings}
                className="text-text-muted transition-colors hover:text-accent"
              >
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>
            <nav
              role="tablist"
              aria-label="Settings sections"
              className="flex shrink-0 justify-between border-b border-line/60 px-2"
              onKeyDown={(e) => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                const i = SETTINGS_TABS.indexOf(settingsTab);
                const next =
                  SETTINGS_TABS[
                    (i + (e.key === 'ArrowRight' ? 1 : SETTINGS_TABS.length - 1)) %
                      SETTINGS_TABS.length
                  ];
                if (next) {
                  setSettingsTab(next);
                  requestAnimationFrame(() =>
                    panelRef.current?.querySelector<HTMLElement>(`#stab-${next}`)?.focus(),
                  );
                }
              }}
            >
              {SETTINGS_TABS.map((t) => (
                <button
                  key={t}
                  id={`stab-${t}`}
                  type="button"
                  role="tab"
                  aria-selected={settingsTab === t}
                  aria-controls="settings-body"
                  tabIndex={settingsTab === t ? 0 : -1}
                  onClick={() => setSettingsTab(t)}
                  className={`relative px-2 py-2 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors ${settingsTab === t ? 'text-ice' : 'text-text-muted hover:text-accent'}`}
                >
                  {TABS[t].label}
                  {settingsTab === t && (
                    <span className="absolute inset-x-2 bottom-0 h-[2px] bg-accent shadow-glow-sm" />
                  )}
                </button>
              ))}
            </nav>
            <div
              id="settings-body"
              role="tabpanel"
              aria-labelledby={`stab-${settingsTab}`}
              className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
            >
              <View />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
