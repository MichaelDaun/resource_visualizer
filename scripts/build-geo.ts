/**
 * Builds the basemap used by the map view: public/geo/sweden.topo.json.
 *
 * Sources:
 * - https://github.com/okfse/sweden-geojson: simplified county and municipality
 *   borders (Valmyndigheten, jnordgren). Used for borders, labels and lookups.
 * - Natural Earth 1:10m (public domain): coastlines of Sweden and its
 *   neighbours, and larger lakes. More detailed than the okfse coast, so the
 *   map view clips county fills and borders to this land.
 *
 * Usage:
 *   npm run geo                 # downloads the source files
 *   npm run geo -- <dir>        # reads them from <dir> instead
 *
 * The output is committed, so this only needs to run when the basemap changes.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { topology } from "topojson-server";
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";

const SOURCES: Record<string, string> = {
  "swedish_regions.geojson": "https://raw.githubusercontent.com/okfse/sweden-geojson/master",
  "swedish_municipalities.geojson": "https://raw.githubusercontent.com/okfse/sweden-geojson/master",
  "ne_10m_admin_0_countries.geojson": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson",
  "ne_10m_lakes.geojson": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson",
};
const OUTPUT = "public/geo/sweden.topo.json";

/** Countries drawn as land. Neighbours are thinned since they are only backdrop. */
const COUNTRIES = ["Sweden", "Norway", "Denmark", "Finland", "Aland", "Estonia", "Latvia", "Lithuania", "Poland", "Germany"];
const BBOX = { west: 4, south: 53, east: 32, north: 71 };

async function load(name: string, dir?: string): Promise<FeatureCollection> {
  if (dir) return JSON.parse(await readFile(join(dir, name), "utf8"));
  const res = await fetch(`${SOURCES[name]}/${name}`);
  if (!res.ok) throw new Error(`Failed to download ${name}: ${res.status}`);
  return (await res.json()) as FeatureCollection;
}

function polygons(geometry: Geometry): Position[][][] {
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

function inBbox(polygon: Position[][]): boolean {
  return polygon[0].some(([x, y]) => x >= BBOX.west && x <= BBOX.east && y >= BBOX.south && y <= BBOX.north);
}

/** Keeps every nth point of larger rings; drops tiny islands. */
function thin(polygon: Position[][], n: number): Position[][] | null {
  if (polygon[0].length < 12) return null;
  return polygon.map((ring) => {
    if (ring.length < 40) return ring;
    const kept = ring.filter((_, i) => i % n === 0);
    kept.push(ring[ring.length - 1]);
    return kept;
  });
}

function land(countries: FeatureCollection): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: countries.features
      .filter((f) => COUNTRIES.includes(String(f.properties?.ADMIN)))
      .map((f): Feature => {
        const sweden = f.properties?.ADMIN === "Sweden";
        const kept = polygons(f.geometry)
          .filter(inBbox)
          .map((p) => (sweden ? p : thin(p, 3)))
          .filter((p): p is Position[][] => p !== null);
        return {
          type: "Feature",
          properties: { name: String(f.properties?.ADMIN) },
          geometry: rewind({ type: "MultiPolygon", coordinates: kept }),
        };
      })
      .filter((f) => (f.geometry as { coordinates: unknown[] }).coordinates.length > 0),
  };
}

function lakes(collection: FeatureCollection): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: collection.features
      .filter((f) => polygons(f.geometry).some((p) => p[0].some(([x, y]) => x > 10 && x < 25 && y > 55 && y < 69.5)))
      .map((f, i): Feature => ({
        type: "Feature",
        properties: { name: String(f.properties?.name ?? `lake-${i}`) },
        geometry: rewind(f.geometry),
      })),
  };
}

/** Planar signed area of a ring; positive means counter-clockwise. */
function signedArea(ring: Position[]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return sum / 2;
}

/**
 * d3-geo uses spherical winding: exterior rings must be clockwise and holes
 * counter-clockwise, the opposite of RFC 7946. Wrong winding makes a polygon
 * cover the whole globe instead of the area it outlines.
 */
function rewindPolygon(rings: Position[][]): Position[][] {
  return rings.map((ring, i) => {
    const clockwise = signedArea(ring) < 0;
    const wantClockwise = i === 0;
    return clockwise === wantClockwise ? ring : [...ring].reverse();
  });
}

function rewind(geometry: Geometry): Geometry {
  if (geometry.type === "Polygon") {
    return { ...geometry, coordinates: rewindPolygon(geometry.coordinates) };
  }
  if (geometry.type === "MultiPolygon") {
    return { ...geometry, coordinates: geometry.coordinates.map(rewindPolygon) };
  }
  return geometry;
}

function clean(
  collection: FeatureCollection,
  properties: (props: Record<string, unknown>) => Record<string, string>,
): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: collection.features.map(
      (f): Feature => ({
        type: "Feature",
        properties: properties(f.properties ?? {}),
        geometry: rewind(f.geometry),
      }),
    ),
  };
}

async function main() {
  const dir = process.argv[2];
  const regions = clean(await load("swedish_regions.geojson", dir), (p) => ({
    code: String(p.l_id).padStart(2, "0"),
    name: String(p.name),
  }));
  const municipalities = clean(await load("swedish_municipalities.geojson", dir), (p) => ({
    code: String(p.id),
    county: String(p.lan_code),
    name: String(p.kom_namn),
  }));

  const topo = topology(
    {
      regions,
      municipalities,
      land: land(await load("ne_10m_admin_0_countries.geojson", dir)),
      lakes: lakes(await load("ne_10m_lakes.geojson", dir)),
    },
    1e5,
  );
  await mkdir("public/geo", { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(topo));
  console.log(`Wrote ${OUTPUT} (${Math.round(JSON.stringify(topo).length / 1024)} kB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
