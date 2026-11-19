import { RefreshCw } from 'lucide-react';
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
    </Section>
  );
}
