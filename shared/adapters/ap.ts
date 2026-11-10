import type { NormalizedRace, RaceDef } from "../types";
import { normalizeParty } from "../parties";
import { slug } from "../names";
import { statewideFips } from "../states";
import { foldMinor, RaceBuilder, sumUnits } from "./candidates";

/**
 * AP Elections API v2 (https://developer.ap.org/ap-elections-api/).
 * Written against the documented JSON shape for
 *   GET /v2/elections/{date}?statepostal=TX,GA&officeID=G&level=FIPS&format=json
 * Verify field names against your AP account's docs before election night; the
 * mapping is small and lives entirely in this function.
 */
export interface ApCandidate { first?: string; last: string; party?: string; candidateID?: string; voteCount?: number; winner?: string }
export interface ApUnit {
  level: string; // "state" | "FIPSCode" | "subunit" ...
  statePostal?: string; fipsCode?: string; reportingunitName?: string;
  precinctsReporting?: number; precinctsTotal?: number; lastUpdated?: string;
  candidates: ApCandidate[];
}
export interface ApRace { statePostal: string; officeID: string; raceID: string; reportingUnits?: ApUnit[] }
export interface ApResponse { races?: ApRace[]; nextrequest?: string }

export function normalizeAp(json: ApResponse, races: RaceDef[], fetchedAt: string): NormalizedRace[] {
  const out: NormalizedRace[] = [];
  for (const race of races) {
    const ap = race.sources.ap;
    if (!ap) continue;
    const r = json.races?.find(
      (x) => x.statePostal === race.state && x.officeID === ap.officeID && (!ap.raceID || x.raceID === ap.raceID),
    );
    if (!r) continue;
    const b = new RaceBuilder(race);
    const unmatched: string[] = [];
    let updatedAt: string | undefined;
    let calledFor: string | undefined;
    for (const u of r.reportingUnits ?? []) {
      const isState = u.level === "state";
      const fips = u.fipsCode && /^\d{5}$/.test(u.fipsCode) ? u.fipsCode : "";
      if (!isState && !fips) { unmatched.push(u.reportingunitName ?? "unit"); }
      const key = isState ? "__state" : fips ? `c:${fips}` : `u:${u.reportingunitName}`;
      updatedAt = u.lastUpdated ?? updatedAt;
      for (const c of u.candidates) {
        const name = [c.first, c.last].filter(Boolean).join(" ");
        // AP gives a stable candidateID; use its own name and party rather than the generic cleanup.
        const resolved = race.candidates?.length ? undefined : { key: slug(name), name, party: normalizeParty(c.party) };
        if (resolved && !b.candidates.has(resolved.key)) b.candidates.set(resolved.key, resolved);
        b.add(key, {
          fips: isState ? statewideFips(race.state) : fips, unitName: isState ? "Statewide" : u.reportingunitName ?? fips,
          precinctsReporting: u.precinctsReporting, precinctsTotal: u.precinctsTotal,
        }, name, c.party, c.voteCount ?? 0);
        if (isState && c.winner === "X") calledFor = resolved?.key ?? slug(name);
      }
    }
    const all = [...b.units.entries()];
    const counties = all.filter(([k]) => k.startsWith("c:")).map(([, u]) => u);
    const statewide = b.units.get("__state") ?? (counties.length ? sumUnits(counties, statewideFips(race.state), "Statewide") : null);
    out.push(foldMinor({
      raceId: race.id,
      candidates: [...b.candidates.values()],
      statewide,
      counties: counties.length ? counties : statewide ? [{ ...statewide }] : [],
      unmatchedUnits: unmatched,
      source: { name: "Associated Press", updatedAt, fetchedAt },
      calledFor,
    }));
  }
  return out;
}
