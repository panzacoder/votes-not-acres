import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { racesFor } from "../../shared/races";
import { normalizePushbuild } from "../../shared/adapters/pushbuild";
import { PUSHBUILD_DEFAULT_BASE, pushbuildUrl } from "../../shared/adapters/sources";

/**
 * Polls Pushbuild's per-state CSVs (unofficial, scraped from each state's results site).
 * Runs when RESULTS_SOURCE is unset or "pushbuild". PUSHBUILD_BASE points it at another mirror.
 */
export const poll = internalAction({
  args: { year: v.number(), force: v.optional(v.boolean()) },
  handler: async (ctx, { year, force }) => {
    const source = process.env.RESULTS_SOURCE ?? "pushbuild";
    if (source !== "pushbuild" && !force) return { skipped: `RESULTS_SOURCE=${source}` };
    const startedAt = Date.now();
    const base = process.env.PUSHBUILD_BASE ?? PUSHBUILD_DEFAULT_BASE;
    const races = racesFor(year).filter((r) => r.sources.pushbuild);
    const states = [...new Set(races.map((r) => r.state))];
    let written = 0, unchanged = 0;
    const errors: string[] = [];

    // A handful at a time: GitHub raw is fine with this, and so are state-sized CSVs.
    for (let i = 0; i < states.length; i += 6) {
      await Promise.all(
        states.slice(i, i + 6).map(async (st) => {
          try {
            const res = await fetch(pushbuildUrl(st, base), { headers: { "cache-control": "no-cache" } });
            if (res.status === 404) return; // state not in the feed
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const normalized = normalizePushbuild(await res.text(), races.filter((r) => r.state === st), new Date().toISOString());
            for (const race of normalized) {
              const r = await ctx.runMutation(internal.ingest.write.upsertRace, { race });
              r === "written" ? written++ : unchanged++;
            }
          } catch (e) {
            errors.push(`${st}: ${(e as Error).message}`);
          }
        }),
      );
    }
    await ctx.runMutation(internal.ingest.write.logRun, {
      source: "pushbuild", startedAt, ok: errors.length === 0, racesWritten: written, racesUnchanged: unchanged,
      message: errors.length ? errors.join("; ").slice(0, 2000) : undefined,
    });
    return { written, unchanged, errors };
  },
});
