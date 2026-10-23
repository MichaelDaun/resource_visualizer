/**
 * Builds accurate municipality and county shapes for the home counties:
 * public/geo/detail.topo.json. The map uses them to highlight the counties,
 * make municipalities clickable and outline the selected place. Everything
 * else on the map comes from OpenFreeMap vector tiles at runtime.
 *
 * Source: Nominatim (© OpenStreetMap contributors, ODbL). Responses are cached
 * in <cache-dir>; Nominatim allows at most one request per second.
 *
 * Usage: npm run geo:detail -- <cache-dir>
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import polygonClipping, { type MultiPolygon as PcMultiPolygon, type Polygon as PcPolygon } from "polygon-clipping";
import simplify from "simplify-js";
import { feature } from "topojson-client";
import { topology } from "topojson-server";
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";

const USER_AGENT = "Stodkartan basemap build (https://github.com/MichaelDaun/resource_visualizer)";
const HOME_COUNTIES: Record<string, string> = { "07": "Kronobergs län", "08": "Kalmar län" };
const OUTPUT = "public/geo/detail.topo.json";
/** Named areas made of several municipalities; ids match AREAS in src/geo.ts. */
const AREAS = [{ id: "oland", municipalities: ["0885", "0840"] }];
/** Simplification tolerance in degrees (~50 m); plenty for outlines and hit areas. */
const TOLERANCE = 0.0005;

const cacheDir = process.argv[2];
if (!cacheDir) {
  console.error("Usage: npm run geo:detail -- <cache-dir>");
  process.exit(1);
}
mkdirSync(cacheDir, { recursive: true });

function sleep(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function download(url: string, file: string): string {
  const path = join(cacheDir, file);
  for (let attempt = 1; !existsSync(path); attempt++) {
    try {
      execFileSync("curl", ["-sSfL", "-A", USER_AGENT, "-o", path, url], { stdio: "pipe" });
      sleep(2000);
    } catch (err) {
      // Rate limits (HTTP 429) clear after a pause.
      if (attempt >= 6) throw err;
      sleep(5000 * attempt);
    }
  }
  return readFileSync(path, "utf8");
}

function toMulti(geometry: Geometry): PcMultiPolygon {
  if (geometry.type === "Polygon") return [geometry.coordinates as PcPolygon];
  if (geometry.type === "MultiPolygon") return geometry.coordinates as PcMultiPolygon;
  return [];
}

function simplifyMulti(mp: PcMultiPolygon): PcMultiPolygon {
  return mp
    .map((polygon) =>
      polygon
        .map((ring) => {
          const pts = simplify(
            (ring as Position[]).map(([x, y]) => ({ x, y })),
            TOLERANCE,
            true,
          ).map((p) => [Math.round(p.x * 1e5) / 1e5, Math.round(p.y * 1e5) / 1e5] as Position);
          if (pts.length >= 3) pts.push(pts[0]);
          return pts;
        })
        .filter((r) => r.length >= 4),
    )
    .filter((p) => p.length > 0) as PcMultiPolygon;
}

/** d3-geo wants exterior rings clockwise; RFC 7946 (and Nominatim) use the opposite. */
function rewind(mp: PcMultiPolygon): Position[][][] {
  const signed = (r: Position[]) => {
    let s = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
    return s / 2;
  };
  return mp.map((polygon) =>
    polygon.map((ring, i) => {
      const r = ring as Position[];
      return signed(r) < 0 === (i === 0) ? r : [...r].reverse();
    }),
  );
}

function multiPolygonFeature(mp: PcMultiPolygon, properties: Record<string, unknown>): Feature {
  return { type: "Feature", properties, geometry: { type: "MultiPolygon", coordinates: rewind(simplifyMulti(mp)) } };
}

// Codes and names come from the simplified basemap, so ids stay the same everywhere.
const base = JSON.parse(readFileSync("public/geo/sweden.topo.json", "utf8"));
const all = feature(base, base.objects.municipalities) as unknown as FeatureCollection<
  Geometry,
  { code: string; county: string; name: string }
>;

const municipalities = all.features
  .filter((m) => HOME_COUNTIES[m.properties.county])
  .map((m) => {
    const { code, county, name } = m.properties;
    const query = encodeURIComponent(`${name} kommun, ${HOME_COUNTIES[county]}, Sverige`);
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=jsonv2&polygon_geojson=1&polygon_threshold=0.0002&limit=5`;
    const hits = JSON.parse(download(url, `nominatim-${code}.json`)) as { osm_type: string; type: string; geojson: Geometry }[];
    const hit = hits.find((h) => h.osm_type === "relation" && h.type === "administrative");
    if (!hit) throw new Error(`No municipality boundary found for ${name}`);
    return { code, county, name, polygon: toMulti(hit.geojson) };
  });

const union = (parts: PcMultiPolygon[]) => polygonClipping.union(parts[0], ...parts.slice(1));

const topo = topology(
  {
    municipalities: {
      type: "FeatureCollection",
      features: municipalities.map((m) => multiPolygonFeature(m.polygon, { code: m.code, county: m.county, name: m.name })),
    },
    counties: {
      type: "FeatureCollection",
      features: Object.keys(HOME_COUNTIES).map((county) =>
        multiPolygonFeature(union(municipalities.filter((m) => m.county === county).map((m) => m.polygon)), { code: county }),
      ),
    },
    areas: {
      type: "FeatureCollection",
      features: AREAS.map((a) =>
        multiPolygonFeature(union(municipalities.filter((m) => a.municipalities.includes(m.code)).map((m) => m.polygon)), {
          id: a.id,
        }),
      ),
    },
  } as Record<string, FeatureCollection>,
  1e5,
);
writeFileSync(OUTPUT, JSON.stringify(topo));
console.log(`Wrote ${OUTPUT} (${Math.round(JSON.stringify(topo).length / 1024)} kB): ${municipalities.length} municipalities`);
