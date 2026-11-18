/** Sample data for panels whose real sources need an online service or account access
 *  (calendar) or haven't been built yet (routine execution). Each is labelled
 *  SAMPLE / PREVIEW in the UI so it's never mistaken for real data. */

export interface CalEvent {
  minutes: number; // minutes after midnight
  title: string;
  where: string;
}

export const schedule: CalEvent[] = [
  { minutes: 8 * 60 + 30, title: 'Coffee & inbox zero', where: 'HOME' },
  { minutes: 10 * 60, title: 'Stand-up call', where: 'TEAMS' },
  { minutes: 11 * 60 + 30, title: 'Deep work: side project', where: 'DESK' },
  { minutes: 13 * 60, title: 'Lunch', where: 'HOME' },
  { minutes: 15 * 60 + 30, title: 'Dentist appointment', where: 'TOWN' },
  { minutes: 18 * 60, title: 'Gym, leg day', where: 'GYM' },
  { minutes: 20 * 60 + 30, title: 'Game night with the squad', where: 'DISCORD' },
  { minutes: 23 * 60, title: 'Backup runs', where: 'AUTO' },
];

export interface Routine {
  id: string;
  name: string;
  icon: string;
  description: string;
  steps: Array<{ action: string; target: string }>;
}

/** Each step is a canonical command, so routines run through the same pipeline as chat. */
export const routines: Routine[] = [
  {
    id: 'focus',
    name: 'Focus mode',
    icon: 'Target',
    description: 'Silence distractions for 50 minutes',
    steps: [
      { action: 'system_query', target: 'notifications: do not disturb' },
      { action: 'close_app', target: 'Discord' },
      { action: 'launch_app', target: 'Spotify · Deep Focus playlist' },
      { action: 'launch_app', target: 'VS Code · last project' },
      { action: 'timer', target: '50 min, then chime' },
    ],
  },
  {
    id: 'gaming',
    name: 'Gaming mode',
    icon: 'Gamepad2',
    description: 'Free up resources and open your launchers',
    steps: [
      { action: 'close_app', target: 'Chrome, OneDrive sync' },
      { action: 'system_query', target: 'power plan: high performance' },
      { action: 'launch_app', target: 'Steam' },
      { action: 'launch_app', target: 'Discord' },
    ],
  },
  {
    id: 'brief',
    name: 'Daily brief',
    icon: 'Newspaper',
    description: 'Weather, calendar, updates and drive health',
    steps: [
      { action: 'system_query', target: 'weather · today' },
      { action: 'system_query', target: 'calendar · next 3 events' },
      { action: 'system_query', target: 'pending updates & disk space' },
      { action: 'speak', target: 'summary' },
    ],
  },
  {
    id: 'backup',
    name: 'Backup now',
    icon: 'HardDriveDownload',
    description: 'Mirror Projects and Documents to E:\\Archive',
    steps: [
      { action: 'run_task', target: 'robocopy D:\\Projects → E:\\Archive' },
      { action: 'run_task', target: 'robocopy ~\\Documents → E:\\Archive' },
      { action: 'notify', target: 'result' },
    ],
  },
  {
    id: 'wind-down',
    name: 'Wind down',
    icon: 'Moon',
    description: 'Night light, quiet audio, shut down in an hour',
    steps: [
      { action: 'system_query', target: 'night light: on' },
      { action: 'system_query', target: 'volume: 30%' },
      { action: 'timer', target: 'shutdown in 60 min (cancellable)' },
    ],
  },
];

export const schedules = [
  { label: 'Nightly backup', when: 'Daily · 23:00', enabled: true },
  { label: 'Daily brief', when: 'Weekdays · 08:30', enabled: true },
  { label: 'Clean temp files', when: 'Sundays · 12:00', enabled: false },
  { label: 'Shutdown reminder', when: 'Daily · 01:00', enabled: true },
];

export const suggestions = [
  'Start focus mode',
  'Daily brief',
  'Open last project',
  'Free up space on D:',
];
