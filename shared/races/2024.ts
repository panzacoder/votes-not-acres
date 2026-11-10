import type { RaceDef } from "../types";
import { STATES } from "../states";

/** 2024 presidential results by county, imported once from a certified compilation (no live source). */
export const RACES_2024: RaceDef[] = Object.values(STATES).map(({ postal, name }) => ({
  id: `2024-president-${postal}`,
  year: 2024,
  office: "president",
  state: postal,
  label: `${name}: president`,
  candidates: [
    { key: "harris", name: "Kamala Harris", party: "DEM", match: ["harris"] },
    { key: "trump", name: "Donald Trump", party: "REP", match: ["trump"] },
    { key: "other", name: "All others", party: "OTH", match: [] },
  ],
  sources: { seed: "tonmcg2024" },
}));
