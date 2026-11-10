import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { racesFor } from "../../shared/races";
import { normalizeTonmcg2024, TONMCG_2024_URL } from "../../shared/adapters/tonmcg";

/** One-time import of 2024 presidential county results. Safe to re-run. */
export const president2024 = internalAction({
  args: {},
  handler: async (ctx) => {
    const res = await fetch(TONMCG_2024_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching 2024 results`);
    const races = normalizeTonmcg2024(await res.text(), racesFor(2024, "president"), new Date().toISOString());
    for (const race of races) await ctx.runMutation(internal.ingest.write.upsertRace, { race });
    return { races: races.length };
  },
});
