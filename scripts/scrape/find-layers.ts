/**
 * Looks for a current precinct layer for each county that has precinct results but couldn't be
 * placed, by searching ArcGIS Online and scoring every candidate against the county's own
 * precinct names. No agent needed. `npm run find:layers [-- --all]`
 * Prints a line to paste into shared/precincts/sources.ts for each county it can place.
 */
import { PRECINCT_SOURCES_2026 } from "../../shared/races/precincts2026";
import { PRECINCT_POINT_SOURCES } from "../../shared/precincts/sources";
import { precinctKey } from "../../shared/names";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cachedPrecincts, polygonLayers, root, scoreLayer, searchArcgis, type LayerScore } from "./lib";

const all = process.argv.includes("--all");
for (const src of PRECINCT_SOURCES_2026) {
  const points: Record<string, Record<string, number[]>> = JSON.parse(readFileSync(join(root, "shared", "precincts", `${src.state}.json`), "utf8"));
  const have = new Set(PRECINCT_POINT_SOURCES[src.state]?.layers.map((l) => l.fips));
  for (const county of src.counties) {
    const precincts = cachedPrecincts(src.raceId, county.fips);
    if (!precincts || have.has(county.fips)) continue;
    const total = precincts.reduce((s, p) => s + p.total, 0) || 1;
    const now = precincts.filter((p) => points[county.fips]?.[precinctKey(p.name)]).reduce((s, p) => s + p.total, 0) / total;
    if (now >= 0.9 && !all) continue;
    let best = null as LayerScore | null;
    const seen = new Set<string>();
    const queries = [`title:precinct AND "${county.name}"`, `(precinct OR precincts OR voting) AND "${county.name} County" AND (florida OR FL)`];
    for (const q of queries) {
      for (const hit of await searchArcgis(q).catch(() => [])) {
        if (seen.has(hit.url)) continue;
        seen.add(hit.url);
        for (const layer of await polygonLayers(hit.url).catch(() => [])) {
          const s = await scoreLayer(layer, precincts, county.fips).catch(() => null);
          if (s && (!best || s.share > best.share)) best = s;
        }
      }
      if (best && best.share >= 0.97) break;
    }
    const verdict = best && best.share >= 0.9 && best.share > now ? "USE" : "no";
    console.log(`${county.name.padEnd(13)} now ${(now * 100).toFixed(0).padStart(3)}%  best ${best ? `${(best.share * 100).toFixed(0).padStart(3)}% ${best.name} [${best.field}: ${best.sample.join(", ")}] (${seen.size} services)` : `none of ${seen.size} services`}  ${verdict}`);
    if (verdict === "USE") console.log(`      { fips: "${county.fips}", url: "${best!.url}", field: "${best!.field}" }, // ${county.name}`);
  }
}
