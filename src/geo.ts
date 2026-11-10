import { geoPath } from "d3";
import { feature } from "topojson-client";
import type { Feature, Geometry } from "geojson";
import us from "us-atlas/counties-albers-10m.json";
import { STATES } from "../shared/states";

/** us-atlas's Albers USA file is already projected into a 975×610 frame. */
export const W = 975;
export const H = 610;
export const path = geoPath();

type F = Feature<Geometry, { name: string }> & { id: string };
const objects = us.objects as Record<string, never>;
export const counties = (feature(us, objects.counties) as unknown as { features: F[] }).features;
export const states = (feature(us, objects.states) as unknown as { features: F[] }).features;

export const stateByFips = new Map(states.map((s) => [s.id, s]));
export const stateByPostal = new Map(states.flatMap((s) => (STATES[s.id] ? [[STATES[s.id].postal, s] as const] : [])));
export const countyByFips = new Map(counties.map((c) => [c.id, c]));

const centroid = new Map<string, [number, number]>(counties.map((c) => [c.id, path.centroid(c) as [number, number]]));
const mean = (ids: string[]): [number, number] => {
  const pts = ids.map((id) => centroid.get(id)!).filter(Boolean);
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
};
/** Connecticut reports by 2022 planning regions; place each over the old counties it mostly covers. */
const CT_REGIONS: Record<string, string[]> = {
  "09110": ["09003"], "09120": ["09001", "09009"], "09130": ["09007"], "09140": ["09005", "09009"],
  "09150": ["09015"], "09160": ["09005"], "09170": ["09009"], "09180": ["09011"], "09190": ["09001"],
};

/** Where a result unit's dot goes. "SS000" units (no county breakdown) sit at the state's center. */
export function positionOf(fips: string): [number, number] | null {
  if (centroid.has(fips)) return centroid.get(fips)!;
  if (CT_REGIONS[fips]) return mean(CT_REGIONS[fips]);
  if (fips.endsWith("000")) {
    const st = stateByFips.get(fips.slice(0, 2));
    return st ? (path.centroid(st) as [number, number]) : null;
  }
  return null;
}

/** Bounds to zoom to for a state, as [[x0, y0], [x1, y1]] in map units. */
export const boundsOf = (postal: string) => {
  const st = stateByPostal.get(postal);
  return st ? path.bounds(st) : null;
};

/** Old Connecticut county → the planning region that covers most of it (for filling county shapes). */
const CT_COUNTY_TO_REGION: Record<string, string> = {
  "09001": "09190", "09003": "09110", "09005": "09160", "09007": "09130",
  "09009": "09170", "09011": "09180", "09013": "09110", "09015": "09150",
};

/** Result units that could color a county shape, most specific first. */
export const unitKeysForCounty = (countyFips: string) =>
  [countyFips, CT_COUNTY_TO_REGION[countyFips], `${countyFips.slice(0, 2)}000`].filter(Boolean) as string[];
