import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const unitFields = {
  total: v.number(),
  votes: v.record(v.string(), v.number()), // candidate key -> votes
  precinctsReporting: v.optional(v.number()),
  precinctsTotal: v.optional(v.number()),
};

export default defineSchema({
  /** One row per race defined in shared/races, created by `setup:init`. */
  races: defineTable({
    raceId: v.string(),
    year: v.number(),
    office: v.string(),
    state: v.string(),
    label: v.string(),
    status: v.union(v.literal("nodata"), v.literal("counting"), v.literal("called")),
    candidates: v.array(v.object({ key: v.string(), name: v.string(), party: v.string(), votes: v.number() })),
    statewide: v.optional(v.object(unitFields)),
    calledFor: v.optional(v.string()),
    unmatchedUnits: v.array(v.string()),
    source: v.optional(v.object({ name: v.string(), url: v.optional(v.string()), updatedAt: v.optional(v.string()), fetchedAt: v.string() })),
    hash: v.optional(v.string()), // skip writes when nothing changed
  })
    .index("by_raceId", ["raceId"])
    .index("by_year_office", ["year", "office"]),

  /** One row per county per race. year/office are copied here so the national map is one indexed read. */
  countyResults: defineTable({
    raceId: v.string(),
    year: v.number(),
    office: v.string(),
    state: v.string(),
    fips: v.string(), // "SS000" = statewide stand-in when a state gives no county breakdown
    unitName: v.string(),
    ...unitFields,
    leaderKey: v.optional(v.string()),
    leaderParty: v.optional(v.string()),
    margin: v.optional(v.number()), // (first - second) / total, 0..1
  })
    .index("by_race", ["raceId", "fips"])
    .index("by_year_office", ["year", "office"]),

  /** One row per precinct, for races and counties that publish below the county (shared/races/precincts2026.ts). */
  precinctResults: defineTable({
    raceId: v.string(),
    fips: v.string(), // the county
    name: v.string(),
    // Where the dot goes, in the map's frame. Absent on a county's "other precincts" row (votes we couldn't place).
    x: v.optional(v.number()),
    y: v.optional(v.number()),
    total: v.number(),
    leaderParty: v.optional(v.string()),
    margin: v.optional(v.number()),
  }).index("by_race", ["raceId", "fips"]),

  ingestRuns: defineTable({
    source: v.string(),
    startedAt: v.number(),
    ok: v.boolean(),
    racesWritten: v.number(),
    racesUnchanged: v.number(),
    message: v.optional(v.string()),
  }).index("by_source", ["source", "startedAt"]),
});
