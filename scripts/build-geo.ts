/**
 * Builds the basemap used by the map view: public/geo/sweden.topo.json.
 *
 * Source: https://github.com/okfse/sweden-geojson (simplified versions of
 * Valmyndigheten's municipality borders and jnordgren's county borders).
 *
 * Usage:
 *   npm run geo                 # downloads the source files
 *   npm run geo -- <dir>        # reads swedish_regions.geojson and
 *                               # swedish_municipalities.geojson from <dir>
 *
 * The output is committed, so this only needs to run when the basemap changes.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { topology } from "topojson-server";
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";

const SOURCE = "https://raw.githubusercontent.com/okfse/sweden-geojson/master";
const OUTPUT = "public/geo/sweden.topo.json";

async function load(name: string, dir?: string): Promise<FeatureCollection> {
  if (dir) return JSON.parse(await readFile(join(dir, name), "utf8"));
  const res = await fetch(`${SOURCE}/${name}`);
  if (!res.ok) throw new Error(`Failed to download ${name}: ${res.status}`);
  return (await res.json()) as FeatureCollection;
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

  const topo = topology({ regions, municipalities }, 1e5);
  await mkdir("public/geo", { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(topo));
  console.log(
    `Wrote ${OUTPUT}: ${regions.features.length} regions, ${municipalities.features.length} municipalities`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
