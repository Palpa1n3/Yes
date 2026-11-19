/** The user's feature wish-list, seeded once into Notes as the "Alton roadmap" list
 *  (ticked = built). Alton and the user can keep adding to it. */
export const ROADMAP: Array<{ text: string; done: boolean }> = [
  // Intelligence & personality
  { text: 'Long-term memory (learns facts, groups them, edit/delete)', done: true },
  { text: 'Independent initiative (suggestions, quiet hours)', done: true },
  { text: 'Adaptive personality, humour and sarcasm', done: true },
  { text: 'Context awareness (active app, screen, what is playing)', done: true },
  { text: 'Natural follow-ups without the name', done: true },
  { text: 'Own opinions and recommendations', done: true },
  { text: 'Owns mistakes; knows its limits', done: true },
  { text: 'Remembers past conversations', done: true },
  { text: 'Curious questions now and then', done: true },
  { text: 'Mood from your words (voice tone itself: not reliable on a PC)', done: true },
  // PC control
  { text: 'Live screen awareness (all monitors)', done: true },
  { text: 'Agent Mode: mouse and keyboard, pause/resume, queue', done: true },
  { text: 'Troubleshooting: crash records, logs, error pop-ups', done: true },
  { text: 'Tidy Downloads / Desktop / Documents (with undo)', done: true },
  { text: 'Learns how your apps work (Agent Mode tips)', done: true },
  { text: 'Clipboard history and smart copy', done: true },
  { text: 'PC optimisation tips and benchmark', done: true },
  { text: 'Spots your habits and offers routines', done: true },
  { text: 'Routines from plain English', done: true },
  // Self-development
  { text: 'Reads its own code and logs; runs its own tests', done: true },
  { text: 'Approval-based updates, backups and restore', done: true },
  { text: 'Plugins (knowledge + routines, no code)', done: true },
  { text: 'Fully sandboxed code testing (only its own test suite)', done: false },
  // Voice
  { text: 'Custom wake words', done: true },
  { text: 'Interrupt it mid-sentence ("stop")', done: true },
  { text: 'Whisper mode and livelier voice', done: true },
  { text: 'Speaker recognition / voice login (not reliable enough to be safe)', done: false },
  // Proactive
  { text: 'Drive, internet and PC health alerts', done: true },
  { text: 'Background research', done: true },
  { text: 'Goals with progress', done: true },
  { text: 'Reminders when an app opens', done: true },
  // Gaming
  { text: 'Game crash investigation and Minecraft mod checks', done: true },
  { text: 'Gaming performance reports and per-game profiles', done: true },
  { text: 'Game-save backups', done: true },
  { text: 'Discord posting and Spotify', done: true },
  { text: 'Installed games: list and launch', done: true },
  // Security & interface
  { text: 'Privacy page, permissions, action history, emergency stop', done: true },
  { text: 'Offline AI (Ollama)', done: true },
  { text: 'Animated face with moods; dashboard choices; themes', done: true },
  // Mobile
  { text: 'Phone companion (chat, status, approve, stop, send files)', done: true },
  { text: 'Native phone app (the web app covers it for now)', done: false },
];
