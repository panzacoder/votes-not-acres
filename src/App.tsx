import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { DotMap } from "./components/DotMap";
import { CountyPanel, NationalPanel, RacePanel } from "./components/Panels";
import { useRoute, href } from "./route";
import { STATES, FIPS_BY_POSTAL } from "../shared/states";
import { OFFICE_LABEL, fmtTime } from "./format";
import { PARTY_COLOR } from "./colors";

export default function App() {
  const [route, go] = useRoute();
  const editions = useQuery(api.races.editions);
  const [view, setView] = useState<"votes" | "acres">("votes");
  const [layout, setLayout] = useState<"geo" | "spread">("geo");

  // Default to the newest election once we know what exists.
  useEffect(() => {
    if (editions?.length && (route.year === undefined || !editions.some((e) => e.year === route.year && e.office === route.office)))
      go({ year: editions[0].year, office: editions[0].office }, true);
  }, [editions, route.year, route.office]);

  const ready = route.year !== undefined && !!route.office;
  const args = ready ? { year: route.year!, office: route.office! } : "skip";
  const races = useQuery(api.races.list, args);
  const dots = useQuery(api.races.nationalDots, args);
  const focusRace = races?.find((r) => r.state === route.state);
  const detail = useQuery(api.races.race, focusRace ? { raceId: focusRace.raceId } : "skip");
  const status = useQuery(api.races.ingestStatus);
  const raceStates = useMemo(() => new Set((races ?? []).map((r) => r.state)), [races]);

  // Escape steps back out: county → state → country.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (route.fips) go({ ...route, fips: undefined });
      else if (route.state) go({ year: route.year, office: route.office });
    };
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  }, [route]);

  const stateName = route.state ? STATES[FIPS_BY_POSTAL[route.state]]?.name : undefined;
  const countyName = route.fips ? detail?.counties.find((c) => c.fips === route.fips)?.unitName : undefined;
  const lastRun = status?.[0];

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <h1>Votes, not acres</h1>
          <p>Each county is a dot sized by the votes cast there, so a city of millions outweighs a county of empty land.</p>
        </div>
        <nav className="editions" aria-label="Election">
          {editions?.map((e) => (
            <a key={`${e.year}-${e.office}`} href={href({ year: e.year, office: e.office })}
               aria-current={e.year === route.year && e.office === route.office ? "page" : undefined}>
              <span className="ed-year">{e.year}</span> {OFFICE_LABEL[e.office] ?? e.office}
            </a>
          ))}
        </nav>
      </header>

      <main className="stage">
        <section className="map-col" aria-label="Map">
          <div className="map-tools">
            <ol className="crumbs" aria-label="Location">
              <li><a href={href({ year: route.year, office: route.office })}>United States</a></li>
              {stateName && <li><a href={href({ year: route.year, office: route.office, state: route.state })}>{stateName}</a></li>}
              {countyName && <li aria-current="page">{countyName}</li>}
            </ol>
            <div className="seg" role="group" aria-label="What the map shows">
              <button type="button" aria-pressed={view === "votes"} onClick={() => setView("votes")}>Votes</button>
              <button type="button" aria-pressed={view === "acres"} onClick={() => setView("acres")}>Acres</button>
            </div>
            <div className="seg" role="group" aria-label="Dot layout">
              <button type="button" aria-pressed={layout === "geo"} disabled={view !== "votes"} onClick={() => setLayout("geo")}>In place</button>
              <button type="button" aria-pressed={layout === "spread"} disabled={view !== "votes"} onClick={() => setLayout("spread")}>Spread out</button>
            </div>
          </div>
          <DotMap
            dots={dots}
            view={view}
            layout={layout}
            focus={route.state}
            selected={route.fips}
            raceStates={raceStates}
            onPickState={(state) => go({ year: route.year, office: route.office, state })}
            onPickCounty={(fips, state) => go({ year: route.year, office: route.office, state, fips })}
          />
          <div className="legend">
            <span className="ramp">
              <i style={{ background: PARTY_COLOR.DEM }} />D
              <b className="ramp-bar" />
              R<i style={{ background: PARTY_COLOR.REP }} />
            </span>
            <span><i className="dot-ring" /> No votes yet</span>
            <span><i className="sw" style={{ background: PARTY_COLOR.IND }} /> Independent or other leading</span>
            <span className="legend-hint">Scroll with ⌘/Ctrl or pinch to zoom. Esc steps back.</span>
          </div>
        </section>

        <aside className="panel" aria-live="polite">
          {route.fips ? (
            <CountyPanel race={detail} fips={route.fips} />
          ) : route.state ? (
            <RacePanel race={focusRace ? detail : races ? null : undefined}
              onPickCounty={(fips) => go({ ...route, fips })} />
          ) : (
            <NationalPanel races={races} office={OFFICE_LABEL[route.office ?? ""]?.toLowerCase() ?? ""}
              onPick={(state) => go({ year: route.year, office: route.office, state })} />
          )}
        </aside>
      </main>

      <footer className="foot">
        {lastRun ? (
          <span>
            Last update check {fmtTime(new Date(lastRun.startedAt).toISOString())} ({lastRun.source}
            {lastRun.ok ? "" : ", with errors"}). Results are unofficial until certified.
          </span>
        ) : (
          <span>Results are unofficial until certified.</span>
        )}
      </footer>
    </div>
  );
}
