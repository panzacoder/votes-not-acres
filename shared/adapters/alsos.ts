import type { NormalizedRace, RaceDef } from "../types";
import { normCounty } from "../names";
import { statewideFips } from "../states";
import countyIndex from "../countyIndex.json";
import { foldMinor, RaceBuilder, sumUnits } from "./candidates";
import { parseUsDateTime } from "./time";

/**
 * Alabama Secretary of State election-night pages. There is no data feed, only HTML:
 *   chooseCounty.aspx?ecode=<ecode>                    links to the counties that have reported
 *   countyResultsByContest.aspx?cid=<id>&ecode=<ecode> one county, contests in ballot order
 *   statewideResultsByContest.aspx?ecode=<ecode>       the state, same layout
 * Each page shows the first ten contests; later ones are behind a form post this adapter doesn't
 * make, so it only suits top-of-ballot races (governor is first).
 */
const BASE = "https://www2.alabamavotes.gov/electionNight";
export const alStatewideUrl = (ecode: string) => `${BASE}/statewideResultsByContest.aspx?ecode=${ecode}`;
export const alCountyListUrl = (ecode: string) => `${BASE}/chooseCounty.aspx?ecode=${ecode}`;
export const alCountyUrl = (cid: string, ecode: string) => `${BASE}/countyResultsByContest.aspx?cid=${cid}&ecode=${ecode}`;

const INDEX = (countyIndex as Record<string, Record<string, string>>).AL;
const text = (html: string) =>
  html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();

/** The counties linked from the "Choose a County" page: [{ cid: "04", name: "Autauga" }, ...]. */
export function parseAlCountyList(html: string): { cid: string; name: string }[] {
  return [...html.matchAll(/countyResultsByContest\.aspx\?cid=(\d+)[^'"]*['"]\s*>([^<]+)</g)].map((m) => ({ cid: m[1], name: text(m[2]) }));
}

/** One contest's rows from a results page: [name as printed, e.g. "Doug Jones (DEM)", votes]. */
export function parseAlContest(html: string, contest: RegExp): { rows: [string, number][]; updatedAt?: string } | null {
  const blocks = html.split(/class="enrContestHeader">/).slice(1);
  const block = blocks.find((b) => contest.test(text(b.slice(0, b.indexOf("<")))));
  if (!block) return null;
  const rows: [string, number][] = [];
  // Each candidate is a name cell followed, a few cells later in the same row, by a vote-count cell
  // (the column headings use the same name cell but have no count, so the match mustn't run on past a row).
  for (const m of block.matchAll(/enrCandNameCol"[^>]*>([^<]*)<\/td>(?:(?!enrCandNameCol)[\s\S])*?enrCandVoteNumCol">\s*<div class="numberValue">([\d,]+)<\/div>/g)) {
    const name = text(m[1]);
    if (name) rows.push([name, Number(m[2].replace(/,/g, ""))]);
  }
  const updated = html.match(/id="lblLastUpdated">([^<]+)</)?.[1];
  return { rows, updatedAt: parseUsDateTime(updated, 6) };
}

export interface AlPages { statewide?: string; counties: { name: string; html: string }[] }

export function normalizeAlSos(pages: AlPages, race: RaceDef, fetchedAt: string): NormalizedRace | null {
  const src = race.sources.alsos;
  if (!src) return null;
  const contest = new RegExp(src.contest, "i");
  const b = new RaceBuilder(race);
  const unmatched: string[] = [];
  let updatedAt: string | undefined;
  const add = (key: string, fips: string, unitName: string, html: string) => {
    const parsed = parseAlContest(html, contest);
    if (!parsed) return;
    if (parsed.updatedAt && (!updatedAt || parsed.updatedAt > updatedAt)) updatedAt = parsed.updatedAt;
    for (const [name, votes] of parsed.rows) b.add(key, { fips, unitName }, name, undefined, votes);
  };
  if (pages.statewide) add("__state", statewideFips("AL"), "Statewide", pages.statewide);
  for (const c of pages.counties) {
    const fips = INDEX[normCounty(c.name)];
    if (!fips) unmatched.push(c.name);
    add(fips ? `c:${fips}` : `u:${c.name}`, fips ?? "", c.name, c.html);
  }
  const all = [...b.units.entries()];
  if (!all.length) return null;
  const counties = all.filter(([k]) => k.startsWith("c:")).map(([, u]) => u);
  const statewide = b.units.get("__state") ?? sumUnits(all.map(([, u]) => u), statewideFips("AL"), "Statewide");
  return foldMinor({
    raceId: race.id,
    candidates: [...b.candidates.values()],
    statewide,
    counties: counties.length ? counties : [{ ...statewide }],
    unmatchedUnits: unmatched,
    source: { name: "Alabama Secretary of State", url: alStatewideUrl(src.ecode), updatedAt, fetchedAt },
  });
}
