import type { NormalizedCandidate, RaceDef } from "../types";
import { parseCsv } from "../csv";
import { RaceBuilder } from "./candidates";

/**
 * VR Systems "Voter Focus" election-night sites, which most Florida county Supervisors of
 * Elections use: https://enr.electionsfl.org/<county code>/<election id>/Summary/.
 * The Reports page of each election links a "Candidate Results by Precinct and Party (CSV)":
 *   Contest, Candidate Issue, Party, Precinct Name, Provisional Votes, Mail Votes, Early Votes,
 *   Election Day Votes, Total Votes, % of Total Votes
 * one row per contest, candidate and precinct. The vote-type columns are "-" where a group is
 * small (Florida Statute 98.0981), so only Total Votes is read.
 */
export const voterFocusReportsUrl = (code: string, electionId: string) => `https://enr.electionsfl.org/${code}/${electionId}/Reports`;

/** The precinct CSV's address, from the Reports page (it changes every time the county republishes). */
export function findVoterFocusCsv(reportsHtml: string): string | undefined {
  return reportsHtml.match(/href="([^"]+CandidateResultsbyPrecinctandParty[^"]+\.csv)"/i)?.[1].replace(/&amp;/g, "&");
}

/** The election's name and date as the page prints them: "2026 General Election 11/3/2026". */
export function voterFocusElection(html: string): string {
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  return text.match(/([^.]{0,80}?)\s*Election Date:\s*([\d/]+)/)?.slice(1).join(" ").replace(/^.*Learn More\s*/, "").trim() ?? "";
}

/** Results for one unit smaller than a county. */
export interface PrecinctUnit { county: string; name: string; total: number; votes: Record<string, number> }

export function normalizeVoterFocus(csvText: string, race: RaceDef, contest: RegExp, countyFips: string): { candidates: NormalizedCandidate[]; precincts: PrecinctUnit[] } {
  const b = new RaceBuilder(race);
  for (const r of parseCsv(csvText)) {
    if (!contest.test((r["Contest"] ?? "").trim().replace(/\s+/g, " "))) continue;
    const name = (r["Precinct Name"] ?? "").trim();
    // Party "STATS" rows are over- and undervotes: ballots, not votes for anyone.
    if (!name || /^stats$/i.test((r["Party"] ?? "").trim())) continue;
    b.add(name, { fips: countyFips, unitName: name }, r["Candidate Issue"] ?? "", r["Party"], Number((r["Total Votes"] ?? "").replace(/,/g, "")));
  }
  return {
    candidates: [...b.candidates.values()],
    precincts: [...b.units.values()].map((u) => ({ county: u.fips, name: u.unitName, total: u.total, votes: u.votes })),
  };
}
