const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
export const monthIndex = (name: string) => MONTHS.indexOf(name.toLowerCase());

/**
 * A wall-clock time in a US time zone -> ISO 8601 in UTC. `standardOffset` is the zone's
 * hours behind UTC in winter (Eastern 5, Central 6, Mountain 7, Pacific 8). Daylight time runs
 * from the second Sunday of March to the first Sunday of November, changing at 2 a.m.
 */
export function usLocalToIso(year: number, month: number, day: number, hour: number, minute: number, standardOffset: number, second = 0): string {
  const nthSunday = (mo: number, n: number) => 1 + ((7 - new Date(Date.UTC(year, mo, 1)).getUTCDay()) % 7) + 7 * (n - 1);
  const local = Date.UTC(year, month, day, hour, minute, second);
  const dst = local >= Date.UTC(year, 2, nthSunday(2, 2), 2) && local < Date.UTC(year, 10, nthSunday(10, 1), 2);
  return new Date(local + (standardOffset - (dst ? 1 : 0)) * 3_600_000).toISOString();
}

/** "11/10/2026 03:48 PM" or "11/03/2026 08:48:49 PM" -> ISO 8601 in UTC. */
export function parseUsDateTime(s: string | undefined, standardOffset: number): string | undefined {
  const m = s?.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP])M$/i);
  if (!m) return undefined;
  const hour = (Number(m[4]) % 12) + (m[7].toUpperCase() === "P" ? 12 : 0);
  return usLocalToIso(Number(m[3]), Number(m[1]) - 1, Number(m[2]), hour, Number(m[5]), standardOffset, Number(m[6] ?? 0));
}
