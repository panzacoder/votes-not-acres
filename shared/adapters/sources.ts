/** Where each feed lives. Override the Pushbuild base with the PUSHBUILD_BASE env var (e.g. their API, or your own mirror). */
export const PUSHBUILD_DEFAULT_BASE = "https://raw.githubusercontent.com/pushbuild/us-2026-election-results/HEAD/data";
export const pushbuildUrl = (postal: string, base = PUSHBUILD_DEFAULT_BASE) => `${base}/${postal.toLowerCase()}.csv`;
/** California Secretary of State: state and every county for one contest ("governor", "us-senate"...). */
export const caSosUrl = (contest: string) => `https://api.sos.ca.gov/returns/${contest}/county/all`;
export const AP_BASE = "https://api.ap.org/v2";
