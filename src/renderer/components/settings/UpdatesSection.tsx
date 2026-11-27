import { useState } from 'react';
import { RefreshCw, Undo2 } from 'lucide-react';
import { useUpdatesStore } from '@renderer/stores/updatesStore';
import { Field, Section } from './controls';

const TEXT: Record<string, string> = {
  dev: 'Running from the project folder (npm run dev). The installed app updates itself.',
  idle: 'Checks GitHub for new versions every few hours.',
  checking: 'Checking for updates…',
  none: 'Up to date.',
  downloading: 'Downloading the new version…',
  ready: 'A new version is ready. Restart to install it.',
  error: "Couldn't check for updates.",
};

export function UpdatesSection() {
  const u = useUpdatesStore();
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Section title="Updates">
      <Field
        label={`Version ${u.current}`}
        hint={`${TEXT[u.status] ?? ''}${u.status === 'downloading' && u.percent !== null ? ` ${u.percent}%` : ''}${u.error && u.status === 'error' ? ` (${u.error})` : ''}${u.checkedAt ? ` · Last checked ${new Date(u.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`}
      >
        {u.status === 'ready' ? (
          <button
            type="button"
            className="hud-button !text-ok"
            onClick={() => void window.arc.updates.install()}
          >
            Restart to update {u.version}
          </button>
        ) : (
          <button
            type="button"
            className="hud-button"
            disabled={u.status === 'dev' || u.status === 'checking' || u.status === 'downloading'}
            onClick={() => void window.arc.updates.check().then((s) => useUpdatesStore.setState(s))}
          >
            <RefreshCw
              size={12}
              strokeWidth={1.5}
              className={u.status === 'checking' ? 'animate-spin' : ''}
            />{' '}
            Check now
          </button>
        )}
      </Field>
      {u.skipped && (
        <p className="text-[12px] text-amber">
          Version {u.skipped} isn’t installed: Alton went back from it because it didn’t start
          properly. The next version will install as normal.
        </p>
      )}
      {u.previous && u.status !== 'dev' && (
        <Field
          label={`Go back to version ${u.previous}`}
          hint="If this version misbehaves: reinstalls the previous one (checked against its published checksum) and puts back Alton’s data from just before the update. Alton also does this by itself if a new version fails to start twice."
        >
          <button
            type="button"
            className="hud-button"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(`Go back to version ${u.previous}? Alton will restart.`)) return;
              setBusy(true);
              setMsg('Fetching the previous version…');
              void window.arc.updates
                .rollback()
                .then((r) => setMsg(r.message))
                .finally(() => setBusy(false));
            }}
          >
            <Undo2 size={12} strokeWidth={1.5} /> Go back
          </button>
        </Field>
      )}
      {msg && <p className="text-[12px] text-accent">{msg}</p>}
    </Section>
  );
}
