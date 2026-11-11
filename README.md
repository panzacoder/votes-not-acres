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

After `setup`, crons poll the active source on their own (Pushbuild and the state sites every 2 minutes by default).

No Convex account at hand (CI, a cloud sandbox)? `CONVEX_AGENT_MODE=anonymous npx convex dev` runs a
local backend on port 3210 without logging in; the other commands work against it unchanged.

## Deploy

```bash
npm run deploy            # build, push the Convex backend, upload dist/ to Convex static hosting
npx convex run setup:init --prod   # first deploy only: create race rows and import results
```

The frontend is served by the `@convex-dev/static-hosting` component (registered in
`convex/convex.config.ts`) at `https://<deployment>.convex.site`, so there is no second host.
In CI, set `CONVEX_DEPLOY_KEY` instead of logging in.

### Preview deployments

```bash
CONVEX_DEPLOY_KEY=<preview deploy key> npm run deploy:preview -- review
```

This pushes the backend to the preview deployment named `review` (creating it if needed), runs
`setup:init` on it, builds the frontend against its `.convex.cloud` URL, uploads `dist/`, and
prints the `.convex.site` link. Running it again updates the same preview: the URL and data stay.

Use this instead of `npm run deploy` with a preview key. The hosting CLI's `deploy` and
`upload --prod` only address the dev and production deployments; with a preview key their
`convex run` calls are refused ("Not authorized"). `scripts/deploy-preview.ts` runs the hosting
`upload` with every Convex call pinned to `--preview-name <name>`, so it cannot touch production.

Pass `--fresh` to delete and recreate the preview (new URL, data re-imported), or `--no-setup` to
skip `setup:init`.

## How it fits together

```
shared/races/<year>.ts   which races exist, and how each source names them   (you edit these)
shared/adapters/*        source → NormalizedRace (pure functions, testable without Convex; stateSites.ts fetches)
convex/ingest/*          crons fetch a source, run its adapter, write via ingest/write:upsertRace (precincts.ts: below county)
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
| **State election sites** | Free | State + county | For states where Pushbuild has only a statewide row, the race reads the state's own site instead (`STATE_DIRECT` in `shared/races/2026.ts`): California (`casos.ts`), Nebraska, New Mexico and South Dakota (one shared platform, `totalvote.ts`), Vermont (`vtsos.ts`, towns summed into counties) and Alabama (`alsos.ts`, HTML pages, one per county, polled every 10 minutes). `shared/adapters/stateSites.ts` does the fetching; the rest poll every 2 minutes. |
| **AP Elections API** | Paid contract | State + county (+ race calls) | Set `AP_API_KEY` and `RESULTS_SOURCE=ap`. The adapter in `shared/adapters/ap.ts` follows AP's documented v2 JSON; confirm field names against your account's docs before relying on it. |
| **Decision Desk HQ** | Paid | State + county | Not wired yet: write `shared/adapters/ddhq.ts` returning `NormalizedRace[]` and a poller like `convex/ingest/ap.ts`. |
| 2024 president | Free | County | One-time import from `tonmcg/US_County_Level_Election_Results_08-24`. |

`npm run test:adapters` runs the Pushbuild and 2024 adapters against the live files and prints,
per state, how many counties were placed and what didn't match. Run it before election night.

## Precincts (Florida, on request)

Zoom into Florida and the counties that publish precinct results break into precinct dots. Nothing
polls this: the data is settled, so it is read when you ask.

```bash
npm run import:precincts                                  # read every county, print what can be placed
npm run import:precincts -- --push --preview-name review  # also write it to that deployment (--prod for production)
npm run import:precincts -- --refresh --only 12031,12086  # re-read just these counties from their sites
```

Rows read from county sites are kept in `.cache/precincts/` so a push can be repeated without
re-reading. Run it from an ordinary home or office connection if you can: several county sites
refuse requests from cloud machines (see below), and they will read as failures from one.

A precinct dot needs two things, and each has its own list:

| | where it's listed | how it's filled |
|---|---|---|
| **Results** per precinct | `shared/races/precincts2026.ts` | one adapter per results platform in `shared/adapters/` (`voterfocus.ts` covers most Florida counties) |
| **A location** per precinct | `shared/precincts/sources.ts` → `npm run gen:precincts -- FL` → `shared/precincts/FL.json` | the county's own current precinct layer where one is listed; otherwise the Census Bureau's 2020 voting district with the same number |

A county becomes precinct dots only when 90% of its votes can be placed; the remainder shows as one
"Other precincts" dot at the county's center. Census 2020 points predate the 2022 redistricting, so a
precinct that kept its number may sit where it used to be (still inside its county). Counties with
their own layer listed in `sources.ts` don't have that caveat.

### Finding sources for more counties

What worked, cheapest first:

1. **Recognise the platform, then write one adapter.** Most Florida counties use the same results
   site, so one adapter and a list of (county code, election id) pairs covers them.
2. **Search catalogues with code, not agents.** `npm run find:layers` searches ArcGIS Online for each
   county and scores every candidate layer against that county's own precinct names. It rejects
   layers outside the county and ignores row-number fields (both produced false matches before).
3. **Use small agents only for what's left**, one narrow question each ("where does this county
   publish its results?"), and give them `npm run -s probe -- ...` instead of letting them read pages:
   `page`, `render` (a browser, for pages built by JavaScript), `vf`, `arcgis`, `services`, `layer`.
   Each prints a few lines, and `layer` returns a score, so the answer is a test result rather than a judgement.
4. **A refusal is final.** A site that answers 403 or shows a captcha is recorded as blocked. The
   probe won't open a browser on a site that refused a plain request.

Cost so far, for Florida's 67 counties: two agent passes (67 and 40 small agents) used about 4.3M
and 2.5M tokens, roughly 64k per agent both times. Tightening the brief and the tools did not lower
the per-agent cost, because most of it is the fixed overhead of each step an agent takes. What did
lower the total was needing fewer agents: steps 1 and 2 above found more sources than the agents did
and cost nothing per county.

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
- **States with only statewide totals in Pushbuild** can be read from the state's own site instead:
  write an adapter in `shared/adapters/`, add its fetch to `stateSites.ts`, and name it in `STATE_DIRECT`
  in `shared/races/2026.ts`. A race takes one free source, so two pollers never overwrite each other.
  The contest ids for Nebraska, New Mexico and South Dakota and Alabama's election code are specific to
  this election; a new year needs new ones (they're in the address of each site's contest page).
- **Oklahoma** stays one statewide dot: its results site (results.okelections.gov) refuses automated requests.
- **Alabama** pages show ten contests each, so that adapter only reaches top-of-ballot races.
- **States with only statewide totals** in a feed show one dot at the state's center until county rows arrive.
- **Below county** (precincts) exists for Florida's 2026 governor race only: see the next section.
- The map bundles us-atlas (~800 KB). Move it to `public/` and fetch it if first load matters.
