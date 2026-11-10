/** Normalize a county / unit name for matching across sources. */
export function normCounty(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "") // "Doña Ana" == "Dona Ana"
    .replace(/[.'’]/g, "")
    .replace(/\bsaint\b/g, "st")
    .replace(/\bste\b/g, "st")
    .replace(/\s+(county|parish|borough|census area|municipality|city and borough)$/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, "")
    .trim(); // spaces dropped so "LaSalle" == "La Salle" and "DeKalb" == "De Kalb"
}

const SMALL = new Set(["de", "la", "van", "von", "of", "and"]);

/**
 * Clean a candidate name as sources print it:
 * "Josh Shapiro / Davis, Austin" -> "Josh Shapiro", "Amy Klobuchar and Ben Schierer" -> "Amy Klobuchar",
 * "Keisha Lance Bottoms (Dem) (Dem)" -> "Keisha Lance Bottoms", "GREG ABBOTT" -> "Greg Abbott".
 */
export function cleanCandidateName(raw: string): string {
  let s = raw.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  s = s.split(/\s*\/\s*|\s+and\s+|\s*&\s*/i)[0].trim();
  if (s === s.toUpperCase() && /[A-Z]/.test(s)) {
    s = s
      .toLowerCase()
      .split(" ")
      .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.replace(/(^|[-'])([a-z])/g, (_m, p, c) => p + c.toUpperCase())))
      .join(" ");
  }
  return s.replace(/\s+/g, " ");
}

export const slug = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";

/** Rows that aren't real candidates and roll into "other". */
export const isWriteInOrNone = (name: string) =>
  /^(write[- ]?ins?|scattering|none of these candidates|over ?votes?|under ?votes?|blank)$/i.test(name.trim());

const DIRECTION: Record<string, string> = { n: "north", s: "south", e: "east", w: "west" };

/**
 * Normalize a New England town name for matching against shared/townIndex.json.
 * "Town of W. Greenwich" -> "westgreenwich", "Manchester-by-the-Sea" -> "manchesterbythesea".
 */
export function normTown(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/^(town|city) of\s+/, "")
    .replace(/^([nsew])\s+/, (_m, d: string) => `${DIRECTION[d]} `)
    .replace(/\bsaint\b/g, "st")
    .replace(/\bmount\b/g, "mt")
    .replace(/[^a-z0-9]+/g, "");
}

/** The kind of place the Census (and some feeds) append to a town's name: "Andover town", "Boston city". */
export const stripTownKind = (name: string) =>
  name.trim().replace(/\s+(town|city|plantation|township|gore|grant|location|purchase)$/i, "");
