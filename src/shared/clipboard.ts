/** Recent copied text (kept in memory only; cleared when ARC quits). */
export interface ClipItem {
  id: string;
  text: string;
  at: number;
  /** Looks like a password or key: never shown to Claude, blurred in the panel. */
  sensitive: boolean;
}

export const MAX_CLIPS = 50;

/** One "word" with a mix of letters, digits and symbols, or an API-key/token shape. */
export function looksSecret(text: string): boolean {
  const t = text.trim();
  if (/^(sk-|ghp_|gho_|xox[bp]-|AKIA|eyJ)[\w.-]{10,}$/.test(t)) return true;
  if (/\s/.test(t) || t.length < 8 || t.length > 64) return false;
  if (/^https?:\/\//i.test(t)) return false;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^\w]/].filter((re) => re.test(t)).length;
  return kinds >= 3;
}

export type ClipKind =
  'link' | 'email' | 'phone' | 'tracking' | 'address' | 'code' | 'long' | 'text';

/** What a copied bit of text looks like, so the panel can offer the right one-click action. */
export function clipKind(text: string): ClipKind {
  const t = text.trim();
  if (/^https?:\/\/\S+$/i.test(t)) return 'link';
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(t)) return 'email';
  if (/^\+?[\d\s()-]{9,16}$/.test(t) && (t.match(/\d/g) ?? []).length >= 9) return 'phone';
  if (/^(1Z[0-9A-Z]{16}|[A-Z]{2}\d{9}[A-Z]{2}|\d{12,22}|JD\d{16,18})$/.test(t.replace(/\s/g, '')))
    return 'tracking';
  if (/\b[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}\b/i.test(t) && t.length < 160) return 'address'; // UK postcode
  if (
    /[{};]\s*$|^\s*(const|let|function|def|class|import|#include|public|SELECT)\b/m.test(t) &&
    t.includes('\n')
  )
    return 'code';
  if (t.length > 400) return 'long';
  return 'text';
}

/** The action offered for a kind: open something, or ask Alton about it. */
export function clipAction(text: string): { label: string; url?: string; ask?: string } | null {
  const t = text.trim();
  switch (clipKind(t)) {
    case 'link':
      return { label: 'Open', url: t };
    case 'email':
      return { label: 'Email', url: `mailto:${t}` };
    case 'tracking':
      return {
        label: 'Track',
        url: `https://www.google.com/search?q=${encodeURIComponent(`track parcel ${t}`)}`,
      };
    case 'address':
      return { label: 'Map', url: `https://www.google.com/maps/search/${encodeURIComponent(t)}` };
    case 'code':
      return {
        label: 'Explain',
        ask: `Explain this code simply and point out any bugs:\n\n${t.slice(0, 4000)}`,
      };
    case 'long':
      return {
        label: 'Summarise',
        ask: `Summarise this for me in a few bullet points:\n\n${t.slice(0, 6000)}`,
      };
    default:
      return null;
  }
}
