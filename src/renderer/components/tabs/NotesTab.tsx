import { Brain, Check, ListChecks, Pencil, Plus, StickyNote, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Chip } from '@renderer/components/panels/Chip';
import { Panel } from '@renderer/components/panels/Panel';
import { useNotesStore } from '@renderer/stores/notesStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { Columns } from './Columns';

const field =
  'h-8 min-w-0 flex-1 border border-line bg-panel-raised/80 px-2 text-[12px] text-text-primary placeholder:text-text-muted/70 focus:border-accent focus:outline-none';

function AddForm({
  placeholder,
  label,
  onAdd,
  className = '',
}: {
  placeholder: string;
  label: string;
  onAdd(text: string): void;
  className?: string;
}) {
  const [v, setV] = useState('');
  return (
    <form
      className={`flex gap-1.5 ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.trim()) return;
        onAdd(v.trim());
        setV('');
      }}
    >
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className={field}
        maxLength={300}
      />
      <button type="submit" className="hud-button" aria-label={label} disabled={!v.trim()}>
        <Plus size={12} strokeWidth={1.5} />
      </button>
    </form>
  );
}

export function NotesTab() {
  const { lists, notes, memories, apply } = useNotesStore();
  const name = useSettingsStore((s) => s.settings.assistantName);
  const [selected, setSelected] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState('');
  const list = lists.find((l) => l.id === selected) ?? lists[0];

  useEffect(() => {
    if (!selected && lists[0]) setSelected(lists[0].id);
    if (selected && !lists.some((l) => l.id === selected)) setSelected(lists[0]?.id ?? null);
  }, [lists, selected]);

  const open = list?.items.filter((i) => !i.done) ?? [];
  const done = list?.items.filter((i) => i.done) ?? [];

  return (
    <Columns
      left={
        <Panel
          code="NTS.01"
          title="Lists"
          chip={<Chip tone="muted">{lists.length}</Chip>}
          className="flex-1"
          bodyClassName="flex flex-col gap-2 !py-2 overflow-y-auto"
        >
          <ul className="space-y-1.5" aria-label="Lists">
            {lists.map((l) => {
              const active = l.id === list?.id;
              const left = l.items.filter((i) => !i.done).length;
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelected(l.id)}
                    className={`flex w-full items-center gap-2 border px-3 py-2 text-left text-[13px] ${active ? 'border-accent bg-accent/[0.07] text-ice' : 'border-line/60 hover:border-accent'}`}
                  >
                    <ListChecks size={14} className={active ? 'text-accent' : 'text-text-muted'} />
                    <span className="min-w-0 flex-1 truncate">{l.name}</span>
                    <span className="numeric text-[11px] text-text-muted">{left}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {!lists.length && (
            <p className="text-[12px] text-text-muted">
              No lists yet. Make one below, or say “add milk to my shopping list”.
            </p>
          )}
          <AddForm
            placeholder="New list name"
            label="Create list"
            onAdd={(n) => void apply({ op: 'addItems', list: n, items: [] })}
          />
        </Panel>
      }
      center={
        <Panel
          code="NTS.02"
          title={list ? list.name : 'List'}
          chip={
            list ? (
              <Chip tone={open.length ? 'accent' : 'muted'}>{open.length} to do</Chip>
            ) : undefined
          }
          className="flex-1"
          bodyClassName="flex min-h-0 flex-col gap-3"
        >
          {!list ? (
            <p className="text-[13px] text-text-muted">Create a list on the left to get started.</p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                {renaming ? (
                  <form
                    className="flex flex-1 gap-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void apply({ op: 'renameList', listId: list.id, name: title });
                      setRenaming(false);
                    }}
                  >
                    <input
                      autoFocus
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      aria-label="List name"
                      className={field}
                      maxLength={40}
                    />
                    <button type="submit" className="hud-button">
                      Save
                    </button>
                  </form>
                ) : (
                  <AddForm
                    placeholder={`Add to ${list.name} (commas for several)`}
                    label="Add item"
                    className="flex-1"
                    onAdd={(text) =>
                      void apply({ op: 'addItems', list: list.id, items: text.split(/\s*,\s*/) })
                    }
                  />
                )}
                {!renaming && (
                  <button
                    type="button"
                    className="hud-button"
                    aria-label="Rename list"
                    title="Rename list"
                    onClick={() => {
                      setTitle(list.name);
                      setRenaming(true);
                    }}
                  >
                    <Pencil size={12} />
                  </button>
                )}
              </div>
              <ul
                className="min-h-0 flex-1 space-y-1 overflow-y-auto"
                aria-label={`${list.name} items`}
              >
                {[...open, ...done].map((i) => (
                  <li
                    key={i.id}
                    className="hud-row group flex items-center gap-2 border-b border-line/30 py-1.5 text-[13px]"
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={i.done}
                      aria-label={i.text}
                      onClick={() => void apply({ op: 'toggle', listId: list.id, itemId: i.id })}
                      className={`grid h-4 w-4 shrink-0 place-items-center border ${i.done ? 'border-ok bg-ok/20 text-ok' : 'border-line hover:border-accent'}`}
                    >
                      {i.done && <Check size={11} />}
                    </button>
                    <span
                      className={`min-w-0 flex-1 ${i.done ? 'text-text-muted line-through' : 'text-text-primary'}`}
                    >
                      {i.text}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${i.text}`}
                      onClick={() =>
                        void apply({ op: 'removeItem', listId: list.id, itemId: i.id })
                      }
                      className="text-text-muted opacity-0 hover:text-alert focus:opacity-100 group-hover:opacity-100"
                    >
                      <X size={13} />
                    </button>
                  </li>
                ))}
                {!list.items.length && (
                  <li className="text-[12px] text-text-muted">Empty. Add something above.</li>
                )}
              </ul>
              <div className="flex gap-2 border-t border-line/40 pt-2">
                <button
                  type="button"
                  className="hud-button"
                  disabled={!done.length}
                  onClick={() => void apply({ op: 'clearDone', listId: list.id })}
                >
                  <Check size={12} /> Clear ticked ({done.length})
                </button>
                <button
                  type="button"
                  className="hud-button ml-auto hover:!text-alert"
                  onClick={() => void apply({ op: 'removeList', listId: list.id })}
                >
                  <Trash2 size={12} /> Delete list
                </button>
              </div>
            </>
          )}
        </Panel>
      }
      right={
        <>
          <Panel
            code="NTS.03"
            title="Notes"
            chip={<Chip tone="muted">{notes.length}</Chip>}
            className="min-h-[200px] flex-1"
            bodyClassName="flex min-h-0 flex-col gap-2 !py-2"
          >
            <AddForm
              placeholder="Quick note"
              label="Add note"
              onAdd={(text) => void apply({ op: 'addNote', text })}
            />
            <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto" aria-label="Notes">
              {notes.map((n) => (
                <li
                  key={n.id}
                  className="group flex gap-2 border border-line/40 bg-panel-raised/40 px-2 py-1.5 text-[12px]"
                >
                  <StickyNote size={12} className="mt-0.5 shrink-0 text-accent/70" />
                  <span className="min-w-0 flex-1 select-text whitespace-pre-wrap text-text-primary">
                    {n.text}
                    <span className="block font-mono text-[10px] text-text-muted">
                      {new Date(n.createdAt).toLocaleString([], {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label="Delete note"
                    onClick={() => void apply({ op: 'removeNote', id: n.id })}
                    className="self-start text-text-muted opacity-0 hover:text-alert focus:opacity-100 group-hover:opacity-100"
                  >
                    <X size={12} />
                  </button>
                </li>
              ))}
              {!notes.length && (
                <li className="text-[12px] text-text-muted">
                  Say “take a note: …” or type one above.
                </li>
              )}
            </ul>
          </Panel>
          <Panel
            code="NTS.04"
            title={`${name} remembers`}
            chip={<Chip tone="muted">{memories.length}</Chip>}
            className="min-h-[200px] flex-1"
            bodyClassName="flex min-h-0 flex-col gap-2 !py-2"
          >
            <AddForm
              placeholder="e.g. I take my coffee black"
              label="Add memory"
              onAdd={(text) => void apply({ op: 'remember', text })}
            />
            <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto" aria-label="Memories">
              {memories.map((m) => (
                <li key={m.id} className="group flex items-start gap-2 text-[12px]">
                  <Brain size={12} className="mt-0.5 shrink-0 text-accent/70" />
                  <span className="min-w-0 flex-1 text-text-primary">{m.text}</span>
                  <button
                    type="button"
                    aria-label={`Forget: ${m.text}`}
                    onClick={() => void apply({ op: 'forget', id: m.id })}
                    className="text-text-muted opacity-0 hover:text-alert focus:opacity-100 group-hover:opacity-100"
                  >
                    <X size={12} />
                  </button>
                </li>
              ))}
              {!memories.length && (
                <li className="text-[12px] text-text-muted">
                  Say “remember that …”. {name} uses these in every chat; they’re stored on this PC
                  and sent to Claude with your messages.
                </li>
              )}
            </ul>
          </Panel>
        </>
      }
    />
  );
}
