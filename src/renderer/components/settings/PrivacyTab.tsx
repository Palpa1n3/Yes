import {
  Bot,
  Brain,
  CheckCircle2,
  Lightbulb,
  ListChecks,
  RotateCw,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ActionRecord } from '@shared/audit';
import type { BackupInfo, RemoteInfo } from '@shared/ipc';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import type { Settings } from '@shared/types';
import { Field, Section, Segmented, Toggle } from './controls';
import { QrCode } from './QrCode';
import { PERMISSION_KEYS, type Permission, type PermissionKey } from '@shared/types';

const ICON = { action: Zap, agent: Bot, routine: ListChecks, memory: Brain, suggestion: Lightbulb };

type Key = keyof Pick<
  Settings,
  | 'screenAware'
  | 'phoneControl'
  | 'clipboardHistory'
  | 'autoMemory'
  | 'initiative'
  | 'agentMode'
  | 'persistHistory'
>;

/** Privacy & permissions: everything Alton can see or do, in one place, plus what it did. */
export function PrivacyTab() {
  const { settings: s, update } = useSettingsStore();
  const [items, setItems] = useState<ActionRecord[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const load = (): void => void window.arc.app.history().then(setItems);
  useEffect(load, []);
  const n = s.assistantName;

  const PERMS: Array<{ key: Key; label: string; hint: string }> = [
    {
      key: 'screenAware',
      label: 'See your screen',
      hint: 'One picture kept in memory on this PC; sent to Claude only when a question needs it.',
    },
    {
      key: 'phoneControl',
      label: 'Let my phone control this PC',
      hint: 'Your paired phone can see this screen live and use the mouse and keyboard (over Tailscale, anywhere). A notice shows here whenever it does.',
    },
    {
      key: 'clipboardHistory',
      label: 'Clipboard history',
      hint: 'Last 50 copies, memory only. Password-like copies are hidden from Claude.',
    },
    {
      key: 'persistHistory',
      label: 'Remember conversations',
      hint: 'Chats saved on this PC. Off = forgotten when you quit (and deleted from disk).',
    },
    {
      key: 'autoMemory',
      label: 'Learn about you automatically',
      hint: 'Facts from chats saved in Notes › Memory, tagged “learned”. Never passwords or card numbers.',
    },
    {
      key: 'initiative',
      label: 'Offer help unprompted',
      hint: 'Suggestions now and then; never in quiet hours, while gaming or when you are away.',
    },
    {
      key: 'agentMode',
      label: 'Agent Mode (mouse and keyboard)',
      hint: 'Only when you say “handle this for me”. Asks before paying, sending, deleting or changing settings.',
    },
  ];

  return (
    <>
      <Section title={`What ${n} can see and do`}>
        {PERMS.map((p) => (
          <Field key={p.key} label={p.label} hint={p.hint}>
            <Toggle
              label={p.label}
              checked={s[p.key]}
              onChange={(v) => void update({ [p.key]: v } as Partial<Settings>)}
            />
          </Field>
        ))}
        <p className="py-2 text-[12px] text-text-muted">
          Email and calendar connections are in General; your keys and passwords are stored
          encrypted by Windows and never shown again or sent anywhere except the service they belong
          to.
        </p>
      </Section>
      <PermissionsSection />
      <BackupsSection />
      <Section title="Emergency stop">
        <p className="py-1 text-[12px] text-text-muted">
          Press <kbd className="text-ice">Ctrl+Alt+Backspace</kbd> anywhere, or say “stop
          everything”, to stop Agent Mode, a running routine, speech and listening at once. In Agent
          Mode, <kbd className="text-ice">Esc</kbd> also stops it.
        </p>
      </Section>
      <Section title="Action history">
        <div className="flex gap-1.5 py-1">
          <button type="button" className="hud-button" onClick={load}>
            <RotateCw size={12} /> Refresh
          </button>
          {confirm ? (
            <button
              type="button"
              className="hud-button !border-alert/70 !text-alert"
              onClick={() => {
                void window.arc.app.clearHistory().then(setItems);
                setConfirm(false);
              }}
            >
              Confirm clear
            </button>
          ) : (
            <button type="button" className="hud-button" onClick={() => setConfirm(true)}>
              <Trash2 size={12} /> Clear
            </button>
          )}
        </div>
        <ol className="max-h-[340px] space-y-1 overflow-y-auto py-1" aria-label="Action history">
          {items?.map((r, i) => {
            const Icon = ICON[r.source];
            return (
              <li key={`${r.at}-${i}`} className="flex items-start gap-2 text-[12px]">
                <Icon size={12} className="mt-0.5 shrink-0 text-accent/70" aria-label={r.source} />
                <span className="w-[86px] shrink-0 font-mono text-[10px] text-text-muted">
                  {new Date(r.at).toLocaleString([], {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className="min-w-0 flex-1 break-words text-text-primary/90">{r.text}</span>
                {r.ok ? (
                  <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-ok" aria-label="done" />
                ) : (
                  <XCircle size={12} className="mt-0.5 shrink-0 text-alert" aria-label="failed" />
                )}
              </li>
            );
          })}
          {items && !items.length && (
            <li className="text-[12px] text-text-muted">
              Nothing yet. Apps {n} opens, Agent Mode steps, routines, things it learns and its
              suggestions are listed here.
            </li>
          )}
        </ol>
      </Section>
    </>
  );
}

function BackupsSection() {
  const [list, setList] = useState<BackupInfo[] | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  useEffect(() => void window.arc.app.backups().then(setList), []);
  return (
    <Section title="Backups">
      <p className="py-1 text-[12px] text-text-muted">
        Settings, notes, memories, routines, your apps list and chats are copied once a day (the
        last 7 days are kept). Keys and passwords are not copied. Restoring restarts the app; your
        current data is backed up first.
      </p>
      <div className="flex gap-1.5 py-1">
        <button
          type="button"
          className="hud-button"
          onClick={() => void window.arc.app.backupNow().then(setList)}
        >
          Back up now
        </button>
        <button
          type="button"
          className="hud-button"
          onClick={() => window.arc.app.openPath('backups')}
        >
          Open folder
        </button>
      </div>
      <ul className="space-y-1 py-1" aria-label="Backups">
        {list?.map((b) => (
          <li key={b.name} className="flex items-center gap-2 text-[12px]">
            <span className="flex-1 text-text-primary/90">
              {b.name}{' '}
              <span className="text-text-muted">· {(b.size / 1024 ** 2).toFixed(1)} MB</span>
              {b.damaged?.length ? (
                <span
                  className="text-amber"
                  title={`Not restored from this backup (couldn’t be read): ${b.damaged.join(', ')}`}
                >
                  {' '}
                  · {b.damaged.length} damaged file{b.damaged.length === 1 ? '' : 's'} skipped
                </span>
              ) : null}
            </span>
            {confirm === b.name ? (
              <>
                <button
                  type="button"
                  className="hud-button !border-alert/70 !text-alert"
                  onClick={() => void window.arc.app.restore(b.name)}
                >
                  Restore &amp; restart
                </button>
                <button type="button" className="hud-button" onClick={() => setConfirm(null)}>
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" className="hud-button" onClick={() => setConfirm(b.name)}>
                Restore
              </button>
            )}
          </li>
        ))}
        {list && !list.length && (
          <li className="text-[12px] text-text-muted">
            The first backup is made a minute after start.
          </li>
        )}
      </ul>
    </Section>
  );
}

export function PhoneSection() {
  const { settings: s, update } = useSettingsStore();
  const [info, setInfo] = useState<RemoteInfo | null>(null);
  useEffect(() => {
    const load = (): void => void window.arc.remote.status().then(setInfo);
    load();
    const t = setInterval(load, 3000); // the code changes once a phone pairs
    return () => clearInterval(t);
  }, [s.phoneAccess]);
  return (
    <Section title="Phone companion">
      <Field
        label="Alton project folder (updates from your phone)"
        hint="The folder you push Alton to GitHub from (with the git setup in it), e.g. C:\\Users\\you\\Downloads\\…\\arc. With “Let my phone control this PC” on, your phone can send an update zip here and Alton unpacks it, commits and pushes. Nothing else is run."
        stacked
      >
        <input
          defaultValue={s.projectDir}
          placeholder="Paste the folder path (File Explorer › address bar › copy)"
          onBlur={(e) => void update({ projectDir: e.target.value.trim().replace(/^"|"$/g, '') })}
          aria-label="Alton project folder"
          className="h-8 w-full rounded-[6px] border border-line bg-panel-raised px-2 font-mono text-[12px] text-text-primary focus:border-accent focus:outline-none"
        />
      </Field>
      <Field
        label="Use Alton from your phone"
        hint="The full Alton on your phone's browser (same home Wi-Fi): all your chats with live answers, research mode, photos from your camera, read-aloud, notes, lists and goals, plus music, volume, timers, routines, Agent Mode, a live view of your screen, approvals, file sending and an emergency stop. Windows may ask to allow ARC through the firewall: allow it on private networks only. Don't use this on public Wi-Fi."
      >
        <Toggle
          label="Phone companion"
          checked={s.phoneAccess}
          onChange={(v) => void update({ phoneAccess: v })}
        />
      </Field>
      {s.phoneAccess && info && (
        <div className="space-y-2 py-2 text-[12px]">
          {info.secureUrl ? (
            <p className="text-ok">
              Encrypted link ready: <span className="font-mono">{info.secureUrl}</span> (Tailscale).
            </p>
          ) : (
            <p className="text-amber">
              No encrypted address found. Install Tailscale on this PC and your phone, then run{' '}
              <code>tailscale serve --bg 47615</code> once; or allow home Wi-Fi below (not
              encrypted).
            </p>
          )}
          <Field
            label="Also allow plain home Wi-Fi (not encrypted)"
            hint="Off: phones reach Alton only through Tailscale, which is encrypted. On: phones on your home Wi-Fi can also use the plain http://192.168… address, where anyone on the same Wi-Fi could read the traffic."
          >
            <Toggle
              label="Allow plain home Wi-Fi"
              checked={s.phonePlainLan}
              onChange={(v) => void update({ phonePlainLan: v })}
            />
          </Field>
          {info.error && <p className="text-alert">{info.error}</p>}
          {info.running && (
            <>
              {info.urls[0] && info.code && (
                <div className="flex items-center gap-4 rounded-[10px] border border-accent/40 bg-accent/5 p-3">
                  <QrCode
                    text={`${info.secureUrl ?? pairUrl(info.urls)}/#pair=${info.code}`}
                    label="Scan to open and pair the phone app"
                  />
                  <p className="text-[13px] text-text-primary">
                    <b className="text-ice">Easiest:</b> point your phone's camera at this code and
                    tap the link. It opens {s.assistantName} and pairs by itself.
                    <br />
                    <span className="text-[12px] text-text-muted">
                      {info.secureUrl
                        ? '(Encrypted, through Tailscale: the phone needs the Tailscale app on. The code changes after each phone pairs.)'
                        : '(Phone on the same Wi-Fi. The code changes after each phone pairs.)'}
                    </span>
                  </p>
                </div>
              )}
              <p className="text-text-muted">
                Or by hand: 1. On your phone, open{' '}
                {info.urls.length ? (
                  info.urls.map((u) => (
                    <span key={u} className="mr-2 font-mono text-ice">
                      {u}
                    </span>
                  ))
                ) : (
                  <span className="text-amber">(no Wi-Fi/network address found)</span>
                )}
                <br />
                2. Type this pairing code:{' '}
                <span className="font-mono text-[18px] tracking-[0.3em] text-accent">
                  {info.code}
                </span>
                <br />
                Tip: add the page to your home screen to use it like an app.
              </p>
              <span className="flex gap-1.5">
                <button
                  type="button"
                  className="hud-button"
                  onClick={() => void window.arc.remote.newCode().then(setInfo)}
                >
                  New code
                </button>
                <button
                  type="button"
                  className="hud-button"
                  disabled={!info.paired}
                  onClick={() => void window.arc.remote.forget().then(setInfo)}
                >
                  Unpair phones ({info.paired})
                </button>
              </span>
            </>
          )}
        </div>
      )}
    </Section>
  );
}

const PERM_LABEL: Record<PermissionKey, string> = {
  launch_app: 'Open apps',
  close_app: 'Close apps',
  open_url: 'Open web pages and searches',
  lock_screen: 'Lock the PC',
  run_routine: 'Run routines (when Claude asks to)',
  set_volume: 'Change the volume',
  media_control: 'Play / pause / skip music',
  files: 'Open folders and show files',
  message_sellers:
    'Message sellers (eBay, Vinted…) while shopping: questions only; offers and payments always ask',
};

function PermissionsSection() {
  const { settings: s, update } = useSettingsStore();
  return (
    <Section title="Permissions">
      <p className="py-1 text-[12px] text-text-muted">
        What Claude may do when it decides to act. “Ask me” shows an Approve / Cancel card first;
        “Never” blocks it (it will tell you it can't). Anything risky outside this list (moving
        files, posting, Agent Mode payments) always asks.
      </p>
      {PERMISSION_KEYS.map((k) => (
        <Field key={k} label={PERM_LABEL[k]}>
          <Segmented<Permission>
            label={PERM_LABEL[k]}
            value={s.permissions[k]}
            onChange={(v) => void update({ permissions: { ...s.permissions, [k]: v } })}
            options={[
              { value: 'allow', label: 'Just do it' },
              { value: 'ask', label: 'Ask me' },
              { value: 'block', label: 'Never' },
            ]}
          />
        </Field>
      ))}
    </Section>
  );
}

/** The phone-only app (GitHub Pages) and waking the PC from the phone. */
export function PhoneAppSection() {
  const { settings: s, update } = useSettingsStore();
  const [info, setInfo] = useState<RemoteInfo | null>(null);
  useEffect(() => void window.arc.remote.status().then(setInfo), [s.phoneAccess]);
  return (
    <>
      <Section title="Phone app (works with the PC off)">
        <p className="py-1 text-[12px] leading-relaxed text-text-muted">
          A version of {s.assistantName} that runs on your phone and talks to Claude directly, so it
          works anywhere with the PC off: chats, voice, photos, web search, and getting texts,
          WhatsApps, calls, emails, directions, calendar events and timers ready for you to send.
          <br />
          <b className="text-text-primary">Set up once:</b> 1) upload the project to GitHub as usual
          (the app is in the <code>docs</code> folder); 2) on GitHub: your repo › Settings › Pages ›
          Branch <code>main</code>, folder <code>/docs</code> › Save; 3) open the address below on
          your phone, add it to the home screen and enter your Claude key (it stays on the phone;
          set a monthly limit at console.anthropic.com). 4) Connect it to this PC: in the phone
          app's PC tab, enter the PC's Tailscale address (from{' '}
          <code>tailscale serve --bg 47615</code>) and the pairing code under Phone companion. From
          then on chats, lists, notes and shifts sync by themselves, and the PC tab controls this PC
          whenever it's on.
        </p>
        <div className="flex items-center gap-4 py-2">
          <QrCode text={s.phoneAppUrl} size={132} label="Scan to open the phone-only app" />
          <p className="text-[12px] text-text-muted">
            Scan to open the phone-only app (once GitHub Pages is switched on), then add it to the
            home screen.
          </p>
        </div>
        <Field
          label="Phone app address"
          hint="Your GitHub Pages address (username.github.io/repository/)."
          stacked
        >
          <input
            defaultValue={s.phoneAppUrl}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (/^https:\/\/[\w.-]+(\/[\w./~-]*)?$/.test(v))
                void update({ phoneAppUrl: v.endsWith('/') ? v : `${v}/` });
            }}
            aria-label="Phone app address"
            className="h-8 w-full rounded-[6px] border border-line bg-panel-raised px-2 font-mono text-[12px] text-text-primary focus:border-accent focus:outline-none"
          />
        </Field>
      </Section>
      <Section title="Wake from phone">
        <p className="py-1 text-[12px] leading-relaxed text-text-muted">
          Let your phone wake this PC from sleep, then use the full {s.assistantName}. Once only:
          <br />
          1) Windows: Device Manager › Network adapters › your adapter › Properties › Power
          Management: tick “Allow this device to wake the computer” and “Only allow a magic packet”;
          Advanced tab: “Wake on Magic Packet” = Enabled. 2) Turn off Fast startup: Control Panel ›
          Power Options › Choose what the power buttons do › untick “Turn on fast startup”. 3) Some
          PCs also need “Wake on LAN” switched on in the BIOS. 4) On your phone install a free
          Wake-on-LAN app (Android: “Wake On Lan”, iPhone: “Mocha WOL”) and add this PC with the
          address below. Put the PC to sleep (not shut down), or use Sleep PC in the phone app.
          <br />
          Away from home: install Tailscale (free) on the PC and phone and sign in to both; the full
          phone version then also works on mobile data at the PC's Tailscale address.
        </p>
        <Field
          label="This PC's network address (MAC)"
          hint="Enter this in the Wake-on-LAN app. Use the one for the connection the PC normally uses (cable is the most reliable)."
        >
          <span className="flex flex-col items-end font-mono text-[12px] text-ice">
            {info?.macs.length ? (
              info.macs.map((m) => <span key={m}>{m}</span>)
            ) : (
              <span className="text-text-muted">No network found</span>
            )}
          </span>
        </Field>
      </Section>
    </>
  );
}

/** The address to put in the QR code: a home-network one (192.168…) before others. */
function pairUrl(urls: string[]): string {
  return (
    urls.find((u) => u.includes('//192.168.')) ??
    urls.find((u) => !u.includes('//100.')) ??
    urls[0] ??
    ''
  );
}
