import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Each poller checks RESULTS_SOURCE and exits immediately if it isn't the active source,
// so both can stay scheduled. Tighten or loosen the intervals around election night.
crons.interval("2026 results: Pushbuild", { minutes: 2 }, internal.ingest.pushbuild.poll, { year: 2026 });
crons.interval("2026 results: California SoS", { minutes: 2 }, internal.ingest.casos.poll, { year: 2026 });
crons.interval("2026 results: AP", { minutes: 1 }, internal.ingest.ap.poll, { year: 2026, electionDate: "2026-11-03" });

export default crons;
