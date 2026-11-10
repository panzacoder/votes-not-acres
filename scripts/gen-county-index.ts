/**
 * Generates shared/countyIndex.json: { [postal]: { [normalizedName]: fips } } from us-atlas.
 * Run with `npm run gen:counties` after upgrading us-atlas.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import { STATES } from "../shared/states";
import { normCounty } from "../shared/names";

const require = createRequire(import.meta.url);
const us = require("us-atlas/counties-10m.json");
const out: Record<string, Record<string, string>> = {};
for (const g of us.objects.counties.geometries as { id: string; properties: { name: string } }[]) {
  const st = STATES[g.id.slice(0, 2)];
  if (!st) continue;
  const idx = (out[st.postal] ??= {});
  let name = normCounty(g.properties.name);
  // Independent cities share names with counties (Richmond city vs Richmond County, VA).
  const isIndependentCity = (st.postal === "VA" && +g.id.slice(2) >= 500) || ["24510", "29510"].includes(g.id);
  if (isIndependentCity) name = `${name}city`;
  idx[name] = g.id;
}
for (const k of Object.keys(out)) for (const n of Object.keys(out[k])) if (out[k][n] === undefined) delete out[k][n];
fs.writeFileSync(new URL("../shared/countyIndex.json", import.meta.url), JSON.stringify(out));
console.log("states:", Object.keys(out).length, "counties:", Object.values(out).reduce((s, o) => s + Object.keys(o).length, 0));
