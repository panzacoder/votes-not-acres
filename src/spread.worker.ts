/// <reference lib="webworker" />
import { forceCollide, forceSimulation, forceX, forceY } from "d3";

/**
 * Works out the "spread out" layout off the main thread: dots are pushed apart until none
 * overlap, each staying as near its county as it can. With a few thousand dots this takes
 * long enough to freeze the page, so the map asks for it ahead of time and animates when it lands.
 */
export interface SpreadJob { key: string; xs: Float64Array; ys: Float64Array; rs: Float64Array }
export interface SpreadResult { key: string; xs: Float64Array; ys: Float64Array }

const TICKS = 120;

self.onmessage = (ev: MessageEvent<SpreadJob>) => {
  const { key, xs, ys, rs } = ev.data;
  const sim = Array.from(xs, (x, i) => ({ x, y: ys[i], tx: x, ty: ys[i], r: rs[i] }));
  forceSimulation(sim)
    .alphaDecay(1 - Math.pow(0.001, 1 / TICKS))
    .force("x", forceX<(typeof sim)[number]>((d) => d.tx).strength(0.2))
    .force("y", forceY<(typeof sim)[number]>((d) => d.ty).strength(0.2))
    .force("c", forceCollide<(typeof sim)[number]>((d) => d.r + 0.35).iterations(3))
    .stop()
    .tick(TICKS);
  const out: SpreadResult = { key, xs: Float64Array.from(sim, (d) => d.x), ys: Float64Array.from(sim, (d) => d.y) };
  (self as DedicatedWorkerGlobalScope).postMessage(out, [out.xs.buffer, out.ys.buffer]);
};
