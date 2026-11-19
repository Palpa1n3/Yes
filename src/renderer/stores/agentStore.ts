import { create } from 'zustand';
import { IDLE_AGENT, agentBusy, parseAgentRequest, type AgentStatus } from '@shared/agent';
import { useSettingsStore } from './settingsStore';

export const useAgentStore = create<AgentStatus>(() => ({ ...IDLE_AGENT }));

export interface AgentHooks {
  say(text: string): void;
  note(text: string, tone?: 'info' | 'error'): void;
}

/** Keep the store in step with main, and narrate starts, questions and endings. */
export function bindAgent(h: AgentHooks): () => void {
  void window.arc.agent.status().then((s) => useAgentStore.setState(s));
  return window.arc.agent.onChange((s) => {
    const prev = useAgentStore.getState();
    useAgentStore.setState(s);
    if (s.question && s.question.id !== prev.question?.id)
      h.say(s.question.kind === 'confirm' ? `Can I go ahead? ${s.question.text}` : s.question.text);
    if (s.state === prev.state && s.startedAt === prev.startedAt) return;
    if (s.state === 'running' && !agentBusy(prev))
      h.note(
        `Agent Mode started: ${s.task}. I'm using your mouse and keyboard now; press Esc or say "stop" to take back control.`,
      );
    else if (s.state === 'done') h.say(s.result);
    else if (s.state === 'stopped') h.note('Agent Mode stopped.');
    else if (s.state === 'error') h.note(`Agent Mode: ${s.result}`, 'error');
  });
}

const YES = /^(yes|yeah|yep|ok(ay)?|sure|go ahead|do it|approve[d]?|confirm(ed)?|allow( it)?)\b/i;
const NO = /^(no|nope|don'?t|stop|cancel|deny|denied|never mind)\b/i;

/** Text typed or said while Agent Mode is busy. Returns true when it was used.
 *  "stop" stops it; while it's asking, the text is the answer. */
export function agentIntercept(text: string): boolean {
  const s = useAgentStore.getState();
  if (!agentBusy(s)) return false;
  const t = text.trim().replace(/[.!]+$/, '');
  const q = s.question;
  if (q?.kind === 'confirm') {
    if (YES.test(t)) window.arc.agent.answer(q.id, true);
    else if (NO.test(t)) window.arc.agent.answer(q.id, false);
    else return false;
    return true;
  }
  if (/^(stop|cancel|abort|stop agent( mode)?|that'?s enough)$/i.test(t)) {
    window.arc.agent.stop();
    return true;
  }
  if (/^(pause|hold on|wait|hang on|pause agent( mode)?)$/i.test(t)) {
    window.arc.agent.pause(true);
    return true;
  }
  if (/^(carry on|resume|continue|go on|keep going)$/i.test(t)) {
    window.arc.agent.pause(false);
    return true;
  }
  if (q?.kind === 'ask') {
    window.arc.agent.answer(q.id, t);
    return true;
  }
  return false;
}

/** "handle this for me: …" → start Agent Mode. Returns true when it was an agent request. */
export function maybeStartAgent(text: string): boolean {
  const name = useSettingsStore
    .getState()
    .settings.assistantName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const task = parseAgentRequest(
    text.replace(new RegExp(`^(?:hey\\s+)?${name}[,!.]?\\s+`, 'i'), ''),
  );
  if (task === null) return false;
  if (!useSettingsStore.getState().settings.agentMode) return false;
  void window.arc.agent.start(task);
  return true;
}
