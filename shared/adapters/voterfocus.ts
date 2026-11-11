import type { NormalizedCandidate, RaceDef } from "../types";
import { parseCsv } from "../csv";
import { RaceBuilder } from "./candidates";

/**
 * VR Systems "Voter Focus" election-night sites, which most Florida county Supervisors of
 * Elections use: https://enr.electionsfl.org/<county code>/<election id>/Summary/.
 *   /<code>/<id>/Precincts            lists the election's races (a <select id="raceSelect">)
 *   /<code>/<id>/Precincts/<raceId>/  one race, every precinct on one page: a block per precinct
 *                                     listing choices and votes (as a "graphical" list, a
 *                                     "detailed" table, or both, depending on the county)
 *   /<code>/<id>/Reports              on some counties, links a "Candidate Results by Precinct
 *                                     and Party (CSV)": Contest, Candidate Issue, Party,
 *                                     Precinct Name, ..., Total Votes
 * Plain HTML, no script needed. The largest counties show one precinct per page instead; for
 * those only the CSV is usable. The per-vote-type columns show "-" for small groups (Florida
 * Statute 98.0981), so only totals are read.
 */
export const voterFocusReportsUrl = (code: string, electionId: string) => `https://enr.electionsfl.org/${code}/${electionId}/Reports`;

/** The precinct CSV's address, from the Reports page (it changes every time the county republishes). */
export function findVoterFocusCsv(reportsHtml: string): string | undefined {
  return reportsHtml.match(/href="([^"]+CandidateResultsbyPrecinctandParty[^"]+\.csv)"/i)?.[1].replace(/&amp;/g, "&");
}
export const voterFocusPrecinctsUrl = (code: string, electionId: string, raceId = "") =>
  `https://enr.electionsfl.org/${code}/${electionId}/Precincts/${raceId ? `${raceId}/` : ""}`;

const text = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();

/** The election's name and date as the page prints them: "2026 General Election 11/3/2026". */
export function voterFocusElection(html: string): string {
  const body = text(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " "));
  return body.match(/([^.]{0,80}?)\s*Election Date:\s*([\d/]+)/)?.slice(1).join(" ").replace(/^.*Learn More\s*/, "").trim() ?? "";
}

/** The id of the race whose name matches, from the race picker on the Precincts page. */
export function findVoterFocusRace(precinctsHtml: string, contest: RegExp): string | undefined {
  const picker = precinctsHtml.match(/<select[^>]*id="raceSelect"[\s\S]*?<\/select>/)?.[0] ?? "";
  for (const m of picker.matchAll(/<option[^>]*value="(\d+)"[^>]*>([\s\S]*?)<\/option>/g)) if (contest.test(text(m[2]))) return m[1];
  return undefined;
}

/** Results for one unit smaller than a county. */
export interface PrecinctUnit { county: string; name: string; total: number; votes: Record<string, number> }

const units = (b: RaceBuilder) => ({
  candidates: [...b.candidates.values()],
  precincts: [...b.units.values()].map((u) => ({ county: u.fips, name: u.unitName, total: u.total, votes: u.votes })),
});

/** One race's page -> a unit per precinct. Choices print as "Byron Donalds / Bryan Avila (REP)". */
export function normalizeVoterFocus(raceHtml: string, race: RaceDef, countyFips: string): { candidates: NormalizedCandidate[]; precincts: PrecinctUnit[] } {
  const b = new RaceBuilder(race);
  for (const block of raceHtml.split(/class="PrecinctName">/).slice(1)) {
    const name = text(block.slice(0, block.indexOf("</span>")));
    if (!name) continue;
    // The same numbers can appear twice (list and table), and some counties fill only one: read both, keep the fuller.
    const list = [...block.matchAll(/class="ChoiceColumn col[^"]*">([\s\S]*?)<\/div>[\s\S]*?ResultsColumn[^>]*>[^<]*<\/div>\s*<div class="ResultsColumn[^>]*>\s*([\d,]+)\s*<\/div>/g)];
    const table = [...(block.match(/<table class="DetailResults"[\s\S]*?<\/table>/)?.[0] ?? "").matchAll(/<td class="ChoiceColumn">([\s\S]*?)<div[\s\S]*?TotalVotes">\s*([\d,]+)\s*<\/td>/g)];
    const sum = (rows: RegExpMatchArray[]) => rows.reduce((s, r) => s + Number(r[2].replace(/,/g, "")), 0);
    for (const row of sum(list) >= sum(table) ? list : table) {
      b.add(name, { fips: countyFips, unitName: name }, text(row[1]), undefined, Number(row[2].replace(/,/g, "")));
    }
  }
  return units(b);
}

/** True when a race page offers a precinct picker instead of listing every precinct. */
export const voterFocusOnePrecinctPerPage = (raceHtml: string) => /id="precinctSelect"/.test(raceHtml);

/** The county's precinct CSV -> a unit per precinct for the matching contest. */
export function normalizeVoterFocusCsv(csvText: string, race: RaceDef, contest: RegExp, countyFips: string): { candidates: NormalizedCandidate[]; precincts: PrecinctUnit[] } {
  const b = new RaceBuilder(race);
  for (const r of parseCsv(csvText)) {
    if (!contest.test((r["Contest"] ?? "").trim().replace(/\s+/g, " "))) continue;
    const name = (r["Precinct Name"] ?? "").trim();
    // Party "STATS" rows are over- and undervotes: ballots, not votes for anyone.
    if (!name || /^stats$/i.test((r["Party"] ?? "").trim())) continue;
    b.add(name, { fips: countyFips, unitName: name }, r["Candidate Issue"] ?? "", r["Party"], Number((r["Total Votes"] ?? "").replace(/,/g, "")));
  }
  return units(b);
}
