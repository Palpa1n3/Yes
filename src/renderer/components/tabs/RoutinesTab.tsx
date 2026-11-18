import {
  ArrowDown,
  ArrowUp,
  Check,
  CircleDashed,
  LoaderCircle,
  Play,
  Plus,
  Save,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  MAX_STEPS,
  ROUTINE_ICONS,
  STEP_KINDS,
  STEP_META,
  describeStep,
  sanitizeRoutine,
  stepProblem,
  type Routine,
  type RoutineStep,
  type StepKind,
} from '@shared/routines';
import { Chip } from '@renderer/components/panels/Chip';
import { Icon } from '@renderer/components/panels/Icon';
import { Panel } from '@renderer/components/panels/Panel';
import { useConversationStore } from '@renderer/stores/conversationStore';
import { useRoutinesStore } from '@renderer/stores/routinesStore';
import { useUiStore } from '@renderer/stores/uiStore';
import { Columns } from './Columns';

const NEW_ID = '__new__';
const blank = (): Routine => ({
  id: NEW_ID,
  name: 'New routine',
  icon: 'Zap',
  phrases: [],
  steps: [{ kind: 'say', target: 'Ready when you are.' }],
  runAtStartup: false,
});

const fieldCls =
  'h-8 min-w-0 border border-line bg-panel-raised/80 px-2 font-mono text-[12px] text-text-primary placeholder:text-text-muted/70 focus:border-accent focus:outline-none';

/** Default target when a step's kind changes. */
function defaultTarget(kind: StepKind): string | undefined {
  const opt = STEP_META[kind].options?.[0]?.value;
  if (opt) return opt;
  return { set_volume: '50', set_timer: '10', wait: '5' }[kind as string];
}

