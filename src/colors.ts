import { interpolateRgb } from "d3";

/** Party base colors. Ink stays neutral; only results carry color. */
export const PARTY_COLOR: Record<string, string> = {
  DEM: "#2a62c4", REP: "#c9372f", IND: "#8a63b8", LIB: "#c9971a", GRN: "#2f8f5b", OTH: "#7d7886",
};
const NEUTRAL = "#bdb6c6";

/** Color by leader and margin: a 1-point race is nearly neutral, a 50-point race is full strength. */
export function marginColor(party: string | null, margin: number | null): string {
  if (!party || margin === null) return NEUTRAL;
  const k = Math.pow(Math.min(1, margin / 0.5), 0.7);
  return interpolateRgb(NEUTRAL, PARTY_COLOR[party] ?? PARTY_COLOR.OTH)(0.22 + 0.78 * k);
}
