import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { W, H, path, counties, states, positionOf, boundsOf, unitKeysForCounty, countyByFips } from "../geo";
import { STATES } from "../../shared/states";
import { marginColor, PARTY_COLOR } from "../colors";
import { fmtInt, fmtMargin, fmtPct } from "../format";
import type { SpreadJob, SpreadResult } from "../spread.worker";

export interface Dot {
  raceId: string; state: string; fips: string; name: string; total: number;
  leaderParty: string | null; margin: number | null; reporting: number | null;
}

interface Props {
  dots: Dot[] | undefined;
  view: "votes" | "acres";
  layout: "geo" | "spread";
  focus?: string; // state postal code
  selected?: string; // county FIPS
  raceStates: Set<string>;
  onPickState: (postal: string) => void;
  onPickCounty: (fips: string, postal: string) => void;
}

/** One shared scale: a dot's area is proportional to votes cast, in map units at zoom 1. */
const R = (votes: number, k: number) => (Math.sqrt(votes) / 90) * Math.sqrt(k);

interface Node extends Dot { gx: number; gy: number; x: number; y: number; r: number }

export function DotMap(props: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const s = useRef<{
    zoom: d3.ZoomBehavior<SVGSVGElement, unknown>;
    t: d3.ZoomTransform;
    nodes: Node[];
    spread: Map<string, [number, number]> | null;
    place: (ms: number) => void;
    /** Ask for the spread layout of what's on screen now (soon, so a burst of changes makes one request). */
    respread: () => void;
    /** Changes whenever the dots themselves do, so a layout is never reused for other data. */
    version: number;
    lastDots: Dot[] | undefined;
  } | null>(null);
  const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Build the map once.
  useEffect(() => {
    const svg = d3.select(svgRef.current!);
    const zoomG = svg.append("g").attr("class", "m-zoom");
    zoomG.append("g").attr("class", "m-land").selectAll("path").data(states).join("path").attr("d", path).attr("data-st", (d) => STATES[d.id]?.postal ?? "");
    zoomG.append("g").attr("class", "m-acres").selectAll("path").data(counties).join("path").attr("d", path).attr("data-fips", (d) => d.id);
    zoomG.append("path").attr("class", "m-county-lines");
    zoomG.append("g").attr("class", "m-state-lines").selectAll("path").data(states).join("path").attr("d", path);
    zoomG.append("path").attr("class", "m-selected-shape");
    svg.append("g").attr("class", "m-dots");
    svg.append("circle").attr("class", "m-halo").attr("r", 0);

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 40])
      .translateExtent([[-W * 0.25, -H * 0.25], [W * 1.25, H * 1.25]])
      .filter((e) => (e.type === "wheel" ? e.ctrlKey || e.metaKey : !e.button))
      .on("start", () => clearTimeout(timer)) // the frame is about to change: don't lay out the old one
      .on("zoom", (e) => {
        st.t = e.transform;
        zoomG.attr("transform", e.transform.toString());
        zoomG.style("--k", e.transform.k);
        st.spread = null; // spread positions are for the old frame
        st.place(0);
      })
      .on("end", () => st.respread());

    // The spread layout is worked out in a worker (see spread.worker.ts) and kept for the frame it
    // was made for. It's requested whenever the data or the frame settles, not when "Spread out"
    // is pressed, so by then it's usually ready and the dots start moving at once.
    const worker = new Worker(new URL("../spread.worker.ts", import.meta.url), { type: "module" });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ready: { key: string; pos: Map<string, [number, number]> } | null = null;
    let running: { key: string; fips: string[] } | null = null;
    let queued: { job: SpreadJob; fips: string[] } | null = null;
    const frameKey = () => `${st.version}|${st.t.k},${st.t.x},${st.t.y}|${propsRef.current.focus ?? ""}`;
    const show = () => {
      if (propsRef.current.layout !== "spread" || !ready || ready.key !== frameKey() || st.spread === ready.pos) return;
      st.spread = ready.pos;
      st.place(reduce ? 0 : 600);
    };
    const send = (next: { job: SpreadJob; fips: string[] }) => {
      running = { key: next.job.key, fips: next.fips };
      worker.postMessage(next.job, [next.job.xs.buffer, next.job.ys.buffer, next.job.rs.buffer]);
    };
    const request = () => {
      const key = frameKey();
      if (ready?.key === key) return show();
      if (running?.key === key) { queued = null; return; }
      const { focus } = propsRef.current;
      const live = st.nodes.filter((n) => !focus || n.state === focus);
      const at = live.map((n) => st.t.apply([n.gx, n.gy]));
      const next = {
        fips: live.map((n) => n.fips),
        job: {
          key,
          xs: Float64Array.from(at, (p) => p[0]),
          ys: Float64Array.from(at, (p) => p[1]),
          rs: Float64Array.from(live, (n) => Math.max(0.6, R(n.total, st.t.k))),
        },
      };
      // One layout runs at a time; only the newest request waits behind it.
      if (running) queued = next;
      else send(next);
    };
    worker.onmessage = (ev: MessageEvent<SpreadResult>) => {
      const { key, xs, ys } = ev.data;
      if (running?.key === key) ready = { key, pos: new Map(running.fips.map((f, i) => [f, [xs[i], ys[i]]])) };
      running = null;
      if (queued) { send(queued); queued = null; }
      show();
    };

    const st = {
      zoom, t: d3.zoomIdentity, nodes: [] as Node[], spread: null as Map<string, [number, number]> | null,
      place: (ms: number) => {
        const { focus } = propsRef.current;
        const sel = svg.select<SVGGElement>(".m-dots").selectAll<SVGCircleElement, Node>("circle");
        for (const n of st.nodes) {
          const sp = st.spread?.get(n.fips);
          [n.x, n.y] = sp ?? st.t.apply([n.gx, n.gy]);
          n.r = R(n.total, st.t.k);
        }
        const tr = ms ? sel.transition().duration(ms).ease(d3.easeCubicInOut) : sel;
        (tr as d3.Selection<SVGCircleElement, Node, SVGGElement, unknown>)
          .attr("cx", (n) => n.x).attr("cy", (n) => n.y).attr("r", (n) => Math.max(n.total ? 0.6 : 1.4, n.r));
        sel.classed("is-dim", (n) => !!focus && n.state !== focus);
        drawHalo();
      },
      respread: () => {
        clearTimeout(timer);
        if (ready?.key === frameKey()) show(); // already worked out for this frame
        else timer = setTimeout(request, 60);
      },
      version: 0,
      lastDots: undefined as Dot[] | undefined,
    };
    s.current = st;

    const drawHalo = () => {
      const { selected, view } = propsRef.current;
      const n = st.nodes.find((d) => d.fips === selected);
      svg.select(".m-halo").attr("cx", n?.x ?? 0).attr("cy", n?.y ?? 0).attr("r", n && view === "votes" ? Math.max(3, n.r + 2) : 0);
    };

    svg.call(zoom).on("dblclick.zoom", null);
    return () => { clearTimeout(timer); worker.terminate(); svg.selectAll("*").remove(); svg.on(".zoom", null); };
  }, []);

  // Data, view and layout.
  useEffect(() => {
    const st = s.current!;
    const svg = d3.select(svgRef.current!);
    const { dots = [], view, layout, focus, selected, raceStates } = props;
    const byFips = new Map(dots.map((d) => [d.fips, d]));

    if (st.lastDots !== props.dots) { st.lastDots = props.dots; st.version++; }
    const prev = new Map(st.nodes.map((n) => [n.fips, n]));
    st.nodes = dots
      .flatMap((d) => {
        const p = positionOf(d.fips);
        if (!p) return [];
        const old = prev.get(d.fips);
        return [{ ...d, gx: p[0], gy: p[1], x: old?.x ?? p[0], y: old?.y ?? p[1], r: old?.r ?? 0 }];
      })
      .sort((a, b) => b.total - a.total); // big first, so small dots sit on top

    const circles = svg.select(".m-dots").selectAll<SVGCircleElement, Node>("circle")
      .data(st.nodes, (n) => n.fips)
      .join((enter) => enter.append("circle").attr("cx", (n) => n.x).attr("cy", (n) => n.y).attr("r", 0))
      .attr("class", (n) => (n.total > 0 ? "m-dot" : "m-dot is-waiting"))
      .attr("fill", (n) => (n.total > 0 ? marginColor(n.leaderParty, n.margin) : null))
      .order();

    const tip = d3.select(tipRef.current!);
    const showTip = (ev: PointerEvent, d: Dot | undefined, fallbackName?: string) => {
      const wrap = wrapRef.current!.getBoundingClientRect();
      if (!d) { tip.style("opacity", 0); return; }
      tip.style("opacity", 1).html("");
      tip.append("div").attr("class", "tip-h").text(`${d.fips.endsWith("000") ? STATES[d.fips.slice(0, 2)]?.name ?? d.name : d.name || fallbackName}, ${d.state}`);
      if (!d.total) tip.append("div").text("No votes reported yet");
      else {
        const row = tip.append("div").attr("class", "tip-row");
        row.append("span").attr("class", "tip-sw").style("background", d.leaderParty ? PARTY_COLOR[d.leaderParty] ?? PARTY_COLOR.OTH : "transparent");
        row.append("span").text(fmtMargin(d.leaderParty, d.margin));
        row.append("span").attr("class", "tip-dim").text(`${fmtInt.format(d.total)} votes`);
        if (d.reporting !== null) tip.append("div").attr("class", "tip-dim").text(`${fmtPct(d.reporting, 0)} of precincts reporting`);
        if (d.fips.endsWith("000")) tip.append("div").attr("class", "tip-dim").text("Statewide total: no county breakdown yet");
      }
      const tw = tipRef.current!.offsetWidth, th = tipRef.current!.offsetHeight;
      let x = ev.clientX - wrap.left + 14, y = ev.clientY - wrap.top + 14;
      if (x + tw > wrap.width) x -= tw + 28;
      if (y + th > wrap.height) y -= th + 28;
      tip.style("transform", `translate(${Math.max(0, x)}px, ${Math.max(0, y)}px)`);
    };
    const pick = (d: Dot) => {
      const { focus, onPickState, onPickCounty } = propsRef.current;
      if (focus === d.state && !d.fips.endsWith("000")) onPickCounty(d.fips, d.state);
      else onPickState(d.state);
    };

    circles
      .on("pointerenter pointermove", (ev, n) => showTip(ev, n))
      .on("pointerleave", () => tip.style("opacity", 0))
      .on("click", (ev, n) => { ev.stopPropagation(); pick(n); });

    // Land: states with a race in this edition read as land; others recede.
    svg.select(".m-land").selectAll<SVGPathElement, unknown>("path")
      .classed("has-race", function () { return raceStates.has(this.getAttribute("data-st") ?? ""); })
      .on("click", function () { const p = this.getAttribute("data-st"); if (p && raceStates.has(p)) propsRef.current.onPickState(p); });

    // Acres view: fill the county shapes themselves.
    const unitFor = (fips: string) => unitKeysForCounty(fips).map((k) => byFips.get(k)).find(Boolean);
    svg.select(".m-acres").selectAll<SVGPathElement, { id: string; properties: { name: string } }>("path")
      .style("fill", (c) => { const u = unitFor(c.id); return u && u.total > 0 ? marginColor(u.leaderParty, u.margin) : null; })
      .classed("has-unit", (c) => !!unitFor(c.id))
      .on("pointerenter pointermove", (ev, c) => showTip(ev, unitFor(c.id), c.properties.name))
      .on("pointerleave", () => tip.style("opacity", 0))
      .on("click", (ev, c) => { const u = unitFor(c.id); if (u) { ev.stopPropagation(); pick(u); } });

    svg.classed("is-acres", view === "acres").classed("is-focused", !!focus);
    svg.select(".m-county-lines").attr("d", focus ? path({ type: "FeatureCollection", features: counties.filter((c) => STATES[c.id.slice(0, 2)]?.postal === focus) } as never) : null);
    const selShape = selected ? countyByFips.get(selected) : undefined;
    svg.select(".m-selected-shape").attr("d", view === "acres" && selShape ? path(selShape) : null);

    // In spread layout the dots keep the places they have until the new layout arrives.
    const had = st.spread;
    if (layout !== "spread") st.spread = null;
    st.place(had && !st.spread && !reduce ? 600 : 0);
    if (view === "votes") st.respread();
  }, [props.dots, props.view, props.layout, props.focus, props.selected, props.raceStates]);

  // Zoom to the focused state, or back out to the country.
  useEffect(() => {
    const st = s.current!;
    const svg = d3.select(svgRef.current!);
    let t = d3.zoomIdentity;
    const b = props.focus ? boundsOf(props.focus) : null;
    if (b) {
      const [[x0, y0], [x1, y1]] = b;
      const k = Math.min(14, 0.86 / Math.max((x1 - x0) / W, (y1 - y0) / H));
      t = d3.zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    }
    svg.transition().duration(reduce ? 0 : 750).call(st.zoom.transform, t);
  }, [props.focus]);

  return (
    <div className="map-wrap" ref={wrapRef}>
      <svg ref={svgRef} className="map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Results map: one dot per county, sized by votes cast" />
      <div className="map-tip" ref={tipRef} style={{ opacity: 0 }} />
    </div>
  );
}
