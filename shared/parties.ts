import type { PartyCode } from "./types";

const TABLE: [RegExp, PartyCode][] = [
  [/^(dem|democrat|democratic|dfl|d)\b/i, "DEM"],
  [/^(rep|republican|gop|r)\b/i, "REP"],
  [/^(lib|libertarian|lbr|lpf|l)\b/i, "LIB"],
  [/^(grn|green|gp|g)\b/i, "GRN"],
  [/^(ind|independent|npp|npa|no party|nonpartisan|una|uaf|unc|unaffiliated|i)\b/i, "IND"],
];

/** Map whatever a source calls a party onto our buckets. */
export function normalizeParty(raw: string | undefined | null): PartyCode {
  const s = (raw ?? "").trim();
  if (!s) return "OTH";
  for (const [re, code] of TABLE) if (re.test(s)) return code;
  return "OTH";
}

export const PARTY_LABEL: Record<PartyCode, string> = {
  DEM: "Democrat", REP: "Republican", LIB: "Libertarian", GRN: "Green", IND: "Independent", OTH: "Other",
};

/** Party codes some feeds use to mark write-in candidates; those roll into "other". */
export const isWriteInParty = (raw: string | undefined | null) => /^(w|wi|wri|write[- ]?in)$/i.test((raw ?? "").trim());
