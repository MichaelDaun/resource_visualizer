/**
 * Builds the detailed basemap for the home counties: public/geo/detail.topo.json.
 *
 * Sources (all downloaded with curl and cached in <cache-dir>):
 * - OpenFreeMap vector tiles (OpenMapTiles schema, © OpenStreetMap contributors,
 *   ODbL): coastline, lakes, county/municipality borders and major roads.
 * - Nominatim (© OpenStreetMap contributors, ODbL): municipality polygons, used
 *   for clicking, hovering and finding which municipality a point is in.
 * - SCB tätorter 2023 (CC0): urban areas with names and population.
 * - public/geo/sweden.topo.json (from build-geo.ts): Natural Earth land outside
 *   the detailed area, so the two can be joined into one land shape.
 *
 * Usage: npm run geo:detail -- <cache-dir>
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import polygonClipping, { type MultiPolygon as PcMultiPolygon, type Polygon as PcPolygon } from "polygon-clipping";
import simplify from "simplify-js";
import { feature } from "topojson-client";
import { topology } from "topojson-server";
import type { Feature, FeatureCollection, Geometry, LineString, MultiLineString, Position } from "geojson";

/** Area drawn in detail. Edges run through land or open sea so the join with Natural Earth is invisible. */
export const DETAIL_BBOX = { west: 12.9, south: 55.9, east: 17.4, north: 58.35 };
const ZOOM = 10;
const TILEJSON = "https://tiles.openfreemap.org/planet";
const USER_AGENT = "Stodkartan basemap build (https://github.com/MichaelDaun/resource_visualizer)";
const HOME_COUNTIES: Record<string, string> = { "07": "Kronobergs län", "08": "Kalmar län" };
const OUTPUT = "public/geo/detail.topo.json";
/** Named areas made of several municipalities; ids match AREAS in src/geo.ts. */
const AREAS = [{ id: "oland", municipalities: ["0885", "0840"] }];

/** Simplification tolerance in degrees (~25 m) and smallest islands/lakes kept. */
const TOLERANCE = 0.0003;
const MIN_ISLAND_KM2 = 0.06;
const MIN_LAKE_KM2 = 1;

const cacheDir = process.argv[2];
if (!cacheDir) {
  console.error("Usage: npm run geo:detail -- <cache-dir>");
  process.exit(1);
}
mkdirSync(cacheDir, { recursive: true });

function download(url: string, file: string, binary = false): Buffer | string {
  const path = join(cacheDir, file);
  for (let attempt = 1; !existsSync(path); attempt++) {
    try {
      execFileSync("curl", ["-sSfL", "--retry", "3", "-A", USER_AGENT, "-o", path, url], { stdio: "pipe" });
    } catch (err) {
      // Rate limits (HTTP 429) clear after a pause.
      if (attempt >= 6) throw err;
      sleep(5000 * attempt);
    }
  }
  return binary ? readFileSync(path) : readFileSync(path, "utf8");
}

