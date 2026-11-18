import { motion } from 'framer-motion';
import {
  Download,
  FlaskConical,
  MessageSquarePlus,
  Pencil,
  Pin,
  PinOff,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { chatGroup, type ChatGroup, type ChatMeta } from '@shared/chats';
import { CommandInput } from '@renderer/components/input/CommandInput';
import { Chip } from '@renderer/components/panels/Chip';
import { panelVariants, Panel } from '@renderer/components/panels/Panel';
import { Transcript } from '@renderer/components/transcript/Transcript';
import { useChatsStore } from '@renderer/stores/chatsStore';
import { useConversationStore } from '@renderer/stores/conversationStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';

const GROUPS: ChatGroup[] = ['Pinned', 'Today', 'Yesterday', 'Previous 7 days', 'Older'];

function ChatRow({ c, active }: { c: ChatMeta; active: boolean }) {
  const openChat = useConversationStore((s) => s.openChat);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(c.title);
  const [confirm, setConfirm] = useState(false);

  if (editing)
    return (
      <form
        className="px-1 py-0.5"
        onSubmit={(e) => {
          e.preventDefault();
          void window.arc.chats.rename(c.id, title).then((s) => useChatsStore.setState(s));
          setEditing(false);
        }}
      >
        <input
          autoFocus
          value={title}
          maxLength={80}
          aria-label="Chat name"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
          className="h-7 w-full border border-accent bg-panel-raised px-2 text-[12px] text-text-primary focus:outline-none"
        />
      </form>
    );

  return (
    <div
      className={`group flex items-center gap-1 border-l-2 pr-1 ${active ? 'border-accent bg-accent/[0.08]' : 'border-transparent hover:bg-panel-raised/60'}`}
    >
      <button
        type="button"
        onClick={() => void openChat(c.id)}
        aria-current={active ? 'true' : undefined}
        title={c.title}
        className={`flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left text-[12px] ${active ? 'text-ice' : 'text-text-primary/85'}`}
      >
        {c.research && (
          <FlaskConical size={11} className="shrink-0 text-accent" aria-label="Research" />
        )}
        <span className="truncate">{c.title}</span>
      </button>
      {confirm ? (
        <span className="flex items-center gap-1">
          <button
            type="button"
            className="font-mono text-[10px] uppercase text-alert hover:underline"
            onClick={() =>
              void window.arc.chats.remove(c.id).then(async (s) => {
                useChatsStore.setState(s);
                if (active) await useConversationStore.getState().openChat(s.activeId);
              })
            }
          >
            Delete
          </button>
          <button
            type="button"
            aria-label="Keep"
            onClick={() => setConfirm(false)}
            className="text-text-muted hover:text-accent"
          >
            <X size={12} />
          </button>
        </span>
      ) : (
        <span className="flex opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            aria-label={c.pinned ? 'Unpin' : 'Pin'}
            title={c.pinned ? 'Unpin' : 'Pin'}
            onClick={() =>
              void window.arc.chats
                .setPinned(c.id, !c.pinned)
                .then((s) => useChatsStore.setState(s))
            }
            className="p-1 text-text-muted hover:text-accent"
          >
            {c.pinned ? <PinOff size={12} /> : <Pin size={12} />}
          </button>
          <button
            type="button"
            aria-label="Rename"
            title="Rename"
            onClick={() => {
              setTitle(c.title);
              setEditing(true);
            }}
            className="p-1 text-text-muted hover:text-accent"
          >
            <Pencil size={12} />
          </button>
          <button
            type="button"
            aria-label="Delete chat"
            title="Delete"
            onClick={() => setConfirm(true)}
            className="p-1 text-text-muted hover:text-alert"
          >
            <Trash2 size={12} />
          </button>
        </span>
      )}
    </div>
  );
}

function Sidebar() {
  const { chats, activeId } = useChatsStore();
  const newChat = useConversationStore((s) => s.newChat);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<string[] | null>(null);
  const now = Date.now();

  // Search titles and message text (in main), lightly debounced.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setMatches(null);
      return;
    }
    const t = setTimeout(() => void window.arc.chats.search(q).then(setMatches), 200);
    return () => clearTimeout(t);
  }, [query, chats]);

  const shown = matches ? chats.filter((c) => matches.includes(c.id)) : chats;
  const groups = useMemo(
    () =>
      GROUPS.map((g) => ({ g, items: shown.filter((c) => chatGroup(c, now) === g) })).filter(
        (x) => x.items.length,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown],
  );

  return (
    <Panel
      code="CHT.01"
      title="Chats"
      chip={<Chip tone="muted">{chats.length}</Chip>}
      className="w-72 shrink-0"
      bodyClassName="flex min-h-0 flex-col gap-2 !px-2 !py-2"
    >
      <div className="flex gap-1.5">
        <button
          type="button"
          className="hud-button flex-1 justify-center"
          onClick={() => void newChat(false)}
        >
          <MessageSquarePlus size={12} strokeWidth={1.5} /> New chat
        </button>
        <button
          type="button"
          className="hud-button"
          title="New chat in research mode (searches the web)"
          onClick={() => void newChat(true)}
        >
          <FlaskConical size={12} strokeWidth={1.5} /> Research
        </button>
      </div>
      <label className="relative flex items-center">
        <Search size={12} className="pointer-events-none absolute left-2 text-text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search chats"
          aria-label="Search chats"
          spellCheck={false}
          className="h-7 w-full border border-line bg-panel-raised/80 pl-7 pr-2 text-[12px] text-text-primary placeholder:text-text-muted/70 focus:border-accent focus:outline-none"
        />
      </label>
      <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto" aria-label="Saved chats">
        {groups.map(({ g, items }) => (
          <div key={g}>
            <div className="micro-label px-2 pb-0.5">{g}</div>
            {items.map((c) => (
              <ChatRow key={c.id} c={c} active={c.id === activeId} />
            ))}
          </div>
        ))}
        {matches && !shown.length && (
          <p className="px-2 text-[12px] text-text-muted">No chats match.</p>
        )}
      </nav>
    </Panel>
  );
}

