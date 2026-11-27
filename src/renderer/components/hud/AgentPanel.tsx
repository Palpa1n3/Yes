import { Bot, Check, Pause, Play, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { agentBusy, type SavedAgentTask } from '@shared/agent';
import { useAgentStore } from '@renderer/stores/agentStore';

/** Agent Mode card (bottom right): the task, progress, Stop, and its questions. */
export function AgentPanel() {
  const s = useAgentStore();
  const [answer, setAnswer] = useState('');
  const [dismissed, setDismissed] = useState(-1);
  const busy = agentBusy(s);
  // A task cut off by a restart: offer to carry on with it.
  const [cut, setCut] = useState<SavedAgentTask | null>(null);
  useEffect(() => {
    void window.arc.agent
      .interrupted()
      .then(setCut)
      .catch(() => setCut(null));
  }, []);
  if (s.state === 'idle' && cut)
    return (
      <section
        aria-label="Interrupted Agent Mode task"
        className="fixed bottom-10 right-4 z-50 w-[380px] border border-amber bg-panel/95 p-3 shadow-glow-sm backdrop-blur"
      >
        <header className="mb-2 flex items-center gap-2">
          <Bot size={14} className="text-amber" />
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-ice">
            Agent mode · interrupted
          </span>
        </header>
        <p className="text-[12.5px] text-text-primary">
          “{cut.task}” was cut off by a restart after step {cut.step}
          {cut.savedAt
            ? ` (${new Date(cut.savedAt).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })})`
            : ''}
          . Carry on? It checks the screen first and skips what's already done.
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="hud-button"
            onClick={() => {
              setCut(null);
              void window.arc.agent.resume();
            }}
          >
            <Play size={12} /> Carry on
          </button>
          <button
            type="button"
            className="hud-button"
            onClick={() => {
              setCut(null);
              void window.arc.agent.dismissInterrupted();
            }}
          >
            <X size={12} /> Dismiss
          </button>
        </div>
      </section>
    );
  if (s.state === 'idle' || (!busy && dismissed === s.startedAt)) return null;
  const q = s.question;

  return (
    <section
      aria-label="Agent Mode"
      className={`fixed bottom-10 right-4 z-50 w-[380px] border bg-panel/95 p-3 shadow-glow-sm backdrop-blur ${q ? 'border-amber' : busy ? 'border-alert/70' : 'border-line'}`}
    >
      <header className="mb-2 flex items-center gap-2">
        <Bot size={14} className={busy ? 'animate-pulse text-alert' : 'text-accent'} />
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-ice">
          Agent mode
        </span>
        <span className="font-mono text-[10px] uppercase text-text-muted">
          {s.state === 'running'
            ? `step ${s.step}/${s.maxSteps}`
            : s.state === 'waiting'
              ? 'waiting for you'
              : s.state === 'paused'
                ? 'paused'
                : s.state}
        </span>
        <span className="ml-auto" />
        {busy && !q && (
          <button
            type="button"
            onClick={() => window.arc.agent.pause(s.state !== 'paused')}
            className="flex items-center gap-1 border border-line px-2 py-0.5 font-mono text-[10px] uppercase text-text-muted hover:text-accent"
            title={
              s.state === 'paused'
                ? 'Carry on (or say “carry on”)'
                : 'Pause after this step (or say “pause”)'
            }
          >
            {s.state === 'paused' ? <Play size={10} /> : <Pause size={10} />}
            {s.state === 'paused' ? 'Resume' : 'Pause'}
          </button>
        )}
        {busy ? (
          <button
            type="button"
            onClick={() => window.arc.agent.stop()}
            className="flex items-center gap-1 border border-alert/70 px-2 py-0.5 font-mono text-[10px] uppercase text-alert hover:bg-alert/10"
            title="Stop Agent Mode (or press Esc)"
          >
            <Square size={10} /> Stop
          </button>
        ) : (
          <button
            type="button"
            aria-label="Close"
            onClick={() => setDismissed(s.startedAt)}
            className="text-text-muted hover:text-accent"
          >
            <X size={13} />
          </button>
        )}
      </header>
      <p className="mb-1 line-clamp-2 text-[12px] text-text-primary" title={s.task}>
        {s.task}
      </p>
      {!q && (
        <p className="line-clamp-3 text-[12px] text-text-muted" role="status">
          {busy ? s.last : s.result}
        </p>
      )}
      {q && (
        <div className="mt-2 space-y-2">
          <p className="text-[13px] text-amber">{q.text}</p>
          {q.kind === 'confirm' ? (
            <div className="flex gap-2">
              <button
                type="button"
                className="hud-button flex-1 justify-center"
                onClick={() => window.arc.agent.answer(q.id, true)}
              >
                <Check size={12} /> Approve
              </button>
              <button
                type="button"
                className="hud-button flex-1 justify-center !border-alert/60 !text-alert"
                onClick={() => window.arc.agent.answer(q.id, false)}
              >
                <X size={12} /> Deny
              </button>
            </div>
          ) : (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                window.arc.agent.answer(q.id, answer.trim() || 'Done');
                setAnswer('');
              }}
            >
              <input
                autoFocus
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Your answer (or just press Enter once you've done it)"
                aria-label="Answer"
                className="h-7 min-w-0 flex-1 border border-line bg-panel-raised px-2 text-[12px] text-text-primary focus:border-accent focus:outline-none"
              />
              <button type="submit" className="hud-button">
                Send
              </button>
            </form>
          )}
        </div>
      )}
      {s.log.length > 1 && (
        <ol
          className="mt-2 max-h-24 space-y-0.5 overflow-y-auto border-t border-line pt-1.5"
          aria-label="What Alton has done"
        >
          {s.log.slice(-6).map((l, i) => (
            <li
              key={`${l.at}-${i}`}
              className="truncate font-mono text-[10px] text-text-muted"
              title={l.text}
            >
              {new Date(l.at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}{' '}
              · {l.text}
            </li>
          ))}
        </ol>
      )}
      {busy && !q && (
        <p className="mt-2 font-mono text-[10px] text-text-muted">
          Press Esc anywhere, or say “stop”, to take back control.
        </p>
      )}
    </section>
  );
}
