import type { NormalizedRace, NormalizedUnit, RaceDef } from "../types";
import { normCounty } from "../names";
import { statewideFips } from "../states";
import countyIndex from "../countyIndex.json";
import { foldMinor, RaceBuilder, sumUnits } from "./candidates";
import { parseUsDateTime } from "./time";

/**
 * Vermont Secretary of State election-night site (electionresults.vermont.gov). Its data is
 * static JSON under VT_BASE:
 *   elections/elections.json      every election; pick the statewide general for the year
 *   elections/<guid>.json         that election's index (VtElection): which town is in which
 *                                 county, when it was last updated, and where the results files are
 *   <index.stateWide.path>        statewide offices (VtStatewide), one row per town or town district
 * Vermont counts by town, so towns are summed into counties using the state's own town list.
 */
export const VT_BASE = "https://static.electionresults.vermont.gov";
export const vtElectionsUrl = `${VT_BASE}/elections/elections.json`;
export const vtElectionUrl = (guid: string) => `${VT_BASE}/elections/${guid}.json`;
/** Paths in the index use backslashes. */
export const vtFileUrl = (path: string) => `${VT_BASE}/${path.replace(/\\/g, "/")}`;

export interface VtElectionListing { electionGuid: string; electionYear: number; isStateWideElection: boolean; isGeneralElection: boolean }
export interface VtElection {
  stateWide?: { isEnable: boolean; path?: string };
  townDistricts: { townName: string; countyName: string }[];
  lastUpdatedDate?: string;
}
interface VtCandidate { cn: string; vc: number; pn?: string | null }
export interface VtStatewide {
  d: { o: { on: string; cs: { tn: string; distReported?: string | null; rc?: VtCandidate[]; wc?: VtCandidate[] }[] }[] }[];
}

export const pickVtElection = (list: VtElectionListing[], year: number) =>
  list.find((e) => e.electionYear === year && e.isStateWideElection && e.isGeneralElection);

const INDEX = (countyIndex as Record<string, Record<string, string>>).VT;
const title = (s: string) => s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());

export function normalizeVtSos(election: VtElection, results: VtStatewide, race: RaceDef, fetchedAt: string): NormalizedRace | null {
  const src = race.sources.vtsos;
  const office = src && results.d?.flatMap((d) => d.o).find((o) => o.on.trim().toLowerCase() === src.office.toLowerCase());
  if (!office) return null;
  const countyOf = new Map(election.townDistricts.map((t) => [t.townName.trim().toUpperCase(), t.countyName]));
  const b = new RaceBuilder(race);
  const unmatched = new Set<string>();
  const countyNames = new Map<string, string>();
  office.cs.forEach((row, i) => {
    const town = row.tn.trim();
    // The list ends with the state's own total, printed as a town called "STATE WIDE".
    if (/^state ?wide$/i.test(town)) {
      for (const c of row.rc ?? []) b.add("__state", { fips: statewideFips("VT"), unitName: "Statewide" }, c.cn, c.pn ?? undefined, c.vc);
      for (const c of row.wc ?? []) b.add("__state", { fips: statewideFips("VT"), unitName: "Statewide" }, c.cn, "write-in", c.vc);
      return;
    }
    const county = countyOf.get(town.toUpperCase());
    const fips = county ? INDEX[normCounty(county)] : undefined;
    if (!fips) unmatched.add(town);
    else countyNames.set(fips, `${title(county!)} County`);
    // "3/4" = districts of this town that have reported.
    const p = row.distReported?.match(/^(\d+)\/(\d+)$/);
    const unit = { fips: fips ?? "", unitName: town, ...(p ? { precinctsReporting: Number(p[1]), precinctsTotal: Number(p[2]) } : {}) };
    // A town split between districts has one row per district: keep them apart so each row's count is read once.
    const key = `${fips ? `t:${fips}` : "u"}:${town}:${i}`;
    for (const c of row.rc ?? []) b.add(key, unit, c.cn, c.pn ?? undefined, c.vc);
    for (const c of row.wc ?? []) b.add(key, unit, c.cn, "write-in", c.vc);
  });
  const stateRow = b.units.get("__state");
  const all = [...b.units.entries()].filter(([k]) => k !== "__state").map(([, u]) => u);
  if (!all.length && !stateRow) return null;
  const byCounty = new Map<string, NormalizedUnit[]>();
  for (const u of all) if (u.fips) byCounty.set(u.fips, [...(byCounty.get(u.fips) ?? []), u]);
  const counties = [...byCounty].map(([fips, units]) => sumUnits(units, fips, countyNames.get(fips) ?? fips));
  // Precinct counts come from the towns; the vote totals from the state's row when it has one.
  const summed = sumUnits(all, statewideFips("VT"), "Statewide");
  const statewide = stateRow ? { ...summed, votes: stateRow.votes, total: stateRow.total } : summed;
  return foldMinor({
    raceId: race.id,
    candidates: [...b.candidates.values()],
    statewide,
    counties: counties.length ? counties : [{ ...statewide }],
    unmatchedUnits: [...unmatched],
    source: {
      name: "Vermont Secretary of State", url: "https://electionresults.vermont.gov/",
      updatedAt: parseUsDateTime(election.lastUpdatedDate, 5), fetchedAt,
    },
  });
}
