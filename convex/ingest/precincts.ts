import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Precinct rows are gathered outside Convex, on request, by scripts/import-precincts.ts (some
 * county sites need a browser), and written here one county at a time.
 */
const row = v.object({
  name: v.string(), x: v.optional(v.number()), y: v.optional(v.number()), total: v.number(),
  leaderParty: v.optional(v.string()), margin: v.optional(v.number()),
});

/** Swap one county's precinct rows for a new set (empty = show the county as one dot). `append` adds to them instead, for a county sent in several calls. */
export const replaceCounty = internalMutation({
  args: { raceId: v.string(), fips: v.string(), rows: v.array(row), append: v.optional(v.boolean()) },
  handler: async (ctx, { raceId, fips, rows, append }) => {
    if (!append) {
      const old = await ctx.db.query("precinctResults").withIndex("by_race", (q) => q.eq("raceId", raceId).eq("fips", fips)).collect();
      for (const d of old) await ctx.db.delete(d._id);
    }
    for (const r of rows) await ctx.db.insert("precinctResults", { raceId, fips, ...r });
    return rows.length;
  },
});
