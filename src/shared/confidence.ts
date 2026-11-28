/** Knowing when an answer needs checking: questions about facts that change (prices, opening
 *  times, "latest", news, results, release dates, delays…) get a note to look them up first and
 *  say where the answer came from. Pure; tested in tests/confidence.test.ts. */

const CHANGING: Array<[RegExp, string]> = [
  [
    /\b(price|prices|cost|costs|how much|cheapest|deal|deals|discount|in stock|sold out)\b/i,
    'prices and stock',
  ],
  [
    /\b(latest|newest|most recent|current version|patch notes|update(d)? (to|for))\b/i,
    'the latest version or news',
  ],
  [
    /\b(open (now|today|tomorrow|on)|opening (times|hours)|close[sd]? (at|today)|what time does .* (open|close))\b/i,
    'opening times',
  ],
  [/\b(news|headlines|what happened|election|announced)\b/i, 'news'],
  [/\b(score|result|who won|fixture|kick[- ]?off|league table)\b/i, 'results and fixtures'],
  [/\b(release date|come out|coming out|launch date|out yet)\b/i, 'release dates'],
  [/\b(train|bus|flight|delay(s|ed)?|cancell?ed|traffic|roadworks)\b/i, 'travel'],
  [
    /\b(exchange rate|interest rate|stock price|share price|bitcoin|crypto)\b/i,
    'rates and markets',
  ],
  [/\b(is .{1,30} down|outage|servers? (up|down))\b/i, 'whether a service is down'],
];

/** For things Alton has its own tools for, no web check is needed. */
const OWN_TOOLS =
  /\b(weather|forecast|rain|my calendar|my shifts?|my emails?|my timers?|what time is it|the time)\b/i;

/** What in this message depends on changing facts (empty: nothing). */
export function changingFacts(text: string): string[] {
  if (OWN_TOOLS.test(text)) return [];
  return [...new Set(CHANGING.filter(([re]) => re.test(text)).map(([, what]) => what))];
}

/** The note added for this one message, or '' when it isn't needed. */
export function checkFirstNote(text: string): string {
  const what = changingFacts(text);
  if (!what.length) return '';
  return `This message depends on facts that change (${what.join(', ')}). Check with a web search before answering, mention where the answer came from, and if you can't check, say you're not sure rather than guessing.`;
}

/** The standing rule about certainty (part of every chat's instructions). */
export const CERTAINTY_RULE =
  'If you are not sure, say so briefly instead of guessing; never invent facts, numbers, names, links or quotes. If a request could mean different things and doing the wrong one would matter, ask one short question first.';
