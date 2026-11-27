/** Which IMAP server goes with an email address, and how to sign in to it. Alton reads mail over
 *  IMAP (read-only), which nearly every provider offers. Pure; tested in tests/mail-servers.test.ts. */

export interface MailServer {
  provider: string;
  host: string;
  port: number;
  /** TLS from the start (993); false = STARTTLS (143, or a local bridge). */
  secure: boolean;
  /** Where to read mail in a browser. */
  webmail: string;
  /** How to get the password Alton needs. */
  howTo: string;
  /** Microsoft's own sign-in only: a password can't work. */
  passwordBlocked?: boolean;
  /** A local app (Proton Mail Bridge) with its own certificate. */
  local?: boolean;
  /** Found from the domain (not a known provider): the next guess is tried if it fails. */
  guess?: boolean;
}

const APP_PW = (where: string): string =>
  `Needs an “app password” (not your normal password): ${where}. Paste it here.`;

const KNOWN: Array<{ domains: RegExp; server: Omit<MailServer, 'guess'> }> = [
  {
    domains: /^(gmail|googlemail)\.com$/,
    server: {
      provider: 'Gmail',
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      webmail: 'https://mail.google.com',
      howTo: APP_PW(
        'myaccount.google.com › Security › 2-Step Verification (turn it on) › App passwords › create one called Alton (16 letters)',
      ),
    },
  },
  {
    domains: /^(outlook|hotmail|live|msn|windowslive)\.(com|co\.uk|fr|de|it|es)$/,
    server: {
      provider: 'Outlook.com',
      host: 'outlook.office365.com',
      port: 993,
      secure: true,
      webmail: 'https://outlook.live.com',
      howTo:
        'Microsoft switched off password sign-in for mail apps on Outlook.com and Hotmail in 2024: it only allows its own sign-in, which Alton can’t use yet. A work address on your own domain may still work through its mail server.',
      passwordBlocked: true,
    },
  },
  {
    domains: /^(yahoo|ymail|rocketmail)\.(com|co\.uk|fr|de|it|es|ca|com\.au)$/,
    server: {
      provider: 'Yahoo Mail',
      host: 'imap.mail.yahoo.com',
      port: 993,
      secure: true,
      webmail: 'https://mail.yahoo.com',
      howTo: APP_PW('Yahoo › Account info › Account security › Generate app password'),
    },
  },
  {
    domains: /^(icloud|me|mac)\.com$/,
    server: {
      provider: 'iCloud Mail',
      host: 'imap.mail.me.com',
      port: 993,
      secure: true,
      webmail: 'https://www.icloud.com/mail',
      howTo: APP_PW(
        'appleid.apple.com › Sign-In and Security › App-Specific Passwords; sign in with your full iCloud address',
      ),
    },
  },
  {
    domains: /^aol\.(com|co\.uk)$/,
    server: {
      provider: 'AOL Mail',
      host: 'imap.aol.com',
      port: 993,
      secure: true,
      webmail: 'https://mail.aol.com',
      howTo: APP_PW('AOL › Account security › Generate app password'),
    },
  },
  {
    domains: /^(proton|protonmail|pm)\.(me|com|ch)$/,
    server: {
      provider: 'Proton Mail',
      host: '127.0.0.1',
      port: 1143,
      secure: false,
      local: true,
      webmail: 'https://mail.proton.me',
      howTo:
        'Proton only works through its free Proton Mail Bridge app on this PC (needs a paid plan): open Bridge, pick your address, and paste the password Bridge shows (not your Proton password).',
    },
  },
  {
    domains: /^(btinternet|btopenworld|talk21)\.com$/,
    server: {
      provider: 'BT Mail',
      host: 'mail.btinternet.com',
      port: 993,
      secure: true,
      webmail: 'https://www.bt.com/email',
      howTo: 'Use your BT Mail password (BT may ask you to create a separate one for mail apps).',
    },
  },
  {
    domains: /^sky\.com$/,
    server: {
      provider: 'Sky Mail',
      host: 'imap.tools.sky.com',
      port: 993,
      secure: true,
      webmail: 'https://www.sky.com/email',
      howTo: 'Use your Sky ID password.',
    },
  },
  {
    domains: /^(virginmedia|virgin|ntlworld|blueyonder)\.(com|net|co\.uk)$/,
    server: {
      provider: 'Virgin Media Mail',
      host: 'imap.virginmedia.com',
      port: 993,
      secure: true,
      webmail: 'https://www.virginmedia.com/email',
      howTo: 'Use your Virgin Media mail password.',
    },
  },
  {
    domains: /^talktalk\.net$/,
    server: {
      provider: 'TalkTalk Mail',
      host: 'imap.talktalk.net',
      port: 993,
      secure: true,
      webmail: 'https://mail.talktalk.co.uk',
      howTo: 'Use your TalkTalk mail password.',
    },
  },
  {
    domains: /^gmx\.(com|co\.uk|net|de|at|ch)$/,
    server: {
      provider: 'GMX',
      host: 'imap.gmx.com',
      port: 993,
      secure: true,
      webmail: 'https://www.gmx.com',
      howTo: 'Turn on “POP3/IMAP access” in GMX’s mail settings first, then use your GMX password.',
    },
  },
  {
    domains: /^mail\.com$/,
    server: {
      provider: 'mail.com',
      host: 'imap.mail.com',
      port: 993,
      secure: true,
      webmail: 'https://www.mail.com',
      howTo: 'Turn on IMAP in mail.com’s settings (POP3 & IMAP), then use your password.',
    },
  },
  {
    domains: /^(zoho|zohomail)\.(com|eu)$/,
    server: {
      provider: 'Zoho Mail',
      host: 'imap.zoho.eu',
      port: 993,
      secure: true,
      webmail: 'https://mail.zoho.eu',
      howTo: APP_PW(
        'Zoho › My Account › Security › App Passwords (turn on IMAP in Zoho Mail settings)',
      ),
    },
  },
  {
    domains: /^(fastmail|fastmail\.fm|messagingengine)\.com$|^fastmail\.fm$/,
    server: {
      provider: 'Fastmail',
      host: 'imap.fastmail.com',
      port: 993,
      secure: true,
      webmail: 'https://app.fastmail.com',
      howTo: APP_PW('Fastmail › Settings › Privacy & Security › App passwords'),
    },
  },
  {
    domains: /^yandex\.(com|ru)$/,
    server: {
      provider: 'Yandex Mail',
      host: 'imap.yandex.com',
      port: 993,
      secure: true,
      webmail: 'https://mail.yandex.com',
      howTo: APP_PW('Yandex ID › Security › App passwords (turn on IMAP in Mail settings)'),
    },
  },
];