export function ChatTab() {
  const { assistantName, provider } = useSettingsStore((s) => s.settings);
  const { chats, activeId } = useChatsStore();
  const chatId = useConversationStore((s) => s.chatId);
  const empty = useConversationStore((s) => !s.messages.some((m) => m.role === 'user'));
  const meta = chats.find((c) => c.id === (chatId || activeId));
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>();

  const flash = (text: string): void => {
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 4000);
  };

  return (
    <motion.div
      variants={panelVariants}
      initial="hidden"
      animate="show"
      className="flex h-full min-h-0 gap-4"
    >
      <Sidebar />
      <Panel
        code="CHT.02"
        title={meta?.title ?? 'Chat'}
        chip={
          meta && (
            <span className="flex items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={meta.research}
                onClick={() =>
                  void window.arc.chats
                    .setResearch(meta.id, !meta.research)
                    .then((s) => useChatsStore.setState(s))
                }
                title="Research mode: searches the web, uses a smarter model and writes fuller answers with sources"
                className={`flex h-6 items-center gap-1.5 border px-2 font-mono text-[10px] uppercase tracking-[0.12em] ${meta.research ? 'border-accent bg-accent/15 text-accent' : 'border-line text-text-muted hover:text-accent'}`}
              >
                <FlaskConical size={11} /> Research {meta.research ? 'on' : 'off'}
              </button>
              <button
                type="button"
                aria-label="Export chat"
                title="Save this chat as a file"
                onClick={() =>
                  void window.arc.chats.exportMd(meta.id).then((r) => flash(r.message))
                }
                className="flex h-6 items-center gap-1 border border-line px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted hover:text-accent"
              >
                <Download size={11} /> Export
              </button>
            </span>
          )
        }
        className="min-w-0 flex-1"
        bodyClassName="flex min-h-0 flex-col gap-3 !px-6 !py-3"
      >
        {notice && (
          <p className="text-[12px] text-ok" role="status">
            {notice}
          </p>
        )}
        {empty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <div className="font-display text-[22px] font-light text-ice">
              {meta?.research
                ? 'What would you like to research?'
                : `What can ${assistantName} do for you?`}
            </div>
            <p className="max-w-md text-[13px] text-text-muted">
              {meta?.research
                ? `${assistantName} will search the web, read the most useful pages and give you an organised answer with sources. Ask follow-up questions to dig deeper.`
                : 'Ask anything, or tell me to do something on your PC. Chats are saved on the left so you can come back to them.'}
            </p>
            {meta?.research && provider !== 'anthropic' && (
              <p className="max-w-md text-[12px] text-amber">
                Research needs Claude: add your API key in Settings › Advanced.
              </p>
            )}
          </div>
        ) : (
          <Transcript assistantName={assistantName} large />
        )}
        <div className="mx-auto w-full max-w-4xl">
          <CommandInput assistantName={assistantName} />
        </div>
      </Panel>
    </motion.div>
  );
}
