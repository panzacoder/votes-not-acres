/**
 * Races that also have results below the county: which counties publish precinct results, and
 * where. `npm run import:precincts` reads them on request (nothing here is polled). Precinct dots
 * replace a county's single dot when at least 90% of its votes can be placed (see
 * shared/precincts/sources.ts for where the locations come from).
 *
 * Florida: county Supervisors of Elections on the Voter Focus platform
 * (https://enr.electionsfl.org/<code>/<electionId>/Summary/). The ids are this election's.
 */
/** One county and how its precinct results are read (one of the optional fields). */
export interface PrecinctCounty { fips: string; name: string; voterfocus?: { code: string; electionId: string } }

export interface PrecinctSource {
  raceId: string;
  state: string;
  /** Regex (as a string) for the contest name in the county files. */
  contest: string;
  /** The election's date as the county sites print it: a guard against reading another election. */
  electionDate: string;
  counties: PrecinctCounty[];
}

const vf = (fips: string, name: string, code: string, electionId: string): PrecinctCounty => ({ fips, name, voterfocus: { code, electionId } });

export const PRECINCT_SOURCES_2026: PrecinctSource[] = [
  {
    raceId: "2026-governor-FL",
    state: "FL",
    // County sites abbreviate freely: "Governor and Lieutenant Governor", "Gov./Lt. Gov.", "Gov & Lt. Gov".
    contest: "^gov(ernor)?\\.?( ?(and|&|/) ?(lt\\.?|lieutenant) gov(ernor)?\\.?)?$",
    electionDate: "11/3/2026",
    counties: [
      vf("12001", "Alachua", "ALA", "4097"),
      vf("12003", "Baker", "BAK", "4124"),
      vf("12005", "Bay", "BAY", "4078"),
      vf("12007", "Bradford", "BRA", "4113"),
      vf("12009", "Brevard", "BRE", "4064"),
      vf("12013", "Calhoun", "CAL", "4054"),
      vf("12015", "Charlotte", "CHA", "4062"),
      vf("12017", "Citrus", "CIT", "4070"),
      vf("12021", "Collier", "CLL", "4083"),
      vf("12023", "Columbia", "CLM", "4069"),
      vf("12027", "DeSoto", "DES", "4094"),
      vf("12029", "Dixie", "DIX", "4125"),
      vf("12031", "Duval", "DUV", "4076"),
      vf("12033", "Escambia", "ESC", "3977"),
      vf("12037", "Franklin", "FRA", "4130"),
      vf("12039", "Gadsden", "GAD", "4066"),
      vf("12041", "Gilchrist", "GIL", "4055"),
      vf("12043", "Glades", "GLA", "4065"),
      vf("12045", "Gulf", "GUL", "4084"),
      vf("12049", "Hardee", "HAR", "4063"),
      vf("12055", "Highlands", "HIG", "4127"),
      vf("12059", "Holmes", "HOL", "4108"),
      vf("12061", "Indian River", "IND", "4096"),
      vf("12067", "Lafayette", "LAF", "4071"),
      vf("12069", "Lake", "LAK", "4079"),
      vf("12071", "Lee", "LEE", "4111"),
      vf("12073", "Leon", "LEO", "4072"),
      vf("12075", "Levy", "LEV", "4058"),
      vf("12079", "Madison", "MAD", "4061"),
      vf("12081", "Manatee", "MAN", "4126"),
      vf("12083", "Marion", "MRN", "4099"),
      vf("12086", "Miami-Dade", "DAD", "4087"),
      vf("12087", "Monroe", "MON", "4109"),
      vf("12089", "Nassau", "NAS", "4080"),
      vf("12091", "Okaloosa", "OKA", "4092"),
      vf("12093", "Okeechobee", "OKE", "4060"),
      vf("12099", "Palm Beach", "PAL", "4131"),
      vf("12101", "Pasco", "PAS", "4085"),
      vf("12105", "Polk", "POL", "4000"),
      vf("12111", "St. Lucie", "STL", "4089"),
      vf("12115", "Sarasota", "SAR", "4105"),
      vf("12117", "Seminole", "SEM", "4119"),
      vf("12019", "Clay", "CLA", "4086"),
      vf("12047", "Hamilton", "HAM", "4101"),
      vf("12051", "Hendry", "HEN", "4077"),
      vf("12053", "Hernando", "HER", "4106"),
      vf("12057", "Hillsborough", "HIL", "4074"),
      vf("12065", "Jefferson", "JEF", "4115"),
      vf("12095", "Orange", "ORA", "4090"),
      vf("12107", "Putnam", "PUT", "4081"),
      vf("12113", "Santa Rosa", "SAN", "4093"),
      vf("12121", "Suwannee", "SUW", "4112"),
      vf("12123", "Taylor", "TAY", "4107"),
      vf("12125", "Union", "UNI", "4121"),
      vf("12129", "Wakulla", "WAK", "4128"),
      vf("12131", "Walton", "WAL", "4091"),
    ],
  },
];
