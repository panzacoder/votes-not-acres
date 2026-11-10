import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { racesFor } from "../../shared/races";
import { normalizeAp, type ApResponse } from "../../shared/adapters/ap";
import { AP_BASE } from "../../shared/adapters/sources";

/**
 * Polls the AP Elections API. Needs AP_API_KEY and RESULTS_SOURCE=ap in the Convex
 * dashboard (Settings → Environment Variables). AP rate-limits by plan: keep the cron
 * interval at or above what your contract allows.
 */
export const poll = internalAction({
  args: { year: v.number(), electionDate: v.string(), force: v.optional(v.boolean()) },
  handler: async (ctx, { year, electionDate, force }) => {
    const key = process.env.AP_API_KEY;
    if ((process.env.RESULTS_SOURCE ?? "pushbuild") !== "ap" && !force) return { skipped: "RESULTS_SOURCE is not ap" };
    if (!key) return { skipped: "AP_API_KEY not set" };
    const startedAt = Date.now();
    const races = racesFor(year).filter((r) => r.sources.ap);
    const byOffice = new Map<string, string[]>();
    for (const r of races) byOffice.set(r.sources.ap!.officeID, [...(byOffice.get(r.sources.ap!.officeID) ?? []), r.state]);

    let written = 0, unchanged = 0;
    const errors: string[] = [];
    for (const [officeID, states] of byOffice) {
      const url = `${AP_BASE}/elections/${electionDate}?statepostal=${states.join(",")}&officeID=${officeID}&level=FIPS&format=json`;
      try {
        const res = await fetch(url, { headers: { "x-api-key": key, accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text().catch(() => "")}`.slice(0, 300));
        const json = (await res.json()) as ApResponse;
        for (const race of normalizeAp(json, races, new Date().toISOString())) {
          const r = await ctx.runMutation(internal.ingest.write.upsertRace, { race });
          r === "written" ? written++ : unchanged++;
        }
      } catch (e) {
        errors.push(`${officeID}: ${(e as Error).message}`);
      }
    }
    await ctx.runMutation(internal.ingest.write.logRun, {
      source: "ap", startedAt, ok: errors.length === 0, racesWritten: written, racesUnchanged: unchanged,
      message: errors.length ? errors.join("; ") : undefined,
    });
    return { written, unchanged, errors };
  },
});
