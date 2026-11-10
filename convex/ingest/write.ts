import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { ALL_RACES } from "../../shared/races";
import type { NormalizedRace, NormalizedUnit } from "../../shared/types";

/** Create a `races` row for every race defined in shared/races (idempotent). */
export const syncRaceDefs = internalMutation({
  args: {},
  handler: async (ctx) => {
    let created = 0;
    for (const def of ALL_RACES) {
      const existing = await ctx.db.query("races").withIndex("by_raceId", (q) => q.eq("raceId", def.id)).unique();
      if (existing) {
        if (existing.label !== def.label) await ctx.db.patch(existing._id, { label: def.label });
        continue;
      }
      await ctx.db.insert("races", {
        raceId: def.id, year: def.year, office: def.office, state: def.state, label: def.label,
        status: "nodata", candidates: [], unmatchedUnits: [],
      });
      created++;
    }
    return { created, total: ALL_RACES.length };
  },
});

const leaderOf = (u: NormalizedUnit, partyOf: Map<string, string>) => {
  const ranked = Object.entries(u.votes).filter(([k]) => k !== "other").sort((a, b) => b[1] - a[1]);
  if (!u.total || !ranked.length || ranked[0][1] === 0) return {};
  const [first, second] = ranked;
  return {
    leaderKey: first[0],
    leaderParty: partyOf.get(first[0]) ?? "OTH",
    margin: (first[1] - (second?.[1] ?? 0)) / u.total,
  };
};

const unitDoc = (u: NormalizedUnit) => ({
  total: u.total, votes: u.votes,
  ...(u.precinctsReporting !== undefined ? { precinctsReporting: u.precinctsReporting } : {}),
  ...(u.precinctsTotal !== undefined ? { precinctsTotal: u.precinctsTotal } : {}),
});

/** Cheap content hash so polling an unchanged feed doesn't rewrite (and re-push) every row. */
const hashOf = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + ":" + s.length;
};

/** Write one normalized race: race row, then diff county rows by FIPS. */
export const upsertRace = internalMutation({
  args: { race: v.any() },
  handler: async (ctx, args) => {
    const n = args.race as NormalizedRace;
    const race = await ctx.db.query("races").withIndex("by_raceId", (q) => q.eq("raceId", n.raceId)).unique();
    if (!race) throw new Error(`Unknown race ${n.raceId}: run setup:init after adding race definitions.`);
    const { fetchedAt, ...sourceRest } = n.source;
    const hash = hashOf(JSON.stringify({ ...n, source: sourceRest }));
    if (race.hash === hash) {
      await ctx.db.patch(race._id, { source: n.source });
      return "unchanged";
    }

    const partyOf = new Map(n.candidates.map((c) => [c.key, c.party]));
    const sw = n.statewide;
    await ctx.db.patch(race._id, {
      status: n.calledFor ? "called" : sw && sw.total > 0 ? "counting" : "nodata",
      candidates: n.candidates
        .map((c) => ({ ...c, votes: sw?.votes[c.key] ?? 0 }))
        .sort((a, b) => (a.key === "other" ? 1 : b.key === "other" ? -1 : b.votes - a.votes)),
      statewide: sw ? unitDoc(sw) : undefined,
      calledFor: n.calledFor,
      unmatchedUnits: n.unmatchedUnits.slice(0, 500),
      source: n.source,
      hash,
    });

    const existing = await ctx.db.query("countyResults").withIndex("by_race", (q) => q.eq("raceId", n.raceId)).collect();
    const byFips = new Map(existing.map((d) => [d.fips, d]));
    for (const u of n.counties) {
      const doc = {
        raceId: n.raceId, year: race.year, office: race.office, state: race.state,
        fips: u.fips, unitName: u.unitName, ...unitDoc(u), ...leaderOf(u, partyOf),
      };
      const prev = byFips.get(u.fips);
      byFips.delete(u.fips);
      if (!prev) await ctx.db.insert("countyResults", doc);
      else if (prev.total !== doc.total || JSON.stringify(prev.votes) !== JSON.stringify(doc.votes) || prev.precinctsReporting !== doc.precinctsReporting)
        await ctx.db.replace(prev._id, doc);
    }
    for (const stale of byFips.values()) await ctx.db.delete(stale._id);
    return "written";
  },
});

export const logRun = internalMutation({
  args: { source: v.string(), startedAt: v.number(), ok: v.boolean(), racesWritten: v.number(), racesUnchanged: v.number(), message: v.optional(v.string()) },
  handler: async (ctx, run) => {
    await ctx.db.insert("ingestRuns", run);
    // Keep the log short.
    const old = await ctx.db.query("ingestRuns").withIndex("by_source", (q) => q.eq("source", run.source)).order("desc").collect();
    for (const r of old.slice(50)) await ctx.db.delete(r._id);
  },
});
