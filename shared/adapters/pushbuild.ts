import type { NormalizedRace, NormalizedUnit, RaceDef } from "../types";
import { parseCsv } from "../csv";
import { normCounty, normTown, stripTownKind } from "../names";
import { statewideFips } from "../states";
import countyIndex from "../countyIndex.json";
import townIndex from "../townIndex.json";
import { foldMinor, RaceBuilder, sumUnits } from "./candidates";

/**
 * New England states report by town, not county, and many towns share a name with a
 * county (the town of Hartford is not Hartford County). Their "county" rows are towns,
 * so each is looked up in shared/townIndex.json (built from the Census county subdivision
 * file by scripts/gen-town-index.ts) and its votes are added to the county it sits in.
 */
const TOWNS = townIndex as Record<string, { counties: Record<string, string>; towns: Record<string, string> }>;

/** Place one of a town state's units: [county FIPS, county name], or undefined if we can't. */
function placeTown(state: string, raw: string): [string, string] | undefined {
  const idx = TOWNS[state];
  // A row that says "County" is one; anything else is a town, even when a county shares its name.
  const fips = /\scounty$/i.test(raw)
    ? INDEX[state]?.[normCounty(raw)]
    : idx.towns[normTown(raw)] ?? idx.towns[normTown(stripTownKind(raw))];
  return fips ? [fips, idx.counties[fips] ?? raw] : undefined;
}

const INDEX = countyIndex as Record<string, Record<string, string>>;
const num = (s: string | undefined) => (s === undefined || s === "" ? undefined : Number(s));

/**
 * Pushbuild publishes one CSV per state: state and county rows for every contest
 * in that state's official results feed. Columns: state, level, county, contest,
 * candidate, party, votes, pct, contestTotalVotes, precinctsReporting,
 * precinctsTotal, source, sourceUrl, sourceUpdatedAt, fetchedAt.
 */
export function normalizePushbuild(csvText: string, races: RaceDef[], fetchedAt: string): NormalizedRace[] {
  const rows = parseCsv(csvText);
  const out: NormalizedRace[] = [];
  for (const race of races) {
    const pattern = race.sources.pushbuild?.contest;
    if (!pattern) continue;
    const re = new RegExp(pattern, "i");
    const mine = rows.filter((r) => r.state === race.state && re.test(r.contest.trim().replace(/\s+/g, " ")));
    if (!mine.length) continue;

    const idx = INDEX[race.state] ?? {};
    const b = new RaceBuilder(race);
    const unmatched = new Set<string>();
    const countyNames = new Map<string, string>();
    let source = { name: "", url: "", updatedAt: "" };
    for (const r of mine) {
      const votes = Number(r.votes);
      const precincts = { precinctsReporting: num(r.precinctsReporting), precinctsTotal: num(r.precinctsTotal) };
      source = { name: r.source, url: r.sourceUrl, updatedAt: r.sourceUpdatedAt || source.updatedAt };
      if (r.level === "state") {
        b.add("__state", { fips: statewideFips(race.state), unitName: "Statewide", ...precincts }, r.candidate, r.party, votes);
      } else if (r.level === "county" && r.county.trim()) {
        const name = r.county.trim();
        if (TOWNS[race.state]) {
          // Keep each town as its own unit for now, so its precinct counts are read once
          // however many candidate rows it has; towns are summed into counties below.
          const county = placeTown(race.state, name);
          if (!county) unmatched.add(name);
          else countyNames.set(county[0], county[1]);
          b.add(county ? `t:${county[0]}:${name}` : `u:${name}`, { fips: county?.[0] ?? "", unitName: name, ...precincts }, r.candidate, r.party, votes);
        } else {
          const fips = idx[normCounty(name)];
          if (!fips) unmatched.add(name);
          b.add(fips ? `c:${fips}` : `u:${name}`, { fips: fips ?? "", unitName: name, ...precincts }, r.candidate, r.party, votes);
        }
      }
    }
    const all = [...b.units.entries()];
    const towns = new Map<string, NormalizedUnit[]>();
    for (const [k, u] of all) if (k.startsWith("t:")) towns.set(u.fips, [...(towns.get(u.fips) ?? []), u]);
    const counties = [
      ...all.filter(([k]) => k.startsWith("c:")).map(([, u]) => u),
      ...[...towns].map(([fips, units]) => sumUnits(units, fips, countyNames.get(fips) ?? fips)),
    ];
    const other = all.filter(([k]) => k.startsWith("u:")).map(([, u]) => u);
    const statewide =
      b.units.get("__state") ??
      (counties.length + other.length ? sumUnits([...counties, ...other], statewideFips(race.state), "Statewide") : null);

    out.push(foldMinor({
      raceId: race.id,
      candidates: [...b.candidates.values()],
      statewide,
      // A state with no county breakdown we can place still gets one dot, at the state's center.
      counties: counties.length ? counties : statewide ? [{ ...statewide }] : [],
      unmatchedUnits: [...unmatched],
      source: { name: source.name || "Pushbuild", url: source.url || undefined, updatedAt: source.updatedAt || undefined, fetchedAt },
    }));
  }
  return out;
}
