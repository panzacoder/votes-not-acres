import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Each poller checks RESULTS_SOURCE and exits immediately if it isn't the active source,
// so both can stay scheduled. Tighten or loosen the intervals around election night.
crons.interval("2026 results: Pushbuild", { minutes: 2 }, internal.ingest.pushbuild.poll, { year: 2026 });
// State sites fill in the states Pushbuild has no counties for (shared/races/2026.ts, STATE_DIRECT).
crons.interval("2026 results: state sites", { minutes: 2 }, internal.ingest.states.poll, { year: 2026, kinds: ["casos", "totalvote", "vtsos"] });
// Alabama is one page per county, so it's asked less often.
crons.interval("2026 results: Alabama", { minutes: 10 }, internal.ingest.states.poll, { year: 2026, kinds: ["alsos"] });
crons.interval("2026 results: AP", { minutes: 1 }, internal.ingest.ap.poll, { year: 2026, electionDate: "2026-11-03" });

export default crons;
