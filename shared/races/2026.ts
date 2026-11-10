import type { RaceDef } from "../types";
import { FIPS_BY_POSTAL, STATES } from "../states";

/**
 * 2026 governor races. These are the 36 states with a regularly scheduled
 * governor election in November 2026.
 *
 * Candidates aren't listed: they're taken from each source's rows, with names
 * cleaned and parties normalized (see shared/names.ts, shared/parties.ts). Add a
 * `candidates` array to a race only to fix a name or force a party.
 */
const GOVERNOR_2026 = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "FL", "GA", "HI", "ID", "IL",
  "IA", "KS", "ME", "MD", "MA", "MI", "MN", "NE", "NV", "NH", "NM", "NY",
  "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "VT", "WI", "WY",
];

/**
 * Matches "Governor", "FOR GOVERNOR", "Governor & Lt Governor", "GOVERNOR/LT GOVERNOR", "Governor / Lieutenant Governor",
 * "KS Governor/Lt. Governor", "GOVERNOR AND LIEUTENANT GOVERNOR State"... but not "Lieutenant Governor" or
 * "Governor of Wayne State University". Runs of spaces in the feed's contest name are collapsed before matching.
 */
const GOVERNOR_CONTEST = "^(for |[a-z]{2} )?governor( ?(and|&|/) ?(lt\\.?|lieutenant) governor)?( state)?$";

/**
 * States read from their own results site instead of Pushbuild, because Pushbuild's file
 * has no county rows for them. A race lists one free source, so two pollers never overwrite each other.
 */
const STATE_DIRECT: Record<string, RaceDef["sources"]> = {
  AL: { alsos: { ecode: "1001305", contest: "^governor$" } },
  CA: { casos: { contest: "governor" } },
  NE: { totalvote: { service: "https://neresultswebservice.azurewebsites.us/ResultsAjax.svc", type: "SW", raceID: "13508", osn: "105", url: "https://electionresults.nebraska.gov/resultsSW.aspx?type=SW&map=CTY" } },
  NM: { totalvote: { service: "https://nmresultswebservice.azurewebsites.us/NMResultsAjax.svc", type: "SW", raceID: "11530", osn: "202", url: "https://electionresults.sos.nm.gov/resultsSW.aspx?type=SW&map=CTY" } },
  SD: { totalvote: { service: "https://sdresws.azurewebsites.us/ResultsAjax.svc", type: "SWR", raceID: "14896", osn: "205", url: "https://electionresults.sd.gov/resultsSW.aspx?type=SWR&map=CTY" } },
  VT: { vtsos: { office: "GOVERNOR" } },
};

export const RACES_2026: RaceDef[] = GOVERNOR_2026.map((postal) => ({
  id: `2026-governor-${postal}`,
  year: 2026,
  office: "governor",
  state: postal,
  label: `${STATES[FIPS_BY_POSTAL[postal]].name} governor`,
  sources: { ...(STATE_DIRECT[postal] ?? { pushbuild: { contest: GOVERNOR_CONTEST } }), ap: { officeID: "G" } },
}));
