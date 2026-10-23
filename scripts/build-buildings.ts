/**
 * Fetches the outlines of the OpenStreetMap buildings that actors are linked
 * to (`building: way/<id>` in data/actors.yaml) and writes
 * public/geo/buildings.json, so the map can highlight an actor's building.
 *
 * Usage: npm run buildings
 *
 * Data © OpenStreetMap contributors (ODbL), via the OpenStreetMap API.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { load } from "js-yaml";
import type { Feature, FeatureCollection, Polygon, Position } from "geojson";
import type { Actor } from "../src/data/types";

const OUTPUT = "public/geo/buildings.json";
const USER_AGENT = "Stodkartan buildings build (https://github.com/MichaelDaun/resource_visualizer)";

function sleep(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Reads a way and its nodes from the OSM API and returns its outline. */
function wayOutline(id: string): Position[] {
  const xml = execFileSync("curl", ["-sSf", "-A", USER_AGENT, `https://api.openstreetmap.org/api/0.6/way/${id}/full`], {
    encoding: "utf8",
  });
  const nodes = new Map<string, Position>();
  for (const m of xml.matchAll(/<node id="(\d+)"[^>]*lat="([-\d.]+)" lon="([-\d.]+)"/g)) {
    nodes.set(m[1], [Number(m[3]), Number(m[2])]);
  }
  const refs = [...xml.matchAll(/<nd ref="(\d+)"/g)].map((m) => m[1]);
  const ring = refs.map((r) => nodes.get(r)).filter((p): p is Position => p !== undefined);
  if (ring.length < 4) throw new Error(`Way ${id} has no closed outline`);
  return ring;
}

const actors = load(readFileSync("data/actors.yaml", "utf8")) as Actor[];
const ids = [...new Set(actors.flatMap((a) => (a.locations ?? []).flatMap((l) => (l.building ? [l.building] : []))))];

const features: Feature<Polygon, { building: string }>[] = [];
for (const building of ids) {
  const ring = wayOutline(building.replace(/^way\//, ""));
  features.push({ type: "Feature", properties: { building }, geometry: { type: "Polygon", coordinates: [ring] } });
  sleep(1000);
}
const collection: FeatureCollection = { type: "FeatureCollection", features };
writeFileSync(OUTPUT, JSON.stringify(collection));
console.log(`Wrote ${OUTPUT}: ${features.length} buildings`);
