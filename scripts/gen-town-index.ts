/**
 * Generates shared/townIndex.json from the Census county subdivision code file:
 *   { [postal]: { counties: { [countyFips]: name }, towns: { [normalizedTown]: countyFips } } }
 * for the six New England states, whose election results are reported by town.
 *
 * The 2020 vintage is deliberate: it files Connecticut towns under the eight historical
 * counties, which are the county shapes us-atlas draws. Later vintages use planning regions.
 * Run with `npm run gen:towns`.
 */
import fs from "node:fs";
import { normTown, stripTownKind } from "../shared/names";

export const COUSUB_URL = "https://www2.census.gov/geo/docs/reference/codes2020/national_cousub2020.txt";
const TOWN_STATES = ["CT", "RI", "MA", "VT", "NH", "ME"];

const res = await fetch(COUSUB_URL);
if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${COUSUB_URL}`);
const [header, ...lines] = (await res.text()).trim().split(/\r?\n/);
const cols = header.split("|");
const col = (name: string) => {
  const i = cols.indexOf(name);
  if (i < 0) throw new Error(`Census file has no ${name} column (got ${header})`);
  return i;
};
const [STATE, STATEFP, COUNTYFP, COUNTYNAME, COUSUBNAME] = ["STATE", "STATEFP", "COUNTYFP", "COUNTYNAME", "COUSUBNAME"].map(col);

type StateIndex = { counties: Record<string, string>; towns: Record<string, string> };
const out: Record<string, StateIndex> = Object.fromEntries(TOWN_STATES.map((s) => [s, { counties: {}, towns: {} }]));
const ambiguous: string[] = [];
let subdivisions = 0;
// A bare name used in two counties of one state can't be placed by name alone: it is left out.
const bare = new Map<string, { fips: string; incorporated: boolean; name: string }>();
const full: [string, string, string][] = [];

for (const line of lines) {
  const f = line.split("|");
  const idx = out[f[STATE]];
  if (!idx) continue;
  const name = f[COUSUBNAME];
  if (/^County subdivisions not defined$/i.test(name)) continue; // water
  const fips = f[STATEFP] + f[COUNTYFP];
  idx.counties[fips] = f[COUNTYNAME];
  subdivisions++;
  const base = stripTownKind(name);
  const incorporated = /\s(town|city)$/i.test(name);
  const keys = [normTown(base)];
  // Massachusetts cities that kept "Town of" in their legal name: "Barnstable Town city" is Barnstable.
  if (f[STATE] === "MA" && / Town$/.test(base)) keys.push(normTown(base.replace(/ Town$/, "")));
  for (const key of keys) {
    const seen = bare.get(`${f[STATE]}:${key}`);
    // "Lincoln" means the town of Lincoln, not Lincoln plantation two counties over.
    if (!seen || (incorporated && !seen.incorporated)) bare.set(`${f[STATE]}:${key}`, { fips, incorporated, name });
    else if (seen.fips !== fips && incorporated === seen.incorporated) { seen.fips = ""; ambiguous.push(`${f[STATE]} ${name} (${f[COUNTYNAME]})`); }
  }
  // Plantations, gores, grants and the like are also reachable by their full name ("Lincoln plantation", "Lincoln Plt").
  if (!incorporated) {
    full.push([f[STATE], normTown(name), fips]);
    if (/ plantation$/i.test(name)) full.push([f[STATE], normTown(`${base} plt`), fips]);
  }
}
for (const [k, v] of bare) if (v.fips) out[k.slice(0, 2)].towns[k.slice(3)] = v.fips;
for (const [st, key, fips] of full) {
  const seen = out[st].towns[key];
  if (seen === undefined) out[st].towns[key] = fips;
  else if (seen !== fips) ambiguous.push(`${st} ${key}`);
}

fs.writeFileSync(new URL("../shared/townIndex.json", import.meta.url), JSON.stringify(out));
for (const [st, idx] of Object.entries(out))
  console.log(st, `${Object.keys(idx.counties).length} counties,`, Object.keys(idx.towns).length, "town names");
console.log(`${subdivisions} subdivisions read.`, ambiguous.length ? `Ambiguous, left out: ${ambiguous.join("; ")}` : "No ambiguous names.");
