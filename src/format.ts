export const fmtInt = new Intl.NumberFormat("en-US");
export const fmtCompact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
export const fmtPct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;
export const fmtMargin = (party: string | null, margin: number | null) =>
  party && margin !== null ? `${party === "DEM" ? "D" : party === "REP" ? "R" : party.slice(0, 1)}+${(margin * 100).toFixed(1)}` : "—";
export const fmtTime = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(+d) ? iso : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
};
export const OFFICE_LABEL: Record<string, string> = { governor: "Governor", president: "President", senate: "Senate" };
