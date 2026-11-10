import type { NormalizedRace, RaceDef } from "../types";
import { normCounty } from "../names";
import { FIPS_BY_POSTAL, STATES, statewideFips } from "../states";
import countyIndex from "../countyIndex.json";
import { foldMinor, RaceBuilder, sumUnits } from "./candidates";

/**
 * "TotalVote" election-night sites, the platform Nebraska, New Mexico and South Dakota's
 * Secretaries of State all use. The county map on each contest is drawn from
 *   GET <service>/GetMapData?type=<type>&category=CTY&raceID=<raceID>&osn=<osn>&county=0&party=0
 * which returns one row per county per candidate. Some states wrap the rows in { d: [...] } and
 * send numbers as numbers; New Mexico sends a bare array with votes as strings.
 * type, raceID and osn are the arguments of the contest's "County Results" button on the site.
 */
export interface TotalVoteRow {
  CountyName: string; calcCandidate: string; PartyCode?: string; calcCandidateVotes: number | string;
  PrecinctsReporting?: number | string; TotalPrecincts?: number | string;
}
export type TotalVoteResponse = TotalVoteRow[] | { d: TotalVoteRow[] };

export const totalVoteUrl = (s: NonNullable<RaceDef["sources"]["totalvote"]>) =>
  `${s.service}/GetMapData?type=${s.type}&category=CTY&raceID=${s.raceID}&osn=${s.osn}&county=0&party=0`;

const INDEX = countyIndex as Record<string, Record<string, string>>;
const num = (v: number | string | undefined) => (v === undefined || v === "" ? undefined : Number(v));

export function normalizeTotalVote(json: TotalVoteResponse, race: RaceDef, fetchedAt: string): NormalizedRace | null {
  const src = race.sources.totalvote;
  const rows = Array.isArray(json) ? json : json?.d;
  if (!src || !rows?.length) return null;
  const idx = INDEX[race.state] ?? {};
  const b = new RaceBuilder(race);
  const unmatched = new Set<string>();
  for (const r of rows) {
    const name = r.CountyName.trim();
    const fips = idx[normCounty(name)];
    if (!fips) unmatched.add(name);
    b.add(
      fips ? `c:${fips}` : `u:${name}`,
      { fips: fips ?? "", unitName: name, precinctsReporting: num(r.PrecinctsReporting), precinctsTotal: num(r.TotalPrecincts) },
      r.calcCandidate, r.PartyCode, Number(r.calcCandidateVotes),
    );
  }
  const all = [...b.units.entries()];
  const counties = all.filter(([k]) => k.startsWith("c:")).map(([, u]) => u);
  // The feed has no statewide row: the state is the sum of its counties.
  const statewide = sumUnits(all.map(([, u]) => u), statewideFips(race.state), "Statewide");
  return foldMinor({
    raceId: race.id,
    candidates: [...b.candidates.values()],
    statewide,
    counties: counties.length ? counties : [{ ...statewide }],
    unmatchedUnits: [...unmatched],
    source: { name: `${STATES[FIPS_BY_POSTAL[race.state]].name} Secretary of State`, url: src.url, fetchedAt },
  });
}
