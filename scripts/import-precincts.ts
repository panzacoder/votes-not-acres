/**
 * Reads precinct results for the races in shared/races/precincts2026.ts, places each precinct,
 * and (with --push) writes them to a Convex deployment. Run on request; nothing polls this.
 *
 *   npm run import:precincts                              read every county, print what could be placed
 *   npm run import:precincts -- --only 12031,12086         just these counties
 *   npm run import:precincts -- --push --preview-name review   also write to that deployment
 *                                                         (everything after --push goes to `convex run`; use --prod for production)
 *
 * Each county's rows are kept in .cache/precincts/ so --push can be re-run without re-reading
 * sites (pass --refresh to read them again).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { raceById } from "../shared/races";
import { PRECINCT_SOURCES_2026, type PrecinctCounty, type PrecinctSource } from "../shared/races/precincts2026";
import { findVoterFocusCsv, findVoterFocusRace, normalizeVoterFocus, normalizeVoterFocusCsv, voterFocusElection, voterFocusOnePrecinctPerPage, voterFocusPrecinctsUrl, voterFocusReportsUrl, type PrecinctUnit } from "../shared/adapters/voterfocus";
import type { NormalizedCandidate, RaceDef } from "../shared/types";
import { precinctKey } from "../shared/names";

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const convexBin = join(dirname(createRequire(join(root, "package.json")).resolve("convex/package.json")), "bin", "main.js");
const argv = process.argv.slice(2);
const pushAt = argv.indexOf("--push");
const pushArgs = pushAt >= 0 ? argv.slice(pushAt + 1) : null;
const own = pushAt >= 0 ? argv.slice(0, pushAt) : argv;
const only = own.includes("--only") ? new Set(own[own.indexOf("--only") + 1].split(",")) : null;
const refresh = own.includes("--refresh");
/** A county switches from one dot to precinct dots only when this share of its votes can be placed. */
const MIN_PLACED = 0.9;

interface Collected { candidates: NormalizedCandidate[]; precincts: PrecinctUnit[]; readAt: string; from: string }

async function page(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.text();
}

/** One county's precincts, by whatever means its site needs. */
async function collect(src: PrecinctSource, race: RaceDef, county: PrecinctCounty): Promise<Collected> {
  const contest = new RegExp(src.contest, "i");
  if (county.voterfocus) {
    const { code, electionId } = county.voterfocus;
    const index = await page(voterFocusPrecinctsUrl(code, electionId));
    if (!voterFocusElection(index).includes(src.electionDate)) throw new Error(`not the ${src.electionDate} election: "${voterFocusElection(index)}"`);
    const raceId = findVoterFocusRace(index, contest);
    if (!raceId) throw new Error("no matching race on the page");
    const from = voterFocusPrecinctsUrl(code, electionId, raceId);
    const html = await page(from);
    const read = normalizeVoterFocus(html, race, county.fips);
    if (read.precincts.some((p) => p.total > 0)) return { ...read, readAt: new Date().toISOString(), from };
    // No usable race page (the largest counties list one precinct per page): fall back to the county's CSV.
    const csv = findVoterFocusCsv(await page(voterFocusReportsUrl(code, electionId)).catch(() => ""));
    if (csv) return { ...normalizeVoterFocusCsv(await page(csv), race, contest, county.fips), readAt: new Date().toISOString(), from: csv };
    throw new Error(voterFocusOnePrecinctPerPage(html) ? "one precinct per page and no CSV" : "the race page has no precinct results");
  }
  throw new Error("no way to read this county is configured");
}

function leader(votes: Record<string, number>, total: number, partyOf: Map<string, string>) {
  const ranked = Object.entries(votes).filter(([k]) => k !== "other").sort((a, b) => b[1] - a[1]);
  if (!total || !ranked.length || !ranked[0][1]) return {};
  return { leaderParty: partyOf.get(ranked[0][0]) ?? "OTH", margin: (ranked[0][1] - (ranked[1]?.[1] ?? 0)) / total };
}

function push(raceId: string, fips: string, rows: unknown[]) {
  // A county can be a few hundred rows: send it in pieces that fit on a command line.
  for (let i = 0; i === 0 || i < rows.length; i += 250) {
    execFileSync(process.execPath, [
      convexBin, "run", "ingest/precincts:replaceCounty", JSON.stringify({ raceId, fips, rows: rows.slice(i, i + 250), append: i > 0 }),
      "--typecheck=disable", "--codegen=disable", ...pushArgs!,
    ], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
  }
}

let split = 0, whole = 0, failed = 0, placedVotes = 0, allVotes = 0;
for (const src of PRECINCT_SOURCES_2026) {
  const race = raceById.get(src.raceId)!;
  const points: Record<string, Record<string, number[]>> = JSON.parse(readFileSync(join(root, "shared", "precincts", `${src.state}.json`), "utf8"));
  const cacheDir = join(root, ".cache", "precincts", src.raceId);
  mkdirSync(cacheDir, { recursive: true });
  const todo = src.counties.filter((c) => !only || only.has(c.fips));
  for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(todo.slice(i, i + 4).map(async (county) => {
      const file = join(cacheDir, `${county.fips}.json`);
      let got: Collected;
      try {
        got = !refresh && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : await collect(src, race, county);
        if (!got.precincts.some((p) => p.total > 0)) throw new Error("the county's precinct results are empty or all zero");
        writeFileSync(file, JSON.stringify(got));
      } catch (e) {
        failed++;
        console.log(`${county.name.padEnd(14)} FAILED: ${(e as Error).message}`);
        return;
      }
      const partyOf = new Map(got.candidates.map((c) => [c.key, c.party]));
      const countyPoints = points[county.fips] ?? {};
      const placed: Record<string, unknown>[] = [];
      const rest = { total: 0, votes: {} as Record<string, number> };
      for (const p of got.precincts) {
        const xy = countyPoints[precinctKey(p.name)];
        if (xy) placed.push({ name: p.name, x: xy[0], y: xy[1], total: p.total, ...leader(p.votes, p.total, partyOf) });
        else {
          rest.total += p.total;
          for (const [k, n] of Object.entries(p.votes)) rest.votes[k] = (rest.votes[k] ?? 0) + n;
        }
      }
      const total = rest.total + placed.reduce((s, p) => s + (p.total as number), 0);
      const share = total ? 1 - rest.total / total : 0;
      const ok = share >= MIN_PLACED;
      const rows = ok ? [...placed, ...(rest.total ? [{ name: "Other precincts", total: rest.total, ...leader(rest.votes, rest.total, partyOf) }] : [])] : [];
      ok ? split++ : whole++;
      allVotes += total; if (ok) placedVotes += total - rest.total;
      const unplaced = got.precincts.filter((p) => !countyPoints[precinctKey(p.name)]).slice(0, 3).map((p) => p.name).join("; ");
      console.log(`${county.name.padEnd(14)} ${String(got.precincts.length).padStart(4)} precincts ${total.toLocaleString().padStart(9)} votes  ${(share * 100).toFixed(0).padStart(3)}% placed  ${ok ? "precinct dots" : "stays one dot"}${unplaced ? `  (unplaced: ${unplaced})` : ""}`);
      if (pushArgs) push(src.raceId, county.fips, rows);
    }));
  }
}
console.log(`\n${split} counties as precinct dots, ${whole} left as one dot, ${failed} could not be read. ${placedVotes.toLocaleString()} of ${allVotes.toLocaleString()} votes read are placed.${pushArgs ? " Written to Convex." : " Nothing written (no --push)."}`);
