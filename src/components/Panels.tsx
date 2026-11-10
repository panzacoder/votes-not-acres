import { useMemo, useState } from "react";
import type { Doc } from "../../convex/_generated/dataModel";
import { STATES, FIPS_BY_POSTAL } from "../../shared/states";
import { PARTY_LABEL } from "../../shared/parties";
import type { PartyCode } from "../../shared/types";
import { PARTY_COLOR } from "../colors";
import { fmtInt, fmtMargin, fmtPct, fmtTime } from "../format";

type Race = Omit<Doc<"races">, "hash">;
type County = Omit<Doc<"countyResults">, "_id" | "_creationTime" | "year" | "office">;
export type RaceDetail = Race & { counties: County[] };

const stateName = (postal: string) => STATES[FIPS_BY_POSTAL[postal]]?.name ?? postal;

/** Candidate rows: name, party, votes, share, and a bar on one 0–100% scale. */
function Candidates({ race, votes, total }: { race: Race; votes: Record<string, number>; total: number }) {
  const rows = race.candidates
    .map((c) => ({ ...c, v: votes[c.key] ?? 0 }))
    .filter((c) => c.v > 0 || c.key !== "other")
    .sort((a, b) => (a.key === "other" ? 1 : b.key === "other" ? -1 : b.v - a.v));
  return (
    <ul className="cands">
      {rows.map((c) => (
        <li key={c.key}>
          <div className="cand-line">
            <span className="cand-name">
              {c.name}
              {race.calledFor === c.key && <span className="called" title="Race called by the source"> ✓</span>}
            </span>
            <span className="cand-pct">{total ? fmtPct(c.v / total) : "—"}</span>
          </div>
          <div className="cand-bar" aria-hidden>
            <i style={{ width: total ? `${(c.v / total) * 100}%` : 0, background: PARTY_COLOR[c.party] ?? PARTY_COLOR.OTH }} />
          </div>
          <div className="cand-sub">
            {PARTY_LABEL[c.party as PartyCode] ?? c.party} · {fmtInt.format(c.v)}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Reporting({ r, t }: { r?: number; t?: number }) {
  if (t === undefined || !t) return null;
  return <p className="meta">{fmtPct((r ?? 0) / t, 0)} of precincts reporting ({fmtInt.format(r ?? 0)} of {fmtInt.format(t)})</p>;
}

function Source({ race }: { race: Race }) {
  if (!race.source) return null;
  const { name, url, updatedAt, fetchedAt } = race.source;
  return (
    <p className="meta source">
      Source: {url ? <a href={url} target="_blank" rel="noreferrer">{name}</a> : name}
      {updatedAt ? `, as of ${fmtTime(updatedAt)}` : ""}. Checked {fmtTime(fetchedAt)}.
    </p>
  );
}

export function NationalPanel({ races, onPick, office }: { races: Race[] | undefined; onPick: (postal: string) => void; office: string }) {
  if (!races) return <div className="panel-body"><div className="skeleton" /></div>;
  const reporting = races.filter((r) => r.status !== "nodata").length;
  return (
    <div className="panel-body">
      <h2 className="panel-title">{races.length} {office} races</h2>
      <p className="meta">{reporting} with results so far. Pick one to zoom in.</p>
      <ul className="race-list">
        {[...races].sort((a, b) => stateName(a.state).localeCompare(stateName(b.state))).map((r) => {
          const lead = r.candidates.find((c) => c.key !== "other");
          const second = r.candidates.filter((c) => c.key !== "other")[1];
          const total = r.statewide?.total ?? 0;
          const margin = lead && total ? (lead.votes - (second?.votes ?? 0)) / total : null;
          return (
            <li key={r.raceId}>
              <button type="button" onClick={() => onPick(r.state)}>
                <span className="rl-state">{stateName(r.state)}</span>
                {r.status === "nodata" || !lead ? (
                  <span className="rl-wait">No results yet</span>
                ) : (
                  <>
                    <span className="rl-lead">
                      <i style={{ background: PARTY_COLOR[lead.party] ?? PARTY_COLOR.OTH }} />
                      <span className="rl-name">{lead.name}</span>
                    </span>
                    <span className="rl-margin">{fmtMargin(lead.party, margin)}</span>
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function RacePanel({ race, onPickCounty }: { race: RaceDetail | null | undefined; onPickCounty: (fips: string) => void }) {
  const [q, setQ] = useState("");
  const counties = useMemo(
    () =>
      (race?.counties ?? [])
        .filter((c) => !c.fips.endsWith("000"))
        .filter((c) => c.unitName.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => b.total - a.total),
    [race, q],
  );
  if (race === undefined) return <div className="panel-body"><div className="skeleton" /></div>;
  if (race === null) return <div className="panel-body"><p className="meta">There’s no race for this state in this election.</p></div>;
  const sw = race.statewide;
  return (
    <div className="panel-body">
      <h2 className="panel-title">{race.label}</h2>
      {race.status === "nodata" || !sw ? (
        <p className="meta">No results in the feed for this race yet. It updates on its own as the source publishes.</p>
      ) : (
        <>
          <Candidates race={race} votes={sw.votes} total={sw.total} />
          <p className="meta">{fmtInt.format(sw.total)} votes counted</p>
          <Reporting r={sw.precinctsReporting} t={sw.precinctsTotal} />
        </>
      )}
      {race.unmatchedUnits.length > 0 && (
        <p className="meta note">
          This state reports by {/district/i.test(race.unmatchedUnits[0]) ? "district" : "town"} rather than county, so its
          {" "}{fmtInt.format(race.unmatchedUnits.length)} units are in the statewide total but not placed on the map yet.
        </p>
      )}
      <Source race={race} />
      {counties.length > 0 && (
        <>
          <h3 className="panel-sub">Counties by votes cast</h3>
          <input className="search" type="search" placeholder="Find a county" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a county" />
          <ul className="county-list">
            {counties.map((c) => (
              <li key={c.fips}>
                <button type="button" onClick={() => onPickCounty(c.fips)}>
                  <span>{c.unitName}</span>
                  <span className="cl-votes">{fmtInt.format(c.total)}</span>
                  <span className="cl-margin" style={{ color: c.leaderParty ? PARTY_COLOR[c.leaderParty] : undefined }}>
                    {fmtMargin(c.leaderParty ?? null, c.margin ?? null)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function CountyPanel({ race, fips }: { race: RaceDetail | null | undefined; fips: string }) {
  if (!race) return <div className="panel-body"><div className="skeleton" /></div>;
  const c = race.counties.find((x) => x.fips === fips);
  if (!c) return <div className="panel-body"><p className="meta">No results for this county in this race.</p></div>;
  const stateTotal = race.statewide?.total ?? 0;
  return (
    <div className="panel-body">
      <h2 className="panel-title">{c.unitName}</h2>
      <p className="meta">{race.label}</p>
      {c.total ? <Candidates race={race} votes={c.votes} total={c.total} /> : <p className="meta">No votes reported yet.</p>}
      <p className="meta">
        {fmtInt.format(c.total)} votes counted
        {stateTotal ? `, ${fmtPct(c.total / stateTotal)} of the statewide vote` : ""}
      </p>
      <Reporting r={c.precinctsReporting} t={c.precinctsTotal} />
      <Source race={race} />
    </div>
  );
}
