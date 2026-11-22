/** A small street map (OpenStreetMap tiles, no library): drag to move, + / − to zoom, tap to
 *  put the pin, and the circle Alton watches drawn to scale. Used for "At work". */

const TILE = 256;
const tileUrl = (z: number, x: number, y: number): string =>
  `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

/** World pixel position of a point at a zoom level (Web Mercator). */
function toPx(lat: number, lon: number, z: number): { x: number; y: number } {
  const s = TILE * 2 ** z;
  const r = (lat * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * s,
    y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * s,
  };
}
function toLatLon(x: number, y: number, z: number): { lat: number; lon: number } {
  const s = TILE * 2 ** z;
  const n = Math.PI - (2 * Math.PI * y) / s;
  return { lat: (180 / Math.PI) * Math.atan(Math.sinh(n)), lon: (x / s) * 360 - 180 };
}
/** Metres per screen pixel at a latitude and zoom. */
const mpp = (lat: number, z: number): number =>
  (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;

export interface WorkMap {
  /** Move the view (and the pin, if given). */
  show(lat: number, lon: number, pin?: boolean): void;
  setRadius(m: number): void;
  pin(): { lat: number; lon: number } | null;
  destroy(): void;
}

export function mountWorkMap(
  box: HTMLElement,
  start: { lat: number; lon: number },
  opts: {
    pin?: { lat: number; lon: number } | null;
    radius: number;
    onPin(p: { lat: number; lon: number }): void;
  },
): WorkMap {
  box.textContent = '';
  box.style.position = 'relative';
  box.style.overflow = 'hidden';
  box.style.touchAction = 'none';
  const layer = document.createElement('div');
  layer.style.cssText =
    'position:absolute;inset:0;filter:brightness(.78) saturate(.85) contrast(1.05)';
  const circle = document.createElement('div');
  circle.style.cssText =
    'position:absolute;border-radius:50%;border:2px solid var(--accent);background:color-mix(in srgb,var(--accent) 18%,transparent);pointer-events:none;transform:translate(-50%,-50%)';
  const dot = document.createElement('div');
  dot.style.cssText =
    'position:absolute;width:14px;height:14px;border-radius:50%;background:var(--accent);border:2px solid #fff;box-shadow:0 0 10px var(--accent);pointer-events:none;transform:translate(-50%,-50%)';
  const zoomBox = document.createElement('div');
  zoomBox.style.cssText =
    'position:absolute;right:8px;top:8px;display:flex;flex-direction:column;gap:6px';
  const btn = (t: string): HTMLButtonElement => {
    const b = document.createElement('button');
    b.textContent = t;
    b.type = 'button';
    b.className = 'btn';
    b.style.cssText = 'width:34px;height:34px;padding:0;font-size:18px';
    return b;
  };
  const zin = btn('+');
  const zout = btn('−');
  zoomBox.append(zin, zout);
  const credit = document.createElement('span');
  credit.textContent = '© OpenStreetMap contributors';
  credit.style.cssText =
    'position:absolute;right:4px;bottom:2px;font-size:9.5px;color:#ccc;background:rgba(0,0,0,.55);padding:1px 4px;border-radius:3px';
  box.append(layer, circle, dot, zoomBox, credit);

  let z = 16;
  let center = toPx(start.lat, start.lon, z);
  let pin = opts.pin ?? null;
  let radius = opts.radius;
  const tiles = new Map<string, HTMLImageElement>();

  const draw = (): void => {
    const w = box.clientWidth;
    const h = box.clientHeight;
    const left = center.x - w / 2;
    const top = center.y - h / 2;
    const n = 2 ** z;
    const want = new Set<string>();
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + w) / TILE); tx++)
      for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + h) / TILE); ty++) {
        if (ty < 0 || ty >= n) continue;
        const wx = ((tx % n) + n) % n;
        const key = `${z}/${tx}/${ty}`;
        want.add(key);
        let img = tiles.get(key);
        if (!img) {
          img = document.createElement('img');
          img.src = tileUrl(z, wx, ty);
          img.alt = '';
          img.draggable = false;
          img.style.cssText = `position:absolute;width:${TILE}px;height:${TILE}px;user-select:none`;
          tiles.set(key, img);
          layer.appendChild(img);
        }
        img.style.left = `${tx * TILE - left}px`;
        img.style.top = `${ty * TILE - top}px`;
      }
    for (const [k, img] of tiles)
      if (!want.has(k)) {
        img.remove();
        tiles.delete(k);
      }
    if (pin) {
      const p = toPx(pin.lat, pin.lon, z);
      const x = p.x - left;
      const y = p.y - top;
      const d = (2 * radius) / mpp(pin.lat, z);
      dot.style.display = circle.style.display = '';
      dot.style.left = circle.style.left = `${x}px`;
      dot.style.top = circle.style.top = `${y}px`;
      circle.style.width = circle.style.height = `${d}px`;
    } else dot.style.display = circle.style.display = 'none';
  };

  const zoomTo = (nz: number): void => {
    nz = Math.max(3, Math.min(19, nz));
    if (nz === z) return;
    const ll = toLatLon(center.x, center.y, z);
    z = nz;
    center = toPx(ll.lat, ll.lon, z);
    for (const img of tiles.values()) img.remove();
    tiles.clear();
    draw();
  };
  zin.onclick = (e) => {
    e.stopPropagation();
    zoomTo(z + 1);
  };
  zout.onclick = (e) => {
    e.stopPropagation();
    zoomTo(z - 1);
  };

  // Drag to move; a tap (barely moved) puts the pin there.
  let down: { x: number; y: number; cx: number; cy: number; id: number } | null = null;
  let moved = false;
  box.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    down = { x: e.clientX, y: e.clientY, cx: center.x, cy: center.y, id: e.pointerId };
    moved = false;
    box.setPointerCapture(e.pointerId);
  });
  box.addEventListener('pointermove', (e) => {
    if (!down || e.pointerId !== down.id) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
    if (!moved) return;
    center = { x: down.cx - dx, y: down.cy - dy };
    draw();
  });
  box.addEventListener('pointerup', (e) => {
    if (!down || e.pointerId !== down.id) return;
    if (!moved) {
      const r = box.getBoundingClientRect();
      const wx = center.x - r.width / 2 + (e.clientX - r.left);
      const wy = center.y - r.height / 2 + (e.clientY - r.top);
      pin = toLatLon(wx, wy, z);
      draw();
      opts.onPin(pin);
    }
    down = null;
  });
  box.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      zoomTo(z + (e.deltaY < 0 ? 1 : -1));
    },
    { passive: false },
  );
  const ro = new ResizeObserver(() => draw());
  ro.observe(box);
  draw();

  return {
    show(lat, lon, setPin) {
      center = toPx(lat, lon, z);
      if (setPin) pin = { lat, lon };
      draw();
    },
    setRadius(m) {
      radius = m;
      draw();
    },
    pin: () => pin,
    destroy() {
      ro.disconnect();
      box.textContent = '';
    },
  };
}

/** Distance in metres between two points. */
export function metresBetween(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
