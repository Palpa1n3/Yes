import { Play } from 'lucide-react';
import { useState } from 'react';
import { Chip } from '@renderer/components/panels/Chip';
import { Icon } from '@renderer/components/panels/Icon';
import { Panel } from '@renderer/components/panels/Panel';
import { routines, schedules, suggestions } from '@renderer/mocks/dashboard';
import { useAssistantStore } from '@renderer/stores/assistantStore';
import { useConversationStore } from '@renderer/stores/conversationStore';
import { useUiStore } from '@renderer/stores/uiStore';
import { Columns } from './Columns';

export function RoutinesTab() {
  const [selectedId, setSelectedId] = useState('focus');
  const [enabled, setEnabled] = useState(() => schedules.map((s) => s.enabled));
  const log = useAssistantStore((s) => s.logActivity);
  const selected = routines.find((r) => r.id === selectedId) ?? routines[0];

  const send = useConversationStore((s) => s.send);
  const setTab = useUiStore((s) => s.setTab);
  /** Suggestions are sent as messages, then we jump to the console to watch the reply. */
  const suggest = (text: string): void => {
    setTab('overview');
    void send(text);
  };
  const run = (name: string): void =>
    log({
      kind: 'rtn',
      label: `${name}: routines are a preview; running them comes in a later update`,
      status: 'pending',
    });

  return (
    <Columns
      left={
        <Panel
          code="RTN.01"
          title="Routines"
          chip={<Chip tone="muted">Preview</Chip>}
          className="flex-1"
          bodyClassName="!py-2 overflow-y-auto"
        >
          <ul className="space-y-2" aria-label="Routines">
            {routines.map((r) => {
              const active = r.id === selectedId;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedId(r.id)}
                    className={`flex w-full items-center gap-3 border px-3 py-2.5 text-left transition-[border-color,box-shadow] duration-150 ${
                      active
                        ? 'border-accent bg-accent/[0.07] shadow-glow-sm'
                        : 'border-line/60 hover:border-accent'
                    }`}
                  >
                    <span className={active ? 'text-accent' : 'text-text-muted'}>
                      <Icon name={r.icon} size={20} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] text-text-primary">{r.name}</span>
                      <span className="block truncate text-[12px] text-text-muted">
                        {r.description}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
      }
      center={
        selected && (
          <Panel
            code="RTN.02"
            title={`${selected.name} / sequence`}
            chip={<Chip tone="muted">{selected.steps.length} steps</Chip>}
            className="flex-1"
            bodyClassName="flex flex-col overflow-y-auto"
          >
            <p className="mb-4 text-[13px] text-text-primary/80">{selected.description}.</p>
            <ol className="relative flex-1 space-y-3 pl-8">
              <span className="absolute bottom-3 left-[11px] top-3 w-px bg-line" aria-hidden />
              {selected.steps.map((s, i) => (
                <li key={i} className="relative">
                  <span className="numeric absolute -left-8 top-1 grid h-6 w-6 place-items-center border border-accent/70 bg-void text-[11px] text-accent">
                    {i + 1}
                  </span>
                  <div className="border border-line/60 bg-panel-raised/50 px-3 py-2">
                    <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
                      {s.action}
                    </div>
                    <div className="text-[13px] text-text-primary">{s.target}</div>
                  </div>
                </li>
              ))}
            </ol>
            <button
              type="button"
              className="hud-button mt-4 self-start px-4 py-2"
              onClick={() => run(selected.name)}
            >
              <Play size={12} strokeWidth={1.5} /> Run {selected.name}
            </button>
          </Panel>
        )
      }
      right={
        <>
          <Panel
            code="SCH.03"
            title="Schedules"
            className="flex-1"
            bodyClassName="!py-1 overflow-y-auto"
          >
            <ul>
              {schedules.map((s, i) => (
                <li
                  key={s.label}
                  className="flex items-center gap-3 border-b border-line/30 py-2.5 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px]">{s.label}</div>
                    <div className="numeric text-[11px] text-text-muted">{s.when}</div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled[i]}
                    aria-label={`${s.label} enabled`}
                    onClick={() => setEnabled((e) => e.map((v, j) => (j === i ? !v : v)))}
                    className={`relative h-4 w-8 border transition-colors ${enabled[i] ? 'border-accent bg-accent/20' : 'border-line'}`}
                  >
                    <span
                      className={`absolute top-0.5 h-2.5 w-2.5 transition-all ${enabled[i] ? 'left-[18px] bg-accent shadow-glow-sm' : 'left-0.5 bg-text-muted'}`}
                    />
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel code="SUG.04" title="Suggested" className="shrink-0">
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="hud-button normal-case tracking-normal"
                  onClick={() => suggest(s)}
                >
                  ◇ {s}
                </button>
              ))}
            </div>
          </Panel>
        </>
      }
    />
  );
}
