/// <reference types="vite/client" />
declare module "us-atlas/counties-albers-10m.json" {
  const topology: import("topojson-specification").Topology;
  export default topology;
}
