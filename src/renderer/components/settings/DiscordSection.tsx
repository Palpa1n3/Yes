import { useEffect, useState } from 'react';
import { Field, Section } from './controls';

/** Discord: a channel webhook, so Alton can post messages you approve. */
export function DiscordSection() {
  const [saved, setSaved] = useState<boolean | null>(null);
  const [url, setUrl] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => void window.arc.discord.status().then(setSaved), []);
  return (
    <Section title="Discord">
      <Field
        label="Post to a Discord channel"
        hint={
          saved
            ? 'Connected. Ask “post to Discord: …”; you approve every message first. The link is stored encrypted.'
            : 'In Discord: Server Settings › Integrations › Webhooks › New Webhook › Copy Webhook URL, then paste it here. Alton can then post messages you approve to that channel.'
        }
        stacked
      >
        {saved ? (
          <button
            type="button"
            className="hud-button"
            onClick={() => void window.arc.discord.clear().then(setSaved)}
          >
            Remove
          </button>
        ) : (
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void window.arc.discord.set(url).then((r) => {
                setMsg(r.message);
                if (r.ok) {
                  setSaved(true);
                  setUrl('');
                }
              });
            }}
          >
            <input
              type="password"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://discord.com/api/webhooks/…"
              aria-label="Discord webhook link"
              className="h-7 min-w-0 flex-1 rounded-[5px] border border-line bg-panel-raised px-2 text-[12px] text-text-primary focus:border-accent focus:outline-none"
            />
            <button type="submit" className="hud-button" disabled={!url.trim()}>
              Save
            </button>
          </form>
        )}
        {msg && <p className="mt-1 text-[12px] text-text-muted">{msg}</p>}
      </Field>
    </Section>
  );
}
