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
      { fips: "12001", url: "https://services.arcgis.com/cNo3jpluyt69V8Ek/arcgis/rest/services/ElectionPrecincts/FeatureServer/0", field: "PCTSHORT" }, // Alachua
      { fips: "12007", url: "https://services2.arcgis.com/lDPOpWlxtwZ1tDwV/arcgis/rest/services/Voting_Information/FeatureServer/2", field: "PrincinctNumber" }, // Bradford
      { fips: "12013", url: "https://services7.arcgis.com/hqKrf0AHNpUENm62/arcgis/rest/services/Calhoun_County_Voting_Precincts___Polling_Locations_WFL1/FeatureServer/9", field: "PRECINCTS" }, // Calhoun
      { fips: "12055", url: "https://services2.arcgis.com/xEhz4K4uxbjGXOPE/arcgis/rest/services/Voting_Precinct_(agol)/FeatureServer/3", field: "CombndPCT" }, // Highlands
      { fips: "12073", url: "https://intervector.leoncountyfl.gov/intervector/rest/services/MapServices/SOE_DistrictsCurrent_D_WM/MapServer/0", field: "PRECINCT" }, // Leon
      { fips: "12087", url: "https://services8.arcgis.com/ha6xKXaEiCmVQytX/arcgis/rest/services/Monroe_County_Voting_Precincts/FeatureServer/0", field: "Precinct" }, // Monroe
      { fips: "12117", url: "https://services6.arcgis.com/XWQ2U3nYvneiYCki/arcgis/rest/services/SEM_Voter_Precincts/FeatureServer/0", field: "VotingPrec" }, // Seminole
      { fips: "12115", url: "https://ags3.scgov.net/server/rest/services/Hosted/VotingPrecinct/FeatureServer/0", field: "precinctnumber" }, // Sarasota
      { fips: "12053", url: "https://services2.arcgis.com/x5zvhhxfUuRDntRe/arcgis/rest/services/Voters/FeatureServer/8", field: "PRECNCTNO" }, // Hernando
      { fips: "12057", url: "https://services.arcgis.com/apTfC6SUmnNfnxuF/arcgis/rest/services/ElectionGeography_1793fd0371ac4284a1c599bcaa3e91cc/FeatureServer/1", field: "name" }, // Hillsborough
      { fips: "12095", url: "https://services8.arcgis.com/KROpZDerJ9MICPIU/arcgis/rest/services/OCSOE_Precincts/FeatureServer/0", field: "Precinct" }, // Orange
    ],
  },
};