function sleep(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// ---------- Geometry helpers ----------

const KM_PER_DEG_LAT = 111.32;
function ringAreaKm2(ring: Position[]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  const lat = ring[0][1];
  return Math.abs(sum / 2) * KM_PER_DEG_LAT * KM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

function simplifyRing(ring: Position[], tolerance = TOLERANCE): Position[] {
  const pts = simplify(
    ring.map(([x, y]) => ({ x, y })),
    tolerance,
    true,
  ).map((p) => [round(p.x), round(p.y)] as Position);
  if (pts.length < 4) return [];
  const [fx, fy] = pts[0];
  const [lx, ly] = pts[pts.length - 1];
  if (fx !== lx || fy !== ly) pts.push(pts[0]);
  return pts;
}

function round(v: number): number {
  return Math.round(v * 1e5) / 1e5;
}

function simplifyMulti(mp: PcMultiPolygon, minKm2: number, tolerance = TOLERANCE): PcMultiPolygon {
  const out: PcMultiPolygon = [];
  for (const polygon of mp) {
    if (ringAreaKm2(polygon[0] as Position[]) < minKm2) continue;
    const rings = polygon
      .map((r) => simplifyRing(r as Position[], tolerance))
      .filter((r, i) => r.length >= 4 && (i === 0 || ringAreaKm2(r) >= minKm2));
    if (rings.length > 0 && rings[0].length >= 4) out.push(rings as PcPolygon);
  }
  return out;
}

function toMulti(geometry: Geometry): PcMultiPolygon {
  if (geometry.type === "Polygon") return [geometry.coordinates as PcPolygon];
  if (geometry.type === "MultiPolygon") return geometry.coordinates as PcMultiPolygon;
  return [];
}

function bboxPolygon(b: { west: number; south: number; east: number; north: number }): PcPolygon {
  return [
    [
      [b.west, b.south],
      [b.east, b.south],
      [b.east, b.north],
      [b.west, b.north],
      [b.west, b.south],
    ],
  ];
}

/** Unions many polygons in batches; polygon-clipping is much faster on small inputs. */
function unionAll(parts: PcMultiPolygon[]): PcMultiPolygon {
  let layer = parts.filter((p) => p.length > 0);
  while (layer.length > 1) {
    const next: PcMultiPolygon[] = [];
    for (let i = 0; i < layer.length; i += 8) next.push(polygonClipping.union(...(layer.slice(i, i + 8) as [PcMultiPolygon])));
    layer = next;
  }
  return layer[0] ?? [];
}

/** Signed planar area; d3-geo wants exterior rings clockwise (negative here). */
function signed(ring: Position[]): number {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return s / 2;
}
function rewind(mp: PcMultiPolygon): Position[][][] {
  return mp.map((polygon) =>
    polygon.map((ring, i) => {
      const r = ring as Position[];
      const clockwise = signed(r) < 0;
      return clockwise === (i === 0) ? r : [...r].reverse();
    }),
  );
}

function multiPolygonFeature(mp: PcMultiPolygon, properties: Record<string, unknown> = {}): Feature {
  return { type: "Feature", properties, geometry: { type: "MultiPolygon", coordinates: rewind(mp) } };
}

// ---------- Vector tiles ----------

function lon2tile(lon: number) {
  return Math.floor(((lon + 180) / 360) * 2 ** ZOOM);
}
function lat2tile(lat: number) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** ZOOM);
}
function tileBounds(x: number, y: number) {
  const n = 2 ** ZOOM;
  const lon = (tx: number) => (tx / n) * 360 - 180;
  const lat = (ty: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / n))) * 180) / Math.PI;
  return { west: lon(x), east: lon(x + 1), north: lat(y), south: lat(y + 1) };
}

interface TileData {
  ocean: PcMultiPolygon[];
  lakes: PcMultiPolygon[];
  lakeNames: { name: string; lng: number; lat: number }[];
  borders: { level: number; line: Position[] }[];
  roads: { cls: string; ref?: string; line: Position[] }[];
}

