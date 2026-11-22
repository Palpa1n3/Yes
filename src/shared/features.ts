/** What Alton on the phone can do and where each thing lives, for the Settings search box and
 *  for "what can you do?" (the alton_features tool). Keep `where` in step with phone/index.html. */

export type FeatureView = 'chat' | 'today' | 'work' | 'people' | 'pc' | 'set';

export interface Feature {
  name: string;
  where: string;
  view: FeatureView;
  /** Something to say or type to use it ('' = it's a screen, not a request). */
  say: string;
  /** Extra search words. */
  words: string;
}

export const FEATURES: Feature[] = [
  {
    name: 'Get my shifts',
    where: 'Work › Get my shifts',
    view: 'work',
    say: 'Add my shifts',
    words: 'rota schedule shift app screenshot calendar',
  },
  {
    name: 'Shift calendar and hours',
    where: 'Work',
    view: 'work',
    say: 'How many hours am I doing this month?',
    words: 'month hours rota calendar',
  },
  {
    name: 'Payday and pay estimate',
    where: 'Work › Alarms, pay & travel',
    view: 'work',
    say: 'How much will I get paid?',
    words: 'pay wage salary payday money tax',
  },
  {
    name: 'Shift alarms',
    where: 'Work › Alarms, pay & travel',
    view: 'work',
    say: 'Set my alarm for tomorrow’s shift',
    words: 'alarm wake up early',
  },
  {
    name: 'Sleep planner',
    where: 'Work › Sleep',
    view: 'work',
    say: 'When should I go to bed?',
    words: 'sleep bed bedtime tired nap night shift rest wind down',
  },
  {
    name: 'Open shifts and trades',
    where: 'Work › Get my shifts › Open shifts & trades',
    view: 'work',
    say: 'Any shifts up for grabs that fit?',
    words: 'shift trade swap overtime extra open shifts pick up',
  },
  {
    name: 'Your shift app',
    where: 'Work › Your shift app',
    view: 'work',
    say: '',
    words: 'rota app read accessibility auto charging',
  },
  {
    name: 'At work list',
    where: 'Work › At work list',
    view: 'work',
    say: 'Remind me at work to…',
    words: 'arrive workplace location shopping',
  },
  {
    name: 'Spending since payday',
    where: 'Today › Spending',
    view: 'today',
    say: 'How much have I spent since payday?',
    words: 'money spend spending bank budget monzo card',
  },
  {
    name: 'Bank apps for spending',
    where: 'Settings › Phone › Spending',
    view: 'set',
    say: '',
    words: 'bank notifications money track',
  },
  {
    name: 'Smart home (SmartThings)',
    where: 'Settings › Phone › Smart home',
    view: 'set',
    say: 'Turn the living room lights off',
    words: 'lights plug tv heating thermostat lock scene samsung smartthings home',
  },
  {
    name: 'Alarms and Alexa',
    where: 'Today › Alarm, and Settings › Phone › Alarms & Alexa',
    view: 'today',
    say: 'Set an alarm for 6',
    words: 'alarm echo alexa',
  },
  {
    name: 'Driving mode',
    where: 'Today › Driving mode',
    view: 'today',
    say: 'Driving mode',
    words: 'car hands-free drive',
  },
  {
    name: 'Directions',
    where: 'Chat',
    view: 'chat',
    say: 'How long to drive to Cardiff?',
    words: 'route map navigate journey traffic',
  },
  {
    name: 'Weather',
    where: 'Today › Weather',
    view: 'today',
    say: 'Will it rain later?',
    words: 'forecast rain temperature',
  },
  {
    name: 'Reminders',
    where: 'Lists › Lists › Reminders',
    view: 'people',
    say: 'Remind me to call the bank at 6',
    words: 'remind notification',
  },
  {
    name: 'Lists',
    where: 'Lists',
    view: 'people',
    say: 'Add milk to my shopping list',
    words: 'shopping todo list',
  },
  {
    name: 'Notes',
    where: 'Lists › Notes',
    view: 'people',
    say: 'Make a note…',
    words: 'note write',
  },
  {
    name: 'People',
    where: 'Lists › People',
    view: 'people',
    say: '',
    words: 'contacts friends family',
  },
  {
    name: 'Snapchat friends',
    where: 'Lists › People › Snapchat friends',
    view: 'people',
    say: 'Snapchat Sam: on my way',
    words: 'snap nicknames',
  },
  {
    name: 'Read and reply to messages',
    where: 'Settings › Phone › Phone access',
    view: 'set',
    say: 'Read my messages',
    words: 'texts whatsapp sms reply notifications',
  },
  {
    name: 'Messages read out',
    where: 'Settings › Phone › Messages',
    view: 'set',
    say: '',
    words: 'announce headphones quiet hours read aloud',
  },
  {
    name: 'Send messages by themselves',
    where: 'Settings › Phone › Messages',
    view: 'set',
    say: '',
    words: 'auto send confirm',
  },
  {
    name: 'Phone health',
    where: 'Settings › Phone health',
    view: 'set',
    say: 'Why is my phone slow?',
    words: 'slow hot battery drain lag keyboard diagnostics',
  },
  {
    name: 'Widgets',
    where: 'Settings › Phone › Widgets',
    view: 'today',
    say: '',
    words: 'widget home screen clock battery weather screen time',
  },
  {
    name: 'Lock screen wallpaper',
    where: 'Settings › Lock screen',
    view: 'set',
    say: '',
    words: 'wallpaper lock screen live',
  },
  {
    name: 'Look and background',
    where: 'Settings › Look',
    view: 'set',
    say: '',
    words: 'theme colour avatar background text size',
  },
  {
    name: 'Voice',
    where: 'Settings › Voice',
    view: 'set',
    say: '',
    words: 'speak voice fish audio speed',
  },
  {
    name: 'Personality',
    where: 'Settings › Personality',
    view: 'set',
    say: '',
    words: 'tone humour name',
  },
  {
    name: 'Claude model and spending limit',
    where: 'Settings › Claude & spending',
    view: 'set',
    say: '',
    words: 'haiku sonnet opus cost saver budget limit',
  },
  {
    name: 'Saved prompts',
    where: 'Settings › Saved prompts',
    view: 'set',
    say: '/fix',
    words: 'shortcuts slash commands',
  },
  {
    name: 'App lock and backup',
    where: 'Settings › Privacy & backup',
    view: 'set',
    say: '',
    words: 'pin lock backup restore delete',
  },
  {
    name: 'Updates',
    where: 'Settings › Updates › This app',
    view: 'set',
    say: '',
    words: 'update version apk install',
  },
  {
    name: 'Watch heads-ups',
    where: 'Settings › Phone › Watch & notifications',
    view: 'set',
    say: '',
    words: 'fitbit watch notification buzz morning summary leave evening',
  },
  {
    name: 'Update Alton’s code from a zip',
    where: 'Settings › Updates › Alton’s code from a zip',
    view: 'set',
    say: '',
    words: 'zip project code github push update',
  },
  {
    name: 'Wake my PC',
    where: 'PC › Connection',
    view: 'pc',
    say: '',
    words: 'wake on lan turn on computer sleeping',
  },
  {
    name: 'PC connection',
    where: 'PC › Connection',
    view: 'pc',
    say: '',
    words: 'pair tailscale sync computer',
  },
  {
    name: 'PC remote and Agent Mode',
    where: 'PC',
    view: 'pc',
    say: 'Handle this on my PC…',
    words: 'remote control screen agent power wake',
  },
  {
    name: 'Camera',
    where: 'Chat › 👁',
    view: 'chat',
    say: 'What’s this?',
    words: 'camera photo look see',
  },
];

const words = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 1);

/** Features matching a search ("bed", "money", "lights"), best first. */
export function findFeatures(query: string, list: Feature[] = FEATURES, max = 6): Feature[] {
  const q = words(query);
  if (!q.length) return [];
  return list
    .map((f) => {
      const hay = words(`${f.name} ${f.words} ${f.say}`);
      let score = 0;
      for (const w of q)
        if (hay.includes(w)) score += 2;
        else if (hay.some((h) => h.startsWith(w) || (w.length > 3 && h.includes(w)))) score += 1;
      return { f, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.f);
}

/** For Claude: everything (or the matches), one per line. */
export function featuresText(query = ''): string {
  const list = query.trim() ? findFeatures(query, FEATURES, 10) : FEATURES;
  return (list.length ? list : FEATURES)
    .map((f) => `${f.name} — ${f.where}${f.say ? ` — try “${f.say}”` : ''}`)
    .join('\n');
}
