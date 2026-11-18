import type { AssistantState } from '@shared/types';
import { CommandInput } from '@renderer/components/input/CommandInput';
import { Chip, type Tone } from '@renderer/components/panels/Chip';
import { Panel } from '@renderer/components/panels/Panel';
import { useAssistantStore } from '@renderer/stores/assistantStore';
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
  return (
    <Panel
      code="COM.01"
      title={`${assistantName} / Console`}
      chip={<Chip tone={tone}>{chipLabel}</Chip>}
      className={className}
      bodyClassName="flex flex-col gap-2 !py-2"
    >
      <Transcript assistantName={assistantName} />
      <CommandInput assistantName={assistantName} />
    </Panel>
  );
}