function readTiles(): TileData {
  const tilejson = JSON.parse(download(TILEJSON, "tilejson.json") as string);
  const template: string = tilejson.tiles[0];
  const data: TileData = { ocean: [], lakes: [], lakeNames: [], borders: [], roads: [] };
  const xs = [lon2tile(DETAIL_BBOX.west), lon2tile(DETAIL_BBOX.east)];
  const ys = [lat2tile(DETAIL_BBOX.north), lat2tile(DETAIL_BBOX.south)];
  let count = 0;
  for (let x = xs[0]; x <= xs[1]; x++) {
    for (let y = ys[0]; y <= ys[1]; y++) {
      const url = template.replace("{z}", String(ZOOM)).replace("{x}", String(x)).replace("{y}", String(y));
      const buf = download(url, `tile-${ZOOM}-${x}-${y}.pbf`, true) as Buffer;
      count++;
      const tile = new VectorTile(new PbfReader(buf));
      // Clip polygons to the tile itself; tiles include a buffer that would overlap neighbours.
      const clip = [bboxPolygon(tileBounds(x, y))] as PcMultiPolygon;

      const water = tile.layers.water;
      for (let i = 0; water && i < water.length; i++) {
        const f = water.feature(i);
        const gj = f.toGeoJSON(x, y, ZOOM) as Feature;
        const parts = polygonClipping.intersection(toMulti(gj.geometry), clip);
        if (parts.length === 0) continue;
        if (f.properties.class === "ocean") data.ocean.push(parts);
        else if (f.properties.class === "lake") data.lakes.push(parts);
      }

      const waterName = tile.layers.water_name;
      for (let i = 0; waterName && i < waterName.length; i++) {
        const f = waterName.feature(i);
        if (f.properties.class !== "lake") continue;
        const gj = f.toGeoJSON(x, y, ZOOM) as Feature;
        const name = String(f.properties["name:sv"] ?? f.properties.name ?? "");
        // Lake names come as points or as lines to curve the label along; use the line's middle.
        const g = gj.geometry;
        const point =
          g.type === "Point" ? g.coordinates : g.type === "LineString" ? g.coordinates[Math.floor(g.coordinates.length / 2)] : null;
        if (name && point) data.lakeNames.push({ name, lng: point[0], lat: point[1] });
      }

      const boundary = tile.layers.boundary;
      for (let i = 0; boundary && i < boundary.length; i++) {
        const f = boundary.feature(i);
        const level = Number(f.properties.admin_level);
        if (![2, 4, 7].includes(level) || Number(f.properties.maritime) === 1) continue;
        for (const line of lines(f.toGeoJSON(x, y, ZOOM).geometry as Geometry)) data.borders.push({ level, line });
      }

      const transport = tile.layers.transportation;
      for (let i = 0; transport && i < transport.length; i++) {
        const f = transport.feature(i);
        const cls = String(f.properties.class);
        if (!["motorway", "trunk", "primary"].includes(cls)) continue;
        for (const line of lines(f.toGeoJSON(x, y, ZOOM).geometry as Geometry)) data.roads.push({ cls, line });
      }
    }
  }
  console.log(`Read ${count} tiles`);
  return data;
}

function lines(geometry: Geometry): Position[][] {
  if (geometry.type === "LineString") return [geometry.coordinates];
  if (geometry.type === "MultiLineString") return geometry.coordinates;
  return [];
}

function simplifyLine(line: Position[], tolerance = TOLERANCE): Position[] {
  return simplify(
    line.map(([x, y]) => ({ x, y })),
    tolerance,
    true,
  ).map((p) => [round(p.x), round(p.y)]);
}

/** Joins line pieces that share end points, so borders and roads are drawn as continuous lines. */
function joinLines(pieces: Position[][]): Position[][] {
  const key = (p: Position) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
  const remaining = pieces.filter((l) => l.length >= 2).map((l) => [...l]);
  const byEnd = new Map<string, number[]>();
  remaining.forEach((l, i) => {
    for (const k of [key(l[0]), key(l[l.length - 1])]) byEnd.set(k, [...(byEnd.get(k) ?? []), i]);
  });
  const used = new Set<number>();
  const out: Position[][] = [];
  for (let i = 0; i < remaining.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    let line = remaining[i];
    for (let grow = true; grow; ) {
      grow = false;
      for (const atEnd of [true, false]) {
        const p = atEnd ? line[line.length - 1] : line[0];
        const next = (byEnd.get(key(p)) ?? []).find((j) => !used.has(j));
        if (next === undefined) continue;
        used.add(next);
        let other = remaining[next];
        if (atEnd) {
          if (key(other[0]) !== key(p)) other = [...other].reverse();
          line = [...line, ...other.slice(1)];
        } else {
          if (key(other[other.length - 1]) !== key(p)) other = [...other].reverse();
          line = [...other.slice(0, -1), ...line];
        }
        grow = true;
      }
    }
    out.push(line);
  }
  return out;
}

