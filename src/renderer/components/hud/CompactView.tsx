import { Maximize2, X } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import type { AssistantState } from '@shared/types';
import { CoreDisplay } from '@renderer/components/core/CoreDisplay';
import { CommandInput } from '@renderer/components/input/CommandInput';
import { Typewriter } from '@renderer/components/transcript/Typewriter';
import { readAudioLevel, useAssistantStore } from '@renderer/stores/assistantStore';
import { describeCommand, useConversationStore } from '@renderer/stores/conversationStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { useSystemStore } from '@renderer/stores/systemStore';
import { ControlButton } from './WindowControls';

const STATE_TEXT: Record<AssistantState, string> = {
  idle: 'Ready',
  listening: 'Listening',
  thinking: 'Processing',
  speaking: 'Speaking',
  executing: 'Executing',
  error: 'Fault',
};

/** One line: ARC's latest reply (typed out), command result, or notice. */
function LastLine({ assistantName }: { assistantName: string }) {
  const messages = useConversationStore((s) => s.messages);
  const { markRevealed, approve, reject } = useConversationStore();
  const last = [...messages].reverse().find((m) => m.role !== 'user');
  const lastId = last?.id;
  const onDone = useCallback(() => lastId && markRevealed(lastId), [lastId, markRevealed]);

  // Only the latest reply is on screen here; count earlier ones as read so the
  // assistant state can settle back to idle.
  useEffect(() => {
    for (const m of messages)
      if (m.role === 'assistant' && !m.revealed && m.id !== lastId) markRevealed(m.id);
  }, [messages, lastId, markRevealed]);

  if (!last)
    return <span className="text-text-muted">Ask me anything, or type / for commands.</span>;
  switch (last.role) {
    case 'assistant':
      return (
        <span className="text-text-primary" title={last.text}>
          <span className="mr-1.5 font-mono text-accent">{assistantName} ›</span>
          <Typewriter
            id={last.id}
            text={last.text}
            streaming={last.streaming}
            revealed={last.revealed}
            onDone={onDone}
          />
        </span>
      );
    case 'command': {
      const { verb, target } = describeCommand(last.command.cmd);
      if (last.command.status === 'awaiting') {
        return (
          <span className="flex items-center gap-2">
            <span className="min-w-0 truncate">
              <span className="font-mono text-amber">▸ {verb}</span> · {target}?
            </span>
            <button
              type="button"
              className="hud-button no-drag !py-0 !text-ok"
              onClick={() => approve(last.id)}
            >
              Approve
            </button>
            <button
              type="button"
              className="hud-button no-drag !py-0"
              onClick={() => reject(last.id)}
            >
              Cancel
            </button>
          </span>
        );
      }
      const tone =
        last.command.status === 'failed'
          ? 'text-alert'
          : last.command.status === 'success'
            ? 'text-ok'
            : 'text-amber';
      return (
        <span title={last.command.result?.message}>
          <span className="font-mono text-amber">▸ {verb}</span> · {target}{' '}
          <span className={`font-mono text-[10px] uppercase ${tone}`}>{last.command.status}</span>
        </span>
      );
    }
    case 'system':
      return (
        <span className={last.tone === 'error' ? 'text-alert' : 'text-text-muted'}>
          {last.text}
        </span>
      );
    default:
      return null;
  }
}

/** The 420×120 always-on-top pill: core + one-line status + command input. */
export function CompactView() {
  const { assistantName, theme } = useSettingsStore((s) => s.settings);
  const { state, stateDetail } = useAssistantStore();
  const load = useSystemStore((s) => s.stats?.cpu.load ?? 0);

  return (
    <div className="drag relative z-10 flex h-full items-center gap-3 py-2 pl-2 pr-3">
      <div className="h-[100px] w-[100px] shrink-0">
        <CoreDisplay
          compact
          state={state}
          stateDetail={stateDetail}
          getLevel={readAudioLevel}
          themeKey={theme}
          label=""
          value={load}
          unit="%"
          sub=""
          ringText={`${assistantName} // `.repeat(4)}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex h-5 items-center gap-2">
          <span className="font-display text-[11px] font-semibold uppercase tracking-[0.3em] text-ice text-glow">
            {assistantName}
          </span>
          <span
            className={`font-mono text-[10px] uppercase tracking-[0.14em] ${state === 'executing' ? 'text-amber' : state === 'error' ? 'text-alert' : 'text-accent'}`}
          >
            · {STATE_TEXT[state]}
          </span>
          <div className="no-drag -mr-2 ml-auto flex">
            <ControlButton
              label="Expand to full HUD"
              onClick={() => window.arc.window.setCompact(false)}
            >
              <Maximize2 size={12} strokeWidth={1.5} />
            </ControlButton>
            <ControlButton label="Hide" onClick={window.arc.window.close} danger>
              <X size={14} strokeWidth={1.5} />
            </ControlButton>
          </div>
        </div>
        <div className="truncate text-[12px] leading-5">
          <LastLine assistantName={assistantName} />
        </div>
        <div className="no-drag">
          <CommandInput assistantName={assistantName} compact autoFocus />
        </div>
      </div>
    </div>
  );
}
