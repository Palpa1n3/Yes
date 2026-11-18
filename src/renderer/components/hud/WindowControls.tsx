import { Copy, Minimize2, Minus, Square, X } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  maximized: boolean;
}

export function ControlButton({
  label,
  onClick,
  danger = false,
  children,
}: {
  label: string;
  onClick(): void;
  danger?: boolean;
  children: ReactNode;
}) {
  const hover = danger
    ? 'hover:text-alert hover:[filter:drop-shadow(0_0_6px_rgb(var(--alert)/0.6))]'
    : 'hover:text-accent hover:[filter:drop-shadow(0_0_6px_rgb(var(--accent)/0.6))]';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`no-drag grid h-8 w-11 place-items-center text-text-muted transition-[color,filter] duration-150 ${hover}`}
    >
      {children}
    </button>
  );
}

export function WindowControls({ maximized }: Props) {
  const { window: win } = window.arc;
  return (
    <div className="flex items-center">
      <ControlButton label="Compact mode" onClick={() => win.setCompact(true)}>
        <Minimize2 size={13} strokeWidth={1.5} />
      </ControlButton>
      <ControlButton label="Minimise" onClick={win.minimize}>
        <Minus size={14} strokeWidth={1.5} />
      </ControlButton>
      <ControlButton label={maximized ? 'Restore' : 'Maximise'} onClick={win.toggleMaximize}>
        {maximized ? <Copy size={12} strokeWidth={1.5} /> : <Square size={12} strokeWidth={1.5} />}
      </ControlButton>
      <ControlButton label="Close" onClick={win.close} danger>
        <X size={15} strokeWidth={1.5} />
      </ControlButton>
    </div>
  );
}