function multiLineFeature(lines: Position[][], properties: Record<string, unknown>): Feature<MultiLineString> {
  return { type: "Feature", properties, geometry: { type: "MultiLineString", coordinates: lines } };
}

// ---------- Nominatim municipalities ----------

interface Municipality {
  code: string;
  county: string;
  name: string;
  polygon: PcMultiPolygon;
}

function readMunicipalities(): Municipality[] {
  // Codes and names from the simplified basemap, so ids stay the same everywhere.
  const base = JSON.parse(readFileSync("public/geo/sweden.topo.json", "utf8"));
  const municipalities = feature(base, base.objects.municipalities) as unknown as FeatureCollection<
    Geometry,
    { code: string; county: string; name: string }
  >;
  const result: Municipality[] = [];
  for (const m of municipalities.features) {
    const { code, county, name } = m.properties;
    if (!HOME_COUNTIES[county]) continue;
    const file = `nominatim-${code}.json`;
    const cached = existsSync(join(cacheDir, file));
    const query = encodeURIComponent(`${name} kommun, ${HOME_COUNTIES[county]}, Sverige`);
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=jsonv2&polygon_geojson=1&polygon_threshold=0.0002&limit=5`;
    const hits = JSON.parse(download(url, file) as string) as {
      osm_type: string;
      type: string;
      geojson: Geometry;
      display_name: string;
    }[];
    if (!cached) sleep(2000); // Nominatim usage policy: at most one request per second.
    const hit = hits.find((h) => h.osm_type === "relation" && h.type === "administrative");
    if (!hit) throw new Error(`No municipality boundary found for ${name}`);
    result.push({ code, county, name, polygon: toMulti(hit.geojson) });
  }
  return result;
}

// ---------- SCB tätorter ----------

interface Town {
  name: string;
  municipality: string;
  population: number;
  polygon: PcMultiPolygon;
}

function readTowns(): Town[] {
  const filter = encodeURIComponent(`lan IN ('07','08')`);
  const url =
    "https://geodata.scb.se/geoserver/stat/wfs?service=WFS&version=2.0.0&request=GetFeature" +
    `&typeNames=stat:Tatorter_2023&outputFormat=application/json&srsName=EPSG:4326&cql_filter=${filter}`;
  const fc = JSON.parse(download(url, "scb-tatorter-2023.json") as string) as FeatureCollection<
    Geometry,
    { tatort: string; kommun: string; bef: number }
  >;
  return fc.features.map((f) => ({
    name: f.properties.tatort,
    municipality: f.properties.kommun,
    population: f.properties.bef,
    polygon: toMulti(f.geometry),
  }));
}

/** Label point for a town: the centre of the bounding box of its largest part. */
function labelPoint(mp: PcMultiPolygon): Position {
  let best = mp[0];
  for (const p of mp) if (ringAreaKm2(p[0] as Position[]) > ringAreaKm2(best[0] as Position[])) best = p;
  const xs = best[0].map((p) => p[0]);
  const ys = best[0].map((p) => p[1]);
  return [round((Math.min(...xs) + Math.max(...xs)) / 2), round((Math.min(...ys) + Math.max(...ys)) / 2)];
}

// ---------- Main ----------

function main() {
  const tiles = readTiles();
  const bbox = [bboxPolygon(DETAIL_BBOX)] as PcMultiPolygon;

  console.log(`Merging ${tiles.ocean.length} ocean pieces…`);
  const ocean = unionAll(tiles.ocean);
  const detailLand = simplifyMulti(polygonClipping.difference(bbox, ocean), MIN_ISLAND_KM2);

  // Natural Earth land outside the detailed area, joined with the detailed land.
  const base = JSON.parse(readFileSync("public/geo/sweden.topo.json", "utf8"));
  const neLand = feature(base, base.objects.land) as unknown as FeatureCollection;
  const neParts = neLand.features.map((f) => polygonClipping.difference(toMulti(f.geometry), bbox));
  const land = unionAll([detailLand, ...neParts]);

  console.log(`Merging ${tiles.lakes.length} lake pieces…`);
  const lakes = simplifyMulti(polygonClipping.intersection(unionAll(tiles.lakes), bbox), MIN_LAKE_KM2, TOLERANCE * 1.8);

  const municipalities = readMunicipalities();
  const counties = Object.keys(HOME_COUNTIES).map((county) => ({
    county,
    polygon: unionAll(municipalities.filter((m) => m.county === county).map((m) => m.polygon)),
  }));

  const borderFeature = (level: number) =>
    multiLineFeature(
      joinLines(tiles.borders.filter((b) => b.level === level).map((b) => b.line)).map((l) => simplifyLine(l)),
      { level },
    );
  const roadFeatures = ["motorway", "trunk", "primary"].map((cls) =>
    multiLineFeature(
      joinLines(tiles.roads.filter((r) => r.cls === cls).map((r) => r.line))
        .map((l) => simplifyLine(l, TOLERANCE * 3))
        .filter((l) => l.length >= 2),
      { cls },
    ),
  );

  const towns = readTowns().filter((t) => t.population >= 200);

  // Lake names: keep one label per name, nearest the middle of all its points.
  const lakeNames = new Map<string, { name: string; lng: number; lat: number }>();
  const inBbox = (l: { lng: number; lat: number }) =>
    l.lng > DETAIL_BBOX.west && l.lng < DETAIL_BBOX.east && l.lat > DETAIL_BBOX.south && l.lat < DETAIL_BBOX.north;
  for (const l of tiles.lakeNames) if (inBbox(l) && !lakeNames.has(l.name)) lakeNames.set(l.name, l);

  const topo = topology(
    {
      land: { type: "FeatureCollection", features: [multiPolygonFeature(land)] },
      lakes: { type: "FeatureCollection", features: [multiPolygonFeature(lakes)] },
      municipalities: {
        type: "FeatureCollection",
        features: municipalities.map((m) =>
          multiPolygonFeature(simplifyMulti(m.polygon, 0, TOLERANCE * 2), { code: m.code, county: m.county, name: m.name }),
        ),
      },
      counties: {
        type: "FeatureCollection",
        features: counties.map((c) => multiPolygonFeature(simplifyMulti(c.polygon, 0, TOLERANCE * 2), { code: c.county })),
      },
      areas: {
        type: "FeatureCollection",
        features: AREAS.map((a) =>
          multiPolygonFeature(
            simplifyMulti(
              unionAll(municipalities.filter((m) => a.municipalities.includes(m.code)).map((m) => m.polygon)),
              0,
              TOLERANCE * 2,
            ),
            { id: a.id },
          ),
        ),
      },
      borders: { type: "FeatureCollection", features: [2, 4, 7].map(borderFeature) },
      roads: { type: "FeatureCollection", features: roadFeatures },
      towns: {
        type: "FeatureCollection",
        features: towns.map((t) =>
          multiPolygonFeature(simplifyMulti(t.polygon, 0.05, TOLERANCE * 1.5), {
            name: t.name,
            municipality: t.municipality,
            population: t.population,
          }),
        ),
      },
      townLabels: {
        type: "FeatureCollection",
        features: towns.map((t) => ({
          type: "Feature" as const,
          properties: { name: t.name, population: t.population },
          geometry: { type: "Point" as const, coordinates: labelPoint(t.polygon) },
        })),
      },
      lakeLabels: {
        type: "FeatureCollection",
        features: [...lakeNames.values()].map((l) => ({
          type: "Feature" as const,
          properties: { name: l.name },
          geometry: { type: "Point" as const, coordinates: [round(l.lng), round(l.lat)] },
        })),
      },
    } as Record<string, FeatureCollection>,
    2e5,
  );
  writeFileSync(OUTPUT, JSON.stringify(topo));
  console.log(
    `Wrote ${OUTPUT} (${Math.round(JSON.stringify(topo).length / 1024)} kB): ${municipalities.length} municipalities, ${towns.length} towns`,
  );
}

main();

export type { LineString };
