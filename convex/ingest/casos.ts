import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { racesFor } from "../../shared/races";
import { normalizeCaSos, type CaSosUnit } from "../../shared/adapters/casos";
import { caSosUrl } from "../../shared/adapters/sources";

/**
 * Polls the California Secretary of State for races that name a `casos` source (county rows
 * Pushbuild doesn't carry). Free and public, so it runs alongside Pushbuild: whenever
 * RESULTS_SOURCE is unset or "pushbuild".
 */
export const poll = internalAction({
  args: { year: v.number(), force: v.optional(v.boolean()) },
  handler: async (ctx, { year, force }) => {
    const source = process.env.RESULTS_SOURCE ?? "pushbuild";
    if (source !== "pushbuild" && !force) return { skipped: `RESULTS_SOURCE=${source}` };
    const startedAt = Date.now();
    let written = 0, unchanged = 0;
    const errors: string[] = [];
    for (const def of racesFor(year).filter((r) => r.sources.casos)) {
      try {
        const res = await fetch(caSosUrl(def.sources.casos!.contest), { headers: { accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const race = normalizeCaSos((await res.json()) as CaSosUnit[], def, new Date().toISOString());
        if (!race) continue;
        const r = await ctx.runMutation(internal.ingest.write.upsertRace, { race });
        r === "written" ? written++ : unchanged++;
      } catch (e) {
        errors.push(`${def.id}: ${(e as Error).message}`);
      }
    }
    await ctx.runMutation(internal.ingest.write.logRun, {
      source: "casos", startedAt, ok: errors.length === 0, racesWritten: written, racesUnchanged: unchanged,
      message: errors.length ? errors.join("; ").slice(0, 2000) : undefined,
    });
    return { written, unchanged, errors };
  },
});
