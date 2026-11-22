import { useEffect, useState } from 'react';
import { Field, Section } from './controls';

/** Smart home: a SmartThings personal access token, so Alton can control lights, plugs, heating… */
export function SmartHomeSection() {
  const [saved, setSaved] = useState<boolean | null>(null);
  const [token, setToken] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => void window.arc.smarthome.status().then(setSaved), []);
  return (
    <Section title="Smart home">
      <Field
        label="Samsung SmartThings"
        hint={
          saved
            ? 'Connected. Try “turn the lamp off”, “set the heating to 20” or “run Good night”. Unlocking or opening a door always asks first. The token is stored encrypted.'
            : 'Go to account.smartthings.com/tokens, sign in with your Samsung account, Generate new token, tick Devices (List, See, Control) and Scenes (See, Control), then paste it here.'
        }
        stacked
      >
        {saved ? (
          <button
            type="button"
            className="hud-button"
            onClick={() => void window.arc.smarthome.clear().then(setSaved)}
          >
            Remove
          </button>
        ) : (
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void window.arc.smarthome.set(token).then((r) => {
                setMsg(r.message);
                if (r.ok) {
                  setSaved(true);
                  setToken('');
                }
              });
            }}
          >
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="SmartThings token"
              aria-label="SmartThings token"
              className="h-7 min-w-0 flex-1 rounded-[5px] border border-line bg-panel-raised px-2 text-[12px] text-text-primary focus:border-accent focus:outline-none"
            />
            <button type="submit" className="hud-button" disabled={!token.trim()}>
              Save
            </button>
          </form>
        )}
        {msg && <p className="mt-1 text-[12px] text-text-muted">{msg}</p>}
      </Field>
    </Section>
  );
}