function StepRow({
  step,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  step: RoutineStep;
  index: number;
  count: number;
  onChange(s: RoutineStep): void;
  onMove(dir: -1 | 1): void;
  onRemove(): void;
}) {
  const meta = STEP_META[step.kind];
  const problem = stepProblem(step);
  return (
    <li className="relative">
      <span className="numeric absolute -left-8 top-1 grid h-6 w-6 place-items-center border border-accent/70 bg-void text-[11px] text-accent">
        {index + 1}
      </span>
      <div
        className={`flex flex-col gap-1.5 border bg-panel-raised/50 px-2.5 py-2 ${problem ? 'border-amber/60' : 'border-line/60'}`}
      >
        <div className="flex items-center gap-1.5">
          <select
            value={step.kind}
            aria-label={`Step ${index + 1} type`}
            onChange={(e) => {
              const kind = e.target.value as StepKind;
              const target = defaultTarget(kind);
              onChange({ kind, ...(target ? { target } : {}) });
            }}
            className={`${fieldCls} w-36 shrink-0 bg-panel-raised`}
          >
            {STEP_KINDS.map((k) => (
              <option key={k} value={k}>
                {STEP_META[k].label}
              </option>
            ))}
          </select>
          {meta.options ? (
            <select
              value={step.target ?? ''}
              aria-label={`Step ${index + 1} ${meta.label}`}
              onChange={(e) => onChange({ ...step, target: e.target.value })}
              className={`${fieldCls} flex-1 bg-panel-raised`}
            >
              {meta.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : meta.placeholder ? (
            <input
              value={step.target ?? ''}
              aria-label={`Step ${index + 1} ${meta.label}`}
              placeholder={meta.placeholder}
              maxLength={step.kind === 'say' ? 400 : 200}
              spellCheck={step.kind === 'say'}
              onChange={(e) => onChange({ ...step, target: e.target.value })}
              className={`${fieldCls} flex-1`}
            />
          ) : (
            <span className="flex-1 truncate text-[12px] text-text-muted">
              {describeStep(step)}
            </span>
          )}
          <span className="flex shrink-0 text-text-muted">
            <button
              type="button"
              aria-label={`Move step ${index + 1} up`}
              disabled={index === 0}
              onClick={() => onMove(-1)}
              className="p-1 hover:text-accent disabled:opacity-30"
            >
              <ArrowUp size={13} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              aria-label={`Move step ${index + 1} down`}
              disabled={index === count - 1}
              onClick={() => onMove(1)}
              className="p-1 hover:text-accent disabled:opacity-30"
            >
              <ArrowDown size={13} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              aria-label={`Remove step ${index + 1}`}
              onClick={onRemove}
              className="p-1 hover:text-alert"
            >
              <X size={13} strokeWidth={1.5} />
            </button>
          </span>
        </div>
        {step.kind === 'set_timer' && (
          <input
            value={step.label ?? ''}
            aria-label={`Step ${index + 1} timer label`}
            placeholder="Label (what to remind you about)"
            maxLength={120}
            onChange={(e) => onChange({ ...step, label: e.target.value })}
            className={`${fieldCls} ml-[9.75rem]`}
          />
        )}
        {problem && <p className="text-[11px] text-amber">{problem}</p>}
        {step.kind === 'close_app' && (
          <p className="text-[11px] text-text-muted">
            Closes politely (like clicking ×), so apps can still ask to save.
          </p>
        )}
      </div>
    </li>
  );
}

function RunLog() {
  const run = useRoutinesStore((s) => s.run);
  const routines = useRoutinesStore((s) => s.routines);
  const steps = routines.find((r) => r.id === run?.routineId)?.steps ?? [];
  return (
    <Panel
      code="RTN.03"
      title="Last run"
      chip={
        !run ? (
          <Chip tone="muted">None yet</Chip>
        ) : run.finished ? (
          <Chip tone={run.steps.some((s) => s?.status === 'failed') ? 'amber' : 'ok'}>Done</Chip>
        ) : (
          <Chip tone="accent">Running</Chip>
        )
      }
      className="flex-1"
      bodyClassName="flex flex-col gap-2 overflow-y-auto !py-2"
    >
      {!run ? (
        <p className="text-[12px] text-text-muted">
          Run a routine and each step&apos;s result shows here.
        </p>
      ) : (
        <>
          <div className="text-[13px] text-ice">{run.name}</div>
          <ol className="space-y-1.5" aria-label="Steps run">
            {run.steps.map((s, i) => (
              <li key={i} className="flex gap-2 text-[12px]">
                <span className="mt-0.5 shrink-0">
                  {!s ? (
                    <CircleDashed size={13} className="text-text-muted" />
                  ) : s.status === 'running' ? (
                    <LoaderCircle size={13} className="animate-spin text-accent" />
                  ) : s.status === 'success' ? (
                    <Check size={13} className="text-ok" />
                  ) : (
                    <X size={13} className="text-alert" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-text-primary">
                    {steps[i] ? describeStep(steps[i]) : `Step ${i + 1}`}
                  </span>
                  {s &&
                    s.status !== 'running' &&
                    s.message &&
                    !steps[i]?.kind.match(/say|briefing/) && (
                      <span
                        className={`block text-[11px] ${s.status === 'failed' ? 'text-alert' : 'text-text-muted'}`}
                      >
                        {s.message}
                      </span>
                    )}
                </span>
              </li>
            ))}
          </ol>
          {!run.finished && (
            <button
              type="button"
              className="hud-button mt-1 self-start"
              onClick={() => window.arc.routines.stop()}
            >
              <Square size={11} strokeWidth={1.5} /> Stop after this step
            </button>
          )}
        </>
      )}
    </Panel>
  );
}

function Tips() {
  return (
    <Panel code="RTN.04" title="How to use" className="shrink-0">
      <ul className="space-y-1.5 text-[12px] text-text-muted">
        <li>
          Type or say a routine&apos;s name or one of its phrases, like{' '}
          <span className="text-text-primary">“work mode”</span>. It runs instantly without using
          AI.
        </li>
        <li>Claude can run them too: “start my focus routine”.</li>
        <li>If a step fails, the rest still run, and you can see why here.</li>
        <li>
          Tick <span className="text-text-primary">Run when ARC starts</span> for a briefing every
          day.
        </li>
      </ul>
    </Panel>
  );
}

export function RoutinesTab() {
  const { routines, loaded, save, remove } = useRoutinesStore();
  const runningId = useRoutinesStore((s) => (s.run && !s.run.finished ? s.run.routineId : null));
  const perform = useConversationStore((s) => s.perform);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Routine | null>(null);
  const [phrases, setPhrases] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saved = routines.find((r) => r.id === selectedId) ?? null;
  // Pick the first routine once they load; reset the draft when the selection changes.
  useEffect(() => {
    if (selectedId === null && routines[0]) setSelectedId(routines[0].id);
  }, [routines, selectedId]);
  useEffect(() => {
    if (selectedId === NEW_ID) return;
    const r = routines.find((x) => x.id === selectedId);
    setDraft(r ? structuredClone(r) : null);
    setPhrases(r ? r.phrases.join(', ') : '');
    setError('');
    setConfirmDelete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const current = useMemo<Routine | null>(
    () =>
      draft && {
        ...draft,
        phrases: phrases
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean),
      },
    [draft, phrases],
  );
  const dirty =
    selectedId === NEW_ID ||
    (!!current &&
      !!saved &&
      JSON.stringify({ ...current, lastRun: 0 }) !== JSON.stringify({ ...saved, lastRun: 0 }));
  const problems = current?.steps.filter((s) => stepProblem(s)).length ?? 0;

  const persist = async (): Promise<string | null> => {
    if (!current) return null;
    setError('');
    if (!sanitizeRoutine(current)) {
      setError('Give the routine a name.');
      return null;
    }
    try {
      const before = new Set(routines.map((r) => r.id));
      const list = await save(current);
      const id =
        selectedId === NEW_ID ? (list.find((r) => !before.has(r.id))?.id ?? null) : selectedId;
      if (id && id !== selectedId) setSelectedId(id);
      return id;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
          : 'Could not save.',
      );
      return null;
    }
  };

  const runNow = async (): Promise<void> => {
    const id = dirty ? await persist() : selectedId;
    if (!id || id === NEW_ID) return;
    useUiStore.getState().setTab('overview');
    void perform({ action: 'run_routine', target: id });
  };

  const setStep = (i: number, s: RoutineStep): void =>
    setDraft((d) => d && { ...d, steps: d.steps.map((x, j) => (j === i ? s : x)) });

  return (
    <Columns
      left={
        <Panel
          code="RTN.01"
          title="Routines"
          chip={<Chip tone="muted">{routines.length}</Chip>}
          className="flex-1"
          bodyClassName="flex flex-col gap-2 !py-2 overflow-y-auto"
        >
          {loaded && routines.length === 0 && selectedId !== NEW_ID && (
            <p className="text-[12px] text-text-muted">No routines yet. Make your first one.</p>
          )}
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
                      <span className="flex items-center gap-2 text-[13px] text-text-primary">
                        <span className="truncate">{r.name}</span>
                        {runningId === r.id && (
                          <LoaderCircle size={12} className="shrink-0 animate-spin text-accent" />
                        )}
                      </span>
                      <span className="block truncate text-[12px] text-text-muted">
                        {r.steps.length} step{r.steps.length === 1 ? '' : 's'}
                        {r.runAtStartup ? ' · at startup' : ''}
                        {r.phrases[0] ? ` · “${r.phrases[0]}”` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className="hud-button self-start"
            disabled={selectedId === NEW_ID}
            onClick={() => {
              const b = blank();
              setSelectedId(NEW_ID);
              setDraft(b);
              setPhrases('');
              setError('');
            }}
          >
            <Plus size={12} strokeWidth={1.5} /> New routine
          </button>
        </Panel>
      }
      center={
        <Panel
          code="RTN.02"
          title={current ? `${current.name || 'Untitled'} / steps` : 'Routine'}
          chip={
            current ? (
              <Chip tone={problems ? 'amber' : 'muted'}>
                {problems
                  ? `${problems} to fix`
                  : `${current.steps.length} step${current.steps.length === 1 ? '' : 's'}`}
              </Chip>
            ) : undefined
          }
          className="flex-1"
          bodyClassName="flex min-h-0 flex-col gap-3 overflow-y-auto"
        >
          {!current ? (
            <p className="text-[13px] text-text-muted">
              Pick a routine on the left, or make a new one.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-[5.5rem_1fr] items-center gap-x-3 gap-y-2">
                <label htmlFor="rtn-name" className="micro-label">
                  Name
                </label>
                <input
                  id="rtn-name"
                  value={current.name}
                  maxLength={40}
                  onChange={(e) => setDraft((d) => d && { ...d, name: e.target.value })}
                  className={fieldCls}
                />
                <label htmlFor="rtn-phrases" className="micro-label">
                  Phrases
                </label>
                <input
                  id="rtn-phrases"
                  value={phrases}
                  placeholder="Other ways to ask, separated by commas"
                  onChange={(e) => setPhrases(e.target.value)}
                  className={fieldCls}
                />
                <span className="micro-label">Icon</span>
                <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Icon">
                  {ROUTINE_ICONS.map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      role="radio"
                      aria-checked={current.icon === ic}
                      aria-label={ic}
                      onClick={() => setDraft((d) => d && { ...d, icon: ic })}
                      className={`grid h-7 w-7 place-items-center border ${current.icon === ic ? 'border-accent bg-accent/15 text-accent' : 'border-line/60 text-text-muted hover:text-accent'}`}
                    >
                      <Icon name={ic} size={14} />
                    </button>
                  ))}
                </div>
                <span className="micro-label">Startup</span>
                <label className="flex cursor-pointer items-center gap-2 text-[12px] text-text-primary">
                  <input
                    type="checkbox"
                    checked={current.runAtStartup}
                    onChange={(e) => setDraft((d) => d && { ...d, runAtStartup: e.target.checked })}
                    className="accent-[rgb(var(--accent))]"
                  />
                  Run when ARC starts (once a day)
                </label>
              </div>

              <ol className="relative space-y-2 pl-8" aria-label="Steps">
                <span className="absolute bottom-3 left-[11px] top-3 w-px bg-line" aria-hidden />
                {current.steps.map((s, i) => (
                  <StepRow
                    key={i}
                    step={s}
                    index={i}
                    count={current.steps.length}
                    onChange={(n) => setStep(i, n)}
                    onMove={(dir) =>
                      setDraft((d) => {
                        if (!d) return d;
                        const steps = [...d.steps];
                        steps.splice(i + dir, 0, ...steps.splice(i, 1));
                        return { ...d, steps };
                      })
                    }
                    onRemove={() =>
                      setDraft((d) => d && { ...d, steps: d.steps.filter((_, j) => j !== i) })
                    }
                  />
                ))}
              </ol>
              <button
                type="button"
                className="hud-button self-start"
                disabled={current.steps.length >= MAX_STEPS}
                onClick={() =>
                  setDraft(
                    (d) => d && { ...d, steps: [...d.steps, { kind: 'launch_app', target: '' }] },
                  )
                }
              >
                <Plus size={12} strokeWidth={1.5} /> Add step
              </button>

              <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line/40 pt-3">
                <button
                  type="button"
                  className="hud-button px-4 py-2"
                  disabled={current.steps.length === 0 || !!runningId}
                  onClick={() => void runNow()}
                >
                  <Play size={12} strokeWidth={1.5} /> Run
                </button>
                <button
                  type="button"
                  className="hud-button px-4 py-2"
                  disabled={!dirty}
                  onClick={() => void persist()}
                >
                  <Save size={12} strokeWidth={1.5} /> {dirty ? 'Save' : 'Saved'}
                </button>
                {selectedId === NEW_ID ? (
                  <button
                    type="button"
                    className="hud-button px-4 py-2"
                    onClick={() => setSelectedId(routines[0]?.id ?? null)}
                  >
                    Discard
                  </button>
                ) : confirmDelete ? (
                  <span className="flex items-center gap-2 text-[12px]">
                    Delete “{saved?.name}”?
                    <button
                      type="button"
                      className="hud-button !text-alert"
                      onClick={() => {
                        const id = selectedId;
                        setSelectedId(routines.find((r) => r.id !== id)?.id ?? null);
                        if (id) void remove(id);
                      }}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      className="hud-button"
                      onClick={() => setConfirmDelete(false)}
                    >
                      Keep
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="hud-button ml-auto px-3 py-2 hover:!text-alert"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 size={12} strokeWidth={1.5} /> Delete
                  </button>
                )}
                {error && <span className="text-[12px] text-alert">{error}</span>}
              </div>
            </>
          )}
        </Panel>
      }
      right={
        <>
          <RunLog />
          <Tips />
        </>
      }
    />
  );
}
