/** Runs the Pushbuild and 2024 adapters against live files and prints what would be written. `npm run test:adapters` */
import { normalizePushbuild } from "../shared/adapters/pushbuild";
import { normalizeTonmcg2024, TONMCG_2024_URL } from "../shared/adapters/tonmcg";
import { racesFor } from "../shared/races";
import { normalizeCaSos, type CaSosUnit } from "../shared/adapters/casos";
import { caSosUrl, pushbuildUrl } from "../shared/adapters/sources";
import { parseCsv } from "../shared/csv";
import countyIndex from "../shared/countyIndex.json";
import townIndex from "../shared/townIndex.json";

const COUNTIES = countyIndex as Record<string, Record<string, string>>;
const countiesIn = (st: string) => new Set(Object.values(COUNTIES[st] ?? {})).size;

const now = new Date().toISOString();
const gov = racesFor(2026, "governor");
let placed = 0;
for (const st of [...new Set(gov.map((r) => r.state))]) {
  // States read from their own results site rather than Pushbuild.
  const direct = gov.find((r) => r.state === st && r.sources.casos);
  if (direct) {
    const res = await fetch(caSosUrl(direct.sources.casos!.contest));
    const race = res.ok ? normalizeCaSos((await res.json()) as CaSosUnit[], direct, now) : null;
    if (!race) { console.log(st.padEnd(3), "no data from the California Secretary of State", res.status); continue; }
    const real = race.counties.filter((c) => !c.fips.endsWith("000"));
    if (real.length) placed++;
    const sum = real.reduce((s, c) => s + c.total, 0);
    console.log(st.padEnd(3), `${String(real.length).padStart(3)} of ${String(countiesIn(st)).padStart(3)} counties placed (California SoS; counties sum to ${sum.toLocaleString()}, statewide ${race.statewide?.total.toLocaleString()}, updated ${race.source.updatedAt})`,
      race.unmatchedUnits.length ? `${race.unmatchedUnits.length} unplaced (e.g. ${race.unmatchedUnits.slice(0, 2).join(", ")})` : "", "|", race.candidates.map((c) => `${c.name} (${c.party})`).slice(0, 3).join(", "));
    continue;
  }
  const res = await fetch(pushbuildUrl(st));
  if (!res.ok) { console.log(st.padEnd(3), "no file", res.status); continue; }
  const csv = await res.text();
  const [race] = normalizePushbuild(csv, gov.filter((r) => r.state === st), now);
  if (!race) { console.log(st.padEnd(3), "no governor contest in feed"); continue; }
  const top = [...race.candidates].map((c) => `${c.name} (${c.party})`).slice(0, 3).join(", ");
  const real = race.counties.filter((c) => !c.fips.endsWith("000")).length;
  if (real) placed++;
  // Town states: how many of the feed's town rows landed on a county.
  let towns = "";
  if (st in townIndex) {
    const re = new RegExp(race && gov.find((r) => r.state === st)!.sources.pushbuild!.contest, "i");
    const units = new Set(parseCsv(csv).filter((r) => r.level === "county" && r.county.trim() && re.test(r.contest.trim().replace(/\s+/g, " "))).map((r) => r.county.trim()));
    towns = units.size ? ` from ${units.size - race.unmatchedUnits.length} of ${units.size} towns` : " (no town rows in feed)";
  }
  console.log(st.padEnd(3), `${String(real).padStart(3)} of ${String(countiesIn(st)).padStart(3)} counties placed${towns}`, race.unmatchedUnits.length ? `${race.unmatchedUnits.length} unplaced (e.g. ${race.unmatchedUnits.slice(0, 2).join(", ")})` : "", "|", top);
}
console.log(`\n${placed} of ${gov.length} governor races have county-level results in the free feeds right now.`);

const p = normalizeTonmcg2024(await (await fetch(TONMCG_2024_URL)).text(), racesFor(2024, "president"), now);
const tot = p.reduce((s, r) => s + (r.statewide?.total ?? 0), 0);
console.log(`2024 president: ${p.length} states, ${p.reduce((s, r) => s + r.counties.length, 0)} units, ${tot.toLocaleString()} votes`);
