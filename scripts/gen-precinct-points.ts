/**
 * Builds shared/precincts/<ST>.json: where each precinct's dot goes. `npm run gen:precincts -- FL`
 * See shared/precincts/sources.ts for what it reads. Points are stored already projected into the
 * map's 975×610 Albers frame (the one us-atlas uses), so the app never needs the projection.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { geoAlbersUsa } from "d3";
import { precinctKey } from "../shared/names";
import { PRECINCT_POINT_SOURCES } from "../shared/precincts/sources";

const project = geoAlbersUsa().scale(1300).translate([487.5, 305]);
const round = (n: number) => Math.round(n * 100) / 100;
type Points = Record<string, Record<string, [number, number]>>;

/** Rows of a dBase file (the attribute table of a shapefile). */
function readDbf(file: string): Record<string, string>[] {
  const b = readFileSync(file);
  const count = b.readUInt32LE(4), headerLen = b.readUInt16LE(8), rowLen = b.readUInt16LE(10);
  const fields: { name: string; len: number }[] = [];
  for (let o = 32; b[o] !== 0x0d; o += 32) fields.push({ name: b.toString("ascii", o, o + 11).replace(/\0.*$/, ""), len: b[o + 16] });
  return Array.from({ length: count }, (_v, i) => {
    let o = headerLen + i * rowLen + 1;
    return Object.fromEntries(fields.map((f) => { const v = b.toString("latin1", o, o + f.len).trim(); o += f.len; return [f.name, v]; }));
  });
}

/** Census voting districts carry an interior point each, so only the attribute table is needed. */
function censusPoints(url: string, out: Points) {
  const dir = mkdtempSync(join(tmpdir(), "vtd-"));
  try {
    execFileSync("curl", ["-sSfL", "-o", join(dir, "vtd.zip"), url]);
    execFileSync("unzip", ["-o", "-q", join(dir, "vtd.zip"), "*.dbf", "-d", dir]);
    const dbf = execFileSync("sh", ["-c", `ls ${dir}/*.dbf`], { encoding: "utf8" }).trim();
    for (const r of readDbf(dbf)) {
      const xy = project([Number(r.INTPTLON20), Number(r.INTPTLAT20)]);
      if (!xy) continue;
      const county = (out[r.STATEFP20 + r.COUNTYFP20] ??= {});
      // The name and the code usually agree; where they don't, either may be what a results file uses.
      for (const k of new Set([precinctKey(r.NAME20), precinctKey(r.VTDST20)])) county[k] ??= [round(xy[0]), round(xy[1])];
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Center of a polygon's largest ring (longitude/latitude; fine at precinct size). */
function ringCenter(rings: number[][][]): [number, number] | null {
  let best: [number, number] | null = null, bestArea = 0;
  for (const ring of rings) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const f = ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
      a += f; cx += (ring[i][0] + ring[i + 1][0]) * f; cy += (ring[i][1] + ring[i + 1][1]) * f;
    }
    if (Math.abs(a) > bestArea) { bestArea = Math.abs(a); best = [cx / (3 * a), cy / (3 * a)]; }
  }
  return best;
}

async function layerPoints(layer: { fips: string; url: string; field: string }, out: Points) {
  const county: Record<string, [number, number]> = {};
  for (let offset = 0; ; ) {
    const q = `${layer.url}/query?where=1%3D1&outFields=${encodeURIComponent(layer.field)}&outSR=4326&returnGeometry=true&resultOffset=${offset}&f=json`;
    const res = await fetch(q);
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(layer.url).host}`);
    const page = (await res.json()) as { features?: { attributes: Record<string, unknown>; geometry?: { rings?: number[][][] } }[]; exceededTransferLimit?: boolean; error?: { message: string } };
    if (page.error) throw new Error(page.error.message);
    const features = page.features ?? [];
    for (const f of features) {
      const center = f.geometry?.rings && ringCenter(f.geometry.rings);
      const xy = center && project(center);
      const id = f.attributes[layer.field];
      if (xy && id !== null && id !== undefined) county[precinctKey(String(id))] ??= [round(xy[0]), round(xy[1])];
    }
    offset += features.length;
    if (!page.exceededTransferLimit || !features.length) break;
  }
  if (!Object.keys(county).length) throw new Error("no precincts in the layer");
  out[layer.fips] = county;
}

const state = (process.argv[2] ?? "").toUpperCase();
const src = PRECINCT_POINT_SOURCES[state];
if (!src) { console.error(`Usage: npm run gen:precincts -- <${Object.keys(PRECINCT_POINT_SOURCES).join("|")}>`); process.exit(1); }
const points: Points = {};
censusPoints(src.census, points);
console.log(`census: ${Object.keys(points).length} counties`);
for (const layer of src.layers) {
  try { await layerPoints(layer, points); console.log(`${layer.fips}: ${Object.keys(points[layer.fips]).length} precincts from the county's layer`); }
  catch (e) { console.log(`${layer.fips}: county layer failed (${(e as Error).message}); keeping Census points`); }
}
writeFileSync(new URL(`../shared/precincts/${state}.json`, import.meta.url), JSON.stringify(points));
console.log(`wrote shared/precincts/${state}.json`);
