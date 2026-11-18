import type { AssistantState } from '@shared/types';
import { CommandInput } from '@renderer/components/input/CommandInput';
import { Chip, type Tone } from '@renderer/components/panels/Chip';
import { Panel } from '@renderer/components/panels/Panel';
import { FlaskConical, MessageSquarePlus } from 'lucide-react';
import { useAssistantStore } from '@renderer/stores/assistantStore';
import { useChatsStore } from '@renderer/stores/chatsStore';
import { useConversationStore } from '@renderer/stores/conversationStore';
import { useUiStore } from '@renderer/stores/uiStore';
import { Transcript } from './Transcript';

const STATE_CHIP: Record<AssistantState, [Tone, string]> = {
  idle: ['accent', 'Ready'],
  listening: ['accent', 'Listening'],
  thinking: ['accent', 'Processing'],
  speaking: ['accent', 'Speaking'],
  executing: ['amber', 'Executing'],
  error: ['alert', 'Fault'],
};

export function ConsolePanel({
  assistantName,
  className = '',
}: {
  assistantName: string;
  className?: string;
}) {
  const state = useAssistantStore((s) => s.state);
  const [tone, chipLabel] = STATE_CHIP[state];
  const chat = useChatsStore((s) => s.chats.find((c) => c.id === s.activeId));
  const newChat = useConversationStore((s) => s.newChat);
  return (
    <Panel
      code="COM.01"
      title={`${assistantName} / Console`}
      chip={
        <span className="flex min-w-0 items-center gap-2">
          {chat && (
            <button
              type="button"
              onClick={() => useUiStore.getState().setTab('chat')}
              title={`${chat.title} · open in the Chat tab`}
              className="flex min-w-0 max-w-[14rem] items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted hover:text-accent"
            >
              {chat.research && <FlaskConical size={11} className="shrink-0 text-accent" />}
              <span className="truncate">{chat.title}</span>
            </button>
          )}
          <button
            type="button"
            aria-label="New chat"
            title="New chat"
            onClick={() => void newChat(false)}
            className="shrink-0 text-text-muted hover:text-accent"
          >
            <MessageSquarePlus size={13} strokeWidth={1.5} />
          </button>
          <Chip tone={tone}>{chipLabel}</Chip>
        </span>
      }
      className={className}
      bodyClassName="flex flex-col gap-2 !py-2"
    >
      <Transcript assistantName={assistantName} />
      <CommandInput assistantName={assistantName} />
    </Panel>
  );
}
