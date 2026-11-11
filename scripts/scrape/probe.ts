/**
 * One-line checks for finding precinct sources. Each prints at most ~30 short lines, so an agent
 * (or a person) can judge a page or a map layer without reading it. `npm run -s probe -- <command>`
 *
 *   page <url> [regex]       fetch a page: status, title, and links matching the regex
 *   render <url> [regex]     the same in a real browser, plus the data files the page loads
 *   vf <code> <electionId>   check a Voter Focus election (enr.electionsfl.org): date, governor race, precinct count
 *   arcgis "<words>"         search ArcGIS Online's catalogue for map services
 *   services <url>           list the folders, services or layers under an ArcGIS REST address
 *   layer <url> <fips>       score a layer (or every polygon layer of a service) against that county's precinct names
 *
 * A site that refuses (403, captcha, login) is reported as BLOCKED. That is the answer: don't try another way in.
 * `render` asks plainly first and will not open a browser on a site that refused.
 */
import { createRequire } from "node:module";
import { PRECINCT_SOURCES_2026 } from "../../shared/races/precincts2026";
import { findVoterFocusRace, normalizeVoterFocus, voterFocusElection, voterFocusOnePrecinctPerPage, voterFocusPrecinctsUrl } from "../../shared/adapters/voterfocus";
import { raceById } from "../../shared/races";
import { cachedPrecincts, getJson, polygonLayers, scoreLayer, searchArcgis } from "./lib";

const [cmd, a, b] = process.argv.slice(2);
const DEFAULT = "result|precinct|enr\\b|election night|clarity|report|canvass|statement of votes|\\.csv|\\.xlsx?|\\.pdf";
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

function report(url: string, status: number, html: string, pattern: string, extra: string[] = []) {
  if (status === 403 || status === 401 || /captcha|access denied|request blocked/i.test(html.slice(0, 3000))) { console.log(`BLOCKED (${status}) ${url}`); return; }
  console.log(`${status} ${clip(url, 110)}`);
  console.log(`title: ${clip(strip(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""), 100)}`);
  const election = voterFocusElection(html);
  if (election) console.log(`election: ${election}`);
  const re = new RegExp(pattern, "i");
  const seen = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = strip(m[2]);
    let href = m[1].replace(/&amp;/g, "&");
    try { href = new URL(href, url).href; } catch { continue; }
    if (seen.has(href) || !(re.test(label) || re.test(href))) continue;
    seen.add(href);
    if (seen.size > 22) { console.log("… more links not shown; narrow the regex"); break; }
    console.log(`  ${clip(label || "(no text)", 48).padEnd(48)} ${clip(href, 120)}`);
  }
  if (!seen.size) console.log("  (no links match)");
  for (const line of extra) console.log(line);
}

