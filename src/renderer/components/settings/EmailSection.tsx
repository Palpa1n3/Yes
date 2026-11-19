import { CheckCircle2, Mail, Trash2, XCircle } from 'lucide-react';
import { useState } from 'react';
import type { EmailConnectResult } from '@shared/email';
import { useEmailStore } from '@renderer/stores/emailStore';
import { Field, Section } from './controls';

const field =
  'h-8 w-64 border border-line bg-panel-raised/80 px-2 font-mono text-[12px] text-text-primary placeholder:text-text-muted/70 focus:border-accent focus:outline-none';

/** Gmail via an app password (read-only, stored encrypted). */
export function EmailSection() {
  const { configured, address, error } = useEmailStore();
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<EmailConnectResult | null>(null);

  return (
    <Section title="Email">
      <Field
        label="Gmail"
        hint={
          configured
            ? `Connected${address ? ` as ${address}` : ''}${error ? ` · ${error}` : ''}. Read-only: nothing is marked as read, sent or deleted. Checks every 5 minutes.`
            : 'Needs a Google “app password”: myaccount.google.com › Security › 2-Step Verification (turn it on if it isn’t) › App passwords › create one called ARC, then paste the 16 letters here. Not your normal password, and not in a chat.'
        }
        stacked
      >
        {configured ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 font-mono text-[12px] text-ok">
              <CheckCircle2 size={13} /> Email connected
            </span>
            <button
              type="button"
              className="hud-button"
              onClick={() =>
                void window.arc.email.disconnect().then((s) => {
                  useEmailStore.setState(s);
                  setResult(null);
                })
              }
            >
              <Trash2 size={12} strokeWidth={1.5} /> Disconnect
            </button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              setBusy(true);
              setResult(null);
              void window.arc.email
                .connect(user, pass)
                .then((r) => {
                  setResult(r);
                  if (r.ok) setPass('');
                })
                .finally(() => setBusy(false));
            }}
          >
            <input
              type="email"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="you@gmail.com"
              aria-label="Gmail address"
              autoComplete="off"
              spellCheck={false}
              className={field}
            />
            <div className="flex gap-2">
              <input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="App password (16 letters)"
                aria-label="App password"
                autoComplete="off"
                spellCheck={false}
                className={field}
              />
              <button
                type="submit"
                className="hud-button"
                disabled={busy || !user.trim() || pass.replace(/\s/g, '').length < 16}
              >
                <Mail size={12} strokeWidth={1.5} /> {busy ? 'Checking…' : 'Connect'}
              </button>
            </div>
          </form>
        )}
        {result && (
          <p
            className={`mt-1.5 flex items-center gap-1.5 text-[12px] ${result.ok ? 'text-ok' : 'text-alert'}`}
          >
            {result.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
            {result.message}
          </p>
        )}
      </Field>
    </Section>
  );
}
