import {
  Activity,
  AppWindow,
  Calculator,
  Code2,
  Folder,
  Gamepad2,
  Globe,
  HardDriveDownload,
  MessageSquare,
  Moon,
  Music,
  Newspaper,
  NotebookPen,
  Settings,
  SquareTerminal,
  Target,
  Video,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/** Resolves icon names stored in data (apps.json, routines) without bundling every lucide icon. */
const ICONS: Record<string, LucideIcon> = {
  Activity,
  AppWindow,
  Calculator,
  Code2,
  Folder,
  Gamepad2,
  Globe,
  HardDriveDownload,
  MessageSquare,
  Moon,
  Music,
  Newspaper,
  NotebookPen,
  Settings,
  SquareTerminal,
  Target,
  Video,
  Zap,
};

export const ICON_NAMES = Object.keys(ICONS);

export function Icon({ name, size = 18 }: { name?: string; size?: number }) {
  const C = (name && ICONS[name]) || AppWindow;
  return <C size={size} strokeWidth={1.5} aria-hidden />;
}
