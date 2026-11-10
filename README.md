# Votes, not acres

An election-night results map where every county is a dot sized by the votes cast there,
so a metro of millions outweighs a county of empty land. Switch elections, zoom into a state,
and click a county for its full breakdown. Results stream in live through Convex.

## Run it

```bash
npm install
npx convex dev            # first run: log in, create the project, generate convex/_generated
npm run setup             # create race rows, import 2024, take a first 2026 snapshot
npm run dev               # Vite + Convex together
```

After `setup`, crons poll the active source on their own (Pushbuild every 2 minutes by default).

No Convex account at hand (CI, a cloud sandbox)? `CONVEX_AGENT_MODE=anonymous npx convex dev` runs a
local backend on port 3210 without logging in; the other commands work against it unchanged.

## How it fits together

```
shared/races/<year>.ts   which races exist, and how each source names them   (you edit these)
shared/adapters/*        source → NormalizedRace (pure functions, testable without Convex)
convex/ingest/*          crons fetch a source, run its adapter, write via ingest/write:upsertRace
convex/races.ts          queries the client subscribes to
src/                     React + d3 map; reactive, so it redraws as rows change
```

**Races are code; results are data.** A race definition says *what* to look for (`2026-governor-TX`,
the contest-name pattern, AP's office ID). Candidates come from the source rows: names are
cleaned ("Josh Shapiro / Davis, Austin" → "Josh Shapiro"), parties normalized, running-mate
and fusion-ballot lines merged, write-ins and sub-0.5% candidates folded into "other". Add a
`candidates` array to a race only when you need to override a name or party.

**Adding a year:** create `shared/races/2028.ts`, list it in `shared/races/index.ts`, run
`npm run setup` again (race creation is idempotent), and point a cron at the year.

**Adding an office:** add it to `Office` in `shared/types.ts` and `OFFICE_LABEL` in
`src/format.ts`, then define the races. Senate needs a little care in years with two seats
in one state (give each race its own `ap.raceID`).

## Sources

| Source | Cost | Granularity | Notes |
|---|---|---|---|
| **Pushbuild** (default) | Free, CC0 | State + county | Unofficial scrape of each state's results site, published as CSVs on GitHub. Coverage varies by state; check figures against the state. |
| **AP Elections API** | Paid contract | State + county (+ race calls) | Set `AP_API_KEY` and `RESULTS_SOURCE=ap`. The adapter in `shared/adapters/ap.ts` follows AP's documented v2 JSON; confirm field names against your account's docs before relying on it. |
| **Decision Desk HQ** | Paid | State + county | Not wired yet: write `shared/adapters/ddhq.ts` returning `NormalizedRace[]` and a poller like `convex/ingest/ap.ts`. |
| 2024 president | Free | County | One-time import from `tonmcg/US_County_Level_Election_Results_08-24`. |

`npm run test:adapters` runs the Pushbuild and 2024 adapters against the live files and prints,
per state, how many counties were placed and what didn't match. Run it before election night.

## Known gaps

- **New England** (CT, RI, MA, VT, NH, ME) reports by town. `shared/townIndex.json` maps each town to
  its county (built from the Census county subdivision file by `npm run gen:towns`), and
  `shared/adapters/pushbuild.ts` sums town rows into counties. A town name the table doesn't know stays
  out of the county map and is listed in the race's `unmatchedUnits`. Connecticut towns go to the eight
  historical counties (the shapes us-atlas draws); the 2024 import uses planning regions instead.
  Maine's Penobscot Indian Island Reservation spans two counties and is left unplaced.
- **Partial feeds**: when a state has county rows but no statewide row, the statewide total is the sum
  of the counties reported so far (Kansas, Michigan and Wisconsin currently have two counties each).
- **Alaska** reports by state house district; it's one statewide dot.
- **States with only statewide totals** in a feed show one dot at the state's center until county rows arrive.
- **Below county** (precincts) needs per-state precinct shapes, which are inconsistent and usually
  published after certification. County is the floor for now.
- The map bundles us-atlas (~800 KB). Move it to `public/` and fetch it if first load matters.
