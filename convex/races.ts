import { query } from "./_generated/server";
import { v } from "convex/values";

/** Which (year, office) combinations exist, for the year switcher. */
export const editions = query({
  args: {},
  handler: async (ctx) => {
    const races = await ctx.db.query("races").collect();
    const map = new Map<string, { year: number; office: string; races: number; withData: number }>();
    for (const r of races) {
      const k = `${r.year}:${r.office}`;
      const e = map.get(k) ?? { year: r.year, office: r.office, races: 0, withData: 0 };
      e.races++;
      if (r.status !== "nodata") e.withData++;
      map.set(k, e);
    }
    return [...map.values()].sort((a, b) => b.year - a.year || a.office.localeCompare(b.office));
  },
});

/** Every race for a year and office, with statewide totals. */
export const list = query({
  args: { year: v.number(), office: v.string() },
  handler: async (ctx, { year, office }) => {
    const races = await ctx.db
      .query("races")
      .withIndex("by_year_office", (q) => q.eq("year", year).eq("office", office))
      .collect();
    return races
      .map(({ hash: _h, ...r }) => r)
      .sort((a, b) => a.state.localeCompare(b.state));
  },
});

/** Compact county rows for the national dot map: enough to size and color every dot. */
export const nationalDots = query({
  args: { year: v.number(), office: v.string() },
  handler: async (ctx, { year, office }) => {
    const rows = await ctx.db
      .query("countyResults")
      .withIndex("by_year_office", (q) => q.eq("year", year).eq("office", office))
      .collect();
    return rows.map((r) => ({
      raceId: r.raceId, state: r.state, fips: r.fips, name: r.unitName, total: r.total,
      leaderParty: r.leaderParty ?? null, margin: r.margin ?? null,
      reporting: r.precinctsTotal ? (r.precinctsReporting ?? 0) / r.precinctsTotal : null,
    }));
  },
});

/** One race in full: candidates plus every county's vote breakdown. */
export const race = query({
  args: { raceId: v.string() },
  handler: async (ctx, { raceId }) => {
    const race = await ctx.db.query("races").withIndex("by_raceId", (q) => q.eq("raceId", raceId)).unique();
    if (!race) return null;
    const counties = await ctx.db
      .query("countyResults")
      .withIndex("by_race", (q) => q.eq("raceId", raceId))
      .collect();
    const { hash: _h, ...rest } = race;
    return { ...rest, counties: counties.map(({ _id, _creationTime, year: _y, office: _o, ...c }) => c) };
  },
});

/** Last few ingest runs per source, for the "data as of" footer and debugging. */
export const ingestStatus = query({
  args: {},
  handler: async (ctx) => {
    const runs = await ctx.db.query("ingestRuns").order("desc").take(10);
    return runs.map(({ _id, _creationTime, ...r }) => r);
  },
});
