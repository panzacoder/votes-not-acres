/** Offices the app knows how to classify. Add more as you add race definitions. */
export type Office = "governor" | "president" | "senate";

/** Normalized party buckets used for color and grouping. */
export type PartyCode = "DEM" | "REP" | "LIB" | "GRN" | "IND" | "OTH";

/**
 * Optional, hand-maintained candidate entry for a race. You only need these to
 * clean up how a source spells a name or to force a party; otherwise candidates
 * are derived from the source rows.
 */
export interface CandidateDef {
  key: string; // stable slug, e.g. "shapiro"
  name: string; // display name
  party: PartyCode;
  /** Lowercased substrings that identify this candidate in any source's name field. */
  match: string[];
}

/** One race, defined in code for a given year. */
export interface RaceDef {
  id: string; // e.g. "2026-governor-TX"
  year: number;
  office: Office;
  state: string; // postal code
  label: string; // "Texas governor"
  candidates?: CandidateDef[];
  sources: {
    /** Pushbuild CSV feed: a case-insensitive regex (as a string) for the contest name. */
    pushbuild?: { contest: string };
    /** AP Elections API: officeID (G = governor, S = senate, P = president), optional raceID. */
    ap?: { officeID: string; raceID?: string };
    /** One-off historical import already in a normalized file. */
    seed?: "tonmcg2024";
  };
}

/** What every source adapter produces, before it's written to Convex. */
export interface NormalizedCandidate {
  key: string;
  name: string;
  party: PartyCode;
}

export interface NormalizedUnit {
  fips: string; // 5-digit county FIPS, or "SS000" for a statewide-only unit
  unitName: string;
  total: number;
  votes: Record<string, number>; // candidate key -> votes
  precinctsReporting?: number;
  precinctsTotal?: number;
}

export interface NormalizedRace {
  raceId: string;
  candidates: NormalizedCandidate[];
  statewide: NormalizedUnit | null;
  counties: NormalizedUnit[];
  /** Source units we couldn't place on a county (towns, legislative districts...). */
  unmatchedUnits: string[];
  source: { name: string; url?: string; updatedAt?: string; fetchedAt: string };
  /** Winner as declared by the source, if it declares one (AP does). */
  calledFor?: string;
}
