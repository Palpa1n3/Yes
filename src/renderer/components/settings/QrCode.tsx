import qrcode from 'qrcode-generator';
import { useMemo } from 'react';

/** A QR code drawn as SVG squares (no HTML injection). Scan it with the phone camera. */
export function QrCode({
  text,
  size = 168,
  label,
}: {
  text: string;
  size?: number;
  label: string;
}) {
  const cells = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    const n = q.getModuleCount();
    const dark: Array<[number, number]> = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) dark.push([c, r]);
    return { n, dark };
  }, [text]);
  const pad = 2;
  const total = cells.n + pad * 2;
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${total} ${total}`}
      shapeRendering="crispEdges"
      className="shrink-0 rounded-[8px]"
    >
      <rect width={total} height={total} fill="#fff" />
      <path fill="#000" d={cells.dark.map(([x, y]) => `M${x + pad} ${y + pad}h1v1h-1z`).join('')} />
    </svg>
  );
}
