import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { v, type Infer } from "convex/values";
import { raceById } from "../../shared/races";
import { PRECINCT_SOURCES_2026 } from "../../shared/races/precincts2026";
import { findVoterFocusCsv, normalizeVoterFocus, voterFocusElection, voterFocusReportsUrl } from "../../shared/adapters/voterfocus";
import { precinctKey } from "../../shared/names";
import floridaPoints from "../../shared/precincts/FL.json";

const POINTS: Record<string, Record<string, Record<string, number[]>>> = { FL: floridaPoints };
/** A county switches from one dot to precinct dots only when this share of its votes can be placed. */
const MIN_PLACED = 0.9;

const row = v.object({
  name: v.string(), x: v.optional(v.number()), y: v.optional(v.number()), total: v.number(),
  leaderParty: v.optional(v.string()), margin: v.optional(v.number()),
});

/**
 * Reads county precinct files for the races in shared/races/precincts2026.ts. Runs with the free
 * sources (RESULTS_SOURCE unset or "pushbuild"). A county whose file hasn't changed is skipped.
 */
export const poll = internalAction({
  args: { year: v.number(), force: v.optional(v.boolean()) },
  handler: async (ctx, { year, force }) => {
    const source = process.env.RESULTS_SOURCE ?? "pushbuild";
    if (source !== "pushbuild" && !force) return { skipped: `RESULTS_SOURCE=${source}` };
    const startedAt = Date.now();
    let written = 0, unchanged = 0, tooFewPlaced = 0;
    const errors: string[] = [];
    for (const src of PRECINCT_SOURCES_2026) {
      const race = raceById.get(src.raceId);
      if (!race || race.year !== year) continue;
      const contest = new RegExp(src.contest, "i");
      const points = POINTS[src.state] ?? {};
      const seen: Record<string, string> = Object.fromEntries(
        (await ctx.runQuery(internal.ingest.precincts.files, { raceId: src.raceId })).map((f) => [f.fips, f.url]),
      );
      for (let i = 0; i < src.counties.length; i += 4) {
        await Promise.all(src.counties.slice(i, i + 4).map(async (county) => {
          try {
            const { code, electionId } = county.voterfocus;
            const reports = await (await fetch(voterFocusReportsUrl(code, electionId))).text();
            if (!voterFocusElection(reports).includes(src.electionDate)) throw new Error("the page is not this election");
            const url = findVoterFocusCsv(reports);
            if (!url) return; // the county hasn't published a precinct file (yet)
            if (seen[county.fips] === url) { unchanged++; return; }
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status} for the precinct file`);
            const { candidates, precincts } = normalizeVoterFocus(await res.text(), race, contest, county.fips);
            const partyOf = new Map(candidates.map((c) => [c.key, c.party]));
            const placed: Infer<typeof row>[] = [];
            const rest = { total: 0, votes: {} as Record<string, number> };
            const countyPoints = points[county.fips] ?? {};
            const lead = (votes: Record<string, number>, total: number) => {
              const ranked = Object.entries(votes).filter(([k]) => k !== "other").sort((a, b) => b[1] - a[1]);
              if (!total || !ranked.length || !ranked[0][1]) return {};
              return { leaderParty: partyOf.get(ranked[0][0]) ?? "OTH", margin: (ranked[0][1] - (ranked[1]?.[1] ?? 0)) / total };
            };
            for (const p of precincts) {
              const xy = countyPoints[precinctKey(p.name)];
              if (xy) placed.push({ name: p.name, x: xy[0], y: xy[1], total: p.total, ...lead(p.votes, p.total) });
              else {
                rest.total += p.total;
                for (const [k, n] of Object.entries(p.votes)) rest.votes[k] = (rest.votes[k] ?? 0) + n;
              }
            }
            const all = rest.total + placed.reduce((s, p) => s + p.total, 0);
            const placedShare = all ? 1 - rest.total / all : 0;
            const rows = placedShare >= MIN_PLACED
              ? [...placed, ...(rest.total ? [{ name: "Other precincts", total: rest.total, ...lead(rest.votes, rest.total) }] : [])]
              : [];
            if (!rows.length) tooFewPlaced++;
            await ctx.runMutation(internal.ingest.precincts.replaceCounty, { raceId: src.raceId, fips: county.fips, url, placedShare, rows });
            written++;
          } catch (e) {
            errors.push(`${county.name}: ${(e as Error).message}`);
          }
        }));
      }
    }
    await ctx.runMutation(internal.ingest.write.logRun, {
      source: "precincts", startedAt, ok: errors.length === 0, racesWritten: written, racesUnchanged: unchanged,
      message: errors.length ? errors.join("; ").slice(0, 2000) : undefined,
    });
    return { countiesWritten: written, countiesUnchanged: unchanged, countiesLeftAsOneDot: tooFewPlaced, errors };
  },
});

export const files = internalQuery({
  args: { raceId: v.string() },
  handler: async (ctx, { raceId }) =>
    (await ctx.db.query("precinctFiles").withIndex("by_race", (q) => q.eq("raceId", raceId)).collect()).map((f) => ({ fips: f.fips, url: f.url })),
});

/** Swap one county's precinct rows for a new set (empty = show the county as one dot). */
export const replaceCounty = internalMutation({
  args: { raceId: v.string(), fips: v.string(), url: v.string(), placedShare: v.number(), rows: v.array(row) },
  handler: async (ctx, { raceId, fips, url, placedShare, rows }) => {
    const old = await ctx.db.query("precinctResults").withIndex("by_race", (q) => q.eq("raceId", raceId).eq("fips", fips)).collect();
    for (const d of old) await ctx.db.delete(d._id);
    for (const r of rows) await ctx.db.insert("precinctResults", { raceId, fips, ...r });
    const file = await ctx.db.query("precinctFiles").withIndex("by_race", (q) => q.eq("raceId", raceId).eq("fips", fips)).unique();
    if (file) await ctx.db.patch(file._id, { url, placedShare });
    else await ctx.db.insert("precinctFiles", { raceId, fips, url, placedShare });
  },
});
