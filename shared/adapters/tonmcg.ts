import type { NormalizedRace, NormalizedUnit, RaceDef } from "../types";
import { parseCsv } from "../csv";
import { STATES, statewideFips } from "../states";
import { sumUnits } from "./candidates";

/**
 * 2024 presidential results by county from
 * github.com/tonmcg/US_County_Level_Election_Results_08-24 (state-reported, certified).
 * Alaska reports by house district, so it becomes one statewide unit; DC's wards are combined.
 * Connecticut uses its 2022 planning-region FIPS codes (09110–09190); the client places those.
 */
export const TONMCG_2024_URL =
  "https://raw.githubusercontent.com/tonmcg/US_County_Level_Election_Results_08-24/master/2024_US_County_Level_Presidential_Results.csv";

export function normalizeTonmcg2024(csvText: string, races: RaceDef[], fetchedAt: string): NormalizedRace[] {
  const byState = new Map<string, NormalizedUnit[]>();
  for (const r of parseCsv(csvText)) {
    let fips = r.county_fips.padStart(5, "0");
    const st = STATES[fips.slice(0, 2)]?.postal;
    if (!st) continue;
    if (st === "AK") fips = statewideFips("AK");
    if (st === "DC") fips = "11001";
    const harris = Number(r.votes_dem), trump = Number(r.votes_gop), total = Number(r.total_votes);
    const unit: NormalizedUnit = {
      fips, unitName: st === "AK" ? "Alaska" : st === "DC" ? "District of Columbia" : r.county_name, total,
      votes: { harris, trump, other: Math.max(0, total - harris - trump) },
    };
    const list = byState.get(st) ?? [];
    const same = list.find((u) => u.fips === fips);
    if (same) { const merged = sumUnits([same, unit], fips, unit.unitName); Object.assign(same, merged); }
    else list.push(unit);
    byState.set(st, list);
  }
  return races
    .filter((r) => r.sources.seed === "tonmcg2024")
    .map((race) => {
      const counties = byState.get(race.state) ?? [];
      return {
        raceId: race.id,
        candidates: (race.candidates ?? []).map(({ key, name, party }) => ({ key, name, party })),
        statewide: counties.length ? sumUnits(counties, statewideFips(race.state), "Statewide") : null,
        counties,
        unmatchedUnits: [],
        source: { name: "State-certified results via tonmcg/US_County_Level_Election_Results_08-24", url: TONMCG_2024_URL, fetchedAt },
      };
    });
}
