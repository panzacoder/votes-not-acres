import type { NormalizedRace, RaceDef } from "../types";
import { normCounty } from "../names";
import { statewideFips } from "../states";
import countyIndex from "../countyIndex.json";
import { foldMinor, RaceBuilder, sumUnits } from "./candidates";

/**
 * California Secretary of State election-night API. Pushbuild carries only California's
 * statewide row, so the county breakdown comes straight from the state:
 *   GET https://api.sos.ca.gov/returns/<contest>/county/all
 * returns one entry for the state and one per county, each shaped like CaSosUnit. Numbers
 * arrive as display strings ("7,455,979", "100% (627 of 627) precincts reporting").
 */
export interface CaSosCandidate { Name: string; Party?: string; Votes: string }
export interface CaSosUnit { raceTitle: string; Reporting?: string; ReportingTime?: string; candidates: CaSosCandidate[] }

const INDEX = (countyIndex as Record<string, Record<string, string>>).CA;
const int = (s: string | undefined) => Number((s ?? "").replace(/[^\d]/g, "")) || 0;
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "November 10, 2026, 11:46 a.m." (Pacific time) -> ISO 8601 in UTC. */
export function parseCaSosTime(s: string | undefined): string | undefined {
  const m = s?.match(/^(\w+)\s+(\d{1,2}),\s*(\d{4}),\s*(\d{1,2}):(\d{2})\s*([ap])\.?m\.?$/i);
  if (!m) return undefined;
  const month = MONTHS.indexOf(m[1].toLowerCase());
  if (month < 0) return undefined;
  const [day, year, minute] = [Number(m[2]), Number(m[3]), Number(m[5])];
  const hour = (Number(m[4]) % 12) + (m[6].toLowerCase() === "p" ? 12 : 0);
  // Daylight time runs from the second Sunday of March to the first Sunday of November, changing at 2 a.m.
  const nthSunday = (mo: number, n: number) => 1 + ((7 - new Date(Date.UTC(year, mo, 1)).getUTCDay()) % 7) + 7 * (n - 1);
  const local = Date.UTC(year, month, day, hour, minute);
  const dst = local >= Date.UTC(year, 2, nthSunday(2, 2), 2) && local < Date.UTC(year, 10, nthSunday(10, 1), 2);
  return new Date(local + (dst ? 7 : 8) * 3_600_000).toISOString();
}

export function normalizeCaSos(units: CaSosUnit[], race: RaceDef, fetchedAt: string): NormalizedRace | null {
  const contest = race.sources.casos?.contest;
  if (!contest || !units.length) return null;
  const b = new RaceBuilder(race);
  const unmatched: string[] = [];
  let updatedAt: string | undefined;
  for (const u of units) {
    // "Governor - Statewide Results", "Governor - Alameda County Results"
    const place = u.raceTitle.replace(/^.*?\s-\s/, "").replace(/\s+Results$/i, "").trim();
    const isState = /^statewide$/i.test(place);
    const fips = isState ? statewideFips("CA") : INDEX[normCounty(place)] ?? "";
    if (!fips) unmatched.push(place);
    const p = u.Reporting?.match(/\(([\d,]+) of ([\d,]+)\)/);
    const precincts = p ? { precinctsReporting: int(p[1]), precinctsTotal: int(p[2]) } : {};
    const time = parseCaSosTime(u.ReportingTime);
    if (time && (!updatedAt || time > updatedAt)) updatedAt = time;
    for (const c of u.candidates) {
      b.add(
        isState ? "__state" : fips ? `c:${fips}` : `u:${place}`,
        { fips, unitName: isState ? "Statewide" : place.replace(/\s+County$/i, ""), ...precincts },
        c.Name, c.Party, int(c.Votes),
      );
    }
  }
  const all = [...b.units.entries()];
  const counties = all.filter(([k]) => k.startsWith("c:")).map(([, u]) => u);
  const statewide = b.units.get("__state") ?? (counties.length ? sumUnits(counties, statewideFips("CA"), "Statewide") : null);
  return foldMinor({
    raceId: race.id,
    candidates: [...b.candidates.values()],
    statewide,
    counties: counties.length ? counties : statewide ? [{ ...statewide }] : [],
    unmatchedUnits: unmatched,
    source: { name: "California Secretary of State", url: `https://electionresults.sos.ca.gov/returns/${contest}`, updatedAt, fetchedAt },
  });
}
