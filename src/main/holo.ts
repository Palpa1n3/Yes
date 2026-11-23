/** Notifications in Alton's own holographic style: small glowing cards that slide in at the
 *  bottom-right of the desktop widget's screen, stack, and fade after a few seconds. Click one to open Alton. Falls back to
 *  plain Windows notifications when turned off (Settings › Appearance). */
import { BrowserWindow, Notification, screen } from 'electron';

const W = 360;
const H = 96;
const GAP = 8;
const SHOW_MS = 7000;

const toastHtml = (title: string, body: string, tone: string): string => `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<style>
html,body{margin:0;background:transparent;overflow:hidden;font-family:Segoe UI,system-ui,sans-serif;cursor:pointer}
.c{position:relative;margin:6px;height:${H - 12}px;box-sizing:border-box;padding:12px 16px 10px 18px;
background:linear-gradient(135deg,rgba(6,14,24,.94),rgba(10,24,38,.9));border:1px solid rgba(${tone},.75);
border-radius:6px;box-shadow:0 0 22px rgba(${tone},.35),inset 0 0 18px rgba(${tone},.08);color:#e2f5ff;
animation:in .35s cubic-bezier(.2,.9,.3,1) both, out .5s ease-in ${SHOW_MS - 600}ms forwards}
.c:before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;background:rgb(${tone});box-shadow:0 0 10px rgb(${tone})}
.c:after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.025) 0 1px,transparent 1px 3px);pointer-events:none}
.t{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:rgb(${tone});margin-bottom:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.b{font-size:13.5px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
@keyframes in{from{opacity:0;transform:translateX(40px) scale(.97)}to{opacity:1;transform:none}}
@keyframes out{to{opacity:0;transform:translateX(30px)}}
</style></head><body><div class="c"><div class="t">${title}</div><div class="b">${body}</div></div></body></html>`;

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`).slice(0, 400);

const open: BrowserWindow[] = [];

/** The screen the cards go on: the desktop widget's screen, else the main one. */
function area(): Electron.Rectangle {
  const id = deps?.display?.() ?? null;
  return (screen.getAllDisplays().find((d) => d.id === id) ?? screen.getPrimaryDisplay()).workArea;
}

function place(): void {
  const wa = area();
  open.forEach((w, i) => {
    if (!w.isDestroyed())
      w.setPosition(wa.x + wa.width - W - 8, wa.y + wa.height - (H + GAP) * (i + 1));
  });
}

export interface HoloDeps {
  enabled(): boolean;
  /** Open Alton when a card is clicked. */
  onClick(): void;
  /** Which screen to show them on (the desktop widget's; null = the main screen). */
  display?(): number | null;
}
let deps: HoloDeps | null = null;
export const setupHolo = (d: HoloDeps): void => {
  deps = d;
};

/** Show a notification. tone: 'info' (accent), 'warn' (amber) or 'alert' (red). */
export function notifyUser(
  title: string,
  body: string,
  tone: 'info' | 'warn' | 'alert' = 'info',
): void {
  if (!deps?.enabled()) {
    if (Notification.isSupported()) {
      const n = new Notification({ title, body, silent: false });
      n.on('click', () => deps?.onClick());
      n.show();
    }
    return;
  }
  const rgb = tone === 'alert' ? '255,77,94' : tone === 'warn' ? '255,181,71' : '63,208,255';
  const w = new BrowserWindow({
    width: W,
    height: H,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, javascript: false },
  });
  w.setAlwaysOnTop(true, 'screen-saver');
  open.unshift(w);
  while (open.length > 4) open.pop()?.destroy();
  place();
  void w.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(toastHtml(esc(title), esc(body), rgb))}`,
  );
  w.once('ready-to-show', () => w.showInactive());
  // A click focuses the card: open Alton.
  w.on('focus', () => {
    deps?.onClick();
    if (!w.isDestroyed()) w.destroy();
  });
  w.on('closed', () => {
    const i = open.indexOf(w);
    if (i >= 0) open.splice(i, 1);
    place();
  });
  setTimeout(() => {
    if (!w.isDestroyed()) w.destroy();
  }, SHOW_MS);
}
