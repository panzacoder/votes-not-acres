import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

/** `npx convex run setup:init` — create race rows, import 2024, and take a first 2026 snapshot. */
export const init = internalAction({
  args: {},
  // Explicit types: actions that call other actions in the same API need them to avoid a circular type.
  handler: async (ctx): Promise<Record<string, unknown>> => {
    const defs: unknown = await ctx.runMutation(internal.ingest.write.syncRaceDefs, {});
    const seeded: unknown = await ctx.runAction(internal.ingest.seed.president2024, {});
    const live: unknown = await ctx.runAction(internal.ingest.pushbuild.poll, { year: 2026, force: true });
    return { defs, seeded, live };
  },
});