const domainOf = (address: string): string => address.trim().toLowerCase().split('@')[1] ?? '';

/** The servers to try for an address: a known provider's, or likely names for its domain. */
export function mailServersFor(address: string): MailServer[] {
  const domain = domainOf(address);
  if (!domain) return [];
  const known = KNOWN.find((k) => k.domains.test(domain));
  if (known) return [known.server];
  const base = {
    provider: domain,
    port: 993,
    secure: true,
    webmail: `https://${domain}`,
    howTo:
      'Use your email password (or an app password if your provider has two-step sign-in). If it can’t connect, add your provider’s IMAP server below: their help pages list it.',
    guess: true,
  };
  return [`imap.${domain}`, `mail.${domain}`, domain].map((host) => ({ ...base, host }));
}

/** A server typed in by hand ("imap.example.com" or "imap.example.com:143"). */
export function manualServer(address: string, text: string): MailServer | null {
  const m = /^\s*([a-z0-9.-]+\.[a-z]{2,}|\d{1,3}(?:\.\d{1,3}){3})(?::(\d{2,5}))?\s*$/i.exec(text);
  if (!m?.[1]) return null;
  const port = m[2] ? Number(m[2]) : 993;
  const local = /^(127\.0\.0\.1|localhost)$/i.test(m[1]);
  return {
    provider: mailServersFor(address)[0]?.provider ?? m[1],
    host: m[1].toLowerCase(),
    port,
    secure: port === 993,
    webmail: mailServersFor(address)[0]?.webmail ?? '',
    howTo: '',
    ...(local ? { local: true } : {}),
  };
}

/** The sign-in instructions for an address (shown before connecting). */
export const signInHelp = (address: string): string => mailServersFor(address)[0]?.howTo ?? '';
