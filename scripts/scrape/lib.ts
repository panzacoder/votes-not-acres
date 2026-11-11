/**
 * Helpers for finding precinct sources by hand or by agent. Everything here prints a few short
 * lines, so a page or a map layer can be judged without reading it.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { geoAlbersUsa } from "d3";
import { precinctKey } from "../../shared/names";
import { countyByFips, path } from "../../src/geo";

const project = geoAlbersUsa().scale(1300).translate([487.5, 305]);

/** Whether a layer's features are centred inside the county (so a same-named county elsewhere doesn't pass). */
export async function layerIsInCounty(layerUrl: string, fips: string): Promise<boolean> {
  const county = countyByFips.get(fips);
  if (!county) return false;
  const r = await getJson<{ extent?: { xmin: number; ymin: number; xmax: number; ymax: number } }>(`${layerUrl}/query?where=1%3D1&returnExtentOnly=true&outSR=4326&f=json`);
  const e = r.extent;
  if (!e || !Number.isFinite(e.xmin)) return false;
  const xy = project([(e.xmin + e.xmax) / 2, (e.ymin + e.ymax) / 2]);
  if (!xy) return false;
  const [[x0, y0], [x1, y1]] = path.bounds(county);
  const pad = Math.max(x1 - x0, y1 - y0) * 0.25;
  return xy[0] > x0 - pad && xy[0] < x1 + pad && xy[1] > y0 - pad && xy[1] < y1 + pad;
}

export const root = resolve(dirname(new URL(import.meta.url).pathname), "..", "..");

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(40_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Precinct names and votes already read for a county by `npm run import:precincts`, if any. */
export function cachedPrecincts(raceId: string, fips: string): { name: string; total: number }[] | null {
  const file = join(root, ".cache", "precincts", raceId, `${fips}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).precincts : null;
}

interface ArcLayer { id: number; name: string; geometryType?: string; type?: string; fields?: { name: string; type: string }[]; error?: { message: string } }
export interface LayerScore { url: string; name: string; features: number; field: string; share: number; sample: string[] }

/** The polygon layers under an ArcGIS service or layer URL. */
export async function polygonLayers(url: string): Promise<string[]> {
  const clean = url.replace(/[?#].*$/, "").replace(/\/+$/, "");
  if (/\/\d+$/.test(clean)) return [clean];
  const svc = await getJson<{ layers?: ArcLayer[]; error?: { message: string } }>(`${clean}?f=json`);
  if (svc.error) throw new Error(svc.error.message);
  return (svc.layers ?? []).filter((l) => !l.geometryType || /Polygon/i.test(l.geometryType)).slice(0, 8).map((l) => `${clean}/${l.id}`);
}

/**
 * How well one layer names a county's precincts: for each text or number field, the share of the
 * county's votes cast in precincts whose key appears in that field. Returns the best field.
 */
export async function scoreLayer(layerUrl: string, precincts: { name: string; total: number }[], fips?: string): Promise<LayerScore | null> {
  const meta = await getJson<ArcLayer>(`${layerUrl}?f=json`);
  if (meta.error || (meta.geometryType && !/Polygon/i.test(meta.geometryType))) return null;
  if (fips && !(await layerIsInCounty(layerUrl, fips).catch(() => false))) return null;
  // Row numbers and shape measurements are never precinct ids, though row numbers look like them.
  const skip = new Set((meta.fields ?? []).filter((f) => /OID|GlobalID|Geometry|Double|Single|Date/i.test(f.type)).map((f) => f.name));
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; offset < 6000; ) {
    const page = await getJson<{ features?: { attributes: Record<string, unknown> }[]; exceededTransferLimit?: boolean; error?: { message: string } }>(
      `${layerUrl}/query?where=1%3D1&outFields=*&returnGeometry=false&resultOffset=${offset}&f=json`,
    );
    if (page.error) return null;
    const got = page.features ?? [];
    rows.push(...got.map((f) => f.attributes));
    offset += got.length;
    if (!page.exceededTransferLimit || !got.length) break;
  }
  if (!rows.length) return null;
  const total = precincts.reduce((s, p) => s + p.total, 0) || 1;
  let best: LayerScore | null = null;
  for (const field of Object.keys(rows[0])) {
    if (skip.has(field) || /^(OBJECTID|FID|OID|GLOBALID|SHAPE)/i.test(field)) continue;
    const keys = new Set(rows.map((r) => r[field]).filter((v) => v !== null && v !== undefined && v !== "").map((v) => precinctKey(String(v))));
    // A field with only a handful of distinct values is a district or a flag, not a precinct id.
    if (keys.size < Math.min(precincts.length, rows.length) * 0.5) continue;
    // And one with far more values than there are precincts is something else that starts with a number
    // (street addresses matched polling-place names once).
    if (keys.size > precincts.length * 4) continue;
    const share = precincts.filter((p) => keys.has(precinctKey(p.name))).reduce((s, p) => s + p.total, 0) / total;
    if (!best || share > best.share) best = { url: layerUrl, name: meta.name, features: rows.length, field, share, sample: rows.slice(0, 3).map((r) => String(r[field])) };
  }
  return best;
}

/** ArcGIS Online's public catalogue: services whose title or description matches. */
export async function searchArcgis(query: string, num = 15): Promise<{ title: string; owner: string; modified: string; url: string }[]> {
  const q = new URLSearchParams({ q: `${query} (type:"Feature Service" OR type:"Map Service")`, num: String(num), f: "json" });
  const r = await getJson<{ results?: { title: string; owner: string; modified: number; url?: string }[] }>(`https://www.arcgis.com/sharing/rest/search?${q}`);
  return (r.results ?? []).filter((x) => x.url).map((x) => ({ title: x.title, owner: x.owner, modified: new Date(x.modified).toISOString().slice(0, 10), url: x.url! }));
}
