import { TABS } from '@renderer/components/tabs/registry';
import { fmtUptime } from '@renderer/lib/format';
import { useSystemStore } from '@renderer/stores/systemStore';
import { useConversationStore } from '@renderer/stores/conversationStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { useUiStore } from '@renderer/stores/uiStore';

export function StatusBar() {
  const tab = useUiStore((s) => s.tab);
  const { info, stats, source } = useSystemStore();
  const def = TABS.find((t) => t.id === tab);
  const latency = useConversationStore((s) => s.lastLatencyMs);
  const {
    voiceMuted: muted,
    speakReplies,
    personality,
    provider,
    model,
    localModel,
  } = useSettingsStore((s) => s.settings);
  const modelLabel =
    provider === 'mock'
      ? `local ${localModel.split(':')[0]}`.trim().replace(/^local$/, 'mock')
      : model.replace('claude-', '').replace(/-(\d)-(\d)$/, ' $1.$2');

  return (
    <footer className="relative z-10 flex h-6 shrink-0 items-center gap-4 whitespace-nowrap px-6 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
      {/* screen corner brackets */}
      <span
        className="absolute bottom-1.5 left-2 h-3 w-3 border-b border-l border-accent/70"
        aria-hidden
      />
      <span
        className="absolute bottom-1.5 right-2 h-3 w-3 border-b border-r border-accent/70"
        aria-hidden
      />

      <span>
        {def?.code} / {def?.label}
      </span>
      <span>· Uptime {stats ? fmtUptime(stats.uptime) : '—'}</span>
      <span className="hidden hud:inline">
        · Model: {modelLabel} · Latency {latency === null ? '—' : `${latency}ms`}
      </span>
      <span className="hidden wide:inline">
        · Voice: {muted ? 'muted' : speakReplies ? 'on' : 'off'} · Personality: {personality.name}
      </span>
      <span className={source === 'mock' ? 'text-amber' : 'text-ok'}>· Telemetry: {source}</span>
      <span className="ml-auto min-w-0 truncate">
        {info ? `${info.cpuModel} · ${info.cpuThreads} threads · ${info.arch}` : ''}
      </span>
    </footer>
  );
}
