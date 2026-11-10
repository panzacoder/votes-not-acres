import type { NormalizedRace, RaceDef } from "../types";
import { normalizeCaSos, type CaSosUnit } from "./casos";
import { normalizeTotalVote, totalVoteUrl, type TotalVoteResponse } from "./totalvote";
import { alCountyListUrl, alCountyUrl, alStatewideUrl, normalizeAlSos, parseAlCountyList } from "./alsos";
import { normalizeVtSos, pickVtElection, vtElectionUrl, vtElectionsUrl, vtFileUrl, type VtElection, type VtElectionListing, type VtStatewide } from "./vtsos";
import { caSosUrl } from "./sources";

/**
 * Races read from a state's own results site (those Pushbuild has no county rows for).
 * This is the only part of the state adapters that touches the network: it fetches what each
 * adapter needs and hands it over. Used by convex/ingest/states.ts and scripts/test-adapters.ts.
 */
export const STATE_SITE_KINDS = ["casos", "totalvote", "alsos", "vtsos"] as const;
export type StateSiteKind = (typeof STATE_SITE_KINDS)[number];
export const stateSiteKind = (race: RaceDef): StateSiteKind | undefined => STATE_SITE_KINDS.find((k) => race.sources[k]);

async function get(url: string, accept: string): Promise<Response> {
  const res = await fetch(url, { headers: { accept } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res;
}
const json = async <T>(url: string) => (await (await get(url, "application/json")).json()) as T;
const html = async (url: string) => (await get(url, "text/html")).text();

export async function fetchStateRace(race: RaceDef, fetchedAt: string): Promise<NormalizedRace | null> {
  const s = race.sources;
  if (s.casos) return normalizeCaSos(await json<CaSosUnit[]>(caSosUrl(s.casos.contest)), race, fetchedAt);
  if (s.totalvote) return normalizeTotalVote(await json<TotalVoteResponse>(totalVoteUrl(s.totalvote)), race, fetchedAt);
  if (s.vtsos) {
    const listing = pickVtElection(await json<VtElectionListing[]>(vtElectionsUrl), race.year);
    if (!listing) return null;
    const election = await json<VtElection>(vtElectionUrl(listing.electionGuid));
    if (!election.stateWide?.isEnable || !election.stateWide.path) return null;
    return normalizeVtSos(election, await json<VtStatewide>(vtFileUrl(election.stateWide.path)), race, fetchedAt);
  }
  if (s.alsos) {
    const { ecode } = s.alsos;
    const [statewide, list] = await Promise.all([html(alStatewideUrl(ecode)), html(alCountyListUrl(ecode))]);
    const linked = parseAlCountyList(list);
    const counties: { name: string; html: string }[] = [];
    // One page per county: a few at a time, so sixty-seven requests don't land at once.
    for (let i = 0; i < linked.length; i += 6) {
      counties.push(...(await Promise.all(linked.slice(i, i + 6).map(async (c) => ({ name: c.name, html: await html(alCountyUrl(c.cid, ecode)) })))));
    }
    return normalizeAlSos({ statewide, counties }, race, fetchedAt);
  }
  return null;
}