try {
  if (cmd === "page") {
    const res = await fetch(a, { redirect: "follow", signal: AbortSignal.timeout(40_000) });
    report(res.url, res.status, await res.text(), b ?? DEFAULT);
  } else if (cmd === "render") {
    // The browser is for pages that need JavaScript, not for sites that refuse: ask plainly first.
    const plain = await fetch(a, { redirect: "follow", signal: AbortSignal.timeout(40_000) });
    if (plain.status === 401 || plain.status === 403) { console.log(`BLOCKED (${plain.status}) ${plain.url}`); process.exit(0); }
    // Playwright isn't a dependency of the app: it is only needed for this command (npm i -g playwright, or use an environment that has it).
    const { chromium } = createRequire(import.meta.url)("playwright") as { chromium: { launch(o: object): Promise<any> } };
    const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
    try {
      const pg = await browser.newPage();
      const data = new Set<string>();
      pg.on("response", (r: { headers(): Record<string, string>; url(): string; status(): number }) => { const t = r.headers()["content-type"] ?? ""; if (/json|csv|xml|zip|octet/.test(t) && !/google|analytics|font|gstatic/.test(r.url())) data.add(`${r.status()} ${clip(r.url(), 130)}`); });
      const res = await pg.goto(a, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => null);
      await pg.waitForTimeout(1500);
      report(pg.url(), res?.status() ?? 0, await pg.content(), b ?? DEFAULT, ["data files the page loaded:", ...[...data].slice(0, 12).map((d) => `  ${d}`), ...(data.size ? [] : ["  (none)"])]);
    } finally { await browser.close(); }
  } else if (cmd === "vf") {
    const src = PRECINCT_SOURCES_2026[0];
    const index = await (await fetch(voterFocusPrecinctsUrl(a, b))).text();
    const raceId = findVoterFocusRace(index, new RegExp(src.contest, "i"));
    console.log(`election: ${voterFocusElection(index) || "(not a Voter Focus election page)"}  [wanted: ${src.electionDate}]`);
    console.log(`governor race id: ${raceId ?? "none"}`);
    if (raceId) {
      const html = await (await fetch(voterFocusPrecinctsUrl(a, b, raceId))).text();
      const read = normalizeVoterFocus(html, raceById.get(src.raceId)!, "");
      console.log(`precincts on the race page: ${read.precincts.length}, votes: ${read.precincts.reduce((s, p) => s + p.total, 0).toLocaleString()}${voterFocusOnePrecinctPerPage(html) ? "  (one precinct per page: needs the CSV on /Reports)" : ""}`);
    }
  } else if (cmd === "arcgis") {
    const hits = await searchArcgis(a, 12);
    for (const h of hits) console.log(`${clip(h.title, 44).padEnd(44)} ${clip(h.owner, 18).padEnd(18)} ${h.modified} ${clip(h.url, 120)}`);
    if (!hits.length) console.log("(nothing found)");
  } else if (cmd === "services") {
    const base = a.replace(/[?#].*$/, "").replace(/\/+$/, "");
    const j = await getJson<{ folders?: string[]; services?: { name: string; type: string }[]; layers?: { id: number; name: string; geometryType?: string }[]; error?: { message: string } }>(`${base}?f=json`);
    if (j.error) console.log(`error: ${j.error.message}`);
    if (j.folders?.length) console.log(`folders: ${j.folders.slice(0, 60).join(", ")}`);
    for (const s of (j.services ?? []).slice(0, 40)) console.log(`service: ${s.name} (${s.type})`);
    for (const l of (j.layers ?? []).slice(0, 40)) console.log(`layer ${l.id}: ${l.name}${l.geometryType ? ` [${l.geometryType.replace("esriGeometry", "")}]` : ""}`);
  } else if (cmd === "layer") {
    const src = PRECINCT_SOURCES_2026.find((s) => s.counties.some((c) => c.fips === b)) ?? PRECINCT_SOURCES_2026[0];
    const precincts = cachedPrecincts(src.raceId, b);
    if (!precincts) { console.log(`no precinct results cached for ${b}: run npm run import:precincts first`); process.exit(0); }
    console.log(`county ${b}: ${precincts.length} precincts, e.g. ${precincts.slice(0, 4).map((p) => p.name).join(" | ")}`);
    for (const url of await polygonLayers(a)) {
      const s = await scoreLayer(url, precincts, b).catch((e) => { console.log(`${clip(url, 100)}: ${(e as Error).message}`); return undefined; });
      if (s === null) console.log(`${clip(url, 100)}: not a polygon layer inside this county`);
      else if (s) console.log(`${(s.share * 100).toFixed(0).padStart(3)}% of votes placed  field="${s.field}"  ${url}  (${s.name}: ${s.features} features, e.g. ${clip(s.sample.join(", "), 40)})`);
    }
  } else {
    console.log("commands: page <url> [regex] | render <url> [regex] | vf <code> <electionId> | arcgis \"<words>\" | services <url> | layer <url> <fips>");
  }
} catch (e) {
  console.log(`failed: ${(e as Error).message}`);
}
