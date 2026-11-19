import { app, desktopCapturer, screen } from 'electron';
import type { MainContext } from '../context';
import { ScreenWatch, type Frame } from '../services/screen-watch';

/** Picture of the display under the mouse pointer, longest side ≤ 1568 px. */
export async function grab(): Promise<Frame | null> {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { width, height } = display.size;
  const scale = Math.min(1, 1568 / Math.max(width, height));
  const size = { width: Math.round(width * scale), height: Math.round(height * scale) };
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
  const src = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
  if (!src || src.thumbnail.isEmpty()) return null;
  const img = src.thumbnail;
  const s = img.getSize();
  return { jpeg: img.toJPEG(70), at: Date.now(), width: s.width, height: s.height };
}

/** Every monitor, each longest side ≤ 1280 px (multi-monitor awareness). */
export async function grabAll(): Promise<Array<{ label: string; jpeg: string }>> {
  const displays = screen.getAllDisplays();
  const biggest = Math.max(...displays.map((d) => Math.max(d.size.width, d.size.height)));
  const scale = Math.min(1, 1280 / biggest);
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: Math.round(biggest * scale), height: Math.round(biggest * scale) },
  });
  const primary = screen.getPrimaryDisplay().id;
  return displays.flatMap((d, i) => {
    const src = sources.find((s) => s.display_id === String(d.id)) ?? sources[i];
    if (!src || src.thumbnail.isEmpty()) return [];
    return [
      {
        label: `Screen ${i + 1}${d.id === primary ? ' (main)' : ''}, ${d.size.width}×${d.size.height}${d.bounds.x < 0 ? ', left of main' : d.bounds.x > 0 ? ', right of main' : ''}`,
        jpeg: src.thumbnail.toJPEG(70).toString('base64'),
      },
    ];
  });
}

export function registerScreenIpc(ctx: MainContext, gamingActive: () => boolean): ScreenWatch {
  const watch = new ScreenWatch({
    grab,
    enabled: () => ctx.settings.get().screenAware,
    arcInFront: () => {
      const w = ctx.getWindow();
      return !!w && w.isVisible() && !w.isMinimized() && w.isFocused();
    },
    paused: () => !ctx.settings.get().screenAware || gamingActive(),
  });
  ctx.captureScreen = () => watch.capture();
  ctx.settings.subscribe((next, prev) => {
    if (prev.screenAware && !next.screenAware) watch.forget();
  });
  watch.start();
  app.on('will-quit', () => watch.stop());
  return watch;
}
