/**
 * Where precinct locations come from, per state. A precinct dot needs a point on the map, and
 * results files don't carry one, so scripts/gen-precinct-points.ts builds shared/precincts/<ST>.json
 * (county FIPS -> precinct key -> [x, y] in the map's frame) from:
 *  - `census`: the Census Bureau's 2020 voting districts for the state (every county, but drawn
 *    before the 2022 redistricting: a precinct that kept its number may have moved or changed shape);
 *  - `layers`: a county's own current precinct layer (an ArcGIS REST layer), which replaces the
 *    Census points for that county. `field` is the attribute holding the precinct number.
 */
export interface PrecinctPointSources {
  census: string;
  layers: { fips: string; url: string; field: string }[];
}

export const PRECINCT_POINT_SOURCES: Record<string, PrecinctPointSources> = {
  FL: {
    census: "https://www2.census.gov/geo/tiger/TIGER2020PL/LAYER/VTD/2020/tl_2020_12_vtd20.zip",
    layers: [
      { fips: "12086", url: "https://gisweb.miamidade.gov/arcgis/rest/services/MD_Emaps/MapServer/28", field: "ID" },
      { fips: "12069", url: "https://gis.lakecountyfl.gov/lakegis/rest/services/OpenData/OpenData2/MapServer/13", field: "Precinct" },
      { fips: "12105", url: "https://gis.polkfl.gov/hosting/rest/services/Supervisor_of_Elections/Polk_County_FL_Supervisor_of_Elections_Map/MapServer/0", field: "PRECINCT" },
    ],
  },
};
