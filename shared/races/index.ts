import type { RaceDef } from "../types";
import { RACES_2024 } from "./2024";
import { RACES_2026 } from "./2026";

/** Every race the app knows about. Add a year by adding a file and listing it here. */
export const ALL_RACES: RaceDef[] = [...RACES_2026, ...RACES_2024];

export const raceById = new Map(ALL_RACES.map((r) => [r.id, r]));
export const racesFor = (year: number, office?: string) =>
  ALL_RACES.filter((r) => r.year === year && (!office || r.office === office));
