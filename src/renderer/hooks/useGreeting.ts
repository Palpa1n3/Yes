import { dayPart, type DayPart } from '@shared/personalities';
import { useClock } from './useClock';

export { dayPart };
export type { DayPart };

const SALUTATION: Record<DayPart, string> = {
  morning: 'Good morning',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
  lateNight: 'Working late again',
};

/** Header salutation for the current time of day (the personality adds the title). */
export function useGreeting(): { salutation: string; part: DayPart } {
  const now = useClock(60_000);
  const part = dayPart(now.getHours());
  return { salutation: SALUTATION[part], part };
}
