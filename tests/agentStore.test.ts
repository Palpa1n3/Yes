import { beforeEach, describe, expect, it } from 'vitest';
import { IDLE_AGENT, SCREEN_TASK } from '@shared/agent';
import { DEFAULT_SETTINGS } from '@shared/types';
import { agentIntercept, maybeStartAgent, useAgentStore } from '@renderer/stores/agentStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { installArcMock } from './arcMock';

let arc: ReturnType<typeof installArcMock>;
beforeEach(() => {
  arc = installArcMock();
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, assistantName: 'Alton' } });
  useAgentStore.setState({ ...IDLE_AGENT });
});

describe('agent triggers', () => {
  it('starts on "handle this for me", with or without the name', () => {
    expect(maybeStartAgent('Alton, handle this for me')).toBe(true);
    expect(arc.agent.start).toHaveBeenCalledWith(SCREEN_TASK);
    expect(maybeStartAgent('alton handle this for me: tidy my desktop')).toBe(true);
    expect(arc.agent.start).toHaveBeenLastCalledWith('tidy my desktop');
    expect(maybeStartAgent('what is the weather')).toBe(false);
  });

  it('respects the setting', () => {
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, agentMode: false } });
    expect(maybeStartAgent('handle this for me')).toBe(false);
  });

  it('routes answers and stop while busy', () => {
    expect(agentIntercept('yes')).toBe(false); // idle: normal chat
    useAgentStore.setState({
      state: 'waiting',
      question: { id: 'q1', kind: 'confirm', text: 'Buy?' },
    });
    expect(agentIntercept('yes please')).toBe(true);
    expect(arc.agent.answer).toHaveBeenCalledWith('q1', true);
    expect(agentIntercept('no')).toBe(true);
    expect(arc.agent.answer).toHaveBeenLastCalledWith('q1', false);
    useAgentStore.setState({
      state: 'waiting',
      question: { id: 'q2', kind: 'ask', text: 'Which size?' },
    });
    expect(agentIntercept('Large')).toBe(true);
    expect(arc.agent.answer).toHaveBeenLastCalledWith('q2', 'Large');
    useAgentStore.setState({ state: 'running', question: null });
    expect(agentIntercept('stop')).toBe(true);
    expect(arc.agent.stop).toHaveBeenCalled();
  });
});
