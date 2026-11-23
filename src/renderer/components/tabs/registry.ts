import {
  Activity,
  AppWindow,
  HardDrive,
  ListChecks,
  MessagesSquare,
  NotebookPen,
  LayoutDashboard,
  Network,
  Workflow,
  Puzzle,
  type LucideIcon,
} from 'lucide-react';
import type { TabId } from '@renderer/stores/uiStore';

export interface TabDef {
  id: TabId;
  label: string;
  code: string; // footer section code
  icon: LucideIcon;
}

export const TABS: TabDef[] = [
  { id: 'overview', label: 'Overview', code: 'SEC.01', icon: LayoutDashboard },
  { id: 'chat', label: 'Chat', code: 'SEC.08', icon: MessagesSquare },
  { id: 'notes', label: 'Notes', code: 'SEC.09', icon: NotebookPen },
  { id: 'system', label: 'System', code: 'SEC.02', icon: Activity },
  { id: 'tasks', label: 'Tasks', code: 'SEC.07', icon: ListChecks },
  { id: 'apps', label: 'Apps', code: 'SEC.03', icon: AppWindow },
  { id: 'network', label: 'Network', code: 'SEC.04', icon: Network },
  { id: 'storage', label: 'Storage', code: 'SEC.05', icon: HardDrive },
  { id: 'routines', label: 'Routines', code: 'SEC.06', icon: Workflow },
  { id: 'mods', label: 'Mods', code: 'SEC.10', icon: Puzzle },
];
