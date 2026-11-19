import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  DEFAULT_PROMPTS,
  MAX_PROMPTS,
  PROMPT_TEXT_MAX,
  RESERVED_PROMPT_NAMES,
  promptName,
  type SavedPrompt,
} from '@shared/prompts';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { Field, Section } from './controls';

const box =
  'w-full rounded-[6px] border border-line bg-panel-raised/80 px-2 py-1.5 text-[12px] text-text-primary placeholder:text-text-muted/70 focus:border-accent focus:outline-none';

/** Settings › Smart › Saved prompts: your own slash commands. */
export function PromptsSection() {
  const { settings: s, update } = useSettingsStore();
  const prompts = s.prompts;
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');

  const save = (next: SavedPrompt[]): void => void update({ prompts: next });
  const add = (): void => {
    const n = promptName(name);
    if (!n) return setMsg('Give it a short name, like “email” or “tidy”.');
    if (RESERVED_PROMPT_NAMES.includes(n)) return setMsg(`/${n} is a built-in command.`);
    if (prompts.some((p) => p.name === n)) return setMsg(`You already have /${n}.`);
    if (!text.trim()) return setMsg('Write what the prompt should ask.');
    save([...prompts, { name: n, text: text.trim().slice(0, PROMPT_TEXT_MAX) }]);
    setName('');
    setText('');
    setMsg(`Added /${n}.`);
  };

  return (
    <Section title="Saved prompts">
      <Field
        label="Your own commands"
        hint={
          <>
            Type <b className="font-mono text-ice">/name</b> in the command line, or{' '}
            <b className="font-mono text-ice">/name some text</b>. In the prompt,{' '}
            <b className="font-mono text-ice">{'{text}'}</b> becomes the text you typed after it, or
            what you last copied. They also show on your phone after a sync.
          </>
        }
        stacked
      >
        <ul className="space-y-2">
          {prompts.map((p, i) => (
            <li key={p.name} className="flex items-start gap-2">
              <span className="mt-1.5 w-24 shrink-0 truncate font-mono text-[12px] text-accent">
                /{p.name}
              </span>
              <textarea
                aria-label={`Prompt for /${p.name}`}
                className={`${box} min-h-[2.2rem] resize-y`}
                rows={Math.min(5, Math.max(2, p.text.split('\n').length))}
                maxLength={PROMPT_TEXT_MAX}
                defaultValue={p.text}
                onBlur={(e) => {
                  const t = e.target.value.trim();
                  if (!t || t === p.text) return;
                  save(prompts.map((x, j) => (j === i ? { ...x, text: t } : x)));
                }}
              />
              <button
                type="button"
                aria-label={`Delete /${p.name}`}
                title="Delete"
                className="mt-1 text-text-muted hover:text-alert"
                onClick={() => save(prompts.filter((_, j) => j !== i))}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
          {prompts.length === 0 && (
            <li className="text-[12px] text-text-muted">No saved prompts yet.</li>
          )}
        </ul>
        {prompts.length < MAX_PROMPTS && (
          <form
            className="mt-3 flex items-start gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <input
              aria-label="New prompt name"
              placeholder="name"
              value={name}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
              className={`${box} w-24 shrink-0 font-mono`}
            />
            <textarea
              aria-label="New prompt text"
              placeholder="e.g. Turn this into a polite email to my landlord: {text}"
              value={text}
              rows={2}
              maxLength={PROMPT_TEXT_MAX}
              onChange={(e) => setText(e.target.value)}
              className={`${box} resize-y`}
            />
            <button type="submit" className="hud-button mt-0.5 shrink-0">
              <Plus size={12} /> Add
            </button>
          </form>
        )}
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            className="hud-button"
            onClick={() => {
              const have = new Set(prompts.map((p) => p.name));
              const missing = DEFAULT_PROMPTS.filter((p) => !have.has(p.name));
              save([...prompts, ...missing].slice(0, MAX_PROMPTS));
              setMsg(missing.length ? `Restored ${missing.length}.` : 'All the starters are here.');
            }}
          >
            <RotateCcw size={12} /> Restore starters
          </button>
          {msg && (
            <span className="text-[12px] text-text-muted" role="status">
              {msg}
            </span>
          )}
        </div>
      </Field>
    </Section>
  );
}
