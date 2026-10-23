import { geoContains, geoDistance } from "d3-geo";
import { feature, merge, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { Feature, FeatureCollection, Geometry, MultiLineString } from "geojson";
import { countyName, municipalityName, t } from "./i18n/sv";

interface RegionProps {
  code: string;
  name: string;
}
interface MunicipalityProps extends RegionProps {
  county: string;
}
interface NamedProps {
  name: string;
}

export type SwedenTopology = Topology<{
  regions: GeometryCollection<RegionProps>;
  municipalities: GeometryCollection<MunicipalityProps>;
  land: GeometryCollection<NamedProps>;
  lakes: GeometryCollection<NamedProps>;
}>;

/** Counties the map is about. Codes are SCB county codes. */
export const HOME_COUNTIES = ["08", "07"] as const;
export type CountyCode = (typeof HOME_COUNTIES)[number];

export function isHomeCounty(code: string): code is CountyCode {
  return (HOME_COUNTIES as readonly string[]).includes(code);
}

export type PlaceKind = "county" | "municipality" | "area";

/** Somewhere the user can navigate to: a county, a municipality or a named area such as Öland. */
export interface Place {
  id: string;
  kind: PlaceKind;
  name: string;
  /** Municipality codes the place covers. */
  municipalities: string[];
  county: string;
  feature: Feature;
}

export interface GeoIndex {
  regions: FeatureCollection<Geometry, RegionProps>;
  municipalities: FeatureCollection<Geometry, MunicipalityProps>;
  land: FeatureCollection<Geometry, NamedProps>;
  lakes: FeatureCollection<Geometry, NamedProps>;
  municipalityBorders: MultiLineString;
  regionBorders: MultiLineString;
  /** Borders that touch a home county, drawn a little stronger. */
  homeBorders: MultiLineString;
  places: Place[];
  placeById: Map<string, Place>;
  /** County and municipality codes at a coordinate, if it is inside Sweden. */
  locate(lat: number, lng: number): { county?: string; municipality?: string };
  /** Finds a municipality by its short name, e.g. "Hultsfred". */
  municipalityByName(name: string): { code: string; county: string } | undefined;
}

/** Max distance (radians, about 12 km) for snapping coastal points to the simplified borders. */
const SNAP_DISTANCE = 12 / 6371;

/**
 * The borders are simplified, so towns on the coast can fall just outside
 * their municipality. Picks the municipality with the closest border vertex.
 */
function nearest<P>(features: Feature<Geometry, P>[], point: [number, number]): Feature<Geometry, P> | undefined {
  let best: Feature<Geometry, P> | undefined;
  let bestDistance = SNAP_DISTANCE;
  for (const f of features) {
    const g = f.geometry;
    const rings = g.type === "Polygon" ? g.coordinates : g.type === "MultiPolygon" ? g.coordinates.flat() : [];
    for (const ring of rings) {
      for (const p of ring) {
        const d = geoDistance(point, p as [number, number]);
        if (d < bestDistance) {
          bestDistance = d;
          best = f;
        }
      }
    }
  }
  return best;
}

export function slug(text: string): string {
  return text
    .toLocaleLowerCase("sv-SE")
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/é/g, "e")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Named areas that span several municipalities. */
const AREAS: { id: string; name: () => string; municipalities: string[] }[] = [
  { id: "oland", name: () => t.places.oland, municipalities: ["0885", "0840"] }, // Borgholm, Mörbylånga
];

export function createGeoIndex(topo: SwedenTopology): GeoIndex {
  const regions = feature(topo, topo.objects.regions) as FeatureCollection<Geometry, RegionProps>;
  const municipalities = feature(topo, topo.objects.municipalities) as FeatureCollection<Geometry, MunicipalityProps>;
  const land = feature(topo, topo.objects.land) as FeatureCollection<Geometry, NamedProps>;
  const lakes = feature(topo, topo.objects.lakes) as FeatureCollection<Geometry, NamedProps>;

  const places: Place[] = [];
  for (const code of HOME_COUNTIES) {
    const region = regions.features.find((f) => f.properties.code === code)!;
    const codes = municipalities.features.filter((f) => f.properties.county === code).map((f) => f.properties.code);
    const name = countyName(region.properties.name);
    places.push({ id: slug(name), kind: "county", name, municipalities: codes, county: code, feature: region });
  }
  for (const area of AREAS) {
    const geometries = topo.objects.municipalities.geometries.filter((g) =>
      area.municipalities.includes((g.properties as MunicipalityProps).code),
    );
    const first = municipalities.features.find((f) => f.properties.code === area.municipalities[0])!;
    places.push({
      id: area.id,
      kind: "area",
      name: area.name(),
      municipalities: area.municipalities,
      county: first.properties.county,
      feature: { type: "Feature", properties: {}, geometry: merge(topo, geometries as never) },
    });
  }
  for (const f of municipalities.features) {
    if (!isHomeCounty(f.properties.county)) continue;
    const name = municipalityName(f.properties.name);
    places.push({
      id: slug(f.properties.name),
      kind: "municipality",
      name,
      municipalities: [f.properties.code],
      county: f.properties.county,
      feature: f,
    });
  }

  return {
    regions,
    municipalities,
    land,
    lakes,
    municipalityBorders: mesh(topo, topo.objects.municipalities, (a, b) => a !== b),
    regionBorders: mesh(topo, topo.objects.regions, (a, b) => a !== b),
    homeBorders: mesh(
      topo,
      topo.objects.regions,
      (a, b) =>
        a !== b &&
        (isHomeCounty((a.properties as RegionProps).code) || isHomeCounty((b.properties as RegionProps).code)),
    ),
    places,
    placeById: new Map(places.map((p) => [p.id, p])),
    municipalityByName(name) {
      const f = municipalities.features.find((m) => m.properties.name === name);
      return f ? { code: f.properties.code, county: f.properties.county } : undefined;
    },
    locate(lat, lng) {
      const point: [number, number] = [lng, lat];
      const m = municipalities.features.find((f) => geoContains(f, point)) ?? nearest(municipalities.features, point);
      return m ? { county: m.properties.county, municipality: m.properties.code } : {};
    },
  };
}

// ---------- Accurate shapes (public/geo/detail.topo.json, see scripts/build-detail.ts) ----------

export type DetailTopology = Topology<{
  municipalities: GeometryCollection<MunicipalityProps>;
  counties: GeometryCollection<{ code: string }>;
  areas: GeometryCollection<{ id: string }>;
}>;

export interface DetailLayers {
  municipalities: FeatureCollection<Geometry, MunicipalityProps>;
  counties: FeatureCollection<Geometry, { code: string }>;
}

/**
 * Reads the accurate municipality and county shapes and points the places at
 * them, so zooming and outlines follow the real borders.
 */
export function applyDetail(geo: GeoIndex, topo: DetailTopology): DetailLayers {
  const fc = <K extends keyof DetailTopology["objects"]>(key: K) =>
    feature(topo, topo.objects[key] as never) as unknown as FeatureCollection;
  const layers: DetailLayers = {
    municipalities: fc("municipalities") as DetailLayers["municipalities"],
    counties: fc("counties") as DetailLayers["counties"],
  };
  const areas = fc("areas").features;
  for (const place of geo.places) {
    const detailed =
      place.kind === "county"
        ? layers.counties.features.find((f) => f.properties.code === place.county)
        : place.kind === "area"
          ? areas.find((f) => f.properties?.id === place.id)
          : layers.municipalities.features.find((f) => f.properties.code === place.municipalities[0]);
    if (detailed) place.feature = detailed;
  }
  return layers;
}
