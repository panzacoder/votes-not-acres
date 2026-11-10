import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { racesFor } from "../../shared/races";
import { fetchStateRace, stateSiteKind } from "../../shared/adapters/stateSites";

/**
 * Polls state election sites for the races that name one as their source (county rows
 * Pushbuild doesn't carry). Free and public, so it runs alongside Pushbuild: whenever
 * RESULTS_SOURCE is unset or "pushbuild". `kinds` limits a run to some sites, so a site that
 * needs many requests (Alabama: one page per county) can be polled less often than the rest.
 */
export const poll = internalAction({
  args: { year: v.number(), kinds: v.optional(v.array(v.string())), force: v.optional(v.boolean()) },
  handler: async (ctx, { year, kinds, force }) => {
    const source = process.env.RESULTS_SOURCE ?? "pushbuild";
    if (source !== "pushbuild" && !force) return { skipped: `RESULTS_SOURCE=${source}` };
    const startedAt = Date.now();
    let written = 0, unchanged = 0;
    const errors: string[] = [];
    const defs = racesFor(year).filter((r) => { const k = stateSiteKind(r); return k && (!kinds || kinds.includes(k)); });
    await Promise.all(defs.map(async (def) => {
      try {
        const race = await fetchStateRace(def, new Date().toISOString());
        if (!race) return;
        const r = await ctx.runMutation(internal.ingest.write.upsertRace, { race });
        r === "written" ? written++ : unchanged++;
      } catch (e) {
        errors.push(`${def.id}: ${(e as Error).message}`);
      }
    }));
    await ctx.runMutation(internal.ingest.write.logRun, {
      source: "state sites", startedAt, ok: errors.length === 0, racesWritten: written, racesUnchanged: unchanged,
      message: errors.length ? errors.join("; ").slice(0, 2000) : undefined,
    });
    return { written, unchanged, errors };
  },
});
