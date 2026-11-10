import { useEffect, useState } from "react";

/** App location, kept in the URL hash so any view is a shareable link: #/2026/governor/TX/48201 */
export interface Route { year?: number; office?: string; state?: string; fips?: string }

const parse = (): Route => {
  const [, year, office, state, fips] = location.hash.replace(/^#/, "").split("/");
  return {
    year: year ? Number(year) : undefined,
    office: office || undefined,
    state: state ? state.toUpperCase() : undefined,
    fips: fips || undefined,
  };
};
export const href = (r: Route) =>
  "#/" + [r.year, r.office, r.state, r.fips].filter((x) => x !== undefined && x !== "").join("/");

export function useRoute(): [Route, (r: Route, replace?: boolean) => void] {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  const go = (r: Route, replace = false) => {
    const h = href(r);
    if (replace) history.replaceState(null, "", h);
    else history.pushState(null, "", h);
    setRoute(parse());
  };
  return [route, go];
}
