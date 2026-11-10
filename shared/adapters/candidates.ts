import type { NormalizedCandidate, NormalizedRace, NormalizedUnit, RaceDef } from "../types";
import { isWriteInParty, normalizeParty } from "../parties";
import { cleanCandidateName, isWriteInOrNone, slug } from "../names";

const MAJOR = new Set(["DEM", "REP"]);

export const OTHER: NormalizedCandidate = { key: "other", name: "Write-ins and others", party: "OTH" };

/** Resolve a source's candidate row to a stable candidate, using the race's overrides when present. */
export function resolveCandidate(race: RaceDef, rawName: string, rawParty?: string): NormalizedCandidate {
  const lower = rawName.toLowerCase();
  for (const c of race.candidates ?? []) {
    if (c.match.some((m) => lower.includes(m))) return { key: c.key, name: c.name, party: c.party };
  }
  const name = cleanCandidateName(rawName);
  if (!name || isWriteInOrNone(name) || isWriteInParty(rawParty)) return OTHER;
  // Party: the party column, else a "(DEM)" style tag inside the name.
  const tag = rawName.match(/\(([^)]+)\)/)?.[1];
  const party = normalizeParty(rawParty || tag);
  return { key: slug(name), name, party };
}

/** Accumulates units for one race, merging candidate aliases and summing duplicate rows. */
export class RaceBuilder {
  candidates = new Map<string, NormalizedCandidate>();
  units = new Map<string, NormalizedUnit>();
  constructor(public race: RaceDef) {}

  add(
    unitKey: string,
    unit: Omit<NormalizedUnit, "votes" | "total"> & { total?: number },
    rawName: string,
    rawParty: string | undefined,
    votes: number,
  ) {
    const cand = resolveCandidate(this.race, rawName, rawParty);
    // Fusion states (CT, NY) list one candidate on several party lines: merge them, keeping the major party.
    const seen = this.candidates.get(cand.key);
    if (!seen || (!MAJOR.has(seen.party) && MAJOR.has(cand.party))) this.candidates.set(cand.key, cand);
    let u = this.units.get(unitKey);
    if (!u) {
      u = { ...unit, total: 0, votes: {} };
      this.units.set(unitKey, u);
    }
    u.votes[cand.key] = (u.votes[cand.key] ?? 0) + (Number.isFinite(votes) ? votes : 0);
    u.total = Object.values(u.votes).reduce((a, b) => a + b, 0);
    if (unit.precinctsReporting !== undefined) u.precinctsReporting = unit.precinctsReporting;
    if (unit.precinctsTotal !== undefined) u.precinctsTotal = unit.precinctsTotal;
  }
}

/** Sum units into one (used when a source gives no statewide row). */
export function sumUnits(units: NormalizedUnit[], fips: string, unitName: string): NormalizedUnit {
  const votes: Record<string, number> = {};
  let pr = 0, pt = 0, hasP = false;
  for (const u of units) {
    for (const [k, v] of Object.entries(u.votes)) votes[k] = (votes[k] ?? 0) + v;
    if (u.precinctsTotal !== undefined) { hasP = true; pr += u.precinctsReporting ?? 0; pt += u.precinctsTotal; }
  }
  return {
    fips, unitName, votes,
    total: Object.values(votes).reduce((a, b) => a + b, 0),
    ...(hasP ? { precinctsReporting: pr, precinctsTotal: pt } : {}),
  };
}

/**
 * Fold minor candidates (under `share` of the statewide vote, not DEM/REP) into "other",
 * so a ballot with forty write-ins doesn't become forty legend entries.
 */
export function foldMinor(race: NormalizedRace, share = 0.005): NormalizedRace {
  const total = race.statewide?.total ?? 0;
  if (!total) return race;
  const keep = new Set(
    race.candidates
      .filter((c) => c.key !== "other" && (MAJOR.has(c.party) || (race.statewide!.votes[c.key] ?? 0) / total >= share))
      .map((c) => c.key),
  );
  const fold = (u: NormalizedUnit): NormalizedUnit => {
    const votes: Record<string, number> = {};
    for (const [k, v] of Object.entries(u.votes)) {
      const key = keep.has(k) ? k : "other";
      votes[key] = (votes[key] ?? 0) + v;
    }
    return { ...u, votes };
  };
  const hasOther = race.candidates.some((c) => !keep.has(c.key));
  return {
    ...race,
    candidates: [...race.candidates.filter((c) => keep.has(c.key)), ...(hasOther ? [OTHER] : [])],
    statewide: race.statewide && fold(race.statewide),
    counties: race.counties.map(fold),
  };
}
