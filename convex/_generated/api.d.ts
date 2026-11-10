/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crons from "../crons.js";
import type * as ingest_ap from "../ingest/ap.js";
import type * as ingest_pushbuild from "../ingest/pushbuild.js";
import type * as ingest_seed from "../ingest/seed.js";
import type * as ingest_states from "../ingest/states.js";
import type * as ingest_write from "../ingest/write.js";
import type * as races from "../races.js";
import type * as setup from "../setup.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  "ingest/ap": typeof ingest_ap;
  "ingest/pushbuild": typeof ingest_pushbuild;
  "ingest/seed": typeof ingest_seed;
  "ingest/states": typeof ingest_states;
  "ingest/write": typeof ingest_write;
  races: typeof races;
  setup: typeof setup;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  staticHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"staticHosting">;
};
